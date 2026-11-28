# Trip studio: shared plan

`/trip/` keeps your plan in the browser (`localStorage`) and, when the API is available,
shares it with your travel partner through a Worker + D1 database.

## How it behaves

- Every local save is pushed after ~0.8 s. The top bar shows `Shared plan · saved`,
  `Saving…`, `Offline · saved on this device` or `Saved on this device · not shared`.
- The page checks for the other person's changes every 15 s and whenever the tab regains
  focus. A change appears with a toast ("Plan updated by …"); it is held back while you are
  typing in the card editor.
- Writes carry the version they were based on. If you both edited, the server refuses the
  second write (409) and the page asks which version to keep. **Use the shared version**
  keeps yours on the Undo stack; **Keep mine** replaces the shared plan.
- Offline edits stay on the device and are shared on the next visit.
- No API (plain static hosting) or an account that is not an editor: the page works as a
  local-only planner exactly as before.

## Pieces

| File | Role |
| --- | --- |
| `lounge/trip/sync.mjs` | Browser sync (push, poll, conflict dialog) |
| `infra/trip-worker.js` | `GET/PUT /api/trip/plan`: Access JWT check, editor allow-list, compare-and-set write, last 100 versions kept in `trip_history` |
| `infra/trip.tf` | D1 database, Worker, route `<lounge host>/api/trip/*` |
| `lounge/_headers` | CSP now allows `connect-src 'self'` |
| `scripts/trip-dev-server.mjs` | Local server: static files + the real Worker on SQLite |

## Deploy

1. Add your two emails to the (gitignored) `infra/terraform.tfvars`:
   `trip_editors = ["you@example.com", "partner@example.com"]`
2. `cd infra && terraform plan` then `terraform apply`.
3. Deploy the Pages site as usual (the CSP change and `sync.mjs` ship with it).

Other invited Lounge friends can open `/trip/` but get no shared plan (the API answers 403).

## Recover an old version

```sh
npx wrangler d1 execute lounge-trip --remote \
  --command "SELECT version, updated_by, updated_at FROM trip_history ORDER BY version DESC LIMIT 10"
```

## Local development and tests

```sh
npm run dev:trip     # http://127.0.0.1:8787/trip/  (add TRIP_DB=.trip.sqlite to keep data)
npm run test:unit    # model + Worker unit tests (node:test, real SQLite, real RS256 JWTs)
npm run test:trip    # Playwright against the dev server: sync, conflicts, offline, access
```

The dev server replaces Cloudflare Access with an `x-dev-user` request header
(default `owner@local.test`; editors default to `owner@local.test,partner@local.test`).
That bypass exists only in the dev script, never in the deployed Worker.
