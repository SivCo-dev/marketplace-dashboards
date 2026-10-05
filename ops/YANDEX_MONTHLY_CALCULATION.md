# Yandex monthly economic result

Approved 2026-10-05. Formula: delivered buyer cash + credited sales points + actual financial returns − seller-funded services + compensation.

- Services include actual ruble liability (`servicePrice` / placement `totalAmount`) and spent sales points (`netting`).
- Promotional funding (`bonusPaid`, `paymentWithBonuses`) is excluded from seller expenses.
- Ruble loyalty refunds are already included in service files. Point loyalty refunds reduce commission separately.
- Premium is not added again: unused sales points are already part of the result.
- Financial returns follow transaction month and actual delivery; pre-delivery payment reversals reduce the final delivery month's buyer revenue.
- Legal entity and placement contract must match the cabinet. Archives are read by filename, not position.
- An independent delivery export can recover buyer credits missing from the netting transaction window; order/SKU duplicates are excluded.
- SKU-less expenses are assigned only when the order has one unambiguous SKU, otherwise shared. Shared allocation retains numeric precision until display so aggregate totals agree to the kopeck.
- Exact canonical article fallback retains expenses for catalogue articles missing a marketplace alias; fuzzy matching is not used.

Sources: original service and netting reports, plus an independent delivered-order export. Source identifiers and actual financial controls are retained privately in the publication provenance.

Published through new accepted monthly revisions. Existing revisions remain available; other marketplace finance rows are preserved exactly. Future month ingestion must invoke this calculation and pass source controls before preparing a new revision; legacy Yandex workflow summaries are not authoritative.

Validation: `node ops/yandex-monthly-calculation.test.mjs`, existing monthly adapter tests, transactional source controls, unchanged non-Yandex rows, public monthly API reads.
