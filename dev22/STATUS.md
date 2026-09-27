# Marketplace Dashboard 2.2 — status

Статус: DEV 2.2 Orange PROD 2.0 functional parity baseline ready for visual review. Production не изменён.

Сделан отдельный DEV-контур для ORANGE, W и CPR. Все три dashboard используют один общий Core и различаются только tenant-конфигурацией и доступностью данных. Полный UI и функциональная карточка SKU восстановлены по текущему Orange Orders Control 2.0; блок-за-блоком результат зафиксирован в `PARITY_CHECKLIST.md`. KPI-блок содержит пять карточек; блоки `Ожидаемо получено` и `Что изменилось` отсутствуют.

Canonical SKU работает по новому контракту: без alias значение равно `external_sku`; alias применяется только из явного mapping. В runtime DEV нет PROD webhook URL.

Runtime подключён к отдельной JWT-protected Edge Function `dashboard-data-dev22`. Она читает complete `daily-full` snapshots только из namespace `dev21.dashboard_snapshots` через read-only RPC. Fixtures сохранены только для тестов и не используются tenant configs.

LIVE-дата исключается из KPI, средних, сравнений, TOP, рисков и списка SKU. Периоды 7/14/30 и текущий месяц формируются только из закрытых дат; LIVE остаётся одной оперативной точкой графика с GMV, штуками и заказами без Δ.

Rollback PROD исправлен: штатная точка возврата — последний стабильный GitHub Pages deployment с Supabase snapshots. Старые n8n workflow ID/URL/SHA-256 сохранены отдельно только как legacy emergency fallback.

## Проверка baseline 2026-09-27

- 18/18 canonical SKU, architecture, Orange parity and LIVE-day tests passed.
- ORANGE, W и CPR проверены в браузере на периоде 7 дней: 7 closed points + 1 LIVE point.
- Все tenants используют Orange accent `#f47b20` и единый stylesheet.
- Browser console: 0 errors/warnings для ORANGE, W и CPR.
- Visible runtime errors: 0 для каждого tenant.
- Runtime scan: PROD n8n URL отсутствуют в core/config/entrypoints/data.
- Текущий PROD read-only verified: GitHub Pages `SivCo-dev/marketplace-dashboards` + Supabase Edge Function `dashboard-data`.
