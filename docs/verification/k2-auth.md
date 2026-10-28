# K2 OAuth verification — October 28, 2026

K2's broadcaster live acceptance is complete. The streamer manually authorized both roles, and both restored successfully after an app restart and startup token validation on October 28, 2026. Both roles currently identify the same Twitch account; a distinct bot identity remains an optional check. No Twitch login or consent was automated.

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

## Live verification

1. The streamer confirmed successful broadcaster and bot-role connections.
2. The public snapshot reported both roles connected before restart.
3. The verified app process was restarted with `pnpm start:exchange`; startup validates stored tokens with Twitch.
4. The public snapshot again reported both roles connected after restart. Credential values were not read or printed.

Both roles have the same login. This verifies both authorization roles and restoration, but not a separate bot account. Dedicated-bot login and a manual Disconnect/Reconnect walkthrough remain optional follow-up checks; the broadcaster login and persistence completion bar has passed.

The Demo mode label remains while live chat and market features are not connected. This milestone does not claim those later features are implemented.
