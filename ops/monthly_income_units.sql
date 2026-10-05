CREATE OR REPLACE FUNCTION reporting.get_accepted_month_scope_v2(p_tenant text, p_month date, p_marketplace text DEFAULT 'ALL'::text, p_account text DEFAULT NULL::text, p_revision bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
with src as materialized (
  select reporting.get_accepted_month_v2(p_tenant,p_month,p_revision) p
),
allrows as materialized (
  select r from src,jsonb_array_elements(p->'sku') r
),
history as materialized (
 select h from src,jsonb_array_elements(coalesce(p->'cost_history','[]'::jsonb)) h
), legacy_costs as materialized (
 select u from src,jsonb_array_elements(coalesce(p->'unit_costs','[]'::jsonb)) u
), expenses as materialized (
 select e from src,jsonb_array_elements(p->'manual_expenses') e
 where e->>'expense_type' in ('opex','external_logistics','materials','tax','business_other')
), expense_pools as materialized (
 select e, (select sum(greatest(coalesce((a.r->>'net_sales')::numeric,0),0))
 from allrows a
 where (nullif(e->>'marketplace','') is null or a.r->>'marketplace'=e->>'marketplace')
 and (nullif(e->>'account_id','') is null or a.r->>'account_id'=e->>'account_id')
 and (nullif(e->>'master_category','') is null or a.r->>'master_category'=e->>'master_category')) denominator
 from expenses
), costed as (
  select r,
         coalesce(nullif((r->>'economic_units')::numeric,0),(r->>'sold_units')::numeric,0) units,
         chosen.cost,
         case
           when coalesce(nullif((r->>'economic_units')::numeric,0),(r->>'sold_units')::numeric,0)=0 then 0
           when chosen.cost is null or chosen.cost->>'unit_cost' is null then null
           else (chosen.cost->>'unit_cost')::numeric
                * coalesce(nullif((r->>'economic_units')::numeric,0),(r->>'sold_units')::numeric,0)
         end display_cogs
  from allrows
  left join lateral (
    select q.cost
    from (
      select 1 priority,h cost
      from history
      where h->>'canonical_sku'=r->>'sku'
        and (nullif(h->>'account_id','') is null or h->>'account_id'=r->>'account_id')
        and (nullif(h->>'marketplace','') is null or upper(h->>'marketplace')=upper(r->>'marketplace'))
        and (nullif(h->>'valid_from','') is null or (h->>'valid_from')::date<=p_month)
        and (nullif(h->>'valid_to','') is null or p_month<(h->>'valid_to')::date)
      union all
      select 2 priority,h cost
      from history
      where h->>'article'=r->>'article'
        and (nullif(h->>'account_id','') is null or h->>'account_id'=r->>'account_id')
        and (nullif(h->>'marketplace','') is null or upper(h->>'marketplace')=upper(r->>'marketplace'))
        and (nullif(h->>'valid_from','') is null or (h->>'valid_from')::date<=p_month)
        and (nullif(h->>'valid_to','') is null or p_month<(h->>'valid_to')::date)
      union all
      select 3 priority,u cost
      from legacy_costs
      where u->>'article'=r->>'article'
        and (nullif(u->>'valid_from','') is null or (u->>'valid_from')::date<=p_month)
        and (nullif(u->>'valid_to','') is null or p_month<=(u->>'valid_to')::date)
    ) q
    order by q.priority,
             coalesce((q.cost->>'valid_from')::date,date '1900-01-01') desc
    limit 1
  ) chosen on true
),
allocated as (
  select r,cost,units,display_cogs,
         coalesce((
           select sum(
             abs((e->>'amount')::numeric)
             * greatest(coalesce((r->>'net_sales')::numeric,0),0)
             / nullif(denominator,0)
           )
           from expense_pools
           where (nullif(e->>'marketplace','') is null or r->>'marketplace'=e->>'marketplace')
             and (nullif(e->>'account_id','') is null or r->>'account_id'=e->>'account_id')
             and (nullif(e->>'master_category','') is null or r->>'master_category'=e->>'master_category')
         ),0) business_cost
  from costed
),
selected as (
  select * from allocated
  where (upper(p_marketplace)='ALL' or r->>'marketplace'=upper(p_marketplace))
    and (p_account is null or r->>'account_id'=p_account)
),
summary as (
  select count(*) n,
         count(*) filter(where display_cogs is null) missing_cost_count,
         sum(display_cogs) cogs,
         sum(business_cost) business_expenses,
         case when count(*)=0 or count(*) filter(where display_cogs is null)>0
              then null
              else sum((r->>'final_with_compensation')::numeric-display_cogs-business_cost)
         end profit_after_business
  from selected
)
select reporting.get_accepted_month_scope_base_v2(p_tenant,p_month,p_marketplace,p_account,p_revision)
  || jsonb_build_object(
    'business_economics',(
      select to_jsonb(s)||jsonb_build_object(
        'cost_status',case when n=0 then 'MISSING' when missing_cost_count>0 then 'PARTIAL' else 'COMPLETE' end,
        'allocation_basis','positive_net_sales_with_source_account_market_category_scope',
        'rounding','exact_numeric_aggregate_then_display_2_decimals',
        'cogs_basis','accepted_effective_dated_cost_times_accepted_economic_units',
        'financial_cogs_separate',true,
        'unknown_cost_policy','NULL_NOT_ZERO'
      ) from summary s
    ),
    'sku',(
      select coalesce(jsonb_agg(
        r||jsonb_build_object(
          'income_units',
            coalesce((r->>'sold_units')::numeric,
              coalesce((r->>'sale_operations')::numeric,0)-coalesce((r->>'return_operations')::numeric,0))
            + coalesce((r->'import_fields'->>'returned_units')::numeric,
                (select o.returned_units from public.monthly_compensation_import_v1 o
                 where o.tenant_id=p_tenant and o.month=p_month and o.account_id=r->>'account_id'
                   and o.marketplace=r->>'marketplace' and o.sku=r->>'sku'),
                (r->>'returned_units')::numeric,0)
            + coalesce(case when r->'import_fields' ? 'disposal_units' or r->'import_fields' ? 'written_off_units'
                 then coalesce((r->'import_fields'->>'disposal_units')::numeric,0)+coalesce((r->'import_fields'->>'written_off_units')::numeric,0) end,
                (select o.disposal_units from public.monthly_compensation_import_v1 o
                 where o.tenant_id=p_tenant and o.month=p_month and o.account_id=r->>'account_id'
                   and o.marketplace=r->>'marketplace' and o.sku=r->>'sku'),
                (r->>'disposal_units')::numeric,0),
          'income_units_basis','net_sold_plus_warehouse_returns_plus_writeoffs',
          'accepted_unit_cost',case when cost is null then null else (cost->>'unit_cost')::numeric end,
          'accepted_cost_source',case when cost is null then null else coalesce(cost->>'source','cost_history') end,
          'accepted_display_cogs',display_cogs,
          'allocated_business_expenses',business_cost,
          'profit_after_business',case when display_cogs is null then null else (r->>'final_with_compensation')::numeric-display_cogs-business_cost end
        )
      ),'[]'::jsonb)
      from selected
    )
  )
$function$
;
