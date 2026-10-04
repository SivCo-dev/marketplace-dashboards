import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyConfigsFromRegistry,resolveRowAccount} from '../../core/runtime-registry.js';
import {normalizeRows} from '../core/dashboard-core.js';
import {createScopeLoader} from '../../monthly/live-v2.js';

const accounts=[{account_id:'a',marketplace:'OZON',cabinet:'One'},{account_id:'b',marketplace:'OZON',cabinet:'Two'}];
test('ambiguous marketplace rows never acquire another account identity',()=>{
 assert.deepEqual(resolveRowAccount({marketplace:'OZON'},accounts),{});
 assert.equal(resolveRowAccount({marketplace:'OZON',cabinet:'Two'},accounts).account_id,'b');
 assert.deepEqual(resolveRowAccount({account_id:'unknown',marketplace:'OZON'},accounts),{});
 assert.deepEqual(resolveRowAccount({account_id:'a',marketplace:'WB'},accounts),{});
});
test('new published organization builds a daily config without source edits',()=>{
 const configs=dailyConfigsFromRegistry([{tenant_id:'NEW_TENANT',display_name:'New',daily_available:true,accounts}]);
 assert.equal(configs.NEW_TENANT.display_name,'New');
 assert.equal(configs.NEW_TENANT.accounts.length,2);
 assert.match(configs.NEW_TENANT.data_url,/tenant=NEW_TENANT/);
});
test('monthly loading uses the same runtime organizations and rejects unknown scopes',async()=>{
 const loader=createScopeLoader({tenantIds:['NEW_TENANT'],fetcher:async()=>({ok:true,json:async()=>({
 contract_version:'monthly-scope-v2.2',metadata:{tenant_id:'NEW_TENANT',month:'2026-09-01',marketplace:'ALL'},period_state:{status:'MISSING'},sku:[],totals:{},business_economics:{}
 })})});
 const payload=await loader.loadScope('NEW_TENANT','2026-09');
 assert.equal(payload.metadata.tenant_id,'NEW_TENANT');
 await assert.rejects(()=>loader.loadScope('OTHER','2026-09'),/Недопустимый/);
});

test('normalization preserves missing account scope and stock marketplace',()=>{
 const config={tenant_id:'NEW_TENANT',accounts:[...accounts,{account_id:'wb',marketplace:'WB',cabinet:'Two'}]};
 const resolve=({external_sku})=>external_sku;
 const rows=normalizeRows([{marketplace:'OZON',sku:'x'},{source_marketplace:'WB',cabinet:'Two',sku:'y'}],config,resolve);
 assert.equal(rows[0].account_id,'');
 assert.equal(rows[0].cabinet,'');
 assert.equal(rows[1].account_id,'wb');
 assert.equal(rows[1].marketplace,'WB');
});
