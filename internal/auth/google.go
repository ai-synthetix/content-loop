package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// GoogleClaims from tokeninfo.
type GoogleClaims struct {
	Sub           string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified string `json:"email_verified"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
	Aud           string `json:"aud"`
	Iss           string `json:"iss"`
	Exp           string `json:"exp"`
	Azp           string `json:"azp"`
}

// Verifier validates Google id_tokens.
type Verifier struct {
	ClientID string
	HTTPClient *http.Client
}

func (v *Verifier) Verify(ctx context.Context, idToken string) (*GoogleClaims, error) {
	if idToken == "" {
		return nil, fmt.Errorf("empty id_token")
	}
	client := v.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: 8 * time.Second}
	}
	url := "https://oauth2.googleapis.com/tokeninfo?id_token=" + idToken
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("tokeninfo status %d", resp.StatusCode)
	}
	var c GoogleClaims
	if err := json.NewDecoder(resp.Body).Decode(&c); err != nil {
		return nil, err
	}
	if c.Aud != v.ClientID && !strings.Contains(c.Aud, v.ClientID) {
		// strict check when ClientID is configured
		if v.ClientID != "" {
			return nil, fmt.Errorf("audience mismatch")
		}
	}
	if c.Email == "" || c.Sub == "" {
		return nil, fmt.Errorf("missing email/sub")
	}
	// iss check
	if c.Iss != "https://accounts.google.com" && c.Iss != "accounts.google.com" {
		return nil, fmt.Errorf("invalid issuer %s", c.Iss)
	}
	return &c, nil
}
