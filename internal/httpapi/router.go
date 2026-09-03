package httpapi

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"

	"github.com/ai-synthetix/content-loop/internal/adapters"
	"github.com/ai-synthetix/content-loop/internal/ai"
	"github.com/ai-synthetix/content-loop/internal/auth"
	"github.com/ai-synthetix/content-loop/internal/domain"
	"github.com/ai-synthetix/content-loop/internal/store"
)

var slugRe = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

func validateSlug(slug string) error {
	if len(slug) < 2 || len(slug) > 80 {
		return jsonError("slug must be 2-80 chars")
	}
	if !slugRe.MatchString(slug) {
		return jsonError("slug must be lowercase alphanumeric with hyphens (e.g. my-project)")
	}
	return nil
}

type jsonError string

func (e jsonError) Error() string { return string(e) }

func normalizeLanguages(v any) string {
	if v == nil {
		return `["ru"]`
	}
	switch val := v.(type) {
	case string:
		var arr []any
		if err := json.Unmarshal([]byte(val), &arr); err == nil {
			return val
		}
		// comma separated string?
		parts := strings.Split(val, ",")
		clean := []string{}
		for _, p := range parts {
			p = strings.TrimSpace(p)
			if p != "" {
				clean = append(clean, p)
			}
		}
		if len(clean) == 0 {
			return `["ru"]`
		}
		b, _ := json.Marshal(clean)
		return string(b)
	case []any:
		if len(val) == 0 {
			return `["ru"]`
		}
		b, _ := json.Marshal(val)
		return string(b)
	case []string:
		if len(val) == 0 {
			return `["ru"]`
		}
		b, _ := json.Marshal(val)
		return string(b)
	default:
		b, _ := json.Marshal(val)
		return string(b)
	}
}

// Server holds state. If Store is nil, falls back to in-memory maps (useful for tests/dev without DB).
type Server struct {
	mu              sync.RWMutex
	projects        map[string]map[string]any
	contentItems    map[string]map[string]any
	publications    map[string]map[string]any
	metricSnapshots map[string]map[string]any
	reflections     map[string]map[string]any
	sources         map[string]map[string]any

	Store          *store.Store
	JWTSecret      string
	GoogleClientID string
	Verifier       *auth.Verifier
	AI             *ai.Provider
	Gen            *domain.GenerationService
}

type Config struct {
	Store          *store.Store
	JWTSecret      string
	GoogleClientID string
	AI             *ai.Provider
}

// NewRouter builds router without auth config (backward compat, unauthenticated).
func NewRouter() http.Handler {
	return NewRouterWithConfig(Config{})
}

func NewRouterWithConfig(cfg Config) http.Handler {
	provider := cfg.AI
	if provider == nil {
		provider = ai.NewFromEnv()
	}
	var gen *domain.GenerationService
	if cfg.Store != nil {
		gen = domain.NewGenerationService(cfg.Store, provider)
	}
	s := &Server{
		projects:        make(map[string]map[string]any),
		contentItems:    make(map[string]map[string]any),
		publications:    make(map[string]map[string]any),
		metricSnapshots: make(map[string]map[string]any),
		reflections:     make(map[string]map[string]any),
		sources:         make(map[string]map[string]any),
		Store:          cfg.Store,
		JWTSecret:      cfg.JWTSecret,
		GoogleClientID: cfg.GoogleClientID,
		Verifier:       &auth.Verifier{ClientID: cfg.GoogleClientID},
		AI:             provider,
		Gen:            gen,
	}
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(180 * time.Second))
	r.Use(rateLimitMiddleware)

	// CORS for local web (3000 -> 8081)
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			origin := req.Header.Get("Origin")
			if origin == "" {
				origin = "*"
			}
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			if req.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, req)
		})
	})

	r.Get("/healthz", s.handleHealth)
	r.Post("/auth/google", s.handleAuthGoogle)
	r.Get("/me", s.handleMe)

	// Protected API
	r.Group(func(r chi.Router) {
		if cfg.JWTSecret != "" {
			r.Use(auth.AuthRequired(cfg.JWTSecret))
		}
		r.Route("/api/v1", func(r chi.Router) {
			r.Route("/projects", func(r chi.Router) {
				r.Get("/", s.listProjects)
				r.Post("/", s.createProject)
				r.Get("/{id}", s.getProject)
				r.Patch("/{id}", s.updateProject)
				r.Delete("/{id}", s.deleteProject)
				r.Route("/{id}/sources", func(r chi.Router) {
					r.Get("/", s.listProjectSources)
					r.Post("/", s.createProjectSource)
					r.Delete("/{sourceId}", s.deleteProjectSource)
				})
				r.Post("/{id}/generate-candidates", s.handleGenerateCandidates)
			})
			r.Route("/content-items", func(r chi.Router) {
				r.Get("/", s.listContentItems)
				r.Post("/", s.createContentItem)
				r.Get("/{id}", s.getContentItem)
				r.Patch("/{id}", s.updateContentItem)
				r.Delete("/{id}", s.deleteContentItem)
				r.Get("/{id}/versions", s.listVersions)
				r.Post("/{id}/versions", s.createVersion)
				r.Get("/{id}/approvals", s.listApprovals)
				r.Post("/{id}/approvals", s.createApproval)
				r.Post("/{id}/brief", s.handleBuildBrief)
				r.Post("/{id}/generate", s.handleGenerate)
				r.Get("/{id}/generation-status", s.handleGenerationStatus)
				r.Get("/{id}/review", s.handleReview)
				r.Post("/{id}/reflections", s.createReflection)
				r.Get("/{id}/reflections", s.listReflectionsForItem)
			})
				r.Route("/generation-jobs", func(r chi.Router) {
					r.Get("/{id}", s.handleGenerationJob)
				})
			r.Route("/publications", func(r chi.Router) {
				r.Get("/", s.listPublications)
				r.Post("/", s.createPublication)
				r.Get("/{id}", s.getPublication)
				r.Post("/{id}/metrics", s.createMetricSnapshot)
				r.Get("/{id}/metrics", s.listMetricsForPublication)
				r.Post("/{id}/metrics/collect", s.collectMetrics)
					})
			r.Route("/metric-snapshots", func(r chi.Router) {
				r.Get("/", s.listMetricSnapshots)
			})
			r.Route("/reflections", func(r chi.Router) {
				r.Get("/", s.listReflections)
			})
			r.Route("/channels", func(r chi.Router) {
				r.Get("/", s.listChannels)
				r.Post("/", s.createChannel)
				r.Get("/{id}", s.getChannel)
				r.Patch("/{id}", s.updateChannel)
				r.Delete("/{id}", s.deleteChannel)
				r.Post("/{id}/test", s.testChannel)
			})
			r.Get("/prompts", s.handleListPrompts)
		})
	})
	return r
}


// rateLimitMiddleware is a stub in-memory per-IP fixed-window rate limiter.
// Allows 120 req/min per IP; returns 429 when exceeded. Production should use Redis.
var (
	rlMu    sync.Mutex
	rlHits  = map[string][]time.Time{}
)

func rateLimitMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// skip healthz
		if r.URL.Path == "/healthz" {
			next.ServeHTTP(w, r)
			return
		}
		ip := r.Header.Get("X-Forwarded-For")
		if ip == "" {
			ip = r.RemoteAddr
		}
		// simple window: 120 req per minute
		now := time.Now()
		window := time.Minute
		limit := 120
		rlMu.Lock()
		hits := rlHits[ip]
		// prune
		fresh := hits[:0]
		for _, t := range hits {
			if now.Sub(t) < window {
				fresh = append(fresh, t)
			}
		}
		hits = fresh
		if len(hits) >= limit {
			rlMu.Unlock()
			log.Printf("[ratelimit] 429 ip=%s path=%s", ip, r.URL.Path)
			writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "rate limit exceeded, try later"})
			return
		}
		hits = append(hits, now)
		rlHits[ip] = hits
		rlMu.Unlock()
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	status := "ok"
	code := http.StatusOK
	dbStatus := "ok"
	if s.Store != nil && s.Store.DB != nil {
		if err := s.Store.DB.PingContext(ctx); err != nil {
			dbStatus = "error: " + err.Error()
			status = "degraded"
			code = http.StatusServiceUnavailable
			log.Printf("[healthz] db ping failed: %v", err)
		}
	} else {
		dbStatus = "no db (in-memory)"
	}
	writeJSON(w, code, map[string]string{"status": status, "db": dbStatus})
}

// POST /auth/google {id_token}
func (s *Server) handleAuthGoogle(w http.ResponseWriter, r *http.Request) {
	var req struct {
		IDToken string `json:"id_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.IDToken == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "id_token required"})
		return
	}
	claims, err := s.Verifier.Verify(r.Context(), req.IDToken)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid google token: " + err.Error()})
		return
	}
	// Get or create user
	userID := ""
	if s.Store != nil {
		uid := uuid.NewString()
		name := &claims.Name
		if claims.Name == "" {
			name = nil
		}
		pic := &claims.Picture
		if claims.Picture == "" {
			pic = nil
		}
		createdID, err := s.Store.GetOrCreateUser(uid, claims.Email, claims.Sub, name, pic)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		userID = createdID
	} else {
		// fallback: use google sub as user id
		userID = claims.Sub
	}
	if s.JWTSecret == "" {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "JWT_SECRET not configured"})
		return
	}
	token, err := auth.Sign(s.JWTSecret, userID, claims.Email, claims.Name, 24*time.Hour)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"token": token,
		"user": map[string]string{
			"id":    userID,
			"email": claims.Email,
			"name":  claims.Name,
		},
	})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	// require auth header manually
	h := r.Header.Get("Authorization")
	if h == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "missing Authorization"})
		return
	}
	// reuse Verify
	const prefix = "Bearer "
	if len(h) <= len(prefix) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid Authorization"})
		return
	}
	tok := h[len(prefix):]
	claims, err := auth.Verify(s.JWTSecret, tok)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid token"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"id":    claims.UserID,
		"email": claims.Email,
		"name":  claims.Name,
	})
}

func ownerID(r *http.Request) string {
	if p, ok := auth.UserFromContext(r.Context()); ok {
		return p.UserID
	}
	return ""
}

// --- helpers for owner-aware store vs memory fallback ---

func (s *Server) useDB() bool { return s.Store != nil && s.Store.DB != nil }

// generic helpers to coerce values for DB insert
func marshalJSONFields(m map[string]any, jsonKeys ...string) {
	for _, k := range jsonKeys {
		if v, ok := m[k]; ok {
			switch v.(type) {
			case string, nil:
				// already string
			default:
				b, _ := json.Marshal(v)
				m[k] = string(b)
			}
		}
	}
}

// --- projects ---

func (s *Server) listProjects(w http.ResponseWriter, r *http.Request) {
	if s.useDB() {
		owner := ownerID(r)
		items, err := s.Store.List("project", owner)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": items})
		return
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]map[string]any, 0, len(s.projects))
	for _, v := range s.projects {
		out = append(out, v)
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": out})
}

func (s *Server) createProject(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body == nil {
		body = map[string]any{}
	}
	// validation
	name, _ := body["name"].(string)
	name = strings.TrimSpace(name)
	if name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name is required"})
		return
	}
	slug, _ := body["slug"].(string)
	slug = strings.TrimSpace(strings.ToLower(slug))
	if slug == "" {
		// auto-generate from name
		slug = strings.ToLower(strings.TrimSpace(name))
		slug = regexp.MustCompile(`[^a-z0-9]+`).ReplaceAllString(slug, "-")
		slug = strings.Trim(slug, "-")
		if slug == "" {
			slug = "project"
		}
		body["slug"] = slug
	}
	if err := validateSlug(slug); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	body["name"] = name
	body["slug"] = slug
	// defaults
	if _, ok := body["languages"]; !ok || body["languages"] == nil {
		body["languages"] = []string{"ru"}
	}
	if _, ok := body["channels"]; !ok {
		body["channels"] = []any{}
	}
	if _, ok := body["policy"]; !ok {
		body["policy"] = map[string]any{}
	}
	// project.context — markdown knowledge base (TEXT NULL, plain string)
	if v, ok := body["context"]; ok && v != nil {
		if s, ok := v.(string); ok {
			body["context"] = s
		} else {
			// coerce non-string (e.g. accidental object) to string
			b, _ := json.Marshal(v)
			// if it was JSON stringified JSON, keep raw if already string-like
			if len(b) > 0 && b[0] == '"' {
				var ss string
				_ = json.Unmarshal(b, &ss)
				body["context"] = ss
			} else {
				body["context"] = string(b)
			}
		}
	}
	// normalize languages to JSON string for DB if needed
	if s.useDB() {
		if langs, ok := body["languages"]; ok && langs != nil {
			if _, isString := langs.(string); !isString {
				// keep as value, Insert will marshal via toDBValue, but normalize to valid JSON array string
				// do nothing, toDBValue will marshal
			}
		}
	}

	id := uuid.NewString()
	body["id"] = id
	if s.useDB() {
		owner := ownerID(r)
		body["owner_user_id"] = owner
		marshalJSONFields(body, "channels", "languages", "policy")
		if err := s.Store.Insert("project", body); err != nil {
			if strings.Contains(err.Error(), "Duplicate") || strings.Contains(err.Error(), "uq_project_slug") {
				writeJSON(w, http.StatusConflict, map[string]string{"error": "slug already exists"})
				return
			}
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusCreated, body)
		return
	}
	s.mu.Lock()
	s.projects[id] = body
	s.mu.Unlock()
	writeJSON(w, http.StatusCreated, body)
}

func (s *Server) getProject(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if s.useDB() {
		owner := ownerID(r)
		v, err := s.Store.Get("project", id, owner)
		if err != nil {
			if err == sql.ErrNoRows {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
				return
			}
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, v)
		return
	}
	s.mu.RLock()
	v, ok := s.projects[id]
	s.mu.RUnlock()
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	writeJSON(w, http.StatusOK, v)
}

func (s *Server) updateProject(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var patch map[string]any
	_ = json.NewDecoder(r.Body).Decode(&patch)
	if patch == nil {
		patch = map[string]any{}
	}
	if nameRaw, ok := patch["name"]; ok {
		if name, _ := nameRaw.(string); strings.TrimSpace(name) == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name cannot be empty"})
			return
		} else {
			patch["name"] = strings.TrimSpace(name)
		}
	}
	if slugRaw, ok := patch["slug"]; ok {
		slug, _ := slugRaw.(string)
		slug = strings.TrimSpace(strings.ToLower(slug))
		if err := validateSlug(slug); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		patch["slug"] = slug
	}
	if s.useDB() {
		owner := ownerID(r)
		// context is TEXT markdown — keep as plain string, do NOT JSON-marshal
		if v, ok := patch["context"]; ok && v != nil {
			if _, isStr := v.(string); !isStr {
				if b, err := json.Marshal(v); err == nil {
					if len(b) > 0 && b[0] == '"' {
						var ss string
						_ = json.Unmarshal(b, &ss)
						patch["context"] = ss
					} else {
						patch["context"] = string(b)
					}
				}
			}
		}
		marshalJSONFields(patch, "channels", "languages", "policy")
		v, err := s.Store.Update("project", id, owner, patch)
		if err != nil {
			if err == sql.ErrNoRows {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
				return
			}
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, v)
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	v, ok := s.projects[id]
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	for k, val := range patch {
		v[k] = val
	}
	writeJSON(w, http.StatusOK, v)
}

func (s *Server) deleteProject(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if s.useDB() {
		owner := ownerID(r)
		if err := s.Store.Delete("project", id, owner); err != nil {
			if err == sql.ErrNoRows {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
				return
			}
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}
	s.mu.Lock()
	delete(s.projects, id)
	s.mu.Unlock()
	w.WriteHeader(http.StatusNoContent)
}

// --- project sources ---
// Deprecated: source entity is kept for backward compat but ignored by generation.
// New code should use project.context (markdown TEXT) as the canonical knowledge base.
// Generation (buildBrief/draftCanonical) now reads project.context via extractProjectContext.

func (s *Server) listProjectSources(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "id")
	owner := ownerID(r)
	if s.useDB() {
		if _, err := s.Store.Get("project", projectID, owner); err != nil {
			if err == sql.ErrNoRows {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "project not found"})
				return
			}
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		// query sources filtered by project_id and owner
		rows, err := s.Store.DB.Queryx(`SELECT * FROM `+"`source`"+` WHERE owner_user_id=? AND project_id=? ORDER BY created_at DESC`, owner, projectID)
		if err != nil {
			// fallback to List+filter if project_id column missing (pre-migration)
			items, lerr := s.Store.List("source", owner)
			if lerr != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			var filtered []map[string]any
			for _, it := range items {
				if fmt.Sprintf("%v", it["project_id"]) == projectID {
					filtered = append(filtered, it)
				}
			}
			if filtered == nil {
				filtered = []map[string]any{}
			}
			writeJSON(w, http.StatusOK, map[string]any{"items": filtered})
			return
		}
		defer rows.Close()
		items := []map[string]any{}
		for rows.Next() {
			m := map[string]any{}
			if err := rows.MapScan(m); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			for k, v := range m {
				if b, ok := v.([]byte); ok {
					m[k] = string(b)
				}
			}
			items = append(items, m)
		}
		if items == nil {
			items = []map[string]any{}
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": items})
		return
	}
	// in-memory fallback
	s.mu.RLock()
	defer s.mu.RUnlock()
	if _, ok := s.projects[projectID]; !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "project not found"})
		return
	}
	var out []map[string]any
	for _, v := range s.sources {
		if fmt.Sprintf("%v", v["project_id"]) == projectID {
			if owner != "" {
				if oid := fmt.Sprintf("%v", v["owner_user_id"]); oid != "" && oid != owner {
					continue
				}
			}
			out = append(out, v)
		}
	}
	if out == nil {
		out = []map[string]any{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": out})
}

func (s *Server) createProjectSource(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "id")
	owner := ownerID(r)
	if s.useDB() {
		if _, err := s.Store.Get("project", projectID, owner); err != nil {
			if err == sql.ErrNoRows {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "project not found"})
				return
			}
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
	}
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	if body == nil {
		body = map[string]any{}
	}
	rawURL, _ := body["url"].(string)
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "url is required"})
		return
	}
	parsed, err := url.Parse(rawURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid url, must be http(s)://..."})
		return
	}
	titleRaw, _ := body["title"].(string)
	titleRaw = strings.TrimSpace(titleRaw)
	var titleAny any
	if titleRaw != "" {
		titleAny = titleRaw
	}
	id := uuid.NewString()
	row := map[string]any{
		"id":            id,
		"url":           rawURL,
		"project_id":    projectID,
		"owner_user_id": owner,
	}
	if titleAny != nil {
		row["title"] = titleAny
	}
	if s.useDB() {
		if err := s.Store.Insert("source", row); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		if v, err := s.Store.Get("source", id, owner); err == nil {
			writeJSON(w, http.StatusCreated, v)
			return
		}
		writeJSON(w, http.StatusCreated, row)
		return
	}
	s.mu.Lock()
	if _, ok := s.projects[projectID]; !ok {
		s.mu.Unlock()
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "project not found"})
		return
	}
	s.sources[id] = row
	s.mu.Unlock()
	writeJSON(w, http.StatusCreated, row)
}

func (s *Server) deleteProjectSource(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "id")
	sourceID := chi.URLParam(r, "sourceId")
	owner := ownerID(r)
	if sourceID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "sourceId required"})
		return
	}
	if s.useDB() {
		if _, err := s.Store.Get("project", projectID, owner); err != nil {
			if err == sql.ErrNoRows {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "project not found"})
				return
			}
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		// ensure source belongs to project and owner
		src, err := s.Store.Get("source", sourceID, owner)
		if err != nil {
			if err == sql.ErrNoRows {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "source not found"})
				return
			}
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		if fmt.Sprintf("%v", src["project_id"]) != projectID {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "source not found in this project"})
			return
		}
		if err := s.Store.Delete("source", sourceID, owner); err != nil {
			if err == sql.ErrNoRows {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "source not found"})
				return
			}
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.projects[projectID]; !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "project not found"})
		return
	}
	src, ok := s.sources[sourceID]
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "source not found"})
		return
	}
	if fmt.Sprintf("%v", src["project_id"]) != projectID {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "source not found in this project"})
		return
	}
	if owner != "" {
		if oid := fmt.Sprintf("%v", src["owner_user_id"]); oid != "" && oid != owner {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "source not found"})
			return
		}
	}
	delete(s.sources, sourceID)
	w.WriteHeader(http.StatusNoContent)
}

// --- content-items ---

func (s *Server) listContentItems(w http.ResponseWriter, r *http.Request) {
	if s.useDB() {
		owner := ownerID(r)
		items, err := s.Store.List("content_item", owner)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": items})
		return
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]map[string]any, 0, len(s.contentItems))
	for _, v := range s.contentItems {
		out = append(out, v)
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": out})
}

func (s *Server) createContentItem(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body == nil {
		body = map[string]any{}
	}
	// validation: title and project_id required
	title, _ := body["title"].(string)
	if strings.TrimSpace(title) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "title is required"})
		return
	}
	projIDRaw, _ := body["project_id"].(string)
	if projIDRaw == "" {
		// also accept projectId camelCase?
		if v, ok := body["projectId"]; ok {
			projIDRaw = strings.TrimSpace(v.(string))
		}
	}
	projIDRaw = strings.TrimSpace(projIDRaw)
	if projIDRaw == "" {
		if v, ok := body["project_id"]; ok && v != nil {
			projIDRaw = strings.TrimSpace(httpParamString(v))
		}
	}
	if projIDRaw == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "project_id is required"})
		return
	}
	// validate project exists and belongs to owner (if DB)
	if s.useDB() {
		owner := ownerID(r)
		if _, err := s.Store.Get("project", projIDRaw, owner); err != nil {
			if err == sql.ErrNoRows {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "project not found or not owned by you"})
				return
			}
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		body["project_id"] = projIDRaw
	} else {
		body["project_id"] = projIDRaw
	}
	if _, ok := body["slug"]; !ok || strings.TrimSpace(httpParamString(body["slug"])) == "" {
		// auto slug from title
		sSlug := strings.ToLower(strings.TrimSpace(title))
		sSlug = regexp.MustCompile(`[^a-z0-9]+`).ReplaceAllString(sSlug, "-")
		sSlug = strings.Trim(sSlug, "-")
		if sSlug == "" {
			sSlug = "untitled"
		}
		if len(sSlug) > 80 {
			sSlug = sSlug[:80]
		}
		body["slug"] = sSlug
	}
	body["title"] = strings.TrimSpace(title)
	id := uuid.NewString()
	body["id"] = id
	if _, ok := body["status"]; !ok {
		body["status"] = "idea"
	}
	if s.useDB() {
		owner := ownerID(r)
		body["owner_user_id"] = owner
		marshalJSONFields(body, "brief")
		if err := s.Store.Insert("content_item", body); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusCreated, body)
		return
	}
	s.mu.Lock()
	s.contentItems[id] = body
	s.mu.Unlock()
	writeJSON(w, http.StatusCreated, body)
}

func httpParamString(v any) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	b, _ := json.Marshal(v)
	return string(b)
}

func (s *Server) getContentItem(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if s.useDB() {
		owner := ownerID(r)
		v, err := s.Store.Get("content_item", id, owner)
		if err != nil {
			if err == sql.ErrNoRows {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
				return
			}
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, v)
		return
	}
	s.mu.RLock()
	v, ok := s.contentItems[id]
	s.mu.RUnlock()
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	writeJSON(w, http.StatusOK, v)
}

func (s *Server) updateContentItem(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var patch map[string]any
	_ = json.NewDecoder(r.Body).Decode(&patch)
	if s.useDB() {
		owner := ownerID(r)
		marshalJSONFields(patch, "brief")
		v, err := s.Store.Update("content_item", id, owner, patch)
		if err != nil {
			if err == sql.ErrNoRows {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
				return
			}
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, v)
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	v, ok := s.contentItems[id]
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	for k, val := range patch {
		v[k] = val
	}
	writeJSON(w, http.StatusOK, v)
}

func (s *Server) deleteContentItem(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if s.useDB() {
		owner := ownerID(r)
		if err := s.Store.Delete("content_item", id, owner); err != nil {
			if err == sql.ErrNoRows {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
				return
			}
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}
	s.mu.Lock()
	delete(s.contentItems, id)
	s.mu.Unlock()
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) listVersions(w http.ResponseWriter, r *http.Request) {
	if s.useDB() {
		owner := ownerID(r)
		// filter versions by owner + content_item_id?
		items, err := s.Store.List("content_version", owner)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		// further filter by content_item_id path param if needed
		cid := chi.URLParam(r, "id")
		var filtered []map[string]any
		for _, it := range items {
			if cid == "" || it["content_item_id"] == cid {
				filtered = append(filtered, it)
			}
		}
		if filtered == nil {
			filtered = []map[string]any{}
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": filtered})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": []any{}})
}

func (s *Server) createVersion(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body == nil {
		body = map[string]any{}
	}
	cid := chi.URLParam(r, "id")
	if cid == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "content_item id required"})
		return
	}
	owner := ownerID(r)
	// Validate owner: content_item must exist and be owned by caller
	if s.useDB() {
		if _, err := s.Store.Get("content_item", cid, owner); err != nil {
			if err == sql.ErrNoRows {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "content_item not found"})
				return
			}
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
	}
	// Extract editable fields
	titleRaw, hasTitle := body["title"]
	bodyMarkdownRaw, hasBody := body["body_markdown"]
	excerptRaw, hasExcerpt := body["excerpt"]
	claimsRaw, hasClaims := body["claims"]

	// Build version row
	newID := uuid.NewString()
	versionRow := map[string]any{
		"id":              newID,
		"content_item_id": cid,
		"owner_user_id":   owner,
		"is_approved":     0,
		"version_no":      1,
	}

	if s.useDB() {
		// compute max version_no +1
		var maxNo sql.NullInt64
		_ = s.Store.DB.Get(&maxNo, `SELECT COALESCE(MAX(version_no),0) FROM content_version WHERE content_item_id=? AND owner_user_id=?`, cid, owner)
		if maxNo.Valid {
			versionRow["version_no"] = int(maxNo.Int64) + 1
		} else {
			versionRow["version_no"] = 1
		}
		// resolve title / body_markdown / excerpt / claims: prefer request, else fallback to latest version
		var latest map[string]any
		rows, err := s.Store.DB.Queryx(`SELECT * FROM content_version WHERE content_item_id=? AND owner_user_id=? ORDER BY version_no DESC LIMIT 1`, cid, owner)
		if err == nil {
			defer rows.Close()
			if rows.Next() {
				latest = map[string]any{}
				_ = rows.MapScan(latest)
				for k, v := range latest {
					if b, ok := v.([]byte); ok {
						latest[k] = string(b)
					}
				}
			}
		}

		// title
		titleStr := strings.TrimSpace(fmt.Sprintf("%v", titleRaw))
		if !hasTitle || titleStr == "" || titleStr == "<nil>" {
			if latest != nil {
				if t, ok := latest["title"].(string); ok && strings.TrimSpace(t) != "" {
					titleStr = t
				} else if t2 := fmt.Sprintf("%v", latest["title"]); t2 != "" && t2 != "<nil>" {
					titleStr = t2
				}
			}
		}
		if strings.TrimSpace(titleStr) == "" || titleStr == "<nil>" {
			// fallback to content_item title
			if ci, err := s.Store.Get("content_item", cid, owner); err == nil {
				if t, ok := ci["title"].(string); ok {
					titleStr = t
				} else {
					titleStr = fmt.Sprintf("%v", ci["title"])
				}
			}
		}
		if strings.TrimSpace(titleStr) == "" || titleStr == "<nil>" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "title is required"})
			return
		}
		versionRow["title"] = strings.TrimSpace(titleStr)

		// body_markdown
		bodyStr := ""
		if hasBody && bodyMarkdownRaw != nil {
			bodyStr = fmt.Sprintf("%v", bodyMarkdownRaw)
			// json decodes body_markdown as string, keep as is; fmt handles it
			if s, ok := bodyMarkdownRaw.(string); ok {
				bodyStr = s
			}
		}
		if bodyStr == "" || bodyStr == "<nil>" {
			if latest != nil {
				if bm, ok := latest["body_markdown"].(string); ok && bm != "" {
					bodyStr = bm
				} else if bm2 := fmt.Sprintf("%v", latest["body_markdown"]); bm2 != "" && bm2 != "<nil>" {
					bodyStr = bm2
				}
			}
		}
		if strings.TrimSpace(bodyStr) == "" || bodyStr == "<nil>" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "body_markdown is required"})
			return
		}
		versionRow["body_markdown"] = bodyStr

		// excerpt: nullable TEXT
		if hasExcerpt {
			if excerptRaw == nil {
				versionRow["excerpt"] = nil
			} else if s, ok := excerptRaw.(string); ok {
				if strings.TrimSpace(s) == "" {
					versionRow["excerpt"] = nil
				} else {
					versionRow["excerpt"] = s
				}
			} else {
				es := fmt.Sprintf("%v", excerptRaw)
				if strings.TrimSpace(es) == "" || es == "<nil>" {
					versionRow["excerpt"] = nil
				} else {
					versionRow["excerpt"] = es
				}
			}
		} else {
			if latest != nil {
				if ex, ok := latest["excerpt"]; ok && ex != nil && fmt.Sprintf("%v", ex) != "" && fmt.Sprintf("%v", ex) != "<nil>" {
					versionRow["excerpt"] = fmt.Sprintf("%v", ex)
				} else {
					versionRow["excerpt"] = nil
				}
			} else {
				versionRow["excerpt"] = nil
			}
		}

		// claims: JSON array
		if hasClaims {
			if claimsRaw == nil {
				versionRow["claims"] = `[]`
			} else {
				switch v := claimsRaw.(type) {
				case string:
					// validate JSON, fallback to marshaling
					var js any
					if err := json.Unmarshal([]byte(v), &js); err == nil {
						versionRow["claims"] = v
					} else {
						b, _ := json.Marshal(claimsRaw)
						versionRow["claims"] = string(b)
					}
				default:
					b, _ := json.Marshal(claimsRaw)
					versionRow["claims"] = string(b)
				}
			}
		} else {
			if latest != nil {
				if c, ok := latest["claims"]; ok && c != nil && fmt.Sprintf("%v", c) != "" && fmt.Sprintf("%v", c) != "<nil>" {
					versionRow["claims"] = fmt.Sprintf("%v", c)
				} else {
					versionRow["claims"] = `[]`
				}
			} else {
				versionRow["claims"] = `[]`
			}
		}
		// preserve sources / prompt / model from latest if present, else defaults
		if latest != nil {
			if src, ok := latest["sources"]; ok && src != nil {
				versionRow["sources"] = fmt.Sprintf("%v", src)
			} else {
				versionRow["sources"] = `[]`
			}
			if p, ok := latest["prompt"]; ok && p != nil {
				versionRow["prompt"] = fmt.Sprintf("%v", p)
			}
			if m, ok := latest["model"]; ok && m != nil {
				versionRow["model"] = fmt.Sprintf("%v", m)
			}
		} else {
			if _, ok := versionRow["sources"]; !ok {
				versionRow["sources"] = `[]`
			}
		}
		// ensure JSON fields are proper strings
		marshalJSONFields(versionRow, "claims", "sources")

		if err := s.Store.Insert("content_version", versionRow); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		// reset content_item status to review_ready
		_, _ = s.Store.Update("content_item", cid, owner, map[string]any{"status": "review_ready"})
		// fetch inserted row for response
		if inserted, err := s.Store.Get("content_version", newID, owner); err == nil {
			versionRow = inserted
		}
		writeJSON(w, http.StatusCreated, versionRow)
		return
	}
	// in-memory fallback: just echo with computed version_no
	versionRow["title"] = fmt.Sprintf("%v", titleRaw)
	if versionRow["title"] == "" || versionRow["title"] == "<nil>" {
		versionRow["title"] = "untitled"
	}
	if hasBody {
		versionRow["body_markdown"] = fmt.Sprintf("%v", bodyMarkdownRaw)
	}
	if hasExcerpt {
		versionRow["excerpt"] = excerptRaw
	}
	if hasClaims {
		versionRow["claims"] = claimsRaw
	}
	body["id"] = newID
	for k, v := range versionRow {
		body[k] = v
	}
	writeJSON(w, http.StatusCreated, body)
}

func (s *Server) listApprovals(w http.ResponseWriter, r *http.Request) {
	if s.useDB() {
		owner := ownerID(r)
		items, err := s.Store.List("approval", owner)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		cid := chi.URLParam(r, "id")
		var filtered []map[string]any
		for _, it := range items {
			if cid == "" || it["content_item_id"] == cid {
				filtered = append(filtered, it)
			}
		}
		if filtered == nil {
			filtered = []map[string]any{}
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": filtered})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": []any{}})
}

func (s *Server) createApproval(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body == nil {
		body = map[string]any{}
	}
	body["id"] = uuid.NewString()
	if s.useDB() {
		owner := ownerID(r)
		body["owner_user_id"] = owner
		if cid := chi.URLParam(r, "id"); cid != "" {
			body["content_item_id"] = cid
		}
		// normalize decision -> status mapping and set required fields
		decisionRaw, _ := body["decision"].(string)
		// also accept decision from body["status"] for backwards compat
		if decisionRaw == "" {
			if v, ok := body["status"].(string); ok {
				decisionRaw = v
			}
		}
		decisionRaw = strings.ToLower(strings.TrimSpace(decisionRaw))
		if decisionRaw == "" {
			decisionRaw = "approved"
		}
		// map alternate spellings
		switch decisionRaw {
		case "approve", "approved":
			decisionRaw = "approved"
		case "reject", "rejected":
			decisionRaw = "rejected"
		case "changes_requested", "changes", "request_changes":
			decisionRaw = "changes_requested"
		}
		body["decision"] = decisionRaw
		// ensure version_id: use latest if not provided
		if body["version_id"] == nil || fmt.Sprintf("%v", body["version_id"]) == "" {
			cid := chi.URLParam(r, "id")
			if cid != "" {
				var latestID string
				_ = s.Store.DB.Get(&latestID, `SELECT id FROM content_version WHERE content_item_id=? AND owner_user_id=? ORDER BY version_no DESC LIMIT 1`, cid, owner)
				if latestID != "" {
					body["version_id"] = latestID
				}
			}
		}
		// set actor from JWT email if available
		if _, ok := body["actor"]; !ok || body["actor"] == "" {
			if claims, ok := auth.UserFromContext(r.Context()); ok && claims.Email != "" {
				body["actor"] = claims.Email
			} else {
				body["actor"] = owner
			}
		}
		marshalJSONFields(body, "diff")
		if err := s.Store.Insert("approval", body); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		// update content_item status to reflect approval decision
		cid := chi.URLParam(r, "id")
		if cid != "" {
			statusMap := map[string]string{
				"approved":          "approved",
				"rejected":          "rejected",
				"changes_requested": "changes_requested",
			}
			if newStatus, ok := statusMap[decisionRaw]; ok {
				_, _ = s.Store.Update("content_item", cid, owner, map[string]any{"status": newStatus})
			}
		}
	}
	writeJSON(w, http.StatusCreated, body)
}

// --- publications ---

func (s *Server) listPublications(w http.ResponseWriter, r *http.Request) {
	filterCID := r.URL.Query().Get("content_item_id")
	if s.useDB() {
		owner := ownerID(r)
		items, err := s.Store.List("publication", owner)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		if filterCID != "" {
			filtered := make([]map[string]any, 0)
			for _, it := range items {
				if fmt.Sprintf("%v", it["content_item_id"]) == filterCID {
					filtered = append(filtered, it)
				}
			}
			if filtered == nil {
				filtered = []map[string]any{}
			}
			items = filtered
		}
		if items == nil {
			items = []map[string]any{}
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": items})
		return
	}
	s.mu.RLock()
	out := make([]map[string]any, 0, len(s.publications))
	for _, v := range s.publications {
		if filterCID != "" && fmt.Sprintf("%v", v["content_item_id"]) != filterCID {
			continue
		}
		out = append(out, v)
	}
	s.mu.RUnlock()
	writeJSON(w, http.StatusOK, map[string]any{"items": out})
}

// helpers for publications

func toStringSlice(v any) []string {
	if v == nil {
		return nil
	}
	switch val := v.(type) {
	case []any:
		out := make([]string, 0, len(val))
		for _, e := range val {
			s := strings.TrimSpace(fmt.Sprintf("%v", e))
			if s != "" && s != "<nil>" {
				out = append(out, s)
			}
		}
		return out
	case []string:
		return val
	case string:
		s := strings.TrimSpace(val)
		if s == "" {
			return nil
		}
		// try JSON array
		var arr []string
		if err := json.Unmarshal([]byte(s), &arr); err == nil {
			return arr
		}
		// comma separated
		if strings.Contains(s, ",") {
			parts := strings.Split(s, ",")
			out := []string{}
			for _, p := range parts {
				p = strings.TrimSpace(p)
				if p != "" {
					out = append(out, p)
				}
			}
			return out
		}
		return []string{s}
	default:
		b, _ := json.Marshal(v)
		var arr []string
		if err := json.Unmarshal(b, &arr); err == nil {
			return arr
		}
		s := strings.TrimSpace(fmt.Sprintf("%v", v))
		if s != "" {
			return []string{s}
		}
		return nil
	}
}

func getStringField(m map[string]any, keys ...string) string {
	for _, k := range keys {
		if v, ok := m[k]; ok && v != nil {
			s := strings.TrimSpace(fmt.Sprintf("%v", v))
			if s != "" && s != "<nil>" {
				return s
			}
		}
	}
	return ""
}

func (s *Server) getLatestApprovedVersion(contentItemID, owner string) (map[string]any, error) {
	// try approved first
	var m map[string]any
	rows, err := s.Store.DB.Queryx(`SELECT * FROM content_version WHERE content_item_id=? AND owner_user_id=? AND is_approved=1 ORDER BY version_no DESC LIMIT 1`, contentItemID, owner)
	if err == nil {
		defer rows.Close()
		if rows.Next() {
			m = map[string]any{}
			if err := rows.MapScan(m); err == nil {
				for k, v := range m {
					if b, ok := v.([]byte); ok {
						m[k] = string(b)
					}
				}
				return m, nil
			}
		}
	}
	// fallback: latest any
	rows2, err := s.Store.DB.Queryx(`SELECT * FROM content_version WHERE content_item_id=? AND owner_user_id=? ORDER BY version_no DESC LIMIT 1`, contentItemID, owner)
	if err != nil {
		return nil, err
	}
	defer rows2.Close()
	if !rows2.Next() {
		return nil, sql.ErrNoRows
	}
	m = map[string]any{}
	if err := rows2.MapScan(m); err != nil {
		return nil, err
	}
	for k, v := range m {
		if b, ok := v.([]byte); ok {
			m[k] = string(b)
		}
	}
	return m, nil
}

func (s *Server) findVariant(contentItemID, channelType string, versionID string, owner string) (map[string]any, error) {
	// try with versionID first
	if versionID != "" {
		rows, err := s.Store.DB.Queryx(`SELECT * FROM channel_variant WHERE content_item_id=? AND channel=? AND content_version_id=? LIMIT 1`, contentItemID, channelType, versionID)
		if err == nil {
			defer rows.Close()
			if rows.Next() {
				m := map[string]any{}
				if err := rows.MapScan(m); err == nil {
					for k, v := range m {
						if b, ok := v.([]byte); ok {
							m[k] = string(b)
						}
					}
					return m, nil
				}
			}
		}
	}
	// also try without owner filter variation: channel_variant may have owner_user_id but we filter by content_item_id+channel only, order by created_at desc
	rows, err := s.Store.DB.Queryx(`SELECT * FROM channel_variant WHERE content_item_id=? AND channel=? ORDER BY created_at DESC LIMIT 1`, contentItemID, channelType)
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
	// optionally verify owner if present
	if owner != "" {
		if oid, ok := m["owner_user_id"]; ok && fmt.Sprintf("%v", oid) != "" && fmt.Sprintf("%v", oid) != owner {
			// still allow if channel_variant owner mismatch? treat as not found hint but return anyway
		}
	}
	return m, nil
}

func (s *Server) getVariantByID(variantID, owner string) (map[string]any, error) {
	rows, err := s.Store.DB.Queryx(`SELECT * FROM channel_variant WHERE id=? LIMIT 1`, variantID)
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
	if owner != "" {
		if oid, ok := m["owner_user_id"]; ok && oid != nil && fmt.Sprintf("%v", oid) != "" && fmt.Sprintf("%v", oid) != owner {
			// if owner mismatch, treat as not found for isolation
			return nil, sql.ErrNoRows
		}
	}
	return m, nil
}

func (s *Server) publicationByIdempotencyKey(owner, key string) (map[string]any, bool) {
	rows, err := s.Store.DB.Queryx(`SELECT * FROM publication WHERE idempotency_key=? AND owner_user_id=? LIMIT 1`, key, owner)
	if err != nil {
		return nil, false
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, false
	}
	m := map[string]any{}
	if err := rows.MapScan(m); err != nil {
		return nil, false
	}
	for k, v := range m {
		if b, ok := v.([]byte); ok {
			m[k] = string(b)
		}
	}
	return m, true
}

func buildPublishPayload(variant map[string]any, version map[string]any, contentItem map[string]any) adapters.PublishPayload {
	p := adapters.PublishPayload{
		Metadata: map[string]string{},
		Raw:      map[string]any{},
	}
	// title
	if version != nil {
		if t, ok := version["title"]; ok {
			p.Title = fmt.Sprintf("%v", t)
		}
		if e, ok := version["excerpt"]; ok && e != nil {
			p.Excerpt = fmt.Sprintf("%v", e)
		}
		if bm, ok := version["body_markdown"]; ok && bm != nil {
			if p.Body == "" {
				p.Body = fmt.Sprintf("%v", bm)
			}
		}
	}
	if p.Title == "" && contentItem != nil {
		if t, ok := contentItem["title"]; ok {
			p.Title = fmt.Sprintf("%v", t)
		}
	}
	if contentItem != nil {
		if s, ok := contentItem["slug"]; ok && s != nil {
			p.Slug = fmt.Sprintf("%v", s)
		}
		if p.Slug == "" {
			if t := p.Title; t != "" {
				p.Slug = strings.ToLower(strings.TrimSpace(t))
				p.Slug = regexp.MustCompile(`[^a-z0-9]+`).ReplaceAllString(p.Slug, "-")
				p.Slug = strings.Trim(p.Slug, "-")
			}
		}
		if loc, ok := contentItem["locale"]; ok && loc != nil && fmt.Sprintf("%v", loc) != "" {
			p.Locale = fmt.Sprintf("%v", loc)
		}
	}
	if p.Locale == "" {
		p.Locale = "ru"
	}
	// variant payload / rendered_body
	if variant != nil {
		if rb, ok := variant["rendered_body"]; ok && rb != nil && fmt.Sprintf("%v", rb) != "" && fmt.Sprintf("%v", rb) != "<nil>" {
			p.Body = fmt.Sprintf("%v", rb)
		}
		var payloadMap map[string]any
		if pv, ok := variant["payload"]; ok && pv != nil {
			s := fmt.Sprintf("%v", pv)
			if s != "" && s != "<nil>" {
				_ = json.Unmarshal([]byte(s), &payloadMap)
				if payloadMap != nil {
					p.Raw = payloadMap
					if p.Body == "" {
						if b, ok := payloadMap["body"]; ok && b != nil {
							p.Body = fmt.Sprintf("%v", b)
						}
					}
					if p.Title == "" {
						if t, ok := payloadMap["title"]; ok {
							p.Title = fmt.Sprintf("%v", t)
						}
					}
					if t, ok := payloadMap["image_url"]; ok && t != nil {
						p.ImageURL = fmt.Sprintf("%v", t)
					}
					if t, ok := payloadMap["imageUrl"]; ok && t != nil && p.ImageURL == "" {
						p.ImageURL = fmt.Sprintf("%v", t)
					}
				}
			}
		}
	}
	if p.Title == "" && variant != nil {
		if ch, ok := variant["channel"]; ok {
			p.Metadata["channel"] = fmt.Sprintf("%v", ch)
		}
	}
	return p
}

func (s *Server) publishWithAdapter(ctx context.Context, pub adapters.Publisher, payload adapters.PublishPayload, idempotencyKey string) (*adapters.PublicationResult, error) {
	if err := pub.Validate(ctx, payload); err != nil {
		return nil, err
	}
	caps := pub.Capabilities()
	if caps.SupportsDraft {
		draft, err := pub.CreateDraft(ctx, payload, idempotencyKey)
		if err != nil {
			return nil, fmt.Errorf("createDraft: %w", err)
		}
		if draft == nil {
			return nil, fmt.Errorf("createDraft returned nil")
		}
		res, err := pub.Publish(ctx, draft.ExternalID, nil)
		if err != nil {
			return nil, fmt.Errorf("publish: %w", err)
		}
		if res == nil {
			return draft, nil
		}
		if res.URL == "" {
			res.URL = draft.URL
		}
		if res.ExternalID == "" {
			res.ExternalID = draft.ExternalID
		}
		if res.Status == "" {
			res.Status = "published"
		}
		return res, nil
	}
	// no draft support: direct publish
	res, err := pub.Publish(ctx, "", nil)
	if err != nil {
		return nil, err
	}
	if res != nil && res.Status == "" {
		res.Status = "published"
	}
	return res, nil
}

func strFromConfig(cfg map[string]any, keys ...string) string {
	for _, k := range keys {
		if v, ok := cfg[k]; ok && v != nil {
			s := fmt.Sprintf("%v", v)
			if s != "" && s != "<nil>" {
				return s
			}
		}
	}
	return ""
}

func telegramSendMessage(ctx context.Context, token, chatID string, payload adapters.PublishPayload) (*adapters.PublicationResult, error) {
	text := strings.TrimSpace(payload.Body)
	if text == "" {
		text = payload.Title
	}
	if text == "" {
		text = "(empty)"
	}
	if len(text) > 4000 {
		text = text[:4000]
	}
	reqBody := map[string]any{"chat_id": chatID, "text": text}
	if strings.Contains(payload.Body, "**") || strings.Contains(payload.Body, "#") {
		reqBody["parse_mode"] = "Markdown"
	}
	b, _ := json.Marshal(reqBody)
	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", token)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("telegram sendMessage failed: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("telegram api %d: %s", resp.StatusCode, string(body))
	}
	var tgResp struct {
		Ok     bool `json:"ok"`
		Result struct {
			MessageID int `json:"message_id"`
			Chat      struct {
				ID       int64  `json:"id"`
				Username string `json:"username"`
			} `json:"chat"`
		} `json:"result"`
		Description string `json:"description"`
	}
	if err := json.Unmarshal(body, &tgResp); err == nil && !tgResp.Ok {
		return nil, fmt.Errorf("telegram not ok: %s (%s)", tgResp.Description, string(body))
	}
	externalID := fmt.Sprintf("%d", tgResp.Result.MessageID)
	if externalID == "0" || externalID == "" {
		externalID = fmt.Sprintf("msg-%d", time.Now().UnixNano())
	}
	urlStr := ""
	if tgResp.Result.Chat.Username != "" {
		urlStr = fmt.Sprintf("https://t.me/%s/%d", tgResp.Result.Chat.Username, tgResp.Result.MessageID)
	} else {
		urlStr = fmt.Sprintf("https://t.me/c/%s/%d", strings.TrimPrefix(chatID, "-100"), tgResp.Result.MessageID)
	}
	return &adapters.PublicationResult{ExternalID: externalID, URL: urlStr, Status: "published"}, nil
}

func (s *Server) getPublisherForVariant(ctx context.Context, owner string, variant map[string]any) (adapters.Publisher, string, error) {
	chType := fmt.Sprintf("%v", variant["channel"])
	if chType == "" || chType == "<nil>" {
		chType = "generic"
	}
	// try to find an existing channel of this type for owner to reuse config
	var channelID string
	_ = s.Store.DB.Get(&channelID, `SELECT id FROM `+"`channel`"+` WHERE owner_user_id=? AND type=? LIMIT 1`, owner, chType)
	if channelID != "" {
		factory := adapters.NewFactory(s.Store)
		pub, err := factory.PublisherForChannel(ctx, channelID, owner)
		if err == nil {
			return pub, chType, nil
		}
	}
	// fallback: synthetic channel
	cfg := map[string]any{}
	if chType == "telegram" {
		cfg = map[string]any{"bot_token": "test-token", "channel_id": "test-channel"}
	} else {
		cfg = map[string]any{"base_url": "https://example.com", "api_key": "test"}
	}
	synth := &store.Channel{ID: "synthetic", Type: chType, Config: cfg, Name: chType}
	pub, err := adapters.PublisherFromChannel(synth)
	if err != nil {
		return nil, chType, err
	}
	return pub, chType, nil
}

func (s *Server) createPublication(w http.ResponseWriter, r *http.Request) {
	if !s.useDB() {
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body == nil {
			body = map[string]any{}
		}
		id := uuid.NewString()
		body["id"] = id
		s.mu.Lock()
		s.publications[id] = body
		s.mu.Unlock()
		writeJSON(w, http.StatusCreated, body)
		return
	}
	owner := ownerID(r)
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	if body == nil {
		body = map[string]any{}
	}
	contentItemID := getStringField(body, "content_item_id", "contentItemId", "contentItemID")
	if contentItemID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "content_item_id is required"})
		return
	}
	item, err := s.Store.Get("content_item", contentItemID, owner)
	if err != nil {
		if err == sql.ErrNoRows {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "content_item not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	status := fmt.Sprintf("%v", item["status"])
	if status != "approved" {
		writeJSON(w, http.StatusConflict, map[string]string{"error": fmt.Sprintf("content_item not approved, status=%s", status)})
		return
	}
	// parse ids
	channelIDs := toStringSlice(body["channel_ids"])
	if len(channelIDs) == 0 {
		channelIDs = toStringSlice(body["channelIds"])
	}
	if len(channelIDs) == 0 {
		if v := getStringField(body, "channel_id"); v != "" {
			channelIDs = []string{v}
		}
	}
	variantIDs := toStringSlice(body["channel_variant_ids"])
	if len(variantIDs) == 0 {
		variantIDs = toStringSlice(body["channelVariantIds"])
	}
	if len(variantIDs) == 0 {
		variantIDs = toStringSlice(body["variant_ids"])
	}
	singleVariantID := getStringField(body, "channel_variant_id", "channelVariantId", "variant_id")
	adapterOverride := getStringField(body, "adapter", "channel")
	providedKey := getStringField(body, "idempotency_key", "idempotencyKey")

	// Determine mode
	isBulk := false
	if len(channelIDs) > 0 || len(variantIDs) > 0 {
		isBulk = true
	} else if singleVariantID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "channel_ids or channel_variant_ids or channel_variant_id is required"})
		return
	}

	// Normalize single variant into slice for unified handling if no bulk arrays
	if !isBulk && singleVariantID != "" {
		variantIDs = []string{singleVariantID}
		isBulk = false
	}

	ctx := r.Context()

	// helper to handle idempotency + publish for a resolved variant
	type pending struct {
		channelID string
		channelType string
		variant   map[string]any
		adapter   string
	}

	var pendings []pending

	if len(channelIDs) > 0 {
		// channel flow
		// load latest approved version once
		ver, err := s.getLatestApprovedVersion(contentItemID, owner)
		if err != nil {
			if err == sql.ErrNoRows {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "no content version found; generate first"})
				return
			}
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		versionID := fmt.Sprintf("%v", ver["id"])
		for _, chID := range channelIDs {
			ch, err := s.Store.GetChannel(chID, owner)
			if err != nil {
				if err == sql.ErrNoRows {
					writeJSON(w, http.StatusNotFound, map[string]string{"error": fmt.Sprintf("channel %s not found", chID)})
					return
				}
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			variant, err := s.findVariant(contentItemID, ch.Type, versionID, owner)
			if err != nil {
				if err == sql.ErrNoRows {
					writeJSON(w, http.StatusBadRequest, map[string]any{"error": fmt.Sprintf("no channel_variant for channel %s (type=%s)", chID, ch.Type), "hint": "generate variants for this content_item and channel first"})
					return
				}
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			vid := fmt.Sprintf("%v", variant["id"])
			pendings = append(pendings, pending{channelID: chID, channelType: ch.Type, variant: variant, adapter: ch.Type})
			_ = vid
			_ = ver
		}
	} else if len(variantIDs) > 0 {
		for _, vid := range variantIDs {
			variant, err := s.getVariantByID(vid, owner)
			if err != nil {
				if err == sql.ErrNoRows {
					writeJSON(w, http.StatusNotFound, map[string]string{"error": fmt.Sprintf("channel_variant %s not found", vid)})
					return
				}
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			if fmt.Sprintf("%v", variant["content_item_id"]) != contentItemID {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("channel_variant %s does not belong to content_item %s", vid, contentItemID)})
				return
			}
			adapter := adapterOverride
			if adapter == "" {
				adapter = fmt.Sprintf("%v", variant["channel"])
			}
			if adapter == "" || adapter == "<nil>" {
				adapter = "generic"
			}
			pendings = append(pendings, pending{channelID: "", channelType: adapter, variant: variant, adapter: adapter})
		}
	}

	// Now process each pending: idempotency check, publish, insert
	var results []map[string]any
	hasNew := false
	for _, p := range pendings {
		variant := p.variant
		variantID := fmt.Sprintf("%v", variant["id"])
		// idempotency key
		key := providedKey
		if key == "" || len(pendings) > 1 {
			// generate per-item if bulk or not provided
			if p.channelID != "" {
				key = fmt.Sprintf("%s:%s:%s", contentItemID, p.channelID, variantID)
			} else {
				key = fmt.Sprintf("%s:%s:%s", contentItemID, p.adapter, variantID)
			}
			// if single bulk gap and providedKey was for single, keep providedKey for first? but spec says generate if not provided
			// If providedKey given and single pending, keep it
			if providedKey != "" && len(pendings) == 1 {
				key = providedKey
			}
		}
		if existing, ok := s.publicationByIdempotencyKey(owner, key); ok {
			results = append(results, existing)
			continue
		}
		// build payload
		verForPayload, _ := s.getLatestApprovedVersion(contentItemID, owner)
		// try to get version matching variant's content_version_id for accuracy
		if cvid, ok := variant["content_version_id"]; ok && fmt.Sprintf("%v", cvid) != "" {
			if m, err := s.Store.Get("content_version", fmt.Sprintf("%v", cvid), owner); err == nil {
				verForPayload = m
			}
		}
		payload := buildPublishPayload(variant, verForPayload, item)

		var pub adapters.Publisher
		if p.channelID != "" {
			factory := adapters.NewFactory(s.Store)
			var err error
			pub, err = factory.PublisherForChannel(ctx, p.channelID, owner)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": fmt.Sprintf("publisher for channel %s: %v", p.channelID, err)})
				return
			}
		} else {
			var err error
			var chType string
			pub, chType, err = s.getPublisherForVariant(ctx, owner, variant)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			_ = chType
		}
			res, err := s.publishWithAdapter(ctx, pub, payload, key)
			if p.adapter == "telegram" && p.channelID != "" {
				// try real Telegram send directly using channel config
				if ch, cerr := s.Store.GetChannel(p.channelID, owner); cerr == nil && ch != nil {
					if token := strFromConfig(ch.Config, "bot_token", "botToken", "token"); token != "" {
						if chatID := strFromConfig(ch.Config, "channel_id", "channelId", "chat_id", "chatId"); chatID != "" {
							if realRes, rerr := telegramSendMessage(ctx, token, chatID, payload); rerr == nil && realRes != nil {
								res = realRes
								err = nil
							} else if rerr != nil {
								// surface Telegram error instead of mock
								writeJSON(w, http.StatusBadGateway, map[string]string{"error": fmt.Sprintf("telegram: %v", rerr)})
								return
							}
						}
					}
				}
			}
			if err != nil {
			// validation errors -> 400
			if strings.Contains(err.Error(), "required") || strings.Contains(err.Error(), "validate") {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		if res == nil {
			res = &adapters.PublicationResult{ExternalID: "mock-" + uuid.NewString(), URL: "https://example.com/mock", Status: "published"}
		}
		nowStr := time.Now().UTC().Format("2006-01-02 15:04:05.000")
		pubID := uuid.NewString()
		row := map[string]any{
			"id":                 pubID,
			"owner_user_id":      owner,
			"content_item_id":    contentItemID,
			"channel_variant_id": variantID,
			"adapter":            p.adapter,
			"external_id":        res.ExternalID,
			"url":                res.URL,
			"status":             "published",
			"idempotency_key":    key,
			"published_at":       nowStr,
		}
		err = s.Store.Insert("publication", row)
		if err != nil {
			if strings.Contains(err.Error(), "Duplicate") || strings.Contains(err.Error(), "uq_publication") {
				if existing, ok := s.publicationByIdempotencyKey(owner, key); ok {
					results = append(results, existing)
					continue
				}
			}
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		hasNew = true
		// fetch inserted to return with timestamps
		if fetched, err := s.Store.Get("publication", pubID, owner); err == nil {
			results = append(results, fetched)
		} else {
			results = append(results, row)
		}
	}

	// sync content_item status to published after successful publish
	if hasNew {
		_, _ = s.Store.Update("content_item", contentItemID, owner, map[string]any{"status": "published"})
	}

	if len(results) == 1 && !isBulk {
		if !hasNew {
			writeJSON(w, http.StatusOK, results[0])
			return
		}
		writeJSON(w, http.StatusCreated, results[0])
		return
	}
	if !hasNew {
		writeJSON(w, http.StatusOK, map[string]any{"items": results})
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"items": results})
}

func (s *Server) getPublication(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if s.useDB() {
		owner := ownerID(r)
		v, err := s.Store.Get("publication", id, owner)
		if err != nil {
			if err == sql.ErrNoRows {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
				return
			}
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, v)
		return
	}
	s.mu.RLock()
	v, ok := s.publications[id]
	s.mu.RUnlock()
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	writeJSON(w, http.StatusOK, v)
}

// --- metric snapshots ---

func (s *Server) createMetricSnapshot(w http.ResponseWriter, r *http.Request) {
	pubID := chi.URLParam(r, "id")
	if pubID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "publication id required"})
		return
	}
	owner := ownerID(r)
	// owner check: publication must exist and belong to caller
	if s.useDB() {
		if _, err := s.Store.Get("publication", pubID, owner); err != nil {
			if err == sql.ErrNoRows {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "publication not found"})
				return
			}
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
	} else {
		s.mu.RLock()
		pub, ok := s.publications[pubID]
		s.mu.RUnlock()
		if !ok {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "publication not found"})
			return
		}
		if owner != "" {
			if oid, _ := pub["owner_user_id"].(string); oid != "" && oid != owner {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "publication not found"})
				return
			}
		}
	}
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	if body == nil {
		body = map[string]any{}
	}
	metricsVal, ok := body["metrics"]
	if !ok || metricsVal == nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "metrics is required"})
		return
	}
	// captured_at optional
	var capturedAt time.Time
	if raw, ok := body["captured_at"]; ok && raw != nil && fmt.Sprintf("%v", raw) != "" {
		sv := fmt.Sprintf("%v", raw)
		// try RFC3339 and variants, also MySQL DATETIME
		if t, err := time.Parse(time.RFC3339Nano, sv); err == nil {
			capturedAt = t
		} else if t, err := time.Parse(time.RFC3339, sv); err == nil {
			capturedAt = t
		} else if t, err := time.Parse("2006-01-02 15:04:05", sv); err == nil {
			capturedAt = t
		} else if t, err := time.Parse("2006-01-02T15:04:05", sv); err == nil {
			capturedAt = t
		} else {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid captured_at, expected RFC3339"})
			return
		}
	} else {
		capturedAt = time.Now().UTC()
	}
	metricsJSON, err := json.Marshal(metricsVal)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid metrics"})
		return
	}
	id := uuid.NewString()
	row := map[string]any{
		"id":             id,
		"publication_id": pubID,
		"owner_user_id":  owner,
		"metrics":        string(metricsJSON),
		"captured_at":    capturedAt.Format("2006-01-02 15:04:05.000"),
	}
	if s.useDB() {
		if err := s.Store.Insert("metric_snapshot", row); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		// fetch inserted to return with DB defaults
		if v, err := s.Store.Get("metric_snapshot", id, owner); err == nil {
			writeJSON(w, http.StatusCreated, v)
			return
		}
		writeJSON(w, http.StatusCreated, row)
		return
	}
	s.mu.Lock()
	s.metricSnapshots[id] = row
	s.mu.Unlock()
	writeJSON(w, http.StatusCreated, row)
}

func (s *Server) listMetricsForPublication(w http.ResponseWriter, r *http.Request) {
	pubID := chi.URLParam(r, "id")
	owner := ownerID(r)
	if s.useDB() {
		if _, err := s.Store.Get("publication", pubID, owner); err != nil {
			if err == sql.ErrNoRows {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "publication not found"})
				return
			}
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		items, err := s.Store.List("metric_snapshot", owner)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		var filtered []map[string]any
		for _, it := range items {
			if fmt.Sprintf("%v", it["publication_id"]) == pubID {
				filtered = append(filtered, it)
			}
		}
		if filtered == nil {
			filtered = []map[string]any{}
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": filtered})
		return
	}
	// in-memory
	if _, ok := s.publications[pubID]; !ok {
		// allow if not found but still return empty? return 404 for consistency
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "publication not found"})
		return
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	var filtered []map[string]any
	for _, v := range s.metricSnapshots {
		if fmt.Sprintf("%v", v["publication_id"]) == pubID {
			if owner != "" {
				if oid := fmt.Sprintf("%v", v["owner_user_id"]); oid != owner && oid != "" {
					continue
				}
			}
			filtered = append(filtered, v)
		}
	}
	if filtered == nil {
		filtered = []map[string]any{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": filtered})
}

func (s *Server) listMetricSnapshots(w http.ResponseWriter, r *http.Request) {
	owner := ownerID(r)
	pubID := r.URL.Query().Get("publication_id")
	if s.useDB() {
		items, err := s.Store.List("metric_snapshot", owner)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		if pubID != "" {
			var filtered []map[string]any
			for _, it := range items {
				if fmt.Sprintf("%v", it["publication_id"]) == pubID {
					filtered = append(filtered, it)
				}
			}
			if filtered == nil {
				filtered = []map[string]any{}
			}
			writeJSON(w, http.StatusOK, map[string]any{"items": filtered})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": items})
		return
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []map[string]any
	for _, v := range s.metricSnapshots {
		if owner != "" {
			if oid := fmt.Sprintf("%v", v["owner_user_id"]); oid != owner && oid != "" {
				continue
			}
		}
		if pubID != "" && fmt.Sprintf("%v", v["publication_id"]) != pubID {
			continue
		}
		out = append(out, v)
	}
	if out == nil {
		out = []map[string]any{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": out})
}

// --- reflections ---

func normalizeConfidence(s string) (string, bool) {
	s = strings.ToLower(strings.TrimSpace(s))
	switch s {
	case "low":
		return "low", true
	case "med", "medium":
		return "medium", true
	case "high":
		return "high", true
	default:
		return "", false
	}
}

func (s *Server) createReflection(w http.ResponseWriter, r *http.Request) {
	contentItemID := chi.URLParam(r, "id")
	if contentItemID == "" {
		// fallback when mounted as /content-items/{id}/reflections chi param may include braces
		contentItemID = r.URL.Query().Get("content_item_id")
	}
	if contentItemID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "content_item id required"})
		return
	}
	owner := ownerID(r)
	if s.useDB() {
		if _, err := s.Store.Get("content_item", contentItemID, owner); err != nil {
			if err == sql.ErrNoRows {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "content_item not found"})
				return
			}
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
	} else {
		s.mu.RLock()
		_, ok := s.contentItems[contentItemID]
		s.mu.RUnlock()
		if !ok {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "content_item not found"})
			return
		}
	}
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	if body == nil {
		body = map[string]any{}
	}
	obs, _ := body["observation"].(string)
	obs = strings.TrimSpace(obs)
	if obs == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "observation is required"})
		return
	}
	confRaw := fmt.Sprintf("%v", body["confidence"])
	if confRaw == "" || confRaw == "<nil>" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "confidence is required (low|medium|high)"})
		return
	}
	conf, ok := normalizeConfidence(confRaw)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "confidence must be low|medium|high (med allowed)"})
		return
	}
	// possible_causes optional JSON array
	var causesJSON string
	if v, ok := body["possible_causes"]; ok && v != nil {
		b, _ := json.Marshal(v)
		causesJSON = string(b)
	} else if v, ok := body["possibleCauses"]; ok && v != nil {
		b, _ := json.Marshal(v)
		causesJSON = string(b)
	}
	nextTest, _ := body["next_test"].(string)
	if nextTest == "" {
		if v, ok := body["nextTest"]; ok {
			nextTest = fmt.Sprintf("%v", v)
			if nextTest == "<nil>" {
				nextTest = ""
			}
		}
	}
	doNotConclude, _ := body["do_not_conclude"].(string)
	if doNotConclude == "" {
		if v, ok := body["doNotConclude"]; ok {
			doNotConclude = fmt.Sprintf("%v", v)
			if doNotConclude == "<nil>" {
				doNotConclude = ""
			}
		}
	}
	id := uuid.NewString()
	row := map[string]any{
		"id":              id,
		"content_item_id": contentItemID,
		"owner_user_id":   owner,
		"observation":     obs,
		"confidence":      conf,
	}
	if causesJSON != "" && causesJSON != "null" {
		row["possible_causes"] = causesJSON
	}
	if strings.TrimSpace(nextTest) != "" {
		row["next_test"] = strings.TrimSpace(nextTest)
	}
	if strings.TrimSpace(doNotConclude) != "" {
		row["do_not_conclude"] = strings.TrimSpace(doNotConclude)
	}
	if s.useDB() {
		if err := s.Store.Insert("reflection", row); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		if v, err := s.Store.Get("reflection", id, owner); err == nil {
			writeJSON(w, http.StatusCreated, v)
			return
		}
		writeJSON(w, http.StatusCreated, row)
		return
	}
	s.mu.Lock()
	s.reflections[id] = row
	s.mu.Unlock()
	writeJSON(w, http.StatusCreated, row)
}

func (s *Server) listReflectionsForItem(w http.ResponseWriter, r *http.Request) {
	contentItemID := chi.URLParam(r, "id")
	owner := ownerID(r)
	if s.useDB() {
		if _, err := s.Store.Get("content_item", contentItemID, owner); err != nil {
			if err == sql.ErrNoRows {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "content_item not found"})
				return
			}
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		items, err := s.Store.List("reflection", owner)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		var filtered []map[string]any
		for _, it := range items {
			if fmt.Sprintf("%v", it["content_item_id"]) == contentItemID {
				filtered = append(filtered, it)
			}
		}
		if filtered == nil {
			filtered = []map[string]any{}
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": filtered})
		return
	}
	// memory
	s.mu.RLock()
	_, ok := s.contentItems[contentItemID]
	s.mu.RUnlock()
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "content_item not found"})
		return
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	var filtered []map[string]any
	for _, v := range s.reflections {
		if fmt.Sprintf("%v", v["content_item_id"]) == contentItemID {
			if owner != "" {
				if oid := fmt.Sprintf("%v", v["owner_user_id"]); oid != owner && oid != "" {
					continue
				}
			}
			filtered = append(filtered, v)
		}
	}
	if filtered == nil {
		filtered = []map[string]any{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": filtered})
}

func (s *Server) listReflections(w http.ResponseWriter, r *http.Request) {
	owner := ownerID(r)
	cid := r.URL.Query().Get("content_item_id")
	if s.useDB() {
		items, err := s.Store.List("reflection", owner)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		if cid != "" {
			var filtered []map[string]any
			for _, it := range items {
				if fmt.Sprintf("%v", it["content_item_id"]) == cid {
					filtered = append(filtered, it)
				}
			}
			if filtered == nil {
				filtered = []map[string]any{}
			}
			writeJSON(w, http.StatusOK, map[string]any{"items": filtered})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": items})
		return
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []map[string]any
	for _, v := range s.reflections {
		if owner != "" {
			if oid := fmt.Sprintf("%v", v["owner_user_id"]); oid != owner && oid != "" {
				continue
			}
		}
		if cid != "" && fmt.Sprintf("%v", v["content_item_id"]) != cid {
			continue
		}
		out = append(out, v)
	}
	if out == nil {
		out = []map[string]any{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": out})
}

