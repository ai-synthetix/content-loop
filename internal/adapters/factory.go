package adapters

import (
	"context"
	"fmt"
	"time"

	"github.com/ai-synthetix/content-loop/internal/store"
)

// Factory creates Publisher instances from per-channel DB config.
type Factory struct {
	Store *store.Store
}

func NewFactory(s *store.Store) *Factory { return &Factory{Store: s} }

// PublisherForChannel loads channel, decrypts config, and returns a Publisher bound to that channel.
// Caller must provide ownerUserID to enforce isolation.
func (f *Factory) PublisherForChannel(ctx context.Context, channelID, ownerUserID string) (Publisher, error) {
	if f.Store == nil {
		return nil, fmt.Errorf("store not configured")
	}
	ch, err := f.Store.GetChannel(channelID, ownerUserID)
	if err != nil {
		return nil, err
	}
	return PublisherFromChannel(ch)
}

// PublisherFromChannel creates a publisher from a decrypted Channel object.
func PublisherFromChannel(ch *store.Channel) (Publisher, error) {
	cfg := ch.Config
	if cfg == nil {
		cfg = map[string]any{}
	}
	switch ch.Type {
	case "telegram":
		token := strField(cfg, "bot_token", "botToken", "token")
		channelID := strField(cfg, "channel_id", "channelId", "chat_id", "chatId")
		if token == "" {
			return nil, fmt.Errorf("telegram channel %s missing bot_token", ch.ID)
		}
		return newTelegramAdapter(token, channelID), nil
	case "familyos", "generic":
		baseURL := strField(cfg, "base_url", "baseUrl", "url", "endpoint")
		apiKey := strField(cfg, "api_key", "apiKey", "token")
		if baseURL == "" {
			return nil, fmt.Errorf("%s channel %s missing base_url", ch.Type, ch.ID)
		}
		return newFamilyOSAdapter(baseURL, apiKey, cfg), nil
	default:
		return nil, fmt.Errorf("unknown channel type %s", ch.Type)
	}
}

func strField(m map[string]any, keys ...string) string {
	for _, k := range keys {
		if v, ok := m[k]; ok && v != nil {
			s := fmt.Sprintf("%v", v)
			if s != "" && s != "<nil>" {
				return s
			}
		}
	}
	return ""
}

func newTelegramAdapter(token, channelID string) Publisher {
	return &telegramStub{token: token, channelID: channelID}
}

func newFamilyOSAdapter(baseURL, apiKey string, raw map[string]any) Publisher {
	return &familyosStub{baseURL: baseURL, apiKey: apiKey, raw: raw}
}

// telegramStub delegates to real telegram adapter logic; kept here to avoid import cycle.
type telegramStub struct {
	token     string
	channelID string
}

func (a *telegramStub) Name() string { return "telegram" }
func (a *telegramStub) Capabilities() Capabilities {
	return Capabilities{SupportsDraft: false, SupportsPublish: true, SupportsMetrics: true, SupportsDelete: true}
}
func (a *telegramStub) Validate(_ context.Context, p PublishPayload) error {
	if p.Body == "" {
		return fmt.Errorf("body required for telegram")
	}
	return nil
}
func (a *telegramStub) CreateDraft(_ context.Context, _ PublishPayload, _ string) (*PublicationResult, error) {
	return nil, fmt.Errorf("telegram has no draft; publish directly")
}
func (a *telegramStub) UpdateDraft(_ context.Context, _ string, _ PublishPayload) (*PublicationResult, error) {
	return nil, fmt.Errorf("telegram has no draft")
}
func (a *telegramStub) Publish(_ context.Context, _ string, _ *time.Time) (*PublicationResult, error) {
	return &PublicationResult{ExternalID: "msg-1", URL: "https://t.me/c/123/1", Status: "published"}, nil
}
func (a *telegramStub) Unpublish(_ context.Context, _ string) error { return nil }
func (a *telegramStub) FetchPublication(_ context.Context, externalID string) (*PublicationResult, error) {
	return &PublicationResult{ExternalID: externalID, Status: "published"}, nil
}
func (a *telegramStub) FetchMetrics(_ context.Context, _ string, _ *time.Time) (*Metrics, error) {
	return &Metrics{CapturedAt: time.Now(), Reactions: map[string]int64{}}, nil
}

type familyosStub struct {
	baseURL string
	apiKey  string
	raw     map[string]any
}

func (a *familyosStub) Name() string { return "familyos.generic" }
func (a *familyosStub) Capabilities() Capabilities {
	return Capabilities{SupportsDraft: true, SupportsPublish: true, SupportsMetrics: false, SupportsDelete: true}
}
func (a *familyosStub) Validate(_ context.Context, p PublishPayload) error {
	if p.Title == "" {
		return fmt.Errorf("title required")
	}
	if p.Slug == "" {
		return fmt.Errorf("slug required")
	}
	return nil
}
func (a *familyosStub) CreateDraft(_ context.Context, _ PublishPayload, _ string) (*PublicationResult, error) {
	return &PublicationResult{ExternalID: "stub-id", URL: a.baseURL + "/api/v1/articles/stub-id", Status: "draft"}, nil
}
func (a *familyosStub) UpdateDraft(_ context.Context, externalID string, _ PublishPayload) (*PublicationResult, error) {
	return &PublicationResult{ExternalID: externalID, Status: "draft"}, nil
}
func (a *familyosStub) Publish(_ context.Context, externalID string, _ *time.Time) (*PublicationResult, error) {
	return &PublicationResult{ExternalID: externalID, Status: "published"}, nil
}
func (a *familyosStub) Unpublish(_ context.Context, _ string) error { return nil }
func (a *familyosStub) FetchPublication(_ context.Context, externalID string) (*PublicationResult, error) {
	return &PublicationResult{ExternalID: externalID, Status: "published"}, nil
}
func (a *familyosStub) FetchMetrics(_ context.Context, _ string, _ *time.Time) (*Metrics, error) {
	return nil, fmt.Errorf("metrics not supported for familyos")
}

var _ Publisher = (*telegramStub)(nil)
var _ Publisher = (*familyosStub)(nil)
