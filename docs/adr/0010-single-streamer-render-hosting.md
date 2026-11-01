# Optional single-streamer hosting on Render

Accepted November 2, 2026. The owner chose to deploy the whole app on Render after the Vercel frontend-only deployment could not serve the Node runtime. This supersedes the local-only deployment restriction in ADRs 0002 and 0004 and Twitch Kit sections 5, 6 and 15 **only when `DEPLOYMENT_MODE=hosted`**. Local mode remains the default and retains its loopback rules.

## Decision

Serve the dashboard, OBS overlay, assets, API, OAuth callback and SSE from one Node 24 service at `https://emote-exchange.onrender.com`. A separate static frontend or Vercel proxy is unnecessary. Keep one market owner process and do not enable horizontal scaling.

The owner selected Render's free instance with an existing Turso libSQL database because a paid disk is unavailable, and approved the official `@libsql/client` dependency. Hosted storage uses that remote primary for acknowledged, atomic transactions. A private in-memory SQLite mirror serves repository reads and updates only after each remote transaction commits. There is no deferred or best-effort upload queue. Native SQLite remains the local default. Render's free service can sleep, suspending EventSub and ticking until the process resumes; external persistence does not remove that limitation.

Hosted configuration requires an exact HTTPS `PUBLIC_ORIGIN`, Twitch client ID/secret and `TWITCH_OWNER_LOGIN`. Turso uses `DB_URL` (alias `TURSO_DATABASE_URL`) plus private `TURSO_AUTH_TOKEN`; without Turso, native hosted SQLite requires an explicit absolute `DATA_DIR` inside a persistent disk. The listener binds `0.0.0.0` on the platform's `PORT`. Validate the real Host against the configured origin; ignore forwarded Host headers. Allow loopback Host only for GET/HEAD `/healthz` probes. Preserve exact Origin plus `X-CTA: 1` for every mutation, reject foreign browser Origins for API/SSE, and send no CORS headers. Hosted development middleware is disabled.

Only a Twitch-validated broadcaster whose login matches the configured streamer can connect the channel. A successful owner OAuth callback creates a random, HttpOnly, Secure, SameSite=Lax, host-only dashboard cookie. Store only its hash in a bounded in-memory session set (20 sessions, 12-hour lifetime). Restart requires dashboard sign-in again; market state and server-side Twitch credentials persist on disk. Bot connection requires an owner session both when starting and completing OAuth. Broadcaster disconnect clears sessions. Expiry, disconnect and shutdown abort associated dashboard SSE connections.

The dashboard and diagnostic/API routes require an owner session. Public access is restricted to sign-in, health, assets, the overlay, and `client=overlay` snapshot/SSE reads. OBS receives an explicit projection with app identity, Simulator status, market display and Moments. Account status, catalog configuration, chat-out diagnostics and dashboard controls are excluded. Trader names, Coins, Holdings and Net Worth in the market projection are public game display data. No incoming chat, OAuth code, token or client secret is public.

## Consequences

Turso replaces the persistent-disk requirement. A dedicated `store_schema` version row and atomic SDK batches avoid unsupported writable control PRAGMAs; the actual cloud migration, failed-transaction rollback and restart recovery were verified using deployment-check keys. A runtime fencing token prevents a previous deployment from committing after its successor starts. Storage failure stops successful market effects instead of publishing uncommitted balances. Input and write queues are bounded at 2,000 pending operations; this is not an unlimited-throughput service.

Both adapters need private environment variables, exact HTTPS callback registration and backups. Missing/unwritable storage fails startup; it never silently falls back to disposable data. TLS terminates at Render; OAuth uses the configured HTTPS origin rather than inferring it from the internal HTTP request. Runtime EventSub WebSocket ownership, ticking and queued chat remain in one process. This is one streamer's deployment. The owner separately requested multi-streamer account isolation, then explicitly deferred it until this deployment and the new demo are complete; removing the owner restriction is not part of this commit.

The separate `emote-exchange-frontend.onrender.com` service is not part of this architecture. Live OAuth and Twitch/OBS acceptance still require evidence on the running deployment; local mocked protocol tests do not establish them.
