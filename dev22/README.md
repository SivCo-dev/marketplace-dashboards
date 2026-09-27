# Marketplace Dashboard DEV 2.2

Изолированный static DEV-контур для ORANGE, W и CPR. Визуальная система и основные блоки повторяют текущий Orange Orders Control 2.0, но весь UI и расчёты фронтенда находятся в одном Dashboard Core.

## Entry points

- `https://sivco-dev.github.io/marketplace-dashboards/dev22/orange/`
- `https://sivco-dev.github.io/marketplace-dashboards/dev22/w/`
- `https://sivco-dev.github.io/marketplace-dashboards/dev22/cpr/`

При локальном запуске из корня проекта на порту 4173:

- `http://127.0.0.1:4173/dev22/orange/`
- `http://127.0.0.1:4173/dev22/w/`
- `http://127.0.0.1:4173/dev22/cpr/`

## Ownership

- `core/dashboard-core.js` — единственная реализация UI, фильтров, агрегации, KPI, графика, рисков и карточки SKU.
- `core/dashboard.css` — единая визуальная система на основе Orange.
- `config/*.js` — только tenant identity, accounts, theme, data URL и explicit SKU aliases.
- `data/*.json` — fixtures только для автоматических тестов; runtime их не читает.
- `orange|w|cpr/index.html` — тонкие entrypoints; бизнес-логики в них нет.

## Live DEV snapshots

Все tenants читают отдельную Supabase Edge Function `dashboard-data-dev22`, защищённую проверкой JWT. Функция получает только complete `daily-full` snapshots из `dev21.dashboard_snapshots` через отдельный read-only RPC и возвращает сокращённый frontend payload.

| Tenant | Runtime endpoint |
|---|---|
| ORANGE | `https://tcefrvybgulcwwsdarcw.supabase.co/functions/v1/dashboard-data-dev22?tenant=ORANGE` |
| W | `https://tcefrvybgulcwwsdarcw.supabase.co/functions/v1/dashboard-data-dev22?tenant=W` |
| CPR | `https://tcefrvybgulcwwsdarcw.supabase.co/functions/v1/dashboard-data-dev22?tenant=CPR` |

PROD Edge Function `dashboard-data`, PROD snapshots и production Pages entrypoints не используются и не изменяются.

## Closed-day analytics

- `7 / 14 / 30 дней` означают последние 7 / 14 / 30 дат с `is_live = false`.
- `Текущий месяц` считается с первого числа до последнего закрытого дня.
- Предыдущий период содержит такое же число закрытых дней.
- Если хотя бы одна строка даты помечена `is_live`, вся дата исключается из KPI, сравнений и SKU-таблиц.
- LIVE добавляется только в график. Клик показывает GMV, штуки и заказы; Δ для LIVE не рассчитывается.

## Canonical SKU contract

Normalized frontend model всегда содержит оба поля:

| Поле | Назначение |
|---|---|
| `external_sku` | Исходный SKU конкретного marketplace/account без изменения значения |
| `canonical_sku` | SKU, по которому Core объединяет строки для аналитики и UI |

Правило разрешения едино для ORANGE, W и CPR:

1. Если live snapshot уже содержит непустой `canonical_sku`, используется это значение без изменения.
2. Только если snapshot canonical отсутствует, применяется explicit alias для `marketplace + account_id + external_sku`.
3. Если отсутствуют и snapshot canonical, и explicit alias, `canonical_sku = external_sku`.
4. Никакие fuzzy match, очистка знаков, case folding, prefix/suffix heuristics или автоматические merge не выполняются.

Изменение canonical SKU разрешено только явной строкой в `sku_aliases`:

```js
{ marketplace: "OZON", account_id: "ozon_orange_market_ipt", external_sku: "TU", canonical_sku: "TUW" }
```

Поддержаны scoped aliases (`marketplace + account_id`) и явно заданные wildcard aliases. Дубликат alias останавливает запуск с ошибкой. После нормализации каждая строка передаётся в UI одновременно с `external_sku` и вычисленным `canonical_sku`.

## Data contract

Минимальный source snapshot:

```json
{
  "meta": {"tenant_id": "ORANGE", "generated_at": "ISO-8601"},
  "sku_daily": [{
    "report_date": "YYYY-MM-DD",
    "marketplace": "OZON",
    "cabinet": "Market IPT",
    "account_id": "optional-if-resolvable-from-config",
    "external_sku": "TU",
    "product_name": "Product",
    "orders": 1,
    "units": 1,
    "gmv": 1000,
    "stock": 10,
    "category": "Category",
    "brand": "Brand",
    "is_live": false
  }]
}
```

После `normalize()` Core использует следующий обязательный frontend shape:

```json
{
  "tenant_id": "ORANGE",
  "marketplace": "OZON",
  "account_id": "ozon_orange_market_ipt",
  "cabinet": "Market IPT",
  "external_sku": "TU",
  "canonical_sku": "TUW",
  "report_date": "2026-09-26",
  "orders": 1,
  "units": 1,
  "gmv": 1000
}
```

`canonical_sku` в этом примере может прийти непосредственно из snapshot. Explicit alias `TU → TUW` используется только если snapshot canonical отсутствует; без обоих источников оба значения были бы `TU`.

## Checks

Run `npm test` inside `dev22`. Tests protect the canonical SKU rule, closed-day/LIVE separation, shared Core, test-only fixtures and absence of PROD n8n URLs in runtime files.

See [PARITY_CHECKLIST.md](./PARITY_CHECKLIST.md) for the block-by-block Orange PROD 2.0 comparison and [PROD_ROLLBACK.md](./PROD_ROLLBACK.md) for the immutable PROD baseline.
