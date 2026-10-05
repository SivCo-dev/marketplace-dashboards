# Orange LIVE runbook

## Safe rollout

1. Create/rebase a Supabase development branch from Production.
2. Apply `supabase/migrations/20261005191734_orange_live_snapshot_optimization.sql` to the branch only.
3. Run `supabase/tests/orange_live_snapshot_v2.sql`, the branch-only transactional test `supabase/tests/orange_live_snapshot_v2_write.sql`, and `node --test tests/columnar-contract.test.mjs`.
4. Run one branch-only Orange refresh twice. The second call must return the same version quickly and must not add a history row.
5. Compare Orange/W/CPR GMV, units, orders, `daily`, `sku_daily`, `lines`, stocks, canonical SKU, master category, `source_health`, and the `format=columnar` response against Production for fixed dates.
6. Apply the n8n node patch only after the migration is approved. Publish the n8n workflow after verifying `queryBatching=single` and node-only retry.
7. Deploy the database migration during a quiet window. Do not increase `statement_timeout` as the primary remedy.

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
