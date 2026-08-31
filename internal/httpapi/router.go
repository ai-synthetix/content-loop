package httpapi

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"

	"github.com/ai-synthetix/content-loop/internal/ai"
	"github.com/ai-synthetix/content-loop/internal/auth"
	"github.com/ai-synthetix/content-loop/internal/domain"
	"github.com/ai-synthetix/content-loop/internal/store"
)

// Server holds state. If Store is nil, falls back to in-memory maps (useful for tests/dev without DB).
type Server struct {
	mu           sync.RWMutex
	projects     map[string]map[string]any
	contentItems map[string]map[string]any
	publications map[string]map[string]any

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
		projects:       make(map[string]map[string]any),
		contentItems:   make(map[string]map[string]any),
		publications:   make(map[string]map[string]any),
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
				r.Get("/{id}/review", s.handleReview)
			})
			r.Route("/publications", func(r chi.Router) {
				r.Get("/", s.listPublications)
				r.Post("/", s.createPublication)
				r.Get("/{id}", s.getPublication)
			})
		})
	})
	return r
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
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
	id := uuid.NewString()
	body["id"] = id
	if s.useDB() {
		owner := ownerID(r)
		body["owner_user_id"] = owner
		marshalJSONFields(body, "channels", "languages", "policy")
		if err := s.Store.Insert("project", body); err != nil {
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
	if s.useDB() {
		owner := ownerID(r)
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
	body["id"] = uuid.NewString()
	if s.useDB() {
		owner := ownerID(r)
		body["owner_user_id"] = owner
		if cid := chi.URLParam(r, "id"); cid != "" {
			body["content_item_id"] = cid
		}
		marshalJSONFields(body, "claims", "sources")
		if err := s.Store.Insert("content_version", body); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
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
		marshalJSONFields(body, "diff")
		if err := s.Store.Insert("approval", body); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
	}
	writeJSON(w, http.StatusCreated, body)
}

// --- publications ---

func (s *Server) listPublications(w http.ResponseWriter, r *http.Request) {
	if s.useDB() {
		owner := ownerID(r)
		items, err := s.Store.List("publication", owner)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": items})
		return
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]map[string]any, 0, len(s.publications))
	for _, v := range s.publications {
		out = append(out, v)
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": out})
}

func (s *Server) createPublication(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body == nil {
		body = map[string]any{}
	}
	id := uuid.NewString()
	body["id"] = id
	if s.useDB() {
		owner := ownerID(r)
		body["owner_user_id"] = owner
		if err := s.Store.Insert("publication", body); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusCreated, body)
		return
	}
	s.mu.Lock()
	s.publications[id] = body
	s.mu.Unlock()
	writeJSON(w, http.StatusCreated, body)
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
