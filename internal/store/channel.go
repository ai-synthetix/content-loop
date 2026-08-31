package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/ai-synthetix/content-loop/internal/crypto"
)

// Channel represents a per-user publishing channel.
type Channel struct {
	ID              string     `db:"id" json:"id"`
	OwnerUserID     string     `db:"owner_user_id" json:"owner_user_id"`
	ProjectID       *string    `db:"project_id" json:"project_id,omitempty"`
	Type            string     `db:"type" json:"type"` // telegram | familyos | generic
	Name            string     `db:"name" json:"name"`
	ConfigEncrypted string     `db:"config_encrypted" json:"-"`
	Config          map[string]any `db:"-" json:"config,omitempty"` // decrypted, never stored raw
	Status          string     `db:"status" json:"status"`
	CreatedAt       time.Time  `db:"created_at" json:"created_at"`
	UpdatedAt       time.Time  `db:"updated_at" json:"updated_at"`
}

// channelRow is internal DB row without decrypted config.
type channelRow struct {
	ID              string         `db:"id"`
	OwnerUserID     string         `db:"owner_user_id"`
	ProjectID       sql.NullString `db:"project_id"`
	Type            string         `db:"type"`
	Name            string         `db:"name"`
	ConfigEncrypted string         `db:"config_encrypted"`
	Status          string         `db:"status"`
	CreatedAt       time.Time      `db:"created_at"`
	UpdatedAt       time.Time      `db:"updated_at"`
}

func (r channelRow) toChannel(decrypted map[string]any) Channel {
	var pid *string
	if r.ProjectID.Valid {
		s := r.ProjectID.String
		pid = &s
	}
	return Channel{
		ID:              r.ID,
		OwnerUserID:     r.OwnerUserID,
		ProjectID:       pid,
		Type:            r.Type,
		Name:            r.Name,
		ConfigEncrypted: r.ConfigEncrypted,
		Config:          decrypted,
		Status:          r.Status,
		CreatedAt:       r.CreatedAt,
		UpdatedAt:       r.UpdatedAt,
	}
}

// CreateChannel inserts a channel with encrypted config.
func (s *Store) CreateChannel(ownerUserID string, ch Channel, config map[string]any) (*Channel, error) {
	if ch.ID == "" {
		ch.ID = uuid.NewString()
	}
	if ch.Type == "" {
		return nil, fmt.Errorf("type required")
	}
	if ch.Name == "" {
		ch.Name = ch.Type
	}
	if ch.Status == "" {
		ch.Status = "active"
	}
	enc, err := crypto.EncryptJSON(config)
	if err != nil {
		return nil, fmt.Errorf("encrypt config: %w", err)
	}
	query := `INSERT INTO ` + "`channel`" + ` (id, owner_user_id, project_id, type, name, config_encrypted, status) VALUES (?,?,?,?,?,?,?)`
	var pid any
	if ch.ProjectID != nil && *ch.ProjectID != "" {
		pid = *ch.ProjectID
	}
	_, err = s.DB.Exec(query, ch.ID, ownerUserID, pid, ch.Type, ch.Name, enc, ch.Status)
	if err != nil {
		return nil, err
	}
	// return with decrypted config for API convenience
	out := ch
	out.OwnerUserID = ownerUserID
	out.ConfigEncrypted = enc
	out.Config = config
	// fetch timestamps
	var row channelRow
	if err := s.DB.Get(&row, `SELECT * FROM `+"`channel`"+` WHERE id=? AND owner_user_id=?`, ch.ID, ownerUserID); err == nil {
		m := config // already have
		_ = m
		dec := config
		cc := row.toChannel(dec)
		return &cc, nil
	}
	return &out, nil
}

// ListChannels returns all channels for owner, with config decrypted (secrets masked? we return full for owner).
func (s *Store) ListChannels(ownerUserID string) ([]Channel, error) {
	var rows []channelRow
	if err := s.DB.Select(&rows, `SELECT * FROM `+"`channel`"+` WHERE owner_user_id=? ORDER BY created_at DESC`, ownerUserID); err != nil {
		return nil, err
	}
	out := make([]Channel, 0, len(rows))
	for _, r := range rows {
		cfg := map[string]any{}
		if r.ConfigEncrypted != "" {
			_ = crypto.DecryptJSON(r.ConfigEncrypted, &cfg)
			// on decrypt error, leave empty and continue
			if cfg == nil {
				cfg = map[string]any{}
			}
		}
		out = append(out, r.toChannel(cfg))
	}
	if out == nil {
		out = []Channel{}
	}
	return out, nil
}

// GetChannel fetches one channel and decrypts config.
func (s *Store) GetChannel(id, ownerUserID string) (*Channel, error) {
	var r channelRow
	if err := s.DB.Get(&r, `SELECT * FROM `+"`channel`"+` WHERE id=? AND owner_user_id=?`, id, ownerUserID); err != nil {
		return nil, err
	}
	cfg := map[string]any{}
	if r.ConfigEncrypted != "" {
		if err := crypto.DecryptJSON(r.ConfigEncrypted, &cfg); err != nil {
			// fallback: try raw base64 decode error -> keep empty
			cfg = map[string]any{"_decrypt_error": err.Error()}
		}
	}
	ch := r.toChannel(cfg)
	return &ch, nil
}

// GetChannelRaw returns encrypted config without decrypt (for publisher factory internal).
func (s *Store) GetChannelRaw(id, ownerUserID string) (*channelRow, error) {
	var r channelRow
	if err := s.DB.Get(&r, `SELECT * FROM `+"`channel`"+` WHERE id=? AND owner_user_id=?`, id, ownerUserID); err != nil {
		return nil, err
	}
	return &r, nil
}

// UpdateChannel patches allowed fields: name, type, project_id, status, config.
func (s *Store) UpdateChannel(id, ownerUserID string, patch map[string]any) (*Channel, error) {
	// fetch existing for config merge
	existing, err := s.GetChannel(id, ownerUserID)
	if err != nil {
		return nil, err
	}
	sets := []string{}
	vals := []any{}
	// handle config separately
	if cfgRaw, ok := patch["config"]; ok {
		var cfg map[string]any
		switch v := cfgRaw.(type) {
		case map[string]any:
			cfg = v
		case string:
			// if string is JSON
			_ = json.Unmarshal([]byte(v), &cfg)
			if cfg == nil {
				cfg = map[string]any{"raw": v}
			}
		default:
			b, _ := json.Marshal(v)
			_ = json.Unmarshal(b, &cfg)
		}
		enc, err := crypto.EncryptJSON(cfg)
		if err != nil {
			return nil, fmt.Errorf("encrypt config: %w", err)
		}
		sets = append(sets, "`config_encrypted`=?")
		vals = append(vals, enc)
		// do not keep patch config as plain
		delete(patch, "config")
	}
	for k, v := range patch {
		// whitelist
		switch k {
		case "name", "type", "status":
			sets = append(sets, "`"+k+"`=?")
			vals = append(vals, v)
		case "project_id":
			sets = append(sets, "`project_id`=?")
			if v == nil || v == "" {
				vals = append(vals, nil)
			} else {
				vals = append(vals, v)
			}
		default:
			// ignore unknown
		}
	}
	if len(sets) > 0 {
		query := fmt.Sprintf("UPDATE `channel` SET %s WHERE id=? AND owner_user_id=?", join(sets, ","))
		vals = append(vals, id, ownerUserID)
		res, err := s.DB.Exec(query, vals...)
		if err != nil {
			return nil, err
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			return nil, sql.ErrNoRows
		}
	}
	// if config was updated, we need to reload; else also reload
	_ = existing
	return s.GetChannel(id, ownerUserID)
}

// DeleteChannel removes channel owned by user.
func (s *Store) DeleteChannel(id, ownerUserID string) error {
	res, err := s.DB.Exec(`DELETE FROM `+"`channel`"+` WHERE id=? AND owner_user_id=?`, id, ownerUserID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func join(a []string, sep string) string {
	out := ""
	for i, s := range a {
		if i > 0 {
			out += sep
		}
		out += s
	}
	return out
}
