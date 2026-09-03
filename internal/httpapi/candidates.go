package httpapi

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/ai-synthetix/content-loop/internal/ai"
)

var slugifyRe = regexp.MustCompile(`[^a-z0-9]+`)

// handleGenerateCandidates POST /api/v1/projects/{id}/generate-candidates {count?: number}
// Creates N content_items with status=idea for that project using project.context + AI.
func (s *Server) handleGenerateCandidates(w http.ResponseWriter, r *http.Request) {
	if s.Store == nil || s.Store.DB == nil {
		// In-memory fallback still supports generation for dev/tests without DB
		s.handleGenerateCandidatesMemory(w, r)
		return
	}
	projectID := chi.URLParam(r, "id")
	if projectID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "project id required"})
		return
	}
	owner := ownerID(r)

	// Parse requested count: default 5, clamp 1..10
	count := 5
	var body struct {
		Count *int `json:"count"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body.Count != nil {
		count = *body.Count
	}
	if count < 1 {
		count = 1
	}
	if count > 10 {
		count = 10
	}

	// Fetch project, ensure owned by caller
	proj, err := s.Store.Get("project", projectID, owner)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "project not found"})
		return
	}
	projName, _ := proj["name"].(string)
	projSlug, _ := proj["slug"].(string)
	// project.context is TEXT markdown — string or []byte
	var contextMD string
	if v, ok := proj["context"]; ok && v != nil {
		switch cv := v.(type) {
		case string:
			contextMD = cv
		case []byte:
			contextMD = string(cv)
		default:
			b, _ := json.Marshal(cv)
			var s string
			if err := json.Unmarshal(b, &s); err == nil {
				contextMD = s
			} else {
				contextMD = string(b)
			}
		}
	}
	contextMD = strings.TrimSpace(contextMD)
	if len([]rune(contextMD)) > 4000 {
		contextMD = string([]rune(contextMD)[:4000])
	}

	// Build AI prompt: JSON array [{title, reason}]
	userMsg := buildCandidatePrompt(count, contextMD, projName, projSlug)
	systemMsg := ai.SystemBase
	var aiResp string
	if s.AI != nil {
		aiResp, err = s.AI.Complete(r.Context(), systemMsg, userMsg)
		if err != nil {
			log.Printf("[candidates] AI Complete error project=%s err=%v", projectID, err)
			aiResp = ""
		}
	}

	ideas := parseCandidateIdeas(aiResp, count, projName)

	// If AI returned fewer than count, pad with fallback
	if len(ideas) < count {
		for i := len(ideas); i < count; i++ {
			fallbackTitle := fmt.Sprintf("Идея %d: %s", i+1, projName)
			if strings.TrimSpace(projName) == "" {
				fallbackTitle = fmt.Sprintf("Идея %d для %s", i+1, projSlug)
			}
			if len(fallbackTitle) > 80 {
				fallbackTitle = string([]rune(fallbackTitle)[:80])
			}
			ideas = append(ideas, candidateIdea{Title: fallbackTitle, Reason: "Сгенерировано из контекста проекта"})
		}
	}
	if len(ideas) > count {
		ideas = ideas[:count]
	}

	// Create content_items
	created := make([]map[string]any, 0, len(ideas))
	for _, it := range ideas {
		title := strings.TrimSpace(it.Title)
		if title == "" {
			continue
		}
		if len([]rune(title)) > 500 {
			title = string([]rune(title)[:500])
		}
		reason := strings.TrimSpace(it.Reason)
		if reason == "" {
			reason = "Сгенерировано из контекста проекта"
		}
		slug := makeUniqueSlug(title, owner, projectID)
		briefObj := map[string]string{"raw": reason}
		briefBytes, _ := json.Marshal(briefObj)
		row := map[string]any{
			"id":            uuid.NewString(),
			"owner_user_id": owner,
			"project_id":    projectID,
			"title":         title,
			"slug":          slug,
			"status":        "idea",
			"brief":         string(briefBytes),
		}
		if err := s.Store.Insert("content_item", row); err != nil {
			// If slug duplicate, retry with uuid suffix
			if strings.Contains(err.Error(), "Duplicate") || strings.Contains(strings.ToLower(err.Error()), "duplicate") {
				row["slug"] = slug + "-" + uuid.NewString()[:6]
				row["id"] = uuid.NewString()
				if err2 := s.Store.Insert("content_item", row); err2 != nil {
					log.Printf("[candidates] insert retry failed slug=%s err=%v", row["slug"], err2)
					continue
				}
			} else {
				log.Printf("[candidates] insert failed title=%q err=%v", title, err)
				continue
			}
		}
		// Fetch back for response consistency (convert []byte)
		if fetched, err := s.Store.Get("content_item", row["id"].(string), owner); err == nil {
			for k, v := range fetched {
				if b, ok := v.([]byte); ok {
					fetched[k] = string(b)
				}
			}
			created = append(created, fetched)
		} else {
			created = append(created, row)
		}
	}

	writeJSON(w, http.StatusCreated, map[string]any{"items": created, "count": len(created)})
}

type candidateIdea struct {
	Title  string `json:"title"`
	Reason string `json:"reason"`
}

func buildCandidatePrompt(count int, contextMD, projName, projSlug string) string {
	var b strings.Builder
	b.WriteString(fmt.Sprintf("Generate %d topic ideas from project_context, JSON array [{\"title\": \"...\", \"reason\": \"...\"}] — Title <80 chars, reason 1 sentence (ru). JSON array only, no fence, no extra text.\n", count))
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
		b.WriteString("project_context is empty — invent relevant, non-generic topics for this project.\n")
	}
	b.WriteString(fmt.Sprintf("Return JSON array only, exactly %d items, each {\"title\": \"...\", \"reason\": \"...\"}. No fence.", count))
	return b.String()
}

func parseCandidateIdeas(raw string, count int, projName string) []candidateIdea {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	// strip fences ```json ... ```
	if strings.Contains(raw, "```") {
		raw = stripFences(raw)
	}
	// Try direct JSON array parse
	var arr []candidateIdea
	if err := json.Unmarshal([]byte(raw), &arr); err == nil && len(arr) > 0 {
		return sanitizeIdeas(arr)
	}
	// Try generic []map
	var generic []map[string]any
	if err := json.Unmarshal([]byte(raw), &generic); err == nil && len(generic) > 0 {
		out := make([]candidateIdea, 0, len(generic))
		for _, m := range generic {
			title := ""
			reason := ""
			if v, ok := m["title"].(string); ok {
				title = v
			} else if v, ok := m["name"].(string); ok {
				title = v
			}
			if v, ok := m["reason"].(string); ok {
				reason = v
			} else if v, ok := m["why"].(string); ok {
				reason = v
			}
			if strings.TrimSpace(title) != "" {
				out = append(out, candidateIdea{Title: strings.TrimSpace(title), Reason: reason})
			}
		}
		if len(out) > 0 {
			return sanitizeIdeas(out)
		}
	}
	// Extract JSON array substring between first '[' and last ']'
	if start := strings.Index(raw, "["); start != -1 {
		if end := strings.LastIndex(raw, "]"); end > start {
			sub := raw[start : end+1]
			if err := json.Unmarshal([]byte(sub), &arr); err == nil && len(arr) > 0 {
				return sanitizeIdeas(arr)
			}
			if err := json.Unmarshal([]byte(sub), &generic); err == nil && len(generic) > 0 {
				out := make([]candidateIdea, 0, len(generic))
				for _, m := range generic {
					title := ""
					reason := ""
					if v, ok := m["title"].(string); ok {
						title = v
					}
					if v, ok := m["reason"].(string); ok {
						reason = v
					}
					if strings.TrimSpace(title) != "" {
						out = append(out, candidateIdea{Title: title, Reason: reason})
					}
				}
				if len(out) > 0 {
					return sanitizeIdeas(out)
				}
			}
		}
	}
	// Try object wrapping {items: [...] } or {"topics": [...]}
	var wrapper map[string]any
	if err := json.Unmarshal([]byte(raw), &wrapper); err == nil {
		for _, key := range []string{"items", "topics", "ideas", "data"} {
			if v, ok := wrapper[key]; ok {
				if b, err := json.Marshal(v); err == nil {
					var wArr []candidateIdea
					if err := json.Unmarshal(b, &wArr); err == nil && len(wArr) > 0 {
						return sanitizeIdeas(wArr)
					}
				}
			}
		}
		// single object fallback
		if t, ok := wrapper["title"].(string); ok && strings.TrimSpace(t) != "" {
			reason := ""
			if r2, ok := wrapper["reason"].(string); ok {
				reason = r2
			}
			return sanitizeIdeas([]candidateIdea{{Title: t, Reason: reason}})
		}
	}
	// Mock fallback: if AI returned a mock draft_canonical-like JSON, not applicable
	return nil
}

func sanitizeIdeas(arr []candidateIdea) []candidateIdea {
	out := make([]candidateIdea, 0, len(arr))
	for _, it := range arr {
		t := strings.TrimSpace(it.Title)
		if t == "" {
			continue
		}
		// strip trailing punctuation spam
		t = strings.Trim(t, "\"' ")
		if len([]rune(t)) > 80 {
			t = string([]rune(t)[:80])
		}
		r := strings.TrimSpace(it.Reason)
		out = append(out, candidateIdea{Title: t, Reason: r})
	}
	return out
}

func stripFences(s string) string {
	// remove ```json / ``` blocks, keep inner
	for {
		start := strings.Index(s, "```")
		if start == -1 {
			break
		}
		end := strings.Index(s[start+3:], "```")
		if end == -1 {
			s = strings.ReplaceAll(s, "```", "")
			break
		}
		end += start + 3
		innerStart := start + 3
		// skip language tag line
		if nl := strings.Index(s[innerStart:end], "\n"); nl != -1 {
			innerStart = innerStart + nl + 1
		}
		inner := strings.TrimSpace(s[innerStart:end])
		s = s[:start] + inner + s[end+3:]
	}
	return strings.TrimSpace(s)
}

func makeUniqueSlug(title, owner, projectID string) string {
	base := strings.ToLower(strings.TrimSpace(title))
	base = slugifyRe.ReplaceAllString(base, "-")
	base = strings.Trim(base, "-")
	if len(base) > 70 {
		base = base[:70]
		base = strings.Trim(base, "-")
	}
	if base == "" {
		base = "idea"
	}
	// truncate to leave room for suffix if needed
	if len(base) < 2 {
		base = "idea-" + base
	}
	// For DB mode we try plain base first and handle duplicate on insert retry;
	// but to reduce collisions pre-check, add short suffix if base is generic "idea"
	if base == "idea" || base == "untitled" {
		return base + "-" + uuid.NewString()[:6]
	}
	return base
}

// In-memory fallback for dev without DB
func (s *Server) handleGenerateCandidatesMemory(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "id")
	count := 5
	var body struct {
		Count *int `json:"count"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body.Count != nil {
		count = *body.Count
	}
	if count < 1 {
		count = 1
	}
	if count > 10 {
		count = 10
	}

	s.mu.RLock()
	proj, ok := s.projects[projectID]
	s.mu.RUnlock()
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "project not found"})
		return
	}
	projName, _ := proj["name"].(string)
	projSlug, _ := proj["slug"].(string)
	var contextMD string
	if v, ok := proj["context"]; ok && v != nil {
		if ss, ok := v.(string); ok {
			contextMD = ss
		} else {
			b, _ := json.Marshal(v)
			contextMD = string(b)
		}
	}
	contextMD = strings.TrimSpace(contextMD)
	if len([]rune(contextMD)) > 4000 {
		contextMD = string([]rune(contextMD)[:4000])
	}
	userMsg := buildCandidatePrompt(count, contextMD, projName, projSlug)
	var aiResp string
	if s.AI != nil {
		if resp, err := s.AI.Complete(r.Context(), ai.SystemBase, userMsg); err == nil {
			aiResp = resp
		} else {
			log.Printf("[candidates:mem] AI error %v", err)
		}
	}
	ideas := parseCandidateIdeas(aiResp, count, projName)
	if len(ideas) < count {
		for i := len(ideas); i < count; i++ {
			title := fmt.Sprintf("Идея %d: %s", i+1, projName)
			if strings.TrimSpace(projName) == "" {
				title = fmt.Sprintf("Идея %d для %s", i+1, projSlug)
			}
			if len(title) > 80 {
				title = string([]rune(title)[:80])
			}
			ideas = append(ideas, candidateIdea{Title: title, Reason: "Сгенерировано из контекста проекта"})
		}
	}
	if len(ideas) > count {
		ideas = ideas[:count]
	}

	created := make([]map[string]any, 0, len(ideas))
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, it := range ideas {
		title := strings.TrimSpace(it.Title)
		if title == "" {
			continue
		}
		slug := makeUniqueSlug(title, "", projectID)
		// ensure unique in memory
		orig := slug
		for i := 1; ; i++ {
			collides := false
			for _, v := range s.contentItems {
				if v["slug"] == slug {
					collides = true
					break
				}
			}
			if !collides {
				break
			}
			slug = fmt.Sprintf("%s-%d", orig, i)
			if i > 20 {
				slug = orig + "-" + uuid.NewString()[:4]
				break
			}
		}
		briefObj := map[string]string{"raw": it.Reason}
		briefBytes, _ := json.Marshal(briefObj)
		id := uuid.NewString()
		row := map[string]any{
			"id":         id,
			"project_id": projectID,
			"title":      title,
			"slug":       slug,
			"status":     "idea",
			"brief":      string(briefBytes),
		}
		s.contentItems[id] = row
		created = append(created, row)
	}
	writeJSON(w, http.StatusCreated, map[string]any{"items": created, "count": len(created)})
}
