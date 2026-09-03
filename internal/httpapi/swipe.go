package httpapi

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sort"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/ai-synthetix/content-loop/internal/ai"
)

// --- micro-swipe layer: batches of short hooks/angles, pairwise votes, taste profile ---

// handleCreateSwipeBatch POST /api/v1/projects/{id}/swipe-batches {layer?, count?}
// Generates short hooks via AI, orders them by taste match, stores batch+options.
func (s *Server) handleCreateSwipeBatch(w http.ResponseWriter, r *http.Request) {
	if !s.useDB() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "database not configured"})
		return
	}
	projectID := chi.URLParam(r, "id")
	if projectID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "project id required"})
		return
	}
	owner := ownerID(r)

	proj, err := s.Store.Get("project", projectID, owner)
	if err != nil {
		if err == sql.ErrNoRows {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "project not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	var body struct {
		Layer *string `json:"layer"`
		Count *int    `json:"count"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	layer := "hook"
	if body.Layer != nil && strings.TrimSpace(*body.Layer) != "" {
		layer = strings.ToLower(strings.TrimSpace(*body.Layer))
	}
	if layer != "hook" && layer != "angle" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "layer must be hook or angle"})
		return
	}
	count := 5
	if body.Count != nil {
		count = *body.Count
	}
	if count < 1 {
		count = 1
	}
	if count > 10 {
		count = 10
	}

	projName, _ := proj["name"].(string)
	projSlug, _ := proj["slug"].(string)
	contextMD := swipeProjectContext(proj)

	userMsg := buildSwipePrompt(layer, count, contextMD, projName, projSlug)
	var aiResp string
	if s.AI != nil {
		aiResp, err = s.AI.Complete(r.Context(), ai.SystemBase, userMsg)
		if err != nil {
			log.Printf("[swipe] AI Complete error project=%s err=%v", projectID, err)
			aiResp = ""
		}
	}

	texts := parseSwipeHooks(aiResp)
	if len(texts) < count {
		base := strings.TrimSpace(projName)
		if base == "" {
			base = strings.TrimSpace(projSlug)
		}
		if base == "" {
			base = "проект"
		}
		for i := len(texts); i < count; i++ {
			fb := fmt.Sprintf("Хук %d: %s — попробуй такой заход", i+1, base)
			if len([]rune(fb)) > 120 {
				fb = string([]rune(fb)[:120])
			}
			texts = append(texts, fb)
		}
	}
	if len(texts) > count {
		texts = texts[:count]
	}

	// Order by taste match (score + token weights); fresh profile = AI order.
	weights := s.loadTasteWeights(projectID, owner)
	sort.SliceStable(texts, func(i, j int) bool {
		return swipeTasteScore(texts[i], weights) > swipeTasteScore(texts[j], weights)
	})

	batchID := uuid.NewString()
	if _, err := s.Store.DB.Exec(`INSERT INTO `+"`swipe_batch`"+` (id, project_id, owner_user_id, layer, status) VALUES (?,?,?,?,?)`,
		batchID, projectID, owner, layer, "open"); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	opts := make([]map[string]any, 0, len(texts))
	for _, t := range texts {
		oid := uuid.NewString()
		if _, err := s.Store.DB.Exec(`INSERT INTO `+"`swipe_option`"+` (id, batch_id, project_id, owner_user_id, text, score, wins, losses, status) VALUES (?,?,?,?,?,?,?,?,?)`,
			oid, batchID, projectID, owner, t, 0, 0, 0, "pending"); err != nil {
			log.Printf("[swipe] option insert failed batch=%s err=%v", batchID, err)
			continue
		}
		opts = append(opts, map[string]any{
			"id": oid, "batch_id": batchID, "project_id": projectID,
			"text": t, "score": 0, "wins": 0, "losses": 0, "status": "pending",
		})
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"batch":   map[string]any{"id": batchID, "project_id": projectID, "layer": layer, "status": "open"},
		"options": opts,
		"count":   len(opts),
	})
}

// handleGetSwipeBatches GET /api/v1/projects/{id}/swipe-batches?status=open
// Returns the latest batch with options ranked by score + taste match.
func (s *Server) handleGetSwipeBatches(w http.ResponseWriter, r *http.Request) {
	if !s.useDB() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "database not configured"})
		return
	}
	projectID := chi.URLParam(r, "id")
	if projectID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "project id required"})
		return
	}
	owner := ownerID(r)

	if _, err := s.Store.Get("project", projectID, owner); err != nil {
		if err == sql.ErrNoRows {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "project not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	status := r.URL.Query().Get("status")
	if status == "" {
		status = "open"
	}
	if status != "open" && status != "assembled" && status != "archived" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "status must be open, assembled or archived"})
		return
	}

	batch, err := s.queryRow(`SELECT * FROM `+"`swipe_batch`"+` WHERE project_id=? AND owner_user_id=? AND status=? ORDER BY created_at DESC LIMIT 1`,
		projectID, owner, status)
	if err != nil {
		if err == sql.ErrNoRows {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "no swipe batch found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	batchID, _ := batch["id"].(string)

	options, err := s.queryRows(`SELECT * FROM `+"`swipe_option`"+` WHERE batch_id=? AND project_id=? ORDER BY score DESC, created_at ASC`,
		batchID, projectID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	weights := s.loadTasteWeights(projectID, owner)
	for _, o := range options {
		text, _ := o["text"].(string)
		o["taste"] = toFloat(o["score"]) + swipeTasteScore(text, weights)
	}
	sort.SliceStable(options, func(i, j int) bool {
		return toFloat(options[i]["taste"]) > toFloat(options[j]["taste"])
	})

	writeJSON(w, http.StatusOK, map[string]any{"batch": batch, "options": options, "count": len(options)})
}

// handleSwipeVote POST /api/v1/swipe-batches/{bid}/vote
// Body vs: {mode:'vs', winner_id, loser_id}; like: {mode:'like', option_id, decision:'like'|'dislike'|'skip'}
func (s *Server) handleSwipeVote(w http.ResponseWriter, r *http.Request) {
	if !s.useDB() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "database not configured"})
		return
	}
	batchID := chi.URLParam(r, "bid")
	if batchID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "batch id required"})
		return
	}
	owner := ownerID(r)

	batch, err := s.queryRow(`SELECT * FROM `+"`swipe_batch`"+` WHERE id=? AND owner_user_id=?`, batchID, owner)
	if err != nil {
		if err == sql.ErrNoRows {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "swipe batch not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if st, _ := batch["status"].(string); st != "open" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "batch is not open"})
		return
	}
	projectID, _ := batch["project_id"].(string)

	var body struct {
		Mode     string `json:"mode"`
		WinnerID string `json:"winner_id"`
		LoserID  string `json:"loser_id"`
		OptionID string `json:"option_id"`
		Decision string `json:"decision"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	mode := strings.ToLower(strings.TrimSpace(body.Mode))

	var winTokens, loseTokens []string
	var affected []string
	var vote map[string]any

	switch mode {
	case "vs":
		if body.WinnerID == "" || body.LoserID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "winner_id and loser_id required"})
			return
		}
		if body.WinnerID == body.LoserID {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "winner_id and loser_id must differ"})
			return
		}
		winner, err := s.getSwipeOption(body.WinnerID, batchID)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "winner option not found"})
			return
		}
		loser, err := s.getSwipeOption(body.LoserID, batchID)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "loser option not found"})
			return
		}
		if _, err := s.Store.DB.Exec(`UPDATE `+"`swipe_option`"+` SET score=score+1, wins=wins+1 WHERE id=?`, body.WinnerID); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		if _, err := s.Store.DB.Exec(`UPDATE `+"`swipe_option`"+` SET score=score-1, losses=losses+1 WHERE id=?`, body.LoserID); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		wtext, _ := winner["text"].(string)
		ltext, _ := loser["text"].(string)
		winTokens = swipeTokens(wtext)
		loseTokens = swipeTokens(ltext)
		vote = map[string]any{
			"id": uuid.NewString(), "batch_id": batchID,
			"winner_id": body.WinnerID, "loser_id": body.LoserID,
			"mode": "vs", "owner_user_id": owner,
		}
		if _, err := s.Store.DB.Exec(`INSERT INTO `+"`swipe_vote`"+` (id, batch_id, winner_id, loser_id, mode, owner_user_id) VALUES (?,?,?,?,?,?)`,
			vote["id"], batchID, body.WinnerID, body.LoserID, "vs", owner); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		affected = []string{body.WinnerID, body.LoserID}
	case "like":
		if body.OptionID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "option_id required"})
			return
		}
		decision := strings.ToLower(strings.TrimSpace(body.Decision))
		if decision != "like" && decision != "dislike" && decision != "skip" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "decision must be like, dislike or skip"})
			return
		}
		opt, err := s.getSwipeOption(body.OptionID, batchID)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "option not found"})
			return
		}
		otext, _ := opt["text"].(string)
		switch decision {
		case "like":
			if _, err := s.Store.DB.Exec(`UPDATE `+"`swipe_option`"+` SET score=score+1, wins=wins+1 WHERE id=?`, body.OptionID); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			winTokens = swipeTokens(otext)
		case "dislike":
			if _, err := s.Store.DB.Exec(`UPDATE `+"`swipe_option`"+` SET score=score-1, losses=losses+1 WHERE id=?`, body.OptionID); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			loseTokens = swipeTokens(otext)
		case "skip":
			if _, err := s.Store.DB.Exec(`UPDATE `+"`swipe_option`"+` SET status='skipped' WHERE id=?`, body.OptionID); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
		}
		vote = map[string]any{
			"id": uuid.NewString(), "batch_id": batchID,
			"option_id": body.OptionID, "mode": "like", "decision": decision,
			"owner_user_id": owner,
		}
		if _, err := s.Store.DB.Exec(`INSERT INTO `+"`swipe_vote`"+` (id, batch_id, option_id, mode, decision, owner_user_id) VALUES (?,?,?,?,?,?)`,
			vote["id"], batchID, body.OptionID, "like", decision, owner); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		affected = []string{body.OptionID}
	default:
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "mode must be vs or like"})
		return
	}

	if len(winTokens) > 0 || len(loseTokens) > 0 {
		weights := s.loadTasteWeights(projectID, owner)
		for _, t := range winTokens {
			weights[t]++
		}
		for _, t := range loseTokens {
			weights[t] -= 0.5
		}
		if err := s.saveTasteWeights(projectID, owner, weights); err != nil {
			log.Printf("[swipe] taste save failed project=%s err=%v", projectID, err)
		}
	}

	updated := make([]map[string]any, 0, len(affected))
	for _, oid := range affected {
		if o, err := s.getSwipeOption(oid, batchID); err == nil {
			updated = append(updated, o)
		}
	}
	writeJSON(w, http.StatusCreated, map[string]any{"vote": vote, "options": updated})
}

// handleAssembleSwipeBatch POST /api/v1/swipe-batches/{bid}/assemble
// Top-score option becomes a content_item (status=idea); batch -> assembled.
func (s *Server) handleAssembleSwipeBatch(w http.ResponseWriter, r *http.Request) {
	if !s.useDB() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "database not configured"})
		return
	}
	batchID := chi.URLParam(r, "bid")
	if batchID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "batch id required"})
		return
	}
	owner := ownerID(r)

	batch, err := s.queryRow(`SELECT * FROM `+"`swipe_batch`"+` WHERE id=? AND owner_user_id=?`, batchID, owner)
	if err != nil {
		if err == sql.ErrNoRows {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "swipe batch not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if st, _ := batch["status"].(string); st == "assembled" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "batch already assembled"})
		return
	}
	projectID, _ := batch["project_id"].(string)

	options, err := s.queryRows(`SELECT * FROM `+"`swipe_option`"+` WHERE batch_id=? ORDER BY score DESC, wins DESC, created_at ASC`, batchID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if len(options) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "batch has no options"})
		return
	}
	top := options[0]
	topID, _ := top["id"].(string)
	hook, _ := top["text"].(string)
	hook = strings.TrimSpace(hook)
	if hook == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "top option is empty"})
		return
	}
	title := hook
	if len([]rune(title)) > 500 {
		title = string([]rune(title)[:500])
	}

	slug := makeUniqueSlug(title, owner, projectID)
	briefBytes, _ := json.Marshal(map[string]string{"hook": hook, "batch_id": batchID})
	itemID := uuid.NewString()
	row := map[string]any{
		"id":            itemID,
		"owner_user_id": owner,
		"project_id":    projectID,
		"title":         title,
		"slug":          slug,
		"status":        "idea",
		"brief":         string(briefBytes),
	}
	if err := s.Store.Insert("content_item", row); err != nil {
		if strings.Contains(err.Error(), "Duplicate") || strings.Contains(strings.ToLower(err.Error()), "duplicate") {
			row["slug"] = slug + "-" + uuid.NewString()[:6]
			row["id"] = uuid.NewString()
			itemID = row["id"].(string)
			if err2 := s.Store.Insert("content_item", row); err2 != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err2.Error()})
				return
			}
		} else {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
	}

	_, _ = s.Store.DB.Exec(`UPDATE `+"`swipe_option`"+` SET status='winner' WHERE id=?`, topID)
	_, _ = s.Store.DB.Exec(`UPDATE `+"`swipe_option`"+` SET status='loser' WHERE batch_id=? AND id<>? AND status='pending'`, batchID, topID)
	_, _ = s.Store.DB.Exec(`UPDATE `+"`swipe_batch`"+` SET status='assembled' WHERE id=?`, batchID)

	item, err := s.Store.Get("content_item", itemID, owner)
	if err != nil {
		item = row
	} else {
		for k, v := range item {
			if b, ok := v.([]byte); ok {
				item[k] = string(b)
			}
		}
	}
	writeJSON(w, http.StatusCreated, map[string]any{"item": item, "batch_id": batchID, "option_id": topID})
}

// --- swipe helpers ---

func (s *Server) queryRow(query string, args ...any) (map[string]any, error) {
	rows, err := s.Store.DB.Queryx(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, sql.ErrNoRows
	}
	m := map[string]any{}
	if err := rows.MapScan(m); err != nil {
		return nil, err
	}
	for k, v := range m {
		if b, ok := v.([]byte); ok {
			m[k] = string(b)
		}
	}
	return m, nil
}

func (s *Server) queryRows(query string, args ...any) ([]map[string]any, error) {
	rows, err := s.Store.DB.Queryx(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		m := map[string]any{}
		if err := rows.MapScan(m); err != nil {
			return nil, err
		}
		for k, v := range m {
			if b, ok := v.([]byte); ok {
				m[k] = string(b)
			}
		}
		out = append(out, m)
	}
	if out == nil {
		out = []map[string]any{}
	}
	return out, nil
}

func (s *Server) getSwipeOption(optionID, batchID string) (map[string]any, error) {
	return s.queryRow(`SELECT * FROM `+"`swipe_option`"+` WHERE id=? AND batch_id=?`, optionID, batchID)
}

func toFloat(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case float32:
		return float64(n)
	case int64:
		return float64(n)
	case int:
		return float64(n)
	case []byte:
		var f float64
		if _, err := fmt.Sscanf(string(n), "%g", &f); err == nil {
			return f
		}
		return 0
	case string:
		var f float64
		if _, err := fmt.Sscanf(n, "%g", &f); err == nil {
			return f
		}
		return 0
	case json.Number:
		f, _ := n.Float64()
		return f
	default:
		return 0
	}
}

// swipeTokens lowercases text into word tokens longer than 3 runes.
func swipeTokens(text string) []string {
	parts := strings.Fields(strings.ToLower(text))
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.Trim(p, "\"'.,!?;:()[]{}«»„“”—–-…*·#@№")
		if len([]rune(p)) > 3 {
			out = append(out, p)
		}
	}
	return out
}

func swipeTasteScore(text string, weights map[string]float64) float64 {
	sum := 0.0
	for _, tok := range swipeTokens(text) {
		sum += weights[tok]
	}
	return sum
}

func (s *Server) loadTasteWeights(projectID, owner string) map[string]float64 {
	weights := map[string]float64{}
	var raw sql.NullString
	err := s.Store.DB.Get(&raw, `SELECT features FROM `+"`taste_profile`"+` WHERE project_id=? AND owner_user_id=?`, projectID, owner)
	if err != nil || !raw.Valid || strings.TrimSpace(raw.String) == "" {
		return weights
	}
	var doc struct {
		Tokens map[string]float64 `json:"tokens"`
	}
	if err := json.Unmarshal([]byte(raw.String), &doc); err == nil && doc.Tokens != nil {
		return doc.Tokens
	}
	var flat map[string]float64
	if err := json.Unmarshal([]byte(raw.String), &flat); err == nil && flat != nil {
		return flat
	}
	return weights
}

func (s *Server) saveTasteWeights(projectID, owner string, weights map[string]float64) error {
	if len(weights) > 200 {
		type kv struct {
			k string
			v float64
		}
		arr := make([]kv, 0, len(weights))
		for k, v := range weights {
			arr = append(arr, kv{k, v})
		}
		sort.Slice(arr, func(i, j int) bool { return arr[i].v > arr[j].v })
		trimmed := make(map[string]float64, 200)
		for _, e := range arr[:200] {
			trimmed[e.k] = e.v
		}
		weights = trimmed
	}
	b, _ := json.Marshal(map[string]any{"tokens": weights})
	_, err := s.Store.DB.Exec(`INSERT INTO `+"`taste_profile`"+` (project_id, owner_user_id, features) VALUES (?,?,?) ON DUPLICATE KEY UPDATE features=VALUES(features)`,
		projectID, owner, string(b))
	return err
}

func swipeProjectContext(proj map[string]any) string {
	var contextMD string
	if v, ok := proj["context"]; ok && v != nil {
		switch cv := v.(type) {
		case string:
			contextMD = cv
		case []byte:
			contextMD = string(cv)
		default:
			b, _ := json.Marshal(cv)
			var str string
			if err := json.Unmarshal(b, &str); err == nil {
				contextMD = str
			} else {
				contextMD = string(b)
			}
		}
	}
	contextMD = strings.TrimSpace(contextMD)
	if len([]rune(contextMD)) > 4000 {
		contextMD = string([]rune(contextMD)[:4000])
	}
	return contextMD
}

func buildSwipePrompt(layer string, count int, contextMD, projName, projSlug string) string {
	kind := "short hooks"
	if layer == "angle" {
		kind = "short content angles"
	}
	var b strings.Builder
	b.WriteString(fmt.Sprintf("Generate %d %s from project_context, JSON array [{\"text\": \"...\"}] — each <=120 chars, Russian, punchy, non-generic. JSON array only, no fence, no extra text.\n", count, kind))
	if strings.TrimSpace(contextMD) != "" {
		b.WriteString("project_context:\n")
		b.WriteString(contextMD)
		b.WriteString("\n---\n")
	}
	if strings.TrimSpace(projName) != "" {
		b.WriteString(fmt.Sprintf("project name: %s\n", projName))
	}
	if strings.TrimSpace(projSlug) != "" {
		b.WriteString(fmt.Sprintf("project slug: %s\n", projSlug))
	}
	if strings.TrimSpace(contextMD) == "" {
		b.WriteString("project_context is empty — invent relevant, non-generic hooks for this project.\n")
	}
	b.WriteString(fmt.Sprintf("Return JSON array only, exactly %d items, each {\"text\": \"...\"}. No fence.", count))
	return b.String()
}

type swipeHook struct {
	Text string `json:"text"`
}

func parseSwipeHooks(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	if strings.Contains(raw, "```") {
		raw = stripFences(raw)
	}
	var arr []swipeHook
	if err := json.Unmarshal([]byte(raw), &arr); err == nil && len(arr) > 0 {
		return sanitizeSwipeHooks(arr)
	}
	var generic []map[string]any
	if err := json.Unmarshal([]byte(raw), &generic); err == nil && len(generic) > 0 {
		out := make([]swipeHook, 0, len(generic))
		for _, m := range generic {
			for _, key := range []string{"text", "hook", "title"} {
				if v, ok := m[key].(string); ok && strings.TrimSpace(v) != "" {
					out = append(out, swipeHook{Text: v})
					break
				}
			}
		}
		if len(out) > 0 {
			return sanitizeSwipeHooks(out)
		}
	}
	if start := strings.Index(raw, "["); start != -1 {
		if end := strings.LastIndex(raw, "]"); end > start {
			sub := raw[start : end+1]
			if err := json.Unmarshal([]byte(sub), &arr); err == nil && len(arr) > 0 {
				return sanitizeSwipeHooks(arr)
			}
			if err := json.Unmarshal([]byte(sub), &generic); err == nil && len(generic) > 0 {
				out := make([]swipeHook, 0, len(generic))
				for _, m := range generic {
					for _, key := range []string{"text", "hook", "title"} {
						if v, ok := m[key].(string); ok && strings.TrimSpace(v) != "" {
							out = append(out, swipeHook{Text: v})
							break
						}
					}
				}
				if len(out) > 0 {
					return sanitizeSwipeHooks(out)
				}
			}
		}
	}
	return nil
}

func sanitizeSwipeHooks(arr []swipeHook) []string {
	out := make([]string, 0, len(arr))
	for _, h := range arr {
		t := strings.TrimSpace(h.Text)
		t = strings.Trim(t, "\"' ")
		if t == "" {
			continue
		}
		if len([]rune(t)) > 120 {
			t = string([]rune(t)[:120])
		}
		out = append(out, t)
	}
	return out
}
