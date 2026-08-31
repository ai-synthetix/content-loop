package telegram

import (
	"context"
	"fmt"
	"time"

	"github.com/ai-synthetix/content-loop/internal/adapters"
)

// Adapter implements telegram channel publishing via Bot API.
type Adapter struct {
	BotToken  string
	ChannelID string
}

func (a *Adapter) Name() string { return "telegram" }

func (a *Adapter) Capabilities() adapters.Capabilities {
	return adapters.Capabilities{SupportsDraft: false, SupportsPublish: true, SupportsMetrics: true, SupportsDelete: true}
}

func (a *Adapter) Validate(_ context.Context, p adapters.PublishPayload) error {
	if p.Body == "" {
		return fmt.Errorf("body required for telegram")
	}
	return nil
}

func (a *Adapter) CreateDraft(_ context.Context, _ adapters.PublishPayload, _ string) (*adapters.PublicationResult, error) {
	return nil, fmt.Errorf("telegram has no draft; publish directly")
}

func (a *Adapter) UpdateDraft(_ context.Context, _ string, _ adapters.PublishPayload) (*adapters.PublicationResult, error) {
	return nil, fmt.Errorf("telegram has no draft")
}

func (a *Adapter) Publish(_ context.Context, _ string, _ *time.Time) (*adapters.PublicationResult, error) {
	// Stub: real impl calls https://api.telegram.org/bot<token>/sendMessage
	return &adapters.PublicationResult{ExternalID: "msg-1", URL: "https://t.me/c/123/1", Status: "published"}, nil
}

func (a *Adapter) Unpublish(_ context.Context, _ string) error { return nil }

func (a *Adapter) FetchPublication(_ context.Context, externalID string) (*adapters.PublicationResult, error) {
	return &adapters.PublicationResult{ExternalID: externalID, Status: "published"}, nil
}

func (a *Adapter) FetchMetrics(_ context.Context, _ string, _ *time.Time) (*adapters.Metrics, error) {
	return &adapters.Metrics{CapturedAt: time.Now(), Reactions: map[string]int64{}}, nil
}

var _ adapters.Publisher = (*Adapter)(nil)
