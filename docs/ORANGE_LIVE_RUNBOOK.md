# Orange LIVE runbook

## Current status

The n8n-only `executeOnce=true` + `queryBatching=single` fix is already published
and verified. It is independent of this pending SQL migration. No additional
retry configuration was deployed. Local PostgreSQL checks passed; see
[local validation](ORANGE_LIVE_LOCAL_VALIDATION.md). The user approved a temporary Supabase branch within a $1 budget. The
Supabase PostgreSQL 17 gate passed, the SQL migration is installed in Production,
and the test branch was deleted. See [Supabase validation](ORANGE_LIVE_SUPABASE_VALIDATION.md).

## Safe SQL rollout

1. Create/rebase a Supabase development branch from Production after confirming
   the branch billing rate. Branch creation copies migrations, **not production
   data**. Load fixed, consistent source/snapshot fixtures for Orange/W/CPR and
   verify all prerequisites exist before timing. Do not use empty-branch results
   or a production write as a replacement for this gate.
2. Apply `supabase/migrations/20261005191734_orange_live_snapshot_optimization.sql` to the branch only.
3. Run `supabase/tests/orange_live_snapshot_v2.sql`, the isolated transactional
   tests `supabase/tests/orange_live_snapshot_v2_write.sql` and
   `supabase/tests/orange_live_snapshot_v2_runtime.sql`,
   `supabase/tests/orange_live_snapshot_v2_scenarios.sql`, and
   `node --test tests/columnar-contract.test.mjs`.
4. Run one branch-only Orange refresh twice. The second call must return the same version quickly and must not add a history row.
5. Compare Orange/W/CPR GMV, units, orders, `daily`, `sku_daily`, `lines`, stocks, canonical SKU, master category, `source_health`, and the `format=columnar` response against Production for fixed dates.
6. Preserve the already-deployed n8n `executeOnce=true` + `queryBatching=single`
   settings. Query batching alone is insufficient. Do not add a retry policy
   or change ingestion schedules as part of this SQL rollout.
7. Deploy the database migration during a quiet window. Do not increase `statement_timeout` as the primary remedy.

## Mandatory runtime gate before merge

Run on the isolated branch with frozen source fixtures, preserving the baseline
snapshot and source definitions before applying the migration. Record branch
PostgreSQL version, compute size, fixture row counts and JSON sizes. Branch
performance is not a production SLA guarantee when compute differs.

The runtime test returns `first_full_call`, `unchanged` and
`loader_heartbeat_only` times for each tenant. Every complete LIVE call must be
under 60 seconds. Repeated/heartbeat-only calls must keep commercial payload,
version, publication timestamps and history count unchanged while health advances.
Compare current-day raw/daily/SKU/lines, source identities, canonical SKU,
master-category and all closed-day blocks with the saved baseline.

Also execute these isolated branch scenarios before approval:

- Change one account's source quantity/amount using a valid ingestion revision.
  Only that account/day block changes; other accounts and closed-day hashes stay
  equal. Repeat it to verify no second publication.
- Capture changed available/reserved stock with unchanged orders. Stocks update
  without rebuilding order blocks. Repeat with the same source checkpoint.
- In connection A acquire `pg_advisory_xact_lock(hashtext(
  'ORANGE|daily-full'))` inside a transaction. In connection B call the
  LIVE builder; it must return the completed version promptly, without writes.
  Release A, then run two competing builders and check one effective publication.
- Deliberately fail readiness or a branch fixture build in a subtransaction.
  The complete snapshot, version and history must remain intact after rollback.
- Exercise the existing full and closed-day publishers carrying copied metadata.
  Changed SKU/dimension arrays must canonicalize correctly; an unchanged
  canonical LIVE payload must avoid a second full canonicalization.

Store actual measurements and reconciliations in the PR. The local and isolated Supabase gates are
complete. SQL was deployed after the Supabase gate; see the validation report
for fixtures, timings, rollback and post-deployment evidence. The independently authorized n8n-only fix is deployed.

## Timeout diagnosis

Check the n8n execution and PostgreSQL logs for:

- the same snapshot SELECT concatenated or executed multiple times;
- context mentioning `trg_canonicalize_orange_dashboard_snapshot`;
- a waiting advisory lock or another active snapshot builder;
- `build_timings_ms` in the current snapshot metadata;
- `source_health[].last_success`, `source_data_at`, and `freshness_state` separately.

The 2026-10-05 incident signature was four identical calls caused by four incoming Ozon items. A loader success timestamp is not proof that commercial events are current.

## Supabase-only LIVE rebuild

This does not call Ozon or any n8n ingestion workflow:

```sql
select dev21.refresh_live_snapshot_v2(
  'ORANGE',
  (current_timestamp at time zone 'Europe/Moscow')::date
) as snapshot_version;
```

Run it once. If another builder holds the tenant lock, the function returns the last complete version immediately; retry the snapshot stage after 15 seconds, at most twice. Do not restart Ozon ingestion.

## Verify publication and fallback

```sql
select tenant_id,snapshot_kind,snapshot_version,is_complete,
       generated_at,source_as_of,published_at,
       payload#>'{meta,build_timings_ms}' as build_timings_ms,
       payload#>'{meta,source_health}' as source_health
from dev21.dashboard_snapshots
where tenant_id='ORANGE' and snapshot_kind='daily-full';

select tenant_id,snapshot_kind,snapshot_version,cycle_id,
       generated_at,published_at,is_complete
from dev21.dashboard_snapshot_history
where tenant_id='ORANGE' and snapshot_kind='daily-full'
order by snapshot_version desc
limit 5;
```

The dashboard must continue serving the latest row with `is_complete=true` if a new build fails. Monitor `meta.freshness_checked_at`, successful source-refresh clocks and readiness
against 11:00, 17:00 and 22:00 MSK. Unchanged orders deliberately preserve
`published_at`; it is not a heartbeat. `no_new_commercial_events` means a
successful loader without newer commercial events and alone is not an outage.
Missing/stale/failed source refreshes or a missing complete snapshot need an
alert. Alert delivery must not trigger ingestion.

## Capacity and isolated validation

Do not clone the full source/snapshot history into private schemas of the live
project. Schemas and advisory locks do not isolate disk, WAL or I/O. The first
attempt failed with WAL disk exhaustion and unavailable SQL connections; see
`ORANGE_LIVE_SUPABASE_VALIDATION_INCIDENT.md`. Require an independent test
instance and verified disk/WAL capacity before repeating the Supabase gate.

## Rollback

Apply `supabase/rollback/20261005191734_orange_live_snapshot_optimization.rollback.sql`. The rollback restores the previous LIVE builder and trigger, then drops the fast-path helpers and indexes. Existing snapshot data and history are retained.
