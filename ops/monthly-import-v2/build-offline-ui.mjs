import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../../',import.meta.url);
const css=await readFile(new URL('monthly/styles.css',root),'utf8');
const js=await readFile(new URL('monthly/import.js',root),'utf8');
const html=`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Загрузка файлов месячного отчёта</title><style>${css}</style></head><body><main class="shell"><header class="dashboard-head"><div class="title-block"><h1>Загрузка файлов месяца</h1><p>Компенсации, утилизация и списанные товары Ozon</p></div><a href="https://sivco-dev.github.io/marketplace-dashboards/monthly/">Открыть дашборд ↗</a></header><section class="panel"><p>Загрузите исходный файл, проверьте кабинет, месяц и распределение. Данные попадут в месячный отчёт после применения.</p></section><select id="tenantSelect" hidden><option>ORANGE</option><option>W</option><option>CPR</option></select><select id="monthSelect" hidden><option>2026-09</option></select></main><script type="module">${js}\nbutton.click();</script></body></html>`;
if(!process.argv[2])throw Error('Pass output HTML path');
await writeFile(process.argv[2],html);
console.log('Built standalone client from the same Monthly module/CSS; uses the live PIN-protected API');
