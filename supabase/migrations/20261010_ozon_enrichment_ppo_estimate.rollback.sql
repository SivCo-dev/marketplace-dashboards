-- Restore ozon_enrichment_payload_v3 to the definition saved before the PPO estimate patch, then republish.
do $rb$
declare d text;
begin
  select def into d from dev21.fn_backup_20261010 where name = 'ozon_enrichment_payload_v3_before_ppo';
  if d is null then raise exception 'backup not found'; end if;
  execute d;
end
$rb$;
select dev21.refresh_ozon_enrichment_all_v3();
