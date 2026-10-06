create or replace view dev21.source_readiness as
 SELECT a.tenant_id,
    a.marketplace,
    a.cabinet,
    a.account_id,
    a.legal_entity_id,
    s.dataset,
    s.required_for_daily,
    s.required_for_intraday,
    s.refresh_interval_minutes,
    r.last_attempt_at,
    r.last_success_at,
    r.source_data_at,
    r.row_count,
    COALESCE(r.status, 'unknown'::text) AS refresh_status,
        CASE
            WHEN NOT s.enabled THEN 'disabled'::text
            WHEN r.last_success_at IS NULL THEN 'missing'::text
            WHEN (now() - r.last_success_at) > make_interval(mins => s.refresh_interval_minutes) THEN 'stale'::text
            WHEN COALESCE(r.status, 'unknown'::text) = 'error'::text THEN 'error'::text
            ELSE 'ready'::text
        END AS readiness
   FROM dev21.marketplace_accounts a
     JOIN dev21.account_sources s ON s.account_id = a.account_id
     LEFT JOIN dev21.source_refresh_status r ON r.account_id = s.account_id AND r.dataset = s.dataset
  WHERE a.active;
