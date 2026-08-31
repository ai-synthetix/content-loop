# Content Loop

Go + MySQL 8 + Next.js editorial workflow: `idea → brief_ready → drafting → review_ready → approved/rejected/changes_requested → scheduled → publishing → published/partially_published/failed → measuring → reflected`.

- Org: `ai-synthetix` (repo `ai-synthetix/content-loop`)
- Stack: Go 1.22, chi, sqlx, golang-migrate, mysql:8, Next.js 15

## Quick start

```bash
cp .env.example .env
docker compose up --build
# API: http://localhost:8080  (GET /healthz, /api/v1/...)
# Web: http://localhost:3000
```

Local without Docker:

```bash
go run ./cmd/api              # needs DATABASE_URL / MySQL running
cd web && npm install && npm run dev
```

## Make

```
make build            # go build -> bin/content-loop
make vet
make tidy
make compose-config   # validate docker-compose.yml
make migrate-up       # run migrations (needs migrate CLI + DATABASE_URL)
```

## Project layout

```
cmd/api               entrypoint
internal/domain       entities + state machine
internal/httpapi      chi router (stubs)
internal/adapters     Publisher interface + familyos/telegram stubs
migrations/           MySQL migrations (9 tables)
api/schemas           JSON Schemas
docs/                 editorial-policy-pattayadom.md, risk-policy.md
web/                  Next.js 15 review queue
deploy/k8s            deployment/service/ingress/secret
```

## API (stub)

- `GET /healthz`
- `GET/POST /api/v1/projects`
- `GET/POST /api/v1/content-items`
- `GET /api/v1/content-items/{id}/versions`, `POST /api/v1/content-items/{id}/approvals`
- `GET/POST /api/v1/publications`

All CRUD handlers are stubs backed by in-memory maps; replace with DB.

## Deploy

```bash
kubectl apply -f deploy/k8s/secret.yaml
kubectl apply -f deploy/k8s/deployment.yaml
kubectl apply -f deploy/k8s/service.yaml
kubectl apply -f deploy/k8s/ingress.yaml
```
