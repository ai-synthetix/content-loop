# Content Loop

Go + MySQL 8 + Next.js editorial workflow: `idea → brief_ready → drafting → review_ready → approved/rejected/changes_requested → scheduled → publishing → published/partially_published/failed → measuring → reflected`.

- Org: `ai-synthetix` (repo `ai-synthetix/content-loop`)
- Stack: Go 1.22, chi, sqlx, golang-migrate, mysql:8, Next.js 15
- Status 01.09.2026: **9 done** (tables, generation async, channel-aware variants, approve flow, abstract publish + idempotency, real Telegram adapter, metrics manual+auto, reflections, status sync) · **3 in progress** (edits, health, dashboard) · **2 not needed** (scheduling deferred, webhooks no)

## Quick start

```bash
cp .env.example .env
docker compose up --build
# API: http://localhost:8081  (GET /healthz, /api/v1/...)
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
migrations/           MySQL migrations (001–004, 9+ tables)
api/schemas           JSON Schemas
docs/                 editorial-policy-pattayadom.md, risk-policy.md
web/                  Next.js 15 review queue
deploy/k8s            deployment/service/ingress/secret
```

## API

Base: `http://localhost:8081` — all `/api/v1/*` require `Authorization: Bearer <JWT>` (from `POST /auth/google`). `GET /healthz` is public.

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/healthz` | public, DB ping → `{status, db}` (in progress: expanded health) |
| `POST` | `/auth/google` | `{id_token}` → `{token, user}` |
| `GET` | `/me` | `Authorization: Bearer ...` → user |
| `GET` | `/api/v1/projects/` | list (owner filtered) |
| `POST` | `/api/v1/projects/` | `{name, slug, languages, channels, policy}` |
| `GET` | `/api/v1/projects/{id}` | |
| `PATCH` | `/api/v1/projects/{id}` | |
| `DELETE` | `/api/v1/projects/{id}` | |
| `GET` | `/api/v1/content-items/` | queue |
| `POST` | `/api/v1/content-items/` | `{title, slug, brief, project_id}` |
| `GET` | `/api/v1/content-items/{id}` | |
| `PATCH` | `/api/v1/content-items/{id}` | edits (in progress) |
| `DELETE` | `/api/v1/content-items/{id}` | |
| `GET` | `/api/v1/content-items/{id}/versions` | |
| `POST` | `/api/v1/content-items/{id}/versions` | |
| `GET` | `/api/v1/content-items/{id}/approvals` | |
| `POST` | `/api/v1/content-items/{id}/approvals` | `{decision: approved|rejected|changes_requested}` → syncs status |
| `POST` | `/api/v1/content-items/{id}/brief` | scaffold brief |
| `POST` | `/api/v1/content-items/{id}/generate` | → `202 {job}` async (channel-aware variants) |
| `GET` | `/api/v1/content-items/{id}/generation-status` | poll job |
| `GET` | `/api/v1/generation-jobs/{id}` | job by id |
| `GET` | `/api/v1/content-items/{id}/review` | diff + claims + variants |
| `POST` | `/api/v1/publications/` | `{content_item_id, channel_ids, idempotency_key?}` → abstract publish + idempotency |
| `GET` | `/api/v1/publications/` | list (filter `content_item_id`) |
| `GET` | `/api/v1/publications/{id}` | |
| `POST` | `/api/v1/publications/{id}/metrics` | **metrics/collect** — manual milestone `{metrics: {views, reactions, comments}, captured_at}` |
| `GET` | `/api/v1/publications/{id}/metrics` | list snapshots for publication (auto + manual) |
| `GET` | `/api/v1/metric-snapshots/` | all snapshots (filter `publication_id`) |
| `POST` | `/api/v1/content-items/{id}/reflections` | `{observation, confidence, possible_causes, next_test, do_not_conclude}` |
| `GET` | `/api/v1/content-items/{id}/reflections` | |
| `GET` | `/api/v1/reflections/` | all (filter `content_item_id`) |
| `GET` | `/api/v1/channels/` | per-user, per-project |
| `POST` | `/api/v1/channels/` | `{name, type: telegram|familyos, project_id, config: {bot_token, chat_id / base_url, api_key}}` |
| `GET` | `/api/v1/channels/{id}` | |
| `PATCH` | `/api/v1/channels/{id}` | |
| `DELETE` | `/api/v1/channels/{id}` | |
| `POST` | `/api/v1/channels/{id}/test` | check connectivity (Telegram `getMe` / FamilyOS ping) |

Scheduling is **deferred** (no cron endpoint in MVP); webhooks are **not needed** (poll/manual).

## Frontend routes

| Route | File | Description |
|-------|------|-------------|
| `/` | `web/app/page.tsx` | Review Queue — `GET /content-items`, + New item, PipelineStepper |
| `/projects` | `web/app/projects/page.tsx` | Projects list + create |
| `/projects/[id]` | `web/app/projects/[id]/page.tsx` | Project detail, channels binding |
| `/items/[id]` | `web/app/items/[id]/page.tsx` | Item detail: Generate (async polling), Review, Approve (`approved/changes_requested/rejected`), Publish (abstract + idempotency), Metrics (manual form + auto list), Reflections |
| `/settings/channels` | `web/app/settings/channels/page.tsx` | Encrypted channel configs, Test connectivity |
| `/guide` | `web/app/guide/page.tsx` | Pipeline guide — real Telegram + metrics milestones |
| `/dashboard` | *(in progress)* | Publication/metrics overview, edit shortcuts, health summary |
| `/login` | `web/app/login/page.tsx` | Google One Tap → `POST /auth/google` |

Auth: `web/lib/auth.ts` stores JWT in localStorage; `authHeaders()` adds `Authorization: Bearer`. Global generation bar (`GlobalGenerationBar`) shows only active jobs.

## Deploy

```bash
kubectl apply -f deploy/k8s/secret.yaml
kubectl apply -f deploy/k8s/deployment.yaml
kubectl apply -f deploy/k8s/service.yaml
kubectl apply -f deploy/k8s/ingress.yaml
```
