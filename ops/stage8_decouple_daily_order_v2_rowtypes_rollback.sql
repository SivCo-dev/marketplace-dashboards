-- Rollback for stage8_decouple_daily_order_v2_rowtypes.sql.
-- Restores the prior jsonb_populate_record(...legacy table row type) definitions.
-- This reintroduces pg_depend links to the four legacy tables; it does not alter their data.

CREATE OR REPLACE VIEW core.daily_orders_w_v2 WITH (security_invoker=true) AS
SELECT r.*
FROM (
  SELECT DISTINCT ON (o.tenant_id,o.account_id,o.posting_number,o.line_item_key) o.payload
  FROM raw.ozon_orders_raw o
  WHERE o.tenant_id='W' AND o.account_id='ozon_w'
  ORDER BY o.tenant_id,o.account_id,o.posting_number,o.line_item_key,o.observed_at DESC,o.ingested_at DESC,o.raw_order_id DESC
) x
CROSS JOIN LATERAL jsonb_populate_record(NULL::public.orders_raw,x.payload) r;

CREATE OR REPLACE VIEW core.daily_orders_cpr_v2 WITH (security_invoker=true) AS
SELECT r.*
FROM (
  SELECT DISTINCT ON (o.tenant_id,o.account_id,o.posting_number,o.line_item_key) o.payload
  FROM raw.ozon_orders_raw o
  WHERE o.tenant_id='CPR' AND o.account_id='ozon_cpr'
  ORDER BY o.tenant_id,o.account_id,o.posting_number,o.line_item_key,o.observed_at DESC,o.ingested_at DESC,o.raw_order_id DESC
) x
CROSS JOIN LATERAL jsonb_populate_record(NULL::public.cpr_orders_raw,x.payload) r;

CREATE OR REPLACE VIEW core.daily_orders_orange_ozon_v2 WITH (security_invoker=true) AS
SELECT r.*
FROM (
  SELECT DISTINCT ON (o.tenant_id,o.account_id,o.posting_number,o.line_item_key) o.payload
  FROM raw.ozon_orders_raw o
  WHERE o.tenant_id='ORANGE'
  ORDER BY o.tenant_id,o.account_id,o.posting_number,o.line_item_key,o.observed_at DESC,o.ingested_at DESC,o.raw_order_id DESC
) x
CROSS JOIN LATERAL jsonb_populate_record(NULL::public.orange_orders_raw,x.payload) r;

CREATE OR REPLACE VIEW core.daily_orders_orange_marketplace_v2 WITH (security_invoker=true) AS
SELECT r.*
FROM core.marketplace_order_current_v2 x
CROSS JOIN LATERAL jsonb_populate_record(NULL::public.orange_marketplace_orders_raw_1x,x.payload) r
WHERE x.tenant_id='ORANGE';
