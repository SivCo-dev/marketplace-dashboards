-- Marketplace daily V2 rollout, 2026-10-04 (Moscow).
-- Applied to project tcefrvybgulcwwsdarcw via versioned migrations.
-- Private backend projections; preserve existing daily economics/enrichments.


create or replace view core.daily_orders_w_v2 with (security_invoker=true) as
select r.* from (select distinct on (tenant_id,account_id,posting_number,line_item_key) payload
from raw.ozon_orders_raw where tenant_id='W' and account_id='ozon_w'
order by tenant_id,account_id,posting_number,line_item_key,observed_at desc,ingested_at desc,raw_order_id desc) x
cross join lateral jsonb_populate_record(null::public.orders_raw,x.payload) r;
create or replace view core.daily_orders_cpr_v2 with (security_invoker=true) as
select r.* from (select distinct on (tenant_id,account_id,posting_number,line_item_key) payload
from raw.ozon_orders_raw where tenant_id='CPR' and account_id='ozon_cpr'
order by tenant_id,account_id,posting_number,line_item_key,observed_at desc,ingested_at desc,raw_order_id desc) x
cross join lateral jsonb_populate_record(null::public.cpr_orders_raw,x.payload) r;
create or replace view core.daily_orders_orange_ozon_v2 with (security_invoker=true) as
select r.* from (select distinct on (tenant_id,account_id,posting_number,line_item_key) payload
from raw.ozon_orders_raw where tenant_id='ORANGE'
order by tenant_id,account_id,posting_number,line_item_key,observed_at desc,ingested_at desc,raw_order_id desc) x
cross join lateral jsonb_populate_record(null::public.orange_orders_raw,x.payload) r;
create or replace view core.daily_orders_orange_marketplace_v2 with (security_invoker=true) as
select r.* from core.marketplace_order_current_v2 x
cross join lateral jsonb_populate_record(null::public.orange_marketplace_orders_raw_1x,x.payload) r
where x.tenant_id='ORANGE';
revoke all on core.daily_orders_w_v2,core.daily_orders_cpr_v2,core.daily_orders_orange_ozon_v2,core.daily_orders_orange_marketplace_v2 from public,anon,authenticated;
create table if not exists config.daily_consumer_switch_v2(
tenant_id text primary key references config.tenants(tenant_id),
enabled boolean not null default false,
enabled_at timestamptz,
reason text not null);
alter table config.daily_consumer_switch_v2 enable row level security;
revoke all on config.daily_consumer_switch_v2 from public,anon,authenticated;
insert into config.daily_consumer_switch_v2(tenant_id,reason) select tenant_id,'Pending parity and readiness validation' from config.tenants where tenant_id in ('W','CPR','ORANGE') on conflict do nothing;


create table raw.order_source_success_v2(
account_id text primary key references config.marketplace_accounts(account_id),
last_success_at timestamptz not null,n8n_execution_id text,row_count bigint not null,
provenance text not null);
alter table raw.order_source_success_v2 enable row level security;
revoke all on raw.order_source_success_v2 from public,anon,authenticated;
grant select,insert,update on raw.order_source_success_v2 to service_role;
insert into raw.order_source_success_v2(account_id,last_success_at,row_count,provenance)
select a.account_id,s.last_success,s.row_count,'accepted_legacy_load_status_seed'
from config.marketplace_accounts a join config.account_runtime_v2 rt using(tenant_id,account_id)
join public.orange_marketplace_load_status_1x s on s.marketplace=a.marketplace and s.cabinet=rt.cabinet
where a.tenant_id='ORANGE' and a.marketplace='WB' and s.last_success is not null;

CREATE OR REPLACE FUNCTION raw.copy_saved_marketplace_orders_v2(p_account text, p_key text, p_execution text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE market text;cab text; rows_json jsonb; c record; b uuid; result jsonb; batches jsonb:='[]'; observed timestamptz:=clock_timestamp(); copied bigint:=0; inserted bigint:=0;
BEGIN
 SELECT a.marketplace,rt.cabinet INTO market,cab FROM config.marketplace_accounts a JOIN config.account_runtime_v2 rt USING(tenant_id,account_id)
 WHERE a.account_id=p_account AND a.tenant_id='ORANGE';
 IF market NOT IN ('WB','YANDEX') OR market IS NULL OR nullif(btrim(p_key),'') IS NULL THEN RAISE EXCEPTION 'invalid saved source copy request' USING errcode='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saved-order-copy|'||p_account,0));
 SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.posting_number,s.sku),'[]'::jsonb) INTO rows_json
 FROM public.orange_marketplace_orders_raw_1x s
 LEFT JOIN LATERAL (SELECT v.payload FROM raw.marketplace_orders_raw_v2 v WHERE v.account_id=p_account AND v.posting_number=s.posting_number AND v.external_sku=s.sku ORDER BY v.observed_at DESC,v.raw_order_id DESC LIMIT 1) latest ON true
 WHERE s.marketplace=market AND s.cabinet=cab AND (latest.payload-'updated_at') IS DISTINCT FROM (to_jsonb(s)-'updated_at');
 FOR c IN
 SELECT ((ordinality-1)/10000)::int chunk,jsonb_agg(value ORDER BY ordinality) rows_payload,min(value->>'order_date') date_from,max(value->>'order_date') date_to
 FROM jsonb_array_elements(rows_json) WITH ORDINALITY GROUP BY 1 ORDER BY 1
 LOOP
  b:=raw.stage_order_batch_v2('ORANGE',p_account,p_key||':'||c.chunk,observed,c.rows_payload,jsonb_build_object(
   'complete',true,'page_complete',true,'pages',1,'received_rows',jsonb_array_length(c.rows_payload),
   'date_from',c.date_from,'date_to',c.date_to,'source','saved_legacy_bootstrap','coverage_mode','saved_source_delta',
   'source_table','public.orange_marketplace_orders_raw_1x','baseline_accepted_by_user',true,
   'completeness_scope','stored_rows_copy','api_window_completeness','not_reassessed','n8n_execution_id',p_execution));
  result:=raw.publish_order_batch_v2(b,false);
  batches:=batches||jsonb_build_array(result);copied:=copied+jsonb_array_length(c.rows_payload);inserted:=inserted+coalesce((result->>'inserted_versions')::bigint,0);
 END LOOP;
 IF p_execution IS NOT NULL THEN
 INSERT INTO raw.order_source_success_v2(account_id,last_success_at,n8n_execution_id,row_count,provenance)
 SELECT p_account,observed,p_execution,count(*),'successful_n8n_saved_delta'
 FROM public.orange_marketplace_orders_raw_1x WHERE marketplace=market AND cabinet=cab
 ON CONFLICT(account_id) DO UPDATE SET last_success_at=EXCLUDED.last_success_at,n8n_execution_id=EXCLUDED.n8n_execution_id,row_count=EXCLUDED.row_count,provenance=EXCLUDED.provenance;
 END IF;
 RETURN jsonb_build_object('account_id',p_account,'copied_rows',copied,'inserted_versions',inserted,'batches',batches,'source','saved_rows','current_user',current_user);
END $function$
;

create or replace function dev21.sync_order_source_status_v2(p_tenant text)
returns void language sql set search_path='' as $f$
insert into dev21.source_refresh_status(account_id,dataset,last_attempt_at,last_success_at,source_data_at,row_count,status,error_text,metadata,updated_at)
select case when b.account_id like 'yandex_%' then replace(b.account_id,'yandex_','ya_') else b.account_id end,
'orders',greatest(max(b.observed_at),max(h.last_success_at)),greatest(max(b.observed_at),max(h.last_success_at)),greatest(max(b.observed_at),max(h.last_success_at)),
coalesce((select count(*) from core.order_line_current o where o.account_id=b.account_id),0)::integer
+coalesce((select count(*) from core.marketplace_order_current_v2 o where o.account_id=b.account_id),0)::integer,
'success',null,jsonb_build_object('synced_from','v2_accepted_ingestion','last_published_at',max(b.published_at),'heartbeat_at',max(h.last_success_at)),now()
from raw.order_load_batches_v2 b left join raw.order_source_success_v2 h on h.account_id=b.account_id
where b.status='PUBLISHED' and b.tenant_id=upper(p_tenant)
group by b.account_id
on conflict on constraint source_refresh_status_pkey do update set
last_attempt_at=excluded.last_attempt_at,last_success_at=excluded.last_success_at,source_data_at=excluded.source_data_at,
row_count=excluded.row_count,status=excluded.status,error_text=null,metadata=excluded.metadata,updated_at=now();
$f$;
revoke all on function dev21.sync_order_source_status_v2(text) from public,anon,authenticated;


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
  if v_tenant in ('W','CPR') and not exists(
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
    raise exception 'No existing daily-full snapshot for tenant %', v_tenant;
  end if;

  if v_tenant='W' then
    with valid as (
      select *
      from core.daily_orders_w_v2 r
      where r.order_date=v_today
        and (coalesce(r.order_state,'')<>'cancelled' or r.updated_at::date>r.order_date)
    )
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'report_date',v_today::text,
        'marketplace','OZON',
        'cabinet','W',
        'orders',x.orders,
        'units',x.units,
        'gmv',x.gmv,
        'distinct_skus',x.distinct_skus,
        'is_live',true,
        'is_reconstructed',false
      )),'[]'::jsonb)
    into v_daily
    from (
      select count(distinct coalesce(nullif(order_number,''),posting_number))::numeric orders,
             coalesce(sum(quantity),0)::numeric units,
             coalesce(sum(gross_amount),0)::numeric gmv,
             count(distinct coalesce(nullif(offer_id,''),sku::text))::numeric distinct_skus
      from valid
    ) x;

    with valid as (
      select *
      from core.daily_orders_w_v2 r
      where r.order_date=v_today
        and (coalesce(r.order_state,'')<>'cancelled' or r.updated_at::date>r.order_date)
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'report_date',v_today::text,'marketplace','OZON','cabinet','W',
      'sku',x.sku,'article',x.article,'product_name',x.product_name,
      'orders',x.orders,'units',x.units,'gmv',x.gmv,
      'avg_order_price',case when x.units<>0 then x.gmv/x.units end,
      'is_live',true,'is_reconstructed',false
    ) order by x.article),'[]'::jsonb)
    into v_sku
    from (
      select sku::text sku,
             coalesce(nullif(offer_id,''),sku::text) article,
             max(product_name) product_name,
             count(distinct coalesce(nullif(order_number,''),posting_number))::numeric orders,
             sum(quantity)::numeric units,
             sum(gross_amount)::numeric gmv
      from valid
      group by sku::text,coalesce(nullif(offer_id,''),sku::text)
    ) x;

  elsif v_tenant='CPR' then
    with valid as (
      select *
      from core.daily_orders_cpr_v2 r
      where r.order_date=v_today
        and (coalesce(r.order_state,'')<>'cancelled' or r.updated_at::date>r.order_date)
    )
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'report_date',v_today::text,
        'marketplace','OZON',
        'cabinet','CPR',
        'orders',x.orders,
        'units',x.units,
        'gmv',x.gmv,
        'distinct_skus',x.distinct_skus,
        'is_live',true,
        'is_reconstructed',false
      )),'[]'::jsonb)
    into v_daily
    from (
      select count(distinct coalesce(nullif(order_number,''),posting_number))::numeric orders,
             coalesce(sum(quantity),0)::numeric units,
             coalesce(sum(gross_amount),0)::numeric gmv,
             count(distinct coalesce(nullif(offer_id,''),sku::text))::numeric distinct_skus
      from valid
    ) x;

    with valid as (
      select *
      from core.daily_orders_cpr_v2 r
      where r.order_date=v_today
        and (coalesce(r.order_state,'')<>'cancelled' or r.updated_at::date>r.order_date)
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'report_date',v_today::text,'marketplace','OZON','cabinet','CPR',
      'sku',x.sku,'article',x.article,'product_name',x.product_name,
      'orders',x.orders,'units',x.units,'gmv',x.gmv,
      'avg_order_price',case when x.units<>0 then x.gmv/x.units end,
      'is_live',true,'is_reconstructed',false
    ) order by x.article),'[]'::jsonb)
    into v_sku
    from (
      select sku::text sku,
             coalesce(nullif(offer_id,''),sku::text) article,
             max(product_name) product_name,
             count(distinct coalesce(nullif(order_number,''),posting_number))::numeric orders,
             sum(quantity)::numeric units,
             sum(gross_amount)::numeric gmv
      from valid
      group by sku::text,coalesce(nullif(offer_id,''),sku::text)
    ) x;

  elsif v_tenant='ORANGE' then
    with src as (
      select 'OZON'::text marketplace,r.cabinet::text cabinet,r.order_date::date report_date,
             coalesce(nullif(r.order_number,''),r.posting_number)::text order_key,
             r.sku::text sku,coalesce(nullif(r.offer_id,''),r.sku::text)::text article,
             coalesce(r.product_name,'')::text product_name,r.quantity::numeric units,
             r.gross_amount::numeric gmv,r.order_state::text order_state,r.updated_at source_updated_at
      from core.daily_orders_orange_ozon_v2 r
      where r.order_date=v_today
      union all
      select upper(r.marketplace)::text,r.cabinet::text,r.order_date::date,
             coalesce(nullif(r.order_number,''),nullif(r.order_id,''),r.posting_number)::text,
             r.sku::text,coalesce(nullif(r.offer_id,''),r.sku)::text,
             coalesce(r.product_name,'')::text,r.quantity::numeric,r.gross_amount::numeric,
             r.order_state::text,coalesce(r.source_updated_at,r.updated_at)
      from core.daily_orders_orange_marketplace_v2 r
      where r.order_date=v_today
    ),
    valid as (
      select * from src
      where coalesce(order_state,'')<>'cancelled' or source_updated_at::date>report_date
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'report_date',v_today::text,'marketplace',x.marketplace,'cabinet',x.cabinet,
      'orders',x.orders,'units',x.units,'gmv',x.gmv,'distinct_skus',x.distinct_skus,
      'is_live',true,'is_reconstructed',false
    ) order by x.marketplace,x.cabinet),'[]'::jsonb)
    into v_daily
    from (
      select marketplace,cabinet,count(distinct order_key)::numeric orders,
             sum(units)::numeric units,sum(gmv)::numeric gmv,
             count(distinct article)::numeric distinct_skus
      from valid group by marketplace,cabinet
    ) x;

    with src as (
      select 'OZON'::text marketplace,r.cabinet::text cabinet,r.order_date::date report_date,
             coalesce(nullif(r.order_number,''),r.posting_number)::text order_key,
             r.sku::text sku,coalesce(nullif(r.offer_id,''),r.sku::text)::text article,
             coalesce(r.product_name,'')::text product_name,r.quantity::numeric units,
             r.gross_amount::numeric gmv,r.order_state::text order_state,r.updated_at source_updated_at
      from core.daily_orders_orange_ozon_v2 r
      where r.order_date=v_today
      union all
      select upper(r.marketplace)::text,r.cabinet::text,r.order_date::date,
             coalesce(nullif(r.order_number,''),nullif(r.order_id,''),r.posting_number)::text,
             r.sku::text,coalesce(nullif(r.offer_id,''),r.sku)::text,
             coalesce(r.product_name,'')::text,r.quantity::numeric,r.gross_amount::numeric,
             r.order_state::text,coalesce(r.source_updated_at,r.updated_at)
      from core.daily_orders_orange_marketplace_v2 r
      where r.order_date=v_today
    ),
    valid as (
      select * from src
      where coalesce(order_state,'')<>'cancelled' or source_updated_at::date>report_date
    ),
    agg as (
      select marketplace,cabinet,sku,article,max(product_name) product_name,
             count(distinct order_key)::numeric orders,sum(units)::numeric units,sum(gmv)::numeric gmv
      from valid group by marketplace,cabinet,sku,article
    )
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'report_date',v_today::text,'marketplace',a.marketplace,'cabinet',a.cabinet,
      'sku',a.sku,'article',a.article,
      'canonical_sku',coalesce(m.canonical_sku,a.article),
      'product_name',a.product_name,'orders',a.orders,'units',a.units,'gmv',a.gmv,
      'avg_order_price',case when a.units<>0 then a.gmv/a.units end,
      'is_live',true,'is_reconstructed',false
    )) order by a.marketplace,a.cabinet,a.article),'[]'::jsonb)
    into v_sku
    from agg a
    left join core.orange_identity_source_map_v2 m
      on m.marketplace=a.marketplace and m.cabinet=a.cabinet and m.source_marketplace_sku=a.sku;
  else
    raise exception 'Unsupported tenant %', v_tenant;
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
  v_version := dev21.publish_dashboard_snapshot(
    v_tenant,'daily-full',v_payload,now(),'intraday'
  );
  return v_version;
end;
$function$
;
revoke all on function dev21.refresh_live_snapshot_v2(text,date) from public,anon,authenticated;
