# Phase 5.1 — Monthly UX redesign
Status: READY FOR PRODUCT REVIEW (bounded data export; no production cutover).

## Visual iteration — executive dashboard

The shadow frontend now uses the approved warm green/beige executive layout:

- six compact KPI cards;
- a factual “100 ₽ of sales” allocation view;
- a comparison panel that stays explicitly unavailable until comparable history exists;
- expense structure and a financial bridge;
- one product worklist with single-select modes for all products, leaders, largest marketplace expenses, growth, decline, negative after COGS, and expense-only;
- growth/decline remain disabled when the contract has no comparable closed month.

No production `/monthly/` route, v1 API, Edge Function, database object, or n8n workflow was changed by this visual iteration.

## A. What was wrong with the current UI
The previous view prioritized technical state labels and equal-weight KPI cards.
It had no product drawer, meaningful SKU triage, marketplace comparison or monthly context.
Local fixtures contained only three products per tenant and substituted zero returns/shared allocations.
Those fixtures were removed and replaced with an exact, encrypted export of the v2 contract.

## B. New information architecture
Chosen approach: outcome first, causes second, product-level investigation third.
A persistent sidebar and a larger accounting grid were rejected: both consume space before answering the main management question.
The hero highlights the current result after COGS, paired with a compact sales-to-result summary.
Expense load, losing-product count and leading SKU provide three immediate investigation paths.
Lifecycle implementation details sit in an expandable data-state section; meaningful closed/LIVE and pending-layer cues stay visible.

## C. Main user flow
1. Open the private review link directly; select tenant and month.
2. Read after-COGS result, net sales, expenses, marketplace result and COGS.
3. Follow expense load or losing-SKU insight to investigate.
4. Compare marketplace coverage and expense rates.
5. Search/sort/filter products; inspect a product without leaving the report.
6. Use four-month context, preserving unavailable history and incomplete LIVE semantics.

## D. Product card flow
Native modal drawer with independent vertical scrolling, Escape dismissal, focus containment and focus return.
Ozon/ALL show the exact product economy, financial sale/return/net units, cost, compensation state,
direct/shared allocation and API-provided per-unit values.
WB/Yandex show a dedicated unavailable state; no cloned or synthesized data.
The mobile drawer fills the viewport. Desktop report remains visible behind the modal.
Missing write-offs and after-COGS-per-unit values are marked unavailable.

## E. Marketplace expense analysis
Five categories appear as a composition bar, absolute amounts and rates against gross sales.
Click a category to see its direct/shared split and top three SKUs by that expense.
Marketplace comparison exposes actual Ozon data and connection gaps for WB/Yandex.
Product search, result/expense/sales sorting, negative-result and expense-only filters retain all source rows.
The category filter is present but disabled when its source fields are missing.

## F. Missing backend data
See API_GAPS.md for exact fields and priority. Main gaps: consolidated multi-marketplace contract,
identity mapping, categories, comparable historical periods/deltas, operational metrics and
an authoritative after-COGS-per-unit value. Backend was not modified to fill these gaps.

## Data integrity
Read-only extraction of reporting.get_monthly_api_payload_v2, the internal contract used by monthly-data-v2.
Four untouched JSON payloads: W and CPR × September and October 2026.
September: W 57 SKU; CPR 9 SKU. Full SKU-to-account reconciliation passes to the kopeck for
sales, returns, net sales, marketplace expenses, marketplace result, COGS and after-COGS result.
W retains seven expense-only SKU. September immutable revision 1 metadata is unchanged.
October remains LIVE / SHADOW_CURRENT / data_available=true / WAITING_FOR_FINANCE, with null finance values.

| Tenant | Net sales | Marketplace result | COGS | After COGS |
|---|---:|---:|---:|---:|
| W | 6,387,302.00 | 2,034,525.91 | 1,958,207.00 | 76,318.91 |
| CPR | 7,159,659.00 | 2,536,482.50 | 1,169,100.00 | 1,367,382.50 |

## Shadow access
No login/register UX, Auth users or memberships provisioned.
AES-256-GCM ciphertext is published; a private URL fragment carries the export decryption key.
The key stays out of Git and is never sent as a query parameter. Referrer policy is no-referrer;
the shadow page has no external scripts, fonts, telemetry or API calls.
The capability opens only this bounded export, not the API or database. The timestamp is visible.
This is an explicit dev/review adapter, not evidence of live authenticated API end-to-end success.
Existing production auth adapter is retained separately; backend Edge monthly-data-v2 remains version 2,
ACTIVE and verify_jwt=true.

## QA
- Automated exact control and full SKU reconciliation: PASS.
- Null/zero semantics, sorting/filtering and expense-only retention: PASS.
- Encrypted round-trip and invalid-key rejection: PASS.
- Desktop 1440×1000: W/CPR September, October, expense drill-down and drawer: PASS.
- Mobile 390×844: W/CPR overview, LIVE state and product drawer: PASS.
- Drawer scroll changes its own scroll position while background stays fixed: PASS.
- Search, marketplace tabs, unavailable WB, category-unavailable cue and Escape dismissal: PASS.
- Bare URL and wrong key reveal no finance; no login screen exists: PASS.
- Browser console errors during local review: none.

Screenshots are delivered in the private workspace phase5/screenshots directory to avoid
publishing financial screenshots in the public repository.

## Untouched
Production /monthly/, monthly-data-v1, Monthly backend, lifecycle, Auth/memberships,
Daily, Weekly, Orange, n8n, Telegram and Finance classification.
No production cutover.
