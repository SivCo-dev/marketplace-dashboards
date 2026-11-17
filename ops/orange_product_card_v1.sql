-- Orange product card v1: read-only data RPC (applied via migration orange_product_card_v1).
-- Rollback: drop function public.get_orange_product_card_for_user_v1(uuid,text,date);
-- Authoritative definition lives in DB; see pg_get_functiondef. Called by edge function orange-product-card-auth.
-- Returns jsonb: ops (Ozon/Yandex sale/return ops), orders, units_30d, price_history, seller_prices, stock.
-- Access: security.assert_tenant_access_v1(user,'ORANGE','viewer'); SECURITY DEFINER, search_path='', statement_timeout 25s.

-- Added: public.get_orange_stock_summary_v1(uuid) — bulk Ozon stock per SKU for the monthly products table
-- (migration orange_stock_summary_v1; FBS counted once via max, FBO/rFBS summed; u30 = orders units last 30 days).
-- Served by the same edge function with ?stock=1. Rollback: drop function public.get_orange_stock_summary_v1(uuid);
