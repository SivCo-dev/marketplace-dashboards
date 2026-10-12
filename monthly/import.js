import {makeAuthedFetch} from "../shared/auth-dev.js";
const API='https://tcefrvybgulcwwsdarcw.supabase.co/functions/v1/monthly-import-auth-dev';
const authedFetch=makeAuthedFetch({onAccessDenied:()=>{status('Нет прав на импорт для этого кабинета (нужна роль analyst или admin).',true);}});
const labels={article:'Артикул продавца',sku:'SKU Ozon',operation:'Тип операции',amount:'Сумма операции',quantity:'Количество операции',compensation_amount:'Компенсация, ₽',decompensation_amount:'Декомпенсация, ₽',compensated_units:'Компенсировано, шт',disposal_units:'Утилизировано, шт',written_off_units:'Списано, шт',returned_units:'Возвращено, шт',returns_without_compensation:'Возврат без компенсации, шт'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>Number(v??0).toLocaleString('ru-RU',{maximumFractionDigits:2});
const button=document.createElement('button');button.type='button';button.id='uploadOpen';button.className='upload-open';button.textContent='↑ Загрузить файлы';
document.querySelector('.title-block').append(button);
const dialog=document.createElement('dialog');dialog.id='uploadDialog';dialog.setAttribute('aria-labelledby','uploadTitle');dialog.innerHTML=`
<div class="upload-head"><div><span class="eyebrow">ДАННЫЕ МЕСЯЦА</span><h2 id="uploadTitle">Загрузка компенсаций и списаний</h2><p>Исходный файл Ozon → проверка → распределение → применение</p></div><button type="button" class="icon-button" id="uploadClose" aria-label="Закрыть загрузчик">✕</button></div>
<div class="upload-body"><div class="upload-fields">
<label>Организация<select id="uploadTenant" aria-label="Организация для импорта"></select></label>
<label>Кабинет Ozon<select id="uploadAccount" aria-label="Кабинет для импорта"></select></label>
<label>Месяц отчёта<input type="month" id="uploadMonth" aria-label="Месяц импорта"></label>
</div><div class="upload-drop"><label for="uploadFile">Выберите исходный файл</label><input type="file" id="uploadFile" accept=".xlsx,.xls,.csv"><small>XLSX, XLS или CSV · до 5 МБ · файл сохраняется вместе с историей обработки</small></div>
<div id="uploadStatus" class="upload-status" role="status" aria-live="polite">Выберите файл. Кабинет и месяц определим по данным файла, если они указаны.</div>
<div id="uploadSetup" hidden><div class="upload-fields">
<label>Лист<select id="uploadSheet"></select></label><label>Строка заголовков<input type="number" min="1" id="uploadHeader"></label>
<label>Тип файла<select id="uploadType"><option value="auto">Определить по колонкам</option><option value="compensation">Компенсации</option><option value="decompensation">Декомпенсации</option><option value="disposal">Утилизация</option><option value="writeoff">Списанные товары</option><option value="return">Возвраты</option></select></label>
</div><details class="upload-mapping" open><summary>Сопоставление колонок</summary><div id="uploadMapping" class="upload-fields"></div></details><div id="uploadRule" class="driver-note"></div></div>
<div id="uploadPreview" hidden></div><div class="upload-actions"><button type="button" id="uploadParse" disabled>Прочитать файл</button><button type="button" id="uploadCheck" disabled>Проверить распределение</button><button type="button" id="uploadApply" class="upload-primary" disabled>Применить распределение</button></div>
<details class="upload-history"><summary>История загрузок выбранного кабинета и месяца</summary><button type="button" id="uploadHistoryButton">Обновить историю</button><div id="uploadHistory">История появится после выбора кабинета.</div></details></div>`;
document.body.append(dialog);
const $=id=>dialog.querySelector('#'+id);let catalog=[],file=null,base64='',tables=[],preview=null,busy=false;
const status=(text,error=false)=>{$('uploadStatus').textContent=text;$('uploadStatus').classList.toggle('upload-error',error);};
async function request(action,data={}){const res=await authedFetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...data})});const result=await res.json();if(!res.ok)throw Error(result.error||'Ошибка '+res.status);return result;}
const scope=()=>({tenant:$('uploadTenant').value,account_id:$('uploadAccount').value,month:$('uploadMonth').value});
function refresh(){ $('uploadParse').disabled=busy||!file; $('uploadCheck').disabled=busy||!tables.length; $('uploadApply').disabled=busy||!preview||preview.errors.length>0;for(const el of dialog.querySelectorAll('input,select'))el.disabled=busy;$('uploadHistoryButton').disabled=busy;}
function invalidate(){preview=null;$('uploadPreview').hidden=true;refresh();}
function rule(){const direct=$('uploadTenant').value==='CPR';$('uploadRule').textContent=direct?'Компенсации — по фактическому SKU. Количество — по исходному SKU.':'Компенсации → мастер-категория → по доле валовых продаж SKU внутри категории и выбранного кабинета. Количество утилизации и списаний — по исходному SKU.';}
function accounts(){const tenant=$('uploadTenant').value;$('uploadAccount').innerHTML=catalog.filter(a=>a.tenant_id===tenant).map(a=>`<option value="${esc(a.account_id)}">${esc(a.display_name)}</option>`).join('');rule();invalidate();}
function mapping(){const table=tables.find(t=>t.name===$('uploadSheet').value);if(!table)return;const row=Number($('uploadHeader').value)-1;const headers=table.matrix[row]||[];const guess=row===table.row?table.mapping:{};$('uploadMapping').innerHTML=Object.entries(labels).map(([key,label])=>`<label>${esc(label)}<select data-field="${key}" aria-label="Колонка: ${esc(label)}"><option value="-1">— отсутствует —</option>${headers.map((h,i)=>`<option value="${i}" ${guess[key]===i?'selected':''}>${i+1}. ${esc(h||'Без заголовка')}</option>`).join('')}</select></label>`).join('');for(const el of $('uploadMapping').querySelectorAll('select'))el.addEventListener('change',invalidate);invalidate();}
function selectSheet(){const table=tables.find(t=>t.name===$('uploadSheet').value);$('uploadHeader').value=table.row+1;mapping();}
async function run(action){if(busy)return;busy=true;refresh();try{await action();}catch(e){status(e.message,true);}finally{busy=false;refresh();}}
button.addEventListener('click',()=>run(async()=>{
 if(!catalog.length){status('Загружаю список кабинетов…');catalog=(await request('catalog')).accounts;}
 const tenants=[...new Set(catalog.map(a=>a.tenant_id))];$('uploadTenant').innerHTML=tenants.map(t=>`<option>${esc(t)}</option>`).join('');$('uploadTenant').value=document.querySelector('#tenantSelect').value;accounts();$('uploadMonth').value=document.querySelector('#monthSelect').value;
 status('Выберите файл для загрузки.');dialog.showModal();
}));$('uploadClose').addEventListener('click',()=>dialog.close());
$('uploadTenant').addEventListener('change',accounts);for(const id of ['uploadAccount','uploadMonth','uploadType'])$(id).addEventListener('change',invalidate);
$('uploadFile').addEventListener('change',()=>{file=$('uploadFile').files[0]||null;base64='';tables=[];invalidate();$('uploadSetup').hidden=true;status(file?'Файл выбран. Нажмите «Прочитать файл».':'Выберите файл.');refresh();});
$('uploadSheet').addEventListener('change',selectSheet);$('uploadHeader').addEventListener('change',mapping);
$('uploadParse').addEventListener('click',()=>run(async()=>{
 if(!file)return;if(file.size>5*1024*1024)throw Error('Максимальный размер файла — 5 МБ');status('Читаю файл…');
 const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));base64=btoa(binary);
 const parsed=await request('parse',{filename:file.name,file_base64:base64});tables=parsed.tables;
 if(parsed.hints.account_ids.length===1){const hit=catalog.find(a=>a.account_id===parsed.hints.account_ids[0]);$('uploadTenant').value=hit.tenant_id;accounts();$('uploadAccount').value=hit.account_id;}
 if(parsed.hints.months.length===1)$('uploadMonth').value=parsed.hints.months[0];
 $('uploadSheet').innerHTML=tables.map(t=>`<option>${esc(t.name)}</option>`).join('');selectSheet();$('uploadSetup').hidden=false;rule();
 status(`Файл «${file.name}» прочитан. Проверьте кабинет, месяц и колонки. ${parsed.hints.account_ids.length!==1?'Кабинет не определён однозначно — выбран текущий.':''} ${parsed.hints.months.length!==1?'Месяц не определён однозначно — выбран текущий.':''}`);
}));
$('uploadCheck').addEventListener('click',()=>run(async()=>{
 invalidate();status('Проверяю SKU и распределение…');const selectedMapping=Object.fromEntries([...$('uploadMapping').querySelectorAll('select')].map(el=>[el.dataset.field,Number(el.value)]));
 preview=await request('preview',{...scope(),filename:file.name,file_base64:base64,sheet:$('uploadSheet').value,header_row:Number($('uploadHeader').value)-1,mapping:selectedMapping,type:$('uploadType').value});
 $('uploadPreview').hidden=false;
 const totals=preview.fields.map(k=>`<div><small>${esc(labels[k])}</small><strong>${fmt(preview.totals[k])}</strong><span>Разнесено: ${fmt(preview.allocated[k])}</span></div>`).join('');
 const errors=preview.errors.length?`<div class="upload-errors"><strong>Запись заблокирована: ${preview.errors.length} ошибок</strong><ul>${preview.errors.slice(0,100).map(e=>`<li>${e.row?'Строка '+e.row+': ':''}${esc(e.article||e.category||'')} ${esc(e.error)}</li>`).join('')}</ul></div>`:'';
 $('uploadPreview').innerHTML=`<h3>Предпросмотр распределения</h3><div class="upload-totals">${totals}</div>${errors}<p class="driver-note">${preview.row_count} строк файла → ${preview.patches.length} SKU. При применении поля «${preview.fields.map(k=>esc(labels[k])).join(', ')}» заменят предыдущие значения этого кабинета за ${esc(scope().month)}. Остальные поля сохранятся.</p><div class="table-scroll"><table><thead><tr><th>SKU / артикул</th><th>Категория</th>${preview.fields.map(k=>`<th>${esc(labels[k])}</th>`).join('')}</tr></thead><tbody>${preview.patches.slice(0,300).map(p=>`<tr><td>${esc(p.article||p.sku)}</td><td>${esc(p.master_category||'—')}</td>${preview.fields.map(k=>`<td>${fmt(p.values[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${preview.patches.length>300?'<small>Показаны первые 300 SKU. Применятся все проверенные строки.</small>':''}`;
 status(preview.errors.length?'Исправьте ошибки и повторите проверку.':'Контроль сошёлся. Распределение готово к применению.',preview.errors.length>0);
}));
$('uploadApply').addEventListener('click',()=>run(async()=>{if(!preview||preview.errors.length)return;status('Применяю распределение…');const result=await request('apply',{batch_id:preview.batch_id,tenant:scope().tenant});preview=null;status(result.duplicate?'Этот файл уже учтён. Дубли не добавлены.':'Распределение применено. Обновляю отчёт…');location.reload();}));
$('uploadHistoryButton').addEventListener('click',()=>run(async()=>{const rows=await request('history',scope());$('uploadHistory').innerHTML=rows.length?`<div class="table-scroll"><table><thead><tr><th>Файл</th><th>Дата</th><th>Состояние</th><th>Действующие поля</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.filename)}</td><td>${esc(new Date(r.created_at).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'}))}</td><td>${r.status==='APPLIED'?'Применён · версия '+r.layer_revision:'Предпросмотр'}</td><td>${r.active_fields.map(k=>esc(labels[k]||k)).join(', ')||'—'}</td></tr>`).join('')}</tbody></table></div>`:'Файлы пока не загружены.';}));
