#!/usr/bin/env python3
"""Local isolated DB only. Run after migration + transactional SQL suites.
Uses separate psql processes to test lock contention and simultaneous builders.
Does not ingest data, invoke n8n, or send messages. Restores source changes.
"""
import json, os, pathlib, subprocess, time

if os.environ.get('LIVE_TEST_ALLOW_WRITES') != 'isolated-local':
    raise SystemExit('Set LIVE_TEST_ALLOW_WRITES=isolated-local explicitly.')
if os.environ.get('PGHOST') not in ('127.0.0.1', 'localhost', '::1'):
    raise SystemExit('This harness only accepts a local PostgreSQL host.')


def sql(query):
    p = subprocess.run(['psql', '-X', '-v', 'ON_ERROR_STOP=1', '-Atq', '-c', query],
                       text=True, capture_output=True, check=True)
    return p.stdout.strip()


def state():
    return json.loads(sql("""select jsonb_build_object('version',snapshot_version,
      'payload_hash',md5(payload::text),'closed_hash',md5((select jsonb_agg(x order by x::text)::text
       from jsonb_array_elements(payload->'daily')x
       where x->>'report_date'<((now() at time zone 'Europe/Moscow')::date)::text)),
      'history',(select count(*) from dev21.dashboard_snapshot_history),
      'published_at',published_at) from dev21.dashboard_snapshots
      where tenant_id='ORANGE' and snapshot_kind='daily-full'"""))


results = []
sql("select dev21.refresh_live_snapshot_v2('ORANGE')")
before = state()
# Same key as the existing full publisher; not a second, incompatible lock.
lock_env = dict(os.environ, PGAPPNAME='orange-live-test-lock')
locker = subprocess.Popen(['psql', '-X', '-v', 'ON_ERROR_STOP=1', '-Atq', '-c',
    "begin;select pg_advisory_xact_lock(hashtext('ORANGE|daily-full'));select pg_sleep(5);rollback;"],
    env=lock_env, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
try:
    deadline = time.monotonic() + 4
    while sql("select exists(select 1 from pg_locks l join pg_stat_activity a using(pid) where l.locktype='advisory' and l.granted and a.application_name='orange-live-test-lock')") != 't':
        if time.monotonic() > deadline:
            raise AssertionError('Lock fixture did not acquire its advisory lock')
        time.sleep(.05)
    started = time.monotonic()
    version = int(sql("select dev21.refresh_live_snapshot_v2('ORANGE')"))
    elapsed = (time.monotonic() - started) * 1000
    assert version == before['version'] and state() == before, 'Busy builder changed fallback'
    assert elapsed < 2000, 'Busy builder queued behind full publisher'
    results.append({'scenario': 'legacy_publisher_lock_fallback', 'elapsed_ms': round(elapsed, 1)})
finally:
    locker.communicate(timeout=10)
    assert locker.returncode == 0

# Force one legitimate changed-source build, then start two builders together.
# Clone local revision only. Production writes are rejected by the host guard.
sql("""insert into raw.ozon_orders_raw overriding system value
 select (jsonb_populate_record(null::raw.ozon_orders_raw,to_jsonb(r)||jsonb_build_object(
 'raw_order_id',(select max(raw_order_id)+1 from raw.ozon_orders_raw),
 'observed_at',clock_timestamp()+interval '1 hour','payload_hash',md5('concurrency-test-revision'),
 'payload',r.payload||jsonb_build_object('quantity',((r.payload->>'quantity')::numeric+1),
 'gross_amount',((r.payload->>'gross_amount')::numeric+1000))))).*
 from raw.ozon_orders_raw r where tenant_id='ORANGE'
 and operational_date=(now() at time zone 'Europe/Moscow')::date
 and payload->>'order_state'<>'cancelled' order by observed_at desc,raw_order_id desc limit 1""")
try:
    calls = [subprocess.Popen(['psql','-X','-v','ON_ERROR_STOP=1','-Atq','-c',
        "select dev21.refresh_live_snapshot_v2('ORANGE')"], text=True,
        stdout=subprocess.PIPE,stderr=subprocess.PIPE) for _ in range(2)]
    versions = []
    for call in calls:
        out, err = call.communicate(timeout=60)
        assert call.returncode == 0, err
        versions.append(int(out.strip()))
    after = state()
    assert after['version'] == before['version'] + 1, 'Concurrent builders published more than once'
    assert after['history'] == before['history'] + 1, 'Concurrent builders duplicated history'
    assert after['closed_hash'] == before['closed_hash'], 'Concurrent build changed closed days'
    assert set(versions).issubset({before['version'],after['version']})
    assert int(sql("select dev21.refresh_live_snapshot_v2('ORANGE')")) == after['version']
    results.append({'scenario':'competing_builders','returned_versions':versions,
                    'effective_publications':1})
finally:
    sql("delete from raw.ozon_orders_raw where payload_hash=md5('concurrency-test-revision')")
    sql("select dev21.refresh_live_snapshot_v2('ORANGE')")

print(json.dumps(results, indent=2))
