# Content Loop: план реализации

## Цель пилота

За 6–8 недель доказать один полный цикл:

`PattayaDom topic → evidence-backed draft → human approval → FamilyOS draft/publish → Telegram publish → metrics → reflection → next brief`

## Не входит в первый пилот

- Facebook;
- автономная публикация без утверждения;
- SaaS tenancy, billing и marketplace;
- fine-tuning;
- полноценный multi-agent swarm;
- миграция существующих материалов;
- единая аналитика для всех возможных соцсетей.

## Этап 0. Контракт и baseline — 2–3 дня

Результаты:

- зафиксирован JSON Schema `ContentItem`, `Version`, `ChannelVariant`, `Publication`;
- описана редакционная политика PattayaDom;
- собраны 20–30 последних публикаций и доступные реакции;
- измерено текущее время подготовки и объём ручной правки;
- определены forbidden claims и обязательные источники для виз/недвижимости.

Gate: материал можно однозначно связать с версиями и каналами.

## Этап 1. Реестр и workflow — 1 неделя

Результаты:

- отдельный сервис и БД;
- state machine;
- API создания идеи, брифа, версии и решения review;
- immutable versions и audit events;
- outbox, retry и idempotency;
- простая очередь review.

Gate: сервис переживает restart между draft и approval без потери состояния.

## Этап 2. Генерация и проверка — 1 неделя

Результаты:

- provider-neutral model gateway;
- topic deduplication по опубликованному архиву;
- canonical draft и Telegram/FamilyOS renderers;
- сохранение источников и claims;
- deterministic checks: длина, обязательные поля, ссылки, запрещённые формулировки;
- diff между AI draft и утверждённой версией.

Gate: 10 тестовых брифов воспроизводимо проходят pipeline; ни один непроверенный claim не скрыт от reviewer.

## Этап 3. FamilyOS adapter — 3–4 дня

Результаты:

- `familyos.pattayadom_article`;
- создание unpublished draft;
- update после человеческой правки;
- publish отдельной операцией;
- reconcile по external ID;
- contract tests на mock FamilyOS API.

Gate: повторный publish не создаёт дубль; ошибка API не меняет approved version.

## Этап 4. Telegram adapter — 3–4 дня

Результаты:

- публикация текста/изображения;
- сохранение `chat_id`, `message_id`, permalink;
- webhook для reaction updates;
- UTM/redirect links;
- retry, rate-limit handling, reconcile.

Gate: одинаковый idempotency key не создаёт второе сообщение; реакции связываются с publication.

## Этап 5. Рефлексия — 1 неделя

Результаты:

- snapshots на 1h/24h/7d;
- нормализация по проекту, каналу, формату и возрасту;
- weekly reflection;
- явные `observation`, `confidence`, `next_test`, `do_not_conclude`;
- следующий brief показывает использованные наблюдения.

Gate: для каждого совета можно открыть исходные публикации и метрики.

## Этап 6. Пилот — 2 недели

Объём:

- 8–12 материалов;
- минимум две тематические группы;
- минимум два формата Telegram;
- review каждого материала;
- один weekly reflection после первой недели.

Решение после пилота:

- продолжить ядро и добавить SoulArchitecture;
- оставить как внутренний workflow;
- остановить;
- только после этого планировать Facebook.

## Метрики пилота

### Надёжность

- 100% публикаций имеют source version и approval;
- 0 дублей из-за retry;
- не менее 95% publish jobs завершаются без ручного восстановления;
- 100% ошибок видимы в очереди.

### Редакционное качество

- не менее 70% draft принимаются после review;
- медианный edit distance ниже 35%;
- 0 опубликованных неподтверждённых high-risk claims;
- не менее 80% источников доступны reviewer одним переходом.

### Производительность

- время от выбранной темы до review-ready draft сокращено минимум на 50%;
- общее человеческое время на материал сокращено минимум на 30%;
- один утверждённый замысел даёт две согласованные channel variants без повторного ручного написания.

### Обучающий цикл

- reflection содержит данные, confidence и следующий тест;
- минимум две гипотезы реально изменили последующие briefs;
- выводы не сравнивают несопоставимые каналы без нормализации.

## Последовательность расширения

1. PattayaDom + FamilyOS + Telegram.
2. SoulArchitecture + FamilyOS + Telegram.
3. AI Notes + FamilyOS, пакетное review.
4. Facebook Page adapter.
5. Унификация approval UI.
6. Публичный adapter SDK и generic REST adapter.
7. Внешний пилот.
8. Решение об open source release.
9. Решение о SaaS.

## Технические ADR, которые потребуются до кода

- отдельный repo или bounded service в monorepo;
- Postgres против MySQL;
- Go против TypeScript/Python для core;
- собственный worker против LangGraph/Temporal;
- модель credentials/scopes для FamilyOS API key;
- формат rich text между canonical Markdown и HTML/Tiptap;
- стратегия изображений и лицензирования;
- правила сохранения внешних источников;
- метрики, доступные для каждого канала и их denominators.

## Рекомендуемые решения по умолчанию

- отдельный репозиторий после пилота; на пилоте допустим отдельный deployable service рядом с FamilyOS;
- Postgres для Content Loop;
- TypeScript для API/workers и общего кода с review UI;
- собственный явный workflow/state machine в MVP;
- n8n только для расписаний и временных интеграций;
- LangGraph при появлении сложных interrupts и replay;
- canonical Markdown + adapter renderers;
- запрет прямой записи в FamilyOS DB;
- обязательный approval на весь пилот.
