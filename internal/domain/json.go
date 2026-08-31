package domain

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
)

// Value implements driver.Valuer for JSON.
func (j JSON) Value() (driver.Value, error) {
	if j == nil {
		return nil, nil
	}
	return []byte(j), nil
}

// Scan implements sql.Scanner for JSON.
func (j *JSON) Scan(src interface{}) error {
	if src == nil {
		*j = nil
		return nil
	}
	switch v := src.(type) {
	case []byte:
		*j = JSON(v)
		return nil
	case string:
		*j = JSON(v)
		return nil
	default:
		return errors.New("unsupported JSON scan type")
	}
}

// MarshalJSON delegates.
func (j JSON) MarshalJSON() ([]byte, error) {
	if j == nil {
		return []byte("null"), nil
	}
	return json.RawMessage(j).MarshalJSON()
}

// UnmarshalJSON delegates.
func (j *JSON) UnmarshalJSON(b []byte) error {
	if j == nil {
		*j = JSON(nil)
	}
	raw := json.RawMessage{}
	if err := raw.UnmarshalJSON(b); err != nil {
		return err
	}
	*j = JSON(raw)
	return nil
}
