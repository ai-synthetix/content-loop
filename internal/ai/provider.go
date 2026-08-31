package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

type Provider struct {
	BaseURL string
	APIKey  string
	Model   string
	Client  *http.Client
}

func NewFromEnv() *Provider {
	base := os.Getenv("OPENCODE_BASE_URL")
	if base == "" {
		base = "https://opencode.ai/zen/go/v1"
	}
	base = strings.TrimRight(base, "/")
	return &Provider{
		BaseURL: base,
		APIKey:  os.Getenv("OPENCODE_API_KEY"),
		Model:   modelFromEnv(),
		Client:  &http.Client{Timeout: 45 * time.Second},
	}
}

func modelFromEnv() string {
	m := os.Getenv("AI_MODEL")
	if m == "" {
		m = "kimi-k2.5"
	}
	return m
}

func (p *Provider) IsMock() bool { return p.APIKey == "" }

type chatRequest struct {
	Model    string    `json:"model"`
	Messages []message `json:"messages"`
	Temp     float64   `json:"temperature,omitempty"`
}

type message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func (p *Provider) Complete(ctx context.Context, system, user string) (string, error) {
	if p.IsMock() {
		return p.mockComplete(system, user), nil
	}
	msgs := []message{}
	if system != "" {
		msgs = append(msgs, message{Role: "system", Content: system})
	}
	msgs = append(msgs, message{Role: "user", Content: user})
	reqBody := chatRequest{Model: p.Model, Messages: msgs, Temp: 0.7}
	b, _ := json.Marshal(reqBody)
	req, err := http.NewRequestWithContext(ctx, "POST", p.BaseURL+"/chat/completions", bytes.NewReader(b))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.APIKey)
	resp, err := p.Client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("ai status %d: %s", resp.StatusCode, string(raw))
	}
	var cr chatResponse
	if err := json.Unmarshal(raw, &cr); err != nil {
		return "", fmt.Errorf("ai decode: %w body=%s", err, string(raw))
	}
	if cr.Error != nil {
		return "", fmt.Errorf("ai error: %s", cr.Error.Message)
	}
	if len(cr.Choices) == 0 {
		return "", fmt.Errorf("ai: no choices")
	}
	return strings.TrimSpace(cr.Choices[0].Message.Content), nil
}

func (p *Provider) mockComplete(system, user string) string {
	// deterministic mock that respects expected JSON shapes when requested
	lower := strings.ToLower(user)
	if strings.Contains(lower, "draft_canonical") || strings.Contains(lower, "\"title\"") && strings.Contains(lower, "body_markdown") {
		return `{"title":"Mock Generated Title","excerpt":"Mock excerpt for review.","body_markdown":"# Mock Generated Title\n\nThis is a mock canonical body generated without API key. It contains enough length to pass verification.\n\n## Section\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit. **Claims** are cited as [1].\n\n- Point one\n- Point two\n","claims":["Mock claim 1 [source 1]"],"sources":["https://example.com/source1"]}`
	}
	if strings.Contains(lower, "brief") {
		return `{"goal":"Mock brief goal","audience":"General audience","claims":[{"text":"Mock claim 1","source":"https://example.com/source1"}],"sources":["https://example.com/source1"],"outline":["Intro","Body","CTA"]}`
	}
	if strings.Contains(lower, "telegram") {
		return "Mock Telegram variant — short summary with CTA.\n\n# Mock Title\n\nShort body for Telegram (under 4096 chars)."
	}
	if strings.Contains(lower, "familyos") {
		return "# Mock FamilyOS Variant\n\nFull body adapted for FamilyOS with structured payload."
	}
	// generic
	snippet := user
	if len(snippet) > 120 {
		snippet = snippet[:120]
	}
	return fmt.Sprintf("Mock response for: %s ... (system: %.60s)", snippet, system)
}
