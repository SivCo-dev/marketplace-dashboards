# PROD rollback baseline

Дата проверки: 2026-09-26. PROD в этой задаче не изменялся.

## Текущий PROD

Текущий production dashboard — статический frontend на GitHub Pages, который читает готовые tenant snapshots через Supabase Edge Function. n8n webhook не является текущим PROD dashboard transport.

### GitHub Pages frontend

Репозиторий: `SivCo-dev/marketplace-dashboards`  
Последняя проверенная опубликованная ревизия: `2490c7d9ae3e6acf305b1bb5cecb7f7453f8848f`

| Tenant | Текущий PROD URL |
|---|---|
| ORANGE | `https://sivco-dev.github.io/marketplace-dashboards/` |
| ORANGE, explicit page | `https://sivco-dev.github.io/marketplace-dashboards/orange.html` |
| W | `https://sivco-dev.github.io/marketplace-dashboards/w.html` |
| CPR | `https://sivco-dev.github.io/marketplace-dashboards/cpr.html` |

### Supabase snapshot API

Edge Function:

```text
https://tcefrvybgulcwwsdarcw.supabase.co/functions/v1/dashboard-data
```

Проверенные frontend requests:

| Tenant | Snapshot request |
|---|---|
| ORANGE | `tenant=ORANGE&kind=daily-full` |
| ORANGE enrichment | `tenant=ORANGE&kind=ozon-enrichment` |
| W | `tenant=W&kind=daily-full` |
| CPR | `tenant=CPR&kind=daily-full` |

Frontend не обращается напрямую к PostgreSQL и не запускает n8n при открытии страницы.

## Правильный rollback после будущего DEV 2.2 cutover

Rollback target — последний подтверждённый стабильный GitHub Pages PROD, а не старая n8n-архитектура.

1. Вернуть пользовательские ссылки на соответствующие GitHub Pages URL из таблицы выше.
2. Вернуть Pages deployment на последнюю подтверждённую стабильную ревизию. На дату проверки baseline — `2490c7d9ae3e6acf305b1bb5cecb7f7453f8848f`.
3. Сохранить Supabase snapshot API `dashboard-data` источником данных и проверить tenant/kind из таблицы.
4. Проверить Orange, W и CPR read-only: загрузку snapshot, freshness и основные KPI.
5. Не включать n8n dashboard webhooks как штатный rollback path.
6. Не удалять DEV 2.2 до завершения reconciliation и фиксации решения о rollback.

Сейчас rollback не выполнялся: redirect, cutover, Pages deployment, Supabase и production-файлы не менялись.

## Legacy emergency fallback — не текущий PROD

Ниже сохранены старые n8n dashboard entrypoints только для аварийной диагностики исторического контура. Они не являются текущим PROD и не должны использоваться как обычный rollback target.

| Tenant | Legacy workflow | Workflow ID | Legacy emergency URL | Snapshot SHA-256 |
|---|---|---|---|---|
| ORANGE | Orange \| Orders Dashboard Main 2.0 Stable | `QH63SvrlmmfnP5uf` | `https://mazagnom.app.n8n.cloud/webhook/orange-orders-dashboard` | `FD3285892D78292218C98EB9878B00C2CE28348744B0EF00DD250031F73BCD0C` |
| W | Ozon W \| Orders Dashboard v1.8 | `8FZSdSwxAyEKH7vX` | `https://mazagnom.app.n8n.cloud/webhook/ozon-w-orders-dashboard-1x` | `56FC40E47929B38E76EF36E6D5CFB6F4F76C68895699FC3AFBDB154650A2F765` |
| CPR | Ozon CPR \| Orders Dashboard v1.8 | `TAPze0p3yHmITfAs` | `https://mazagnom.app.n8n.cloud/webhook/ozon-cpr-orders-dashboard-1x` | `784F1AD6C1CCE3F903AE4BF1F46FE2A6F4DCDE00B44706BB1A2144CD2F215C67` |

Использование legacy fallback требует отдельного решения владельца, потому что оно возвращает dashboard traffic в n8n и меняет эксплуатационную архитектуру.
