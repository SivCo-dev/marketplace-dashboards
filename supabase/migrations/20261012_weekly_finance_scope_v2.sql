-- Weekly finance scope v2: adds WB alongside Ozon.
-- Additive only — v1 functions and the Ozon-only contract keep working
-- unchanged for any caller still on them.
--
-- New in v2:
--   * 'marketplaces': which marketplaces have weekly data for this tenant
--     (today: always OZON, plus WB when the tenant has WB cabinets — only
--     ORANGE right now).
--   * 'accounts' / 'groups' now union weekly_ozon_expense_group_v2 and
--     weekly_wb_expense_group_v1.
--   * 'types' / 'cats' / 'skus' are unchanged: Ozon-only. WB has no
--     SKU-level weekly view yet (see 20261012_weekly_wb_expense_group_v1.sql).
--
-- Verified: for ORANGE, the Ozon-only slice of v2's 'groups' is byte-identical
-- to v1's full 'groups' output (424/424 rows, same set). W/CPR get
-- marketplaces=["OZON"] only, accounts unchanged.

create or replace function public.get_weekly_finance_scope_v2(p_tenant_id text, p_account_id text default null)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_tenant text := upper(btrim(p_tenant_id));
  v_from constant date := date '2026-07-06';
  v_out jsonb;
begin
  if v_tenant is null or v_tenant !~ '^[A-Z0-9_-]{1,32}$' then
    raise exception 'invalid tenant' using errcode = '22023';
  end if;
  if p_account_id is not null and p_account_id !~ '^[A-Za-z0-9_-]{1,96}$' then
    raise exception 'invalid account' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'contract_version', 'weekly-finance-v2',
    'tenant_id', v_tenant,
    'from_week', v_from,
    'marketplaces', (
      select coalesce(jsonb_agg(distinct mp), '["OZON"]'::jsonb)
        from (
          select 'OZON'::text mp
          where exists (select 1 from public.weekly_ozon_expense_group_v2 g where g.tenant_id = v_tenant and (p_account_id is null or g.account_id = p_account_id))
          union all
          select 'WB'::text
          where exists (select 1 from public.weekly_wb_expense_group_v1 g where g.tenant_id = v_tenant and (p_account_id is null or g.account_id = p_account_id))
        ) m
    ),
    'accounts', (
      select coalesce(jsonb_agg(distinct a), '[]'::jsonb)
        from (
          select g.account_id a from public.weekly_ozon_expense_group_v2 g where g.tenant_id = v_tenant and (p_account_id is null or g.account_id = p_account_id)
          union
          select g.account_id from public.weekly_wb_expense_group_v1 g where g.tenant_id = v_tenant and (p_account_id is null or g.account_id = p_account_id)
        ) t(a)
    ),
    'groups', (
      select coalesce(jsonb_agg(jsonb_build_array(t.account_id, t.week_start::text, t.expense_group, t.a)), '[]'::jsonb)
        from (
          select g.account_id, g.week_start, g.expense_group, round(sum(g.amount)::numeric, 2) a
            from public.weekly_ozon_expense_group_v2 g
           where g.tenant_id = v_tenant and g.week_start >= v_from
             and (p_account_id is null or g.account_id = p_account_id)
           group by 1, 2, 3
           union all
          select g.account_id, g.week_start, g.expense_group, round(sum(g.amount)::numeric, 2) a
            from public.weekly_wb_expense_group_v1 g
           where g.tenant_id = v_tenant and g.week_start >= v_from
             and (p_account_id is null or g.account_id = p_account_id)
           group by 1, 2, 3
        ) t
    ),
    'types', (select coalesce(jsonb_agg(jsonb_build_array(t.account_id, t.week_start::text, t.expense_group, t.type_id, t.nosku, t.a, t.lbl)), '[]'::jsonb)
                from (select c.account_id, c.week_start, c.expense_group, c.type_id, (c.sku is null)::int nosku,
                             round(sum(c.amount)::numeric, 2) a,
                             (select max(k.ozon_label) from core.ozon_expense_classification k where k.type_id = c.type_id) lbl
                        from public.ozon_finance_classified_v2 c
                       where c.tenant_id = v_tenant and c.line_type in ('item_fee', 'non_item_fee')
                         and c.week_start >= v_from and (p_account_id is null or c.account_id = p_account_id)
                       group by 1, 2, 3, 4, 5) t),
    'cats', (select coalesce(jsonb_agg(jsonb_build_array(t.account_id, t.sku, t.cat, t.art)), '[]'::jsonb)
               from (select distinct on (p.account_id, p.source_marketplace_sku)
                            p.account_id, p.source_marketplace_sku sku, p.effective_master_category cat, p.business_article art
                       from core.marketplace_identity_projection_v2 p
                      where p.marketplace = 'OZON' and p.mapping_status = 'ACTIVE'
                        and (p_account_id is null or p.account_id = p_account_id)
                        and exists (select 1 from raw.ozon_finance_lines_raw r
                                     where r.account_id = p.account_id and r.external_sku::text = p.source_marketplace_sku
                                       and r.tenant_id = v_tenant and r.accounting_date >= v_from)
                      order by p.account_id, p.source_marketplace_sku, p.valid_from desc) t),
    'skus', (select coalesce(jsonb_agg(jsonb_build_array(
                      s.week_start::text, s.sku, round(s.net_sales::numeric, 2),
                      round(s.direct_commission::numeric, 2), round(s.direct_logistics::numeric, 2), round(s.direct_storage::numeric, 2), round(s.direct_promotion::numeric, 2), round(s.direct_other::numeric, 2),
                      round(s.allocated_commission::numeric, 2), round(s.allocated_logistics::numeric, 2), round(s.allocated_storage::numeric, 2), round(s.allocated_promotion::numeric, 2), round(s.allocated_other::numeric, 2),
                      round((s.direct_unmapped + s.allocated_unmapped)::numeric, 2), round(s.total_expense::numeric, 2), round(s.compensation_excluded::numeric, 2),
                      u.sa, u.ra, u.qs, u.qr, round(s.direct_fbo::numeric, 2), round(s.allocated_fbo::numeric, 2), s.account_id)
                    order by s.account_id, s.week_start, s.sku), '[]'::jsonb)
               from public.weekly_ozon_expense_sku_v2 s
               left join (select r.account_id, date_trunc('week', r.accounting_date)::date wk, r.external_sku::text sku,
                                 round(coalesce(sum(r.signed_amount) filter (where r.line_type = 'sale'), 0)::numeric, 2) sa,
                                 round(coalesce(sum(r.signed_amount) filter (where r.line_type = 'return'), 0)::numeric, 2) ra,
                                 coalesce(sum(r.quantity) filter (where r.line_type = 'sale'), 0)::int qs,
                                 coalesce(sum(r.quantity) filter (where r.line_type = 'return'), 0)::int qr
                            from raw.ozon_finance_lines_raw r
                           where r.tenant_id = v_tenant and r.accounting_date >= v_from
                             and (p_account_id is null or r.account_id = p_account_id)
                           group by 1, 2, 3) u
                 on u.account_id = s.account_id and u.wk = s.week_start and u.sku = s.sku
              where s.tenant_id = v_tenant and s.week_start >= v_from
                and (p_account_id is null or s.account_id = p_account_id)),
    'generated_at', now()
  ) into v_out;
  return v_out;
end
$function$;

create or replace function public.get_weekly_finance_scope_for_user_v2(p_user_id uuid, p_tenant_id text, p_account_id text default null)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
begin
  perform security.assert_tenant_access_v1(p_user_id, p_tenant_id, 'viewer');
  return public.get_weekly_finance_scope_v2(p_tenant_id, p_account_id);
end
$function$;

revoke all on function public.get_weekly_finance_scope_v2(text, text) from public, anon, authenticated;
revoke all on function public.get_weekly_finance_scope_for_user_v2(uuid, text, text) from public, anon, authenticated;
grant execute on function public.get_weekly_finance_scope_v2(text, text) to postgres, service_role;
grant execute on function public.get_weekly_finance_scope_for_user_v2(uuid, text, text) to postgres, service_role;
