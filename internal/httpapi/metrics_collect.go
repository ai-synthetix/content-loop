package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/ai-synthetix/content-loop/internal/adapters"
)

// collectMetrics handles POST /api/v1/publications/{id}/metrics/collect
func (s *Server) collectMetrics(w http.ResponseWriter, r *http.Request) {
	pubID := chi.URLParam(r, "id")
	if pubID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "publication id required"})
		return
	}
	owner := ownerID(r)

	// parse optional milestone from body (may be empty for manual)
	var reqBody map[string]any
	_ = json.NewDecoder(r.Body).Decode(&reqBody)
	milestone := ""
	if reqBody != nil {
		if v, ok := reqBody["milestone"]; ok && v != nil {
			milestone = strings.TrimSpace(fmt.Sprintf("%v", v))
		}
	}
	// validate milestone if provided
	if milestone != "" && milestone != "3h" && milestone != "24h" && milestone != "7d" && milestone != "168h" {
		// normalize 168h -> 7d
		if milestone == "168h" {
			milestone = "7d"
		} else {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid milestone, expected 3h, 24h, 7d"})
			return
		}
	}
	if milestone == "168h" {
		milestone = "7d"
	}

	result, err := s.doCollect(r.Context(), pubID, owner, milestone)
	if err != nil {
		if err == sql.ErrNoRows {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "publication not found"})
			return
		}
		// surface publisher errors as 502 or 500
		if strings.Contains(err.Error(), "not found") {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, result)
}

// doCollect loads publication, finds channel via channel_variant, gets publisher via Factory, calls FetchMetrics, inserts metric_snapshot.
func (s *Server) doCollect(ctx context.Context, pubID, owner, milestone string) (map[string]any, error) {
	// Load publication
	var pub map[string]any
	if s.useDB() {
		var err error
		pub, err = s.Store.Get("publication", pubID, owner)
		if err != nil {
			return nil, err
		}
	} else {
		s.mu.RLock()
		p, ok := s.publications[pubID]
		s.mu.RUnlock()
		if !ok {
			return nil, sql.ErrNoRows
		}
		if owner != "" {
			if oid, _ := p["owner_user_id"].(string); oid != "" && oid != owner {
				return nil, sql.ErrNoRows
			}
		}
		pub = p
	}

	// Find channel via channel_variant
	variantID := fmt.Sprintf("%v", pub["channel_variant_id"])
	if variantID == "" || variantID == "<nil>" {
		return nil, fmt.Errorf("publication has no channel_variant_id")
	}
	var variant map[string]any
	var err error
	if s.useDB() {
		variant, err = s.getVariantByID(variantID, owner)
		if err != nil {
			return nil, fmt.Errorf("channel_variant %s not found: %w", variantID, err)
		}
	} else {
		// in-memory fallback: use variantID as channel type hint
		variant = map[string]any{"id": variantID, "channel": "telegram"}
	}

	// Get publisher via Factory
	publisher, _, err := s.getPublisherForVariant(ctx, owner, variant)
	if err != nil {
		return nil, fmt.Errorf("publisher: %w", err)
	}

	// Determine externalID and since
	externalID := fmt.Sprintf("%v", pub["external_id"])
	if externalID == "" || externalID == "<nil>" {
		externalID = pubID
	}
	var since *time.Time
	if pa, ok := pub["published_at"]; ok && pa != nil {
		sv := fmt.Sprintf("%v", pa)
		if sv != "" && sv != "<nil>" {
			// try multiple layouts
			if t, err := time.Parse("2006-01-02 15:04:05.000", sv); err == nil {
				since = &t
			} else if t, err := time.Parse("2006-01-02 15:04:05", sv); err == nil {
				since = &t
			} else if t, err := time.Parse(time.RFC3339Nano, sv); err == nil {
				since = &t
			} else if t, err := time.Parse(time.RFC3339, sv); err == nil {
				since = &t
			}
		}
	}

	// Fetch metrics
	metrics, err := publisher.FetchMetrics(ctx, externalID, since)
	if err != nil {
		return nil, fmt.Errorf("FetchMetrics: %w", err)
	}
	if metrics == nil {
		return nil, fmt.Errorf("FetchMetrics returned nil")
	}
	if metrics.Extra == nil {
		metrics.Extra = map[string]any{}
	}
	if milestone != "" {
		metrics.Extra["milestone"] = milestone
	} else {
		metrics.Extra["manual"] = true
	}
	// Ensure CapturedAt is now (override if zero)
	if metrics.CapturedAt.IsZero() {
		metrics.CapturedAt = time.Now().UTC()
	} else {
		// still use now for captured_at column as per spec
		metrics.CapturedAt = time.Now().UTC()
	}

	metricsJSON, err := json.Marshal(metrics)
	if err != nil {
		return nil, err
	}
	capturedAtStr := metrics.CapturedAt.UTC().Format("2006-01-02 15:04:05.000")
	if capturedAtStr == "" {
		capturedAtStr = time.Now().UTC().Format("2006-01-02 15:04:05.000")
	}

	id := uuid.NewString()
	row := map[string]any{
		"id":             id,
		"publication_id": pubID,
		"owner_user_id":  owner,
		"metrics":        string(metricsJSON),
		"captured_at":    capturedAtStr,
	}

	if s.useDB() {
		if err := s.Store.Insert("metric_snapshot", row); err != nil {
			return nil, err
		}
		if v, err := s.Store.Get("metric_snapshot", id, owner); err == nil {
			return v, nil
		}
		return row, nil
	}
	s.mu.Lock()
	s.metricSnapshots[id] = row
	s.mu.Unlock()
	return row, nil
}

// StartMetricsScheduler starts a background goroutine that every 5m checks for due milestones.
func (s *Server) StartMetricsScheduler(ctx context.Context) {
	if s.Store == nil || s.Store.DB == nil {
		log.Printf("[metrics-scheduler] no DB, scheduler disabled")
		return
	}
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		// initial run after 10s to allow startup
		select {
		case <-time.After(10 * time.Second):
			s.runMetricsSchedulerOnce(ctx)
		case <-ctx.Done():
			return
		}
		for {
			select {
			case <-ticker.C:
				s.runMetricsSchedulerOnce(ctx)
			case <-ctx.Done():
				return
			}
		}
	}()
}

func (s *Server) runMetricsSchedulerOnce(ctx context.Context) {
	if s.Store == nil || s.Store.DB == nil {
		return
	}
	// milestones: 3h, 24h, 168h (7d)
	type milestone struct {
		dur time.Duration
		tag string
	}
	milestones := []milestone{
		{3 * time.Hour, "3h"},
		{24 * time.Hour, "24h"},
		{168 * time.Hour, "7d"},
	}

	// Query publications where status=published and published_at is not null
	rows, err := s.Store.DB.Queryx(`SELECT id, owner_user_id, channel_variant_id, external_id, published_at FROM publication WHERE status='published' AND published_at IS NOT NULL`)
	if err != nil {
		log.Printf("[metrics-scheduler] query publications failed: %v", err)
		return
	}
	defer rows.Close()

	type pubRow struct {
		ID               string  `db:"id"`
		OwnerUserID      string  `db:"owner_user_id"`
		ChannelVariantID *string `db:"channel_variant_id"`
		ExternalID       *string `db:"external_id"`
		PublishedAt      *time.Time `db:"published_at"`
	}
	var pubs []pubRow
	for rows.Next() {
		var pr pubRow
		if err := rows.StructScan(&pr); err != nil {
			// fallback to MapScan
			continue
		}
		pubs = append(pubs, pr)
	}

	now := time.Now()
	for _, pr := range pubs {
		if pr.PublishedAt == nil {
			continue
		}
		age := now.Sub(*pr.PublishedAt)
		for _, m := range milestones {
			if age < m.dur {
				continue
			}
			// check if snapshot with milestone tag already exists
			var count int
			// Use JSON_UNQUOTE(JSON_EXTRACT(metrics,'$.extra.milestone')) = ?
			err := s.Store.DB.Get(&count, `SELECT COUNT(*) FROM metric_snapshot WHERE publication_id=? AND JSON_UNQUOTE(JSON_EXTRACT(metrics, '$.extra.milestone')) = ?`, pr.ID, m.tag)
			if err != nil {
				log.Printf("[metrics-scheduler] milestone check failed for %s %s: %v", pr.ID, m.tag, err)
				continue
			}
			if count > 0 {
				continue
			}
			// need to auto-collect
			owner := pr.OwnerUserID
			// call doCollect with milestone
			_, err = s.doCollect(ctx, pr.ID, owner, m.tag)
			if err != nil {
				log.Printf("[metrics-scheduler] collect %s milestone %s failed: %v", pr.ID, m.tag, err)
			} else {
				log.Printf("[metrics-scheduler] collected %s milestone %s", pr.ID, m.tag)
			}
		}
	}
}

// Ensure adapters import is used (FetchMetrics path needs it)
var _ adapters.Publisher
