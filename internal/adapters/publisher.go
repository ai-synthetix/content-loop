package adapters

import (
	"context"
	"time"
)

// Capabilities describes what an adapter supports.
type Capabilities struct {
	SupportsDraft   bool `json:"supports_draft"`
	SupportsPublish bool `json:"supports_publish"`
	SupportsMetrics bool `json:"supports_metrics"`
	SupportsDelete  bool `json:"supports_delete"`
}

// PublishPayload is the channel-specific payload derived from a ChannelVariant.
type PublishPayload struct {
	Title       string            `json:"title"`
	Slug        string            `json:"slug"`
	Excerpt     string            `json:"excerpt"`
	Body        string            `json:"body"`
	Locale      string            `json:"locale"`
	ImageURL    string            `json:"image_url,omitempty"`
	PublishedAt *time.Time        `json:"published_at"`
	Metadata    map[string]string `json:"metadata"`
	Raw         map[string]any    `json:"raw,omitempty"`
}

// PublicationResult is returned after create/update/publish.
type PublicationResult struct {
	ExternalID string `json:"external_id"`
	URL        string `json:"url"`
	Status     string `json:"status"`
}

// Metrics holds normalized channel metrics.
type Metrics struct {
	Views     *int64            `json:"views,omitempty"`
	Reactions map[string]int64  `json:"reactions,omitempty"`
	Comments  *int64            `json:"comments,omitempty"`
	Extra     map[string]any    `json:"extra,omitempty"`
	CapturedAt time.Time        `json:"captured_at"`
}

// Publisher is the contract every channel adapter must implement.
// See architecture.md — capabilities(), validate, createDraft, updateDraft, publish, unpublish, fetchPublication, fetchMetrics.
type Publisher interface {
	Name() string
	Capabilities() Capabilities
	Validate(ctx context.Context, payload PublishPayload) error
	CreateDraft(ctx context.Context, payload PublishPayload, idempotencyKey string) (*PublicationResult, error)
	UpdateDraft(ctx context.Context, externalID string, payload PublishPayload) (*PublicationResult, error)
	Publish(ctx context.Context, externalID string, schedule *time.Time) (*PublicationResult, error)
	Unpublish(ctx context.Context, externalID string) error
	FetchPublication(ctx context.Context, externalID string) (*PublicationResult, error)
	FetchMetrics(ctx context.Context, externalID string, since *time.Time) (*Metrics, error)
}
