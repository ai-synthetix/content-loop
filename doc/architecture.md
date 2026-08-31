# Content Loop: целевая архитектура

## Архитектурный принцип

Ядро владеет редакционным состоянием. Каналы владеют доставкой. FamilyOS владеет своими доменными представлениями контента. Связь проходит только через версионированные адаптеры.

```text
Sources / ideas / prior publications
                │
                ▼
      Content Loop API + DB
  brief → draft → variants → approval
                │
        durable job/outbox
                │
     ┌──────────┼──────────────┐
     ▼          ▼              ▼
 Telegram    Facebook      FamilyOS adapter
     │          │              │
     └──────────┴──────┬───────┘
                       ▼
          metrics + publication state
                       │
                       ▼
              structured reflection
```

## Почему отдельная БД

FamilyOS хранит конечные доменные статьи. Content Loop должен хранить промежуточные версии, решения человека, публикации по каналам, ошибки доставки, snapshots метрик и рефлексии. Эти данные имеют другой жизненный цикл и не должны размывать таблицы FamilyOS.

Минимальные сущности:

| Сущность | Назначение |
|---|---|
| `project` | редакционная политика, языки, риски, каналы |
| `content_item` | канонический замысел и состояние workflow |
| `content_version` | неизменяемая версия текста, источников и claims |
| `channel_variant` | Telegram/Facebook/FamilyOS представление версии |
| `approval` | approve/edit/reject, автор и время |
| `publication` | adapter, external ID, URL, idempotency key, status |
| `metric_snapshot` | значения метрик на заданный момент |
| `reflection` | нормализованные выводы и следующие гипотезы |
| `source` | URL/документ, дата проверки, область утверждений |
| `audit_event` | полный журнал значимых действий |

## Состояния материала

```text
idea
  → brief_ready
  → drafting
  → review_ready
  → approved | rejected | changes_requested
  → scheduled
  → publishing
  → partially_published | published | failed
  → measuring
  → reflected
```

Публикации по каналам имеют отдельные состояния. Ошибка Facebook не должна откатывать успешную публикацию в Telegram. Повторный запрос с тем же idempotency key не создаёт второй пост.

## Контракт publisher adapter

```json
{
  "adapter": "familyos.soul_article",
  "operation": "create_draft",
  "idempotency_key": "content/42/version/7/channel/familyos-soul",
  "content": {
    "title": "...",
    "slug": "...",
    "excerpt": "...",
    "body": "...",
    "locale": "ru",
    "published_at": null
  },
  "metadata": {
    "content_item_id": "42",
    "content_version_id": "7"
  }
}
```

Адаптер предоставляет возможности, а не общий фальшивый знаменатель:

```text
capabilities()
validate(payload)
createDraft(payload, idempotencyKey)
updateDraft(externalID, payload)
publish(externalID, schedule?)
unpublish(externalID)
fetchPublication(externalID)
fetchMetrics(externalID, since?)
```

Не каждый адаптер обязан поддерживать все методы. Telegram не имеет настоящего draft в канале; draft остаётся внутри Content Loop. FamilyOS поддерживает draft через `is_published=false`.

## Mapping FamilyOS

### PattayaDom

```text
adapter: familyos.pattayadom_article
POST  /api/v1/articles
PATCH /api/v1/articles/{id}
fields: title, slug, category, excerpt, body, image_url, published_at, is_published
```

### SoulArchitecture.Space

```text
adapter: familyos.soul_article
POST  /api/v1/soul/articles/
PATCH /api/v1/soul/articles/{id}/
fields: slug, title_ru/title_en, eyebrow_*, excerpt_*, body_*, sort_order,
        is_published, published_at
```

### AI.SoulArc.Space

```text
adapter: familyos.soul_ai_note
POST  /api/v1/soul/ai-notes/
PATCH /api/v1/soul/ai-notes/{id}/
fields: slug, title, excerpt, body, published_at, sort_order, is_published
```

Аутентификация адаптера: отдельный X-API-Key с минимально возможной областью. Текущая общая API-key модель FamilyOS потребует отдельного проектирования scope/permissions до внешнего SaaS-доступа.

## Генерация

Генерация делится на небольшие операции:

1. `plan_topic` — проверяет дубли и редакционный календарь;
2. `build_brief` — аудитория, intent, claims, источники, CTA, риски;
3. `draft_canonical` — длинная каноническая версия;
4. `render_variant` — версия под конкретный канал;
5. `verify` — структура, ссылки, запрещённые утверждения, schema validation;
6. `prepare_review` — diff, claims и источники для человека.

Модель выбирается через `ModelProvider`. Ни один prompt не должен знать токены каналов или выполнять HTTP-публикацию.

## Рефлексия

Рефлексия состоит из данных и интерпретации.

Сначала сохраняются наблюдения:

- проект, канал, тема, формат, язык;
- длина, структура, hook, CTA, время публикации;
- реакции, комментарии, переходы, дочитывания/просмотры, если канал отдаёт их надёжно;
- ручной edit distance;
- возраст публикации и размер доступной аудитории.

Затем считаются сравнимые показатели:

- `reaction_rate` относительно доступного denominator;
- `click_rate` по собственным ссылкам;
- результат против медианы того же проекта, канала и формата;
- confidence по объёму наблюдений;
- novelty/duplicate score относительно опубликованного архива.

LLM получает агрегаты и формирует только гипотезы:

```json
{
  "observation": "Пошаговые визовые материалы получили больше сохранений/переходов",
  "confidence": "medium",
  "possible_causes": ["практический intent", "структура checklist"],
  "next_test": "сравнить checklist и narrative при одинаковой теме",
  "do_not_conclude": "тема виз всегда сильнее недвижимости"
}
```

## Оркестрация

### MVP

Собственный state machine + Postgres/MySQL + outbox worker. n8n допустим снаружи для расписаний, webhook и временных интеграций. Он не является source of truth.

### После MVP

LangGraph подходит, если появятся сложные ветвления генерации, длинные human interrupts и необходимость replay/checkpoints. Temporal подходит, если главной проблемой станет гарантированное выполнение большого числа долгоживущих workflow. Оба решения внедряются после измеренного усложнения, не заранее.

## Безопасность и эксплуатация

- channel credentials хранятся в secret manager/Kubernetes Secrets;
- контентные workers не получают DB credentials FamilyOS;
- публикация выполняется только publisher worker;
- каждый внешний вызов журналируется без секретов;
- webhook проверяет подпись/secret;
- rate limits, retry с backoff и dead-letter queue;
- schema validation до LLM и после LLM;
- prompt/model/version фиксируются в `content_version`;
- все публикации связаны с утверждённой immutable-версией;
- резервное копирование Content Loop DB отдельно от FamilyOS.

## Граница open source

Открытое ядро:

- domain model;
- workflow engine;
- adapter SDK;
- Telegram adapter;
- generic REST adapter;
- reference approval UI;
- metrics normalization interfaces.

Private layer:

- FamilyOS adapter configuration;
- project profiles и style guides;
- sources и credentials;
- historical metrics;
- deployment manifests конкретной инфраструктуры.
