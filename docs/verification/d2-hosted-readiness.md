# D2 hosted readiness — step 6

November 2, 2026. The owner asked to perform step 6 first and reported Twitch environment/callback setup (steps 4–5) complete. No provider secrets or private console settings were inspected or changed.

## Deployment result

Checked `https://emote-exchange.vercel.app` with the new repeatable `pnpm verify:deployment` command:

| Route | Observed status before this commit | Result |
|---|---|---|
| `/` | 200 HTML | Frontend available |
| `/healthz` | 404 | Backend health unavailable |
| `/api/snapshot` | 404 | Market/auth snapshot unavailable |
| `/events?client=dashboard` | 404 | SSE unavailable |
| `/auth/login?role=broadcaster` | 404 | Twitch authorization cannot start |
| `/overlay` | 404 | Static overlay deep link unavailable |

Route readiness and Twitch readiness are both false. The checker exits 1 as intended. Step 6 cannot pass or reconnect Twitch until the backend exists; no live Trade, account authorization or OBS success is claimed.

## Changes

- Added the deployment checker with bounded request timeouts, manual redirect inspection, fixed/redacted errors and explicit manual follow-up requirements. It separates ready HTTP routes from a connected broadcaster/EventSub session and rejects an HTML fallback or loopback overlay URL on a public host.
- Added an exact Vercel `/overlay` rewrite to the built client index. This is a static routing fix only. API/auth failures remain visible; no public backend, hosted security bypass or CORS configuration was introduced.
- Documented the hosted-mode, persistent-backend and Vercel proxy implementation order in [hosting](../hosting.md). The local-only ADR and app runtime are unchanged.

## Verification

Tests were added before implementation and first failed because the new checker module did not exist. Nine `node:test` cases pass: connected routes with redacted OAuth state; missing backend; HTML fallbacks; wrong app/overlay/callback; route versus Twitch readiness; safe network/JSON errors; argument validation; local overlay aliases; and CLI help/unknown flags.

`pnpm test` runs these cases before the existing 71 Twitch Kit and 91 app tests: **171 passing**, no failures. `pnpm check`, `pnpm lint` and `pnpm build` pass. The actual deployed check fails for the missing routes above, which is separate from the automated test result. The overlay rewrite still needs the new commit deployed before its public result can be verified.

No application UI, market rules, database data, credentials or local-only submission videos were changed. Verification makes read requests, including the login entrypoint, without following Twitch authorization or sending chat.
