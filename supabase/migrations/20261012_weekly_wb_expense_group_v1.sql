-- Weekly expense groups for WB (ORANGE only, where WB cabinets exist).
-- Mirrors the classification logic already used by monthly_orange_wb_core_v1
-- (seller_oper_name based commission/logistics/fbo/promotion/other split),
-- just grouped by ISO week instead of calendar month, and without the
-- per-SKU direct/shared allocation split (not needed: the weekly report's
-- group-level contract only needs totals per account+week+group).
--
-- Verified against monthly_orange_wb_core_v1 for August 2026: matches to
-- rounding (<0.15 RUB) on all four WB cabinets across all five expense
-- groups; sales/returns match exactly. sales/returns are required here
-- even though they are not "expenses" — the weekly front-end's default
-- view (no master-category filter) computes net sales from these same
-- group rows, not from SKU-level data, so without them net sales (and
-- every % figure) would be zero for WB.
--
-- Scope note: no SKU-level weekly view for WB yet (no price-review table,
-- no group-vs-SKU reconciliation) — that is a separate, later iteration.
-- Yandex is out of scope entirely: its finance sources only arrive at
-- month grain, so there is no weekly figure to compute yet.

create or replace view public.weekly_wb_expense_group_v1 as
with r as (
  select
    'ORANGE'::text as tenant_id,
    case w.cabinet
      when 'IPCH' then 'wb_orange_ipch'
      when 'IPP'  then 'wb_orange_ipp'
      when 'IPT'  then 'wb_orange_ipt'
      when 'PSK'  then 'wb_orange_psk'
      else null
    end as account_id,
    date_trunc('week', w.report_date::timestamp)::date as week_start,
    w.seller_oper_name,
    coalesce(nullif(w.source_payload->>'quantity','')::numeric,0) as qty,
    coalesce(nullif(w.source_payload->>'retailPriceWithDisc','')::numeric,0) as cabinet_price,
    coalesce(nullif(w.source_payload->>'commissionPercent','')::numeric,0) as commission_percent,
    coalesce(nullif(w.source_payload->>'deliveryService','')::numeric,0) as delivery_service,
    coalesce(nullif(w.source_payload->>'rebillLogisticCost','')::numeric,0) as rebill_logistic,
    coalesce(nullif(w.source_payload->>'paidStorage','')::numeric,0) as paid_storage,
    coalesce(nullif(w.source_payload->>'paidAcceptance','')::numeric,0) as paid_acceptance,
    coalesce(nullif(w.source_payload->>'penalty','')::numeric,0) as penalty,
    coalesce(nullif(w.source_payload->>'deduction','')::numeric,0) as deduction,
    coalesce(nullif(w.source_payload->>'cashbackAmount','')::numeric,0) as cashback_amount,
    coalesce(nullif(w.source_payload->>'cashbackDiscount','')::numeric,0) as cashback_discount,
    coalesce(nullif(w.source_payload->>'cashbackCommissionChange','')::numeric,0) as cashback_commission_change,
    coalesce(nullif(w.source_payload->>'acquiringFee','')::numeric,0) as acquiring_fee,
    coalesce(nullif(w.source_payload->>'ppvzReward','')::numeric,0) as pvz_reward
  from orange_wb_finance_raw_1x w
  where w.report_date >= date '2026-07-06'
), x as (
  select r.*,
    (case
      when seller_oper_name = 'Продажа' then -(cabinet_price * greatest(qty,1) * commission_percent / 100 + acquiring_fee)
      when seller_oper_name = 'Возврат' then (cabinet_price * greatest(qty,1) * commission_percent / 100 + acquiring_fee)
      else 0
    end
    + case when seller_oper_name = 'Штраф' then -penalty else 0 end
    + case when seller_oper_name = 'Возмещение за выдачу и возврат товаров на ПВЗ' then pvz_reward else 0 end) as commission_amt,
    -(delivery_service + rebill_logistic + paid_acceptance) as logistics_amt,
    -paid_storage as fbo_amt,
    (case
      when seller_oper_name = 'Компенсация скидки по программе лояльности' then abs(cashback_discount)
      when seller_oper_name = 'Стоимость участия в программе лояльности' then -abs(cashback_commission_change)
      when seller_oper_name = 'Сумма баллов, удержанных за покупку товаров' then -abs(cashback_amount)
      else 0
    end) as promotion_amt,
    (case when seller_oper_name = 'Удержание' then -deduction else 0 end) as other_amt,
    (case when seller_oper_name = 'Продажа' then cabinet_price * greatest(qty,1) else 0 end) as sales_amt,
    (case when seller_oper_name = 'Возврат' then -(cabinet_price * greatest(qty,1)) else 0 end) as returns_amt
  from r
)
select tenant_id, account_id, week_start, week_start + 6 as week_end, g.expense_group, sum(g.amount) as amount, count(*) as lines
from x
cross join lateral (values
  ('sales', x.sales_amt),
  ('returns', x.returns_amt),
  ('commission', x.commission_amt),
  ('logistics', x.logistics_amt),
  ('fbo', x.fbo_amt),
  ('promotion', x.promotion_amt),
  ('other', x.other_amt)
) as g(expense_group, amount)
where account_id is not null
group by tenant_id, account_id, week_start, g.expense_group;
