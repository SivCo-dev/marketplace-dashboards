-- Rollback deployed W/CPR n8n workflow TCBX2gbHyCXHQ0DR:
-- Republish original active version 94924707-cf98-47fd-95ad-7f37786159be.
-- Verify active graph: 4 fast refresh nodes call dev21.refresh_live_snapshot(text),
-- and 2 morning fresh checks use original orders_daily/cpr_orders_daily queries.
-- No data deletion. Existing legacy writers remain active.
-- New projections/functions can remain installed until dependencies are audited.

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
 RETURN jsonb_build_object('account_id',p_account,'copied_rows',copied,'inserted_versions',inserted,'batches',batches,'source','saved_rows','current_user',current_user);
END $function$
;

UPDATE config.daily_consumer_switch_v2 SET enabled=false,enabled_at=null,reason='Rollback to original Telegram queries' WHERE tenant_id IN ('W','CPR');
