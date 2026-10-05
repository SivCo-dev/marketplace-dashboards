-- Branch/staging only. Exercises atomic publication and rolls every write back.

begin;
set local statement_timeout = '60s';

create temporary table live_test_before as
select s.snapshot_version,
  md5(coalesce((select jsonb_agg(x order by x->>'report_date',x->>'marketplace',x->>'cabinet')::text
    from jsonb_array_elements(s.payload->'daily') x
    where not coalesce((x->>'is_live')::boolean,false)),'')) closed_daily_hash,
  (select count(*) from dev21.dashboard_snapshot_history h
    where h.tenant_id='ORANGE' and h.snapshot_kind='daily-full') history_count
from dev21.dashboard_snapshots s
where s.tenant_id='ORANGE' and s.snapshot_kind='daily-full' and s.is_complete;

create temporary table live_test_versions as
select dev21.refresh_live_snapshot_v2(
  'ORANGE',(current_timestamp at time zone 'Europe/Moscow')::date
) first_version;

alter table live_test_versions add column second_version bigint;
update live_test_versions set second_version=dev21.refresh_live_snapshot_v2(
  'ORANGE',(current_timestamp at time zone 'Europe/Moscow')::date
);

do $test$
declare
  v_before live_test_before%rowtype;
  v_first bigint;
  v_second bigint;
  v_after_history bigint;
  v_after_closed text;
  v_snapshot record;
  v_raw record;
begin
  select * into v_before from live_test_before;
  select first_version,second_version into v_first,v_second from live_test_versions;
  if v_first is distinct from v_second then
    raise exception 'idempotency failed: first version %, second version %',v_first,v_second;
  end if;

  select count(*) into v_after_history from dev21.dashboard_snapshot_history
  where tenant_id='ORANGE' and snapshot_kind='daily-full';
  if v_after_history-v_before.history_count not between 0 and 1 then
    raise exception 'unexpected history growth: before %, after %',v_before.history_count,v_after_history;
  end if;

  select md5(coalesce((select jsonb_agg(x order by x->>'report_date',x->>'marketplace',x->>'cabinet')::text
    from jsonb_array_elements(s.payload->'daily') x
    where not coalesce((x->>'is_live')::boolean,false)),''))
  into v_after_closed
  from dev21.dashboard_snapshots s
  where s.tenant_id='ORANGE' and s.snapshot_kind='daily-full';
  if v_after_closed is distinct from v_before.closed_daily_hash then
    raise exception 'closed daily rows changed during LIVE publication';
  end if;

  select sum((x->>'gmv')::numeric) gmv,sum((x->>'units')::numeric) units,
         sum((x->>'orders')::numeric) orders
  into v_snapshot
  from dev21.dashboard_snapshots s
  cross join lateral jsonb_array_elements(s.payload->'daily') x
  where s.tenant_id='ORANGE' and s.snapshot_kind='daily-full'
    and (x->>'report_date')::date=(current_timestamp at time zone 'Europe/Moscow')::date;

  select sum(gmv) gmv,sum(units) units,count(distinct order_key)::numeric orders
  into v_raw
  from dev21.live_order_rows_v2('ORANGE',(current_timestamp at time zone 'Europe/Moscow')::date)
  where coalesce(order_state,'')<>'cancelled' or source_updated_at::date>report_date;
  if row(v_snapshot.gmv,v_snapshot.units,v_snapshot.orders)
     is distinct from row(v_raw.gmv,v_raw.units,v_raw.orders) then
    raise exception 'published LIVE totals differ from raw: snapshot=% raw=%',
      row_to_json(v_snapshot),row_to_json(v_raw);
  end if;
end
$test$;

rollback;
