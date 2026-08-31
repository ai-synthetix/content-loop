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
				token = fmt.Sprintf("%v", v)
				break
			}
		}
		if token == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "telegram bot_token missing"})
			return
		}
		url := fmt.Sprintf("https://api.telegram.org/bot%s/getMe", token)
		client := &http.Client{Timeout: 10 * time.Second}
		req, _ := http.NewRequestWithContext(r.Context(), "GET", url, nil)
		resp, err := client.Do(req)
		if err != nil {
			result["error"] = err.Error()
			writeJSON(w, http.StatusOK, result)
			return
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		var tgResp map[string]any
		_ = json.Unmarshal(body, &tgResp)
		okVal, _ := tgResp["ok"].(bool)
		result["ok"] = okVal && resp.StatusCode == 200
		result["status"] = resp.StatusCode
		result["response"] = tgResp
		if !okVal {
			result["error"] = fmt.Sprintf("telegram getMe failed: %s", string(body))
		}
		writeJSON(w, http.StatusOK, result)
		return
	case "familyos", "generic":
		baseURL := ""
		for _, k := range []string{"base_url", "baseUrl", "url", "endpoint"} {
			if v, ok := ch.Config[k]; ok {
				baseURL = fmt.Sprintf("%v", v)
				break
			}
		}
		if baseURL == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "base_url missing"})
			return
		}
		baseURL = strings.TrimRight(baseURL, "/")
		client := &http.Client{Timeout: 10 * time.Second}
		req, _ := http.NewRequestWithContext(r.Context(), "GET", baseURL, nil)
		if key, ok := ch.Config["api_key"]; ok {
			req.Header.Set("Authorization", fmt.Sprintf("Bearer %v", key))
			req.Header.Set("X-API-Key", fmt.Sprintf("%v", key))
		} else if key, ok := ch.Config["apiKey"]; ok {
			req.Header.Set("Authorization", fmt.Sprintf("Bearer %v", key))
		}
		resp, err := client.Do(req)
		if err != nil {
			result["error"] = err.Error()
			writeJSON(w, http.StatusOK, result)
			return
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		result["ok"] = resp.StatusCode < 400
		result["status"] = resp.StatusCode
		result["body_snippet"] = string(body)
		if resp.StatusCode >= 400 {
			result["error"] = fmt.Sprintf("GET %s -> %d", baseURL, resp.StatusCode)
		}
		writeJSON(w, http.StatusOK, result)
		return
	default:
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "unknown channel type"})
		return
	}
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
