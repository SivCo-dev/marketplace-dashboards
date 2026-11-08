-- M.Video routing v2 (after user feedback 2026-11-08):
--  1) explicit alias table (offer_id -> canonical article) instead of blanket case folding;
--     first alias: C01-000W -> C01-000w (ORANGE), confirmed by the user ("регистр не важен в данном случае").
--  2) registry lookup also covers dev23.products (second ORANGE SKU registry) when the article is absent from
--     core.business_products_v2 (found: C01-003w, OS02). core stays the primary source.
-- Still exact-match only; an article found in >1 tenant/registry row is AMBIGUOUS and goes to diagnostics.

create table if not exists mvideo.offer_alias (
  offer_id          text primary key,
  tenant_id         text not null,
  canonical_article text not null,
  note              text,
  created_at        timestamptz not null default now()
);
alter table mvideo.offer_alias enable row level security;
revoke all on mvideo.offer_alias from public, anon, authenticated;
grant select, insert, update, delete on mvideo.offer_alias to service_role;

insert into mvideo.offer_alias(offer_id, tenant_id, canonical_article, note)
values ('C01-000W', 'ORANGE', 'C01-000w', 'letter case only; confirmed by user 2026-11-08')
on conflict (offer_id) do nothing;

drop view if exists mvideo.v_unmatched_offers;
drop view if exists mvideo.v_order_routing;
drop view if exists mvideo.v_offer_routing;

create view mvideo.v_offer_routing as
with offers as (
  select offer_id,
         count(*)                                      as orders_total,
         count(*) filter (where status <> 'CANCELLED') as orders_not_cancelled,
         min(created_at)                               as first_order_at,
         max(created_at)                               as last_order_at,
         max(product_name)                             as product_name
  from mvideo.orders_fbs
  group by offer_id
),
registry as (
  select b.tenant_id, b.canonical_article, b.product_key, b.canonical_name, b.master_category, 'core'::text as registry_source
  from core.business_products_v2 b
  union all
  select p.tenant_id, p.canonical_sku, null::uuid, p.product_name, p.master_category, 'dev23'::text
  from dev23.products p
  where not exists (select 1 from core.business_products_v2 b
                    where b.tenant_id = p.tenant_id and b.canonical_article = p.canonical_sku)
),
lookup as (
  select o.offer_id,
         coalesce(a.canonical_article, o.offer_id) as lookup_article,
         a.tenant_id                               as alias_tenant,
         (a.offer_id is not null)                  as via_alias
  from offers o
  left join mvideo.offer_alias a on a.offer_id = o.offer_id
),
exact as (
  select l.offer_id,
         l.via_alias,
         count(distinct r.tenant_id)             as tenants_found,
         count(*)                                as registry_rows,
         min(r.tenant_id)                        as tenant_id,
         (array_agg(r.product_key))[1]           as product_key,
         min(r.canonical_article)                as canonical_article,
         min(r.canonical_name)                   as canonical_name,
         min(r.master_category)                  as master_category,
         min(r.registry_source)                  as registry_source
  from lookup l
  join registry r on r.canonical_article = l.lookup_article
                 and (l.alias_tenant is null or r.tenant_id = l.alias_tenant)
  group by l.offer_id, l.via_alias
),
near as (
  select o.offer_id,
         string_agg(distinct r.tenant_id || ':' || r.canonical_article, '; ') as candidates
  from offers o
  join registry r on lower(r.canonical_article) = lower(o.offer_id) and r.canonical_article <> o.offer_id
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
       case when e.tenants_found = 1 and e.registry_rows = 1 then e.tenant_id end         as tenant_id,
       case when e.tenants_found = 1 and e.registry_rows = 1 then e.product_key end       as product_key,
       case when e.tenants_found = 1 and e.registry_rows = 1 then e.canonical_article end as canonical_article,
       case when e.tenants_found = 1 and e.registry_rows = 1 then e.canonical_name end    as canonical_name,
       case when e.tenants_found = 1 and e.registry_rows = 1 then e.master_category end   as master_category,
       case when e.tenants_found = 1 and e.registry_rows = 1 then e.registry_source end   as registry_source,
       coalesce(e.via_alias, false)                                                       as via_alias,
       n.candidates as near_miss_candidates
from offers o
left join exact e on e.offer_id = o.offer_id
left join near  n on n.offer_id = o.offer_id;

-- v_order_routing / v_unmatched_offers depend on the column list of v_offer_routing; recreate them on top.
create view mvideo.v_order_routing as
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
       r.registry_source,
       coalesce(p.brand, bm.brand) as brand
from mvideo.orders_fbs ord
join mvideo.v_offer_routing r on r.offer_id = ord.offer_id
left join dev23.products p on p.tenant_id = r.tenant_id and p.canonical_sku = r.canonical_article
left join dev21.orange_brand_map bm on bm.canonical_sku = r.canonical_article;

create view mvideo.v_unmatched_offers as
select offer_id, product_name, orders_total, orders_not_cancelled, first_order_at, last_order_at,
       route_status, near_miss_candidates
from mvideo.v_offer_routing
where route_status <> 'MATCHED';

revoke all on mvideo.v_offer_routing, mvideo.v_order_routing, mvideo.v_unmatched_offers from public, anon, authenticated;
grant select on mvideo.v_offer_routing, mvideo.v_order_routing, mvideo.v_unmatched_offers to service_role;
