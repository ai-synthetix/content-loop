# Risk Policy (stub)

## Risk tiers

| Tier | Examples | Approval | Auto-publish |
|------|----------|----------|--------------|
| high | visa, law, tax, pricing, investment claims | per-material | never |
| medium | news digest, market commentary | per-material | never (MVP) |
| low | lifestyle, area guide, AI notes (post-pilot) | batch allowed | only allowlisted formats |

## Rules

- Every publication linked to an immutable `content_version` + `approval` (approve/edit).
- Edits stored as diff; edit distance is a pilot metric (target median <35%).
- No channel publish without `approved` status; `changes_requested` blocks publish.
- 0 published high-risk claims without source.

## Operational

- Secrets in K8s Secrets / secret manager; workers never hold FamilyOS DB creds.
- Idempotency key per publication; retry never duplicates.
- All external calls logged (without secrets), with rate-limit + backoff + DLQ.

## TODO

- [ ] Enumerate high-risk claim patterns
- [ ] Define source freshness window (e.g. 90 days for visa rules)
- [ ] Define DLQ / alert thresholds
