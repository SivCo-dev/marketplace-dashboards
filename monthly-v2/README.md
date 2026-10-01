# Monthly v2 / product review
One reusable W/CPR management dashboard at `/monthly-v2/`.

## Current review access
Open the private review link supplied to the reviewer. There is no login/register screen.
The bare URL opens the layout with unavailable values; it does not disclose financial data.

The shadow page decrypts `review.enc.json` locally using an AES-256-GCM key in the URL fragment.
The key is not committed, is not sent in HTTP requests, and is not a Supabase credential.
No Auth users, memberships, functions or policies were changed.
The authenticated production adapter is retained in `auth-api.js`, but is not loaded by the shadow entrypoint.

## Data provenance
This artifact contains the exact payloads returned by the internal contract behind
`monthly-data-v2`: `reporting.get_monthly_api_payload_v2`, extracted in a read-only transaction.
It includes W/CPR September and October 2026, all 57/9 September SKU rows and no fabricated marketplace data.
The export has a visible timestamp and is not a live API session.
October retains LIVE / SHADOW_CURRENT metadata; the export does not close or freeze the actual month.

No economic amounts are reconstructed in JS. Presentation ratios, sorting, filtering and counts are derived from returned values.
ALL means all currently available data (Ozon only); a future multi-marketplace consolidated result must be supplied by the backend.

## Refreshing a bounded review artifact
Keep the authoritative JSON and access file outside the repository. After a read-only contract export:

```sh
node scripts/seal-review.mjs PRIVATE_SOURCE_JSON review.enc.json PRIVATE_OUTPUT_DIRECTORY
```

Only ciphertext is deployed. Share the generated private launcher/link only with reviewers.
The link is a bearer capability for this export. Forwarding it gives the recipient access to this export.
Replace the artifact and key to rotate future access; a previously downloaded/decrypted export cannot be revoked.
There is no claim of server-enforced expiry, user identity, or production authentication.

## Verification
Set `REVIEW_SOURCE` to the private authoritative JSON. The test also reads
`phase5/review-access.private.json` from the enclosing workspace (or set `REVIEW_ACCESS` explicitly).
Then run `npm test`.
Checks cover controls, full SKU-to-account reconciliation, expense-only retention, nulls,
filter/sort behavior, encrypted round-trip and rejection of the wrong key.

## Cutover gate
The current shadow CSP allows same-origin connections only. Before production cutover,
restore the authenticated user flow and explicitly update CSP for the approved Supabase origin and pinned SDK.
Test valid users, missing membership, cross-tenant denial, expired sessions and end-to-end API values.
The export path must not be used as a production authorization replacement.
No cutover is included in Phase 5.1.

See `IMPLEMENTATION_REPORT.md` and `API_GAPS.md`.
