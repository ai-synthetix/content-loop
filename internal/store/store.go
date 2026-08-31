package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/jmoiron/sqlx"
)

func toDBValue(v any) any {
	if v == nil {
		return nil
	}
	switch val := v.(type) {
	case string, []byte, int, int32, int64, float32, float64, bool:
		return val
	case json.RawMessage:
		return string(val)
	default:
		// for slices, maps, etc. marshal to JSON string
		b, err := json.Marshal(val)
		if err == nil {
			return string(b)
		}
		return val
	}
}

// Store is the MySQL-backed store. All queries filter by owner_user_id when provided.
type Store struct {
	DB *sqlx.DB
}

func New(db *sqlx.DB) *Store { return &Store{DB: db} }

// Open opens a MySQL connection with sqlx.
func Open(dsn string) (*sqlx.DB, error) {
	db, err := sqlx.Open("mysql", dsn)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		return nil, err
	}
	return db, nil
}

// Ensure dsn contains parseTime etc; helper not strictly needed as caller passes DATABASE_URL.

// User helpers
func (s *Store) GetUserByID(id string) (map[string]any, error) {
	var m map[string]any
	// use raw query for flexibility
	row := s.DB.QueryRowx(`SELECT id,email,google_sub,name,avatar_url,created_at FROM users WHERE id=?`, id)
	// scan into map via Slice?
	// fallback to struct
	type u struct {
		ID        string         `db:"id"`
		Email     string         `db:"email"`
		GoogleSub string         `db:"google_sub"`
		Name      sql.NullString `db:"name"`
		AvatarURL sql.NullString `db:"avatar_url"`
		CreatedAt sql.NullString `db:"created_at"`
	}
	var uu u
	if err := row.StructScan(&uu); err != nil {
		return nil, err
	}
	m = map[string]any{"id": uu.ID, "email": uu.Email, "google_sub": uu.GoogleSub}
	if uu.Name.Valid {
		m["name"] = uu.Name.String
	}
	if uu.AvatarURL.Valid {
		m["avatar_url"] = uu.AvatarURL.String
	}
	return m, nil
}

func (s *Store) GetOrCreateUser(id, email, googleSub string, name, avatarURL *string) (string, error) {
	// try find by google_sub
	var existingID string
	err := s.DB.Get(&existingID, `SELECT id FROM users WHERE google_sub=?`, googleSub)
	if err == nil {
		return existingID, nil
	}
	// not found: insert
	if id == "" {
		return "", fmt.Errorf("id required")
	}
	_, err = s.DB.Exec(`INSERT INTO users (id,email,google_sub,name,avatar_url) VALUES (?,?,?,?,?)`, id, email, googleSub, name, avatarURL)
	if err != nil {
		// race: maybe email conflict? try select again
		if strings.Contains(err.Error(), "Duplicate") {
			var dupID string
			if err2 := s.DB.Get(&dupID, `SELECT id FROM users WHERE google_sub=? OR email=? LIMIT 1`, googleSub, email); err2 == nil {
				return dupID, nil
			}
		}
		return "", err
	}
	return id, nil
}

// Generic helpers for owner-filtered CRUD

func (s *Store) List(table string, ownerUserID string) ([]map[string]any, error) {
	query := fmt.Sprintf(`SELECT * FROM `+"`%s`"+` WHERE owner_user_id=? ORDER BY created_at DESC LIMIT 200`, table)
	rows, err := s.DB.Queryx(query, ownerUserID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		m := map[string]any{}
		if err := rows.MapScan(m); err != nil {
			return nil, err
		}
		// convert []byte to string for JSON columns
		for k, v := range m {
			if b, ok := v.([]byte); ok {
				m[k] = string(b)
			}
		}
		out = append(out, m)
	}
	if out == nil {
		out = []map[string]any{}
	}
	return out, nil
}

func (s *Store) Get(table, id, ownerUserID string) (map[string]any, error) {
	query := fmt.Sprintf(`SELECT * FROM `+"`%s`"+` WHERE id=? AND owner_user_id=?`, table)
	row := s.DB.QueryRowx(query, id, ownerUserID)
	// Use MapScan via Queryx
	rows, err := s.DB.Queryx(query, id, ownerUserID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, sql.ErrNoRows
	}
	m := map[string]any{}
	if err := rows.MapScan(m); err != nil {
		return nil, err
	}
	for k, v := range m {
		if b, ok := v.([]byte); ok {
			m[k] = string(b)
		}
	}
	_ = row
	return m, nil
}

func (s *Store) Insert(table string, data map[string]any) error {
	if len(data) == 0 {
		return fmt.Errorf("empty data")
	}
	cols := make([]string, 0, len(data))
	placeholders := make([]string, 0, len(data))
	vals := make([]any, 0, len(data))
	for k, v := range data {
		cols = append(cols, "`"+k+"`")
		placeholders = append(placeholders, "?")
		vals = append(vals, toDBValue(v))
	}
	query := fmt.Sprintf(`INSERT INTO `+"`%s`"+` (%s) VALUES (%s)`, table, strings.Join(cols, ","), strings.Join(placeholders, ","))
	_, err := s.DB.Exec(query, vals...)
	return err
}

func (s *Store) Update(table, id, ownerUserID string, patch map[string]any) (map[string]any, error) {
	if len(patch) == 0 {
		return s.Get(table, id, ownerUserID)
	}
	sets := []string{}
	vals := []any{}
	for k, v := range patch {
		sets = append(sets, "`"+k+"`=?")
		vals = append(vals, toDBValue(v))
	}
	query := fmt.Sprintf(`UPDATE `+"`%s`"+` SET %s WHERE id=? AND owner_user_id=?`, table, strings.Join(sets, ","))
	vals = append(vals, id, ownerUserID)
	res, err := s.DB.Exec(query, vals...)
	if err != nil {
		return nil, err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return nil, sql.ErrNoRows
	}
	return s.Get(table, id, ownerUserID)
}

func (s *Store) Delete(table, id, ownerUserID string) error {
	query := fmt.Sprintf(`DELETE FROM `+"`%s`"+` WHERE id=? AND owner_user_id=?`, table)
	res, err := s.DB.Exec(query, id, ownerUserID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}
