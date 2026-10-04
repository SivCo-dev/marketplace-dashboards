-- One consistent database read instead of three Edge -> PostgREST round trips.
-- Economic enrichment is restricted to the actual published SKU keys before transport.
CREATE OR REPLACE FUNCTION public.get_dev23_read_bundle_v2(p_tenant text, p_metadata_only boolean DEFAULT false)
RETURNS TABLE(revision text,base jsonb,registry jsonb,ozon jsonb,accounts jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
WITH b AS MATERIALIZED (
 SELECT s.* FROM dev21.dashboard_snapshots s
 JOIN config.tenants t USING(tenant_id)
 WHERE s.tenant_id=upper(p_tenant) AND s.snapshot_kind='daily-full' AND s.is_complete AND t.active
), r AS MATERIALIZED (
 SELECT * FROM dev23.product_registry_snapshots WHERE tenant_id=upper(p_tenant)
), e AS MATERIALIZED (
 SELECT s.* FROM dev21.dashboard_snapshots s
 WHERE s.tenant_id=upper(p_tenant) AND s.snapshot_kind='ozon-enrichment' AND s.is_complete
), keys AS MATERIALIZED (
 SELECT DISTINCT x->>'report_date' AS day,x->>'cabinet' cabinet,x->>'sku' sku
 FROM b CROSS JOIN LATERAL jsonb_array_elements(b.payload->'sku_daily') x
 WHERE coalesce(x->>'marketplace','OZON')='OZON'
)
SELECT md5(concat_ws('|',b.tenant_id,b.snapshot_version,b.generated_at,b.source_as_of,
 (SELECT generated_at FROM r),(SELECT generated_at FROM e),
 (SELECT md5(string_agg(concat_ws('|',a.account_id,a.marketplace,rt.cabinet,a.updated_at,rt.legacy_updated_at,a.active,rt.daily_active),'|' ORDER BY a.account_id))
 FROM config.marketplace_accounts a JOIN config.account_runtime_v2 rt USING(tenant_id,account_id)
 WHERE a.tenant_id=b.tenant_id))),
 CASE WHEN p_metadata_only THEN NULL ELSE jsonb_build_object('payload',b.payload,'generated_at',b.generated_at,'source_as_of',b.source_as_of,'snapshot_version',b.snapshot_version) END,
 CASE WHEN p_metadata_only THEN NULL ELSE (SELECT jsonb_build_object('payload',r.payload,'generated_at',r.generated_at,'row_count',r.row_count) FROM r) END,
 CASE WHEN p_metadata_only THEN NULL ELSE (SELECT e.payload||jsonb_build_object(
 'stocks',CASE WHEN b.payload->'meta' ? 'stock_snapshots_by_cabinet' THEN '[]'::jsonb ELSE e.payload->'stocks' END,
 'sku_daily',coalesce((SELECT jsonb_agg(x ORDER BY ord) FROM jsonb_array_elements(e.payload->'sku_daily') WITH ORDINALITY q(x,ord)
 JOIN keys k ON k.day=x->>'report_date' AND k.cabinet=x->>'cabinet' AND k.sku=x->>'sku'),'[]'::jsonb)) FROM e) END,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('account_id',a.account_id,'marketplace',a.marketplace,'cabinet',rt.cabinet) ORDER BY a.account_id),'[]'::jsonb)
 FROM config.marketplace_accounts a JOIN config.account_runtime_v2 rt USING(tenant_id,account_id)
 WHERE a.tenant_id=b.tenant_id AND a.active AND rt.daily_active)
 FROM b;
$fn$;
REVOKE ALL ON FUNCTION public.get_dev23_read_bundle_v2(text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_dev23_read_bundle_v2(text,boolean) TO service_role;
