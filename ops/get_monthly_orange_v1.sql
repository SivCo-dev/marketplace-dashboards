CREATE OR REPLACE FUNCTION public.get_monthly_orange_v1()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
SET statement_timeout TO '30s'
AS $function$
with ozon_core as materialized (select * from public.monthly_orange_ozon_core_v1),
wb_core as materialized (select * from public.monthly_orange_wb_core_v1),
yandex_core as materialized (select * from public.monthly_orange_yandex_core_v1),
ozon_months as (
  select distinct month from ozon_core
),
wb_months as (
  select distinct month from wb_core
),
yandex_months as (
  select distinct month from yandex_core
),
canonical_ozon as (
  select
    month,month_sku,marketplace,account_id,cabinet,article,sku,product_name,master_category,
    sales,returns,net_sales,sold_units,economic_units,
    commission,logistics,allocated_logistics,storage,allocated_storage,
    promotion,allocated_promotion,other,allocated_other,allocated_commission,
    net_compensation_amount,preliminary_compensation,final_with_compensation,
    is_closed,updated_at
  from ozon_core
),
canonical_wb as (
  select
    month,month_sku,marketplace,account_id,cabinet,article,sku,product_name,master_category,
    sales,returns,net_sales,sold_units,economic_units,
    commission,logistics,allocated_logistics,storage,allocated_storage,
    promotion,allocated_promotion,other,allocated_other,allocated_commission,
    net_compensation_amount,preliminary_compensation,final_with_compensation,
    is_closed,updated_at
  from wb_core
),
canonical_yandex as (
  select
    month,month_sku,marketplace,account_id,cabinet,article,sku,product_name,master_category,
    sales,returns,net_sales,sold_units,economic_units,
    commission,logistics,allocated_logistics,storage,allocated_storage,
    promotion,allocated_promotion,other,allocated_other,allocated_commission,
    net_compensation_amount,preliminary_compensation,final_with_compensation,
    is_closed,updated_at
  from yandex_core
),
legacy_base as (
  select
    s.month_date as month,
    s.month as month_key,
    s.marketplace,
    s.cabinet as account_id,
    s.cabinet,
    s.canonical_sku as article,
    s.canonical_sku as sku,
    s.product_name,
    s.master_category,
    coalesce(s.sales,0)::numeric as sales,
    coalesce(s.returns,0)::numeric as returns,
    coalesce(s.net_sales,0)::numeric as net_sales,
    coalesce(s.sold_units,0)::numeric as sold_units,
    coalesce(s.direct_net_received,0)::numeric as direct_net_received,
    coalesce(s.commission,0)::numeric as src_commission,
    coalesce(s.logistics,0)::numeric as src_logistics,
    coalesce(s.storage,0)::numeric as src_storage,
    coalesce(s.promotion,0)::numeric as src_promotion,
    coalesce(s.compensation,0)::numeric as src_compensation,
    coalesce(s.other,0)::numeric as src_other
  from public.orange_monthly_dev_sku s
  where s.finance_status='actual'
    and s.canonical_sku is not null
    and s.canonical_sku<>''
    and not (s.marketplace='OZON' and exists (select 1 from ozon_months cm where cm.month=s.month_date))
    and not (s.marketplace='WB' and exists (select 1 from wb_months cm where cm.month=s.month_date))
    and not (s.marketplace='YANDEX' and exists (select 1 from yandex_months cm where cm.month=s.month_date))
),
legacy_rows as (
  select
    b.month,
    (b.month_key||'|'||b.marketplace||'|'||b.cabinet||'|'||b.article) as month_sku,
    b.marketplace,b.account_id,b.cabinet,b.article,b.sku,b.product_name,b.master_category,
    b.sales,b.returns,b.net_sales,b.sold_units,b.sold_units as economic_units,
    case when b.marketplace='OZON' then 0::numeric else b.src_commission end as commission,
    case when b.marketplace='OZON' then 0::numeric else b.src_logistics end as logistics,
    0::numeric as allocated_logistics,
    case when b.marketplace='OZON' then 0::numeric else b.src_storage end as storage,
    0::numeric as allocated_storage,
    case when b.marketplace='OZON' then 0::numeric else b.src_promotion end as promotion,
    0::numeric as allocated_promotion,
    case when b.marketplace='OZON' then b.direct_net_received-b.net_sales else b.src_other end as other,
    0::numeric as allocated_other,
    0::numeric as allocated_commission,
    case when b.marketplace='OZON' then 0::numeric else b.src_compensation end as net_compensation_amount,
    case when b.marketplace='OZON' then 0::numeric else b.src_compensation end as preliminary_compensation,
    b.direct_net_received as final_with_compensation,
    false as is_closed,
    now() as updated_at
  from legacy_base b
),
rows as (
  select * from canonical_ozon
  union all select * from canonical_wb
  union all select * from canonical_yandex
  union all select * from legacy_rows
),
months as (
  select
    month,
    sum(sales) sales,
    sum(returns) returns,
    sum(net_sales) net_sales,
    sum(sold_units) sold_units,
    sum(commission+allocated_commission) commission,
    sum(logistics+allocated_logistics) logistics,
    sum(storage+allocated_storage) storage,
    sum(promotion+allocated_promotion) promotion,
    sum(other+allocated_other) other,
    sum(net_compensation_amount) compensation,
    sum(final_with_compensation) ozon_result,
    bool_and(is_closed) is_closed,
    max(updated_at) updated_at
  from rows group by month
),
categories as (
  select
    month,master_category,
    sum(net_sales) sales,
    sum(abs(commission+allocated_commission)+abs(logistics+allocated_logistics)+
        abs(storage+allocated_storage)+abs(promotion+allocated_promotion)+abs(other+allocated_other)) expenses,
    sum(final_with_compensation) ozon_result
  from rows group by month,master_category
),
legacy_expense_rows as (
  select month,month_sku,sku,marketplace,account_id,
         e.expense_code,e.display_name,e.stage,e.allocation_basis,e.amount,
         case when marketplace='OZON' then 'legacy_orange_ozon_fallback' else 'orange_monthly_dev' end as source,
         case when marketplace='OZON' then false else true end as is_exact,
         updated_at
  from legacy_rows
  cross join lateral (
    values
      ('commission_direct'::text,'Комиссия'::text,'direct'::text,'sku'::text,commission),
      ('commission_allocated','Комиссия / shared','allocated','positive_net_sales',allocated_commission),
      ('delivery_direct','Логистика','direct','sku',logistics),
      ('delivery_allocated','Логистика / shared','allocated','positive_net_sales',allocated_logistics),
      ('fbo_direct','FBO / хранение','direct','sku',storage),
      ('fbo_allocated','FBO / хранение shared','allocated','positive_net_sales',allocated_storage),
      ('promotion_direct','Продвижение','direct','sku',promotion),
      ('promotion_allocated','Продвижение / shared','allocated','positive_net_sales',allocated_promotion),
      ('other_direct','Прочие расходы','direct','sku',other),
      ('other_allocated','Прочие / неразнесённые','allocated','positive_net_sales',allocated_other),
      ('compensation','Компенсации','direct','sku',net_compensation_amount)
  ) as e(expense_code,display_name,stage,allocation_basis,amount)
  where e.amount<>0
),
expense_rows as (
  select * from (SELECT ozon_core.month,
    ozon_core.month_sku,
    ozon_core.sku,
    ozon_core.marketplace,
    ozon_core.account_id,
    'commission_direct'::text AS expense_code,
    'Комиссия Ozon'::text AS display_name,
    'direct'::text AS stage,
    'sku'::text AS allocation_basis,
    ozon_core.commission AS amount,
    'canonical_finance_v3'::text AS source,
    true AS is_exact,
    ozon_core.updated_at
   FROM ozon_core
  WHERE ozon_core.commission <> 0::numeric
UNION ALL
 SELECT ozon_core.month,
    ozon_core.month_sku,
    ozon_core.sku,
    ozon_core.marketplace,
    ozon_core.account_id,
    'commission_allocated'::text AS expense_code,
    'Комиссия / shared'::text AS display_name,
    'allocated'::text AS stage,
    'positive_net_sales'::text AS allocation_basis,
    ozon_core.allocated_commission AS amount,
    'canonical_finance_v3'::text AS source,
    false AS is_exact,
    ozon_core.updated_at
   FROM ozon_core
  WHERE ozon_core.allocated_commission <> 0::numeric
UNION ALL
 SELECT ozon_core.month,
    ozon_core.month_sku,
    ozon_core.sku,
    ozon_core.marketplace,
    ozon_core.account_id,
    'delivery_direct'::text AS expense_code,
    'Логистика'::text AS display_name,
    'direct'::text AS stage,
    'sku'::text AS allocation_basis,
    ozon_core.logistics AS amount,
    'canonical_finance_v3'::text AS source,
    true AS is_exact,
    ozon_core.updated_at
   FROM ozon_core
  WHERE ozon_core.logistics <> 0::numeric
UNION ALL
 SELECT ozon_core.month,
    ozon_core.month_sku,
    ozon_core.sku,
    ozon_core.marketplace,
    ozon_core.account_id,
    'delivery_allocated'::text AS expense_code,
    'Логистика / shared'::text AS display_name,
    'allocated'::text AS stage,
    'positive_net_sales'::text AS allocation_basis,
    ozon_core.allocated_logistics AS amount,
    'canonical_finance_v3'::text AS source,
    false AS is_exact,
    ozon_core.updated_at
   FROM ozon_core
  WHERE ozon_core.allocated_logistics <> 0::numeric
UNION ALL
 SELECT ozon_core.month,
    ozon_core.month_sku,
    ozon_core.sku,
    ozon_core.marketplace,
    ozon_core.account_id,
    'fbo_direct'::text AS expense_code,
    'FBO / хранение'::text AS display_name,
    'direct'::text AS stage,
    'sku'::text AS allocation_basis,
    ozon_core.storage AS amount,
    'canonical_finance_v3'::text AS source,
    true AS is_exact,
    ozon_core.updated_at
   FROM ozon_core
  WHERE ozon_core.storage <> 0::numeric
UNION ALL
 SELECT ozon_core.month,
    ozon_core.month_sku,
    ozon_core.sku,
    ozon_core.marketplace,
    ozon_core.account_id,
    'fbo_allocated'::text AS expense_code,
    'FBO / хранение shared'::text AS display_name,
    'allocated'::text AS stage,
    'positive_net_sales'::text AS allocation_basis,
    ozon_core.allocated_storage AS amount,
    'canonical_finance_v3'::text AS source,
    false AS is_exact,
    ozon_core.updated_at
   FROM ozon_core
  WHERE ozon_core.allocated_storage <> 0::numeric
UNION ALL
 SELECT ozon_core.month,
    ozon_core.month_sku,
    ozon_core.sku,
    ozon_core.marketplace,
    ozon_core.account_id,
    'promotion_direct'::text AS expense_code,
    'Продвижение'::text AS display_name,
    'direct'::text AS stage,
    'sku'::text AS allocation_basis,
    ozon_core.promotion AS amount,
    'canonical_finance_v3'::text AS source,
    true AS is_exact,
    ozon_core.updated_at
   FROM ozon_core
  WHERE ozon_core.promotion <> 0::numeric
UNION ALL
 SELECT ozon_core.month,
    ozon_core.month_sku,
    ozon_core.sku,
    ozon_core.marketplace,
    ozon_core.account_id,
    'promotion_allocated'::text AS expense_code,
    'Продвижение / shared'::text AS display_name,
    'allocated'::text AS stage,
    'positive_net_sales'::text AS allocation_basis,
    ozon_core.allocated_promotion AS amount,
    'canonical_finance_v3'::text AS source,
    false AS is_exact,
    ozon_core.updated_at
   FROM ozon_core
  WHERE ozon_core.allocated_promotion <> 0::numeric
UNION ALL
 SELECT ozon_core.month,
    ozon_core.month_sku,
    ozon_core.sku,
    ozon_core.marketplace,
    ozon_core.account_id,
    'other_direct'::text AS expense_code,
    'Прочие расходы'::text AS display_name,
    'direct'::text AS stage,
    'sku'::text AS allocation_basis,
    ozon_core.other AS amount,
    'canonical_finance_v3'::text AS source,
    true AS is_exact,
    ozon_core.updated_at
   FROM ozon_core
  WHERE ozon_core.other <> 0::numeric
UNION ALL
 SELECT ozon_core.month,
    ozon_core.month_sku,
    ozon_core.sku,
    ozon_core.marketplace,
    ozon_core.account_id,
    'other_allocated'::text AS expense_code,
    'Прочие / неразнесённые'::text AS display_name,
    'allocated'::text AS stage,
    'positive_net_sales'::text AS allocation_basis,
    ozon_core.allocated_other AS amount,
    'canonical_finance_v3'::text AS source,
    false AS is_exact,
    ozon_core.updated_at
   FROM ozon_core
  WHERE ozon_core.allocated_other <> 0::numeric
UNION ALL
 SELECT ozon_core.month,
    ozon_core.month_sku,
    ozon_core.sku,
    ozon_core.marketplace,
    ozon_core.account_id,
    'compensation'::text AS expense_code,
    'Компенсации'::text AS display_name,
    'allocated'::text AS stage,
    'positive_net_sales'::text AS allocation_basis,
    ozon_core.net_compensation_amount AS amount,
    'canonical_finance_v3'::text AS source,
    false AS is_exact,
    ozon_core.updated_at
   FROM ozon_core
  WHERE ozon_core.net_compensation_amount <> 0::numeric) ozon_expenses
  union all
  select * from (SELECT wb_core.month,
    wb_core.month_sku,
    wb_core.sku,
    wb_core.marketplace,
    wb_core.account_id,
    e.expense_code,
    e.display_name,
    e.stage,
    e.allocation_basis,
    e.amount,
    'canonical_wb_finance_v1'::text AS source,
    true AS is_exact,
    wb_core.updated_at
   FROM wb_core
     CROSS JOIN LATERAL ( VALUES ('commission_direct'::text,'Комиссия'::text,'direct'::text,'sku'::text,wb_core.commission), ('commission_allocated'::text,'Комиссия / shared'::text,'allocated'::text,'positive_net_sales'::text,wb_core.allocated_commission), ('delivery_direct'::text,'Логистика'::text,'direct'::text,'sku'::text,wb_core.logistics), ('delivery_allocated'::text,'Логистика / shared'::text,'allocated'::text,'net_units'::text,wb_core.allocated_logistics), ('fbo_direct'::text,'FBO / хранение'::text,'direct'::text,'sku'::text,wb_core.storage), ('fbo_allocated'::text,'FBO / хранение shared'::text,'allocated'::text,'net_units'::text,wb_core.allocated_storage), ('promotion_direct'::text,'Продвижение'::text,'direct'::text,'sku'::text,wb_core.promotion), ('promotion_allocated'::text,'Продвижение / shared'::text,'allocated'::text,'positive_net_sales'::text,wb_core.allocated_promotion), ('other_direct'::text,'Прочие расходы'::text,'direct'::text,'sku'::text,wb_core.other), ('other_allocated'::text,'Прочие / shared'::text,'allocated'::text,'positive_net_sales'::text,wb_core.allocated_other), ('compensation'::text,'Компенсации'::text,'direct'::text,'sku'::text,wb_core.net_compensation_amount)) e(expense_code, display_name, stage, allocation_basis, amount)
  WHERE e.amount <> 0::numeric) wb_expenses
  union all
  select * from (SELECT yandex_core.month,
    yandex_core.month_sku,
    yandex_core.sku,
    yandex_core.marketplace,
    yandex_core.account_id,
    e.expense_code,
    e.display_name,
    e.stage,
    e.allocation_basis,
    e.amount,
    'canonical_yandex_balance_v1'::text AS source,
    true AS is_exact,
    yandex_core.updated_at
   FROM yandex_core
     CROSS JOIN LATERAL ( VALUES ('commission_direct'::text,'Комиссия'::text,'direct'::text,'sku'::text,yandex_core.commission), ('commission_allocated'::text,'Комиссия / shared'::text,'allocated'::text,'positive_net_sales'::text,yandex_core.allocated_commission), ('delivery_direct'::text,'Логистика'::text,'direct'::text,'sku'::text,yandex_core.logistics), ('delivery_allocated'::text,'Логистика / shared'::text,'allocated'::text,'net_units'::text,yandex_core.allocated_logistics), ('promotion_direct'::text,'Продвижение'::text,'direct'::text,'sku'::text,yandex_core.promotion), ('promotion_allocated'::text,'Продвижение / shared'::text,'allocated'::text,'positive_net_sales'::text,yandex_core.allocated_promotion), ('other_direct'::text,'Прочие расходы'::text,'direct'::text,'sku'::text,yandex_core.other), ('other_allocated'::text,'Прочие / shared'::text,'allocated'::text,'positive_net_sales'::text,yandex_core.allocated_other), ('compensation'::text,'Компенсации'::text,'direct'::text,'sku'::text,yandex_core.net_compensation_amount)) e(expense_code, display_name, stage, allocation_basis, amount)
  WHERE e.amount <> 0::numeric) yandex_expenses
  union all
  select * from legacy_expense_rows
),
coverage as (
  select min(month) min_month,max(month) max_month from rows
)
select jsonb_build_object(
  'meta',jsonb_build_object(
    'tenant','ORANGE',
    'marketplace','MULTI',
    'version','monthly-v1.5-orange',
    'generated_at',now(),
    'live_min_date',(select min_month from coverage),
    'live_max_date',(select max_month from coverage),
    'note','Orange Monthly Core: Ozon July-September 2026 uses canonical v2 identity and verified Finance ingestion. WB and Yandex are canonical for July-August 2026. September WB remains preliminary through 2026-09-27 due WB Finance API rate limit; September Yandex remains preliminary until full monthly balance including bonus/points is ingested.'
  ),
  'months',coalesce((select jsonb_agg(to_jsonb(m) order by month) from months m),'[]'::jsonb),
  'official_ozon','[]'::jsonb,
  'categories',coalesce((select jsonb_agg(to_jsonb(c) order by month,sales desc) from categories c),'[]'::jsonb),
  'sku',coalesce((select jsonb_agg(to_jsonb(r) order by month,marketplace,net_sales desc) from rows r),'[]'::jsonb),
  'expense_detail',coalesce((select jsonb_agg(to_jsonb(e) order by month,month_sku,expense_code) from expense_rows e),'[]'::jsonb),
  'manual_expenses',coalesce((
    select jsonb_agg(to_jsonb(x) order by month,expense_type)
    from public.monthly_manual_expenses_v1 x where tenant_id='ORANGE'
  ),'[]'::jsonb),
  'unit_costs','[]'::jsonb
);
$function$

