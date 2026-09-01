package httpapi

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/ai-synthetix/content-loop/internal/crypto"
	"github.com/ai-synthetix/content-loop/internal/store"
)

// channels handlers - owner isolated

func (s *Server) listChannels(w http.ResponseWriter, r *http.Request) {
	if !s.useDB() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "DB required"})
		return
	}
	owner := ownerID(r)
	items, err := s.Store.ListChannels(owner)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	for i := range items {
		items[i].Config = sanitizeConfig(items[i].Config)
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) createChannel(w http.ResponseWriter, r *http.Request) {
	if !s.useDB() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "DB required"})
		return
	}
	owner := ownerID(r)
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	typ, _ := body["type"].(string)
	if typ == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "type required (telegram|familyos|generic)"})
		return
	}
	if typ != "telegram" && typ != "familyos" && typ != "generic" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid type"})
		return
	}
	name, _ := body["name"].(string)
	if name == "" {
		name = typ
	}
	var projectID *string
	if v, ok := body["project_id"]; ok && v != nil && fmt.Sprintf("%v", v) != "" && fmt.Sprintf("%v", v) != "<nil>" {
		sv := fmt.Sprintf("%v", v)
		sv = strings.TrimSpace(sv)
		if sv != "" {
			// validate project belongs to owner
			if _, err := s.Store.Get("project", sv, owner); err != nil {
				if err == sql.ErrNoRows {
					writeJSON(w, http.StatusBadRequest, map[string]string{"error": "project_id not found or not owned by you"})
					return
				}
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			projectID = &sv
		}
	}
	cfgRaw, _ := body["config"]
	cfgMap := toConfigMap(cfgRaw)
	if cfgMap == nil {
		cfgMap = map[string]any{}
	}
	if err := validateChannelConfig(typ, cfgMap); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	ch := store.Channel{
		ID:        uuid.NewString(),
		Type:      typ,
		Name:      name,
		ProjectID: projectID,
		Status:    "active",
	}
	created, err := s.Store.CreateChannel(owner, ch, cfgMap)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	created.Config = sanitizeConfig(created.Config)
	writeJSON(w, http.StatusCreated, created)
}

func (s *Server) getChannel(w http.ResponseWriter, r *http.Request) {
	if !s.useDB() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "DB required"})
		return
	}
	owner := ownerID(r)
	id := chi.URLParam(r, "id")
	ch, err := s.Store.GetChannel(id, owner)
	if err != nil {
		if err == sql.ErrNoRows {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	ch.Config = sanitizeConfig(ch.Config)
	writeJSON(w, http.StatusOK, ch)
}

func (s *Server) updateChannel(w http.ResponseWriter, r *http.Request) {
	if !s.useDB() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "DB required"})
		return
	}
	owner := ownerID(r)
	id := chi.URLParam(r, "id")
	var patch map[string]any
	if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	// validate project_id if present
	if pidRaw, ok := patch["project_id"]; ok {
		if pidRaw != nil && fmt.Sprintf("%v", pidRaw) != "" && fmt.Sprintf("%v", pidRaw) != "<nil>" {
			sv := strings.TrimSpace(fmt.Sprintf("%v", pidRaw))
			if sv != "" {
				if _, err := s.Store.Get("project", sv, owner); err != nil {
					if err == sql.ErrNoRows {
						writeJSON(w, http.StatusBadRequest, map[string]string{"error": "project_id not found or not owned by you"})
						return
					}
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
					return
				}
				patch["project_id"] = sv
			} else {
				patch["project_id"] = nil
			}
		} else {
			patch["project_id"] = nil
		}
	}
	if cfgRaw, ok := patch["config"]; ok {
		cfgMap := toConfigMap(cfgRaw)
		typ := ""
		if t, ok := patch["type"].(string); ok {
			typ = t
		} else {
			if existing, err := s.Store.GetChannel(id, owner); err == nil {
				typ = existing.Type
			}
		}
		if typ != "" {
			if err := validateChannelConfig(typ, cfgMap); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
		}
	}
	updated, err := s.Store.UpdateChannel(id, owner, patch)
	if err != nil {
		if err == sql.ErrNoRows {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	updated.Config = sanitizeConfig(updated.Config)
	writeJSON(w, http.StatusOK, updated)
}

func (s *Server) deleteChannel(w http.ResponseWriter, r *http.Request) {
	if !s.useDB() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "DB required"})
		return
	}
	owner := ownerID(r)
	id := chi.URLParam(r, "id")
	if err := s.Store.DeleteChannel(id, owner); err != nil {
		if err == sql.ErrNoRows {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) testChannel(w http.ResponseWriter, r *http.Request) {
	if !s.useDB() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "DB required"})
		return
	}
	owner := ownerID(r)
	id := chi.URLParam(r, "id")
	ch, err := s.Store.GetChannel(id, owner)
	if err != nil {
		if err == sql.ErrNoRows {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	result := map[string]any{"ok": false}
	switch ch.Type {
	case "telegram":
		token := ""
		for _, k := range []string{"bot_token", "botToken", "token"} {
			if v, ok := ch.Config[k]; ok {
				s := strings.TrimSpace(fmt.Sprintf("%v", v))
				if s != "" {
					token = s
					break
				}
			}
		}
		if token == "" {
			writeJSON(w, http.StatusOK, map[string]any{"ok": false, "error": "telegram bot_token missing"})
			return
		}
		client := &http.Client{Timeout: 5 * time.Second}
		// getMe
		getMeURL := fmt.Sprintf("https://api.telegram.org/bot%s/getMe", token)
		req, _ := http.NewRequestWithContext(r.Context(), http.MethodGet, getMeURL, nil)
		resp, err := client.Do(req)
		if err != nil {
			result["error"] = err.Error()
			writeJSON(w, http.StatusOK, result)
			return
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		var tgResp struct {
			Ok          bool `json:"ok"`
			Description string `json:"description"`
			Result      struct {
				Username string `json:"username"`
				Title    string `json:"title"`
			} `json:"result"`
		}
		_ = json.Unmarshal(body, &tgResp)
		if !tgResp.Ok || resp.StatusCode != 200 {
			msg := tgResp.Description
			if msg == "" {
				msg = strings.TrimSpace(string(body))
				if msg == "" {
					msg = fmt.Sprintf("getMe failed status %d", resp.StatusCode)
				}
			}
			result["error"] = msg
			result["status"] = resp.StatusCode
			writeJSON(w, http.StatusOK, result)
			return
		}
		result["ok"] = true
		result["bot_username"] = tgResp.Result.Username
		// getChat if channel_id provided
		channelID := ""
		for _, k := range []string{"channel_id", "channelId", "chat_id", "chatId", "channel", "chat"} {
			if v, ok := ch.Config[k]; ok {
				s := strings.TrimSpace(fmt.Sprintf("%v", v))
				if s != "" {
					channelID = s
					break
				}
			}
		}
		if channelID != "" {
			// Telegram getChat requires chat_id query param
			// Use QueryEscape to handle @channel or numeric id
			chatURL := fmt.Sprintf("https://api.telegram.org/bot%s/getChat?chat_id=%s", token, strings.TrimSpace(channelID))
			// ensure proper escaping: replace already escaped? use simple escape for @ and numbers is safe
			// Re-encode via url.QueryEscape if not already
			if strings.Contains(chatURL, "@") {
				// manually escape @
				chatURL = fmt.Sprintf("https://api.telegram.org/bot%s/getChat?chat_id=%s", token, jsonEscapeQuery(channelID))
			}
			req2, _ := http.NewRequestWithContext(r.Context(), http.MethodGet, chatURL, nil)
			resp2, err := client.Do(req2)
			if err != nil {
				result["ok"] = false
				result["error"] = fmt.Sprintf("getChat error: %v", err)
				writeJSON(w, http.StatusOK, result)
				return
			}
			body2, _ := io.ReadAll(resp2.Body)
			resp2.Body.Close()
			var chatResp struct {
				Ok          bool `json:"ok"`
				Description string `json:"description"`
				Result      struct {
					Title    string `json:"title"`
					Username string `json:"username"`
				} `json:"result"`
			}
			_ = json.Unmarshal(body2, &chatResp)
			if !chatResp.Ok || resp2.StatusCode != 200 {
				msg := chatResp.Description
				if msg == "" {
					msg = strings.TrimSpace(string(body2))
					if msg == "" {
						msg = fmt.Sprintf("getChat failed status %d", resp2.StatusCode)
					}
				}
				result["ok"] = false
				result["error"] = msg
				writeJSON(w, http.StatusOK, result)
				return
			}
			title := chatResp.Result.Title
			if title == "" {
				title = chatResp.Result.Username
			}
			result["chat_title"] = title
			if title == "" {
				// fallback raw
				result["chat_title"] = channelID
			}
		}
		writeJSON(w, http.StatusOK, result)
		return
	case "familyos", "generic":
		baseURL := ""
		for _, k := range []string{"base_url", "baseUrl", "url", "endpoint"} {
			if v, ok := ch.Config[k]; ok {
				s := strings.TrimSpace(fmt.Sprintf("%v", v))
				if s != "" {
					baseURL = s
					break
				}
			}
		}
		if baseURL == "" {
			writeJSON(w, http.StatusOK, map[string]any{"ok": false, "error": "base_url missing"})
			return
		}
		baseURL = strings.TrimRight(baseURL, "/")
		client := &http.Client{Timeout: 5 * time.Second}
		req, _ := http.NewRequestWithContext(r.Context(), http.MethodGet, baseURL, nil)
		if key, ok := ch.Config["api_key"]; ok && fmt.Sprintf("%v", key) != "" {
			req.Header.Set("Authorization", fmt.Sprintf("Bearer %v", key))
			req.Header.Set("X-API-Key", fmt.Sprintf("%v", key))
		} else if key, ok := ch.Config["apiKey"]; ok && fmt.Sprintf("%v", key) != "" {
			req.Header.Set("Authorization", fmt.Sprintf("Bearer %v", key))
			req.Header.Set("X-API-Key", fmt.Sprintf("%v", key))
		}
		resp, err := client.Do(req)
		if err != nil {
			result["error"] = err.Error()
			writeJSON(w, http.StatusOK, result)
			return
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		result["status"] = resp.StatusCode
		if resp.StatusCode < 400 {
			result["ok"] = true
			if len(body) > 0 {
				result["body_snippet"] = string(body)
			}
		} else {
			result["ok"] = false
			result["error"] = fmt.Sprintf("GET %s -> %d", baseURL, resp.StatusCode)
			if len(body) > 0 {
				result["body_snippet"] = string(body)
			}
		}
		writeJSON(w, http.StatusOK, result)
		return
	default:
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "error": "unknown channel type: " + ch.Type})
		return
	}
}

func jsonEscapeQuery(s string) string {
	// minimal escape for telegram chat_id: @ -> %40
	r := strings.ReplaceAll(s, "@", "%40")
	r = strings.ReplaceAll(r, " ", "%20")
	return r
}

// helpers

func toConfigMap(v any) map[string]any {
	if v == nil {
		return nil
	}
	if m, ok := v.(map[string]any); ok {
		return m
	}
	if s, ok := v.(string); ok {
		var m map[string]any
		if err := json.Unmarshal([]byte(s), &m); err == nil {
			return m
		}
		return map[string]any{"value": s}
	}
	b, _ := json.Marshal(v)
	var m map[string]any
	_ = json.Unmarshal(b, &m)
	return m
}

func validateChannelConfig(typ string, cfg map[string]any) error {
	switch typ {
	case "telegram":
		has := false
		for _, k := range []string{"bot_token", "botToken", "token"} {
			if v, ok := cfg[k]; ok && fmt.Sprintf("%v", v) != "" {
				has = true
				break
			}
		}
		if !has {
			return fmt.Errorf("telegram config requires bot_token")
		}
	case "familyos", "generic":
		has := false
		for _, k := range []string{"base_url", "baseUrl", "url"} {
			if v, ok := cfg[k]; ok && fmt.Sprintf("%v", v) != "" {
				has = true
				break
			}
		}
		if !has {
			return fmt.Errorf("%s config requires base_url", typ)
		}
	}
	return nil
}

func sanitizeConfig(cfg map[string]any) map[string]any {
	if cfg == nil {
		return nil
	}
	out := make(map[string]any, len(cfg))
	for k, v := range cfg {
		lk := strings.ToLower(k)
		if strings.Contains(lk, "token") || strings.Contains(lk, "api_key") || strings.Contains(lk, "apikey") || lk == "secret" {
			s := fmt.Sprintf("%v", v)
			if len(s) > 4 {
				out[k] = s[:2] + "***" + s[len(s)-2:]
			} else if s != "" {
				out[k] = "***"
			} else {
				out[k] = v
			}
		} else {
			out[k] = v
		}
	}
	return out
}

var _ = crypto.DecryptJSON
