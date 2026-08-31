.PHONY: run build vet tidy migrate-up migrate-down lint compose-config web-install web-dev

BIN=bin/content-loop

run:
	go run ./cmd/api

build:
	go build -o $(BIN) ./cmd/api

vet:
	go vet ./...

tidy:
	go mod tidy

migrate-up:
	migrate -path migrations -database "mysql://$$(grep DATABASE_URL .env 2>/dev/null | cut -d= -f2- | tr -d '\"' || echo 'contentloop:contentloop@tcp(127.0.0.1:3306)/content_loop')" up

migrate-down:
	migrate -path migrations -database "mysql://$$(grep DATABASE_URL .env 2>/dev/null | cut -d= -f2- | tr -d '\"' || echo 'contentloop:contentloop@tcp(127.0.0.1:3306)/content_loop')" down 1

compose-config:
	docker compose config

web-install:
	cd web && npm install

web-dev:
	cd web && npm run dev
