-- Reverts v2 to v1 behaviour: drop alias table and re-apply 20261108_mvideo_routing_v1.sql (create or replace views).
drop view if exists mvideo.v_unmatched_offers;
drop view if exists mvideo.v_order_routing;
drop view if exists mvideo.v_offer_routing;
drop table if exists mvideo.offer_alias;
-- then run supabase/migrations/20261108_mvideo_routing_v1.sql
