-- Registry-scoped order reading. No additional copy of RAW/current facts.
CREATE OR REPLACE VIEW core.daily_order_rows_v2 WITH (security_invoker=true) AS
WITH latest_ozon AS (
 SELECT DISTINCT ON (tenant_id,account_id,posting_number,line_item_key)
 tenant_id,account_id,marketplace,posting_number,line_item_key AS sku,payload
 FROM raw.ozon_orders_raw
 ORDER BY tenant_id,account_id,posting_number,line_item_key,observed_at DESC,ingested_at DESC,raw_order_id DESC
), latest_other AS (
 SELECT DISTINCT ON (tenant_id,account_id,posting_number,external_sku)
 tenant_id,account_id,marketplace,posting_number,external_sku AS sku,payload
 FROM raw.marketplace_orders_raw_v2
 ORDER BY tenant_id,account_id,posting_number,external_sku,observed_at DESC,raw_order_id DESC
), all_rows AS (SELECT * FROM latest_ozon UNION ALL SELECT * FROM latest_other)
SELECT o.tenant_id,o.account_id,o.marketplace,r.cabinet,
 (o.payload->>'order_date')::date AS report_date,
 coalesce(nullif(o.payload->>'order_number',''),case when o.marketplace<>'OZON' then nullif(o.payload->>'order_id','') end,o.posting_number) AS order_key,
 o.sku,coalesce(nullif(o.payload->>'offer_id',''),o.sku) AS article,
 o.payload->>'product_name' AS product_name,
 (o.payload->>'quantity')::numeric AS units,(o.payload->>'gross_amount')::numeric AS gmv,
 o.payload->>'order_state' AS order_state,
 coalesce((o.payload->>'source_updated_at')::timestamptz,(o.payload->>'updated_at')::timestamptz) AS source_updated_at
FROM all_rows o JOIN config.marketplace_accounts a USING(tenant_id,account_id)
JOIN config.account_runtime_v2 r USING(tenant_id,account_id)
WHERE a.active AND r.daily_active;
REVOKE ALL ON core.daily_order_rows_v2 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON core.daily_order_rows_v2 TO service_role;

-- Only a backend operator provisions the existing compatibility reporting profile.
-- It is a projection of config, not a second editable account registry.
CREATE OR REPLACE FUNCTION config.prepare_daily_reporting_v2(p_tenant text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM config.tenants WHERE tenant_id=p_tenant AND active) THEN
  RAISE EXCEPTION 'Unknown or disabled tenant' USING errcode='22023';
 END IF;
 INSERT INTO dev21.tenants(tenant_id,tenant_name,active)
 SELECT tenant_id,display_name,active FROM config.tenants WHERE tenant_id=p_tenant
 ON CONFLICT(tenant_id) DO UPDATE SET tenant_name=excluded.tenant_name,active=excluded.active;
 INSERT INTO dev21.daily_dashboard_policy(tenant_id) VALUES(p_tenant) ON CONFLICT DO NOTHING;
 INSERT INTO dev21.marketplace_accounts(account_id,tenant_id,marketplace,cabinet,active,loader_enabled,lifecycle_status,metadata)
 SELECT a.account_id,a.tenant_id,a.marketplace,r.cabinet,a.active AND r.daily_active,r.loader_enabled,r.lifecycle_status,
 jsonb_build_object('registry_projection','config.account_runtime_v2')
 FROM config.marketplace_accounts a JOIN config.account_runtime_v2 r USING(tenant_id,account_id)
 WHERE a.tenant_id=p_tenant
 ON CONFLICT(account_id) DO UPDATE SET tenant_id=excluded.tenant_id,marketplace=excluded.marketplace,
 cabinet=excluded.cabinet,active=excluded.active,loader_enabled=excluded.loader_enabled,lifecycle_status=excluded.lifecycle_status;
 INSERT INTO dev21.account_sources(account_id,dataset,enabled,refresh_interval_minutes,required_for_daily,required_for_intraday,adapter)
 SELECT a.account_id,'orders',a.active AND r.daily_active,
 coalesce((r.daily_metadata->>'orders_refresh_interval_minutes')::int,180),true,true,'registry_v2'
 FROM config.marketplace_accounts a JOIN config.account_runtime_v2 r USING(tenant_id,account_id)
 WHERE a.tenant_id=p_tenant
 ON CONFLICT(account_id,dataset) DO NOTHING;
END $fn$;
REVOKE ALL ON FUNCTION config.prepare_daily_reporting_v2(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION config.prepare_daily_reporting_v2(text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_dashboard_registry_v2()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
SELECT jsonb_build_object('tenants',coalesce(jsonb_agg(jsonb_build_object(
 'tenant_id',t.tenant_id,'display_name',t.display_name,
 'daily_available',exists(SELECT 1 FROM dev21.dashboard_snapshots s WHERE s.tenant_id=t.tenant_id AND s.snapshot_kind='daily-full' AND s.is_complete),
 'monthly_available',exists(SELECT 1 FROM reporting.monthly_accepted_source_v2 s WHERE s.tenant_id=t.tenant_id),
 'accounts',(SELECT coalesce(jsonb_agg(jsonb_build_object('account_id',a.account_id,'marketplace',a.marketplace,'cabinet',r.cabinet) ORDER BY a.account_id),'[]'::jsonb)
 FROM config.marketplace_accounts a JOIN config.account_runtime_v2 r USING(tenant_id,account_id)
 WHERE a.tenant_id=t.tenant_id AND a.active AND r.daily_active)
 ) ORDER BY t.tenant_id),'[]'::jsonb))
FROM config.tenants t WHERE t.active AND (
 EXISTS(SELECT 1 FROM dev21.dashboard_snapshots s WHERE s.tenant_id=t.tenant_id AND s.snapshot_kind='daily-full' AND s.is_complete)
 OR EXISTS(SELECT 1 FROM reporting.monthly_accepted_source_v2 s WHERE s.tenant_id=t.tenant_id));
$fn$;
REVOKE ALL ON FUNCTION public.get_dashboard_registry_v2() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_registry_v2() TO service_role;

CREATE OR REPLACE FUNCTION raw.stage_order_batch_v2(p_tenant text, p_account text, p_key text, p_observed timestamp with time zone, p_rows jsonb, p_manifest jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid; v_hash text; v_existing raw.order_load_batches_v2%rowtype;
begin
 if not exists(select 1 from config.marketplace_accounts a join config.account_runtime_v2 r using(tenant_id,account_id) join config.tenants t using(tenant_id) where a.tenant_id=p_tenant and a.account_id=p_account and a.marketplace in ('OZON','WB','YANDEX') and t.active and a.active and r.loader_enabled and r.lifecycle_status in ('backfilling','ready','active')) then
  raise exception 'unsupported or mismatched order account' using errcode='22023';
 end if;
 if p_key is null or btrim(p_key)='' or p_observed is null or p_observed>clock_timestamp()+interval '5 minutes'
    or p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>10000
    or p_manifest is null or jsonb_typeof(p_manifest)<>'object' then
  raise exception 'invalid or oversized order batch' using errcode='22023';
 end if;
 -- Canonical order makes identical replay independent of item order.
 select coalesce(jsonb_agg(value order by value->>'posting_number',value->>'sku',value::text),'[]'::jsonb)
 into p_rows from jsonb_array_elements(p_rows);
 v_hash:=md5(p_rows::text||p_manifest::text||p_observed::text);
 perform pg_advisory_xact_lock(hashtextextended('order-stage-v2|'||p_tenant||'|'||p_account||'|'||p_key,0));
 select * into v_existing from raw.order_load_batches_v2 where tenant_id=p_tenant and account_id=p_account and batch_key=p_key;
 if found then
  if v_existing.payload_checksum<>v_hash then raise exception 'batch key reused with different content' using errcode='22023'; end if;
  return v_existing.batch_id;
 end if;
 insert into raw.order_load_batches_v2(tenant_id,account_id,batch_key,observed_at,rows_payload,manifest,payload_checksum)
 values(p_tenant,p_account,p_key,p_observed,p_rows,p_manifest,v_hash) returning batch_id into v_id;
 return v_id;
end $function$;

CREATE OR REPLACE FUNCTION raw.publish_order_batch_v2(p_batch uuid, p_write_compatibility boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare b raw.order_load_batches_v2%rowtype; j jsonb; merged jsonb; latest raw.ozon_orders_raw%rowtype;
 r core.daily_orders_w_v2%rowtype; v_run bigint; v_count bigint:=0; v_table text; v_id bigint; v_old jsonb; v_payload jsonb; v_cabinet text;
begin
 if p_write_compatibility then raise exception 'legacy compatibility writes retired' using errcode='22023'; end if;
 select * into strict b from raw.order_load_batches_v2 where batch_id=p_batch for update;
 if not exists(select 1 from config.marketplace_accounts a join config.account_runtime_v2 rt using(tenant_id,account_id) join config.tenants t using(tenant_id) where a.tenant_id=b.tenant_id and a.account_id=b.account_id and a.active and t.active and rt.loader_enabled and rt.lifecycle_status in ('backfilling','ready','active')) then raise exception 'disabled or unknown order account' using errcode='22023'; end if;
 if exists(select 1 from config.marketplace_accounts where tenant_id=b.tenant_id and account_id=b.account_id and marketplace in ('WB','YANDEX')) then
  return raw.publish_marketplace_order_batch_v2(p_batch,p_write_compatibility);
 end if;
 if b.status='PUBLISHED' then
  if coalesce((b.manifest->>'compatibility_written')::boolean,false) is distinct from p_write_compatibility then
   raise exception 'cannot change publication mode of accepted batch' using errcode='22023';
  end if;
  return jsonb_build_object('batch_id',b.batch_id,'run_id',b.run_id,'inserted_versions',0,'replay',true);
 end if;
 -- These are explicit checks, not truthiness of a missing has_next field.
 if b.manifest->'complete' is distinct from 'true'::jsonb
  or b.manifest->'fbo_terminal' is distinct from 'true'::jsonb
  or b.manifest->'fbs_terminal' is distinct from 'true'::jsonb
  or coalesce((b.manifest->>'fbo_pages')::int,0)<1
  or coalesce((b.manifest->>'fbs_pages')::int,0)<1
  or (b.manifest->>'received_rows')::int is distinct from jsonb_array_length(b.rows_payload)
  or nullif(b.manifest->>'date_from','') is null or nullif(b.manifest->>'date_to','') is null
  or (b.manifest->>'date_from')::date>(b.manifest->>'date_to')::date then
  raise exception 'incomplete order batch' using errcode='22023';
 end if;
 if exists(select 1 from jsonb_array_elements(b.rows_payload) x where jsonb_typeof(x)<>'object'
  or nullif(btrim(x->>'posting_number'),'') is null or nullif(btrim(x->>'sku'),'') is null
  or nullif(x->>'created_at','') is null or nullif(x->>'order_date','') is null
  or nullif(x->>'status','') is null or x->>'order_state' not in ('active','cancelled') or x->>'order_state' is null
  or (x->>'quantity')::int is null or (x->>'quantity')::int<0
  or (x->>'order_date')::date not between (b.manifest->>'date_from')::date and (b.manifest->>'date_to')::date
 ) then raise exception 'invalid order row or out-of-window date' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(b.rows_payload) x group by x->>'posting_number',x->>'sku'
  having count(distinct (x-'updated_at'))>1) then
  raise exception 'conflicting duplicate order line in batch' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('order-publish-v2|'||b.tenant_id||'|'||b.account_id,0));
 v_table:=case b.account_id when 'ozon_w' then 'orders_raw' when 'ozon_cpr' then 'cpr_orders_raw' else 'orange_orders_raw' end;
 select cabinet into v_cabinet from config.account_runtime_v2 where tenant_id=b.tenant_id and account_id=b.account_id;
 if nullif(v_cabinet,'') is null then raise exception 'Missing runtime cabinet' using errcode='22023'; end if;
 insert into raw.ingestion_runs(tenant_id,account_id,dataset,source_system,source_object,run_key,status,
  requested_from,requested_to,n8n_execution_id,source_row_count,raw_checksum,normalized_checksum,metadata)
 values(b.tenant_id,b.account_id,'orders','order_ingest_v2','ozon_posting_lines',b.batch_key,'STARTED',
  (b.manifest->>'date_from')::date,(b.manifest->>'date_to')::date,b.manifest->>'n8n_execution_id',
  jsonb_array_length(b.rows_payload),b.payload_checksum,b.payload_checksum,b.manifest)
 returning run_id into v_run;
 for j in select distinct value from jsonb_array_elements(b.rows_payload) order by value loop
  -- Match existing n8n replaceEmptyStrings and partial-column upsert semantics.
  if b.tenant_id<>'ORANGE' then
   select jsonb_object_agg(key,case when value='""'::jsonb then 'null'::jsonb else value end) into j from jsonb_each(j);
  end if;
  if b.tenant_id='ORANGE' and (j->>'project' is distinct from 'ORANGE' or j->>'marketplace' is distinct from 'OZON' or j->>'cabinet' is distinct from v_cabinet) then raise exception 'Orange row account mismatch' using errcode='22023'; end if;
  select payload into v_old from raw.ozon_orders_raw where account_id=b.account_id and posting_number=j->>'posting_number' and line_item_key=j->>'sku' order by observed_at desc,ingested_at desc,raw_order_id desc limit 1;
  merged:=coalesce(v_old,jsonb_build_object('updated_at',b.observed_at))||j;
  if b.tenant_id='ORANGE' then
   -- The existing Orange writer explicitly refreshes updated_at on each upsert.
   if b.manifest->>'source'<>'saved_legacy_bootstrap' then merged:=merged||jsonb_build_object('updated_at',b.observed_at); end if;
   v_payload:=to_jsonb(jsonb_populate_record(null::core.daily_orders_orange_ozon_v2,merged));
  else v_payload:=to_jsonb(jsonb_populate_record(null::core.daily_orders_w_v2,merged)); end if;
  r:=jsonb_populate_record(null::core.daily_orders_w_v2,v_payload);
  select * into latest from raw.ozon_orders_raw where account_id=b.account_id and posting_number=r.posting_number
   and line_item_key=r.sku order by observed_at desc,ingested_at desc,raw_order_id desc limit 1;
  -- A historical observation cannot overwrite a newer current state in either layer.
  if latest.raw_order_id is not null and b.observed_at<latest.observed_at then continue; end if;
  if latest.raw_order_id is not null and b.observed_at=latest.observed_at and
   (latest.payload-'updated_at') is distinct from (v_payload-'updated_at') then
   raise exception 'same observation time has conflicting payload' using errcode='22023';
  end if;
  if latest.raw_order_id is null or (latest.payload-'updated_at') is distinct from (v_payload-'updated_at') then
   insert into raw.ozon_orders_raw(tenant_id,account_id,posting_number,order_id,order_number,line_item_key,external_sku,
    offer_id,product_name,fulfillment,order_created_at,operational_date,status_changed_at,observed_at,status,substatus,
    cancel_reason_id,cancel_reason,cancellation_initiator,quantity,item_price,gross_amount,commission_pct,
    commission_amount_order,payload,payload_hash,run_id,source_schema,source_table,source_record_key,source_updated_at)
   values(b.tenant_id,b.account_id,r.posting_number,r.order_id,r.order_number,r.sku,r.sku,r.offer_id,r.product_name,
    r.fulfillment,r.created_at,r.order_date,r.updated_at,b.observed_at,r.status,r.order_state,r.cancel_reason_id,
    r.cancel_reason,r.cancellation_initiator,r.quantity,r.price,r.gross_amount,r.commission_pct,r.commission_amount_order,
    v_payload,md5(v_payload::text),v_run,'raw','order_load_batches_v2',
    jsonb_build_object('posting_number',r.posting_number,'sku',r.sku,'batch_id',b.batch_id),r.updated_at)
   returning raw_order_id into v_id;
   v_count:=v_count+1;
  end if;

 end loop;
 update raw.ingestion_runs set status='SUCCEEDED',completed_at=clock_timestamp(),inserted_row_count=v_count where run_id=v_run;
 update raw.order_load_batches_v2 set status='PUBLISHED',run_id=v_run,inserted_versions=v_count,published_at=clock_timestamp(),
  manifest=manifest||jsonb_build_object('compatibility_written',p_write_compatibility) where batch_id=p_batch;
 return jsonb_build_object('batch_id',p_batch,'run_id',v_run,'inserted_versions',v_count,'replay',false);
end $function$;

CREATE OR REPLACE FUNCTION raw.publish_marketplace_order_batch_v2(p_batch uuid, p_write_compatibility boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare b raw.order_load_batches_v2%rowtype; market text; cab text; j jsonb; v_old jsonb; v_payload jsonb;
 latest raw.marketplace_orders_raw_v2%rowtype; r core.daily_orders_orange_marketplace_v2%rowtype;
 v_run bigint; v_count bigint:=0;
begin
 if p_write_compatibility then raise exception 'legacy compatibility writes retired' using errcode='22023'; end if;
 select * into strict b from raw.order_load_batches_v2 where batch_id=p_batch for update;
 if not exists(select 1 from config.marketplace_accounts a join config.account_runtime_v2 rt using(tenant_id,account_id) join config.tenants t using(tenant_id) where a.tenant_id=b.tenant_id and a.account_id=b.account_id and a.active and t.active and rt.loader_enabled and rt.lifecycle_status in ('backfilling','ready','active')) then raise exception 'disabled or unknown order account' using errcode='22023'; end if;
 select a.marketplace,rt.cabinet into market,cab from config.marketplace_accounts a join config.account_runtime_v2 rt using(tenant_id,account_id) where a.tenant_id=b.tenant_id and a.account_id=b.account_id;
 if market is null or market not in ('WB','YANDEX') then raise exception 'unsupported marketplace order account' using errcode='22023'; end if;
 -- Registry uses the same confirmed cabinet labels for these seven accounts.
 if b.status='PUBLISHED' then
  if coalesce((b.manifest->>'compatibility_written')::boolean,false) is distinct from p_write_compatibility then raise exception 'publication mode changed' using errcode='22023'; end if;
  return jsonb_build_object('batch_id',b.batch_id,'run_id',b.run_id,'inserted_versions',0,'replay',true);
 end if;
 if b.manifest->'complete' is distinct from 'true'::jsonb or b.manifest->'page_complete' is distinct from 'true'::jsonb
 or (b.manifest->>'received_rows')::int is distinct from jsonb_array_length(b.rows_payload)
 or coalesce((b.manifest->>'pages')::int,0)<1 or nullif(b.manifest->>'date_from','') is null or nullif(b.manifest->>'date_to','') is null then
  raise exception 'incomplete marketplace order batch' using errcode='22023';
 end if;
 if exists(select 1 from jsonb_array_elements(b.rows_payload) x where jsonb_typeof(x)<>'object'
 or x->>'marketplace' is distinct from market or x->>'cabinet' is distinct from cab
 or nullif(btrim(x->>'posting_number'),'') is null or nullif(btrim(x->>'sku'),'') is null
 or nullif(x->>'created_at','') is null or nullif(x->>'order_date','') is null or nullif(x->>'status','') is null
 or x->>'order_state' is null or x->>'order_state' not in ('active','cancelled')
 or (x->>'quantity')::int is null or (x->>'quantity')::int<0) then raise exception 'invalid marketplace order row' using errcode='22023'; end if;
 -- WB flag=0 filters last change time, not original order date. Do not reject older cancellations.
 if exists(select 1 from jsonb_array_elements(b.rows_payload) x group by x->>'posting_number',x->>'sku' having count(distinct (x-'updated_at'))>1) then raise exception 'conflicting duplicate marketplace order row' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('order-publish-v2|'||b.tenant_id||'|'||b.account_id,0));
 insert into raw.ingestion_runs(tenant_id,account_id,dataset,source_system,source_object,run_key,status,
 requested_from,requested_to,n8n_execution_id,source_row_count,raw_checksum,normalized_checksum,metadata)
 values(b.tenant_id,b.account_id,'orders','order_ingest_v2','marketplace_order_lines',b.batch_key,'STARTED',
 (b.manifest->>'date_from')::date,(b.manifest->>'date_to')::date,b.manifest->>'n8n_execution_id',jsonb_array_length(b.rows_payload),b.payload_checksum,b.payload_checksum,b.manifest)
 returning run_id into v_run;
 for j in select distinct value from jsonb_array_elements(b.rows_payload) order by value loop
  if jsonb_typeof(j->'source_payload')='string' then j:=jsonb_set(j,'{source_payload}',(j->>'source_payload')::jsonb); end if;
  select payload into v_old from raw.marketplace_orders_raw_v2 where account_id=b.account_id and posting_number=j->>'posting_number' and external_sku=j->>'sku' order by observed_at desc,raw_order_id desc limit 1;
  v_payload:=coalesce(v_old,'{}'::jsonb)||j;
  if b.manifest->>'source'<>'saved_legacy_bootstrap' then v_payload:=v_payload||jsonb_build_object('updated_at',b.observed_at); end if;
  r:=jsonb_populate_record(null::core.daily_orders_orange_marketplace_v2,v_payload);
  v_payload:=to_jsonb(r);
  select * into latest from raw.marketplace_orders_raw_v2 where account_id=b.account_id and posting_number=r.posting_number and external_sku=r.sku order by observed_at desc,raw_order_id desc limit 1;
  if latest.raw_order_id is not null and (b.observed_at<latest.observed_at or r.source_updated_at < (latest.payload->>'source_updated_at')::timestamptz) then continue; end if;
  if latest.raw_order_id is not null and b.observed_at=latest.observed_at and (latest.payload-'updated_at') is distinct from (v_payload-'updated_at') then raise exception 'conflicting same-time observation' using errcode='22023'; end if;
  if latest.raw_order_id is null or (latest.payload-'updated_at') is distinct from (v_payload-'updated_at') then
   insert into raw.marketplace_orders_raw_v2(tenant_id,account_id,marketplace,posting_number,external_sku,observed_at,payload,payload_hash,run_id,batch_id)
   values(b.tenant_id,b.account_id,market,r.posting_number,r.sku,b.observed_at,v_payload,md5(v_payload::text),v_run,b.batch_id);
   v_count:=v_count+1;
  end if;

 end loop;
 update raw.ingestion_runs set status='SUCCEEDED',completed_at=clock_timestamp(),inserted_row_count=v_count where run_id=v_run;
 update raw.order_load_batches_v2 set status='PUBLISHED',run_id=v_run,inserted_versions=v_count,published_at=clock_timestamp(),
 manifest=manifest||jsonb_build_object('compatibility_written',p_write_compatibility) where batch_id=p_batch;
 return jsonb_build_object('batch_id',p_batch,'run_id',v_run,'inserted_versions',v_count,'replay',false);
end $function$;

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

CREATE OR REPLACE FUNCTION dev21.enrich_live_snapshot_sources_v2(p_tenant text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
WITH src AS MATERIALIZED (
 select tenant_id tenant,marketplace,cabinet,report_date,order_key,sku,article,product_name,units,gmv,order_state,source_updated_at from core.daily_order_rows_v2 where tenant_id=upper(p_tenant) and report_date>=date '2026-09-28'
), valid AS MATERIALIZED (
 select * from src where coalesce(order_state,'')<>'cancelled' or source_updated_at::date>report_date
), expected AS (
 select x->>'report_date' AS day,coalesce(x->>'marketplace','OZON') marketplace,coalesce(x->>'cabinet',upper(p_tenant)) cabinet,x->>'sku' sku,sum((x->>'units')::numeric) units,sum((x->>'gmv')::numeric) gmv,sum((x->>'orders')::numeric) orders
 from jsonb_array_elements(p_payload->'sku_daily') x where x->>'report_date'>='2026-09-28'
 group by 1,2,3,4
), actual AS (
 select report_date::text AS day,marketplace,cabinet,sku,sum(units) units,sum(gmv) gmv,count(distinct order_key)::numeric orders from valid group by 1,2,3,4
), mismatch AS (
 select coalesce(e.day,a.day) AS day from expected e full join actual a using(day,marketplace,cabinet,sku)
 where e.units is distinct from a.units or e.gmv is distinct from a.gmv or e.orders is distinct from a.orders
), eligible AS (
 select distinct day from expected where not exists(select 1 from mismatch m where m.day=expected.day)
), line_rows AS (
 select x line from jsonb_array_elements(coalesce(p_payload->'lines','[]'::jsonb)) x
 where not exists(select 1 from eligible e where e.day=x->>'report_date')
 union all
 select jsonb_build_object('report_date',v.report_date::text,'marketplace',v.marketplace,'cabinet',v.cabinet,'order_key',v.order_key,'sku',v.sku,'article',v.article,'product_name',v.product_name,'units',v.units,'gmv',v.gmv,
 'is_live',coalesce((select bool_or((d->>'is_live')::boolean)from jsonb_array_elements(p_payload->'daily')d where d->>'report_date'=v.report_date::text),false))
 from valid v join eligible e on e.day=v.report_date::text
), stock_latest AS MATERIALIZED (
 select project,cabinet,stock_type,max(captured_at) captured_at from public.ozon_stock_snapshots where upper(project)=upper(p_tenant) group by 1,2,3
), stock_agg AS (
 select s.sku,s.offer_id,coalesce(nullif(s.cabinet,''),upper(p_tenant)) cabinet,max(s.captured_at) captured_at,
 sum(s.available)filter(where s.stock_type='fbo') fbo_stock,
 sum(s.available)filter(where s.stock_type in('fbs','rfbs')) fbs_stock,sum(s.reserved) reserved_stock
 from public.ozon_stock_snapshots s join stock_latest l using(project,cabinet,stock_type,captured_at)
 group by s.sku,s.offer_id,s.cabinet
), sales14 AS (
 select coalesce(x->>'cabinet',upper(p_tenant)) cabinet,x->>'sku' sku,sum((x->>'units')::numeric) units
 from jsonb_array_elements(p_payload->'sku_daily')x where coalesce(x->>'marketplace','OZON')='OZON'
 and (x->>'report_date')::date>=timezone('Europe/Moscow',now())::date-14
 and (x->>'report_date')::date<timezone('Europe/Moscow',now())::date group by 1,2
), yandex_sales14 AS (
 select x->>'cabinet' cabinet,x->>'article' offer_id,sum((x->>'units')::numeric) units
 from jsonb_array_elements(p_payload->'sku_daily')x where x->>'marketplace'='YANDEX'
 and (x->>'report_date')::date>=timezone('Europe/Moscow',now())::date-14
 and (x->>'report_date')::date<timezone('Europe/Moscow',now())::date group by 1,2
), yandex_stocks AS (
 select s.cabinet,s.offer_id,sum(s.available) available,sum(s.frozen) reserved,max(s.captured_at) captured_at
 from public.orange_yandex_stock_snapshots_1x s where upper(p_tenant)='ORANGE' group by 1,2
), stocks AS (
 select jsonb_build_object('sku',s.sku,'offer_id',s.offer_id,'cabinet',s.cabinet,'source_marketplace','OZON','captured_at',s.captured_at,
 'fbo_stock',coalesce(s.fbo_stock,0),'fbs_stock',coalesce(s.fbs_stock,0),'total_stock',coalesce(s.fbo_stock,0)+coalesce(s.fbs_stock,0),'reserved_stock',coalesce(s.reserved_stock,0),
 'units_14d',coalesce(v.units,0),'avg_daily_sales_14d',coalesce(v.units,0)/14) AS item
 from stock_agg s left join sales14 v using(cabinet,sku)
 union all
 select x from jsonb_array_elements(coalesce(p_payload->'stocks','[]'::jsonb))x where coalesce(x->>'source_marketplace','OZON')<>'OZON' and not(upper(p_tenant)='ORANGE' and x->>'source_marketplace'='YANDEX')
 union all
 select jsonb_build_object('sku',s.offer_id,'offer_id',s.offer_id,'cabinet',s.cabinet,'source_marketplace','YANDEX','captured_at',s.captured_at,
 'fbo_stock',0,'fbs_stock',coalesce(s.available,0),'total_stock',coalesce(s.available,0),'reserved_stock',coalesce(s.reserved,0),
 'units_14d',coalesce(v.units,0),'avg_daily_sales_14d',coalesce(v.units,0)/14)
 from yandex_stocks s left join yandex_sales14 v using(cabinet,offer_id)
), health AS (
 select jsonb_build_object('account_id',a.account_id,'marketplace',a.marketplace,'cabinet',r.cabinet,'last_success',s.last_success_at,
 'age_hours',round((extract(epoch from(now()-s.last_success_at))/3600)::numeric,2),'n8n_execution_id',s.n8n_execution_id,'row_count',s.row_count) AS item
 from config.marketplace_accounts a join config.account_runtime_v2 r using(tenant_id,account_id)
 left join raw.order_source_success_v2 s using(account_id) where a.tenant_id=upper(p_tenant) and a.active and r.daily_active
)
select p_payload || jsonb_build_object(
 'lines',coalesce((select jsonb_agg(line order by line->>'report_date',line->>'marketplace',line->>'cabinet',line->>'order_key',line->>'sku')from line_rows),'[]'::jsonb),
 'stocks',case when exists(select 1 from stock_latest) then coalesce((select jsonb_agg(item)from stocks),'[]'::jsonb) else p_payload->'stocks' end,
 'meta',coalesce(p_payload->'meta','{}'::jsonb)||jsonb_build_object(
 'source_health',coalesce((select jsonb_agg(item)from health),'[]'::jsonb),
 'stock_snapshot',(select max(captured_at)from stock_latest),
 'stock_snapshots_by_cabinet',(select jsonb_agg(to_jsonb(l))from stock_latest l),
 'line_rebuild_verified_dates',coalesce((select jsonb_agg(day order by day)from eligible),'[]'::jsonb),
 'line_rebuild_mismatch_dates',coalesce((select jsonb_agg(distinct day order by day)from mismatch),'[]'::jsonb),
 'freshness_checked_at',now()
 ))
$function$;

ALTER TABLE reporting.monthly_accepted_source_v2 DROP CONSTRAINT IF EXISTS monthly_accepted_source_v2_tenant_id_check;
DO $migration$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='reporting.monthly_accepted_source_v2'::regclass AND conname='monthly_accepted_source_registry_fk') THEN ALTER TABLE reporting.monthly_accepted_source_v2 ADD CONSTRAINT monthly_accepted_source_registry_fk FOREIGN KEY (tenant_id) REFERENCES config.tenants(tenant_id); END IF; END $migration$;
