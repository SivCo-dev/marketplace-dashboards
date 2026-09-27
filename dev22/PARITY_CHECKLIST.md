# DEV 2.2 parity checklist — Orange PROD 2.0

Reference: current stable Orange PROD `index.html`. The DEV implementation was compared block-by-block against that source and in the browser. All tenants use the same `core/dashboard-core.js` and `core/dashboard.css`.

| Area | Orange PROD 2.0 | DEV 2.2 result |
|---|---|---|
| Header and status | Dashboard title, source freshness | Preserved; DEV identity added |
| Filters | Cabinet, period, marketplace, master category, category, brand, SKU/name search | Preserved |
| KPI cards | GMV, units, orders, average price, expected received, GMV/day | Preserved except the explicitly removed `Ожидаемо получено`; five cards remain |
| Order dynamics | GMV/units chart and point details | Preserved; approved closed-day rule applied and LIVE is a separate point without delta |
| Problems | Price delta, GMV delta, stock, content score, signal | Preserved |
| TOP by GMV | SKU, GMV, units, price, stock/days, marketplace share; minimum 2 units | Preserved |
| Movers | All/growth/decline modes; units, unit delta, price delta, GMV, GMV delta, content, marketplace share | Preserved |
| All SKU | Marketplace-dependent columns, limits, clickable rows | Preserved |
| Quick SKU search | Search outside TOP lists | Preserved |
| SKU card header | Article/name, state, category, brand, marketplace links | Preserved |
| SKU card overview | Marketplace switch, GMV/share, units, average/current price and delta, stock and stock days | Preserved |
| Marketplace economics | Commission, logistics, received amount and marketplace-specific fields | Preserved where supplied by the tenant snapshot |
| Visibility and ads | Position/visibility and advertising data | Preserved where supplied by the tenant snapshot |
| Content | Score, component breakdown and issues | Preserved where supplied by the tenant snapshot |
| SKU dynamics | Marketplace/metric switches, history chart and point details | Preserved |
| `Что изменилось` | Present in PROD | Explicitly removed in DEV by approved requirement |

## Cross-tenant verification

- ORANGE, W and CPR load the same Core and stylesheet through thin entrypoints.
- Layout, blocks, filters, tables and SKU card are structurally identical.
- Tenant differences are limited to names/accounts, explicit SKU aliases and fields actually available in each live DEV snapshot.
- Missing marketplace links, ads, positions or content values render as unavailable; no substitute or inferred data is generated.
- Snapshot `canonical_sku` is authoritative; explicit aliases apply only when it is missing, then exact `external_sku` is the fallback.
- LIVE is visible only on the order dynamics chart and is excluded from KPI, comparison, TOP, movers, risks and all-SKU calculations.

