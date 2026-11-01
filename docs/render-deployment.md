# Render deployment

The owner selected the whole app at `https://emote-exchange.onrender.com`. The separate `emote-exchange-frontend.onrender.com` static site is not needed: the Node service serves both browser screens and the backend. See [ADR 0010](adr/0010-single-streamer-render-hosting.md).

## Current state

Hosted HTTPS, owner sign-in, public read-only OBS delivery and Turso storage are implemented. Native SQLite remains the local default. In hosted mode, `DB_URL` and `TURSO_AUTH_TOKEN` select Turso; no Render disk is needed. Multi-streamer account isolation was explicitly deferred until deployment and the new demo are complete.

Do not change `DATA_DIR` to temporary storage and claim balances or Twitch tokens are durable. The reported `EACCES: mkdir /var/data/emote-exchange` occurs before HTTP starts; it means that directory is not writable by the deployed process. A Render disk was not verified or attached here.

## Service settings

| Field | Value |
|---|---|
| Type | Web Service |
| Repository / branch | `amit-ksh/emote-exchange`, `main` |
| Runtime | Node |
| Root directory | Leave blank (workspace root) |
| Build | `corepack enable && pnpm install --frozen-lockfile && pnpm build` |
| Start | `corepack pnpm start:exchange` |
| Health | `/healthz` |
| Instances | One |

Server variables shared by the database options:

```dotenv
NODE_VERSION=24.22.1
DEPLOYMENT_MODE=hosted
PUBLIC_ORIGIN=https://emote-exchange.onrender.com
TWITCH_OWNER_LOGIN=ammit_ksh
TWITCH_CLIENT_ID=your-existing-client-id
TWITCH_CLIENT_SECRET=your-existing-client-secret
DB_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-private-database-token
```

Use Render's `PORT`. The service binds `0.0.0.0` only in hosted mode; local mode stays on `127.0.0.1`. Hosted mode requires the production build and Twitch credentials. Set secrets only on the backend, never `VITE_*` variables.

For the existing **SQLite adapter**, attach a persistent disk at `/var/data` and set `DATA_DIR=/var/data/emote-exchange`. Free Render cannot attach that disk. This option is not the owner's selected deployment.

For **Turso**, set `DB_URL` to your database URL (`TURSO_DATABASE_URL` is also supported) and `TURSO_AUTH_TOKEN` to its private auth token. Remove the old `/var/data` setting: it is not used for the Turso mirror. The SDK uses HTTPS without a native database addon. Startup migrates and restores committed state; each write transaction commits remotely before updating the read mirror, market display or chat reply. A failed or uncertain transaction stops that runtime's writes until restart; a newer runtime fences its predecessor. Use one instance. Keep the token out of chat and commits.

## Twitch and OBS

Register `https://emote-exchange.onrender.com/auth/callback` in the existing confidential Twitch application. Open the service URL and sign in as `ammit_ksh`, then connect the optional bot from Setup. Another Twitch account cannot replace the configured broadcaster in this deployment phase. The dashboard cookie lasts 12 hours and must be renewed after an app restart; persistent game data and Twitch token storage are separate from that browser session.

OBS Browser Source: `https://emote-exchange.onrender.com/overlay`, width 1920, height 1080, transparent background. OBS needs no dashboard cookie. Its public snapshot is `/api/snapshot?client=overlay` and its stream is `/events?client=overlay`. Full snapshots, dashboard SSE, analytics and actions require the owner's cookie. Actions also require exact Origin and `X-CTA: 1`; no CORS exception is used for the old frontend.

Free Render can stop an idle service after 15 minutes and lose local files. While stopped, the market cannot tick or receive Twitch events. Turso retains committed state but cannot keep that process alive. A stable always-running live broadcast requires a host/instance with that guarantee.

## Verification

Automated hosted checks cover exact origin/config validation, owner-only OAuth, secure cookies, unauthorized controls, Origin/Host guards, public projection isolation, session expiry closing SSE, SQLite/Turso restart persistence and persistence-before-effects. Mocked Twitch OAuth is separate from deployed authorization. The real Turso database passed migration, committed writes, a deliberately invalid atomic transaction, rollback and reopen checks. A read-only Twitch authorization probe accepted the Render callback and redirected toward Twitch login; it did not complete an account authorization. See the deployment verification record for actual public route and browser evidence.

Run `pnpm verify:deployment https://emote-exchange.onrender.com`. It recognizes protected dashboard endpoints and checks the separate public OBS snapshot/SSE. `routesReady` can pass while `twitchReady` remains false because private Twitch status requires owner sign-in. It conservatively exits nonzero until connected status is verified; sign in and inspect the dashboard, then verify a live command and queued reply. No cookie or token is accepted on the command line.

References: [Render Web Services](https://render.com/docs/web-services), [Free service limits](https://render.com/docs/free), [Persistent disks](https://render.com/docs/disks), [Turso TypeScript/libSQL reference](https://docs.turso.tech/sdk/ts/reference).
