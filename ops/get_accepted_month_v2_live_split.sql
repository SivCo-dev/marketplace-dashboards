-- Monthly live branch (W, CPR, months >= 2026-10): keep the direct / shared split and
-- move decompensations out of marketplace expenses.
--
-- Before: allocated_* were hardcoded to 0, all expense totals were written into the direct
-- columns and decompensations sat inside "other", so "after direct" always equalled "after all".
-- After:  commission/logistics/storage/promotion/other = direct (by article) part only,
--         allocated_* = shared part distributed by positive net sales,
--         decompensations leave expenses and go to net_compensation_amount, so
--         final_without_compensation excludes them, final_with_compensation is unchanged.
--
-- Totals computed downstream (get_accepted_month_scope_base_v2) add direct + allocated, so
-- expense totals stay equal except for the moved decompensations.
-- Applied to production 2026-11-02 (migration get_accepted_month_v2_live_split).
-- Rollback: recreate reporting.get_accepted_month_v2 from reporting.get_accepted_month_v2_flat_backup_20261102.

create or replace function reporting.get_accepted_month_v2(p_tenant text, p_month date, p_revision bigint default null::bigint)
 returns jsonb
 language plpgsql
 stable
 set search_path to ''
as $function$
declare
  v_tenant text := upper(btrim(p_tenant));
  v_saved jsonb;
  v_live jsonb;
  v_rows jsonb;
  v_expenses jsonb;
  v_out jsonb;
  v_rev bigint;
  v_account text;
  v_updated timestamptz;
  v_moved numeric;
begin
  select r.payload, r.revision
    into v_saved, v_rev
  from reporting.monthly_prepared_revision_v2 r
  where r.tenant_id=v_tenant
    and r.month=p_month
    and (p_revision is null or r.revision=p_revision)
  order by r.revision desc
  limit 1;

  if v_tenant in ('W','CPR')
     and p_month >= date '2026-10-01'
     and p_revision is null then
    v_live := reporting.get_monthly_api_payload_v2(v_tenant,p_month,'OZON');

    if v_live is not null
       and coalesce((v_live->'metadata'->>'data_available')::boolean,false)
       and jsonb_array_length(coalesce(v_live->'sku_rows','[]'::jsonb)) > 0 then
      v_account := v_live->'metadata'->>'account_id';
      v_updated := (v_live->'metadata'->>'refreshed_at')::timestamptz;

      select coalesce(jsonb_agg(
        coalesce(old_row.r,'{}'::jsonb)
        || jsonb_build_object(
          'month',to_char(p_month,'YYYY-MM'),
          'month_sku',to_char(p_month,'YYYY-MM')||'|OZON|'||v_account||'|'||(n.r->>'canonical_sku'),
          'marketplace','OZON',
          'account_id',v_account,
          'sku',n.r->>'canonical_sku',
          'canonical_sku',n.r->>'canonical_sku',
          'article',n.r->>'article',
          'product_id',n.r->'product_id',
          'product_name',n.r->>'product_name',
          'sales',(n.r->>'sales')::numeric,
          'returns',(n.r->>'returns')::numeric,
          'net_sales',(n.r->>'net_sales')::numeric,
          'sold_units',coalesce((n.r->>'financial_net_units')::numeric,0),
          'economic_units',coalesce((n.r->>'financial_net_units')::numeric,0),
          'sale_operations',coalesce((n.r->>'financial_sale_units')::numeric,0),
          'return_operations',coalesce((n.r->>'financial_return_units')::numeric,0),
          'commission',x.d_commission,
          'logistics',x.d_logistics,
          'storage',x.d_storage,
          'promotion',x.d_promotion,
          'other',x.d_other,
          'allocated_commission',x.a_commission,
          'allocated_logistics',x.a_logistics,
          'allocated_storage',x.a_storage,
          'allocated_promotion',x.a_promotion,
          'allocated_other',x.a_other - x.moved,
          'allocated_shared_total',x.a_commission+x.a_logistics+x.a_storage+x.a_promotion+x.a_other - x.moved,
          'compensation',0,
          'net_compensation_amount',x.moved,
          'decompensation_amount',coalesce((n.r->>'decompensation')::numeric,0),
          'direct_net_received',(n.r->>'net_sales')::numeric + x.d_commission+x.d_logistics+x.d_storage+x.d_promotion+x.d_other,
          'net_after_all_ozon_costs',(n.r->>'result_without_compensation')::numeric - x.moved,
          'final_without_compensation',(n.r->>'result_without_compensation')::numeric - x.moved,
          'final_with_compensation',(n.r->>'result_without_compensation')::numeric,
          'received_per_unit',n.r->'result_without_compensation_per_financial_unit',
          'final_without_compensation_per_unit',
            case when coalesce((n.r->>'financial_net_units')::numeric,0)>0
                 then round(((n.r->>'result_without_compensation')::numeric - x.moved)/(n.r->>'financial_net_units')::numeric,2) end,
          'final_with_compensation_per_unit',n.r->'result_without_compensation_per_financial_unit',
          'is_closed',coalesce(v_live->'metadata'->>'marketplace_close_status','')='CLOSED',
          'updated_at',v_updated
        )
        order by n.ord
      ),'[]'::jsonb)
      into v_rows
      from jsonb_array_elements(v_live->'sku_rows') with ordinality n(r,ord)
      cross join lateral (
        select
          coalesce((n.r#>>'{expense_structure,direct,commission}')::numeric,(n.r->>'commission')::numeric,0) d_commission,
          coalesce((n.r#>>'{expense_structure,direct,logistics}')::numeric,(n.r->>'logistics')::numeric,0) d_logistics,
          coalesce((n.r#>>'{expense_structure,direct,storage}')::numeric,(n.r->>'storage')::numeric,0) d_storage,
          coalesce((n.r#>>'{expense_structure,direct,promotion}')::numeric,(n.r->>'promotion')::numeric,0) d_promotion,
          coalesce((n.r#>>'{expense_structure,direct,other}')::numeric,(n.r->>'other')::numeric,0) d_other,
          coalesce((n.r#>>'{expense_structure,allocated_shared,commission}')::numeric,0) a_commission,
          coalesce((n.r#>>'{expense_structure,allocated_shared,logistics}')::numeric,0) a_logistics,
          coalesce((n.r#>>'{expense_structure,allocated_shared,storage}')::numeric,0) a_storage,
          coalesce((n.r#>>'{expense_structure,allocated_shared,promotion}')::numeric,0) a_promotion,
          coalesce((n.r#>>'{expense_structure,allocated_shared,other}')::numeric,0) a_other,
          case when n.r#>>'{expense_structure,decompensation,included_in}'='other'
               then coalesce((n.r->>'decompensation')::numeric,0) else 0 end moved
      ) x
      left join lateral (
        select s.r
        from jsonb_array_elements(coalesce(v_saved->'sku','[]'::jsonb)) s(r)
        where coalesce(s.r->>'canonical_sku',s.r->>'sku')=n.r->>'canonical_sku'
          and coalesce(s.r->>'marketplace','OZON')='OZON'
        limit 1
      ) old_row on true;

      select coalesce(sum((r->>'net_compensation_amount')::numeric),0)
        into v_moved
      from jsonb_array_elements(v_rows) r;

      select coalesce(jsonb_agg(jsonb_build_object(
        'month',to_char(p_month,'YYYY-MM'),
        'month_sku',to_char(p_month,'YYYY-MM')||'|OZON|'||v_account||'|'||(n.r->>'canonical_sku'),
        'sku',n.r->>'canonical_sku',
        'marketplace','OZON',
        'account_id',v_account,
        'expense_code',e.code,
        'display_name',e.label,
        'stage',e.stage,
        'allocation_basis',e.basis,
        'amount',e.amount,
        'source','monthly_shadow_v2',
        'is_exact',true,
        'updated_at',v_updated
      ) order by n.ord,e.seq),'[]'::jsonb)
      into v_expenses
      from jsonb_array_elements(v_live->'sku_rows') with ordinality n(r,ord)
      cross join lateral (
        select
          coalesce((n.r#>>'{expense_structure,direct,commission}')::numeric,(n.r->>'commission')::numeric,0) d_commission,
          coalesce((n.r#>>'{expense_structure,direct,logistics}')::numeric,(n.r->>'logistics')::numeric,0) d_logistics,
          coalesce((n.r#>>'{expense_structure,direct,storage}')::numeric,(n.r->>'storage')::numeric,0) d_storage,
          coalesce((n.r#>>'{expense_structure,direct,promotion}')::numeric,(n.r->>'promotion')::numeric,0) d_promotion,
          coalesce((n.r#>>'{expense_structure,direct,other}')::numeric,(n.r->>'other')::numeric,0) d_other,
          coalesce((n.r#>>'{expense_structure,allocated_shared,commission}')::numeric,0) a_commission,
          coalesce((n.r#>>'{expense_structure,allocated_shared,logistics}')::numeric,0) a_logistics,
          coalesce((n.r#>>'{expense_structure,allocated_shared,storage}')::numeric,0) a_storage,
          coalesce((n.r#>>'{expense_structure,allocated_shared,promotion}')::numeric,0) a_promotion,
          coalesce((n.r#>>'{expense_structure,allocated_shared,other}')::numeric,0) a_other,
          case when n.r#>>'{expense_structure,decompensation,included_in}'='other'
               then coalesce((n.r->>'decompensation')::numeric,0) else 0 end moved
      ) x
      cross join lateral (values
        (1,'commission','Комиссия Ozon','direct','sku_finance',x.d_commission),
        (2,'logistics','Логистика','direct','sku_finance',x.d_logistics),
        (3,'storage','Хранение / FBO','direct','sku_finance',x.d_storage),
        (4,'promotion','Продвижение','direct','sku_finance',x.d_promotion),
        (5,'other','Прочие расходы','direct','sku_finance',x.d_other),
        (6,'commission_allocated','Комиссия / общие','allocated','positive_net_sales',x.a_commission),
        (7,'logistics_allocated','Логистика / общие','allocated','positive_net_sales',x.a_logistics),
        (8,'storage_allocated','Хранение / общие','allocated','positive_net_sales',x.a_storage),
        (9,'promotion_allocated','Продвижение / общие','allocated','positive_net_sales',x.a_promotion),
        (10,'other_allocated','Прочие / общие','allocated','positive_net_sales',x.a_other - x.moved),
        (11,'compensation','Декомпенсации','direct','sku_finance',x.moved)
      ) e(seq,code,label,stage,basis,amount)
      where e.amount<>0;

      v_out := jsonb_build_object(
        'contract_version','monthly-accepted-v2.1',
        'revision',coalesce(v_rev,0),
        'metadata',jsonb_build_object(
          'tenant_id',v_tenant,
          'month',p_month,
          'provenance','monthly_shadow_v2_live',
          'baseline_accepted_by_user',true,
          'finance_status',case when v_live->'metadata'->>'marketplace_close_status'='CLOSED' then 'ACCEPTED_CLOSED' else 'PRELIMINARY' end,
          'enrichment_status','CURRENT_FINANCE',
          'unit_semantics','financial sale and return units',
          'missing_cost_policy','NULL_NOT_ZERO',
          'refreshed_at',v_updated,
          'decompensation_status',v_live->'metadata'->>'decompensation_status',
          'decompensation_included_in_expenses',
            case when v_moved<>0 then false
                 else coalesce((v_live->'metadata'->>'decompensation_included_in_expenses')::boolean,false) end,
          'decompensation_in_compensation',v_moved<>0
        ),
        'sku',v_rows,
        'months',jsonb_build_array(jsonb_build_object(
          'month',to_char(p_month,'YYYY-MM'),
          'sales',(v_live->'financial_economics'->>'sales')::numeric,
          'returns',(v_live->'financial_economics'->>'returns')::numeric,
          'net_sales',(v_live->'financial_economics'->>'net_sales')::numeric,
          'commission',(v_live->'financial_economics'->>'commission')::numeric,
          'logistics',(v_live->'financial_economics'->>'logistics')::numeric,
          'storage',(v_live->'financial_economics'->>'storage')::numeric,
          'promotion',(v_live->'financial_economics'->>'promotion')::numeric,
          'other',(v_live->'financial_economics'->>'other')::numeric - v_moved,
          'compensation',v_moved,
          'ozon_result',(v_live->'financial_economics'->>'result_without_compensation')::numeric,
          'updated_at',v_updated
        )),
        'expense_detail',v_expenses,
        'categories','[]'::jsonb,
        'manual_expenses',coalesce(v_saved->'manual_expenses','[]'::jsonb),
        'cogs_sku',coalesce(v_saved->'cogs_sku','[]'::jsonb),
        'unit_costs',coalesce(v_saved->'unit_costs','[]'::jsonb),
        'cost_history',coalesce(v_saved->'cost_history','[]'::jsonb)
      );

      return reporting.apply_monthly_upload_layer_v2(v_out,v_tenant,p_month);
    end if;
  end if;

  if v_saved is null then return null; end if;
  return reporting.apply_monthly_upload_layer_v2(v_saved,v_tenant,p_month);
end
$function$;
