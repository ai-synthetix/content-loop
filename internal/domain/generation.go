package domain

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync/atomic"
	"time"

	"github.com/google/uuid"

	"github.com/ai-synthetix/content-loop/internal/ai"
	"github.com/ai-synthetix/content-loop/internal/store"
)

// GenerationService orchestrates plan_topic → build_brief → draft_canonical → render_variant → verify → prepare_review
type GenerationService struct {
	Store *store.Store
	AI    *ai.Provider
}

type GenerateResult struct {
	Brief         map[string]any   `json:"brief"`
	DedupWarning  *string          `json:"dedup_warning,omitempty"`
	Version       map[string]any   `json:"version"`
	Variants      []map[string]any `json:"variants"`
	Verification  VerificationReport `json:"verification"`
	Diff          map[string]any   `json:"diff"`
}

type VerificationReport struct {
	Passed   bool     `json:"passed"`
	Errors   []string `json:"errors"`
	Warnings []string `json:"warnings"`
	Length   int      `json:"length"`
}

var forbiddenPhrases = []string{"as an ai", "i am an ai", "guaranteed", "100% guarantee"}

// fallback metrics
var (
	fallbackBriefCount     int64
	fallbackCanonicalCount int64
	aiSuccessCanonicalCount int64
)

func FallbackMetrics() map[string]int64 {
	return map[string]int64{
		"fallback_brief":     atomic.LoadInt64(&fallbackBriefCount),
		"fallback_canonical": atomic.LoadInt64(&fallbackCanonicalCount),
		"ai_success_canonical": atomic.LoadInt64(&aiSuccessCanonicalCount),
	}
}

func substr(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

func NewGenerationService(st *store.Store, p *ai.Provider) *GenerationService {
	if p == nil {
		p = ai.NewFromEnv()
	}
	return &GenerationService{Store: st, AI: p}
}

// Generate runs the full pipeline for a content_item owned by ownerUserID.
func (g *GenerationService) Generate(ctx context.Context, contentItemID, ownerUserID string) (*GenerateResult, error) {
	if g.Store == nil || g.Store.DB == nil {
		return nil, fmt.Errorf("store not available")
	}
	item, err := g.Store.Get("content_item", contentItemID, ownerUserID)
	if err != nil {
		return nil, err
	}
	title, _ := item["title"].(string)
	if title == "" {
		title = contentItemID
	}
	briefRaw, _ := item["brief"].(string)

	// 1. plan_topic: dedupe via title LIKE
	dedupWarning := g.planTopic(ownerUserID, title, contentItemID)

	// Load project for policy (best effort)
	var projectJSON = "{}"
	if pid, ok := item["project_id"].(string); ok && pid != "" {
		if proj, err := g.Store.Get("project", pid, ownerUserID); err == nil {
			if b, err := json.Marshal(proj); err == nil {
				projectJSON = string(b)
			}
		}
	}

	// 2. build_brief: scaffold claims/sources
	brief := g.buildBrief(ctx, title, projectJSON, briefRaw)

	// persist brief back to content_item
	briefBytes, _ := json.Marshal(brief)
	updatedItem, err := g.Store.Update("content_item", contentItemID, ownerUserID, map[string]any{"brief": string(briefBytes)})
	if err == nil {
		item = updatedItem
	}

	// 3. draft_canonical via AI
	canonical := g.draftCanonical(ctx, title, brief)

	// 4. verify
	vr := verify(canonical)

	// 5. persist content_version
	versionNo := g.nextVersionNo(contentItemID, ownerUserID)
	claimsJSON, _ := json.Marshal(canonical.Claims)
	sourcesJSON, _ := json.Marshal(canonical.Sources)
	modelName := g.AI.Model
	promptUsed := "draft_canonical"
	versionID := uuid.NewString()
	versionRow := map[string]any{
		"id":              versionID,
		"owner_user_id":   ownerUserID,
		"content_item_id": contentItemID,
		"version_no":      versionNo,
		"title":           canonical.Title,
		"excerpt":         canonical.Excerpt,
		"body_markdown":   canonical.BodyMarkdown,
		"claims":          string(claimsJSON),
		"sources":         string(sourcesJSON),
		"prompt":          promptUsed,
		"model":           modelName,
	}
	if err := g.Store.Insert("content_version", versionRow); err != nil {
		return nil, fmt.Errorf("insert version: %w", err)
	}
	// update status to drafting/review_ready depending on verification
	newStatus := string(StatusDrafting)
	if vr.Passed {
		newStatus = string(StatusReviewReady)
	}
	_, _ = g.Store.Update("content_item", contentItemID, ownerUserID, map[string]any{"status": newStatus})

	// 6. render_variant for each channel
	variants := g.renderVariants(ctx, contentItemID, versionID, ownerUserID, canonical)

	// 7. prepare_review diff
	diff := g.prepareDiff(contentItemID, ownerUserID, versionID, canonical)

	// fetch inserted version for response
	ver, _ := g.Store.Get("content_version", versionID, ownerUserID)
	if ver == nil {
		ver = versionRow
	}

	_ = item
	res := &GenerateResult{
		Brief:        brief,
		Version:      ver,
		Variants:     variants,
		Verification: vr,
		Diff:         diff,
	}
	if dedupWarning != nil {
		res.DedupWarning = dedupWarning
	}
	return res, nil
}

func (g *GenerationService) BuildBriefOnly(ctx context.Context, contentItemID, ownerUserID string) (map[string]any, error) {
	if g.Store == nil || g.Store.DB == nil {
		return nil, fmt.Errorf("store not available")
	}
	item, err := g.Store.Get("content_item", contentItemID, ownerUserID)
	if err != nil {
		return nil, err
	}
	title, _ := item["title"].(string)
	briefRaw, _ := item["brief"].(string)
	var projectJSON = "{}"
	if pid, ok := item["project_id"].(string); ok && pid != "" {
		if proj, err := g.Store.Get("project", pid, ownerUserID); err == nil {
			if b, err := json.Marshal(proj); err == nil {
				projectJSON = string(b)
			}
		}
	}
	brief := g.buildBrief(ctx, title, projectJSON, briefRaw)
	b, _ := json.Marshal(brief)
	_, _ = g.Store.Update("content_item", contentItemID, ownerUserID, map[string]any{"brief": string(b)})
	return brief, nil
}

type ReviewBundle struct {
	Item       map[string]any   `json:"item"`
	Latest     map[string]any   `json:"latest_version,omitempty"`
	Previous   map[string]any   `json:"previous_version,omitempty"`
	Variants   []map[string]any `json:"variants"`
	Diff       map[string]any   `json:"diff"`
	Verify     VerificationReport `json:"verification"`
}

func (g *GenerationService) PrepareReview(contentItemID, ownerUserID string) (*ReviewBundle, error) {
	if g.Store == nil || g.Store.DB == nil {
		return nil, fmt.Errorf("store not available")
	}
	item, err := g.Store.Get("content_item", contentItemID, ownerUserID)
	if err != nil {
		return nil, err
	}
	versions, _ := g.Store.List("content_version", ownerUserID)
	var filtered []map[string]any
	for _, v := range versions {
		if v["content_item_id"] == contentItemID {
			filtered = append(filtered, v)
		}
	}
	var latest, prev map[string]any
	maxNo := -1
	for _, v := range filtered {
		no := toInt(v["version_no"])
		if no > maxNo {
			prev = latest
			latest = v
			maxNo = no
		} else if prev == nil {
			prev = v
		}
	}
	var variants []map[string]any
	if latest != nil {
		allVars, _ := g.Store.List("channel_variant", ownerUserID)
		for _, cv := range allVars {
			if cv["content_version_id"] == latest["id"] {
				variants = append(variants, cv)
			}
		}
	}
	if variants == nil {
		variants = []map[string]any{}
	}
	diff := map[string]any{}
	if latest != nil {
		diff = buildDiff(prev, latest)
	}
	vr := VerificationReport{Passed: true}
	if latest != nil {
		if bm, ok := latest["body_markdown"].(string); ok {
			vr.Length = len([]rune(bm))
		}
	}
	return &ReviewBundle{Item: item, Latest: latest, Previous: prev, Variants: variants, Diff: diff, Verify: vr}, nil
}

// --- internal steps ---

func (g *GenerationService) planTopic(ownerUserID, title, currentID string) *string {
	if g.Store == nil || g.Store.DB == nil {
		return nil
	}
	like := "%" + escapeLike(title) + "%"
	rows, err := g.Store.DB.Queryx(`SELECT id, title FROM content_item WHERE owner_user_id=? AND id != ? AND title LIKE ? LIMIT 5`, ownerUserID, currentID, like)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var dups []string
	for rows.Next() {
		var id, t string
		_ = rows.Scan(&id, &t)
		dups = append(dups, t)
	}
	if len(dups) > 0 {
		msg := fmt.Sprintf("possible duplicate of: %s", strings.Join(dups, "; "))
		return &msg
	}
	return nil
}

func (g *GenerationService) buildBrief(ctx context.Context, title, projectJSON, existingBrief string) map[string]any {
	userMsg := ai.UserBuildBrief(title, projectJSON, existingBrief)
	resp, err := g.AI.Complete(ctx, ai.SystemBase, userMsg)
	if err != nil {
		log.Printf("[generation] buildBrief Complete error title=%q err=%v", title, err)
		atomic.AddInt64(&fallbackBriefCount, 1)
	} else {
		if m := tryParseJSON(resp); m != nil {
			log.Printf("[generation] buildBrief AI success title=%q resp_snip=%q", title, substr(resp, 200))
			return m
		}
		log.Printf("[generation] buildBrief parse warning title=%q resp_snip=%q", title, substr(resp, 500))
		if len(strings.TrimSpace(resp)) > 100 {
			// treat raw as needed? brief needs JSON, fallback
		}
		atomic.AddInt64(&fallbackBriefCount, 1)
	}
	// scaffold fallback
	return map[string]any{
		"goal":     "Inform and engage audience about: " + title,
		"audience": "General",
		"claims": []map[string]any{
			{"text": "Claim derived from title: " + title, "source": nil},
		},
		"sources": []string{},
		"outline": []string{"Introduction", "Main content", "Conclusion + CTA"},
	}
}

type canonicalDraft struct {
	Title        string   `json:"title"`
	Excerpt      string   `json:"excerpt"`
	BodyMarkdown string   `json:"body_markdown"`
	Claims       []string `json:"claims"`
	Sources      []string `json:"sources"`
}

func (g *GenerationService) draftCanonical(ctx context.Context, title string, brief map[string]any) canonicalDraft {
	// truncate inputs dramatically to avoid gateway timeout (was whole project JSON)
	if len(title) > 100 {
		title = string([]rune(title)[:100])
	}
	briefJSON, _ := json.Marshal(brief)
	bj := string(briefJSON)
	if len(bj) > 2000 {
		bj = bj[:2000]
	}
	userMsg := ai.UserDraftCanonical(title, bj)
	resp, err := g.AI.Complete(ctx, ai.SystemBase, userMsg)
	if err != nil {
		log.Printf("[generation] draftCanonical Complete error title=%q err=%v full_err=%+v", title, err, err)
		// one retry with even smaller prompt before fallback
		smallerBrief := bj
		if len(smallerBrief) > 1000 {
			smallerBrief = smallerBrief[:1000]
		}
		smallTitle := title
		if len(smallTitle) > 60 {
			smallTitle = string([]rune(smallTitle)[:60])
		}
		smallMsg := ai.UserDraftCanonical(smallTitle, smallerBrief)
		// short inline prompt override: request even shorter output
		smallMsg += "\nKeep body_markdown under 800 words, be very concise."
		log.Printf("[generation] draftCanonical retry with smaller prompt title=%q brief_len=%d", smallTitle, len(smallerBrief))
		resp2, err2 := g.AI.Complete(ctx, ai.SystemBase, smallMsg)
		if err2 == nil {
			resp = resp2
			err = nil
			log.Printf("[generation] draftCanonical retry succeeded title=%q resp_len=%d", title, len(resp))
		} else {
			log.Printf("[generation] draftCanonical retry also failed title=%q err=%v", title, err2)
			atomic.AddInt64(&fallbackCanonicalCount, 1)
		}
	}
	if err == nil {
		if m := tryParseJSON(resp); m != nil {
			atomic.AddInt64(&aiSuccessCanonicalCount, 1)
			log.Printf("[generation] draftCanonical AI JSON success title=%q body_len=%d snip=%q", title, len(resp), substr(resp, 200))
			return mapToCanonical(m, title)
		}
		trimmed := strings.TrimSpace(resp)
		if len(trimmed) > 100 {
			log.Printf("[generation] draftCanonical raw markdown fallback title=%q resp_len=%d snip=%q", title, len(trimmed), substr(trimmed, 500))
			atomic.AddInt64(&aiSuccessCanonicalCount, 1)
			return canonicalDraft{Title: title, Excerpt: truncate(trimmed, 160), BodyMarkdown: trimmed, Claims: extractClaims(brief), Sources: extractSources(brief)}
		}
		log.Printf("[generation] draftCanonical parse warning title=%q resp_snip=%q len=%d", title, substr(resp, 500), len(resp))
		atomic.AddInt64(&fallbackCanonicalCount, 1)
	}
	// scaffold fallback
	log.Printf("[generation] draftCanonical using scaffold fallback title=%q", title)
	return canonicalDraft{
		Title:        title,
		Excerpt:      "Generated excerpt for " + truncate(title, 80),
		BodyMarkdown: fmt.Sprintf("# %s\n\nThis is a generated canonical draft for **%s**.\n\n## Overview\n\nContent generated via fallback pipeline (no AI key or AI error). Replace with real generation when OPENCODE_API_KEY is set.\n\n- Point one\n- Point two\n\n> Claims scaffold: %v\n", title, title, extractClaims(brief)),
		Claims:  extractClaims(brief),
		Sources: extractSources(brief),
	}
}

func (g *GenerationService) renderVariants(ctx context.Context, contentItemID, versionID, ownerUserID string, c canonicalDraft) []map[string]any {
	channels := []string{"telegram", "familyos"}
	var out []map[string]any
	// truncate body for variant prompts to avoid timeout
	shortBody := c.BodyMarkdown
	if len(shortBody) > 2000 {
		shortBody = string([]rune(shortBody)[:2000])
	}
	for _, ch := range channels {
		var rendered string
		var userMsg string
		if ch == "telegram" {
			userMsg = ai.UserRenderTelegram(shortBody)
		} else {
			userMsg = ai.UserRenderFamilyOS(shortBody)
		}
		// per-variant timeout so one slow variant doesn't block whole generation
		vctx, cancel := context.WithTimeout(ctx, 30*time.Second)
		resp, err := g.AI.Complete(vctx, ai.SystemBase, userMsg)
		cancel()
		if err == nil && resp != "" {
			rendered = resp
		} else {
			if err != nil {
				log.Printf("[generation] renderVariants %s error: %v snip=%q", ch, err, substr(c.BodyMarkdown, 100))
			}
			if ch == "telegram" {
				rendered = truncate(c.BodyMarkdown, 3500)
			} else {
				rendered = c.BodyMarkdown
			}
		}
		if ch == "telegram" && len([]rune(rendered)) > 4096 {
			rendered = string([]rune(rendered)[:4090]) + "…"
		}
		payload := map[string]any{"channel": ch, "body": rendered}
		payloadJSON, _ := json.Marshal(payload)
		id := uuid.NewString()
		row := map[string]any{
			"id":                 id,
			"owner_user_id":      ownerUserID,
			"content_item_id":    contentItemID,
			"content_version_id": versionID,
			"channel":            ch,
			"payload":            string(payloadJSON),
			"rendered_body":      rendered,
		}
		_ = g.Store.Insert("channel_variant", row)
		out = append(out, row)
	}
	return out
}

func (g *GenerationService) nextVersionNo(contentItemID, ownerUserID string) int {
	var n sql.NullInt64
	_ = g.Store.DB.Get(&n, `SELECT COALESCE(MAX(version_no),0) FROM content_version WHERE content_item_id=? AND owner_user_id=?`, contentItemID, ownerUserID)
	if n.Valid {
		return int(n.Int64) + 1
	}
	return 1
}

func (g *GenerationService) prepareDiff(contentItemID, ownerUserID, versionID string, cur canonicalDraft) map[string]any {
	versions, _ := g.Store.List("content_version", ownerUserID)
	var prev map[string]any
	maxNo := -1
	var maxEntry map[string]any
	for _, v := range versions {
		if v["content_item_id"] != contentItemID || v["id"] == versionID {
			continue
		}
		no := toInt(v["version_no"])
		if no > maxNo {
			maxNo = no
			maxEntry = v
		}
	}
	prev = maxEntry
	curMap := map[string]any{"title": cur.Title, "body_markdown": cur.BodyMarkdown, "excerpt": cur.Excerpt}
	return buildDiff(prev, curMap)
}

func buildDiff(prev, cur map[string]any) map[string]any {
	if prev == nil {
		return map[string]any{"change": "initial version", "cur": cur}
	}
	diff := map[string]any{}
	for k, cv := range cur {
		if pv, ok := prev[k]; !ok || fmt.Sprintf("%v", pv) != fmt.Sprintf("%v", cv) {
			diff[k] = map[string]any{"prev": prev[k], "cur": cv}
		}
	}
	if len(diff) == 0 {
		diff["change"] = "no textual change"
	}
	return diff
}

func verify(c canonicalDraft) VerificationReport {
	var errs []string
	var warns []string
	l := len([]rune(c.BodyMarkdown))
	if l < 200 {
		errs = append(errs, fmt.Sprintf("body too short: %d chars (min 200)", l))
	}
	if l > 30000 {
		errs = append(errs, fmt.Sprintf("body too long: %d chars (max 30000)", l))
	}
	if strings.TrimSpace(c.Title) == "" {
		errs = append(errs, "title empty")
	}
	if c.BodyMarkdown == "" {
		errs = append(errs, "body_markdown empty")
	}
	if !strings.Contains(c.BodyMarkdown, "#") && !strings.Contains(c.BodyMarkdown, "- ") && !strings.Contains(c.BodyMarkdown, "*") {
		warns = append(warns, "body lacks markdown structure (no headings/lists)")
	}
	if len(c.Claims) == 0 {
		warns = append(warns, "no claims")
	}
	lower := strings.ToLower(c.BodyMarkdown + " " + c.Title)
	for _, f := range forbiddenPhrases {
		if strings.Contains(lower, f) {
			errs = append(errs, "forbidden phrase: "+f)
		}
	}
	return VerificationReport{Passed: len(errs) == 0, Errors: errs, Warnings: warns, Length: l}
}

// helpers

func tryParseJSON(s string) map[string]any {
	s = strings.TrimSpace(s)
	// handle JSON fences: ```json ... ``` or ``` ... ```
	if strings.HasPrefix(s, "```") {
		// strip first fence line
		lines := strings.SplitN(s, "\n", 2)
		if len(lines) == 2 {
			// remove ```json or ``` prefix
			s = lines[1]
		} else {
			s = strings.TrimPrefix(s, "```json")
			s = strings.TrimPrefix(s, "```")
		}
		// strip trailing fence
		if idx := strings.LastIndex(s, "```"); idx != -1 {
			s = s[:idx]
		}
		s = strings.TrimSpace(s)
	}
	// also handle case where fence encloses JSON but not at start (e.g. "Here is JSON:\n```json\n{...}\n```")
	if strings.Contains(s, "```") {
		// extract between fences
		startFence := strings.Index(s, "```")
		if startFence != -1 {
			rest := s[startFence:]
			// find newline after fence
			nl := strings.Index(rest, "\n")
			if nl != -1 {
				rest = rest[nl+1:]
			} else {
				rest = strings.TrimPrefix(rest, "```json")
				rest = strings.TrimPrefix(rest, "```")
			}
			if endFence := strings.LastIndex(rest, "```"); endFence != -1 {
				s = strings.TrimSpace(rest[:endFence])
			}
		}
	}
	// legacy simple prefix/suffix handling
	s = strings.TrimPrefix(s, "```json")
	s = strings.TrimPrefix(s, "```")
	s = strings.TrimSuffix(s, "```")
	s = strings.TrimSpace(s)
	start := strings.Index(s, "{")
	end := strings.LastIndex(s, "}")
	if start >= 0 && end > start {
		s = s[start : end+1]
	}
	var m map[string]any
	if err := json.Unmarshal([]byte(s), &m); err != nil {
		log.Printf("[generation] tryParseJSON fail err=%v s_snip=%q", err, substr(s, 300))
		return nil
	}
	return m
}

func mapToCanonical(m map[string]any, fallbackTitle string) canonicalDraft {
	c := canonicalDraft{Title: fallbackTitle}
	if v, ok := m["title"].(string); ok {
		c.Title = v
	}
	if v, ok := m["excerpt"].(string); ok {
		c.Excerpt = v
	}
	if v, ok := m["body_markdown"].(string); ok {
		c.BodyMarkdown = v
	} else if v, ok := m["body"].(string); ok {
		c.BodyMarkdown = v
	} else if v, ok := m["markdown"].(string); ok {
		c.BodyMarkdown = v
	}
	if v, ok := m["claims"].([]any); ok {
		for _, x := range v {
			if s, ok := x.(string); ok {
				c.Claims = append(c.Claims, s)
			} else if mm, ok := x.(map[string]any); ok {
				if t, ok := mm["text"].(string); ok {
					c.Claims = append(c.Claims, t)
				}
			}
		}
	} else if v, ok := m["claims"].([]string); ok {
		c.Claims = v
	}
	if v, ok := m["sources"].([]any); ok {
		for _, x := range v {
			if s, ok := x.(string); ok {
				c.Sources = append(c.Sources, s)
			}
		}
	}
	if c.BodyMarkdown == "" {
		c.BodyMarkdown = "# " + c.Title + "\n\n" + c.Excerpt
	}
	return c
}

func extractClaims(brief map[string]any) []string {
	var out []string
	if v, ok := brief["claims"].([]any); ok {
		for _, x := range v {
			if mm, ok := x.(map[string]any); ok {
				if t, ok := mm["text"].(string); ok {
					out = append(out, t)
				}
			} else if s, ok := x.(string); ok {
				out = append(out, s)
			}
		}
	}
	if len(out) == 0 {
		out = []string{"No explicit claims"}
	}
	return out
}
func extractSources(brief map[string]any) []string {
	var out []string
	if v, ok := brief["sources"].([]any); ok {
		for _, x := range v {
			if s, ok := x.(string); ok {
				out = append(out, s)
			}
		}
	}
	return out
}
func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}
func escapeLike(s string) string {
	r := strings.ReplaceAll(s, "%", "\\%")
	r = strings.ReplaceAll(r, "_", "\\_")
	if len([]rune(r)) > 40 {
		r = string([]rune(r)[:40])
	}
	return r
}
func toInt(v any) int {
	switch x := v.(type) {
	case int:
		return x
	case int64:
		return int(x)
	case int32:
		return int(x)
	case float64:
		return int(x)
	case string:
		var i int
		fmt.Sscanf(x, "%d", &i)
		return i
	case []byte:
		var i int
		fmt.Sscanf(string(x), "%d", &i)
		return i
	}
	return 0
}

// Ensure time import used
var _ = time.Now
