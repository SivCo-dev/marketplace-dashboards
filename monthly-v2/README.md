# Monthly Dashboard v2 — shadow

Read-only frontend for the `monthly-data-v2` contract.

- Published route: `/monthly-v2/`
- Production `/monthly/` remains unchanged.
- One template serves W and CPR.
- Browser authentication uses Supabase Auth; tenant access is enforced by the API membership model.
- Dashboard reads go directly to `monthly-data-v2`; n8n is not part of the read path.
- September 2026 is rendered from `CLOSED_IMMUTABLE`.
- October 2026 is rendered from `LIVE / SHADOW_CURRENT`.

## Checks

Run the contract checks:

```sh
npm test
```

For local visual QA only, serve the repository root and open:

```text
/monthly-v2/?tenant=W&month=2026-09&demo=1
```

Demo fixtures are enabled only on `localhost` or `127.0.0.1`; the deployed URL always requires authentication and reads the live v2 API.
