package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	_ "github.com/go-sql-driver/mysql"
	"github.com/jmoiron/sqlx"

	"github.com/ai-synthetix/content-loop/internal/ai"
	"github.com/ai-synthetix/content-loop/internal/httpapi"
	"github.com/ai-synthetix/content-loop/internal/store"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		databaseURL = "contentloop:contentloop@tcp(127.0.0.1:3306)/content_loop?parseTime=true&multiStatements=true&charset=utf8mb4"
	}
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = "dev-secret-change-me"
		log.Printf("WARN: JWT_SECRET not set, using dev default")
	}
	googleClientID := os.Getenv("GOOGLE_CLIENT_ID")

	var st *store.Store
	db, err := sqlx.Open("mysql", databaseURL)
	if err != nil {
		log.Printf("WARN: db open failed: %v (running in-memory)", err)
	} else {
		if err := db.Ping(); err != nil {
			log.Printf("WARN: db ping failed: %v (running in-memory)", err)
		} else {
			log.Printf("db connected")
			if err := store.Migrate(databaseURL); err != nil {
				log.Printf("WARN: migrate failed: %v", err)
			} else {
				log.Printf("migrations applied")
			}
			st = store.New(db)
		}
	}

	handler := httpapi.NewRouterWithConfig(httpapi.Config{
		Store:          st,
		JWTSecret:      jwtSecret,
		GoogleClientID: googleClientID,
		AI:             ai.NewFromEnv(),
	})

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 180 * time.Second,
		IdleTimeout:  180 * time.Second,
	}

	// graceful shutdown
	go func() {
		log.Printf("content-loop api listening on :%s (db=%v google_client_id_set=%v model=%s)", port, st != nil, googleClientID != "", os.Getenv("AI_MODEL"))
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Printf("shutting down server...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("server forced to shutdown: %v", err)
	}
	if db != nil {
		_ = db.Close()
	}
	log.Printf("server exited")
}
