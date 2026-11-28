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

## Flight cards

Type a flight number on a Flight card and press **Look up**: airline, airports, local times and
duration are filled in for the card's date (you still press *Apply changes*). Everything can also be
typed by hand. The card spans the half-hours the flight covers; the exact local times and an airline
badge (text, not a logo) show on the card.

- The key never reaches the browser: the page calls `GET /api/trip/flight?no=SQ246&date=…` and the
  Worker calls AeroDataBox (`infra/trip-worker.js`). Editors only.
- Quota protection: results are cached 24 h in D1 (repeats are free), at most `flight_daily_cap`
  (default 5) and `flight_monthly_cap` (default 150) live lookups, and a failed cap never calls the provider.
- **Needs an AeroDataBox key.** An AviationStack key will not work (different API). Set
  `flight_api_key` (and `flight_api_gateway` = `apimarket` or `rapidapi`) in the gitignored
  `infra/terraform.tfvars`, then `terraform apply`. Without a key the Look up button explains that
  it is not set up and the card is a plain form.
- The response parser follows AeroDataBox's documented schema but has not been checked against a
  recorded live response. After the first real lookup, compare the card with the airline's site and
  save the raw JSON as a test fixture (see `scripts/fake-upstreams.mjs`).

## Stay cards

Hotel cards now carry brand, room type, guests, price per night and currency, confirmation number,
booking link (https only) and a booked tick; the card shows brand, nights and price.

Photos: **Find a photo** searches Wikipedia lead images by brand/name through the Worker and lists
only files that are on Wikimedia Commons under a free licence, with author and licence credit.
**Upload photo** shrinks your own image to ≤480 px (≈60 KB) and stores it in the plan. Pasting an
arbitrary image URL is deliberately not offered: the CSP allows only uploads and Wikimedia thumbnails.
Chain logos are mostly non-free, so brand-only searches often find nothing; upload one instead.

## Testing without spending API quota

`npm run test:unit` and `npm run test:trip` use offline fakes (`scripts/fake-upstreams.mjs`) for the
flight API and Wikipedia; nothing in either suite makes a network call to a provider. The dev server
does the same unless you opt in with `TRIP_LIVE_UPSTREAMS=1 FLIGHT_API_KEY=… npm run dev:trip`.
Wikimedia thumbnails are stubbed in the browser tests.
