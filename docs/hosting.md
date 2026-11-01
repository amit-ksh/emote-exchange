# Hosting Emote Exchange

Checked November 2, 2026. The shipped app is a **local, single-process streamer application**. It is not currently a hosted multi-user service.

## Observed Vercel deployment

`https://emote-exchange.vercel.app` returned Vercel `404 NOT_FOUND` at `/`, `/healthz`, `/api/snapshot` and `/events?client=dashboard`. These public responses do not reveal whether the dashboard has a missing production deployment, domain assignment problem or incorrect output directory; the Vercel deployment/build logs are needed to distinguish those causes.

### Follow-up: dashboard loads, Twitch does not connect

A later check on November 2 confirmed `/` now returns **200 HTML**, while `/api/snapshot`, `/events?client=dashboard` and `/auth/login?role=broadcaster` still return **404**. The frontend is now served, but the app's required backend routes are unavailable. Twitch login cannot start at a missing `/auth/login` endpoint; changing Twitch credentials alone will not fix this.

The displayed `https://127.0.0.1/overlay` is a client fallback: without a backend snapshot, the dashboard constructs `/overlay` from the page's origin and replaces its hostname with `127.0.0.1`. It inherits HTTPS and the absent explicit port from Vercel. That URL refers to the viewer's own computer, not the hosted deployment.

- Current supported local overlay: `http://127.0.0.1:4100/overlay`.
- Expected same-origin hosted overlay **after hosted support is implemented**: `https://emote-exchange.vercel.app/overlay`.
- Replacing the visible URL alone does not create the missing backend or fix Twitch login.

For a **frontend-only build**, configure:

| Setting | Value |
|---|---|
| Root directory | Repository root (`.`) |
| Framework preset | Other, with the explicit commands below |
| Node.js version | 24.x |
| Build environment | `ENABLE_EXPERIMENTAL_COREPACK=1` to honor the pinned `packageManager` |
| Install command | `corepack pnpm install --frozen-lockfile` |
| Build command | `corepack pnpm build` |
| Output directory | `apps/emote-exchange/dist/client` |

Point the domain at a successful production deployment. These settings produce the browser assets only. They do **not** deploy the existing Node runtime, Twitch connection, market, database or API routes. Serving the dashboard HTML alone will therefore not make the app functional. Never expose `TWITCH_CLIENT_SECRET` through a `VITE_*` variable.

## Why configuration alone cannot reproduce local behavior

- The Vite build bundles the client; `apps/emote-exchange/src/server.ts` separately starts the Node server and runtime.
- The runtime keeps one market engine, EventSub connection, tick loop, chat queue and SSE publisher alive across browser requests.
- Native SQLite stores Portfolios, settings and Twitch tokens on a persistent local disk. Vercel Functions do not provide that shared persistent filesystem.
- The server binds to `127.0.0.1`. Host and Origin guards accept loopback only. `PUBLIC_ORIGIN=https://emote-exchange.vercel.app` is deliberately rejected by the current config validator.
- The dashboard has no public-host authentication or per-channel tenancy. Its local Origin guard is not a replacement for hosted streamer access control.

Vercel currently documents support for streaming and WebSockets, but Function invocations still have duration limits. WebSocket support alone does not supply a durable singleton market process or persistent SQLite storage.

## Supported configuration now

Run one local instance with Node 24.12+ within major 24 and the pinned pnpm version:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm start:exchange
```

In `apps/emote-exchange/.env`, set `PORT=4100`, `PUBLIC_ORIGIN=http://localhost:4100`, `DATA_DIR=./data` and the private `TWITCH_CLIENT_ID`/`TWITCH_CLIENT_SECRET`. Register `http://localhost:4100/auth/callback` in the Twitch developer application. Connect broadcaster/bot accounts through the local dashboard; OBS uses `http://127.0.0.1:4100/overlay`.

## What a full hosted version needs

An always-running Node 24 service with a persistent writable volume is the closest deployment shape to the current app. It still needs an explicit hosted-mode design and implementation before deployment:

1. A fixed HTTPS public origin, reviewed proxy/Host/Origin handling, secure OAuth cookies and a matching HTTPS Twitch callback.
2. Authentication and authorization for the streamer dashboard and actions; intentional read-only access for the OBS overlay. Preserve the Origin and `X-CTA` checks.
3. One market owner process per channel and durable private storage. With SQLite, use one writer instance with a persistent volume and backups; a serverless design instead needs shared storage and coordination.
4. Reliable EventSub ownership, token refresh, ticking, queued replies and reconnecting SSE throughout a broadcast.
5. End-to-end checks of login, chat, Trades, Grants, reconnects, persistence after restart, and overlay behavior on the hosted origin.

Vercel could host the frontend with an appropriate same-origin backend proxy, or a redesigned serverless service could run on Vercel with external persistence and coordination. Neither is an environment-variable-only change. The current local-only spec and auth ADR require owner agreement before implementing hosted behavior; this document records findings and requirements without weakening those rules.

## Steps to activate a hosted deployment

These require a hosted-mode implementation first; they are not instructions to weaken the current local guards.

1. Deploy the Node runtime on an always-running service with persistent private storage, keeping one market owner process per channel. Vercel's static frontend deployment does not start `src/server.ts`.
2. Implement protected streamer access, explicit HTTPS Host/Origin allowlists, secure OAuth cookies and correct public overlay projection URLs. The current `PUBLIC_ORIGIN` validator accepts loopback only, so a public URL needs a code/configuration change backed by the hosting decision.
3. Route `/api/*`, `/events`, `/auth/*` and `/healthz` on the public origin to that backend. Serve `/overlay` and client assets on the same origin; preserve streaming responses and do not add wildcard CORS.
4. Set `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` privately on the backend. Set `PUBLIC_ORIGIN=https://emote-exchange.vercel.app` only after hosted-mode support accepts and secures that origin. Never put the secret in `VITE_*` or browser code.
5. Add `https://emote-exchange.vercel.app/auth/callback` to the same confidential application in the Twitch developer console. Retain the local callback if local use is still needed. The deployed redirect URI must match the registered URI exactly.
6. Verify `/api/snapshot` returns 200 JSON, `/events?client=dashboard` opens a 200 event stream, and `/auth/login?role=broadcaster` redirects to Twitch authorization. Then connect the broadcaster and optional bot and verify a message from a different viewer account.
7. Add the hosted `/overlay` URL to OBS and verify Trades, queued bot replies, reconnects and saved Portfolios after a backend restart.

For immediate use without this migration, start the existing local app, open `http://localhost:4100`, keep the local callback registered, and use the local overlay URL above.

## References

- [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite)
- [Pinned package managers on Vercel](https://vercel.com/docs/package-managers)
- [SQLite and Vercel storage](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel)
- [Vercel Function duration limits](https://vercel.com/docs/functions/limitations)
- [Current local configuration](../apps/emote-exchange/.env.example)
- [Local auth decision](adr/0004-auth-code-flow.md)
- [Registering the Twitch redirect URL](https://dev.twitch.tv/docs/authentication/register-app/)
