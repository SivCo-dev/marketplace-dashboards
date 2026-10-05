-- Disconnect the overlay while retaining every uploaded source and its history.
-- The uploader frontend should be removed/disabled together with this rollback.
create or replace function reporting.get_accepted_month_v2(p_tenant text,p_month date,p_revision bigint default null) returns jsonb
language sql stable set search_path='' as $$
 select payload from reporting.monthly_prepared_revision_v2 where tenant_id=p_tenant and month=p_month and (p_revision is null or revision=p_revision) order by revision desc limit 1
$$;
