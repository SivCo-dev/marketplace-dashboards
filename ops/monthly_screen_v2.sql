create or replace function public.get_monthly_screen_scope_v2(
  p_tenant_id text,
  p_month date,
  p_marketplace text default 'ALL',
  p_account_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_tenant text := upper(btrim(p_tenant_id));
  v_marketplace text := upper(btrim(coalesce(p_marketplace,'ALL')));
begin
  if v_tenant !~ '^[A-Z0-9_-]{1,32}$' then
    raise exception using errcode='22023', message='invalid tenant';
  end if;
  if p_month is null or p_month <> date_trunc('month',p_month)::date then
    raise exception using errcode='22023', message='month must be first day';
  end if;
  if v_marketplace not in ('ALL','OZON','WB','YANDEX') then
    raise exception using errcode='22023', message='invalid marketplace';
  end if;
  if p_account_id is not null and p_account_id !~ '^[A-Za-z0-9_-]{1,96}$' then
    raise exception using errcode='22023', message='invalid account';
  end if;
  if not exists (
    select 1
    from config.marketplace_accounts a
    where a.tenant_id=v_tenant
      and a.active
      and a.monthly_enabled
  ) then
    raise exception using errcode='22023', message='unknown monthly tenant';
  end if;
  if p_account_id is not null and not exists (
    select 1
    from config.marketplace_accounts a
    where a.tenant_id=v_tenant
      and a.account_id=p_account_id
      and a.active
      and a.monthly_enabled
      and (v_marketplace='ALL' or a.marketplace=v_marketplace)
  ) then
    raise exception using errcode='22023', message='unknown monthly account';
  end if;

  return reporting.get_accepted_month_scope_v2(
    v_tenant,p_month,v_marketplace,p_account_id,null
  );
end;
$function$;

revoke all on function public.get_monthly_screen_scope_v2(text,date,text,text) from public, anon, authenticated;
grant execute on function public.get_monthly_screen_scope_v2(text,date,text,text) to service_role;

comment on function public.get_monthly_screen_scope_v2(text,date,text,text) is
  'Stage 6 read-only adapter for the public monthly screen. Callable only by the Edge service role; returns monthly-scope-v2.2.';

