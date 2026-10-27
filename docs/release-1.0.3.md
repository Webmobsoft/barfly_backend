# Release checklist — Countr 1.0.3

1.0.3 ships together in four parts: this backend, the web panel (`Counter-Owner-Panel`), the customer app (`Countr-Customer`, 1.0.3) and Countr Plus (`Countr-Owner`, 1.0.3). All four are on `feat/dev-v3`. API details: [ordering-api-1.0.3.md](ordering-api-1.0.3.md).

## Read first: old app builds stop working

With the new backend, today's store apps (1.0.2 and older) **cannot order**: every counter comes back with `eventId: null`, and those builds treat that as closed. Countr Plus 1.0.2 cannot load its order list.

The "Please update" screen (`GET /api/app-config` → `minVersion`) is **new in 1.0.3**. Builds already in the stores never ask for it, so raising `minVersion` will not move 1.0.2 users. What protects them is timing:

- Get both 1.0.3 builds approved **before** the backend goes live, and hold them for manual release.
- Release the apps and deploy the backend in the same quiet window.
- Tell restaurant owners to update Countr Plus (it is a small, known group).

From 1.0.3 on, `minVersion` works for the next release.

## Before release day

- [ ] **Store builds.** Bump the build numbers (`version: 1.0.3+N` in each `pubspec.yaml`) above anything already uploaded. Build with `API_BASE_URL=https://countr-plus.ch` in `.env`. Submit the customer app and Countr Plus to both stores with manual release (App Store: "Manually release this version"; Play: managed publishing).
- [ ] **Opening hours for every live restaurant.** Without hours a counter stays closed (`state: no_hours`). Collect each restaurant's weekly hours, prep time and per-slot limit, and prepare one JSON file per restaurant (format in `scripts/set-opening-hours.js`). Dry-run each one against production:
  ```bash
  DB_URI=… DB_NAME=… node scripts/set-opening-hours.js --entity <entityId> --file hours.json --dry-run
  ```
- [ ] **Index report on production** (read-only):
  ```bash
  DB_URI=… DB_NAME=… node scripts/build-indexes.js
  ```
  It lists the indexes to build and any duplicates that block the two new unique indexes (`orders.walleeTransactionId`, `favouriteentities {userId, entityId}`). Resolve duplicates first (keep one document per key).
- [ ] **Web panel build:** `VITE_BASE_URL=https://countr-plus.ch npm run build` in `Counter-Owner-Panel`.

## Release day (quiet hours, in this order)

1. **Back up** the production database.
2. **Build indexes:**
   ```bash
   DB_URI=… DB_NAME=… node scripts/build-indexes.js --apply
   ```
   This builds every missing index and swaps the two plain indexes for unique ones. It refuses the swap and changes nothing if duplicates appear. Re-run it without `--apply`; it should report `0 index change(s) pending`. If you skip this step, the backend still starts and builds the missing indexes itself, but keeps the old non-unique ones.
3. **Deploy the backend** (`pm2 restart COUNTR`). No new environment variables are required. The minute ticker uses the same Redis as before (`REDIS_HOST` / `REDIS_PORT` are optional and default to `127.0.0.1:6379`). Keep a **single** backend process: socket events are sent from the process that handles the change, with no Redis adapter between processes.
4. **Set opening hours** for each restaurant (the commands from the dry-run, without `--dry-run`).
5. **Deploy the web panel** build.
6. **Release both apps** in both stores.
7. **Smoke test** with a test guest and a test restaurant:
   - [ ] Home shows the restaurant with the right pill (open / pre-order / opens …).
   - [ ] Order a pickup slot and pay. The order appears in its slot row on the web board and in Countr Plus without a reload.
   - [ ] Pause for 15 minutes on the web board. The guest pill shows the pause; checkout is blocked. Resume.
   - [ ] Send a message from the ticket. The guest gets a push and a badge, opens the chat and answers. The ticket shows "Answer received".
   - [ ] On another open order, the guest writes first. Countr Plus plays the order alert and the ticket shows "New message".
   - [ ] Mark the order as In Process, Ready, then Completed. The guest's chat turns read-only.
   - [ ] The Wallee webhook still marks orders paid (check the backend log for `Webhook: order … -> WAITING`).

## Behaviour to know

- The order board and its Live / Ready counts show **today's** orders only (from midnight in the venue's timezone, or 6 hours back after midnight). Orders still open from earlier days stay in the database but are no longer on the board. Before release, check production for old open orders (`Waiting` / `In Process` / `Ready`) and close them, or tell the restaurants.

## After release

- Watch the backend log for `Webhook:` errors and socket connection errors for the first hours.
- Once most users are on 1.0.3, set the minimum versions so the next release can force updates:
  ```js
  db.appconfigs.updateOne({ key: "global" }, { $set: {
    "minVersion.customer.ios": "1.0.3", "minVersion.customer.android": "1.0.3",
    "minVersion.countrPlus.ios": "1.0.3", "minVersion.countrPlus.android": "1.0.3" } }, { upsert: true })
  ```

## Rollback

- **Backend:** redeploy the previous build. The new indexes and fields are harmless to it, and opening hours are ignored.
- **Apps:** a store release cannot be pulled back from installed devices. 1.0.3 apps against the old backend cannot order, so roll back the backend only together with a plan for the apps.
- **Web panel:** `scripts/deploy-webpanel.sh --rollback` (see `deploy-webpanel.md`).

## What was tested (local demo setup)

- Backend unit tests (33) and the end-to-end suites for Phase 0 (37 checks), Phase 1 (21) and Phase 2 (51). The suites live in `.handoff/` next to the repos; run them against a backend started with `.handoff/stub-firebase.js` (`BASE=http://localhost:<port> node .handoff/phase2.e2e.js`).
- Web panel board: 41 browser checks. Countr Plus and the customer app: their Phase 2 integration tests on iOS simulators.
- One cross-app run with all three clients on one backend (41 checks): a guest slot order confirmed through the payment webhook, live on the web board and in Countr Plus; pause and resume; message, answer in the customer app, "Answer received"; In Process → Ready → Completed; chat locked; restaurant settings unchanged afterwards.
- `scripts/build-indexes.js` on a copy with duplicates (refuses), without duplicates (swaps), and a backend started on old indexes (starts normally).
- Not tested: real Wallee payments, real push delivery, Android devices, and voice input on a real iPad or phone.
