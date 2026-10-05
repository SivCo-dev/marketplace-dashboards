# Orange LIVE Supabase validation and rollout — 2026-10-06 MSK

## Outcome

The isolated Supabase gate passed. Migration `orange_live_snapshot_optimization`
was applied to Production. Installed refresh function hash:
`cf86afbe89c16be7abf4641184f2dc4f`.

Before/after commercial hashes, snapshot versions, generated/published timestamps
and all 1,469 history rows were unchanged by migration and transactional smoke
checks. Orange/W/CPR retained versions 134/975/351. The n8n execute-once/single
batching fix remains unchanged; no ingestion workflow or message was triggered.

## Independent environment and fixtures

User approved a temporary branch in the existing organization, within a $1
budget. Confirmed branch compute rate: $0.01344/hour. Branch creation was
2026-10-05 21:33:50 UTC; the branch was deleted after verification, and the
parent branch listing now contains only main. Invoice totals were not queried.

Branch PostgreSQL: 17.11 x86_64. Production: 17.6 aarch64. The branch used its
own database instance. These timings are not a Production SLA guarantee.

Copied 32 application/source tables, 12 real views and 10 original functions,
with original types, generated columns, indexes, checks and non-Auth foreign
keys. Auth user data were excluded. Public fixture tables had RLS enabled with
no client policies; anonymous/authenticated schema access to private schemas
was revoked. The security advisor returned only five informational no-policy
notices for those intentionally private public fixture tables.

Fixtures included full RAW history (14,565 Ozon and 2,809 other marketplace
revisions), 149 accepted/staged batch records with full JSON, 165,412 stock
rows, real identity/category/brand sources and all three complete snapshots.
Source data were read from Production; transfer used bounded batches and text
parts for large JSON because the connector enforces request-size/rate limits.

History was synthetic volume data: 1,460 rows filled with the copied complete
payloads, preserving current maximum versions. History physical size was
565,288,960 bytes; database size before migration was 694,452,751 bytes.
This exercises history cardinality/size, not reconciliation of historical
invoice amounts. Existing closure anchors used the copied closed-day blocks.

Tests fixed the report date to 2026-10-05 and passed it explicitly to builders;
Production clock/date behavior was unchanged. Later in the branch test, loader
success clocks were advanced after an existing source expired by age. Order
source timestamps and business values were retained.

## Full-chain runtime

Includes RAW aggregation, enrichment, canonicalization, trigger, current/history
writes and publication. Each SQL suite rolls back its data changes.

| Tenant | First full call | Unchanged | Loader heartbeat only |
| --- | ---: | ---: | ---: |
| Orange | 4,116.376 ms | 1,341.998 ms | 2,124.490 ms |
| W | 246.694 ms | 70.717 ms | 91.411 ms |
| CPR | 116.477 ms | 44.123 ms | 52.416 ms |

After rollback/reapplication the runtime gate passed again: first full calls
Orange 3,156.961 ms, W 215.271 ms, CPR 118.905 ms. The first call clears order
fingerprints; it is not a cold OS-cache measurement.

## Correctness and failure scenarios

Passed source parity, daily/SKU/line reconciliation, closed-block preservation,
unchanged/heartbeat idempotency, stock-only changes and readiness-failure fallback.
The bulk canonicalizer matched the original on the complete Orange payload.
Copied canonical markers did not bypass changed SKU/dimension arrays.

Scenario fixtures were corrected to use valid 32-character payload hashes and
real raw-table constraints. An identity-only change through
`core.business_products_v2` and the actual mapping views published once without
rebuilding order fingerprints; replay was idempotent.

A real staged batch was accepted by `raw.publish_order_batch_v2`. Two native
PostgreSQL cron workers started concurrently in backend PIDs 11129/11130;
returned versions were 135 and 136, with exactly one effective publication and
unchanged closed-day hash. Replaying the accepted batch inserted zero revisions.
The busy-lock fallback returned unchanged state in 1,003 ms including connector
round trip. Temporary cron jobs were unscheduled; zero remained before deletion.
MCP calls alone were not used as concurrency proof because they serialized.

The existing full publisher was exercised with a deliberately changed closed
GMV block and copied canonical marker. It restored the recorded closed-day data
and correctly canonicalized the changed arrays. All test changes rolled back.

## Rollback

Rollback preserved snapshots/history and removed fast helpers. The restored
builder executed successfully. The rollback file now uses the exact original
function text: hash `9c29d55b6e7658ea28f85eddd73dcfd3`, not merely equivalent
whitespace-reformatted SQL. Optimization was reapplied and the runtime gate
passed again. Three Node contract/n8n-patch checks and `git diff --check` passed.

## Production verification and limit

Preflight found zero active builders, original function hash intact, and no
anonymous/authenticated usage privilege on dev21. Migration installed successfully.
Transactional complete-pipeline checks: W 613.655 ms and CPR 194.624 ms; all test
writes rolled back. Orange's source age was already stale at night, so its call
was rejected at readiness and the complete fallback was preserved. Its rejected
12,970.382 ms call is not a successful full-pipeline runtime measurement.

Commercial hashes, versions, publication timestamps and history count remained
identical after those checks. No loader clock was altered in Production.
A successful Orange Production publication and scheduled n8n execution after
rollout still require observation when fresh source batches arrive. No forecast
or branch result is presented as proof of that future run.
