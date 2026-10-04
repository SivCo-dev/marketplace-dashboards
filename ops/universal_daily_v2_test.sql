-- Run after migration definitions inside BEGIN/ROLLBACK. No external API calls.
INSERT INTO config.tenants(tenant_id,display_name) VALUES('V2_SANDBOX_A','Sandbox A'),('V2_SANDBOX_B','Sandbox B');
INSERT INTO config.marketplace_accounts(account_id,tenant_id,marketplace,display_name)
VALUES('v2_sandbox_a1','V2_SANDBOX_A','OZON','A1'),('v2_sandbox_a2','V2_SANDBOX_A','OZON','A2'),('v2_sandbox_b1','V2_SANDBOX_B','OZON','B1');
INSERT INTO config.marketplace_accounts(account_id,tenant_id,marketplace,display_name)
VALUES('v2_sandbox_wb','V2_SANDBOX_B','WB','WB1'),('v2_sandbox_ya','V2_SANDBOX_B','YANDEX','YA1');
INSERT INTO config.account_runtime_v2(tenant_id,account_id,cabinet,daily_active,legacy_created_at,daily_metadata,legacy_updated_at,loader_enabled,lifecycle_status)
SELECT tenant_id,account_id,display_name,true,now(),'{}',now(),true,'active' FROM config.marketplace_accounts WHERE tenant_id IN ('V2_SANDBOX_A','V2_SANDBOX_B');
SELECT config.prepare_daily_reporting_v2('V2_SANDBOX_A');
SELECT config.prepare_daily_reporting_v2('V2_SANDBOX_B');
DO $test$
DECLARE a record; b uuid; rows jsonb; manifest jsonb; caught boolean; v bigint;
BEGIN
 rows:=jsonb_build_array(
 jsonb_build_object('posting_number','SAME-ORDER','sku','SAME-SKU','order_number','SAME-ORDER','offer_id','SAME-ARTICLE','created_at',now(),'order_date',timezone('Europe/Moscow',now())::date,'status','awaiting_deliver','order_state','active','quantity',2,'price',100,'gross_amount',200,'updated_at',now()),
 jsonb_build_object('posting_number','SAME-ORDER','sku','SECOND-SKU','order_number','SAME-ORDER','offer_id','SECOND-ARTICLE','created_at',now(),'order_date',timezone('Europe/Moscow',now())::date,'status','awaiting_deliver','order_state','active','quantity',1,'price',50,'gross_amount',50,'updated_at',now()));
 manifest:=jsonb_build_object('complete',true,'fbo_terminal',true,'fbs_terminal',true,'fbo_pages',1,'fbs_pages',1,'received_rows',2,'date_from',timezone('Europe/Moscow',now())::date,'date_to',timezone('Europe/Moscow',now())::date);
 FOR a IN SELECT * FROM config.marketplace_accounts WHERE tenant_id IN ('V2_SANDBOX_A','V2_SANDBOX_B') AND marketplace='OZON' LOOP
  b:=raw.stage_order_batch_v2(a.tenant_id,a.account_id,'sandbox-proof',now(),rows,manifest);
  PERFORM raw.publish_order_batch_v2(b,false);
  IF (raw.publish_order_batch_v2(b,false)->>'inserted_versions')::int<>0 THEN RAISE EXCEPTION 'Replay inserted extra versions'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM core.daily_order_rows_v2 WHERE tenant_id='V2_SANDBOX_A')<>4 THEN RAISE EXCEPTION 'Account collision'; END IF;
 IF (SELECT count(*) FROM core.daily_order_rows_v2 WHERE tenant_id='V2_SANDBOX_B')<>2 THEN RAISE EXCEPTION 'Tenant collision'; END IF;
 v:=dev21.refresh_live_snapshot_v2('V2_SANDBOX_A');
 IF (SELECT sum((x->>'orders')::int) FROM dev21.dashboard_snapshots s CROSS JOIN LATERAL jsonb_array_elements(s.payload->'daily') x WHERE s.tenant_id='V2_SANDBOX_A' AND s.snapshot_kind='daily-full')<>2 THEN RAISE EXCEPTION 'Multi-line distinct orders incorrect'; END IF;
 IF (SELECT sum((x->>'units')::int) FROM dev21.dashboard_snapshots s CROSS JOIN LATERAL jsonb_array_elements(s.payload->'daily') x WHERE s.tenant_id='V2_SANDBOX_A' AND s.snapshot_kind='daily-full')<>6 THEN RAISE EXCEPTION 'Units incorrect'; END IF;
 UPDATE config.marketplace_accounts SET active=false WHERE account_id='v2_sandbox_a2';
 caught:=false;
 BEGIN PERFORM raw.stage_order_batch_v2('V2_SANDBOX_A','v2_sandbox_a2','disabled',now(),rows,manifest); EXCEPTION WHEN SQLSTATE '22023' THEN caught:=true; END;
 IF NOT caught THEN RAISE EXCEPTION 'Disabled account accepted'; END IF;
 caught:=false;
 BEGIN PERFORM raw.stage_order_batch_v2('V2_SANDBOX_B','v2_sandbox_a1','wrong-tenant',now(),rows,manifest); EXCEPTION WHEN SQLSTATE '22023' THEN caught:=true; END;
 IF NOT caught THEN RAISE EXCEPTION 'Cross-tenant account accepted'; END IF;
 FOR a IN SELECT * FROM config.marketplace_accounts WHERE tenant_id='V2_SANDBOX_B' AND marketplace IN ('WB','YANDEX') LOOP
  SELECT jsonb_agg(x||jsonb_build_object('marketplace',a.marketplace,'cabinet',a.display_name)) INTO rows FROM jsonb_array_elements(rows) x;
  manifest:=manifest||jsonb_build_object('page_complete',true,'pages',1);
  b:=raw.stage_order_batch_v2(a.tenant_id,a.account_id,'marketplace-proof',now(),rows,manifest);
  PERFORM raw.publish_order_batch_v2(b,false);
 END LOOP;
 PERFORM dev21.refresh_live_snapshot_v2('V2_SANDBOX_B');
 IF (SELECT count(*) FROM core.daily_order_rows_v2 WHERE tenant_id='V2_SANDBOX_B')<>6 THEN RAISE EXCEPTION 'WB/Yandex rows missing'; END IF;
END $test$;
SELECT tenant_id,snapshot_version,jsonb_array_length(payload->'daily') AS account_totals,jsonb_array_length(payload->'sku_daily') AS sku_totals
FROM dev21.dashboard_snapshots WHERE tenant_id='V2_SANDBOX_A';
