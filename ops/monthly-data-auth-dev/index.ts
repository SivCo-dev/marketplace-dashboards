import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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
  const allowedParams = new Set(["tenant", "month", "marketplace", "account"]);
  for (const key of url.searchParams.keys()) {
    if (!allowedParams.has(key)) return json(400, responseHeaders, { error: "UNSUPPORTED_QUERY_PARAMETER", parameter: key });
  }

  const tenant = (url.searchParams.get("tenant") ?? "").trim().toUpperCase();
  const month = (url.searchParams.get("month") ?? "").trim();
  const marketplace = (url.searchParams.get("marketplace") ?? "ALL").trim().toUpperCase();
  const account = (url.searchParams.get("account") ?? "").trim() || null;
  if (!/^[A-Z0-9_-]{1,32}$/.test(tenant)) return json(400, responseHeaders, { error: "INVALID_TENANT" });
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return json(400, responseHeaders, { error: "INVALID_MONTH", expected: "YYYY-MM" });
  if (!["ALL", "OZON", "WB", "YANDEX"].includes(marketplace)) return json(400, responseHeaders, { error: "INVALID_MARKETPLACE" });
  if (account && !/^[A-Za-z0-9_-]{1,96}$/.test(account)) return json(400, responseHeaders, { error: "INVALID_ACCOUNT" });

  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  // Auth: the user id comes only from a token verified by the Auth server.
  const bearer = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  if (!bearer) return json(401, responseHeaders, { error: "AUTH_REQUIRED" });
  const { data: auth, error: authError } = await client.auth.getUser(bearer);
  if (authError || !auth?.user?.id) return json(401, responseHeaders, { error: "AUTH_REQUIRED" });

  const { data, error } = await client.rpc("get_monthly_screen_scope_for_user_v1", {
    p_user_id: auth.user.id,
    p_tenant_id: tenant,
    p_month: `${month}-01`,
    p_marketplace: marketplace,
    p_account_id: account,
  });
  if (error) {
    if (error.code === "42501") return json(403, responseHeaders, { error: "TENANT_ACCESS_DENIED" });
    if (error.code === "22023") return json(400, responseHeaders, { error: "INVALID_MONTHLY_SCOPE" });
    console.error("monthly-data-v2 scope failure", { code: error.code });
    return json(500, responseHeaders, { error: "MONTHLY_READ_FAILED" });
  }
  if (!data) return json(404, responseHeaders, { error: "MONTHLY_DATA_NOT_FOUND" });
  if (data.contract_version !== "monthly-scope-v2.2") return json(500, responseHeaders, { error: "UNEXPECTED_CONTRACT" });
  return json(200, responseHeaders, data);
});
