import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set(["https://sivco-dev.github.io","https://feature-platform-auth-dev.marketplace-dashboards.pages.dev","http://127.0.0.1:4173","http://localhost:4173"]);

const responseHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, if-none-match",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Expose-Headers": "ETag",
  "Vary": "Origin, Authorization",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "private, no-cache"
});

const fields: Record<string,string[]> = {
  daily:["cabinet","distinct_skus","gmv","is_live","is_reconstructed","marketplace","orders","report_date","units"],
  lines:["article","brand","cabinet","category","gmv","is_live","marketplace","order_key","product_name","report_date","sku","units"],
  dimensions:["article_key","brand","cabinet","canonical_sku","category","marketplace","master_category","offer_id","product_id","sku"],
  sku_daily:["actual_logistics_amount","actual_logistics_units","article","avg_order_price","cabinet","canonical_sku","commission_amount","commission_pct","commission_status","cost_covered_gmv","cost_covered_units","current_price","expected_received","finance_commission_amount","finance_commission_units","forecast_logistics_amount","forecast_logistics_units","gmv","is_live","is_reconstructed","logistics_amount","logistics_per_unit","logistics_status","marketplace","orders","other_amount","posting_commission_amount","posting_commission_units","product_name","ref_month","report_date","sku","storage_amount","tariff_commission_amount","tariff_commission_units","units"],
  stocks:["avg_daily_sales_14d","cabinet","captured_at","fbo_stock","fbs_stock","offer_id","reserved_stock","sku","source_marketplace","total_stock","units_14d"],
  content:["attributes_count","attributes_score","cabinet","captured_at","content_score","description_length","description_score","has_rich","has_video","has_video_cover","hashtag_count","images_count","issues","marketplace","offer_id","photo_score","product_id","rich_score","score_source","seo_score","sku","snapshot_date","title_length","video_score"],
  positions:["cabinet","gmv","offer_id","period_from","period_to","position","position_delta","previous_position","sku","snapshot_date","unique_search_users","unique_view_users","view_conversion"],
  visibility:["by_msku_shows","cabinet","clicks","clicks_with_promotion","marketplace","offer_id","report_date","shows","shows_with_promotion","visibility_index"],
  ads:["ad_orders","ad_revenue","cabinet","clicks","drr","marketplace","offer_id","period_from","period_to","shows","source_type","spend"],
  product_links:["cabinet","external_id","marketplace","offer_id","product_url"],
  refs:["article","sku","commission_pct","logistics_per_unit","current_price"],
  ozon_current:["cabinet","sku","offer_id","price","price_date","old_price","commission_pct","commission_date","logistics_per_unit","logistics_status","logistics_units","logistics_from","logistics_to","received_per_unit","month","month_status","month_units","month_received_per_unit","month_commission_pct","month_logistics_per_unit"],
  ozon_ads_campaigns:["date","campaign_id","title","views","clicks","orders","spend","orders_money"],
  marketplace_products:["tenant_id","marketplace","account_id","cabinet","canonical_sku","external_sku","marketplace_product_id","offer_id","product_url","product_name","is_active","last_seen_at","link_checked_at","source_updated_at","current_price","master_category","commission_pct","commission_source"]
};

const pick=(row:Record<string,unknown>,keys:string[])=>Object.fromEntries(keys.filter(k=>row[k]!==undefined).map(k=>[k,row[k]]));
const safePayload=(payload:Record<string,unknown>)=>{
  const out:Record<string,unknown>={};
  for(const [key,keys] of Object.entries(fields)){
    if(key==="marketplace_products"||key==="ozon_current"||key==="ozon_ads_campaigns") continue;
    out[key]=Array.isArray(payload[key]) ? (payload[key] as Record<string,unknown>[]).map(r=>pick(r,keys)) : [];
  }
  return out;
};

const packRows=(rows:Record<string,unknown>[])=>{
 const columns=[...new Set(rows.flatMap(row=>Object.keys(row)))];
 const indexes=new Map(columns.map((key,index)=>[key,index]));
 return {columns,rows:rows.map(row=>Object.keys(row).length===columns.length
  ? columns.map(key=>row[key])
  : Object.fromEntries(Object.entries(row).map(([key,value])=>[String(indexes.get(key)),value])))};
};
const packPayload=(payload:Record<string,unknown>):Record<string,unknown>=>Object.fromEntries(Object.entries(payload).map(([key,value])=>[
 key,Array.isArray(value)?packRows(value as Record<string,unknown>[]):key==="_ozon_enrichment"?packPayload(value as Record<string,unknown>):value
]));

const matchesTag=(value:string|null,tag:string)=>!!value&&value.split(",").some(x=>x.trim().replace(/^W\//,"")===tag || x.trim()==="*");

Deno.serve(async (request:Request)=>{
  const origin=request.headers.get("origin")||"";
  if(!allowedOrigins.has(origin)) return new Response(JSON.stringify({error:"Origin not allowed"}),{status:403,headers:{"Content-Type":"application/json"}});
  const headers=responseHeaders(origin);
  if(request.method==="OPTIONS") return new Response("ok",{headers});
  if(request.method!=="GET") return new Response(JSON.stringify({error:"Method not allowed"}),{status:405,headers});

  const tenant=(new URL(request.url).searchParams.get("tenant")||"").toUpperCase();
  if(new URL(request.url).searchParams.get("view")!=="registry"&&!/^[A-Z0-9_-]{1,32}$/.test(tenant)) return new Response(JSON.stringify({error:"Unknown tenant"}),{status:400,headers});

  const client=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});

  // Auth: the user id comes only from a token verified by the Auth server, never from request parameters.
  const bearer=(request.headers.get("authorization")||"").match(/^Bearer\s+(.+)$/i)?.[1]||"";
  if(!bearer) return new Response(JSON.stringify({error:"AUTH_REQUIRED"}),{status:401,headers});
  const {data:auth,error:authError}=await client.auth.getUser(bearer);
  if(authError||!auth?.user?.id) return new Response(JSON.stringify({error:"AUTH_REQUIRED"}),{status:401,headers});
  const userId=auth.user.id;
  const denied=(error:{code?:string}|null)=>error?.code==="42501";

  if(new URL(request.url).searchParams.get("view")==="registry") {
    const {data,error}=await client.rpc("get_dashboard_registry_for_user_v1",{p_user_id:userId});
    const access=error?null:await client.rpc("get_my_access_v1",{p_user_id:userId});
    if(error||access?.error) return new Response(JSON.stringify({error:"Registry read failed"}),{status:500,headers});
    return new Response(JSON.stringify({...data,access:access?.data||[],user:{email:auth.user.email}}),{status:200,headers});
  }
  // Membership is checked inside the RPC before any revision/ETag is revealed.
  if(request.headers.has("if-none-match")) {
    const probe=await client.rpc("get_dev23_read_bundle_for_user_v1",{p_user_id:userId,p_tenant:tenant,p_metadata_only:true});
    if(denied(probe.error))return new Response(JSON.stringify({error:"TENANT_ACCESS_DENIED"}),{status:403,headers});
    if(probe.error)return new Response(JSON.stringify({error:"Snapshot read failed"}),{status:500,headers});
    if(!probe.data?.[0])return new Response(JSON.stringify({error:"Snapshot not found"}),{status:404,headers});
    const tag='"'+probe.data[0].revision+'-'+(new URL(request.url).searchParams.get("format")||"object")+'"';
    if(matchesTag(request.headers.get("if-none-match"),tag))return new Response(null,{status:304,headers:{...headers,ETag:tag}});
  }
  const {data:bundles,error}=await client.rpc("get_dev23_read_bundle_for_user_v1",{p_user_id:userId,p_tenant:tenant,p_metadata_only:false});
  if(denied(error))return new Response(JSON.stringify({error:"TENANT_ACCESS_DENIED"}),{status:403,headers});
  if(error)return new Response(JSON.stringify({error:"Snapshot read failed"}),{status:500,headers});
  const bundle=bundles?.[0];
  if(!bundle)return new Response(JSON.stringify({error:"Snapshot not found"}),{status:404,headers});
  const baseRes={data:bundle.base};
  const registryRes={data:bundle.registry};
  const ozonRes={data:bundle.ozon};
  const etag='"'+bundle.revision+'-'+(new URL(request.url).searchParams.get("format")||"object")+'"';
  Object.assign(headers,{ETag:etag});
  if(matchesTag(request.headers.get("if-none-match"),etag))return new Response(null,{status:304,headers});
  const base=baseRes.data as Record<string,unknown>;
  const payload=(base.payload||{}) as Record<string,unknown>;
  const registrySnapshot=(registryRes.data||{}) as Record<string,unknown>;
  const registryPayload=(registrySnapshot.payload||[]) as unknown;
  const registry=Array.isArray(registryPayload)?registryPayload as Record<string,unknown>[]:[];
  const ozonPayload=((ozonRes as any).data||{}) as Record<string,unknown>;

  const baseOzonKeys=new Set((Array.isArray(payload.sku_daily)?payload.sku_daily as Record<string,unknown>[]:[])
    .filter(row=>String(row.marketplace||"OZON").toUpperCase()==="OZON")
    .map(row=>[row.report_date,row.cabinet,String(row.sku||"")].join("|")));
  const result={
    ...safePayload(payload),
    marketplace_products:registry.map(r=>pick(r,fields.marketplace_products)),
    _ozon_enrichment:{
      ...safePayload(ozonPayload),
      sku_daily:(Array.isArray(ozonPayload.sku_daily)?ozonPayload.sku_daily as Record<string,unknown>[]:[])
        .filter(row=>baseOzonKeys.has([row.report_date,row.cabinet,String(row.sku||"")].join("|")))
        .map(row=>pick(row,["report_date","cabinet","sku","ref_month","current_price","commission_pct","commission_status","logistics_per_unit","actual_logistics_units","forecast_logistics_units","logistics_status"])),
      ozon_current:(Array.isArray(ozonPayload.ozon_current)?ozonPayload.ozon_current as Record<string,unknown>[]:[])
        .map(row=>pick(row,fields.ozon_current)),
      ozon_ads_campaigns:(Array.isArray(ozonPayload.ozon_ads_campaigns)?ozonPayload.ozon_ads_campaigns as Record<string,unknown>[]:[])
        .map(row=>pick(row,fields.ozon_ads_campaigns))
    },
    meta:{
      tenant_id:tenant,
      accounts:bundle.accounts,
      source_health:(payload.meta as Record<string,unknown>|undefined)?.source_health,
      stock_snapshot:(payload.meta as Record<string,unknown>|undefined)?.stock_snapshot,
      stock_snapshots_by_cabinet:(payload.meta as Record<string,unknown>|undefined)?.stock_snapshots_by_cabinet,
      line_rebuild_verified_dates:(payload.meta as Record<string,unknown>|undefined)?.line_rebuild_verified_dates,
      line_rebuild_mismatch_dates:(payload.meta as Record<string,unknown>|undefined)?.line_rebuild_mismatch_dates,
      block_freshness:Object.fromEntries(["stocks","positions","content","visibility","ads"].map(block=>{
        const rows=[...(Array.isArray(payload[block])?payload[block] as Record<string,unknown>[]:[]),...(Array.isArray(ozonPayload[block])?ozonPayload[block] as Record<string,unknown>[]:[])];
        const dates=rows.map(row=>String(row.captured_at||row.snapshot_date||row.report_date||row.period_to||"")).filter(Boolean).sort();
        return [block,{oldest:dates[0]||null,newest:dates.at(-1)||null,row_count:rows.length}];
      })),
      raw_max_date:(payload.meta as Record<string,unknown>|undefined)?.raw_max_date,
      wb_finance_through:(payload.meta as Record<string,unknown>|undefined)?.wb_finance_through,
      wb_ads_through:(payload.meta as Record<string,unknown>|undefined)?.wb_ads_through,
      ozon_enrichment:(()=>{const m=(ozonPayload.meta||{}) as Record<string,unknown>;return pick(m,["generated_at","as_of_date","logistics_max_date","price_max_date","positions_max_date","reference_month","reference_month_status"]);})(),
      generated_at:base.generated_at,
      source_as_of:base.source_as_of,
      version:"2.3",
      snapshot_version:base.snapshot_version,
      registry_generated_at:registrySnapshot.generated_at,
      registry_rows:registrySnapshot.row_count,
      namespace:"dev23 registry snapshot + dev21 dashboard snapshot"
    }
  };
  const body=new URL(request.url).searchParams.get("format")==="columnar" ? {...packPayload(result),_transport:"columnar-v1"} : result;
  return new Response(JSON.stringify(body),{status:200,headers});
});
