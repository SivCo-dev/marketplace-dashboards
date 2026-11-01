-- M.Video: some 2025 orders come with updated_at = null (found on first backfill, window 2025-01).
-- The ordering/anti-regression key falls back to created_at, and such rows are flagged so the
-- substitution is never mistaken for a real source update time. The original record stays in payload.
alter table mvideo.orders_fbs add column if not exists updated_at_is_synthetic boolean not null default false;

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

  drop table if exists _src;
  drop table if exists _changed;
  create temp table _src on commit drop as
  select distinct on (x->>'merchant_order_id')
    x->>'merchant_order_id' as merchant_order_id,
    x->>'client_order_id' as client_order_id,
    x->>'product_id' as product_id,
    x->>'offer_id' as offer_id,
    x->>'name' as product_name,
    x->>'status' as status,
    (x->>'created_at')::timestamptz as created_at,
    coalesce((x->>'updated_at')::timestamptz, (x->>'created_at')::timestamptz) as updated_at_source,
    (nullif(x->>'updated_at','') is null) as updated_at_is_synthetic,
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
  order by x->>'merchant_order_id', coalesce((x->>'updated_at')::timestamptz, (x->>'created_at')::timestamptz) desc;

  select v_received - count(*) into v_dup from _src;

  select count(*) into v_stale from _src s join mvideo.orders_fbs o using (merchant_order_id)
   where o.updated_at_source > s.updated_at_source;

  create temp table _changed on commit drop as
  with up as (
    insert into mvideo.orders_fbs as o(merchant_order_id, client_order_id, product_id, offer_id, product_name, status,
      created_at, updated_at_source, updated_at_is_synthetic, shipment_date, market_location_id, price_kop, price_type, currency_code,
      cancelled_at, cancelled_by, payload, payload_hash, run_id)
    select merchant_order_id, client_order_id, product_id, offer_id, product_name, status, created_at,
      updated_at_source, updated_at_is_synthetic, shipment_date, market_location_id, price_kop, price_type, currency_code,
      cancelled_at, cancelled_by, payload, payload_hash, p_run
    from _src
    on conflict (merchant_order_id) do update set
      client_order_id = excluded.client_order_id, product_id = excluded.product_id, offer_id = excluded.offer_id,
      product_name = excluded.product_name, status = excluded.status, created_at = excluded.created_at,
      updated_at_source = excluded.updated_at_source, updated_at_is_synthetic = excluded.updated_at_is_synthetic,
      shipment_date = excluded.shipment_date,
      market_location_id = excluded.market_location_id, price_kop = excluded.price_kop,
      price_type = excluded.price_type, currency_code = excluded.currency_code,
      cancelled_at = excluded.cancelled_at, cancelled_by = excluded.cancelled_by,
      payload = excluded.payload, payload_hash = excluded.payload_hash, last_seen_at = now(), run_id = p_run
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
revoke all on function mvideo.ingest_orders_fbs(bigint, jsonb, jsonb) from public, anon, authenticated;
grant execute on function mvideo.ingest_orders_fbs(bigint, jsonb, jsonb) to service_role;
