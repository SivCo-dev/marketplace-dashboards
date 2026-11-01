-- Rollback for 20261101_mvideo_raw_v1.sql.
-- The migration only creates the new schema `mvideo`, so rollback removes that schema and nothing else.
drop schema if exists mvideo cascade;
