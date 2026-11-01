-- M.Video Omni-net raw layer, v1.
-- ADDITIVE ONLY: creates the new schema `mvideo`. No existing table, view or function is touched.
-- Source facts verified against the real cabinet on 2026-11-01:
--   * one FBS list record = one order = one product line; no quantity field in the response (1 record is treated as 1 unit, to be confirmed by reconciliation);
--   * money is in kopecks (value/100 = rubles); only price type MERCHANT_FINAL_PRICE is present;
--   * status_history is filled only for CANCELLED orders (cancellation date and initiator are available); delivery date is NOT available;
--   * DBS orders: none in the cabinet; finance (commission, payout, returns): no API methods.

create schema if not exists mvideo;
revoke all on schema mvideo from public, anon, authenticated;
grant usage on schema mvideo to service_role;

-- ---------------------------------------------------------------- load runs
create table if not exists mvideo.load_runs(
  run_id bigint generated always as identity primary key,
  dataset text not null check (dataset in ('orders_fbs','products','prices','stocks')),
  window_from timestamptz,
  window_to timestamptz,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','success','failed')),
  pages int,
  rows_received int,
  rows_changed int,
  total_reported bigint,
  reconciliation text,
  error_text text,
  n8n_execution_id text,
  trigger_kind text
);
-- Guard against parallel runs: at most one running load per dataset.
create unique index if not exists load_runs_one_running_per_dataset
  on mvideo.load_runs(dataset) where status = 'running';

create or replace function mvideo.begin_run(p_dataset text, p_from timestamptz, p_to timestamptz, p_exec text, p_kind text)
returns bigint language plpgsql as $fn$
declare v bigint;
begin
  -- A run that never finished (crashed workflow) must not block loading forever.
  update mvideo.load_runs set status = 'failed', finished_at = now(),
         error_text = 'stale: no finish within 60 minutes'
   where dataset = p_dataset and status = 'running' and started_at < now() - interval '60 minutes';
  begin
    insert into mvideo.load_runs(dataset, window_from, window_to, n8n_execution_id, trigger_kind)
    values (p_dataset, p_from, p_to, p_exec, p_kind) returning run_id into v;
  exception when unique_violation then
    raise exception 'another M.Video % load is already running', p_dataset using errcode = '55P03';
  end;
  return v;
end $fn$;

create or replace function mvideo.finish_run(p_run bigint, p_status text, p_pages int, p_received int,
                                             p_changed int, p_total bigint, p_recon text, p_error text)
returns void language sql as $fn$
  update mvideo.load_runs
     set status = p_status, finished_at = now(), pages = p_pages, rows_received = p_received,
         rows_changed = p_changed, total_reported = p_total, reconciliation = p_recon, error_text = p_error
   where run_id = p_run;
$fn$;

-- ---------------------------------------------------------------- FBS orders (current state + history)
create table if not exists mvideo.orders_fbs(
  merchant_order_id text primary key,
  client_order_id text,
  product_id text,
  offer_id text,
  product_name text,
  status text not null,
  created_at timestamptz not null,
  updated_at_source timestamptz not null,
  shipment_date timestamptz,
  market_location_id text,
  price_kop bigint,            -- MERCHANT_FINAL_PRICE only; NULL when absent (never 0 instead of missing)
  price_type text,
  currency_code text,
  cancelled_at timestamptz,    -- from status_history; the only event date the API gives
  cancelled_by text,
  payload jsonb not null,      -- original record, kept for audit and reprocessing
  payload_hash text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  run_id bigint references mvideo.load_runs(run_id)
);
create index if not exists mvideo_orders_fbs_created_idx on mvideo.orders_fbs(created_at);
create index if not exists mvideo_orders_fbs_status_idx on mvideo.orders_fbs(status);
create index if not exists mvideo_orders_fbs_offer_idx on mvideo.orders_fbs(offer_id);

-- Every observed change of an order (status or update time) is kept, so a status change of an already loaded order is provable.
create table if not exists mvideo.order_versions(
  version_id bigint generated always as identity primary key,
  merchant_order_id text not null,
  observed_at timestamptz not null default now(),
  status text,
  updated_at_source timestamptz,
  payload_hash text,
  run_id bigint
);
create index if not exists mvideo_order_versions_order_idx on mvideo.order_versions(merchant_order_id, observed_at);

create table if not exists mvideo.order_status_events(
  merchant_order_id text not null,
  status text not null,
  changed_at timestamptz not null,
  changed_by text,
  comment text,
  primary key (merchant_order_id, status, changed_at)
);

create or replace function mvideo.ingest_orders_fbs(p_run bigint, p_rows jsonb, p_manifest jsonb)
returns jsonb language plpgsql as $fn$
declare v_expected int; v_inserted int := 0; v_updated int := 0; v_stale int := 0; v_dup int := 0; v_received int;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'rows must be a JSON array'; end if;
  v_received := jsonb_array_length(p_rows);
  v_expected := coalesce((p_manifest->>'received_rows')::int, -1);
  if p_manifest->'complete' is distinct from 'true'::jsonb or v_expected <> v_received then
    raise exception 'incomplete batch: complete=%, manifest rows=%, actual rows=%', p_manifest->'complete', v_expected, v_received;
  end if;

  create temp table _src on commit drop as
  select distinct on (x->>'merchant_order_id')
    x->>'merchant_order_id' as merchant_order_id,
    x->>'client_order_id' as client_order_id,
    x->>'product_id' as product_id,
    x->>'offer_id' as offer_id,
    x->>'name' as product_name,
    x->>'status' as status,
    (x->>'created_at')::timestamptz as created_at,
    (x->>'updated_at')::timestamptz as updated_at_source,
    nullif(x->>'shipment_date','')::timestamptz as shipment_date,
    x->>'market_location_id' as market_location_id,
    (select (p->>'value')::bigint from jsonb_array_elements(coalesce(x->'prices','[]'::jsonb)) p where p->>'price_type' = 'MERCHANT_FINAL_PRICE' limit 1) as price_kop,
    (select p->>'price_type' from jsonb_array_elements(coalesce(x->'prices','[]'::jsonb)) p where p->>'price_type' = 'MERCHANT_FINAL_PRICE' limit 1) as price_type,
    (select p->>'currency_code' from jsonb_array_elements(coalesce(x->'prices','[]'::jsonb)) p where p->>'price_type' = 'MERCHANT_FINAL_PRICE' limit 1) as currency_code,
    (select (h->>'changed_at')::timestamptz from jsonb_array_elements(coalesce(x->'status_history','[]'::jsonb)) h where h->>'status' = 'CANCELLED' order by (h->>'changed_at')::timestamptz desc limit 1) as cancelled_at,
    (select h->>'changed_by' from jsonb_array_elements(coalesce(x->'status_history','[]'::jsonb)) h where h->>'status' = 'CANCELLED' order by (h->>'changed_at')::timestamptz desc limit 1) as cancelled_by,
    x as payload,
    md5(x::text) as payload_hash
  from jsonb_array_elements(p_rows) x
  where nullif(x->>'merchant_order_id','') is not null
  order by x->>'merchant_order_id', (x->>'updated_at')::timestamptz desc;

  select v_received - count(*) into v_dup from _src;

  select count(*) into v_stale from _src s join mvideo.orders_fbs o using (merchant_order_id)
   where o.updated_at_source > s.updated_at_source;

  create temp table _changed on commit drop as
  with up as (
    insert into mvideo.orders_fbs as o(merchant_order_id, client_order_id, product_id, offer_id, product_name, status,
      created_at, updated_at_source, shipment_date, market_location_id, price_kop, price_type, currency_code,
      cancelled_at, cancelled_by, payload, payload_hash, run_id)
    select merchant_order_id, client_order_id, product_id, offer_id, product_name, status, created_at,
      updated_at_source, shipment_date, market_location_id, price_kop, price_type, currency_code,
      cancelled_at, cancelled_by, payload, payload_hash, p_run
    from _src
    on conflict (merchant_order_id) do update set
      client_order_id = excluded.client_order_id, product_id = excluded.product_id, offer_id = excluded.offer_id,
      product_name = excluded.product_name, status = excluded.status, created_at = excluded.created_at,
      updated_at_source = excluded.updated_at_source, shipment_date = excluded.shipment_date,
      market_location_id = excluded.market_location_id, price_kop = excluded.price_kop,
      price_type = excluded.price_type, currency_code = excluded.currency_code,
      cancelled_at = excluded.cancelled_at, cancelled_by = excluded.cancelled_by,
      payload = excluded.payload, payload_hash = excluded.payload_hash, last_seen_at = now(), run_id = p_run
    -- never let an older observation overwrite a newer one; identical payloads are not rewritten
    where excluded.updated_at_source >= o.updated_at_source and excluded.payload_hash <> o.payload_hash
    returning o.merchant_order_id, o.status, o.updated_at_source, o.payload_hash, (xmax = 0) as inserted)
  select * from up;

  select count(*) filter (where inserted), count(*) filter (where not inserted) into v_inserted, v_updated from _changed;

  insert into mvideo.order_versions(merchant_order_id, status, updated_at_source, payload_hash, run_id)
  select merchant_order_id, status, updated_at_source, payload_hash, p_run from _changed;

  insert into mvideo.order_status_events(merchant_order_id, status, changed_at, changed_by, comment)
  select s.merchant_order_id, h->>'status', (h->>'changed_at')::timestamptz, h->>'changed_by', h->>'comment'
  from _src s, jsonb_array_elements(coalesce(s.payload->'status_history','[]'::jsonb)) h
  where nullif(h->>'status','') is not null and nullif(h->>'changed_at','') is not null
  on conflict do nothing;

  return jsonb_build_object('received', v_received, 'duplicates_in_batch', v_dup, 'inserted', v_inserted,
                            'updated', v_updated, 'stale_ignored', v_stale,
                            'unchanged', v_received - v_dup - v_inserted - v_updated - v_stale);
end $fn$;

-- ---------------------------------------------------------------- products, prices, stocks
-- offer_id <-> product_id is NOT one-to-one (verified: one offer_id can have two product_id values).
create table if not exists mvideo.product_mapping(
  product_id text not null,
  offer_id text not null,
  is_archived boolean,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (product_id, offer_id)
);
create index if not exists mvideo_product_mapping_offer_idx on mvideo.product_mapping(offer_id);

create table if not exists mvideo.price_snapshots(
  snapshot_date date not null,
  product_id text not null,
  offer_id text not null,
  price_kop bigint,
  old_price_kop bigint,
  min_price_kop bigint,
  vat text,
  captured_at timestamptz not null default now(),
  primary key (snapshot_date, product_id, offer_id)
);

create table if not exists mvideo.stock_snapshots(
  snapshot_date date not null,
  product_id text not null,
  offer_id text not null,
  location_id text not null,
  stock_count int,
  available_count int,
  captured_at timestamptz not null default now(),
  primary key (snapshot_date, product_id, location_id)
);

create or replace function mvideo.ingest_products(p_run bigint, p_rows jsonb)
returns jsonb language plpgsql as $fn$
declare n int;
begin
  insert into mvideo.product_mapping(product_id, offer_id, is_archived)
  select distinct on (x->>'product_id', x->>'offer_id') x->>'product_id', x->>'offer_id', (x->>'is_archived')::boolean
  from jsonb_array_elements(p_rows) x where nullif(x->>'product_id','') is not null and nullif(x->>'offer_id','') is not null
  on conflict (product_id, offer_id) do update set is_archived = excluded.is_archived, last_seen_at = now();
  get diagnostics n = row_count;
  return jsonb_build_object('upserted', n);
end $fn$;

create or replace function mvideo.ingest_prices(p_run bigint, p_rows jsonb)
returns jsonb language plpgsql as $fn$
declare n int;
begin
  insert into mvideo.price_snapshots(snapshot_date, product_id, offer_id, price_kop, old_price_kop, min_price_kop, vat)
  select distinct on (x->>'product_id', x->>'offer_id') (now() at time zone 'Europe/Moscow')::date, x->>'product_id', x->>'offer_id',
    (x->>'price')::bigint, (x->>'old_price')::bigint, (x->>'min_price')::bigint, x->>'vat'
  from jsonb_array_elements(p_rows) x where nullif(x->>'product_id','') is not null and nullif(x->>'offer_id','') is not null
  on conflict (snapshot_date, product_id, offer_id) do update set price_kop = excluded.price_kop,
    old_price_kop = excluded.old_price_kop, min_price_kop = excluded.min_price_kop, vat = excluded.vat, captured_at = now();
  get diagnostics n = row_count;
  return jsonb_build_object('upserted', n);
end $fn$;

create or replace function mvideo.ingest_stocks(p_run bigint, p_rows jsonb)
returns jsonb language plpgsql as $fn$
declare n int;
begin
  insert into mvideo.stock_snapshots(snapshot_date, product_id, offer_id, location_id, stock_count, available_count)
  select distinct on (x->>'product_id', x->>'location_id') (now() at time zone 'Europe/Moscow')::date, x->>'product_id', x->>'offer_id',
    x->>'location_id', (x->>'count')::int, (x->>'available_count')::int
  from jsonb_array_elements(p_rows) x where nullif(x->>'product_id','') is not null and nullif(x->>'location_id','') is not null
  on conflict (snapshot_date, product_id, location_id) do update set offer_id = excluded.offer_id,
    stock_count = excluded.stock_count, available_count = excluded.available_count, captured_at = now();
  get diagnostics n = row_count;
  return jsonb_build_object('upserted', n);
end $fn$;

-- ---------------------------------------------------------------- read views
create or replace view mvideo.v_orders_fbs as
select merchant_order_id, offer_id, product_id, product_name, status, created_at,
       (created_at at time zone 'Europe/Moscow')::date as order_date,
       updated_at_source, cancelled_at, (cancelled_at at time zone 'Europe/Moscow')::date as cancel_date, cancelled_by,
       price_kop, round(price_kop / 100.0, 2) as price_rub, price_type, currency_code
from mvideo.orders_fbs;

create or replace view mvideo.v_load_status as
select d.dataset,
       (select max(finished_at) from mvideo.load_runs r where r.dataset = d.dataset and r.status = 'success') as last_success_at,
       (select max(started_at) from mvideo.load_runs r where r.dataset = d.dataset) as last_attempt_at,
       (select status from mvideo.load_runs r where r.dataset = d.dataset order by started_at desc limit 1) as last_status,
       (select error_text from mvideo.load_runs r where r.dataset = d.dataset order by started_at desc limit 1) as last_error
from (values ('orders_fbs'), ('products'), ('prices'), ('stocks')) d(dataset);

-- ---------------------------------------------------------------- access: backend only
do $$
declare t text;
begin
  foreach t in array array['load_runs','orders_fbs','order_versions','order_status_events','product_mapping','price_snapshots','stock_snapshots'] loop
    execute format('alter table mvideo.%I enable row level security', t);
    execute format('revoke all on mvideo.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on mvideo.%I to service_role', t);
  end loop;
end $$;
revoke all on mvideo.v_orders_fbs, mvideo.v_load_status from public, anon, authenticated;
grant select on mvideo.v_orders_fbs, mvideo.v_load_status to service_role;
revoke all on all functions in schema mvideo from public, anon, authenticated;
grant execute on all functions in schema mvideo to service_role;
grant usage, select on all sequences in schema mvideo to service_role;
