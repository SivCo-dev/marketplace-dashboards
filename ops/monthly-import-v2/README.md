# Monthly upload layer v2

The common Monthly screen exposes **Загрузить файлы**. XLSX/XLS/CSV are parsed by the PIN-protected `monthly-import-v2` Edge Function. It reuses the existing import PIN; its verifier is private in `reporting.monthly_upload_auth_v2`, never in frontend code or this repository.

Flow: file → cabinet/month hints → sheet/header/column mapping → authoritative server preview → explicit apply. Ambiguous cabinet/month remains selected by the user and must be checked. Explicit metadata conflicting with selection blocks processing. Unmatched/ambiguous SKU, unknown categories, missing positive category sales, invalid numbers and failed amount controls block apply.

## Allocation and replacement

- CPR monetary compensation/decompensation: actual SKU.
- Orange/W monetary compensation/decompensation: source SKU's master category, then proportionally to **positive gross sales** in that category, **within the selected Ozon account and financial month**. Allocation rounds by largest remainder with deterministic canonical SKU tie-break; sum equals source cents.
- Compensated/disposed/written-off/returned quantities: actual source SKU, never proportionally spread. Disposal and writeoff quantities contribute to the displayed return/writeoff count. These are operational quantities and do not become a second monetary return or change Finance sale/return/net units.
- A file replaces the entire monthly account component for each mapped field. Missing fields stay untouched. Cells missing inside a mapped field are zero. Totals/footer rows are excluded.
- Decompensation amounts are normalized negative. When only one monetary component is imported, preserve the other component. For an old base with only net compensation, positive/negative net is the fallback split; a file with both components replaces that fallback completely.
- Each field has one active batch pointer. Raw bytes, source rows, distribution, checksum and all batch versions remain separate from immutable prepared Finance sources. No n8n calls occur.
- Reapplying the current identical file is a no-op. Scope locks prevent concurrent apply; stale previews are rejected when either Finance revision/hash or upload revision changed.
- Imported SKU without sales can appear as an operational/expense-only row; unknown SKU is never silently inferred. Zero-sales categories with money are blocked rather than using another account/category as fallback.
- `get_accepted_month_v2` overlays active values at read time; existing scope/cost/business-expense readers recompute results using that layer. Prepared source hashes/rows do not change. The layer revision is independent of the prepared base revision.

## Deployment

Apply `ops/monthly_import_v2.sql`, initialize the private verifier from the established importer (do not change the PIN), deploy the three pinned dependencies/files under `ops/monthly-import-v2/`. The function has custom PIN authentication and `verify_jwt=false`. Only service_role can execute mutation RPCs. RLS is enabled on private tables without public policies. Ten failed PIN attempts in 15 minutes block the client key. The old v1 mutation RPC's direct REST permissions are revoked; the existing PIN-protected v1 Edge continues using service_role.

Source limits: 5 MB, 10,000 rows, 100 columns. Original file is retained server-side with preview/apply history. Do not commit credentials or uploaded business files. Uploading actual files and applying previews is the next user action; synthetic integration checks run inside a rolled-back transaction.

Validation: `node ops/monthly-import-v2/processor.test.mjs`, `npm --prefix monthly-v2 test`, `ops/monthly-import-v2/transaction.test.sql` (always rolls back); live HTTP parsing/preview/history/auth denial; browser layout QA. PIN or category/SKU mapping errors must be corrected before apply.
