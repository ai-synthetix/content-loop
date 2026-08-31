package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"strings"
)

// GetKey derives 32-byte key from CHANNEL_ENCRYPTION_KEY env.
// Accepts: raw 32-char string, 64 hex chars, or base64 (44 chars).
func GetKey() ([]byte, error) {
	raw := os.Getenv("CHANNEL_ENCRYPTION_KEY")
	if raw == "" {
		return nil, errors.New("CHANNEL_ENCRYPTION_KEY not set")
	}
	raw = strings.TrimSpace(raw)
	// try base64
	if len(raw) >= 40 && strings.Contains(raw, "=") {
		b, err := base64.StdEncoding.DecodeString(raw)
		if err == nil && len(b) == 32 {
			return b, nil
		}
		b2, err2 := base64.RawStdEncoding.DecodeString(raw)
		if err2 == nil && len(b2) == 32 {
			return b2, nil
		}
	}
	// hex 64
	if len(raw) == 64 {
		b, err := hex.DecodeString(raw)
		if err == nil && len(b) == 32 {
			return b, nil
		}
	}
	// raw 32 bytes string
	if len(raw) == 32 {
		return []byte(raw), nil
	}
	// also allow longer raw: if contains only base64 chars but 43/44
	if len(raw) == 43 || len(raw) == 44 {
		b, err := base64.RawStdEncoding.DecodeString(strings.TrimRight(raw, "="))
		if err == nil && len(b) == 32 {
			return b, nil
		}
		b2, err2 := base64.StdEncoding.DecodeString(raw)
		if err2 == nil && len(b2) == 32 {
			return b2, nil
		}
	}
	return nil, errors.New("CHANNEL_ENCRYPTION_KEY must be 32 bytes (raw), 64 hex, or 44 base64 chars")
}

// EncryptJSON marshals v to JSON and encrypts with AES-GCM, returns base64(nonce|ciphertext).
func EncryptJSON(v any) (string, error) {
	b, err := json.Marshal(v)
	if err != nil {
		return "", err
	}
	return EncryptBytes(b)
}

// DecryptJSON decrypts base64 blob and unmarshals into v.
func DecryptJSON(ciphertextB64 string, v any) error {
	b, err := DecryptBytes(ciphertextB64)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, v)
}

// EncryptBytes encrypts raw bytes with AES-GCM.
func EncryptBytes(plain []byte) (string, error) {
	key, err := GetKey()
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nonce, nonce, plain, nil)
	return base64.StdEncoding.EncodeToString(sealed), nil
}

// DecryptBytes decrypts base64(nonce|ciphertext) with AES-GCM.
func DecryptBytes(ciphertextB64 string) ([]byte, error) {
	key, err := GetKey()
	if err != nil {
		return nil, err
	}
	data, err := base64.StdEncoding.DecodeString(ciphertextB64)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return nil, errors.New("ciphertext too short")
	}
	nonce, ct := data[:nonceSize], data[nonceSize:]
	plain, err := gcm.Open(nil, nonce, ct, nil)
	if err != nil {
		return nil, err
	}
	return plain, nil
}

// EncryptBytesWithKey is helper for tests with explicit key.
func EncryptBytesWithKey(plain, key []byte) (string, error) {
	if len(key) != 32 {
		return "", errors.New("key must be 32 bytes")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nonce, nonce, plain, nil)
	return base64.StdEncoding.EncodeToString(sealed), nil
}
