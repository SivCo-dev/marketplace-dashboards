-- Run after the migration on a Supabase branch/staging database.
-- The script is read-only and raises on the first regression.

set statement_timeout = '60s';

do $test$
declare
  v_tenant text;
  v_expected record;
  v_actual record;
begin
  foreach v_tenant in array array['ORANGE','W','CPR'] loop
    select count(*) rows,sum(units) units,sum(gmv) gmv,count(distinct order_key) orders
    into v_expected
    from core.daily_order_rows_v2
    where tenant_id=v_tenant and report_date=date '2026-10-05'
      and (coalesce(order_state,'')<>'cancelled' or source_updated_at::date>report_date);

    select count(*) rows,sum(units) units,sum(gmv) gmv,count(distinct order_key) orders
    into v_actual
    from dev21.live_order_rows_v2(v_tenant,date '2026-10-05')
    where coalesce(order_state,'')<>'cancelled' or source_updated_at::date>report_date;

    if row(v_expected.rows,v_expected.units,v_expected.gmv,v_expected.orders)
       is distinct from row(v_actual.rows,v_actual.units,v_actual.gmv,v_actual.orders) then
      raise exception 'live_order_rows_v2 parity failed tenant=% expected=% actual=%',
        v_tenant,row_to_json(v_expected),row_to_json(v_actual);
    end if;
  end loop;
end
$test$;

do $test$
declare
  v_definition text;
begin
  select pg_get_functiondef('dev21.refresh_live_snapshot_v2(text,date)'::regprocedure)
  into v_definition;
  if v_definition like '%enrich_live_snapshot_sources_v2%' then
    raise exception 'LIVE builder still calls full historical enrichment';
  end if;
  if v_definition not like '%pg_try_advisory_xact_lock%' then
    raise exception 'LIVE builder is missing its non-waiting advisory lock';
  end if;
  if v_definition not like '%live_source_fingerprints%' then
    raise exception 'LIVE builder is missing per-source idempotency fingerprints';
  end if;
end
$test$;

do $test$
declare
  v_bad bigint;
begin
  select count(*) into v_bad
  from dev21.dashboard_snapshots s
  cross join lateral jsonb_array_elements(coalesce(s.payload->'daily','[]'::jsonb)) d
  where s.snapshot_kind='daily-full' and s.is_complete
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(s.payload->'sku_daily','[]'::jsonb)) x
      where x->>'report_date'=d->>'report_date'
        and x->>'marketplace'=d->>'marketplace'
        and x->>'cabinet'=d->>'cabinet'
    );
  if v_bad>0 then
    raise exception 'daily/sku_daily contract has % source-day rows without SKU rows',v_bad;
  end if;
end
$test$;

select 'orange_live_snapshot_v2 read-only regression checks passed' as result;
