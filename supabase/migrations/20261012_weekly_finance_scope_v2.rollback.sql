-- Rollback for 20261012_weekly_finance_scope_v2.sql
-- v1 functions are untouched by the forward migration, so rollback just
-- drops the new v2 functions; the edge function must be redeployed back
-- to calling get_weekly_finance_scope_for_user_v1 first (see
-- supabase/functions/weekly-data-auth-dev/index.ts git history) before
-- this is safe to run, otherwise the function will start erroring.
drop function if exists public.get_weekly_finance_scope_for_user_v2(uuid, text, text);
drop function if exists public.get_weekly_finance_scope_v2(text, text);
