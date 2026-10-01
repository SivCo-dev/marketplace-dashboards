# Missing API fields / Phase 5.1
No backend change is part of this phase. These are concrete contract proposals for later approval.

## Must-have for the full multi-marketplace management MVP
| Fields / prepared contract | Why needed | Current UX |
|---|---|---|
| `marketplace_coverage[]: marketplace, connection_status, data_available, refreshed_at`; consolidated `ALL` economics, units and expense structure | Distinguish a partial total from all connected platforms. Totals and cross-platform economics must be prepared server-side. | ALL explicitly means Ozon-only available coverage; WB/Yandex show unavailable. |
| `product_id` identity shared across marketplaces + `marketplace_skus[]` with economics and statuses; prepared product ALL totals | Product drawer across marketplaces without adding marketplace rows or guessing SKU matches in JS | Ozon detail only; other tabs have empty states. |
| `history[]: month, period_complete, coverage, close_status, revision, net_sales, sales, marketplace_expenses, expense_rates, result_without_compensation, result_after_cogs` | Three preceding complete months plus current month; consistent definitions and period comparability | July/August blank, actual September export, October LIVE incomplete. |
| `comparison: comparable, reason, previous_month, rate_delta_pp_by_group, amount_delta_by_metric` | Expense efficiency deltas in percentage points, not misleading amount-only comparisons; avoid complete-month versus partial-month deltas | Comparison unavailable, no invented arrows/deltas. |
| `category_id, category_name` on product rows, tenant-scoped categories | Category filtering and later category analytics | Disabled select says categories are not supplied; activates from data when present. |
| Documented null semantics for `expense_structure.allocated_shared` | Some account categories are null while corresponding SKU allocations are explicitly zero. Do not infer zero from missing data. | Account null remains dash; SKU explicit zero shown as zero. |

These fields are NOT blockers for reviewing the implemented Ozon-only UX.

## Desirable next
| Field | Purpose / current behavior |
|---|---|
| `written_off_units, written_off_amount, ordered_units, delivered_units, returned_units` with provenance/status | Operational metrics remain unavailable. Financial returns are shown separately and accurately. |
| `result_after_cogs_per_financial_unit` | Show net unit profitability without reconstructing economics in frontend; shell is present in drawer. |
| `received_per_unit`, with explicit settlement/cash definition and denominator | Current `net_sales_per_financial_unit` is labeled net sales per unit, never bank receipts. |
| Product `history[]` with stable product/marketplace identity, period completeness and expense rates | Full product trend view; only actual exported months shown today. |
| Prepared marketplace share percentages with denominator/coverage | Ozon is marked 100% of available positive net sales only; no claims about missing marketplaces. |
| Final enrichment readiness and authoritative `final_business_result` | Do not label after-COGS result final profit. NOT_APPLICABLE business expenses are a state, not a zero-expense KPI. |
| `available_months` / reporting calendar | Replace the scoped September/October review config with dynamic available periods at authenticated cutover. |

## Existing fields reused
All cash amounts, COGS, allocations and per-financial-unit amounts come directly from v2.
Only display ratios (absolute expense / positive sales), counts, sorting and filtering run in JS.
Financial data from legacy RPCs, Daily, v1 or n8n is never used.
