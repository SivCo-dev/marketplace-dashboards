import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.95.3";
import * as XLSX from "npm:@e965/xlsx@0.20.3";
import {findTables, guessMapping, isWarehouseReturn, isWarehouseWriteoff, financialReportType, normalizeRows, allocate, norm} from "./processor.mjs";
const origins=new Set(['https://sivco-dev.github.io','http://127.0.0.1:4173','http://localhost:4173','http://127.0.0.1:3000','http://localhost:3000','http://127.0.0.1:5173','http://localhost:5173']);
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')||'';
 const headers={'Access-Control-Allow-Origin':origins.has(origin)?origin:'https://sivco-dev.github.io','Access-Control-Allow-Headers':'content-type,authorization,apikey','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin','Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
 const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return reply(405,{error:'Метод не поддерживается'});
 if(origin&&!origins.has(origin))return reply(403,{error:'Источник запроса не разрешён'});

 const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});

 // Auth: identity comes only from a token verified by the Auth server — never from a client-supplied header or param.
 const bearer=(req.headers.get('authorization')||'').match(/^Bearer\s+(.+)$/i)?.[1]||'';
 if(!bearer)return reply(401,{error:'AUTH_REQUIRED'});
 const {data:auth,error:authError}=await client.auth.getUser(bearer);
 if(authError||!auth?.user?.id)return reply(401,{error:'AUTH_REQUIRED'});
 const userId=auth.user.id;

 // One tenant-scoped role check for every write/import action — reuses the same
 // security.user_tenant_membership data the read-side -auth-dev functions check,
 // via the existing public get_my_access_v1 RPC (no new DB surface needed).
 const ROLE_RANK:Record<string,number>={viewer:1,analyst:2,admin:3};
 async function requireRole(tenant:string,minRole:'viewer'|'analyst'|'admin'){
  const {data,error}=await client.rpc('get_my_access_v1',{p_user_id:userId});
  if(error)return {ok:false as const,status:500,body:{error:'ACCESS_CHECK_FAILED'}};
  const row=(data||[]).find((m:any)=>String(m.tenant_id).toUpperCase()===String(tenant).toUpperCase());
  if(!row||(ROLE_RANK[row.access_role]||0)<ROLE_RANK[minRole])return {ok:false as const,status:403,body:{error:'TENANT_ACCESS_DENIED'}};
  return {ok:true as const};
 }

 const rpc=async(name:string,args={})=>{const {data,error}=await client.rpc(name,args);if(error)throw Error(error.message);return data;};
 try{
  const text=await req.text();if(text.length>8_000_000)return reply(413,{error:'Максимальный размер файла — 5 МБ'});
  const input=JSON.parse(text),action=input.action;
  const catalog=await rpc('monthly_upload_catalog_v2');
  if(action==='catalog')return reply(200,catalog);

  if(!['parse','preview','history','apply'].includes(action))return reply(400,{error:'Неизвестное действие'});

  if(action==='apply'){
   if(!/^[a-f0-9-]{36}$/i.test(input.batch_id||''))return reply(400,{error:'Некорректный пакет'});
   if(!/^[A-Z0-9_-]{1,32}$/.test(String(input.tenant||'')))return reply(400,{error:'Укажите организацию'});
   const check=await requireRole(input.tenant,'analyst');
   if(!check.ok)return reply(check.status,check.body);
   return reply(200,await rpc('monthly_upload_apply_v2',{p_batch:input.batch_id}));
  }

  const account=catalog.accounts.find((a:any)=>a.account_id===input.account_id&&a.tenant_id===input.tenant);
  if(action==='history'){
   if(!account||!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month))throw Error('Выберите кабинет и месяц');
   const check=await requireRole(input.tenant,'viewer');
   if(!check.ok)return reply(check.status,check.body);
   return reply(200,await rpc('monthly_upload_history_v2',{p_tenant:input.tenant,p_month:input.month+'-01',p_account:input.account_id}));
  }

  if(!/\.(xlsx|xls|csv)$/i.test(input.filename||'')||typeof input.file_base64!=='string'||input.file_base64.length>7_000_000)throw Error('Выберите XLSX, XLS или CSV до 5 МБ');
  const bytes=Uint8Array.from(atob(input.file_base64),c=>c.charCodeAt(0));
  const wb=XLSX.read(bytes,{type:'array',cellDates:false,cellFormula:false,bookVBA:false});
  const sheets=wb.SheetNames.map(name=>({name,matrix:XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:'',raw:false})}));
  const tables=findTables(sheets);if(!tables.length)throw Error('Таблица с артикулами / SKU не найдена');
  if(tables.some((t:any)=>t.matrix.length>10060||t.headers.length>100))throw Error('Максимум 10 000 строк и 100 колонок');
  const warehouseReturn=tables.some((t:any)=>isWarehouseReturn(t.headers));
  const financialReport=tables.some((t:any)=>financialReportType(t.headers));
  const hint=norm((warehouseReturn||financialReport?'':input.filename)+' '+tables.map((t:any)=>JSON.stringify(t.matrix.slice(0,t.row))).join(' '));
  const matched=catalog.accounts.filter((a:any)=>{const token=norm(a.display_name).replace(/^market /,'');return new RegExp('(?:^|[^a-zа-я0-9])'+token+'(?:$|[^a-zа-я0-9])','i').test(hint);});
  if(warehouseReturn&&hint.includes('capris official store')&&hint.includes('1928268')){
   const cpr=catalog.accounts.find((a:any)=>a.account_id==='ozon_cpr');if(cpr&&!matched.includes(cpr))matched.push(cpr);
  }
  if(financialReport&&hint.includes('772393697710')&&hint.includes('галко александр дмитриевич')){
   const cpr=catalog.accounts.find((a:any)=>a.account_id==='ozon_cpr');if(cpr&&!matched.includes(cpr))matched.push(cpr);
  }
  const reportDates=financialReport?tables.flatMap((t:any)=>t.matrix.slice(0,t.row).flat().map((v:any)=>norm(v)).filter((v:string)=>/^отчет/.test(v)).flatMap((v:string)=>[...v.matchAll(/(?:^|\s)от\s+\d{2}\.(\d{2})\.(20\d{2})/g)].map(m=>m[2]+'-'+m[1]))):[];
  const months=[...new Set(financialReport?reportDates:[...hint.matchAll(/(20\d{2})[-_. /](0[1-9]|1[0-2])(?:[-_. /]\d{2})?/g)].map(m=>m[1]+'-'+m[2]))];
  if(action==='parse')return reply(200,{tables,hints:{account_ids:matched.map((a:any)=>a.account_id),months},filename:input.filename});

  // preview/stage from here on — this is the first point a specific tenant is committed to.
  if(!account||!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month))throw Error('Выберите кабинет и месяц');
  const check=await requireRole(input.tenant,'analyst');
  if(!check.ok)return reply(check.status,check.body);
  if(matched.length===1&&matched[0].account_id!==account.account_id)throw Error('Кабинет в файле отличается от выбранного');
  if(months.length===1&&months[0]!==input.month)throw Error('Месяц в файле отличается от выбранного');
  const table=tables.find((t:any)=>t.name===input.sheet);if(!table)throw Error('Выберите лист файла');
  const headerRow=Number(input.header_row);if(!Number.isInteger(headerRow)||headerRow<0||headerRow>=table.matrix.length)throw Error('Некорректная строка заголовка');
  const standardReturn=isWarehouseReturn(table.matrix[headerRow]||[]);
  const standardWriteoff=isWarehouseWriteoff(table.matrix[headerRow]||[]);
  const standardFinance=financialReportType(table.matrix[headerRow]||[]);
  const normalized=normalizeRows(table.matrix,headerRow,standardReturn||standardWriteoff||standardFinance?guessMapping(table.matrix[headerRow]):input.mapping,standardReturn?'return':standardWriteoff?'writeoff':standardFinance||input.type||'auto');
  if(!normalized.rows.length)throw Error(normalized.errors.length?'Не удалось прочитать строки: '+normalized.errors.slice(0,3).map((e:any)=>'строка '+e.row+' — '+e.error).join('; '):'Нет строк данных для распределения');
  const context=await rpc('monthly_upload_context_v2',{p_tenant:input.tenant,p_month:input.month+'-01',p_account:input.account_id});
  const preview=allocate(normalized,context,account);
  const duplicate=new Set();for(const r of context.payload.sku.filter((r:any)=>r.account_id===account.account_id&&r.marketplace==='OZON')){if(duplicate.has(r.sku))preview.errors.push({error:'В базе повторяется SKU '+r.sku});duplicate.add(r.sku);}
  const sha=async(s:string|Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof s==='string'?new TextEncoder().encode(s):s))).map(b=>b.toString(16).padStart(2,'0')).join('');
  return reply(200,await rpc('monthly_upload_stage_v2',{p_data:{tenant:account.tenant_id,account_id:account.account_id,month:input.month+'-01',filename:input.filename,file_hash:await sha(bytes),source_base64:input.file_base64,base_hash:context.base_hash,base_revision:context.base_revision,layer_revision:context.layer_revision,preview}}));
 }catch(error){return reply(400,{error:error instanceof Error?error.message:'Ошибка обработки файла'});}
});
