CREATE OR REPLACE FUNCTION public.get_monthly_cpr_v1()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with rows as (
  select * from public.monthly_cpr_combined_v1
),
months as (
  select
    month,
    sum(sales) sales,
    sum(returns) returns,
    sum(net_sales) net_sales,
    sum(sold_units) sold_units,
    sum(commission) commission,
    sum(logistics + allocated_logistics) logistics,
    sum(storage) storage,
    sum(promotion + allocated_promotion) promotion,
    sum(other + allocated_other) other,
    sum(net_compensation_amount) compensation,
    sum(final_with_compensation) ozon_result,
    bool_and(is_closed) is_closed,
    max(updated_at) updated_at
  from rows
  group by month
),
official as (
  select * from public.monthly_ozon_summary_v1
  where tenant_id='CPR' and marketplace='OZON'
),
categories as (
  select
    month,
    master_category,
    sum(net_sales) sales,
    sum(abs(commission)+abs(logistics+allocated_logistics)+abs(storage)+abs(promotion+allocated_promotion)+abs(other+allocated_other)) expenses,
    sum(final_with_compensation) ozon_result
  from rows
  group by month, master_category
),
coverage as (
  select min(report_date) live_min_date,max(report_date) live_max_date
  from public.sku_daily_cpr
)
select jsonb_build_object(
  'meta', jsonb_build_object(
    'tenant','CPR','marketplace','OZON','version','monthly-v1.3','generated_at',now(),
    'live_min_date',(select live_min_date from coverage),
    'live_max_date',(select live_max_date from coverage),
    'note','August 2026 Ozon expenses are typed from Finance API by type_id; current month remains preliminary'
  ),
  'months', coalesce((select jsonb_agg(to_jsonb(m) order by month) from months m),'[]'::jsonb),
  'official_ozon', coalesce((select jsonb_agg(to_jsonb(o) order by month) from official o),'[]'::jsonb),
  'categories', coalesce((select jsonb_agg(to_jsonb(c) order by month, sales desc) from categories c),'[]'::jsonb),
  'sku', coalesce((select jsonb_agg(to_jsonb(r) order by month, net_sales desc) from rows r),'[]'::jsonb),
  'expense_detail', coalesce((
    select jsonb_agg(to_jsonb(e) order by month, month_sku, stage, expense_code)
    from public.monthly_cpr_expense_detail_v1 e
  ),'[]'::jsonb),
  'manual_expenses', coalesce((
    select jsonb_agg(to_jsonb(x) order by month,expense_type)
    from public.monthly_manual_expenses_v1 x where tenant_id='CPR'
  ),'[]'::jsonb),
  'unit_costs', coalesce((
    select jsonb_agg(to_jsonb(u) order by article)
    from public.monthly_cpr_unit_cost_v1 u
  ),'[]'::jsonb)
) || jsonb_build_object(
 'cost_history',coalesce((select jsonb_agg(jsonb_build_object(
  'canonical_sku',canonical_sku,'article',source_reference->>'article',
  'account_id',account_id,'marketplace',marketplace,'unit_cost',unit_cost,
  'valid_from',valid_from,'valid_to',valid_to) order by canonical_sku,valid_from)
  from core.sku_cost_history where tenant_id='CPR' and approved_at is not null),'[]'::jsonb),
 'cogs_sku',coalesce((select jsonb_agg(jsonb_build_object(
  'canonical_sku',canonical_sku,'account_id',account_id,'marketplace',marketplace,
  'month',month,'unit_cost',unit_cost,'cogs',cogs,'cost_status',cost_status,
  'net_financial_units',net_financial_units) order by month,canonical_sku)
  from reporting.monthly_cogs_sku_v2 where tenant_id='CPR'),'[]'::jsonb)
);
$function$
;

CREATE OR REPLACE FUNCTION public.get_monthly_w_v1()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with rows as (select * from public.monthly_w_combined_v1),
months as (
 select month,sum(sales) as sales,sum(returns) as returns,sum(net_sales) as net_sales,sum(sold_units) as sold_units,
        sum(commission) as commission,sum(logistics+allocated_logistics) as logistics,sum(storage+allocated_storage) as storage,
        sum(promotion+allocated_promotion) as promotion,sum(other+allocated_other) as other,
        sum(net_compensation_amount) as compensation,sum(final_with_compensation) as ozon_result,
        bool_and(is_closed) as is_closed,max(updated_at) as updated_at
 from rows group by month
),
categories as (
 select month,master_category,sum(net_sales) as sales,
        sum(abs(commission)+abs(logistics+allocated_logistics)+abs(storage+allocated_storage)+abs(promotion+allocated_promotion)+abs(other+allocated_other)) as expenses,
        sum(final_with_compensation) as ozon_result
 from rows group by month,master_category
),
live_expense as (
 select month,month_sku,sku,'OZON'::text marketplace,'commission_direct'::text expense_code,'Комиссия Ozon'::text display_name,
        'direct'::text stage,'sku'::text allocation_basis,commission::numeric amount,'sku_daily_preliminary'::text source,false is_exact,updated_at
 from public.monthly_w_live_v1 where commission<>0
 union all
 select month,month_sku,sku,'OZON','delivery_direct','Логистика','direct','sku',logistics,'sku_daily_preliminary',false,updated_at
 from public.monthly_w_live_v1 where logistics<>0
 union all
 select month,month_sku,sku,'OZON','fbo_direct','FBO / хранение','direct','sku',storage,'sku_daily_preliminary',false,updated_at
 from public.monthly_w_live_v1 where storage<>0
 union all
 select month,month_sku,sku,'OZON','promotion_direct','Продвижение','direct','sku',promotion,'sku_daily_preliminary',false,updated_at
 from public.monthly_w_live_v1 where promotion<>0
 union all
 select month,month_sku,sku,'OZON','other_direct','Прочие расходы','direct','sku',other,'sku_daily_preliminary',false,updated_at
 from public.monthly_w_live_v1 where other<>0
),
expense_rows as (
 select * from public.monthly_w_expense_detail_v1
 union all
 select * from live_expense le
 where not exists (
   select 1 from public.monthly_w_expense_detail_v1 c
   where c.month=le.month and c.month_sku=le.month_sku and c.expense_code=le.expense_code
 )
),
coverage as (
 select min(report_date) as live_min_date,max(report_date) as live_max_date from public.sku_daily
)
select jsonb_build_object(
 'meta',jsonb_build_object('tenant','W','marketplace','OZON','version','monthly-v1.0','generated_at',now(),
   'live_min_date',(select live_min_date from coverage),'live_max_date',(select live_max_date from coverage),
   'note','July-August exact typed expenses from accrual reports; September typed from live daily Finance and remains preliminary'),
 'months',coalesce((select jsonb_agg(to_jsonb(m) order by month) from months m),'[]'::jsonb),
 'official_ozon','[]'::jsonb,
 'categories',coalesce((select jsonb_agg(to_jsonb(c) order by month,sales desc) from categories c),'[]'::jsonb),
 'sku',coalesce((select jsonb_agg(to_jsonb(r) order by month,net_sales desc) from rows r),'[]'::jsonb),
 'expense_detail',coalesce((select jsonb_agg(to_jsonb(e) order by month,month_sku,expense_code) from expense_rows e),'[]'::jsonb),
 'manual_expenses',coalesce((select jsonb_agg(to_jsonb(x) order by month,expense_type) from public.monthly_manual_expenses_v1 x where tenant_id='W'),'[]'::jsonb),
 'unit_costs',coalesce((select jsonb_agg(to_jsonb(u) order by article) from public.monthly_w_unit_cost_v1 u),'[]'::jsonb)
) || jsonb_build_object(
 'cost_history',coalesce((select jsonb_agg(jsonb_build_object(
  'canonical_sku',canonical_sku,'article',source_reference->>'article',
  'account_id',account_id,'marketplace',marketplace,'unit_cost',unit_cost,
  'valid_from',valid_from,'valid_to',valid_to) order by canonical_sku,valid_from)
  from core.sku_cost_history where tenant_id='W' and approved_at is not null),'[]'::jsonb),
 'cogs_sku',coalesce((select jsonb_agg(jsonb_build_object(
  'canonical_sku',canonical_sku,'account_id',account_id,'marketplace',marketplace,
  'month',month,'unit_cost',unit_cost,'cogs',cogs,'cost_status',cost_status,
  'net_financial_units',net_financial_units) order by month,canonical_sku)
  from reporting.monthly_cogs_sku_v2 where tenant_id='W'),'[]'::jsonb)
);
$function$
;
