package store

import (
	"fmt"
	"strings"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/mysql"
	_ "github.com/golang-migrate/migrate/v4/source/file"
)

// Migrate runs up migrations from file path. databaseURL must be a MySQL DSN
// like user:pass@tcp(host:port)/db?multiStatements=true&parseTime=true
// It is converted to migrate's mysql:// URL.
func Migrate(databaseURL string) error {
	if databaseURL == "" {
		return fmt.Errorf("DATABASE_URL empty")
	}
	// migrate expects mysql://user:pass@tcp(host:port)/db?query
	// DSN already is that without scheme, but may include charset etc.
	// Prepend mysql:// if not present.
	mURL := databaseURL
	if !strings.HasPrefix(mURL, "mysql://") {
		mURL = "mysql://" + mURL
	}
	m, err := migrate.New("file://migrations", mURL)
	if err != nil {
		return err
	}
	defer m.Close()
	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return err
	}
	return nil
}
