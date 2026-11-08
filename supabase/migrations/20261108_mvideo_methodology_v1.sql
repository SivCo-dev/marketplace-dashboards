-- M.Video methodology v1 (step 4). Read-only views over mvideo.orders_fbs + mvideo.v_order_routing.
-- Rules (agreed with the user):
--  * ordered      : by order CREATION date (Moscow), every order incl. ones cancelled later.
--  * cancelled    : by CANCEL date (from status_history), subtracted on that day, not on the creation day.
--  * delivered    : status DELIVERED only. Date = last source update (approx., flagged), not a real delivery date:
--                   the API has no delivery date.
--  * accepted_wh  : ACCEPTED_AT_WAREHOUSE is shown as its own line, never counted as delivered
--                   (outcome unknown, pending check in the seller cabinet - decision 2026-11-08).
--  * in_progress  : NEW, READY_TO_SHIP.
--  * unknown      : any status not listed above -> needs review, never counted as a sale.
--  * returns, payout/commission, delivery cost: NO DATA in the API -> NULL columns, never zero.
--  * price        : MERCHANT_FINAL_PRICE in rubles (price the customer pays per merchant), NOT a payout.
--  * units        : one FBS record = one order line = 1 unit (assumption, to be confirmed by reconciliation).
--  * UNROUTED     : orders without a tenant match stay in the totals under tenant 'UNROUTED' so numbers still
--                   reconcile with the cabinet; they are never silently assigned.

drop view if exists mvideo.v_daily_metrics;
drop view if exists mvideo.v_order_facts;

create view mvideo.v_order_facts as
select o.merchant_order_id,
       o.client_order_id,
       o.offer_id,
       r.route_status,
       coalesce(r.tenant_id, 'UNROUTED')                       as tenant_id,
       r.canonical_article,
       r.canonical_name,
       r.master_category,
       r.brand,
       o.status,
       case
         when o.status = 'DELIVERED'             then 'delivered'
         when o.status = 'CANCELLED'             then 'cancelled'
         when o.status = 'ACCEPTED_AT_WAREHOUSE' then 'accepted_wh'
         when o.status in ('NEW','READY_TO_SHIP') then 'in_progress'
         else 'unknown'
       end                                                     as status_group,
       1                                                       as units,
       (o.price_kop / 100.0)::numeric(14,2)                    as merchant_price_rub,
       (o.created_at at time zone 'Europe/Moscow')::date       as order_date,
       (o.cancelled_at at time zone 'Europe/Moscow')::date     as cancel_date,
       case when o.status = 'DELIVERED'
            then (o.updated_at_source at time zone 'Europe/Moscow')::date end as delivered_date_approx,
       o.shipment_date at time zone 'Europe/Moscow'            as planned_shipment_at,
       o.cancelled_by,
       o.updated_at_is_synthetic,
       null::numeric                                           as payout_rub,          -- no data in API
       null::numeric                                           as returned_units       -- no data in API
from mvideo.orders_fbs o
join mvideo.v_order_routing r on r.merchant_order_id = o.merchant_order_id;

create view mvideo.v_daily_metrics as
with ordered as (
  select tenant_id, canonical_article, master_category, brand, order_date as day,
         count(*) as ordered_units, sum(merchant_price_rub) as ordered_rub,
         count(*) filter (where status_group = 'accepted_wh')  as accepted_wh_units,
         sum(merchant_price_rub) filter (where status_group = 'accepted_wh') as accepted_wh_rub,
         count(*) filter (where status_group = 'in_progress')  as in_progress_units,
         count(*) filter (where status_group = 'unknown')      as unknown_status_units
  from mvideo.v_order_facts group by 1,2,3,4,5
),
cancelled as (
  select tenant_id, canonical_article, master_category, brand, cancel_date as day,
         count(*) as cancelled_units, sum(merchant_price_rub) as cancelled_rub
  from mvideo.v_order_facts where status_group = 'cancelled' and cancel_date is not null group by 1,2,3,4,5
),
delivered as (
  select tenant_id, canonical_article, master_category, brand, delivered_date_approx as day,
         count(*) as delivered_units, sum(merchant_price_rub) as delivered_rub
  from mvideo.v_order_facts where status_group = 'delivered' group by 1,2,3,4,5
),
keys as (
  select tenant_id, canonical_article, master_category, brand, day from ordered
  union select tenant_id, canonical_article, master_category, brand, day from cancelled
  union select tenant_id, canonical_article, master_category, brand, day from delivered
)
select k.tenant_id, k.canonical_article, k.master_category, k.brand, k.day,
       coalesce(o.ordered_units,0)                                    as ordered_units,
       coalesce(o.ordered_rub,0)                                      as ordered_rub,
       coalesce(c.cancelled_units,0)                                  as cancelled_units,
       coalesce(c.cancelled_rub,0)                                    as cancelled_rub,
       coalesce(o.ordered_units,0) - coalesce(c.cancelled_units,0)    as net_units,
       coalesce(o.ordered_rub,0)   - coalesce(c.cancelled_rub,0)      as net_rub,
       coalesce(d.delivered_units,0)                                  as delivered_units_approx_date,
       coalesce(d.delivered_rub,0)                                    as delivered_rub_approx_date,
       coalesce(o.accepted_wh_units,0)                                as accepted_wh_units,
       coalesce(o.accepted_wh_rub,0)                                  as accepted_wh_rub,
       coalesce(o.in_progress_units,0)                                as in_progress_units,
       coalesce(o.unknown_status_units,0)                             as unknown_status_units,
       null::numeric                                                  as returned_units,
       null::numeric                                                  as payout_rub
from keys k
left join ordered   o on (o.tenant_id,o.canonical_article,o.master_category,o.brand,o.day) is not distinct from (k.tenant_id,k.canonical_article,k.master_category,k.brand,k.day)
left join cancelled c on (c.tenant_id,c.canonical_article,c.master_category,c.brand,c.day) is not distinct from (k.tenant_id,k.canonical_article,k.master_category,k.brand,k.day)
left join delivered d on (d.tenant_id,d.canonical_article,d.master_category,d.brand,d.day) is not distinct from (k.tenant_id,k.canonical_article,k.master_category,k.brand,k.day);

revoke all on mvideo.v_order_facts, mvideo.v_daily_metrics from public, anon, authenticated;
grant select on mvideo.v_order_facts, mvideo.v_daily_metrics to service_role;
