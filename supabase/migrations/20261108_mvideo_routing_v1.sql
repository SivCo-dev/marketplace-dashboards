-- M.Video: routing of orders to tenants (ORANGE / W / CPR) by canonical article.
-- Rules: exact match of M.Video offer_id to core.business_products_v2.canonical_article (no case folding,
-- same as the project's canonical SKU resolver). An offer found in more than one tenant is AMBIGUOUS and goes to
-- diagnostics, never guessed. A near-miss (differs only by letter case) is shown as a candidate, not applied.
-- Read-only views over core + mvideo; nothing in core/raw/live tables is changed.

create or replace view mvideo.v_offer_routing as
with offers as (
  select offer_id,
         count(*)                                   as orders_total,
         count(*) filter (where status <> 'CANCELLED') as orders_not_cancelled,
         min(created_at)                            as first_order_at,
         max(created_at)                            as last_order_at,
         max(product_name)                          as product_name
  from mvideo.orders_fbs
  group by offer_id
),
exact as (
  select o.offer_id,
         count(distinct b.tenant_id)  as tenants_found,
         count(*)                     as registry_rows,
         min(b.tenant_id)             as tenant_id,
         (array_agg(b.product_key))[1] as product_key,
         min(b.canonical_article)     as canonical_article,
         min(b.canonical_name)        as canonical_name,
         min(b.master_category)       as master_category
  from offers o
  join core.business_products_v2 b on b.canonical_article = o.offer_id
  group by o.offer_id
),
near as (
  select o.offer_id,
         string_agg(distinct b.tenant_id || ':' || b.canonical_article, '; ') as candidates
  from offers o
  join core.business_products_v2 b
    on lower(b.canonical_article) = lower(o.offer_id) and b.canonical_article <> o.offer_id
  group by o.offer_id
)
select o.offer_id,
       o.product_name,
       o.orders_total,
       o.orders_not_cancelled,
       o.first_order_at,
       o.last_order_at,
       case
         when e.offer_id is null and n.offer_id is null then 'UNMATCHED'
         when e.offer_id is null then 'UNMATCHED_CASE_CANDIDATE'
         when e.tenants_found > 1 or e.registry_rows > 1 then 'AMBIGUOUS'
         else 'MATCHED'
       end as route_status,
       case when e.tenants_found = 1 and e.registry_rows = 1 then e.tenant_id end as tenant_id,
       case when e.tenants_found = 1 and e.registry_rows = 1 then e.product_key end as product_key,
       case when e.tenants_found = 1 and e.registry_rows = 1 then e.canonical_article end as canonical_article,
       case when e.tenants_found = 1 and e.registry_rows = 1 then e.canonical_name end as canonical_name,
       case when e.tenants_found = 1 and e.registry_rows = 1 then e.master_category end as master_category,
       n.candidates as near_miss_candidates
from offers o
left join exact e on e.offer_id = o.offer_id
left join near  n on n.offer_id = o.offer_id;

create or replace view mvideo.v_order_routing as
select ord.merchant_order_id,
       ord.offer_id,
       ord.product_id,
       ord.status,
       ord.created_at,
       r.route_status,
       r.tenant_id,
       r.product_key,
       r.canonical_article,
       r.canonical_name,
       r.master_category,
       coalesce(p.brand, bm.brand) as brand
from mvideo.orders_fbs ord
join mvideo.v_offer_routing r on r.offer_id = ord.offer_id
left join dev23.products p on p.tenant_id = r.tenant_id and p.canonical_sku = r.canonical_article
left join dev21.orange_brand_map bm on bm.canonical_sku = r.canonical_article;

create or replace view mvideo.v_unmatched_offers as
select offer_id, product_name, orders_total, orders_not_cancelled, first_order_at, last_order_at,
       route_status, near_miss_candidates
from mvideo.v_offer_routing
where route_status <> 'MATCHED';

revoke all on mvideo.v_offer_routing, mvideo.v_order_routing, mvideo.v_unmatched_offers from public, anon, authenticated;
grant select on mvideo.v_offer_routing, mvideo.v_order_routing, mvideo.v_unmatched_offers to service_role;
