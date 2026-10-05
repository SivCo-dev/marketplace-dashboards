export const fields = {
 article:'Артикул продавца', sku:'SKU Ozon', operation:'Тип операции', amount:'Сумма операции', quantity:'Количество операции',
 compensation_amount:'Компенсация, ₽', decompensation_amount:'Декомпенсация, ₽', compensated_units:'Компенсировано, шт',
 disposal_units:'Утилизировано, шт', written_off_units:'Списано, шт', returned_units:'Возвращено, шт', returns_without_compensation:'Возврат без компенсации, шт'
};
export const metrics=Object.keys(fields).filter(k=>!['article','sku','operation','amount','quantity'].includes(k));
export const norm=v=>String(v??'').trim().toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ');
const rules={article:[/артикул.*продав/,/^артикул$/, /offer.?id/],sku:[/^sku$/, /sku.*ozon/,/ozon.*sku/],operation:[/тип.*операц/,/вид.*операц/,/^операция$/, /причина/],amount:[/^сумма(?:,.*)?$/, /^стоимость$/, /сумма.*операц/],quantity:[/^количество(?:,.*)?$/, /^кол-во/,/^шт\.?$/],compensation_amount:[/^(?!.*декомпенс)(?:.*сум.*компенс.*|.*компенс.*сум.*|.*размер.*компенс.*|компенсация(?:,.*)?)$/],decompensation_amount:[/декомпенс.*(сум|руб|₽)/,/^декомпенсация$/, /удержан.*компенс/],compensated_units:[/^(?!.*декомпенс).*компенс.*(шт|кол)/,/(шт|кол).*компенс/],disposal_units:[/(утил).*?(шт|кол)/,/(шт|кол).*утил/,/^утилизировано$/],written_off_units:[/(списан).*?(шт|кол)/,/(шт|кол).*списан/,/^списано$/],returned_units:[/^(?!.*без.*компенс).*возвра.*(шт|кол)/,/(шт|кол).*возвра/,/^возвращено$/],returns_without_compensation:[/возврат.*без.*компенс/]};
export function guessMapping(headers){
 const mapped=Object.fromEntries(Object.keys(fields).map(k=>[k,headers.findIndex(h=>(rules[k]||[]).some(re=>re.test(norm(h))))]));
 const returned=headers.findIndex(h=>norm(h)==='количество возвращаемых товаров');
 if(returned>=0&&headers.some(h=>norm(h)==='статус возврата')){
  // Ozon's warehouse-return report is a quantity report. Days in storage and
  // the reason for return are not quantity / operation columns.
  for(const key of Object.keys(mapped))mapped[key]=-1;
  mapped.article=headers.findIndex(h=>norm(h)==='артикул товара');
  mapped.sku=headers.findIndex(h=>norm(h)==='sku');
  mapped.returned_units=returned;
 }
 if(headers.some(h=>norm(h)==='причина списания')&&headers.some(h=>norm(h)==='утилизация')){
  for(const key of Object.keys(mapped))mapped[key]=-1;
  mapped.article=headers.findIndex(h=>norm(h)==='артикул');
  mapped.sku=headers.findIndex(h=>norm(h)==='sku');
  mapped.written_off_units=headers.findIndex(h=>/^количество(?:,? шт\.?)?$/.test(norm(h)));
 }
 const financeType=financialReportType(headers);
 if(financeType){
  for(const key of Object.keys(mapped))mapped[key]=-1;
  mapped.article=headers.findIndex(h=>norm(h)==='артикул');
  mapped.sku=headers.findIndex(h=>norm(h)==='sku');
  if(financeType==='decompensation')mapped.decompensation_amount=headers.findIndex(h=>/итого.*компенсац.*к удержанию/.test(norm(h)));
  else {
   mapped.compensation_amount=headers.findIndex(h=>/^итого к начислению/.test(norm(h)));
   mapped.compensated_units=headers.findIndex(h=>norm(h)==='кол-во');
  }
 }
 return mapped;
}
export function isWarehouseReturn(headers){return headers.some(h=>norm(h)==='количество возвращаемых товаров')&&headers.some(h=>norm(h)==='статус возврата');}
export function isWarehouseWriteoff(headers){return headers.some(h=>norm(h)==='причина списания')&&headers.some(h=>norm(h)==='утилизация');}
export function financialReportType(headers){
 if(headers.some(h=>/итого.*компенсац.*к удержанию/.test(norm(h))))return 'decompensation';
 if(headers.some(h=>/^итого к начислению/.test(norm(h)))&&headers.some(h=>norm(h)==='тип компенсации'))return 'compensation';
 return null;
}
export function findTables(sheets){
 return sheets.map(({name,matrix})=>{let best={score:-1,row:0};for(let row=0;row<Math.min(60,matrix.length);row++){const headers=matrix[row].map(v=>String(v??'').trim());const mapping=guessMapping(headers);const score=Object.values(mapping).filter(v=>v>=0).length+((mapping.article>=0||mapping.sku>=0)?3:0);if(score>best.score)best={name,row,headers,mapping,score};}return {...best,matrix};}).filter(t=>t.score>=4);
}
export function numberValue(v){
 if(v==null||String(v).trim()==='')return null;
 const s=String(v).trim().replace(/[\s\u00a0\u202f]/g,'').replace(/(?:руб\.?|₽)$/i,'').replace(',','.');
 if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s))throw Error('Некорректное число «'+String(v).slice(0,60)+'»');
 const n=Number(s);if(!Number.isFinite(n)||Math.abs(n)>1e12)throw Error('Число вне допустимого диапазона');return n;
}
export function normalizeRows(matrix,headerRow,mapping,type='auto'){
 const rows=[],errors=[];const present=new Set(metrics.filter(k=>Number(mapping[k])>=0));
 const financialReport=financialReportType(matrix[headerRow]||[]);
 if(Number(mapping.article)<0&&Number(mapping.sku)<0)throw Error('Выберите колонку артикула или SKU');
 const used=Object.values(mapping).filter(v=>Number(v)>=0).map(Number);if(new Set(used).size!==used.length)throw Error('Одна колонка сопоставлена нескольким полям');
 for(let i=headerRow+1;i<matrix.length;i++){
  const raw=matrix[i];if(!raw.some(v=>String(v??'').trim()))continue;
  // Signed Ozon reports finish the table with a total, followed by signatures.
  // Only this recognized format has this explicit end-of-table marker.
  if(financialReport&&raw.slice(0,3).some(v=>/^(всего|итого)(\s|:|$)/i.test(String(v??'').trim())))break;
  const get=k=>Number(mapping[k])>=0?raw[Number(mapping[k])]:null;
  const article=String(get('article')??'').trim(),sku=String(get('sku')??'').trim();
  if(/^(итого|всего|total)(\s|:|$)/i.test(article||sku))continue;
  if(!article&&!sku){if(used.some(j=>String(raw[j]??'').trim()))errors.push({row:i+1,error:'Нет артикула / SKU'});continue;}
  const r={article,sku,source_row:i+1};
  try{
   for(const k of present){const n=numberValue(get(k));r[k]=n??0;}
   if(Number(mapping.amount)>=0||Number(mapping.quantity)>=0){
    let op=norm(get('operation'))||type;
    if(op==='auto')throw Error('Укажите тип файла или колонку операции');
    const amount=numberValue(get('amount')),qty=numberValue(get('quantity'));
    if(/декомпенс|удержан|decompensation/.test(op)){if(amount!=null){r.decompensation_amount=-Math.abs(amount);present.add('decompensation_amount');}}
    else if(/компенс|compensation/.test(op)){if(amount!=null){r.compensation_amount=amount;present.add('compensation_amount');}if(qty!=null){r.compensated_units=qty;present.add('compensated_units');}}
    else if(/утил|disposal/.test(op)){if(qty==null)throw Error('Для утилизации нужно количество');r.disposal_units=qty;present.add('disposal_units');}
    else if(/списан|writeoff/.test(op)){if(qty==null)throw Error('Для списания нужно количество');r.written_off_units=qty;present.add('written_off_units');}
    else if(/возврат|return/.test(op)){if(qty==null)throw Error('Для возврата нужно количество');r.returned_units=qty;present.add('returned_units');}
    else throw Error('Не распознана операция «'+op.slice(0,80)+'»');
   }
   if(r.decompensation_amount!=null)r.decompensation_amount=-Math.abs(r.decompensation_amount);
   for(const k of metrics.filter(k=>k.endsWith('_units')||k==='returns_without_compensation'))if(r[k]!=null&&(!Number.isInteger(r[k])||r[k]<0))throw Error('Количество должно быть целым и неотрицательным');
   rows.push(r);
  }catch(e){errors.push({row:i+1,error:e.message});}
 }
 if(!present.size)throw Error('Выберите сумму компенсации или количество товаров');
 // Tall operations may introduce fields midway through the file: missing cells mean zero within this file, never in unrelated imports.
 for(const r of rows)for(const k of present)r[k]??=0;
 return {rows,fields:[...present],errors};
}
function distributeCents(total,receivers){
 const cents=Math.round(total*100),sign=Math.sign(cents),abs=Math.abs(cents),denom=receivers.reduce((s,r)=>s+Math.max(0,Number(r.sales)||0),0);
 if(!denom)throw Error('В категории нет положительных продаж для распределения');
 const shares=receivers.map(r=>{const exact=abs*Math.max(0,Number(r.sales)||0)/denom;return {r,n:Math.floor(exact),fraction:exact-Math.floor(exact)};});
 let rest=abs-shares.reduce((s,r)=>s+r.n,0);shares.sort((a,b)=>b.fraction-a.fraction||a.r.sku.localeCompare(b.r.sku));for(let i=0;i<rest;i++)shares[i%shares.length].n++;
 return shares.map(s=>({r:s.r,amount:sign*s.n/100}));
}
export function allocate(normalized,context,account){
 const base=context.payload?.sku?.filter(r=>r.account_id===account.account_id&&r.marketplace==='OZON')||[];
 const bySku=new Map();for(const r of base){const key=String(r.sku);if(!bySku.has(key))bySku.set(key,{...r,sales:0});bySku.get(key).sales+=Number(r.sales)||0;}
 const candidates=[...bySku.values(),...(context.products||[]).filter(r=>r.account_id===account.account_id)];
 const errors=[...normalized.errors],patches=new Map(),pools=new Map(),source=[];
 const patchFor=r=>{const key=String(r.sku);if(!patches.has(key))patches.set(key,{sku:key,article:r.article||key,product_name:r.product_name||key,master_category:r.master_category||null,values:{}});return patches.get(key);};
 for(const input of normalized.rows){
  const exactSku=input.sku?candidates.filter(r=>[r.sku,r.marketplace_sku].some(v=>norm(v)===norm(input.sku))):[];
  // An explicit marketplace SKU identifies the item even when its seller
  // article is shared by discounted variants.
  const match=exactSku.length?exactSku:candidates.filter(r=>input.article&&[r.article,r.offer_id,r.sku].some(v=>norm(v)===norm(input.article)));
  const keys=[...new Set(match.map(r=>String(r.sku)))];
  if(keys.length!==1){errors.push({row:input.source_row,article:input.article||input.sku,error:keys.length?'Артикул неоднозначен':'Артикул не найден в кабинете'});continue;}
  const r=match.find(r=>String(r.sku)===keys[0]);source.push({...input,canonical_sku:r.sku,master_category:r.master_category});
  for(const k of normalized.fields){
   const value=Number(input[k]||0);
   if(['compensation_amount','decompensation_amount'].includes(k)&&account.tenant_id!=='CPR'){
    if(value===0)continue;
    if(!r.master_category||r.master_category==='Не определено'){errors.push({row:input.source_row,article:input.article||input.sku,error:'Не определена мастер-категория'});continue;}
    const key=r.master_category+'|'+k;const p=pools.get(key)||{category:r.master_category,field:k,total:0};p.total=Math.round((p.total+value)*100)/100;pools.set(key,p);
   }else {const p=patchFor(r);p.values[k]=Math.round(((p.values[k]||0)+value)*100)/100;}
  }
 }
 for(const pool of pools.values()){
  const receivers=[...bySku.values()].filter(r=>r.master_category===pool.category&&Number(r.sales)>0);
  try{for(const {r,amount} of distributeCents(pool.total,receivers)){const p=patchFor(r);p.values[pool.field]=Math.round(((p.values[pool.field]||0)+amount)*100)/100;}}
  catch(e){errors.push({category:pool.category,error:e.message});}
 }
 const totals=Object.fromEntries(normalized.fields.map(k=>[k,Math.round(normalized.rows.reduce((s,r)=>s+Number(r[k]||0),0)*100)/100]));
 const allocated=Object.fromEntries(normalized.fields.map(k=>[k,Math.round([...patches.values()].reduce((s,r)=>s+Number(r.values[k]||0),0)*100)/100]));
 for(const k of normalized.fields)if(totals[k]!==allocated[k])errors.push({error:'Контроль не сошёлся: '+fields[k],source:totals[k],allocated:allocated[k]});
 return {fields:normalized.fields,source,patches:[...patches.values()].sort((a,b)=>a.sku.localeCompare(b.sku)),totals,allocated,errors,allocation:account.tenant_id==='CPR'?'SKU':'CATEGORY_SALES',row_count:normalized.rows.length};
}
