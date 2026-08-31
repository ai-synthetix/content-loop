package familyos

import (
	"context"
	"fmt"
	"time"

	"github.com/ai-synthetix/content-loop/internal/adapters"
)

// PattayaDomAdapter implements familyos.pattayadom_article.
// Maps to FamilyOS: POST /api/v1/articles, PATCH /api/v1/articles/{id}
// Fields: title, slug, category, excerpt, body, image_url, published_at, is_published
type PattayaDomAdapter struct {
	BaseURL string
	APIKey  string
}

func (a *PattayaDomAdapter) Name() string { return "familyos.pattayadom_article" }

func (a *PattayaDomAdapter) Capabilities() adapters.Capabilities {
	return adapters.Capabilities{SupportsDraft: true, SupportsPublish: true, SupportsMetrics: false, SupportsDelete: true}
}

func (a *PattayaDomAdapter) Validate(_ context.Context, p adapters.PublishPayload) error {
	if p.Title == "" {
		return fmt.Errorf("title required")
	}
	if p.Slug == "" {
		return fmt.Errorf("slug required")
	}
	return nil
}

func (a *PattayaDomAdapter) CreateDraft(_ context.Context, _ adapters.PublishPayload, _ string) (*adapters.PublicationResult, error) {
	return &adapters.PublicationResult{ExternalID: "stub-id", URL: a.BaseURL + "/api/v1/articles/stub-id", Status: "draft"}, nil
}

func (a *PattayaDomAdapter) UpdateDraft(_ context.Context, externalID string, _ adapters.PublishPayload) (*adapters.PublicationResult, error) {
	return &adapters.PublicationResult{ExternalID: externalID, Status: "draft"}, nil
}

func (a *PattayaDomAdapter) Publish(_ context.Context, externalID string, _ *time.Time) (*adapters.PublicationResult, error) {
	return &adapters.PublicationResult{ExternalID: externalID, Status: "published"}, nil
}

func (a *PattayaDomAdapter) Unpublish(_ context.Context, _ string) error { return nil }

func (a *PattayaDomAdapter) FetchPublication(_ context.Context, externalID string) (*adapters.PublicationResult, error) {
	return &adapters.PublicationResult{ExternalID: externalID, Status: "published"}, nil
}

func (a *PattayaDomAdapter) FetchMetrics(_ context.Context, _ string, _ *time.Time) (*adapters.Metrics, error) {
	return nil, fmt.Errorf("metrics not supported for pattayadom_article")
}

var _ adapters.Publisher = (*PattayaDomAdapter)(nil)
