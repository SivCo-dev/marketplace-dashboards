-- Perf fix for Monthly ORANGE (~10.3s -> ~3.8s measured on ORANGE/2026-09, 1126 SKU
-- rows / 6145 expense_detail rows; no change for W/CPR, whose expense_detail is small).
--
-- reporting.apply_monthly_upload_layer_v2 had two O(n*m) patterns:
--   1. The per-SKU-row loop re-queried and re-unnested the whole upload batch's
--      patches array (join + LATERAL jsonb_array_elements filtered by sku) for
--      EVERY SKU row. Precompute per-account active-field metadata and a
--      per-(account,field,sku) patch-value map ONCE, set-based, before the loop;
--      the per-row body now does O(1) jsonb key lookups instead.
--   2. The expense_detail rebuild appended new compensation rows one at a time via
--      `v_exp:=v_exp||jsonb_build_array(...)` inside a plpgsql loop, while v_exp
--      already held thousands of entries -- each append re-copied the whole array.
--      Build the new rows with one set-based jsonb_agg and append once.
--
-- No financial formula changed. Verified byte-identical jsonb output against the
-- previous definition for every (tenant, month) in reporting.monthly_prepared_revision_v2
-- at the time of this change (W/CPR/ORANGE x 2026-07..2026-10).
-- work_mem was NOT touched (measurements earlier in this effort showed it does not
-- affect this function's cost -- see session notes).
-- Rollback: 20261012180000_optimize_apply_monthly_upload_layer_v2.rollback.sql

CREATE OR REPLACE FUNCTION reporting.apply_monthly_upload_layer_v2(p jsonb, p_tenant text, p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
 v_rows jsonb:=coalesce(p->'sku','[]'::jsonb);
 v_exp jsonb:=coalesce(p->'expense_detail','[]'::jsonb);
 v_result jsonb:='[]';
 v_row jsonb;v_patch jsonb;v_account text;
 v_comp numeric;v_decomp numeric;v_old numeric;v_new numeric;
 v_disposal numeric;v_writeoff numeric;v_existing int;
 v_has_comp boolean;v_has_decomp boolean;
 v_account_meta jsonb;v_patch_values jsonb;v_field text;
begin
 if p is null then return null;end if;
 if not exists(select 1 from reporting.monthly_upload_active_v2 where tenant_id=p_tenant and month=p_month) then return p;end if;

 for v_row in
   select distinct on(a.account_id,x->>'sku')
     jsonb_build_object(
       'sku',x->>'sku','article',x->>'article','product_name',x->>'product_name','master_category',x->>'master_category',
       'account_id',a.account_id,'marketplace','OZON','month',p_month,
       'month_sku',to_char(p_month,'YYYY-MM')||'|OZON|'||a.account_id||'|'||(x->>'sku'),
       'sales',0,'returns',0,'net_sales',0,'sold_units',0,'economic_units',0,'final_with_compensation',0,'net_compensation_amount',0
     )
   from reporting.monthly_upload_active_v2 a
   join reporting.monthly_upload_batch_v2 b using(batch_id),
        jsonb_array_elements(b.preview->'patches') x
   where a.tenant_id=p_tenant and a.month=p_month
     and not exists(
       select 1 from jsonb_array_elements(v_rows) r
       where r->>'account_id'=a.account_id and r->>'marketplace'='OZON' and r->>'sku'=x->>'sku'
     )
   loop
   v_rows:=v_rows||jsonb_build_array(v_row);
 end loop;

 -- perf: precompute per-account active-field metadata (has_comp/has_decomp/fields) and
 -- per-(account,field,sku) patch values ONCE, set-based, instead of re-querying and
 -- re-unnesting the whole patches array inside the per-SKU loop below (which is what
 -- made this function O(rows * patches) and took ~10s for ORANGE/2026-09 with 1126
 -- SKU rows). Every value produced here is identical to what the original per-row
 -- query computed; only when/how often it is computed changes.
 select coalesce(jsonb_object_agg(s.account_id,jsonb_build_object('has_comp',s.has_comp,'has_decomp',s.has_decomp,'fields',s.fields)),'{}'::jsonb)
 into v_account_meta
 from (
   select a.account_id,
          bool_or(a.field='compensation_amount') as has_comp,
          bool_or(a.field='decompensation_amount') as has_decomp,
          jsonb_agg(distinct a.field) as fields
   from reporting.monthly_upload_active_v2 a
   where a.tenant_id=p_tenant and a.month=p_month
   group by a.account_id
 ) s;

 select coalesce(jsonb_object_agg(k.key,k.val),'{}'::jsonb)
 into v_patch_values
 from (
   select distinct on (a.account_id,a.field,(x->>'sku'))
     a.account_id||'|'||a.field||'|'||(x->>'sku') as key,
     coalesce(x->'values'->a.field,'0'::jsonb) as val
   from reporting.monthly_upload_active_v2 a
   join reporting.monthly_upload_batch_v2 b using(batch_id)
   cross join lateral jsonb_array_elements(b.preview->'patches') with ordinality as t(x,ord)
   where a.tenant_id=p_tenant and a.month=p_month
   order by a.account_id,a.field,(x->>'sku'),ord
 ) k;

 for v_row in select r from jsonb_array_elements(v_rows) r loop
   v_account:=v_row->>'account_id';
   if v_row->>'marketplace'<>'OZON'
      or not exists(select 1 from reporting.monthly_upload_active_v2 where tenant_id=p_tenant and account_id=v_account and month=p_month)
   then
     v_result:=v_result||jsonb_build_array(v_row);
     continue;
   end if;

   v_has_comp:=coalesce((v_account_meta->v_account->>'has_comp')::boolean,false);
   v_has_decomp:=coalesce((v_account_meta->v_account->>'has_decomp')::boolean,false);
   v_patch:='{}'::jsonb;
   for v_field in select jsonb_array_elements_text(coalesce(v_account_meta->v_account->'fields','[]'::jsonb)) loop
     v_patch:=v_patch||jsonb_build_object(v_field,coalesce(v_patch_values->(v_account||'|'||v_field||'|'||(v_row->>'sku')),'0'::jsonb));
   end loop;

   v_old:=coalesce((v_row->>'net_compensation_amount')::numeric,0);

   if coalesce(v_has_comp,false) then
     v_comp:=coalesce((v_patch->>'compensation_amount')::numeric,0);
   else
     v_comp:=greatest(v_old,0);
   end if;

   if coalesce(v_has_decomp,false) then
     v_decomp:=coalesce((v_patch->>'decompensation_amount')::numeric,0);
   elsif coalesce(v_has_comp,false) then
     v_decomp:=0;
   else
     v_decomp:=least(v_old,0);
   end if;

   v_new:=v_comp+v_decomp;
   v_disposal:=coalesce((v_patch->>'disposal_units')::numeric,(v_row->>'imported_disposal_units')::numeric,(v_row->>'disposal_units')::numeric,0);
   v_writeoff:=coalesce((v_patch->>'written_off_units')::numeric,(v_row->>'imported_written_off_units')::numeric,0);

   v_existing:=(select count(*) from jsonb_array_elements(v_rows) r where r->>'account_id'=v_account and r->>'marketplace'='OZON' and r->>'sku'=v_row->>'sku');
   if v_existing>1 and (v_patch ? 'compensation_amount' or v_patch ? 'decompensation_amount') then
     raise exception 'Повторяющийся SKU в базе: %',v_row->>'sku';
   end if;

   v_row:=v_row||jsonb_build_object(
     'compensation_amount',v_comp,
     'decompensation_amount',v_decomp,
     'net_compensation_amount',v_new,
     'preliminary_compensation',v_new,
     'final_without_compensation',coalesce((v_row->>'final_with_compensation')::numeric,0)-v_old,
     'final_with_compensation',coalesce((v_row->>'final_with_compensation')::numeric,0)-v_old+v_new,
     'imported_disposal_units',v_disposal,
     'imported_written_off_units',v_writeoff,
     'disposal_units',v_disposal+v_writeoff,
     'import_fields',v_patch
   );

   if v_patch ? 'compensated_units' then v_row:=v_row||jsonb_build_object('compensated_units',v_patch->'compensated_units');end if;
   if v_patch ? 'returned_units' then v_row:=v_row||jsonb_build_object('returned_units',v_patch->'returned_units');end if;
   if v_patch ? 'returns_without_compensation' then v_row:=v_row||jsonb_build_object('returns_without_compensation',v_patch->'returns_without_compensation');end if;

   v_result:=v_result||jsonb_build_array(v_row);
 end loop;

 select coalesce(jsonb_agg(e),'[]'::jsonb) into v_exp
 from jsonb_array_elements(v_exp)e
 where not(
   e->>'marketplace'='OZON' and e->>'expense_code'='compensation'
   and exists(
     select 1 from reporting.monthly_upload_active_v2 a
     where a.tenant_id=p_tenant and a.month=p_month and a.account_id=e->>'account_id'
       and a.field in ('compensation_amount','decompensation_amount')
   )
 );

 for v_row in
   select r from jsonb_array_elements(v_result)r
   where r->>'marketplace'='OZON'
     and exists(
       select 1 from reporting.monthly_upload_active_v2 a
       where a.tenant_id=p_tenant and a.month=p_month and a.account_id=r->>'account_id'
         and a.field in ('compensation_amount','decompensation_amount')
     )
   loop
   v_exp:=v_exp||jsonb_build_array(jsonb_build_object(
     'sku',v_row->>'sku','month_sku',v_row->>'month_sku','account_id',v_row->>'account_id',
     'marketplace','OZON','expense_code','compensation','display_name','Компенсации',
     'amount',v_row->'net_compensation_amount',
     'stage',case when p_tenant='CPR' then 'direct' else 'allocated' end,
     'allocation_basis',case when p_tenant='CPR' then 'sku' else 'category_positive_gross_sales' end,
     'source','monthly-upload-v2','is_exact',true
   ));
 end loop;

 return p||jsonb_build_object(
   'sku',v_result,
   'expense_detail',v_exp,
   'metadata',(p->'metadata')||jsonb_build_object(
     'upload_layer_revision',coalesce((select max(layer_revision) from reporting.monthly_upload_batch_v2 where tenant_id=p_tenant and month=p_month and status='APPLIED'),0)
   )
 );
end
$function$;
