# Telegram morning readiness recovery — 2026-10-06

Morning report generation failed before Telegram: Orange execution 4280 and W/CPR retries 4281–4286 were blocked by intraday readiness. CPR's first 07:00 check ran before its batch was published.

The gate used dev21.source_refresh_status only. Current Ozon V2 PUBLISHED batches and verified WB ingestion receipts were stored in separate ledgers. Actual morning sources were present while legacy clocks stayed at yesterday evening.

Fix: dev21.source_readiness uses the latest verified success from the legacy status, published V2 order batches, and WB successful_n8n_direct_api receipts. No clocks are fabricated. Newer explicit legacy errors remain blocking; stock sources and required flags are unchanged. Coverage timestamps remain separate from success time. Existing view ACL and schema access are preserved.

Production migration source_readiness_use_verified_order_ingestion applied. All three tenant readiness checks are true. Refresh calls succeeded for W version976, CPR352, Orange135. W/CPR snapshot report totals match the actual accepted live order rows: W 11 units / 178650 RUB; CPR 23 units / 364634 RUB. Orange successful connector call elapsed about42.2s including tool overhead; this is a production full-chain observation, not a SQL-only timer.

No Telegram messages sent during repair. Existing morning claims for 2026-10-05 are absent; missing deliveries are ready for explicit resend authorization. n8n workflows and schedules unchanged. Restore ops/source_readiness_verified_orders.rollback.sql if necessary.
