package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

func (s *Server) handleBuildBrief(w http.ResponseWriter, r *http.Request) {
	if s.Gen == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "generation not configured (DB required)"})
		return
	}
	id := chi.URLParam(r, "id")
	owner := ownerID(r)
	brief, err := s.Gen.BuildBriefOnly(r.Context(), id, owner)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"brief": brief})
}

func (s *Server) handleGenerate(w http.ResponseWriter, r *http.Request) {
	if s.Gen == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "generation not configured (DB required)"})
		return
	}
	id := chi.URLParam(r, "id")
	owner := ownerID(r)
	res, err := s.Gen.Generate(r.Context(), id, owner)
	if err != nil {
		// map sql.ErrNoRows to 404
		if err.Error() == "sql: no rows in result set" {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "content_item not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) handleReview(w http.ResponseWriter, r *http.Request) {
	if s.Gen == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "generation not configured (DB required)"})
		return
	}
	id := chi.URLParam(r, "id")
	owner := ownerID(r)
	bundle, err := s.Gen.PrepareReview(id, owner)
	if err != nil {
		if err.Error() == "sql: no rows in result set" {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, bundle)
}
