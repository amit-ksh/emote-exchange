# D3: hosted runtime and durable Turso storage

Verified November 2, 2026. This task prepares the existing single-streamer application for the selected Render service. Multi-streamer account isolation was requested, then explicitly deferred until deployment and the new local demo are finished.

## Automated checks

- `pnpm check`, `pnpm lint`, `pnpm test` and `pnpm build` pass. The complete suite contains 184 tests: 10 deployment checks, 77 Twitch Kit tests and 97 Exchange tests.
- New tests were run red before implementation for hosted config/guards, secure owner OAuth, persistence before asynchronous market effects, Turso transactions and the protected public deployment projection.
- `hosted-auth.test.ts`: another broadcaster is rejected before token storage; cookies are Secure/HttpOnly/SameSite=Lax; the bot requires an owner session; exact session expiry aborts its stream.
- `hosted-http.test.ts`: a real production Node listener binds `0.0.0.0`, serves an authenticated owner, rejects foreign Host/Origin and missing guards, excludes tokens and closes expired SSE.
- `hosted.test.ts`: explicit hosted/Turso configuration, correct HTTPS overlay URL, protected diagnostic/action routes, public market-only snapshot/SSE, local aliases and SQLite restore.
- `turso-store.test.ts`: parameterized atomic writes, failed-transaction rollback, acknowledged-write mirroring, reopen recovery, predecessor fencing and atomic schema installation without unsupported control PRAGMAs. The SDK's Windows file transport can hold a mapped test file until process exit; only that platform's EPERM cleanup case is tolerated.
- `remote-market.test.ts`: a blocked remote commit emits no Feed/reply or changed Portfolio; a failed commit retains the last committed Portfolio and exposes a fixed storage-error state.
- Existing engine, privacy, simulator, greeting/Grant, live transport and forty-minute virtual Soak tests remain green. No simulated effects are sent to Twitch.

## Actual cloud database

The private local environment was used without printing its URL/token. The selected Turso database initially had schema version 0 and no app tables. A simple connection check passed.

The first migration failed against the real service despite passing the SDK file transport. Read-only probes established that reads and batches succeeded; a combined schema sequence returned SERVER_ERROR and an attempted control-PRAGMA migration returned SQL_PARSE_ERROR. The adapter now installs the checked-in schema through one atomic SDK batch and tracks its version in `store_schema` rather than relying on writable PRAGMAs.

The real database then passed: migration, a committed deployment-check key, a deliberately invalid JSON transaction, rollback of that transaction, closing/reopening the connection, and restoration of the committed key. No Trader, Coin balance or Twitch token was invented for this check. Scripts and logs are in ignored `artifacts/render/`.

## Browser/overlay

A separate local production server on port 4112 used native SQLite demo data, no Twitch credentials and no cloud database. Start demo was clicked in the real dashboard. The actual overlay loaded the new `client=overlay` snapshot and SSE routes.

Rechecked the actual browser viewport at 1920×1080 and 960×540: Price tape, chart, Top Traders, Halt banner and Feed render; the SIM label is visible; no status/account diagnostics appear. DOM geometry confirmed both viewport sizes, with transform scale(1) and scale(0.5), respectively. No Board layout change was needed. The fixed browser URL handling preserves public HTTPS rather than producing `https://127.0.0.1/overlay`. Correctly sized local screenshots are ignored `artifacts/render/overlay-1920.jpg` and `overlay-960.jpg`. The earlier `overlay-full.png` capture was actually 1280×720 and is superseded by this check. This is browser evidence, not a new OBS check.

## Deployment and account gates

A read-only Twitch authorization request with the existing public client ID and Render callback returned 302 toward Twitch, without immediately rejecting the callback. This does not establish a completed OAuth account authorization or a saved developer-console screenshot.

Before pushing this task, the public Render routes timed out; the previous server was not verified running. Post-push deployment, private owner authorization, a real hosted chat command/reply and hosted OBS behavior must be checked separately. The existing local recordings remain valid footage of earlier actual Twitch interactions. Do not claim they prove a new cloud login.

At the 5:05 AM IST follow-up, public Render routes still timed out. Automatic approval review blocked Render's GitHub sign-in because it may grant repository access. Explicit permission to continue that sign-in is pending; it was not bypassed. Successful cloud deployment and hosted account checks remain unverified. Video and submission artifacts remain local and git-ignored.

## Clean-checkout CI correction

The first pushed CI run, 41346484189, failed before the app tests: the new hosted HTTP test required an existing `dist/client/index.html`, while CI correctly runs tests before the client build. The test now creates its own temporary production HTML fixture and checks that the authenticated response contains it. This removes the hidden build-order dependency without changing the application. The original failure is retained in ignored `artifacts/render/ci-failed.log`.

The replacement [CI run 41347760656](https://github.com/amit-ksh/emote-exchange/actions/runs/41347760656), for commit `04faa6a`, passed on both Ubuntu and Windows: type checking, lint, all 184 tests, production build and the production restart/SSE smoke check.
