# Supabase validation incident — 2026-10-05

## Release status

Blocked. The proposed LIVE SQL migration was not installed, executed or merged.
The complete Supabase runtime validation did not begin and cannot be reported as
passing. Previous local PostgreSQL results remain local results.

## Attempt and evidence

A single `apply_migration` request attempted to build private schemas named
`orange_live_lab_20261005_2349_{raw,core,config,dev21,public}`, copying 32
business/source tables and recreating 12 views and 10 existing functions.
Original tables were SELECT-only sources. Auth users were excluded.
Private schema privileges were revoked and advisory keys had a lab prefix.

Preflight measured a database size of 1,114,270,867 bytes and snapshot history of
581,632,000 bytes, but did not verify filesystem free capacity or WAL headroom.
That was an operational error: namespace and lock isolation do not isolate disk,
WAL, CPU or I/O resources.

The setup request returned:

```
PANIC: 53100: could not write to file "pg_wal/xlogtemp.33816":
No space left on device
```

Postgres logs record this at 2026-10-05 20:56:00.725 UTC, a second WAL disk-full
error at 20:56:15.531 UTC, and recovery restart messages at 20:56:21 UTC.
Two SQL verification attempts returned:

```
FATAL: 57P03: the database system is not accepting connections
DETAIL: Hot standby mode is disabled.
```

The management API still reported ACTIVE_HEALTHY; that does not establish SQL
availability. Transaction abort and lab cleanup cannot yet be verified.
Before the attempt the original refresh function hash was
`9c29d55b6e7658ea28f85eddd73dcfd3` and the proposed ensure helper was absent.

## Recovery requirements

Restore SQL availability through platform disk/recovery controls or Supabase
support. Do not remove application data, snapshots, WAL files or replication
slots as an improvised recovery action. No paid branch or disk expansion was
authorized. The available connector has no disk-resize or filesystem-recovery
operation.

Once connections resume, verify original function hash and helper absence,
inspect whether lab schemas and migration entries survived, remove only lab
objects if present, and verify snapshot/source ingestion availability.
Do not claim rollback, no impact or recovery until verified.

## Revised validation rule

Do not repeat a full clone in the live database. Use an independently provisioned
test instance with verified free disk and WAL headroom, bounded copy batches,
timeouts and capacity monitoring. A same-project private schema is insufficient
resource isolation for this full-size workload.
