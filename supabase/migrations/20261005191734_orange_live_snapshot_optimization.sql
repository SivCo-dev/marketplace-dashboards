-- Orange LIVE snapshot fast path.
--
-- The existing full rebuild/enrichment functions remain available for scheduled
-- reconciliation.  This migration moves intraday publication to a current-day,
-- source-incremental path and prevents the dashboard_snapshots trigger from
-- canonicalizing an already-canonical payload a second time.

create index if not exists marketplace_orders_raw_v2_live_day_idx
  on raw.marketplace_orders_raw_v2
  (tenant_id, account_id, ((payload ->> 'order_date')), posting_number,
   external_sku, observed_at desc, raw_order_id desc);

create index if not exists ozon_stock_snapshots_latest_type_idx
  on public.ozon_stock_snapshots
  (project, cabinet, stock_type, captured_at desc);

create index if not exists dashboard_snapshot_history_cycle_idx
  on dev21.dashboard_snapshot_history(cycle_id);

create or replace function dev21.live_order_rows_v2(
  p_tenant text,
  p_report_date date
)
returns table (
  tenant_id text,
  account_id text,
  marketplace text,
  cabinet text,
  report_date date,
  order_key text,
  sku text,
  article text,
  product_name text,
  units numeric,
  gmv numeric,
  order_state text,
  source_updated_at timestamptz
)
language sql
stable
set search_path to ''
as $function$
with accounts as materialized (
  select a.tenant_id,a.account_id,a.marketplace,r.cabinet
  from config.marketplace_accounts a
  join config.account_runtime_v2 r using(tenant_id,account_id)
  where a.tenant_id=upper(p_tenant) and a.active and r.daily_active
), latest_ozon as (
  select distinct on (o.tenant_id,o.account_id,o.posting_number,o.line_item_key)
    o.tenant_id,o.account_id,o.marketplace,a.cabinet,o.posting_number,
    o.line_item_key as sku,o.payload
  from raw.ozon_orders_raw o
  join accounts a using(tenant_id,account_id)
  where o.tenant_id=upper(p_tenant) and o.operational_date=p_report_date
  order by o.tenant_id,o.account_id,o.posting_number,o.line_item_key,
           o.observed_at desc,o.ingested_at desc,o.raw_order_id desc
), latest_other as (
  select distinct on (o.tenant_id,o.account_id,o.posting_number,o.external_sku)
    o.tenant_id,o.account_id,o.marketplace,a.cabinet,o.posting_number,
    o.external_sku as sku,o.payload
  from raw.marketplace_orders_raw_v2 o
  join accounts a using(tenant_id,account_id)
  where o.tenant_id=upper(p_tenant)
    and o.payload->>'order_date'=p_report_date::text
  order by o.tenant_id,o.account_id,o.posting_number,o.external_sku,
           o.observed_at desc,o.raw_order_id desc
), all_rows as (
  select * from latest_ozon
  union all
  select * from latest_other
)
select
  o.tenant_id,o.account_id,o.marketplace,o.cabinet,
  (o.payload->>'order_date')::date,
  coalesce(nullif(o.payload->>'order_number',''),
    case when o.marketplace<>'OZON' then nullif(o.payload->>'order_id','') end,
    o.posting_number),
  o.sku,coalesce(nullif(o.payload->>'offer_id',''),o.sku),
  o.payload->>'product_name',(o.payload->>'quantity')::numeric,
  (o.payload->>'gross_amount')::numeric,o.payload->>'order_state',
  coalesce((o.payload->>'source_updated_at')::timestamptz,
           (o.payload->>'updated_at')::timestamptz)
from all_rows o
$function$;

comment on function dev21.live_order_rows_v2(text,date) is
  'Parameterised current-day source. Filters raw revisions before DISTINCT ON; avoids the full-history daily_order_rows_v2 view in LIVE builds.';

create or replace function dev21.enrich_live_snapshot_fast_v2(
  p_tenant text,
  p_report_date date,
  p_payload jsonb
)
returns jsonb
language plpgsql
stable
set search_path to ''
as $function$
declare
  v_tenant text := upper(p_tenant);
  v_stock_checkpoint jsonb;
  v_previous_checkpoint jsonb := coalesce(p_payload#>'{meta,stock_source_checkpoint}','{}'::jsonb);
  v_stocks jsonb;
  v_health jsonb;
  v_stale_count integer;
begin
  select jsonb_build_object(
    'ozon',coalesce((select max(captured_at)::text from public.ozon_stock_snapshots where project=v_tenant),''),
    'yandex',coalesce((select max(captured_at)::text from public.orange_yandex_stock_snapshots_1x where v_tenant='ORANGE'),'')
  ) into v_stock_checkpoint;

  if v_stock_checkpoint is distinct from v_previous_checkpoint then
    with stock_latest as materialized (
      select distinct on (project,cabinet,stock_type)
        project,cabinet,stock_type,captured_at
      from public.ozon_stock_snapshots
      where project=v_tenant
      order by project,cabinet,stock_type,captured_at desc
    ), stock_agg as (
      select s.sku,s.offer_id,coalesce(nullif(s.cabinet,''),v_tenant) cabinet,
        max(s.captured_at) captured_at,
        sum(s.available) filter(where s.stock_type='fbo') fbo_stock,
        sum(s.available) filter(where s.stock_type in('fbs','rfbs')) fbs_stock,
        sum(s.reserved) reserved_stock
      from public.ozon_stock_snapshots s
      join stock_latest l using(project,cabinet,stock_type,captured_at)
      group by s.sku,s.offer_id,s.cabinet
    ), sales14 as (
      select coalesce(x->>'cabinet',v_tenant) cabinet,x->>'sku' sku,
        sum((x->>'units')::numeric) units
      from jsonb_array_elements(coalesce(p_payload->'sku_daily','[]'::jsonb)) x
      where coalesce(x->>'marketplace','OZON')='OZON'
        and (x->>'report_date')::date>=p_report_date-14
        and (x->>'report_date')::date<p_report_date
      group by 1,2
    ), yandex_sales14 as (
      select x->>'cabinet' cabinet,x->>'article' offer_id,
        sum((x->>'units')::numeric) units
      from jsonb_array_elements(coalesce(p_payload->'sku_daily','[]'::jsonb)) x
      where x->>'marketplace'='YANDEX'
        and (x->>'report_date')::date>=p_report_date-14
        and (x->>'report_date')::date<p_report_date
      group by 1,2
    ), yandex_stocks as (
      select s.cabinet,s.offer_id,sum(s.available) available,sum(s.frozen) reserved,
        max(s.captured_at) captured_at
      from public.orange_yandex_stock_snapshots_1x s
      where v_tenant='ORANGE'
      group by 1,2
    ), stocks as (
      select jsonb_build_object(
        'sku',s.sku,'offer_id',s.offer_id,'cabinet',s.cabinet,
        'source_marketplace','OZON','captured_at',s.captured_at,
        'fbo_stock',coalesce(s.fbo_stock,0),'fbs_stock',coalesce(s.fbs_stock,0),
        'total_stock',coalesce(s.fbo_stock,0)+coalesce(s.fbs_stock,0),
        'reserved_stock',coalesce(s.reserved_stock,0),'units_14d',coalesce(v.units,0),
        'avg_daily_sales_14d',coalesce(v.units,0)/14
      ) item
      from stock_agg s left join sales14 v using(cabinet,sku)
      union all
      select x
      from jsonb_array_elements(coalesce(p_payload->'stocks','[]'::jsonb)) x
      where coalesce(x->>'source_marketplace','OZON')<>'OZON'
        and not(v_tenant='ORANGE' and x->>'source_marketplace'='YANDEX')
      union all
      select jsonb_build_object(
        'sku',s.offer_id,'offer_id',s.offer_id,'cabinet',s.cabinet,
        'source_marketplace','YANDEX','captured_at',s.captured_at,
        'fbo_stock',0,'fbs_stock',coalesce(s.available,0),
        'total_stock',coalesce(s.available,0),'reserved_stock',coalesce(s.reserved,0),
        'units_14d',coalesce(v.units,0),'avg_daily_sales_14d',coalesce(v.units,0)/14
      )
      from yandex_stocks s left join yandex_sales14 v using(cabinet,offer_id)
    )
    select coalesce(jsonb_agg(item),'[]'::jsonb)
    into v_stocks from stocks;

    p_payload := jsonb_set(p_payload,'{stocks}',coalesce(v_stocks,'[]'::jsonb),true);
  end if;

  with health_rows as (
    select a.account_id,a.marketplace,r.cabinet,
      greatest(s.last_success_at,ls.last_success) last_success_at,
      coalesce(ls.last_source_update,rs.source_data_at) source_data_at,
      s.n8n_execution_id,coalesce(s.row_count,ls.row_count::bigint) row_count,
      case
        when greatest(s.last_success_at,ls.last_success) is null then 'missing_success'
        when coalesce(ls.last_source_update,rs.source_data_at) is null then 'unknown_source_data'
        when coalesce(ls.last_source_update,rs.source_data_at)::date<p_report_date
             and greatest(s.last_success_at,ls.last_success)::date>=p_report_date then 'no_new_commercial_events'
        when coalesce(ls.last_source_update,rs.source_data_at)::date<p_report_date then 'stale'
        else 'fresh'
      end freshness_state
    from config.marketplace_accounts a
    join config.account_runtime_v2 r using(tenant_id,account_id)
    left join raw.order_source_success_v2 s using(account_id)
    left join dev21.source_refresh_status rs on rs.account_id=a.account_id and rs.dataset='orders'
    left join public.orange_marketplace_load_status_1x ls
      on a.tenant_id='ORANGE' and ls.marketplace=a.marketplace and ls.cabinet=r.cabinet
    where a.tenant_id=v_tenant and a.active and r.daily_active
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'account_id',account_id,'marketplace',marketplace,'cabinet',cabinet,
    'last_success',last_success_at,
    'age_hours',case when last_success_at is not null then round((extract(epoch from(now()-last_success_at))/3600)::numeric,2) end,
    'source_data_at',source_data_at,
    'source_age_hours',case when source_data_at is not null then round((extract(epoch from(now()-source_data_at))/3600)::numeric,2) end,
    'freshness_state',freshness_state,'n8n_execution_id',n8n_execution_id,'row_count',row_count
  ) order by marketplace,cabinet),'[]'::jsonb),
  count(*) filter(where freshness_state in ('missing_success','unknown_source_data','stale','no_new_commercial_events'))
  into v_health,v_stale_count
  from health_rows;

  if v_stale_count>0 then
    raise warning 'LIVE source freshness warning tenant=% date=% affected_sources=%',v_tenant,p_report_date,v_stale_count;
  end if;

  return p_payload || jsonb_build_object('meta',
    coalesce(p_payload->'meta','{}'::jsonb) || jsonb_build_object(
      'source_health',v_health,
      'stock_source_checkpoint',v_stock_checkpoint,
      'stock_snapshot',nullif(v_stock_checkpoint->>'ozon',''),
      'freshness_checked_at',now(),
      'line_rebuild_deferred',true,
      'live_line_date',p_report_date::text
    )
  );
end;
$function$;

comment on function dev21.enrich_live_snapshot_fast_v2(text,date,jsonb) is
  'LIVE-only enrichment: current source health, conditional stock rebuild, and no historical expected/actual scan.';

create or replace function dev21.publish_live_snapshot_v2(
  p_tenant_id text,
  p_payload jsonb,
  p_source_as_of timestamptz default now()
)
returns bigint
language plpgsql
set search_path to ''
as $function$
declare
  v_tenant text := upper(p_tenant_id);
  v_ready boolean;
  v_sources jsonb;
  v_version bigint;
  v_cycle uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('snapshot|'||v_tenant||'|daily-full',0));

  select coalesce(t.intraday_ready,false),coalesce(t.sources,'[]'::jsonb)
  into v_ready,v_sources
  from dev21.tenant_readiness t where t.tenant_id=v_tenant;
  if coalesce(v_ready,false) is not true then
    raise exception 'Snapshot not published: tenant % is not intraday ready',v_tenant;
  end if;

  select s.snapshot_version into v_version
  from dev21.dashboard_snapshots s
  where s.tenant_id=v_tenant and s.snapshot_kind='daily-full' and s.is_complete
    and (s.payload-'meta')=(p_payload-'meta');
  if found then
    -- Heartbeat metadata is not a new commercial publication.
    update dev21.dashboard_snapshots
    set payload=p_payload
    where tenant_id=v_tenant and snapshot_kind='daily-full'
      and payload is distinct from p_payload;
    return v_version;
  end if;

  select greatest(
    coalesce((select max(h.snapshot_version) from dev21.dashboard_snapshot_history h
              where h.tenant_id=v_tenant and h.snapshot_kind='daily-full'),0),
    coalesce((select s.snapshot_version from dev21.dashboard_snapshots s
              where s.tenant_id=v_tenant and s.snapshot_kind='daily-full'),0)
  )+1 into v_version;

  insert into dev21.snapshot_publication_cycles(
    tenant_id,snapshot_kind,status,readiness_snapshot,started_at,ready_at,published_at,source_as_of
  ) values (
    v_tenant,'daily-full','published',v_sources,now(),now(),now(),p_source_as_of
  ) returning cycle_id into v_cycle;

  insert into dev21.dashboard_snapshot_history(
    tenant_id,snapshot_kind,snapshot_version,cycle_id,payload,source_as_of,
    generated_at,published_at,is_complete
  ) values (
    v_tenant,'daily-full',v_version,v_cycle,p_payload,p_source_as_of,now(),now(),true
  );

  insert into dev21.dashboard_snapshots(
    tenant_id,snapshot_kind,payload,generated_at,source_as_of,version,
    snapshot_version,cycle_id,is_complete,data_as_of,published_at
  ) values (
    v_tenant,'daily-full',p_payload,now(),p_source_as_of,'2.2',
    v_version,v_cycle,true,p_source_as_of,now()
  ) on conflict(tenant_id,snapshot_kind) do update set
    payload=excluded.payload,generated_at=excluded.generated_at,
    source_as_of=excluded.source_as_of,version=excluded.version,
    snapshot_version=excluded.snapshot_version,cycle_id=excluded.cycle_id,
    is_complete=excluded.is_complete,data_as_of=excluded.data_as_of,
    published_at=excluded.published_at;
  return v_version;
end;
$function$;

create or replace function dev21.trg_canonicalize_orange_dashboard_snapshot()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if new.tenant_id='ORANGE' and new.snapshot_kind='daily-full' then
    -- Full/closed-day publishers may inherit metadata. A version marker
    -- alone is insufficient when commercial SKU/dimension arrays change.
    if coalesce(new.payload#>>'{meta,canonicalization_version}','')<>'orange-v2'
       or coalesce(new.payload#>>'{meta,canonical_content_hash}','') is distinct from
          md5(jsonb_build_array(new.payload->'sku_daily',new.payload->'dimensions')::text) then
      new.payload := dev21.canonicalize_orange_dashboard_payload(new.payload);
      new.payload := jsonb_set(new.payload,'{meta,canonicalization_version}',to_jsonb('orange-v2'::text),true);
      new.payload := jsonb_set(new.payload,'{meta,canonical_content_hash}',
        to_jsonb(md5(jsonb_build_array(new.payload->'sku_daily',new.payload->'dimensions')::text)),true);
    end if;
  end if;
  return new;
end;
$function$;

-- Existing current snapshots were already canonicalized by the old trigger.
-- Marking them allows the new trigger to avoid repeating that full-payload work.
update dev21.dashboard_snapshots
set payload=jsonb_set(
  jsonb_set(payload,'{meta,canonicalization_version}',to_jsonb('orange-v2'::text),true),
  '{meta,canonical_content_hash}',
  to_jsonb(md5(jsonb_build_array(payload->'sku_daily',payload->'dimensions')::text)),true)
where tenant_id='ORANGE' and snapshot_kind='daily-full' and is_complete;

create or replace function dev21.refresh_live_snapshot_v2(
  p_tenant text,
  p_report_date date default ((current_timestamp at time zone 'Europe/Moscow')::date)
)
returns bigint
language plpgsql
set search_path to ''
as $function$
declare
  v_tenant text := upper(p_tenant);
  v_payload jsonb;
  v_daily jsonb := '[]'::jsonb;
  v_sku jsonb := '[]'::jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_fingerprints jsonb := '{}'::jsonb;
  v_old_fingerprints jsonb := '{}'::jsonb;
  v_changed_accounts text[] := array[]::text[];
  v_version bigint;
  v_started_at timestamptz := clock_timestamp();
  v_after_source timestamptz;
  v_after_aggregate timestamptz;
  v_after_enrich timestamptz;
begin
  if p_report_date not between (current_timestamp at time zone 'Europe/Moscow')::date-1
                           and (current_timestamp at time zone 'Europe/Moscow')::date then
    raise exception 'Only live today or yesterday can be refreshed';
  end if;

  -- Do not queue behind another builder. The completed snapshot remains the safe fallback.
  if not pg_try_advisory_xact_lock(hashtextextended('snapshot|'||v_tenant||'|daily-full',0)) then
    select snapshot_version into v_version from dev21.dashboard_snapshots
    where tenant_id=v_tenant and snapshot_kind='daily-full' and is_complete;
    raise notice 'LIVE snapshot build skipped: another builder holds tenant lock tenant=% date=%',v_tenant,p_report_date;
    return v_version;
  end if;

  if not exists(
    select 1 from raw.order_load_batches_v2 b
    where b.tenant_id=v_tenant and b.status='PUBLISHED'
      and (b.observed_at at time zone 'Europe/Moscow')::date>=p_report_date
      and (b.manifest->>'date_from')::date<=p_report_date
      and (b.manifest->>'date_to')::date>=p_report_date
  ) then
    raise exception 'No accepted V2 coverage for tenant % date %',v_tenant,p_report_date;
  end if;

  select s.payload,s.snapshot_version into v_payload,v_version
  from dev21.dashboard_snapshots s
  where s.tenant_id=v_tenant and s.snapshot_kind='daily-full' and s.is_complete;
  if v_payload is null then
    v_payload:=jsonb_build_object('daily','[]'::jsonb,'sku_daily','[]'::jsonb,
      'lines','[]'::jsonb,'meta',jsonb_build_object('tenant_id',v_tenant));
  end if;
  v_old_fingerprints := coalesce(v_payload#>'{meta,live_source_fingerprints}','{}'::jsonb);

  with accounts as materialized (
    select a.account_id,a.marketplace,r.cabinet
    from config.marketplace_accounts a
    join config.account_runtime_v2 r using(tenant_id,account_id)
    where a.tenant_id=v_tenant and a.active and r.daily_active
  ), live as materialized (
    select * from dev21.live_order_rows_v2(v_tenant,p_report_date)
  ), source_hashes as (
    select account_id,md5(coalesce(string_agg(
      jsonb_build_array(marketplace,cabinet,report_date,order_key,sku,article,
        product_name,trim_scale(units),trim_scale(gmv),order_state,
        (coalesce(order_state,'')<>'cancelled' or source_updated_at::date>report_date))::text,E'\n'
      order by marketplace,cabinet,order_key,sku,article,product_name,units,gmv,order_state,
        (coalesce(order_state,'')<>'cancelled' or source_updated_at::date>report_date)),'')) row_hash
    from live group by account_id
  ), fingerprints as (
    select a.account_id,md5(jsonb_build_array(p_report_date,a.marketplace,a.cabinet,
      coalesce(h.row_hash,''))::text) fingerprint
    from accounts a left join source_hashes h using(account_id)
  )
  select coalesce(jsonb_object_agg(account_id,fingerprint),'{}'::jsonb),
         coalesce(array_agg(account_id order by account_id)
           filter(where v_old_fingerprints->>account_id is distinct from fingerprint),array[]::text[])
  into v_fingerprints,v_changed_accounts
  from fingerprints;
  v_after_source := clock_timestamp();

  if cardinality(v_changed_accounts)=0
     and v_payload#>>'{meta,orders_refreshed_date}'=p_report_date::text then
    -- Refresh health and changed stocks without rebuilding order arrays.
    -- Metadata-only publication preserves the version and publication time.
    v_payload := dev21.enrich_live_snapshot_fast_v2(v_tenant,p_report_date,v_payload);
    v_version := dev21.publish_live_snapshot_v2(v_tenant,v_payload,now());
    raise notice 'LIVE snapshot unchanged tenant=% date=% version=%',v_tenant,p_report_date,v_version;
    return v_version;
  end if;

  with accounts as materialized (
    select a.account_id,a.marketplace,r.cabinet
    from config.marketplace_accounts a
    join config.account_runtime_v2 r using(tenant_id,account_id)
    where a.tenant_id=v_tenant and a.active and r.daily_active
      and a.account_id=any(v_changed_accounts)
  ), valid as materialized (
    select r.* from dev21.live_order_rows_v2(v_tenant,p_report_date) r
    where r.account_id=any(v_changed_accounts)
      and (coalesce(r.order_state,'')<>'cancelled' or r.source_updated_at::date>r.report_date)
  ), day_agg as (
    select account_id,marketplace,cabinet,count(distinct order_key)::numeric orders,
      sum(units) units,sum(gmv) gmv,count(distinct article)::numeric distinct_skus
    from valid group by 1,2,3
  ), day_complete as (
    select a.account_id,a.marketplace,a.cabinet,coalesce(d.orders,0) orders,
      coalesce(d.units,0) units,coalesce(d.gmv,0) gmv,
      coalesce(d.distinct_skus,0) distinct_skus
    from accounts a left join day_agg d using(account_id,marketplace,cabinet)
  ), sku_agg as (
    select account_id,marketplace,cabinet,sku,article,max(product_name) product_name,
      count(distinct order_key)::numeric orders,sum(units) units,sum(gmv) gmv
    from valid group by 1,2,3,4,5
  ), line_rows as (
    select jsonb_build_object(
      'report_date',report_date::text,'marketplace',marketplace,'cabinet',cabinet,
      'order_key',order_key,'sku',sku,'article',article,'product_name',product_name,
      'units',units,'gmv',gmv,'is_live',true
    ) item from valid
  )
  select
    coalesce((select jsonb_agg(jsonb_build_object(
      'report_date',p_report_date::text,'marketplace',marketplace,'cabinet',cabinet,
      'orders',orders,'units',units,'gmv',gmv,'distinct_skus',distinct_skus,
      'is_live',true,'is_reconstructed',false
    ) order by marketplace,cabinet) from day_complete),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'report_date',p_report_date::text,'marketplace',marketplace,'cabinet',cabinet,
      'sku',sku,'article',article,'product_name',product_name,'orders',orders,
      'units',units,'gmv',gmv,'avg_order_price',case when units<>0 then gmv/units end,
      'is_live',true,'is_reconstructed',false
    ) order by marketplace,cabinet,article) from sku_agg),'[]'::jsonb),
    coalesce((select jsonb_agg(item order by item->>'marketplace',item->>'cabinet',item->>'order_key',item->>'sku') from line_rows),'[]'::jsonb)
  into v_daily,v_sku,v_lines;

  if v_tenant='ORANGE' then
    select coalesce(jsonb_agg(x||jsonb_build_object(
      'canonical_sku',coalesce((select max(m.canonical_sku)
        from core.orange_identity_source_map_v2 m
        where m.marketplace=x->>'marketplace' and m.cabinet=x->>'cabinet'
          and m.source_marketplace_sku=x->>'sku'),x->>'article'))
      order by x->>'marketplace',x->>'cabinet',x->>'article'),'[]'::jsonb)
    into v_sku from jsonb_array_elements(v_sku) x;
  end if;

  v_payload := jsonb_set(v_payload,'{daily}',coalesce((
    select jsonb_agg(x order by x->>'report_date',x->>'marketplace',x->>'cabinet')
    from (
      select x from jsonb_array_elements(coalesce(v_payload->'daily','[]'::jsonb)) x
      where (x->>'report_date')::date<>p_report_date or not exists(
        select 1 from config.marketplace_accounts a
        join config.account_runtime_v2 r using(tenant_id,account_id)
        where a.tenant_id=v_tenant and a.account_id=any(v_changed_accounts)
          and a.marketplace=x->>'marketplace' and r.cabinet=x->>'cabinet')
      union all select x from jsonb_array_elements(v_daily) x
    ) q),'[]'::jsonb),true);

  v_payload := jsonb_set(v_payload,'{sku_daily}',coalesce((
    select jsonb_agg(x order by x->>'report_date',x->>'marketplace',x->>'cabinet',x->>'article')
    from (
      select x from jsonb_array_elements(coalesce(v_payload->'sku_daily','[]'::jsonb)) x
      where (x->>'report_date')::date<>p_report_date or not exists(
        select 1 from config.marketplace_accounts a
        join config.account_runtime_v2 r using(tenant_id,account_id)
        where a.tenant_id=v_tenant and a.account_id=any(v_changed_accounts)
          and a.marketplace=x->>'marketplace' and r.cabinet=x->>'cabinet')
      union all select x from jsonb_array_elements(v_sku) x
    ) q),'[]'::jsonb),true);

  v_payload := jsonb_set(v_payload,'{lines}',coalesce((
    select jsonb_agg(x order by x->>'report_date',x->>'marketplace',x->>'cabinet',x->>'order_key',x->>'sku')
    from (
      select x from jsonb_array_elements(coalesce(v_payload->'lines','[]'::jsonb)) x
      where (x->>'report_date')::date<>p_report_date or not exists(
        select 1 from config.marketplace_accounts a
        join config.account_runtime_v2 r using(tenant_id,account_id)
        where a.tenant_id=v_tenant and a.account_id=any(v_changed_accounts)
          and a.marketplace=x->>'marketplace' and r.cabinet=x->>'cabinet')
      union all select x from jsonb_array_elements(v_lines) x
    ) q),'[]'::jsonb),true);
  v_after_aggregate := clock_timestamp();

  v_payload := v_payload || jsonb_build_object('meta',
    coalesce(v_payload->'meta','{}'::jsonb) || jsonb_build_object(
      'generated_at',now()::text,'raw_max_date',p_report_date::text,
      'orders_source','core-v2-live-parameterized','orders_refreshed_date',p_report_date::text,
      'live_source_fingerprints',v_fingerprints,
      'canonicalization_version','orange-v2'
    ));
  if v_tenant='ORANGE' then
    v_payload := jsonb_set(v_payload,'{meta,canonical_content_hash}',
      to_jsonb(md5(jsonb_build_array(v_payload->'sku_daily',v_payload->'dimensions')::text)),true);
  end if;
  v_payload := dev21.enrich_live_snapshot_fast_v2(v_tenant,p_report_date,v_payload);
  v_after_enrich := clock_timestamp();
  v_payload := jsonb_set(v_payload,'{meta,build_timings_ms}',jsonb_build_object(
    'source_scan',round((extract(epoch from(v_after_source-v_started_at))*1000)::numeric,1),
    'aggregate_merge',round((extract(epoch from(v_after_aggregate-v_after_source))*1000)::numeric,1),
    'fast_enrichment',round((extract(epoch from(v_after_enrich-v_after_aggregate))*1000)::numeric,1),
    'pre_publish_total',round((extract(epoch from(v_after_enrich-v_started_at))*1000)::numeric,1)
  ),true);

  v_version := dev21.publish_live_snapshot_v2(v_tenant,v_payload,now());
  return v_version;
end;
$function$;

comment on function dev21.refresh_live_snapshot_v2(text,date) is
  'Idempotent tenant/date LIVE builder. Uses a non-waiting tenant lock, per-source fingerprints, current-day raw filtering, and deferred historical reconciliation.';
