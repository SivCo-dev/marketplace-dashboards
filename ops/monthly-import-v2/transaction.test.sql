begin;
do $test$
declare c jsonb;p jsonb;b jsonb;first_id uuid;second_id uuid;v_response jsonb;v_sku text;old_base text;old_sales numeric;new_sales numeric;old_result numeric;new_result numeric;old_comp numeric;new_comp numeric;
begin
 c:=public.monthly_upload_context_v2('ORANGE','2026-09-01','ozon_orange_bond');
 select md5(payload::text) into old_base from reporting.monthly_prepared_revision_v2 where tenant_id='ORANGE' and month='2026-09-01' order by revision desc limit 1;
 select r->>'sku' into v_sku from jsonb_array_elements(c->'payload'->'sku')r where r->>'account_id'='ozon_orange_bond' limit 1;
 old_sales:=(reporting.get_accepted_month_scope_v2('ORANGE','2026-09-01','OZON','ozon_orange_bond')->'totals'->>'sales')::numeric;
 p:=jsonb_build_object('tenant','ORANGE','account_id','ozon_orange_bond','month','2026-09-01','filename','__transaction_test.csv','file_hash','test1','source_base64','dGVzdA==','base_hash',c->>'base_hash','base_revision',c->'base_revision','layer_revision',0,'preview',jsonb_build_object('fields',jsonb_build_array('compensation_amount','decompensation_amount'),'patches',jsonb_build_array(jsonb_build_object('sku',v_sku,'article',v_sku,'values',jsonb_build_object('compensation_amount',123.45,'decompensation_amount',-23.45))),'source','[]'::jsonb,'errors','[]'::jsonb));
 b:=public.monthly_upload_stage_v2(p);first_id:=(b->>'batch_id')::uuid;
 v_response:=public.monthly_upload_apply_v2(first_id);if not (v_response->>'ok')::boolean then raise exception 'apply failed';end if;
 new_comp:=(reporting.get_accepted_month_scope_v2('ORANGE','2026-09-01','OZON','ozon_orange_bond')->'totals'->>'compensation')::numeric;
 if new_comp<>100 then raise exception 'Comp total mismatch %',new_comp;end if;
 new_sales:=(reporting.get_accepted_month_scope_v2('ORANGE','2026-09-01','OZON','ozon_orange_bond')->'totals'->>'sales')::numeric;
 if old_sales<>new_sales then raise exception 'Finance changed';end if;
 if not (public.monthly_upload_apply_v2(first_id)->>'duplicate')::boolean then raise exception 'repeat not idempotent';end if;
 b:=public.monthly_upload_stage_v2(p);if not (public.monthly_upload_apply_v2((b->>'batch_id')::uuid)->>'duplicate')::boolean then raise exception 'new batch repeat not idempotent';end if;
 p:=p||jsonb_build_object('file_hash','test2','layer_revision',1,'preview',jsonb_build_object('fields',jsonb_build_array('disposal_units'),'patches',jsonb_build_array(jsonb_build_object('sku',v_sku,'article',v_sku,'values',jsonb_build_object('disposal_units',2))),'source','[]'::jsonb,'errors','[]'::jsonb));
 b:=public.monthly_upload_stage_v2(p);second_id:=(b->>'batch_id')::uuid;perform public.monthly_upload_apply_v2(second_id);
 new_comp:=(reporting.get_accepted_month_scope_v2('ORANGE','2026-09-01','OZON','ozon_orange_bond')->'totals'->>'compensation')::numeric;
 if new_comp<>100 then raise exception 'Disposal upload erased compensation';end if;
 select r into v_response from jsonb_array_elements(reporting.get_accepted_month_v2('ORANGE','2026-09-01')->'sku')r where r->>'sku'=v_sku and r->>'account_id'='ozon_orange_bond';
 if (v_response->>'disposal_units')::numeric<>2 then raise exception 'Disposal not applied';end if;
 if old_base<>(select md5(payload::text) from reporting.monthly_prepared_revision_v2 where tenant_id='ORANGE' and month='2026-09-01' order by revision desc limit 1) then raise exception 'Prepared source modified';end if;
 -- Independent Yandex September control remains exact.
 if round((reporting.get_accepted_month_scope_v2('ORANGE','2026-09-01','YANDEX',null)->'totals'->>'result')::numeric,2)<>2485554.36 then raise exception 'Yandex affected';end if;
end $test$;
rollback;
select 'PASS: apply, repeat, independent fields, Finance immutability, Yandex isolation, rollback' validation;
