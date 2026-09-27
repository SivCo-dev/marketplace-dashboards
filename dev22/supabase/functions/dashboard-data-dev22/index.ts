import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set(["https://sivco-dev.github.io", "http://127.0.0.1:4173", "http://localhost:4173"]);
const allowedTenants = new Set(["ORANGE", "W", "CPR"]);
const responseHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Vary": "Origin",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
});

const fields: Record<string, string[]> = {
  daily: ["cabinet","distinct_skus","gmv","is_live","is_reconstructed","marketplace","orders","report_date","units"],
  lines: ["article","brand","cabinet","category","gmv","is_live","marketplace","order_key","product_name","report_date","sku","units"],
  dimensions: ["article_key","brand","cabinet","canonical_sku","category","marketplace","master_category","offer_id","product_id","sku"],
  sku_daily: ["actual_logistics_amount","actual_logistics_units","article","avg_order_price","cabinet","canonical_sku","commission_amount","commission_pct","commission_status","cost_covered_gmv","cost_covered_units","current_price","expected_received","finance_commission_amount","finance_commission_units","forecast_logistics_amount","forecast_logistics_units","gmv","is_live","is_reconstructed","logistics_amount","logistics_per_unit","logistics_status","marketplace","orders","other_amount","posting_commission_amount","posting_commission_units","product_name","ref_month","report_date","sku","storage_amount","tariff_commission_amount","tariff_commission_units","units"],
  stocks: ["avg_daily_sales_14d","cabinet","captured_at","fbo_stock","fbs_stock","offer_id","reserved_stock","sku","source_marketplace","total_stock","units_14d"],
  content: ["attributes_count","attributes_score","cabinet","captured_at","content_score","description_length","description_score","has_rich","has_video","has_video_cover","hashtag_count","images_count","issues","marketplace","offer_id","photo_score","product_id","rich_score","score_source","seo_score","sku","snapshot_date","title_length","video_score"],
  positions: ["cabinet","gmv","offer_id","period_from","period_to","position","position_delta","previous_position","sku","snapshot_date","unique_search_users","unique_view_users","view_conversion"],
  visibility: ["by_msku_shows","cabinet","clicks","clicks_with_promotion","marketplace","offer_id","report_date","shows","shows_with_promotion","visibility_index"],
  ads: ["ad_orders","ad_revenue","cabinet","clicks","drr","marketplace","offer_id","period_from","period_to","shows","source_type","spend"],
  product_links: ["cabinet","external_id","marketplace","offer_id","product_url"],
  refs: ["article","sku","commission_pct","logistics_per_unit","current_price"]
};

const pick = (row: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(keys.filter((key) => row[key] !== undefined).map((key) => [key, row[key]]));

const safePayload = (payload: Record<string, unknown>) => {
  const out: Record<string, unknown> = {};
  for (const [key, keys] of Object.entries(fields)) {
    out[key] = Array.isArray(payload[key])
      ? (payload[key] as Record<string, unknown>[]).map((row) => pick(row, keys))
      : [];
  }
  return out;
};

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin") || "";
  if (!allowedOrigins.has(origin)) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), { status: 403, headers: { "Content-Type": "application/json" } });
  }
  const headers = responseHeaders(origin);
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "GET") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });

  const tenant = (new URL(request.url).searchParams.get("tenant") || "").toUpperCase();
  if (!allowedTenants.has(tenant)) return new Response(JSON.stringify({ error: "Unknown tenant" }), { status: 400, headers });

  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await client.rpc("get_dev22_dashboard_snapshot", { p_tenant: tenant });
  if (error) return new Response(JSON.stringify({ error: "DEV snapshot read failed" }), { status: 500, headers });
  if (!data) return new Response(JSON.stringify({ error: "DEV snapshot not found" }), { status: 404, headers });

  const snapshot = data as Record<string, unknown>;
  const payload = (snapshot.payload || {}) as Record<string, unknown>;
  const result = {
    ...safePayload(payload),
    _ozon_enrichment: safePayload((snapshot.ozon_enrichment || {}) as Record<string, unknown>),
    meta: {
      tenant_id: tenant,
      raw_max_date: (payload.meta as Record<string, unknown> | undefined)?.raw_max_date,
      wb_finance_through: (payload.meta as Record<string, unknown> | undefined)?.wb_finance_through,
      wb_ads_through: (payload.meta as Record<string, unknown> | undefined)?.wb_ads_through,
      generated_at: snapshot.generated_at,
      source_as_of: snapshot.source_as_of,
      version: snapshot.version,
      snapshot_version: snapshot.snapshot_version,
      namespace: "dev21.dashboard_snapshots"
    }
  };
  return new Response(JSON.stringify(result), { status: 200, headers });
});
