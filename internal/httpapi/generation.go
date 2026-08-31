package httpapi

import (
	"database/sql"
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
	// check item exists early for 404
	if s.Store != nil {
		if _, err := s.Store.Get("content_item", id, owner); err != nil {
			if err == sql.ErrNoRows {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "content_item not found"})
				return
			}
		}
	}
	job, err := s.Gen.GenerateAsync(id, owner)
	if err != nil {
		if err.Error() == "sql: no rows in result set" {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "content_item not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"job_id": job["id"], "job": job})
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

func (s *Server) handleGenerationStatus(w http.ResponseWriter, r *http.Request) {
	if s.Gen == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "generation not configured"})
		return
	}
	id := chi.URLParam(r, "id")
	owner := ownerID(r)
	job, err := s.Gen.GetLatestJobForItem(id, owner)
	if err != nil {
		if err == sql.ErrNoRows {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "no generation job for this item"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, job)
}

func (s *Server) handleGenerationJob(w http.ResponseWriter, r *http.Request) {
	if s.Gen == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "generation not configured"})
		return
	}
	jobID := chi.URLParam(r, "id")
	owner := ownerID(r)
	job, err := s.Gen.GetJob(jobID, owner)
	if err != nil {
		if err == sql.ErrNoRows {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "job not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, job)
}
