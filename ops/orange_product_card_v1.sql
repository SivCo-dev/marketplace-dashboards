-- Orange product card v1: read-only data RPC (applied via migration orange_product_card_v1).
-- Rollback: drop function public.get_orange_product_card_for_user_v1(uuid,text,date);
-- Authoritative definition lives in DB; see pg_get_functiondef. Called by edge function orange-product-card-auth.
-- Returns jsonb: ops (Ozon/Yandex sale/return ops), orders, units_30d, price_history, seller_prices, stock.
-- Access: security.assert_tenant_access_v1(user,'ORANGE','viewer'); SECURITY DEFINER, search_path='', statement_timeout 25s.

-- Added: public.get_orange_stock_summary_v1(uuid) — bulk Ozon stock per SKU for the monthly products table
-- (migration orange_stock_summary_v1; FBS counted once via max, FBO/rFBS summed; u30 = orders units last 30 days).
-- Served by the same edge function with ?stock=1. Rollback: drop function public.get_orange_stock_summary_v1(uuid);

-- Fix (migrations orange_stock_offer_suffix_variants, orange_card_stock_variants_distinct):
-- Ozon offer_id can carry a variant suffix (e.g. Ri-50TUW+RA+P11, +P01, +M26) while the canonical SKU has none.
-- Stock rows are now mapped to the canonical SKU (exact match first, else strip /\+[A-Za-z]+[0-9]+$/ if that canonical exists),
-- in both get_orange_stock_summary_v1 and the stock block of get_orange_product_card_for_user_v1 (variants kept per offer_id).

-- CORRECTION (migration orange_stock_map_by_ozon_sku): the suffix-stripping rule above was wrong and is superseded.
-- Canonical mapping of Ozon rows is by Ozon numeric sku -> core.orange_identity_source_map_v2 (marketplace='OZON'),
-- falling back to offer_id only when no id match. Example: canonical Ri-50TUW+RA sits in Ozon as offer_id 'Ri-50TU+RA_NEW'
-- (sku 2229759143, 111 pcs FBS); offer 'Ri-50TUW+RA+P11' belongs to canonical 'Ri-50TUW+RA-P11-021'.
-- Applies to stock, orders (30d units/orders) and Ozon price history in get_orange_product_card_for_user_v1,
-- and to get_orange_stock_summary_v1. Result: all 3272 current offers map to a canonical (96 under a different name).
