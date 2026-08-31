package main

import (
	"log"
	"net/http"
	"os"

	"github.com/ai-synthetix/content-loop/internal/httpapi"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	handler := httpapi.NewRouter()
	log.Printf("content-loop api listening on :%s", port)
	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatal(err)
	}
}
