-- Rollback for 20261012180000_optimize_apply_monthly_upload_layer_v2.sql: restores the
-- pre-optimization definition of reporting.apply_monthly_upload_layer_v2.
-- Rollback: restores reporting.apply_monthly_upload_layer_v2 to its pre-optimization
-- definition (as read via pg_get_functiondef before this session's change).
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

 for v_row in select r from jsonb_array_elements(v_rows) r loop
   v_account:=v_row->>'account_id';
   if v_row->>'marketplace'<>'OZON'
      or not exists(select 1 from reporting.monthly_upload_active_v2 where tenant_id=p_tenant and account_id=v_account and month=p_month)
   then
     v_result:=v_result||jsonb_build_array(v_row);
     continue;
   end if;

   select
     coalesce(jsonb_object_agg(a.field,coalesce(x->'values'->a.field,'0'::jsonb)),'{}'::jsonb),
     bool_or(a.field='compensation_amount'),
     bool_or(a.field='decompensation_amount')
   into v_patch,v_has_comp,v_has_decomp
   from reporting.monthly_upload_active_v2 a
   join reporting.monthly_upload_batch_v2 b using(batch_id)
   left join lateral (
     select x from jsonb_array_elements(b.preview->'patches') x
     where x->>'sku'=v_row->>'sku' limit 1
   ) q on true
   where a.tenant_id=p_tenant and a.account_id=v_account and a.month=p_month;

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
