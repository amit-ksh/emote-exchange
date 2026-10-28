# K2 OAuth verification — October 28, 2026

Implementation is ready. Live acceptance remains pending: the streamer must authorize the broadcaster and confirm restart persistence. Optional bot authorization requires its account. No Twitch login or consent was automated.

## Implemented

- Broadcaster and optional bot scopes, canonical callback origin and bot `force_verify`.
- Single-use, ten-minute state bound to a hashed browser nonce and HttpOnly SameSite=Lax cookie. Pending attempts are bounded to 100 and expired/replaced attempts are removed.
- Code exchange and validation of client, user and scopes before server-only SQLite persistence. Browser projections contain readiness, connection status, login and scopes only.
- Startup/hourly validation, maintenance every minute and refresh with under five minutes remaining. Refreshes are shared per role. Disconnect removes credentials, invalidates pending work and attempts Twitch revocation. Invalid grants require reconnect. The invalidation method is ready for K3's EventSub revocation events.
- Dashboard connection/disconnect controls, safe fixed failures, no provider-body logging, no-store/no-referrer auth responses.

## Verification

Required checks: `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm build` and `pnpm smoke`.

The mocked OAuth tests verify canonical login, browser binding, expiration/replay rejection, denial, wrong client/scopes, private token persistence, restart restoration, hourly validation, near-expiry refresh, invalid grants, concurrent refresh sharing and disconnect winning a refresh race. App tests verify guarded disconnect and no credentials in the configured-state projection.

Real Edge inspected the dashboard at 1920 × 1080 and 960 × 540, verified broadcaster/bot link targets and transparent overlays at both sizes. No overflow or page errors occurred. Screenshots are in ignored `artifacts/k2/`; actual OBS testing remains pending.

The user's `.env` is ignored. Only credential-presence booleans were printed; values were not displayed. Production smoke overrides credentials with empty strings and uses an isolated database.

## Remaining live check

1. Open `http://localhost:4100/` and click **Connect Twitch** under Broadcaster.
2. Sign in and approve Twitch's requested permissions manually.
3. Confirm **Connected as @yourchannel** on the dashboard.
4. Restart the app and verify the account returns. Test Disconnect/Reconnect; check the optional bot separately.

The Demo mode label remains while live chat and market features are not connected. This milestone does not claim those later features are implemented.
