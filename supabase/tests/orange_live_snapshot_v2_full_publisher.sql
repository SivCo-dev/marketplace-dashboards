-- ISOLATED DEVELOPMENT DATABASE ONLY. All writes roll back.
begin;
set local statement_timeout='60s';
create temporary table validation_full_publisher_result(result text,version bigint);
do $test$
declare p jsonb;before_rows jsonb;after_rows jsonb;d date;i int;v bigint;expected jsonb;actual jsonb;
begin
 select payload into p from dev21.dashboard_snapshots where tenant_id='ORANGE' and snapshot_kind='daily-full';
 select max(report_date) into d from dev21.daily_report_closures where tenant_id='ORANGE';
 if d is null then raise exception 'No closed-day fixture';end if;
 select jsonb_agg(x order by x::text) into before_rows from jsonb_array_elements(p->'daily')x where x->>'report_date'=d::text;
 select ord::int-1 into i from jsonb_array_elements(p->'daily') with ordinality t(x,ord) where x->>'report_date'=d::text limit 1;
 p:=jsonb_set(p,array['daily',i::text,'gmv'],to_jsonb(-1234567::numeric));
 p:=jsonb_set(p,'{sku_daily,0,canonical_sku}',to_jsonb('__INVALID_COPIED_MARKER__'::text));
 expected:=dev21.canonicalize_orange_dashboard_payload(p);
 v:=dev21.publish_dashboard_snapshot('ORANGE','daily-full',p,clock_timestamp(),'intraday');
 select payload into actual from dev21.dashboard_snapshots where tenant_id='ORANGE' and snapshot_kind='daily-full';
 select jsonb_agg(x order by x::text) into after_rows from jsonb_array_elements(actual->'daily')x where x->>'report_date'=d::text;
 if before_rows is distinct from after_rows then raise exception 'Full publisher changed closed day';end if;
 if exists(select 1 from jsonb_array_elements(actual->'sku_daily')x where x->>'canonical_sku'='__INVALID_COPIED_MARKER__') then raise exception 'Copied marker bypassed full publisher canonicalization';end if;
 if actual->'dimensions' is distinct from expected->'dimensions' then raise exception 'Full publisher dimensions mismatch';end if;
 insert into validation_full_publisher_result values('full_publisher_closed_day_and_copied_marker_passed',v);
end $test$;
select * from validation_full_publisher_result;
rollback;
