# Orange LIVE runbook

## Safe rollout

1. Create/rebase a Supabase development branch from Production after confirming
   the branch billing rate. Branch creation copies migrations, **not production
   data**. Load fixed, consistent source/snapshot fixtures for Orange/W/CPR and
   verify all prerequisites exist before timing. Do not use empty-branch results
   or a production write as a replacement for this gate.
2. Apply `supabase/migrations/20261005191734_orange_live_snapshot_optimization.sql` to the branch only.
3. Run `supabase/tests/orange_live_snapshot_v2.sql`, the branch-only transactional
   tests `supabase/tests/orange_live_snapshot_v2_write.sql` and
   `supabase/tests/orange_live_snapshot_v2_runtime.sql`, and
   `node --test tests/columnar-contract.test.mjs`.
4. Run one branch-only Orange refresh twice. The second call must return the same version quickly and must not add a history row.
5. Compare Orange/W/CPR GMV, units, orders, `daily`, `sku_daily`, `lines`, stocks, canonical SKU, master category, `source_health`, and the `format=columnar` response against Production for fixed dates.
6. Apply the n8n node patch only after the migration is approved. Publish the n8n workflow after verifying `queryBatching=single` and node-only retry.
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
- In connection A acquire `pg_advisory_xact_lock(hashtextextended(
  'snapshot|ORANGE|daily-full',0))` inside a transaction. In connection B call the
  LIVE builder; it must return the completed version promptly, without writes.
  Release A, then run two competing builders and check one effective publication.
- Deliberately fail readiness or a branch fixture build in a subtransaction.
  The complete snapshot, version and history must remain intact after rollback.
- Exercise the existing full and closed-day publishers carrying copied metadata.
  Changed SKU/dimension arrays must canonicalize correctly; an unchanged
  canonical LIVE payload must avoid a second full canonicalization.

Store actual measured results and reconciliations in the PR. Until those checks
run, the PR remains unaccepted and neither Production nor n8n may be changed.

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

The dashboard must continue serving the latest row with `is_complete=true` if a new build fails. Alert when no completed snapshot has `published_at` by 11:00, 17:00, or 22:00 MSK, or when any `source_health[].freshness_state` is not `fresh`. Telegram delivery should consume that alert result; it must not trigger ingestion.

## Rollback

Apply `supabase/rollback/20261005191734_orange_live_snapshot_optimization.rollback.sql`. The rollback restores the previous LIVE builder and trigger, then drops the fast-path helpers and indexes. Existing snapshot data and history are retained.
