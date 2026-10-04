import test from 'node:test';
import assert from 'node:assert/strict';
import {selectUnclosedChartDates,buildPeriodSelection,calculateKpis} from '../../core/dashboard-core.js';
const rows=Array.from({length:10},(_,i)=>({report_date:new Date(Date.UTC(2026,8,25+i)).toISOString().slice(0,10),is_live:i>=2,gmv:100,units:2,orders:1}));
const all=rows.map(r=>r.report_date),live=new Set(rows.filter(r=>r.is_live).map(r=>r.report_date));
test('every unclosed date stays visible between last closed day and current LIVE date',()=>{const selection=buildPeriodSelection(rows,rows,'14');assert.deepEqual(selectUnclosedChartDates(all,live,selection.currentDates,'14'),all.slice(2));assert.deepEqual(calculateKpis(selection.currentRows,selection.currentDates.length),{gmv:200,units:4,orders:2,averagePrice:50,gmvPerDay:100});});
test('an explicit historical month does not receive points from another month',()=>{assert.deepEqual(selectUnclosedChartDates(all,live,[],'2026-09'),['2026-09-27','2026-09-28','2026-09-29','2026-09-30']);assert.deepEqual(selectUnclosedChartDates(all,live,[],'2026-10'),['2026-10-01','2026-10-02','2026-10-03','2026-10-04']);});
