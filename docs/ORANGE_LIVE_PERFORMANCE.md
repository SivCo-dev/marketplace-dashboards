# Orange LIVE snapshot performance

Date: 2026-10-05 (Europe/Moscow). Production was inspected read-only; no production migration or workflow edit was applied.

## Incident finding

The n8n Postgres node was invoked once per incoming item. The Ozon child workflow emitted four items, so n8n sent four copies of the same `refresh_live_snapshot_v2` statement in one execution. PostgreSQL logs show the concatenated statement four times. At 16:40 the first call reached `trg_canonicalize_orange_dashboard_snapshot`; the statement timed out after 211 seconds. At 21:40 individual calls logged 107.9 s, 88.2 s, 72.8 s, and 53.2 s before the five-minute workflow limit canceled the execution.

The expensive path was:

1. `core.daily_order_rows_v2` deduplicated the complete raw history before the report-date predicate became effective.
2. `enrich_live_snapshot_sources_v2` rechecked `expected`/`actual` from 2026-09-28 and expanded complete `sku_daily` and `lines` arrays.
3. Stock enrichment scanned 161,584 Orange Ozon stock rows and spilled its sort to temporary storage.
4. Publication updated the 2.3 MB Orange payload, firing a trigger that canonicalized all 9,190 `sku_daily` rows and all dimensions again.
5. Steps 1-4 were repeated four times by the n8n node.

## Measurements

These are component-level production read-only measurements, **not** the runtime
of `refresh_live_snapshot_v2` or evidence that the whole publication meets 60s.
The complete SQL runtime gate is still pending execution on a seeded development
branch. No end-to-end improvement or production acceptance is claimed yet.

All plans used `EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)` on read-only queries.

| Segment | Before | Optimized equivalent / behavior |
| --- | ---: | ---: |
| Orange current-day order aggregation | 2,875.6 ms; 187,223 shared hits | 12.8 ms with predicates before `DISTINCT ON` (about 225x faster) |
| Historical expected/actual check from 2026-09-28 | 1,122.7 ms; 187,083 shared hits; 535 temp blocks | Removed from LIVE; retained for deferred reconciliation |
| Ozon latest-stock discovery and aggregation | 1,443.8 ms; 161,584 rows scanned; external merge | Rebuilt only when the stock checkpoint changes; supporting latest-by-type index added |
| Snapshot trigger/canonicalization | 53-108 s per repeated call in incident logs | Current-day SKU rows canonicalized once; payload marker prevents full trigger replay |
| Duplicate snapshot calls per n8n run | 4 | `queryBatching: single`, plus source fingerprints and advisory lock |

Snapshot sizes at the incident point:

| Tenant | Payload | daily | sku_daily | lines | stocks |
| --- | ---: | ---: | ---: | ---: | ---: |
| ORANGE v133 | 2,339,410 bytes | 1,083 | 9,190 | 10,592 | 5,771 |
| W v975 | 203,982 bytes | 97 | 981 | 1,820 | 149 |
| CPR v351 | 93,084 bytes | 97 | 315 | 2,640 | 4 |

`dashboard_snapshot_history` occupied 552 MB; Orange `daily-full` history alone contained 279 MB of JSON payloads. This PR does not delete history or alter retention.

## Design

- `live_order_rows_v2(tenant,date)` filters tenant/date before latest-revision selection.
- `refresh_live_snapshot_v2` takes a non-waiting transaction advisory lock and computes per-account fingerprints from normalized commercial rows and the report date/account scope. Loader heartbeat timestamps and source timestamp changes that do not affect cancellation eligibility are excluded. Product-name changes and cancellation eligibility remain included. Only changed marketplace/cabinet blocks for the LIVE date are replaced.
- Current-day `daily`, `sku_daily`, and `lines` are built together. Closed dates are copied unchanged.
- `enrich_live_snapshot_fast_v2` keeps historical verification out of the SLA path and refreshes stocks only when their source checkpoint changes.
- `last_success` and `source_data_at` are returned separately. `freshness_state=no_new_commercial_events` explicitly covers a successful loader with older commercial events.
- `publish_live_snapshot_v2` atomically writes history/current rows without running closed-day reconstruction. Full/daily publication continues to use the existing publisher.
- The last complete snapshot is never cleared, so it remains the read fallback during a skipped or failed build.

## Review corrections and acceptance status

- Heartbeat-only refreshes update health metadata and check changed stocks without
  rebuilding order arrays. The publisher keeps version, history, `published_at`,
  `generated_at`, `data_as_of` and `source_as_of` unchanged for equal non-meta content.
- A copied `canonicalization_version` alone no longer bypasses canonicalization.
  A content hash of the canonical SKU and dimension arrays validates the shortcut;
  full/closed-day publishers changing either array go through canonicalization.
- `supabase/tests/orange_live_snapshot_v2_runtime.sql` measures the complete call
  externally with `clock_timestamp()`, including triggers and publication writes.
  It covers Orange/W/CPR, unchanged calls, heartbeat-only calls, timestamp stability,
  raw/daily/SKU/line reconciliation and copied-marker safety. It fails if fixture
  data is absent. `meta.build_timings_ms.pre_publish_total` remains a component
  metric, not the end-to-end gate.
- Local columnar/metadata/n8n patch tests passed. **Branch SQL runtime tests have
  not run**. Single-cabinet mutations, concurrent calls, stock changes and failure
  fallback remain mandatory branch checks before approval.
- Production and n8n remain unchanged. Merge/rollout is still blocked until the
  seeded branch gate passes and the results are reviewed.

The Supabase project is PostgreSQL 17.6.1. The 2026-09 Supabase PostgreSQL minor-release notice should be reviewed before deployment because projects using `ltree`, `pgcrypto`, `btree_gist`, or custom operators may require follow-up reindexing or validation; this migration does not use those extensions.
