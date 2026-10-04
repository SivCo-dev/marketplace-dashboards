-- Stage 8: remove V2 view dependencies on legacy table row types.
-- Applied in Supabase migration: decouple_daily_order_v2_from_legacy_rowtypes
-- 2026-10-04. This does not delete or disable any legacy table or workflow.

CREATE OR REPLACE VIEW core.daily_orders_w_v2 WITH (security_invoker=true) AS
SELECT r.*
FROM (
  SELECT DISTINCT ON (o.tenant_id,o.account_id,o.posting_number,o.line_item_key) o.payload
  FROM raw.ozon_orders_raw o
  WHERE o.tenant_id='W' AND o.account_id='ozon_w'
  ORDER BY o.tenant_id,o.account_id,o.posting_number,o.line_item_key,o.observed_at DESC,o.ingested_at DESC,o.raw_order_id DESC
) x
CROSS JOIN LATERAL jsonb_to_record(x.payload) AS r(
  posting_number text,sku text,order_id text,order_number text,fulfillment text,status text,order_state text,
  cancel_reason_id integer,cancel_reason text,cancellation_initiator text,created_at timestamptz,order_date date,
  offer_id text,product_name text,quantity integer,price numeric,gross_amount numeric,updated_at timestamptz,
  commission_pct numeric,commission_amount_order numeric
);

CREATE OR REPLACE VIEW core.daily_orders_cpr_v2 WITH (security_invoker=true) AS
SELECT r.*
FROM (
  SELECT DISTINCT ON (o.tenant_id,o.account_id,o.posting_number,o.line_item_key) o.payload
  FROM raw.ozon_orders_raw o
  WHERE o.tenant_id='CPR' AND o.account_id='ozon_cpr'
  ORDER BY o.tenant_id,o.account_id,o.posting_number,o.line_item_key,o.observed_at DESC,o.ingested_at DESC,o.raw_order_id DESC
) x
CROSS JOIN LATERAL jsonb_to_record(x.payload) AS r(
  posting_number text,sku text,order_id text,order_number text,fulfillment text,status text,order_state text,
  cancel_reason_id integer,cancel_reason text,cancellation_initiator text,created_at timestamptz,order_date date,
  offer_id text,product_name text,quantity integer,price numeric,gross_amount numeric,updated_at timestamptz,
  commission_pct numeric,commission_amount_order numeric
);

CREATE OR REPLACE VIEW core.daily_orders_orange_ozon_v2 WITH (security_invoker=true) AS
SELECT r.*
FROM (
  SELECT DISTINCT ON (o.tenant_id,o.account_id,o.posting_number,o.line_item_key) o.payload
  FROM raw.ozon_orders_raw o
  WHERE o.tenant_id='ORANGE'
  ORDER BY o.tenant_id,o.account_id,o.posting_number,o.line_item_key,o.observed_at DESC,o.ingested_at DESC,o.raw_order_id DESC
) x
CROSS JOIN LATERAL jsonb_to_record(x.payload) AS r(
  project text,marketplace text,cabinet text,posting_number text,order_id text,order_number text,fulfillment text,
  status text,order_state text,cancel_reason text,created_at timestamptz,order_date date,sku text,offer_id text,
  product_name text,quantity integer,price numeric(14,2),gross_amount numeric(16,2),updated_at timestamptz,
  commission_pct numeric,commission_amount_order numeric
);

CREATE OR REPLACE VIEW core.daily_orders_orange_marketplace_v2 WITH (security_invoker=true) AS
SELECT r.*
FROM core.marketplace_order_current_v2 x
CROSS JOIN LATERAL jsonb_to_record(x.payload) AS r(
  marketplace text,cabinet text,posting_number text,order_id text,order_number text,fulfillment text,status text,
  order_state text,cancel_reason text,created_at timestamptz,order_date date,sku text,offer_id text,product_name text,
  quantity integer,price numeric(14,2),gross_amount numeric(16,2),customer_price numeric(16,2),
  subsidy numeric(16,2),cashback numeric(16,2),campaign_id text,source_updated_at timestamptz,
  source_payload jsonb,updated_at timestamptz
)
WHERE x.tenant_id='ORANGE';

-- Expected after applying:
-- row counts/hashes:
-- W 2005 / 594794fd05840895ed9302f21bbc3e20
-- CPR 2821 / 0df1ed3dd4b4ac629472283c9d53e16b
-- Orange Ozon 8744 / 6cccf72d487df4ff7be0ab017cf989f8
-- Orange WB/Yandex 2706 / 9e06ee1e4ac7dd2e16fcfbdc59dd99a2
-- pg_depend links from these four views to the four legacy row types: 0.
