package httpapi

import (
	"encoding/json"
	"net/http"
	"sync"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
)

// Server holds in-memory stubs; replace with DB-backed services.
type Server struct {
	mu           sync.RWMutex
	projects     map[string]map[string]any
	contentItems map[string]map[string]any
	publications map[string]map[string]any
}

// NewRouter builds the chi router.
func NewRouter() http.Handler {
	s := &Server{
		projects:     make(map[string]map[string]any),
		contentItems: make(map[string]map[string]any),
		publications: make(map[string]map[string]any),
	}
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Get("/healthz", s.handleHealth)

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
		})
		r.Route("/publications", func(r chi.Router) {
			r.Get("/", s.listPublications)
			r.Post("/", s.createPublication)
			r.Get("/{id}", s.getPublication)
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

// --- projects ---

func (s *Server) listProjects(w http.ResponseWriter, _ *http.Request) {
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
	s.mu.Lock()
	s.projects[id] = body
	s.mu.Unlock()
	writeJSON(w, http.StatusCreated, body)
}

func (s *Server) getProject(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
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
	s.mu.Lock()
	delete(s.projects, id)
	s.mu.Unlock()
	w.WriteHeader(http.StatusNoContent)
}

// --- content-items ---

func (s *Server) listContentItems(w http.ResponseWriter, _ *http.Request) {
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
	s.mu.Lock()
	s.contentItems[id] = body
	s.mu.Unlock()
	writeJSON(w, http.StatusCreated, body)
}

func (s *Server) getContentItem(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
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
	s.mu.Lock()
	delete(s.contentItems, id)
	s.mu.Unlock()
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) listVersions(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"items": []any{}})
}

func (s *Server) createVersion(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body == nil {
		body = map[string]any{}
	}
	body["id"] = uuid.NewString()
	writeJSON(w, http.StatusCreated, body)
}

func (s *Server) listApprovals(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"items": []any{}})
}

func (s *Server) createApproval(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body == nil {
		body = map[string]any{}
	}
	body["id"] = uuid.NewString()
	writeJSON(w, http.StatusCreated, body)
}

// --- publications ---

func (s *Server) listPublications(w http.ResponseWriter, _ *http.Request) {
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
	s.mu.Lock()
	s.publications[id] = body
	s.mu.Unlock()
	writeJSON(w, http.StatusCreated, body)
}

func (s *Server) getPublication(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	s.mu.RLock()
	v, ok := s.publications[id]
	s.mu.RUnlock()
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	writeJSON(w, http.StatusOK, v)
}
