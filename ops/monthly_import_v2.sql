-- Separate, versioned Ozon operational layer. Prepared Finance revisions stay immutable.
create table if not exists reporting.monthly_upload_auth_v2 (id boolean primary key default true check(id), pin_hash text not null);
create table if not exists reporting.monthly_upload_attempt_v2 (client_key text primary key, failures int not null default 0, window_start timestamptz not null default now());
create table if not exists reporting.monthly_upload_batch_v2 (
 batch_id uuid primary key default gen_random_uuid(), tenant_id text not null, account_id text not null,
 month date not null check(month=date_trunc('month',month)::date), filename text not null,
 file_hash text not null, source_base64 text not null, base_hash text not null, base_revision bigint not null,
 expected_layer_revision bigint not null, fields jsonb not null, preview jsonb not null,
 status text not null default 'PREVIEW' check(status in ('PREVIEW','APPLIED')),
 layer_revision bigint, created_at timestamptz not null default now(), applied_at timestamptz
);
create index if not exists monthly_upload_scope_v2 on reporting.monthly_upload_batch_v2(tenant_id,account_id,month,applied_at desc);
create table if not exists reporting.monthly_upload_active_v2 (
 tenant_id text not null,account_id text not null,month date not null,field text not null,
 batch_id uuid not null references reporting.monthly_upload_batch_v2(batch_id),
 primary key(tenant_id,account_id,month,field)
);
alter table reporting.monthly_upload_auth_v2 enable row level security;
alter table reporting.monthly_upload_attempt_v2 enable row level security;
alter table reporting.monthly_upload_batch_v2 enable row level security;
alter table reporting.monthly_upload_active_v2 enable row level security;
revoke all on reporting.monthly_upload_auth_v2,reporting.monthly_upload_attempt_v2,reporting.monthly_upload_batch_v2,reporting.monthly_upload_active_v2 from public,anon,authenticated;
grant all on reporting.monthly_upload_auth_v2,reporting.monthly_upload_attempt_v2,reporting.monthly_upload_batch_v2,reporting.monthly_upload_active_v2 to service_role;

create or replace function public.monthly_upload_auth_v2(p_hash text,p_client text) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_ok boolean; v_row reporting.monthly_upload_attempt_v2%rowtype;
begin
 insert into reporting.monthly_upload_attempt_v2(client_key) values(p_client) on conflict do nothing;
 select * into v_row from reporting.monthly_upload_attempt_v2 where client_key=p_client for update;
 if v_row.window_start<now()-interval '15 minutes' then
  update reporting.monthly_upload_attempt_v2 set failures=0,window_start=now() where client_key=p_client;v_row.failures:=0;
 end if;
 if v_row.failures>=10 then return false;end if;
 select pin_hash=p_hash into v_ok from reporting.monthly_upload_auth_v2 where id;
 if not coalesce(v_ok,false) then update reporting.monthly_upload_attempt_v2 set failures=failures+1 where client_key=p_client;end if;
 return coalesce(v_ok,false);
end $$;

create or replace function public.monthly_upload_context_v2(p_tenant text,p_month date,p_account text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_payload jsonb;v_hash text;v_revision bigint;
begin
 if not exists(select 1 from config.marketplace_accounts where tenant_id=p_tenant and account_id=p_account and marketplace='OZON' and active and monthly_enabled) then raise exception 'Неизвестный кабинет Ozon';end if;
 select payload,source_hash,revision into v_payload,v_hash,v_revision from reporting.monthly_prepared_revision_v2 where tenant_id=p_tenant and month=p_month order by revision desc limit 1;
 if v_payload is null then raise exception 'За этот месяц ещё нет базы отчёта';end if;
 return jsonb_build_object('payload',v_payload,'base_hash',v_hash,'base_revision',v_revision,
 'layer_revision',coalesce((select max(layer_revision) from reporting.monthly_upload_batch_v2 where tenant_id=p_tenant and account_id=p_account and month=p_month and status='APPLIED'),0),
 'products',(select coalesce(jsonb_agg(jsonb_build_object('account_id',m.account_id,'sku',p.canonical_sku,'article',p.canonical_sku,'offer_id',m.offer_id,'marketplace_sku',m.marketplace_sku,'product_name',p.canonical_name,'master_category',d.master_category)),'[]'::jsonb) from core.account_sku_map m join core.products p using(product_id) left join dev23.products d on d.tenant_id=p.tenant_id and d.canonical_sku=p.canonical_sku where m.tenant_id=p_tenant and m.account_id=p_account and m.marketplace='OZON' and m.valid_from<=p_month and (m.valid_to is null or p_month<m.valid_to)));
end $$;

create or replace function public.monthly_upload_catalog_v2() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('accounts',(select jsonb_agg(jsonb_build_object('tenant_id',tenant_id,'account_id',account_id,'display_name',display_name,'method',case when tenant_id='CPR' then 'SKU' else 'CATEGORY_SALES' end)) from config.marketplace_accounts where active and monthly_enabled and marketplace='OZON'))
$$;

create or replace function public.monthly_upload_stage_v2(p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if jsonb_array_length(p_data->'preview'->'patches')>10000 or jsonb_array_length(p_data->'preview'->'source')>10000 then raise exception 'Слишком много строк';end if;
 insert into reporting.monthly_upload_batch_v2(tenant_id,account_id,month,filename,file_hash,source_base64,base_hash,base_revision,expected_layer_revision,fields,preview)
 values(p_data->>'tenant',p_data->>'account_id',(p_data->>'month')::date,left(p_data->>'filename',250),p_data->>'file_hash',p_data->>'source_base64',p_data->>'base_hash',(p_data->>'base_revision')::bigint,(p_data->>'layer_revision')::bigint,p_data->'preview'->'fields',p_data->'preview') returning batch_id into v_id;
 return jsonb_build_object('batch_id',v_id)|| (p_data->'preview');
end $$;

create or replace function public.monthly_upload_apply_v2(p_batch uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b reporting.monthly_upload_batch_v2%rowtype;v_current bigint;v_hash text;v_revision bigint;v_duplicate uuid;
begin
 select * into b from reporting.monthly_upload_batch_v2 where batch_id=p_batch for update;
 if not found then raise exception 'Предпросмотр не найден';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(b.tenant_id||'|'||b.account_id||'|'||b.month,0));
 if b.status='APPLIED' then return jsonb_build_object('ok',true,'duplicate',true,'batch_id',b.batch_id,'revision',b.layer_revision);end if;
 if jsonb_array_length(b.preview->'errors')>0 then raise exception 'В файле остались ошибки — запись заблокирована';end if;
 select source_hash,revision into v_hash,v_revision from reporting.monthly_prepared_revision_v2 where tenant_id=b.tenant_id and month=b.month order by revision desc limit 1;
 if v_hash is distinct from b.base_hash or v_revision<>b.base_revision then raise exception 'База месяца обновилась — повторите предпросмотр';end if;
 select coalesce(max(layer_revision),0) into v_current from reporting.monthly_upload_batch_v2 where tenant_id=b.tenant_id and account_id=b.account_id and month=b.month and status='APPLIED';
 -- Exact repeat of the currently active fields is a no-op, even with a new filename.
 select x.batch_id into v_duplicate from reporting.monthly_upload_batch_v2 x where x.tenant_id=b.tenant_id and x.account_id=b.account_id and x.month=b.month and x.status='APPLIED' and x.file_hash=b.file_hash and x.preview=b.preview and not exists(select 1 from jsonb_array_elements_text(b.fields) f where not exists(select 1 from reporting.monthly_upload_active_v2 a where a.tenant_id=b.tenant_id and a.account_id=b.account_id and a.month=b.month and a.field=f and a.batch_id=x.batch_id)) order by x.layer_revision desc limit 1;
 if v_duplicate is not null then return jsonb_build_object('ok',true,'duplicate',true,'batch_id',v_duplicate,'revision',v_current);end if;
 if v_current<>b.expected_layer_revision then raise exception 'Другой файл уже применён — повторите предпросмотр';end if;
 update reporting.monthly_upload_batch_v2 set status='APPLIED',layer_revision=v_current+1,applied_at=now() where batch_id=b.batch_id;
 insert into reporting.monthly_upload_active_v2(tenant_id,account_id,month,field,batch_id)
 select b.tenant_id,b.account_id,b.month,f,b.batch_id from jsonb_array_elements_text(b.fields) f
 on conflict(tenant_id,account_id,month,field) do update set batch_id=excluded.batch_id;
 return jsonb_build_object('ok',true,'duplicate',false,'batch_id',b.batch_id,'revision',v_current+1);
end $$;

create or replace function public.monthly_upload_history_v2(p_tenant text,p_month date,p_account text) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(x order by x.created_at desc),'[]'::jsonb) from (
 select b.batch_id,b.filename,b.status,b.fields,b.layer_revision,b.created_at,b.applied_at,b.preview->'totals' totals,
 (select coalesce(jsonb_agg(a.field),'[]'::jsonb) from reporting.monthly_upload_active_v2 a where a.batch_id=b.batch_id) active_fields
 from reporting.monthly_upload_batch_v2 b where tenant_id=p_tenant and month=p_month and account_id=p_account order by created_at desc limit 30
 )x
$$;

create or replace function reporting.apply_monthly_upload_layer_v2(p jsonb,p_tenant text,p_month date) returns jsonb
language plpgsql stable set search_path='' as $$
declare v_rows jsonb:=coalesce(p->'sku','[]'::jsonb);v_exp jsonb:=coalesce(p->'expense_detail','[]'::jsonb);v_result jsonb:='[]';v_row jsonb;v_patch jsonb;v_account text;v_comp numeric;v_decomp numeric;v_old numeric;v_new numeric;v_disposal numeric;v_writeoff numeric;v_complete boolean;v_existing int;
begin
 if p is null then return null;end if;
 if not exists(select 1 from reporting.monthly_upload_active_v2 where tenant_id=p_tenant and month=p_month) then return p;end if;
 -- Include valid imported SKU without monthly sales as an expense/operational-only row.
 for v_row in select distinct on(a.account_id,x->>'sku') jsonb_build_object('sku',x->>'sku','article',x->>'article','product_name',x->>'product_name','master_category',x->>'master_category','account_id',a.account_id,'marketplace','OZON','month',p_month,'month_sku',to_char(p_month,'YYYY-MM')||'|OZON|'||a.account_id||'|'||(x->>'sku'),'sales',0,'returns',0,'net_sales',0,'sold_units',0,'economic_units',0,'final_with_compensation',0,'net_compensation_amount',0)
 from reporting.monthly_upload_active_v2 a join reporting.monthly_upload_batch_v2 b using(batch_id),jsonb_array_elements(b.preview->'patches') x
 where a.tenant_id=p_tenant and a.month=p_month and not exists(select 1 from jsonb_array_elements(v_rows) r where r->>'account_id'=a.account_id and r->>'marketplace'='OZON' and r->>'sku'=x->>'sku')
 loop v_rows:=v_rows||jsonb_build_array(v_row);end loop;
 for v_row in select r from jsonb_array_elements(v_rows) r loop
  v_account:=v_row->>'account_id';
  if v_row->>'marketplace'<>'OZON' or not exists(select 1 from reporting.monthly_upload_active_v2 where tenant_id=p_tenant and account_id=v_account and month=p_month) then v_result:=v_result||jsonb_build_array(v_row);continue;end if;
  select coalesce(jsonb_object_agg(a.field,coalesce(x->'values'->a.field,'0'::jsonb)),'{}'::jsonb) into v_patch
  from reporting.monthly_upload_active_v2 a join reporting.monthly_upload_batch_v2 b using(batch_id)
  left join lateral (select x from jsonb_array_elements(b.preview->'patches')x where x->>'sku'=v_row->>'sku' limit 1) q on true
  where a.tenant_id=p_tenant and a.account_id=v_account and a.month=p_month;
  -- Monetary imported fields replace the corresponding component, not Finance's unrelated fields.
  v_old:=coalesce((v_row->>'net_compensation_amount')::numeric,0);
  v_comp:=coalesce((v_patch->>'compensation_amount')::numeric,(v_row->>'compensation_amount')::numeric,greatest(v_old,0));
  v_decomp:=coalesce((v_patch->>'decompensation_amount')::numeric,(v_row->>'decompensation_amount')::numeric,least(v_old,0));
  v_new:=v_comp+v_decomp;
  v_disposal:=coalesce((v_patch->>'disposal_units')::numeric,(v_row->>'imported_disposal_units')::numeric,(v_row->>'disposal_units')::numeric,0);
  v_writeoff:=coalesce((v_patch->>'written_off_units')::numeric,(v_row->>'imported_written_off_units')::numeric,0);
  v_existing:=(select count(*) from jsonb_array_elements(v_rows)r where r->>'account_id'=v_account and r->>'marketplace'='OZON' and r->>'sku'=v_row->>'sku');
  -- Avoid duplicating layer totals if the accepted source has repeated canonical SKU rows.
  if v_existing>1 and (v_patch ? 'compensation_amount' or v_patch ? 'decompensation_amount') then raise exception 'Повторяющийся SKU в базе: %',v_row->>'sku';end if;
  v_row:=v_row||jsonb_build_object('compensation_amount',v_comp,'decompensation_amount',v_decomp,'net_compensation_amount',v_new,'preliminary_compensation',v_new,'final_without_compensation',coalesce((v_row->>'final_with_compensation')::numeric,0)-v_old,'final_with_compensation',coalesce((v_row->>'final_with_compensation')::numeric,0)-v_old+v_new,'imported_disposal_units',v_disposal,'imported_written_off_units',v_writeoff,'disposal_units',v_disposal+v_writeoff,'import_fields',v_patch);
  if v_patch ? 'compensated_units' then v_row:=v_row||jsonb_build_object('compensated_units',v_patch->'compensated_units');end if;
  if v_patch ? 'returned_units' then v_row:=v_row||jsonb_build_object('returned_units',v_patch->'returned_units');end if;
  if v_patch ? 'returns_without_compensation' then v_row:=v_row||jsonb_build_object('returns_without_compensation',v_patch->'returns_without_compensation');end if;
  v_result:=v_result||jsonb_build_array(v_row);
 end loop;
 -- Preserve typed expense consistency when replacing monetary compensation fields.
 select coalesce(jsonb_agg(e),'[]'::jsonb) into v_exp from jsonb_array_elements(v_exp)e where not(e->>'marketplace'='OZON' and e->>'expense_code'='compensation' and exists(select 1 from reporting.monthly_upload_active_v2 a where a.tenant_id=p_tenant and a.month=p_month and a.account_id=e->>'account_id' and a.field in ('compensation_amount','decompensation_amount')));
 for v_row in select r from jsonb_array_elements(v_result)r where r->>'marketplace'='OZON' and exists(select 1 from reporting.monthly_upload_active_v2 a where a.tenant_id=p_tenant and a.month=p_month and a.account_id=r->>'account_id' and a.field in ('compensation_amount','decompensation_amount')) loop
  v_exp:=v_exp||jsonb_build_array(jsonb_build_object('sku',v_row->>'sku','month_sku',v_row->>'month_sku','account_id',v_row->>'account_id','marketplace','OZON','expense_code','compensation','display_name','Компенсации','amount',v_row->'net_compensation_amount','stage',case when p_tenant='CPR' then 'direct' else 'allocated' end,'allocation_basis',case when p_tenant='CPR' then 'sku' else 'category_positive_gross_sales' end,'source','monthly-upload-v2','is_exact',true));
 end loop;
 return p||jsonb_build_object('sku',v_result,'expense_detail',v_exp,'metadata',(p->'metadata')||jsonb_build_object('upload_layer_revision',coalesce((select max(layer_revision) from reporting.monthly_upload_batch_v2 where tenant_id=p_tenant and month=p_month and status='APPLIED'),0)));
end $$;

create or replace function reporting.get_accepted_month_v2(p_tenant text,p_month date,p_revision bigint default null) returns jsonb
language sql stable set search_path='' as $$
 select reporting.apply_monthly_upload_layer_v2(payload,p_tenant,p_month) from reporting.monthly_prepared_revision_v2 where tenant_id=p_tenant and month=p_month and (p_revision is null or revision=p_revision) order by revision desc limit 1
$$;
revoke all on function reporting.apply_monthly_upload_layer_v2(jsonb,text,date) from public,anon,authenticated;
grant execute on function reporting.apply_monthly_upload_layer_v2(jsonb,text,date) to service_role;
revoke all on function public.monthly_upload_auth_v2(text,text),public.monthly_upload_context_v2(text,date,text),public.monthly_upload_catalog_v2(),public.monthly_upload_stage_v2(jsonb),public.monthly_upload_apply_v2(uuid),public.monthly_upload_history_v2(text,date,text) from public,anon,authenticated;
grant execute on function public.monthly_upload_auth_v2(text,text),public.monthly_upload_context_v2(text,date,text),public.monthly_upload_catalog_v2(),public.monthly_upload_stage_v2(jsonb),public.monthly_upload_apply_v2(uuid),public.monthly_upload_history_v2(text,date,text) to service_role;
-- Close the legacy mutation RPC's direct REST bypass; its PIN-protected Edge API keeps working.
revoke all on function public.apply_monthly_compensation_import_v1(jsonb) from public,anon,authenticated;
grant execute on function public.apply_monthly_compensation_import_v1(jsonb) to service_role;
