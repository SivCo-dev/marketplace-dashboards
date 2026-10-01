// Retained for the separate authenticated cutover phase. Not imported by shadow.
const SUPABASE_URL="https://tcefrvybgulcwwsdarcw.supabase.co";
const PUBLISHABLE_KEY="sb_publishable_XOchVuOWdEHubLHUOzAAyA_4_zxvh1v";
export async function createAuthenticatedClient(){
 const {createClient}=await import("https://esm.sh/@supabase/supabase-js@2.95.0");
 return createClient(SUPABASE_URL,PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
}
export async function readAuthenticatedMonthly(session,{tenant,month,marketplace="OZON"},signal){
 if(!session?.access_token)throw new Error("AUTH_REQUIRED");
 const url=new URL(SUPABASE_URL+"/functions/v1/monthly-data-v2");
 for(const[key,value]of Object.entries({tenant,month,marketplace}))url.searchParams.set(key,value);
 const response=await fetch(url,{signal,cache:"no-store",headers:{Authorization:"Bearer "+session.access_token,apikey:PUBLISHABLE_KEY}});
 if(!response.ok)throw new Error(response.status===403?"TENANT_ACCESS_DENIED":"MONTHLY_READ_FAILED");
 return response.json();
}
