# H4: hardening verification

October 29, 2026. Tested the E0–E9 implementation on Windows with the project-local Node 24.22.1 and pnpm 11.25.0. Production checks used isolated data; the streamer's SQLite database and account authorizations were not changed.

## Evidence

| Gate | Verification |
|---|---|
| Open-Session restart | `pnpm smoke` now starts a real production process, creates accepted demo Trades, stops it during an open Session, restarts against the same database, and compares every Trader's Coins/Holdings and the Session. A new overlay SSE connection receives the restored Portfolios. Simulator generation stops and output logs are empty after restart. |
| Browser recovery | Left dashboard Traders and `/overlay` open on an isolated production server on port 4101. Stopped the process: dashboard showed “Connection interrupted” and disabled actions; overlay showed “Reconnecting to the Exchange…”. Restarted without reloading either page: warning disappeared, actions returned, and all 12 Portfolios plus Stream 1 were preserved. Checked the recovered overlay at 1920×1080 and 960×540: Chart, Board and Tape stayed aligned and legible; no layout repair was required. |
| 60-second upstream gap | `a 60-second Twitch transport outage leaves demo controls usable, reconnects once, dedupes and keeps private input server-side` runs the assembled app with mocked external OAuth/HTTP/WebSocket boundaries and injected time. A full 60 seconds of failed connection attempts leaves EventSub visibly lost while 240 simulated messages, Trades and Fake Follow/Raid/Open/Close controls keep working. Recovery enables exactly one fresh five-subscription set; replayed delivery is ignored; simulated effects make zero chat-send requests. |
| Expiry/revocation | Existing `maintenance validates hourly, refreshes near expiry and clears an invalid grant`, `refresh is shared and disconnect prevents an in-flight refresh restoring the account`, and `subscription failures expose status only, refresh once, ignore stale completions and handle revocation` cover refresh, invalid grants, disconnect races and EventSub revocation. Auth tests also reject replay, denial, missing/wrong browser cookie, expired state, wrong client and missing scopes. |
| Every mutation guarded | `every mounted mutation rejects missing/foreign Origin and missing/wrong X-CTA before changing state` enumerates all 12 mounted POST routes, checks five invalid guard combinations apiece, asserts 403/no CORS and verifies the entire snapshot is unchanged. Existing HTTP tests cover other mutation methods, Host allowlisting and the 64 KiB body cap. |
| Public data and logs | The upstream-gap test injects unique raw chat, client-secret, token and transport-error canaries and checks the actual snapshot, overlay SSE frame, analytics SSE frame and captured runtime logs. None contain the canaries. Inspected explicit market/catalog/auth projections, SQL bindings, pure engine boundaries and the single chat-out path. A separate local scan compared actual local credential/token values with all reachable Git commit patches, tracked paths, built JS/CSS and the running production snapshot: no matches. The scan printed counts only; no credentials were logged. |
| Command burst and mixed origins | `100 live portfolio commands respect the real queue limits and simulated replies or bells never send live`, queue/Helix burst tests and the new assembled-app gap test verify the one-second/18-per-30-second limits, expiration, quiet/retry guards, and simulation isolation. |
| Clean-folder setup | Copied only tracked/current source into ignored `artifacts/h4/clean`, without `.env`, data or `node_modules`. Ran frozen install, check, lint, all tests, build and production smoke there. The smoke starts the actual server entrypoint and exercises the keyless demo, bundled images, setup guide, overlay client lifecycle and durable restart. H6 updates the judge-facing instructions and verifies development startup separately. |

## Finding and fix

The pre-H4 production smoke check failed with `8 !== 7`: E7 added Greeting streak, but the smoke script still expected seven scenarios. Updated it to check the eight shipped scenario identifiers and extended it with the actual process-restart gate above. The corrected smoke passes. No application rule, dependency or security policy changed.

## Scope of the evidence

The outage and token-failure checks control external transport boundaries; they do not revoke the streamer's real tokens or disable the computer's network adapter. A physical 60-second internet outage with live Twitch, real token revocation, and actual OBS rendering/frame-rate checks remain live walkthrough gates (H1/H3/H5). Browser dimensions are evidence of browser recovery and readability, not OBS performance. No new Twitch chat message was sent for H4.

Command results and the final test count are recorded in the H4 commit body. Browser evidence, clean-folder checkout and the local privacy-audit script remain in ignored `artifacts/h4/`.
