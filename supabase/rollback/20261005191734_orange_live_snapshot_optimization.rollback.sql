-- Roll back code paths only. Snapshot/history rows are intentionally retained.

CREATE OR REPLACE FUNCTION dev21.trg_canonicalize_orange_dashboard_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.tenant_id='ORANGE' and new.snapshot_kind='daily-full' then
    new.payload := dev21.canonicalize_orange_dashboard_payload(new.payload);
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION dev21.refresh_live_snapshot_v2(p_tenant text, p_report_date date DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow'::text))::date)
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_tenant text := upper(p_tenant);
  v_payload jsonb;
  v_daily jsonb := '[]'::jsonb;
  v_sku jsonb := '[]'::jsonb;
  v_today date := p_report_date;
  v_version bigint;
begin
  if p_report_date not between (current_timestamp at time zone 'Europe/Moscow')::date-1 and (current_timestamp at time zone 'Europe/Moscow')::date then
    raise exception 'Only live today or yesterday can be refreshed';
  end if;
  if not exists(
 select 1 from raw.order_load_batches_v2 b
 where b.tenant_id=v_tenant and b.status='PUBLISHED'
 and (b.observed_at at time zone 'Europe/Moscow')::date>=p_report_date
 and (b.manifest->>'date_from')::date<=p_report_date
 and (b.manifest->>'date_to')::date>=p_report_date
 ) then raise exception 'No accepted V2 coverage for tenant % date %',v_tenant,p_report_date; end if;
  perform dev21.sync_order_source_status_v2(v_tenant);

  select s.payload into v_payload
  from dev21.dashboard_snapshots s
  where s.tenant_id=v_tenant and s.snapshot_kind='daily-full' and s.is_complete=true;

  if v_payload is null then
    v_payload:=jsonb_build_object('daily','[]'::jsonb,'sku_daily','[]'::jsonb,'lines','[]'::jsonb,'meta',jsonb_build_object('tenant_id',v_tenant));
  end if;

  with valid as materialized (
    select * from core.daily_order_rows_v2 r where tenant_id=v_tenant and report_date=v_today
    and (coalesce(order_state,'')<>'cancelled' or source_updated_at::date>report_date)
  ), day_agg as (
    select marketplace,cabinet,count(distinct order_key)::numeric orders,
    sum(units) units,sum(gmv) gmv,count(distinct article)::numeric distinct_skus
    from valid group by 1,2
  ), sku_agg as (
    select marketplace,cabinet,sku,article,max(product_name) product_name,
    count(distinct order_key)::numeric orders,sum(units) units,sum(gmv) gmv
    from valid group by 1,2,3,4
  )
  select
    coalesce((select jsonb_agg(jsonb_build_object('report_date',v_today::text,
    'marketplace',marketplace,'cabinet',cabinet,'orders',orders,'units',units,'gmv',gmv,
    'distinct_skus',distinct_skus,'is_live',true,'is_reconstructed',false) order by marketplace,cabinet) from day_agg),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('report_date',v_today::text,
    'marketplace',marketplace,'cabinet',cabinet,'sku',sku,'article',article,
    'product_name',product_name,'orders',orders,'units',units,'gmv',gmv,
    'avg_order_price',case when units<>0 then gmv/units end,'is_live',true,'is_reconstructed',false)
    order by marketplace,cabinet,article) from sku_agg),'[]'::jsonb)
  into v_daily,v_sku;
  if v_tenant='ORANGE' then
    select coalesce(jsonb_agg(x||jsonb_build_object('canonical_sku',coalesce(m.canonical_sku,x->>'article')) order by x->>'marketplace',x->>'cabinet',x->>'article'),'[]'::jsonb)
    into v_sku from jsonb_array_elements(v_sku) x
    left join core.orange_identity_source_map_v2 m on m.marketplace=x->>'marketplace' and m.cabinet=x->>'cabinet' and m.source_marketplace_sku=x->>'sku';
  end if;
  if jsonb_array_length(v_daily)=0 and v_tenant in ('W','CPR') then
    select jsonb_agg(jsonb_build_object('report_date',v_today::text,'marketplace',a.marketplace,'cabinet',r.cabinet,'orders',0,'units',0,'gmv',0,'distinct_skus',0,'is_live',true,'is_reconstructed',false))
    into v_daily from config.marketplace_accounts a join config.account_runtime_v2 r using(tenant_id,account_id)
    where a.tenant_id=v_tenant and a.active and r.daily_active;
  end if;
  v_payload :=
    jsonb_set(
      jsonb_set(
        v_payload,
        '{daily}',
        coalesce((
          select jsonb_agg(x order by x->>'report_date',x->>'marketplace',x->>'cabinet')
          from (
            select x
            from jsonb_array_elements(coalesce(v_payload->'daily','[]'::jsonb)) x
            where (x->>'report_date')::date<>v_today
            union all
            select x from jsonb_array_elements(v_daily) x
          ) z
        ),'[]'::jsonb),
        true
      ),
      '{sku_daily}',
      coalesce((
        select jsonb_agg(x order by x->>'report_date',x->>'marketplace',x->>'cabinet',x->>'article')
        from (
          select x
          from jsonb_array_elements(coalesce(v_payload->'sku_daily','[]'::jsonb)) x
          where (x->>'report_date')::date<>v_today
          union all
          select x from jsonb_array_elements(v_sku) x
        ) z
      ),'[]'::jsonb),
      true
    );

  v_payload := jsonb_set(
    v_payload,
    '{meta,generated_at}',
    to_jsonb(now()::text),
    true
  );
  v_payload := jsonb_set(
    v_payload,
    '{meta,raw_max_date}',
    to_jsonb(v_today::text),
    true
  );

  v_payload := jsonb_set(v_payload,'{meta,orders_source}',to_jsonb('core-v2'::text),true);
  v_payload := jsonb_set(v_payload,'{meta,orders_refreshed_date}',to_jsonb(v_today::text),true);
  v_payload := dev21.enrich_live_snapshot_sources_v2(v_tenant,v_payload);
  v_version := dev21.publish_dashboard_snapshot(
    v_tenant,'daily-full',v_payload,now(),'intraday'
  );
  return v_version;
end;
$function$;

drop function if exists dev21.publish_live_snapshot_v2(text,jsonb,timestamptz);
drop function if exists dev21.ensure_orange_canonical_payload_v2(jsonb);
drop function if exists dev21.orange_canonical_source_checkpoint_v2();
drop function if exists dev21.canonicalize_orange_dashboard_payload_fast_v2(jsonb);
drop function if exists dev21.enrich_live_snapshot_fast_v2(text,date,jsonb);
drop function if exists dev21.live_order_rows_v2(text,date);

drop index if exists raw.marketplace_orders_raw_v2_live_day_idx;
drop index if exists public.ozon_stock_snapshots_latest_type_idx;
drop index if exists dev21.dashboard_snapshot_history_cycle_idx;
