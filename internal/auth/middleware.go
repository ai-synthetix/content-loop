package auth

import (
	"context"
	"net/http"
	"strings"
)

type contextKey string

const UserContextKey contextKey = "auth_user"

// UserPrincipal stored in context after AuthRequired.
type UserPrincipal struct {
	UserID string
	Email  string
	Name   string
}

func UserFromContext(ctx context.Context) (*UserPrincipal, bool) {
	v := ctx.Value(UserContextKey)
	if v == nil {
		return nil, false
	}
	p, ok := v.(*UserPrincipal)
	return p, ok
}

// AuthRequired verifies Bearer JWT and injects principal. Returns 401 on failure.
func AuthRequired(secret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			h := r.Header.Get("Authorization")
			if h == "" {
				http.Error(w, `{"error":"missing Authorization"}`, http.StatusUnauthorized)
				return
			}
			parts := strings.SplitN(h, " ", 2)
			if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
				http.Error(w, `{"error":"invalid Authorization header"}`, http.StatusUnauthorized)
				return
			}
			claims, err := Verify(secret, strings.TrimSpace(parts[1]))
			if err != nil {
				http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
				return
			}
			principal := &UserPrincipal{UserID: claims.UserID, Email: claims.Email, Name: claims.Name}
			ctx := context.WithValue(r.Context(), UserContextKey, principal)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// OptionalAuth sets principal if token present but does not require it.
func OptionalAuth(secret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			h := r.Header.Get("Authorization")
			if h != "" {
				parts := strings.SplitN(h, " ", 2)
				if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
					if claims, err := Verify(secret, strings.TrimSpace(parts[1])); err == nil {
						principal := &UserPrincipal{UserID: claims.UserID, Email: claims.Email, Name: claims.Name}
						r = r.WithContext(context.WithValue(r.Context(), UserContextKey, principal))
					}
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}
