-- PPO (pay-per-order) per-SKU estimate in Ozon enrichment v3.
-- Daily spend of Ozon campaigns that have no per-SKU statistics (CPC SKU campaigns excluded)
-- is allocated to SKUs by that day's Ozon turnover share. Dates covered by W manual PPO periods are skipped.
-- Backup of the previous function body is stored in dev21.fn_backup_20261010 (20261010_ozon_enrichment_ppo_estimate.rollback.sql).
create table if not exists dev21.fn_backup_20261010 (name text primary key, saved_at timestamptz not null default now(), def text not null);
insert into dev21.fn_backup_20261010(name, def)
values ('ozon_enrichment_payload_v3_before_ppo', pg_get_functiondef('dev21.ozon_enrichment_payload_v3(text,date)'::regprocedure))
on conflict (name) do nothing;

do $mig$
declare d text; m1 text; m2 text; m3 text; m4 text;
begin
  d := pg_get_functiondef('dev21.ozon_enrichment_payload_v3(text,date)'::regprocedure);
  if position('ppo_alloc' in d) > 0 then raise notice 'already patched'; return; end if;
  m1 := E'\nads as (\n';
  m2 := E'    group by 1, 2, 3, 4\n  ) a\n),\nads_campaigns';
  if position(m1 in d) = 0 or position(m2 in d) = 0 then raise exception 'markers not found'; end if;
  d := replace(d, m1, E'\n-- 6b. Pay-per-order estimate: campaigns without per-SKU stats, allocated by daily Ozon turnover share\n'
    || E'ppo_day as materialized (\n'
    || E'  select c.date d, sum(c.spend) spend\n'
    || E'  from (\n'
    || E'    select date, campaign_id::text campaign_id, spend from public.w_ozon_ads_daily where upper(p_tenant) = ''W''\n'
    || E'    union all\n'
    || E'    select date, campaign_id::text, spend from public.cpr_ozon_ads_daily where upper(p_tenant) = ''CPR''\n'
    || E'  ) c\n'
    || E'  where c.date >= p_today - 45 and c.spend > 0\n'
    || E'    and not exists (select 1 from public.ozon_ads_sku_daily_v1 s where s.tenant_id = upper(p_tenant) and s.campaign_id::text = c.campaign_id)\n'
    || E'    and not (upper(p_tenant) = ''W'' and exists (select 1 from public.w_ozon_cpc_sku_daily_v1 s where s.campaign_id::text = c.campaign_id))\n'
    || E'    and not (upper(p_tenant) = ''W'' and exists (select 1 from public.w_ozon_ads_sku_period_v1 p where c.date between p.period_start and p.period_end))\n'
    || E'  group by 1\n'
    || E'),\n'
    || E'ppo_gmv as materialized (\n'
    || E'  select (x->>''report_date'')::date d, x->>''cabinet'' cabinet, x->>''sku'' sku, sum((x->>''gmv'')::numeric) gmv\n'
    || E'  from dev21.dashboard_snapshots s, jsonb_array_elements(s.payload->''sku_daily'') x\n'
    || E'  where s.tenant_id = upper(p_tenant) and s.snapshot_kind = ''daily-full'' and s.is_complete\n'
    || E'    and coalesce(x->>''marketplace'', ''OZON'') = ''OZON'' and (x->>''report_date'')::date in (select d from ppo_day)\n'
    || E'  group by 1, 2, 3\n'
    || E'  having sum((x->>''gmv'')::numeric) > 0\n'
    || E'),\n'
    || E'ppo_alloc as (\n'
    || E'  select g.cabinet, coalesce(i.article, da.offer_id, g.sku) offer_id, g.d,\n'
    || E'    round(p.spend * g.gmv / sum(g.gmv) over (partition by g.d), 2) spend\n'
    || E'  from ppo_gmv g\n'
    || E'  join ppo_day p on p.d = g.d\n'
    || E'  left join items i on i.cabinet = g.cabinet and i.sku = g.sku\n'
    || E'  left join dims_art da on da.cabinet = g.cabinet and da.sku = g.sku\n'
    || E'),\n'
    || E'ads as (\n');
  m3 := E'    ''reference_month_status'', (select j#>>''{period_state,status}'' from mon_src)\n  ),';
  if position(m3 in d) = 0 then raise exception 'meta marker not found'; end if;
  d := replace(d, m3, E'    ''reference_month_status'', (select j#>>''{period_state,status}'' from mon_src),\n'
    || E'    ''ppo_allocation'', jsonb_build_object(\n'
    || E'      ''method'', ''campaign spend is factual (Ozon); per-SKU split is an estimate by daily Ozon turnover share'',\n'
    || E'      ''spend_total'', (select coalesce(sum(spend), 0) from ppo_day),\n'
    || E'      ''allocated'', (select coalesce(sum(spend), 0) from ppo_alloc),\n'
    || E'      ''unallocated'', (select coalesce(sum(p.spend), 0) from ppo_day p where not exists (select 1 from ppo_gmv g where g.d = p.d)),\n'
    || E'      ''unallocated_days'', (select coalesce(jsonb_agg(p.d order by p.d), ''[]''::jsonb) from ppo_day p where not exists (select 1 from ppo_gmv g where g.d = p.d))\n'
    || E'    )\n  ),');
  m4 := E'''ppo_period:'' || string_agg(distinct source, '','')';
  if position(m4 in d) = 0 then raise exception 'ppo_period marker not found'; end if;
  -- campaign ids of the period report travel in source_type (ppo_period:<source>:<campaign_ids>) so the dashboard can avoid double counting with daily campaign totals
  d := replace(d, m4, E'''ppo_period:'' || string_agg(distinct source, '','') || '':'' || string_agg(distinct campaign_id::text, '','')');
  d := replace(d, m2, E'    group by 1, 2, 3, 4\n'
    || E'    union all\n'
    || E'    select cabinet, offer_id, d, d, spend, null, null, null, null, null, ''ppo_estimate''\n'
    || E'    from ppo_alloc\n'
    || E'  ) a\n),\nads_campaigns');
  execute d;
end
$mig$;
