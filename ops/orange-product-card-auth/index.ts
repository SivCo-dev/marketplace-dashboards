import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Orange monthly: extra data for the product card (operations, orders, price history, stock).
// Auth pattern is the same as monthly-data-auth-dev: user id comes only from a verified token.
const allowedOrigins = new Set([
  "https://sivco-dev.github.io",
  "https://feature-platform-auth-dev.marketplace-dashboards.pages.dev",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:4173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://localhost:4173",
  "http://localhost:5173",
]);

function headers(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://sivco-dev.github.io",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Cache-Control": "private, no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin, Authorization",
  };
}

function json(status: number, responseHeaders: HeadersInit, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  const responseHeaders = headers(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers: responseHeaders });
  if (req.method !== "GET") return json(405, responseHeaders, { error: "METHOD_NOT_ALLOWED" });
  if (origin && !allowedOrigins.has(origin)) return json(403, responseHeaders, { error: "ORIGIN_NOT_ALLOWED" });

  const url = new URL(req.url);
  for (const key of url.searchParams.keys()) {
    if (!["sku", "month", "stock"].includes(key)) return json(400, responseHeaders, { error: "UNSUPPORTED_QUERY_PARAMETER", parameter: key });
  }
  const stockOnly = url.searchParams.get("stock") === "1";
  const sku = (url.searchParams.get("sku") ?? "").trim();
  const month = (url.searchParams.get("month") ?? "").trim();
  if (!stockOnly && (!sku || sku.length > 128)) return json(400, responseHeaders, { error: "INVALID_SKU" });
  if (!stockOnly && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return json(400, responseHeaders, { error: "INVALID_MONTH", expected: "YYYY-MM" });

  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const bearer = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  if (!bearer) return json(401, responseHeaders, { error: "AUTH_REQUIRED" });
  const { data: auth, error: authError } = await client.auth.getUser(bearer);
  if (authError || !auth?.user?.id) return json(401, responseHeaders, { error: "AUTH_REQUIRED" });

  if (stockOnly) {
    const { data: stock, error: stockError } = await client.rpc("get_orange_stock_summary_v1", { p_user_id: auth.user.id });
    if (stockError) {
      if (stockError.code === "42501") return json(403, responseHeaders, { error: "TENANT_ACCESS_DENIED" });
      console.error("orange-stock-summary failure", { code: stockError.code });
      return json(500, responseHeaders, { error: "STOCK_READ_FAILED" });
    }
    return json(200, responseHeaders, stock);
  }
  const { data, error } = await client.rpc("get_orange_product_card_for_user_v1", {
    p_user_id: auth.user.id,
    p_sku: sku,
    p_month: `${month}-01`,
  });
  if (error) {
    if (error.code === "42501") return json(403, responseHeaders, { error: "TENANT_ACCESS_DENIED" });
    if (error.code === "22023") return json(400, responseHeaders, { error: "INVALID_ARGUMENTS" });
    console.error("orange-product-card failure", { code: error.code });
    return json(500, responseHeaders, { error: "PRODUCT_CARD_READ_FAILED" });
  }
  return json(200, responseHeaders, data);
});
