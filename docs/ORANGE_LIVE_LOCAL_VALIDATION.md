# Orange LIVE local validation — 2026-10-05

## Scope and limitations

Validated the actual migration, transactional SQL suites, concurrent calls and
rollback in isolated PostgreSQL 16.15, UTF-8, JIT disabled. Production is
PostgreSQL 17.6.1.166. Production SQL/functions were only read; no SQL migration
was applied there and no paid Supabase branch was created.

The clone contained copied real current/yesterday RAW revisions and complete
Orange/W/CPR snapshots. Lookup views were frozen into local tables; lookup
indexes were added locally. Readiness clocks were advanced in the clone to keep
fixed fixtures eligible. Snapshot history was seeded with one current snapshot
per tenant; it did not contain the full 552 MB production history. These compute,
view-plan and history differences mean local timings cannot establish a
production performance SLA. Production source secrets were not exported.

| Fixture | Rows |
| --- | ---: |
| Ozon RAW revisions for 4–5 October | 368 |
| Other marketplace RAW revisions for 4–5 October | 67 |
| Orange identity lookup rows | 6,577 |
| Latest Ozon stock rows across tenants | 7,185 |
| Orange SKU daily / dimensions | 9,192 / 2,047 |
| W SKU daily / dimensions | 981 / 64 |
| CPR SKU daily / dimensions | 315 / 12 |

The original production function bodies were copied into the clone before the
migration. The original canonicalizer and publisher were used as references.
Fixture data and exported function/table dumps are private and are not committed.
The test container required a startup UID shim because it cannot switch OS users;
it changes the root startup guard only, not query execution or SQL semantics.

## Actual local results

Full call timing includes order aggregation, enrichment, canonicalization checks,
current/history writes, trigger execution and publication. Cold means the order
fingerprints were cleared before the measured call; it is not a cold OS cache.

| Tenant | Order rebuild | Unchanged | Loader heartbeat only |
| --- | ---: | ---: | ---: |
| Orange | 3,103.874 ms | 996.317 ms | 1,557.770 ms |
| W | 114.434 ms | 43.580 ms | 64.056 ms |
| CPR | 79.995 ms | 32.031 ms | 43.501 ms |

Passed:

- SQL source parity, daily/SKU/line totals, per-account order counts and preservation
  of closed daily/SKU/line content during order/stock-only rebuilds.
- Equal content and heartbeat-only calls preserve snapshot version, history,
  publication/data timestamps while health advances. First calls cannot silently
  reuse cached order fingerprints or pass against missing source fixtures.
- One account quantity/GMV revision changes only its source block; replay adds
  no second publication. Numeric scale and irrelevant source timestamps do not
  trigger a commercial publication.
- Changed available/reserved stock publishes with unchanged order arrays and
  order fingerprints; the repeated checkpoint is idempotent.
- Readiness failure rolls back and preserves the complete snapshot/history.
- Bulk canonicalizer matches the original result on the whole Orange payload.
  Changed SKU/dimension arrays carrying copied markers still canonicalize.
  An identity lookup change without new orders updates canonical SKU once and
  is idempotent on replay. The local lookup case uses a materialized test table;
  a Supabase branch must exercise its actual identity revision path as well.
- A concurrent holder of the **existing full publisher's** advisory lock returns
  the complete fallback promptly, without writes. Competing builders produce
  one effective version/history publication; replay is idempotent.
- Rollback preserves current snapshots and history, removes all added helpers,
  restores the original trigger/builder, and the restored builder executes.
- Three Node columnar/metadata/deployed-n8n patch checks; `git diff --check`.

SQL suites: `orange_live_snapshot_v2.sql`, `_write.sql`, `_runtime.sql`,
`_scenarios.sql`. Concurrent processes: `orange_live_snapshot_v2_concurrency.py`
requires `LIVE_TEST_ALLOW_WRITES=isolated-local` and a loopback `PGHOST`.

## Production read-only reconciliation

The optimized parameterized RAW query was executed as a read-only CTE and
compared with `core.daily_order_rows_v2` over the complete production RAW
history, for Orange/W/CPR together. `EXCEPT ALL` compared every returned field,
including source identity, timestamps, state, quantities and GMV.

| Report date | Optimized rows | Existing rows | Differing rows |
| --- | ---: | ---: | ---: |
| 2026-10-05 | 117 | 117 | 0 |
| 2026-10-04 | 148 | 148 | 0 |

This proves row-source parity for those dates, not publication runtime.

## Corrections found by testing

1. `queryBatching=single` concatenates SQL per input; it does not deduplicate
   calls. The deployed n8n nodes require `executeOnce=true`.
2. Source health now includes `source_refresh_status.last_success_at`, which
   W/CPR Ozon loaders use, in addition to RAW and Orange loader clocks.
3. LIVE and full publication now share `hashtext(tenant || '|daily-full')`;
   incompatible lock keys would permit simultaneous competing publications.
4. Canonical content hashes alone do not detect changed lookup mappings. A
   checkpoint covers identity/article, category and brand sources, and a bulk
   canonicalizer resolves those changes before content/version comparison.
5. Stock checkpoints cover each cabinet/type (and Yandex warehouse), with the
   current Moscow valuation date. Yesterday's morning report retains the
   original current-date 14-day stock-sales window; a date rollover invalidates
   that window even when no new stock capture arrives.
6. SQL regression checks use the current report date, accept zero-sales cabinets
   without SKU rows and count colliding order IDs independently by account.

## Remaining release gate

The paid branch remains unapproved. The full SQL migration is not merged or
installed in Production. Before SQL deployment, measure and reconcile the full
chain on isolated Supabase PostgreSQL 17 fixtures with actual view definitions,
representative RAW/history size and the closed-day policy/revision ingestion
paths. Exercise identity and stock revisions through the branch's real source
constraints. Record actual runtime and review rollback before release.

Local success closes the local implementation/check stage; it does not close
that Supabase release gate. The deployed n8n change is independently verified.
