-- DEVELOPMENT BRANCH ONLY. Requires copied, fixed source fixtures for all
-- three tenants. Every refresh includes aggregation, enrichment, trigger,
-- current/history writes and publication. This script rolls back all writes.
begin;
set local statement_timeout = '60s';
create temporary table live_runtime_results(
 tenant text,scenario text,elapsed_ms numeric,version bigint,history_count bigint
);
do $test$
declare
 v_tenant text;
 first_version bigint;
 repeated_version bigint;
 history_before bigint;
 history_after bigint;
 started timestamptz;
 snapshot_before dev21.dashboard_snapshots%rowtype;
 snapshot_after dev21.dashboard_snapshots%rowtype;
 raw_totals jsonb;
 daily_totals jsonb;
 sku_totals jsonb;
 line_totals jsonb;
 expected_payload jsonb;
 changed_payload jsonb;
 tested boolean:=false;
begin
 foreach v_tenant in array array['ORANGE','W','CPR'] loop
  -- A branch without source fixtures must fail rather than report a false pass.
  if not exists(select 1 from dev21.live_order_rows_v2(v_tenant,
     (current_timestamp at time zone 'Europe/Moscow')::date)) then
   raise exception 'Missing runtime source fixtures for %',v_tenant;
  end if;
  -- Force the first measured call to build orders, even on a previously tested clone.
  update dev21.dashboard_snapshots set payload=jsonb_set(payload,
    '{meta,live_source_fingerprints}','{}'::jsonb,true)
    where tenant_id=v_tenant and snapshot_kind='daily-full';
  started:=clock_timestamp();
  first_version:=dev21.refresh_live_snapshot_v2(v_tenant);
  if first_version is null then raise exception 'No completed snapshot for %',v_tenant;end if;
  select * into snapshot_before from dev21.dashboard_snapshots
   where tenant_id=v_tenant and snapshot_kind='daily-full';
  select count(*) into history_before from dev21.dashboard_snapshot_history
   where tenant_id=v_tenant and snapshot_kind='daily-full';
  insert into live_runtime_results values(v_tenant,'first_full_call',
    extract(epoch from(clock_timestamp()-started))*1000,first_version,history_before);

  -- Set deliberately old timestamps: now() is fixed within a transaction,
  -- so a plain before/after check would miss accidental rewrites with now().
  update dev21.dashboard_snapshots
   set generated_at='2001-01-01',source_as_of='2001-01-02',
       data_as_of='2001-01-03',published_at='2001-01-04'
   where tenant_id=v_tenant and snapshot_kind='daily-full';
  select * into snapshot_before from dev21.dashboard_snapshots
   where tenant_id=v_tenant and snapshot_kind='daily-full';
  started:=clock_timestamp();
  repeated_version:=dev21.refresh_live_snapshot_v2(v_tenant);
  select * into snapshot_after from dev21.dashboard_snapshots
   where tenant_id=v_tenant and snapshot_kind='daily-full';
  select count(*) into history_after from dev21.dashboard_snapshot_history
   where tenant_id=v_tenant and snapshot_kind='daily-full';
  insert into live_runtime_results values(v_tenant,'unchanged',
    extract(epoch from(clock_timestamp()-started))*1000,repeated_version,history_after);
  if repeated_version<>first_version or history_after<>history_before
    or (snapshot_after.payload-'meta') is distinct from (snapshot_before.payload-'meta')
    or row(snapshot_after.generated_at,snapshot_after.source_as_of,
           snapshot_after.data_as_of,snapshot_after.published_at)
       is distinct from row(snapshot_before.generated_at,snapshot_before.source_as_of,
           snapshot_before.data_as_of,snapshot_before.published_at) then
   raise exception 'No-change publication regression for %',v_tenant;
  end if;

  update raw.order_source_success_v2 s set last_success_at=clock_timestamp()+interval '1 minute'
   where s.account_id in(select account_id from config.marketplace_accounts where tenant_id=v_tenant);
  update dev21.source_refresh_status s set last_success_at=clock_timestamp()+interval '1 minute'
   where s.account_id in(select account_id from config.marketplace_accounts where tenant_id=v_tenant);
  update public.orange_marketplace_load_status_1x set last_success=clock_timestamp()+interval '1 minute'
   where v_tenant='ORANGE';
  started:=clock_timestamp();
  repeated_version:=dev21.refresh_live_snapshot_v2(v_tenant);
  select * into snapshot_after from dev21.dashboard_snapshots
   where tenant_id=v_tenant and snapshot_kind='daily-full';
  select count(*) into history_after from dev21.dashboard_snapshot_history
   where tenant_id=v_tenant and snapshot_kind='daily-full';
  insert into live_runtime_results values(v_tenant,'loader_heartbeat_only',
    extract(epoch from(clock_timestamp()-started))*1000,repeated_version,history_after);
  if repeated_version<>first_version or history_after<>history_before
    or (snapshot_after.payload-'meta') is distinct from (snapshot_before.payload-'meta')
    or snapshot_after.published_at is distinct from snapshot_before.published_at
    or snapshot_after.payload#>'{meta,live_source_fingerprints}'
       is distinct from snapshot_before.payload#>'{meta,live_source_fingerprints}' then
   raise exception 'Heartbeat triggered commercial rebuild/publication for %',v_tenant;
  end if;
  if snapshot_after.payload#>'{meta,source_health}'
     is not distinct from snapshot_before.payload#>'{meta,source_health}' then
   raise exception 'Heartbeat health did not advance for %; check source fixtures',v_tenant;
  end if;

  -- Compare each source/cabinet independently, avoiding order-key collisions
  -- between accounts. Raw -> daily and raw -> SKU -> lines must reconcile.
  with valid as (select * from dev21.live_order_rows_v2(v_tenant,
      (current_timestamp at time zone 'Europe/Moscow')::date)
    where coalesce(order_state,'')<>'cancelled' or source_updated_at::date>report_date),
  accounts as (select a.account_id,a.marketplace,r.cabinet
    from config.marketplace_accounts a join config.account_runtime_v2 r using(tenant_id,account_id)
    where a.tenant_id=v_tenant and a.active and r.daily_active),
  r as (select a.marketplace,a.cabinet,count(distinct v.order_key) orders,
      coalesce(sum(v.units),0) units,coalesce(sum(v.gmv),0) gmv
    from accounts a left join valid v using(account_id,marketplace,cabinet)
    group by 1,2)
   select jsonb_agg(to_jsonb(r) order by marketplace,cabinet) into raw_totals from r;
  with r as (select x->>'marketplace' marketplace,x->>'cabinet' cabinet,
      sum((x->>'orders')::numeric) orders,sum((x->>'units')::numeric) units,
      sum((x->>'gmv')::numeric) gmv
    from jsonb_array_elements(snapshot_after.payload->'daily')x
    where x->>'report_date'=((current_timestamp at time zone 'Europe/Moscow')::date)::text
    group by 1,2)
   select jsonb_agg(to_jsonb(r) order by marketplace,cabinet) into daily_totals from r;
  if raw_totals is distinct from daily_totals then
   raise exception 'Raw/daily reconciliation failed for %',v_tenant;
  end if;
  select jsonb_build_array(sum((x->>'units')::numeric),sum((x->>'gmv')::numeric))
   into sku_totals from jsonb_array_elements(snapshot_after.payload->'sku_daily')x
   where x->>'report_date'=((current_timestamp at time zone 'Europe/Moscow')::date)::text;
  select jsonb_build_array(sum((x->>'units')::numeric),sum((x->>'gmv')::numeric))
   into line_totals from jsonb_array_elements(snapshot_after.payload->'lines')x
   where x->>'report_date'=((current_timestamp at time zone 'Europe/Moscow')::date)::text;
  if sku_totals is distinct from line_totals
     or sku_totals is distinct from (select jsonb_build_array(sum((x->>'units')::numeric),sum((x->>'gmv')::numeric)) from jsonb_array_elements(raw_totals)x) then
   raise exception 'SKU/lines reconciliation failed for %',v_tenant;
  end if;

  -- A full/closed-day publisher carrying a copied marker must still invoke
  -- canonicalization when its SKU array is changed.
  if v_tenant='ORANGE' then
   changed_payload:=jsonb_set(snapshot_after.payload,'{sku_daily,0,canonical_sku}',
      to_jsonb('__INVALID_CANONICAL_TEST__'::text));
   expected_payload:=dev21.canonicalize_orange_dashboard_payload(changed_payload);
   update dev21.dashboard_snapshots set payload=changed_payload
    where tenant_id=v_tenant and snapshot_kind='daily-full';
   select payload into changed_payload from dev21.dashboard_snapshots
    where tenant_id=v_tenant and snapshot_kind='daily-full';
   if changed_payload->'sku_daily' is distinct from expected_payload->'sku_daily'
    or changed_payload->'dimensions' is distinct from expected_payload->'dimensions' then
    raise exception 'Copied canonical marker bypassed full publication';
   end if;
  end if;
  tested:=true;
 end loop;
 if not tested then raise exception 'No runtime cases executed';end if;
 if exists(select 1 from live_runtime_results where elapsed_ms>=60000) then
  raise exception 'End-to-end LIVE runtime exceeded 60 seconds';
 end if;
end
$test$;
select * from live_runtime_results order by tenant,scenario;
rollback;
