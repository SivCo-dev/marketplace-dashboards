create or replace view dev21.source_readiness as
select a.tenant_id,a.marketplace,a.cabinet,a.account_id,a.legal_entity_id,
 s.dataset,s.required_for_daily,s.required_for_intraday,s.refresh_interval_minutes,
 greatest(r.last_attempt_at,f.last_success_at) as last_attempt_at,
 f.last_success_at,
 case when f.provenance='v2_published_batch' then f.coverage_end else r.source_data_at end as source_data_at,
 coalesce(f.row_count,r.row_count) as row_count,
 case when f.last_success_at>coalesce(r.last_attempt_at,'-infinity'::timestamptz) then 'success'
      else coalesce(r.status,case when f.last_success_at is not null then 'success' else 'unknown' end) end as refresh_status,
 case when not s.enabled then 'disabled'
      when f.last_success_at is null then 'missing'
      when now()-f.last_success_at>make_interval(mins=>s.refresh_interval_minutes) then 'stale'
      when coalesce(r.status,'unknown')='error' and coalesce(r.last_attempt_at,'-infinity'::timestamptz)>=f.last_success_at then 'error'
      else 'ready' end as readiness
from dev21.marketplace_accounts a
join dev21.account_sources s on s.account_id=a.account_id
left join dev21.source_refresh_status r on r.account_id=s.account_id and r.dataset=s.dataset
left join lateral (
 select * from (
   select r.last_success_at,null::timestamptz coverage_end,r.row_count,'legacy_status'::text provenance
   union all
   select b.published_at,
     ((b.manifest->>'date_to')::date+1)::timestamp at time zone 'Europe/Moscow',
     jsonb_array_length(b.rows_payload)::integer,'v2_published_batch'
   from raw.order_load_batches_v2 b
   where s.dataset='orders' and b.account_id=a.account_id and b.tenant_id=a.tenant_id
     and b.status='PUBLISHED' and b.published_at is not null
   union all
   select w.last_success_at,null::timestamptz,w.row_count::integer,'verified_direct_api'
   from raw.order_source_success_v2 w
   where s.dataset='orders' and a.marketplace='WB' and w.account_id=a.account_id
     and w.provenance='successful_n8n_direct_api'
 ) q where last_success_at is not null
 order by last_success_at desc limit 1
) f on true
where a.active;
