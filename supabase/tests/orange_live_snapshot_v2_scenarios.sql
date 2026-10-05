-- ISOLATED LOCAL/DEVELOPMENT DATABASE ONLY. All writes roll back.
begin;
set local statement_timeout='60s';
create temporary table live_scenario_results(scenario text primary key,elapsed_ms numeric);
create function pg_temp.check_true(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%',message;end if;end $$;
create function pg_temp.closed_blocks(p jsonb,d date) returns jsonb language sql as $$
select jsonb_object_agg(k,coalesce((select jsonb_agg(x order by x::text)
 from jsonb_array_elements(coalesce(p->k,'[]'))x where x->>'report_date'<d::text),'[]'))
from unnest(array['daily','sku_daily','lines'])k $$;
select dev21.refresh_live_snapshot_v2('ORANGE');
do $test$
declare
 d date:=(current_timestamp at time zone 'Europe/Moscow')::date;
 r raw.ozon_orders_raw%rowtype;
 original dev21.dashboard_snapshots%rowtype;
 changed dev21.dashboard_snapshots%rowtype;
 repeated dev21.dashboard_snapshots%rowtype;
 v bigint;h bigint;started timestamptz;closed jsonb;untouched jsonb;
begin
 select * into original from dev21.dashboard_snapshots where tenant_id='ORANGE' and snapshot_kind='daily-full';
 perform pg_temp.check_true(dev21.canonicalize_orange_dashboard_payload_fast_v2(original.payload)=dev21.canonicalize_orange_dashboard_payload(original.payload),'Bulk canonicalization differs from reference');
 insert into live_scenario_results values('full_canonical_reference_parity',null);
 select * into r from raw.ozon_orders_raw o where tenant_id='ORANGE' and operational_date=d
  and payload->>'order_state'<>'cancelled' order by observed_at desc,raw_order_id desc limit 1;
 perform pg_temp.check_true(found,'Missing eligible Orange mutation fixture');
 closed:=pg_temp.closed_blocks(original.payload,d);
 select jsonb_agg(x order by x::text) into untouched from jsonb_array_elements(original.payload->'sku_daily')x
  where x->>'report_date'=d::text and not(x->>'marketplace'=r.marketplace and x->>'cabinet'=(select cabinet from config.account_runtime_v2 where account_id=r.account_id));
 insert into raw.ozon_orders_raw overriding system value
 select (jsonb_populate_record(null::raw.ozon_orders_raw,to_jsonb(r)||jsonb_build_object(
  'raw_order_id',(select max(raw_order_id)+1 from raw.ozon_orders_raw),'observed_at',clock_timestamp()+interval '1 hour',
  'payload_hash','isolated-test-revision','payload',r.payload||jsonb_build_object(
    'quantity',((r.payload->>'quantity')::numeric+1),'gross_amount',((r.payload->>'gross_amount')::numeric+1000))))).*;
 started:=clock_timestamp();v:=dev21.refresh_live_snapshot_v2('ORANGE');
 select * into changed from dev21.dashboard_snapshots where tenant_id='ORANGE' and snapshot_kind='daily-full';
 perform pg_temp.check_true(v=original.snapshot_version+1,'Single-account revision did not publish once');
 perform pg_temp.check_true(pg_temp.closed_blocks(changed.payload,d)=closed,'Closed daily/SKU/line blocks changed');
 perform pg_temp.check_true(untouched is not distinct from (select jsonb_agg(x order by x::text) from jsonb_array_elements(changed.payload->'sku_daily')x where x->>'report_date'=d::text and not(x->>'marketplace'=r.marketplace and x->>'cabinet'=(select cabinet from config.account_runtime_v2 where account_id=r.account_id))),'Other account SKU blocks changed');
 perform pg_temp.check_true((select sum((x->>'units')::numeric) from jsonb_array_elements(changed.payload->'daily')x where x->>'report_date'=d::text)=(select sum((x->>'units')::numeric)+1 from jsonb_array_elements(original.payload->'daily')x where x->>'report_date'=d::text),'Revision units delta differs');
 perform pg_temp.check_true((select sum((x->>'gmv')::numeric) from jsonb_array_elements(changed.payload->'daily')x where x->>'report_date'=d::text)=(select sum((x->>'gmv')::numeric)+1000 from jsonb_array_elements(original.payload->'daily')x where x->>'report_date'=d::text),'Revision GMV delta differs');
 insert into live_scenario_results values('one_account_revision',extract(epoch from(clock_timestamp()-started))*1000);
 select count(*) into h from dev21.dashboard_snapshot_history;
 v:=dev21.refresh_live_snapshot_v2('ORANGE');
 perform pg_temp.check_true(v=changed.snapshot_version and h=(select count(*) from dev21.dashboard_snapshot_history),'Revision replay published twice');
 insert into live_scenario_results values('revision_replay',null);
 -- A source timestamp or numeric scale change must not affect non-cancelled data.
 update raw.ozon_orders_raw set payload=jsonb_set(jsonb_set(payload,'{source_updated_at}',to_jsonb(clock_timestamp()::text)),
 '{quantity}',to_jsonb(((payload->>'quantity')::numeric)::numeric(20,4))) where payload_hash='isolated-test-revision';
 v:=dev21.refresh_live_snapshot_v2('ORANGE');
 perform pg_temp.check_true(v=changed.snapshot_version and h=(select count(*) from dev21.dashboard_snapshot_history),'Timestamp/numeric formatting caused publication');
 insert into live_scenario_results values('commercial_equivalent_revision',null);
 -- Readiness failure must preserve current/history atomically, including metadata.
 select * into repeated from dev21.dashboard_snapshots where tenant_id='ORANGE' and snapshot_kind='daily-full';
 begin
  update dev21.source_refresh_status set status='error' where account_id=r.account_id;
  -- Frozen local readiness lookup is a table; on a Supabase branch it is a view.
  if (select relkind='r' from pg_class where oid='dev21.source_readiness'::regclass) then
   execute 'update dev21.source_readiness set readiness=''error'' where account_id=$1' using r.account_id;
  end if;
  perform dev21.refresh_live_snapshot_v2('ORANGE');
  raise exception 'Expected readiness failure did not occur';
 exception when others then
  if sqlerrm not like 'Snapshot not published:%' then raise;end if;
 end;
 select * into changed from dev21.dashboard_snapshots where tenant_id='ORANGE' and snapshot_kind='daily-full';
 perform pg_temp.check_true(to_jsonb(changed)=to_jsonb(repeated) and h=(select count(*) from dev21.dashboard_snapshot_history),'Failed publication damaged fallback');
 insert into live_scenario_results values('readiness_failure_fallback',null);
 -- Stock-only change must not alter any order block.
 original:=changed;
 insert into public.ozon_stock_snapshots
 select project,cabinet,clock_timestamp()+interval '1 hour',snapshot_date,offer_id,product_id,sku,stock_type,present+10,reserved+2,available+10
 from public.ozon_stock_snapshots where project='ORANGE' order by captured_at desc limit 1;
 v:=dev21.refresh_live_snapshot_v2('ORANGE');
 select * into changed from dev21.dashboard_snapshots where tenant_id='ORANGE' and snapshot_kind='daily-full';
 perform pg_temp.check_true(v=original.snapshot_version+1 and changed.payload->'stocks' is distinct from original.payload->'stocks','Stock-only update was not published');
 perform pg_temp.check_true(changed.payload->'daily'=original.payload->'daily' and changed.payload->'sku_daily'=original.payload->'sku_daily' and changed.payload->'lines'=original.payload->'lines','Stock-only update rebuilt order blocks');
 perform pg_temp.check_true(changed.payload#>'{meta,live_source_fingerprints}'=original.payload#>'{meta,live_source_fingerprints}','Stock-only update changed order fingerprint');
 perform pg_temp.check_true(dev21.refresh_live_snapshot_v2('ORANGE')=v,'Stock replay created another version');
 insert into live_scenario_results values('stock_only_and_replay',null);
 -- Verify the new row source is exactly the latest global projection, not only totals.
 perform pg_temp.check_true(not exists((select * from core.daily_order_rows_v2 where tenant_id='ORANGE' and report_date=d except all select * from dev21.live_order_rows_v2('ORANGE',d)) union all (select * from dev21.live_order_rows_v2('ORANGE',d) except all select * from core.daily_order_rows_v2 where tenant_id='ORANGE' and report_date=d)),'Latest-source row parity failed');
 insert into live_scenario_results values('source_row_parity',null);
 if (select relkind='r' from pg_class where oid='core.orange_identity_source_map_v2'::regclass) then
  select * into original from dev21.dashboard_snapshots where tenant_id='ORANGE' and snapshot_kind='daily-full';
  update core.orange_identity_source_map_v2 set canonical_sku='__ISOLATED_CANONICAL_CHANGE__'
   where source_marketplace_sku=r.line_item_key and marketplace=r.marketplace and cabinet=(select cabinet from config.account_runtime_v2 where account_id=r.account_id);
  perform pg_temp.check_true(found,'No identity fixture matched the selected order');
  v:=dev21.refresh_live_snapshot_v2('ORANGE');
  select * into changed from dev21.dashboard_snapshots where tenant_id='ORANGE' and snapshot_kind='daily-full';
  perform pg_temp.check_true(v=original.snapshot_version+1,'Identity-only change did not publish');
  perform pg_temp.check_true(changed.payload#>'{meta,live_source_fingerprints}'=original.payload#>'{meta,live_source_fingerprints}','Identity-only change rebuilt order sources');
  perform pg_temp.check_true(exists(select 1 from jsonb_array_elements(changed.payload->'sku_daily')x where x->>'sku'=r.line_item_key and x->>'canonical_sku'='__ISOLATED_CANONICAL_CHANGE__'),'Identity-only change left a stale canonical SKU');
  perform pg_temp.check_true(dev21.refresh_live_snapshot_v2('ORANGE')=v,'Identity-only replay published twice');
  insert into live_scenario_results values('identity_only_and_replay',null);
 else
  raise notice 'Identity mutation needs the branch ingestion revision path; local lookup case skipped';
 end if;

end
$test$;
select * from live_scenario_results order by scenario;
rollback;
