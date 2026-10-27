# Twitch Kit: platform spec

Package: `packages/twitch-kit` · Built in: Sprint 1 · Status: reviewed plan

## 1. What it is

The platform for Emote Exchange: Twitch login, reading chat and channel events, sending chat, recognizing emotes, local storage, pushing live state to the overlay, and a chat simulator.

Keep transport and infrastructure in this package and market rules and all React UI in `apps/emote-exchange`. The package has one consumer; avoid plugin systems or a shared UI package. See [ADR 0001](../adr/0001-single-app-workspace.md).

## 2. Runtime shape

```
 Twitch: EventSub WebSocket + Helix API          7TV / BTTV / FFZ public emote APIs
          |  ^                                           |
   events |  | send chat, emote sets, subscriptions      | emote sets
          v  |                                           v
 +------------ app process: Node 24.12+, bound to 127.0.0.1 ----------------+
 | twitch-kit: auth, eventsub, helix, chat-out, emotes, store, bus, sim, http|
 |                     |  ChatEvents (same shape from Twitch or simulator)  |
 |                     v                                                    |
 | app engine (pure rules) -> effects: persist, broadcast, say              |
 +--------------+------------------------------+----------------------------+
           SSE  | snapshot + deltas       HTTP | actions
                v                              v
     OBS browser source: /overlay      browser: / (dashboard)
```

| App | Port | Dashboard | Overlay |
|---|---|---|---|
| Emote Exchange | 4100 | `http://localhost:4100/` | `http://127.0.0.1:4100/overlay` |

One local process and one Twitch developer application serve Emote Exchange. Development and production use the same dashboard, overlay and HTTP port.

## 3. Repo layout

```
emo-trade/                         existing checkout; product name is Emote Exchange
  AGENTS.md  README.md  GLOSSARY-MAP.md
  package.json  pnpm-workspace.yaml  tsconfig.base.json  biome.json
  .github/workflows/ci.yml
  docs/
  packages/twitch-kit/
    src/        auth/ eventsub/ helix/ chat-out/ emotes/ commands/ store/ bus/ sim/ http/
    test/
    GLOSSARY.md
  apps/emote-exchange/
    src/        engine/ (pure rules)  runtime/ (wiring)  server.ts
    client/     Vite + React: dashboard (/) and overlay (/overlay), panels/, public/demo-emotes/
    test/
    .env.example  README.md  GLOSSARY.md
```

The app's `README.md` is written for judges: what it is, 3-step setup, demo mode, troubleshooting. Keep the existing checkout name; workspace and app package names identify the product without moving the user's folder.

## 4. Dependencies

Approved list. Anything else needs the human's OK first.

| Kind | Packages |
|---|---|
| Runtime | `hono`, `@hono/node-server`, `react`, `react-dom`. |
| Dev | `typescript`, `@types/node`, `@types/react`, `@types/react-dom`, `vite`, `@vitejs/plugin-react`, `@biomejs/biome`. Optional: `@playwright/test`. |

Platform features we use instead of packages: `node:sqlite` (storage), global `WebSocket` (EventSub client), global `fetch` (Helix), `node:test` + `node:assert` (tests), `--env-file-if-exists` (env), `node:crypto` (state, ids, hashes), browser `EventSource` (SSE client), Web Audio API (sounds). See [ADR 0005](../adr/0005-node-native-typescript-and-node-sqlite.md).

Require Node 24.12 or newer within the supported Node 24 LTS line. Pin the package manager and resolved dependencies in the repository. Server packages use `"type": "module"`, erasable TypeScript, explicit `import type` and relative `.ts` imports; only the client is bundled. [Node's TypeScript documentation](https://nodejs.org/docs/latest-v24.x/api/typescript.html) explains native type stripping and its syntax limits.

## 5. Configuration

The app reads `apps/emote-exchange/.env` (git-ignored). `.env.example` lists every variable. Root scripts run the server with the app directory as its working directory; resolve static files against the module location and relative data paths against that app directory.

| Variable | Default | Notes |
|---|---|---|
| `TWITCH_CLIENT_ID` | none | From the Emote Exchange Twitch app. Missing ID or secret means **demo mode** (section 18). |
| `TWITCH_CLIENT_SECRET` | none | |
| `PORT` | 4100 | Integer from 1 to 65535. |
| `PUBLIC_ORIGIN` | `http://localhost:<PORT>` | Builds the OAuth redirect URI. Must match the URL registered on the Twitch app exactly. |
| `DATA_DIR` | `./data` | SQLite file and backups. Git-ignored. |
| `EVENTSUB_WS_URL` | `wss://eventsub.wss.twitch.tv/ws` | Point at the Twitch CLI mock: `ws://127.0.0.1:8080/ws` |
| `EVENTSUB_SUBSCRIPTIONS_URL` | `https://api.twitch.tv/helix/eventsub/subscriptions` | Mock: `http://127.0.0.1:8080/eventsub/subscriptions` |

The server binds `127.0.0.1`. The browser may use `localhost` or `127.0.0.1`, so both exact origins at the configured port count as the app's own origin. `PUBLIC_ORIGIN` must be one of those origins, with no credentials, path, query or fragment. Development adds no extra origins.

## 6. Auth

Authorization code flow with the confidential client secret on the streamer's machine ([ADR 0004](../adr/0004-auth-code-flow.md)).

**Roles**

| Role | Account | Scopes | Used for |
|---|---|---|---|
| `broadcaster` (required for live mode) | the streamer | `user:read:chat user:write:chat moderator:read:followers` | EventSub subscriptions, emote lookups, fallback sender |
| `bot` (optional) | the bot account | `user:write:chat` | Sends all app chat messages when connected |

**Login**

1. `GET /auth/login?role=broadcaster|bot` first redirects to the canonical `PUBLIC_ORIGIN` when opened through the other allowed loopback hostname. On that origin it creates a single-use `state` (32 random bytes, 10-minute expiry, remembers the role) and an independent browser nonce. Store the nonce hash with the state server-side and set the nonce as a host-only `HttpOnly; SameSite=Lax; Path=/auth; Max-Age=600` cookie. Loopback HTTP means the cookie cannot require `Secure`. Redirect to `https://id.twitch.tv/oauth2/authorize` with `response_type=code`, `client_id`, `redirect_uri=<PUBLIC_ORIGIN>/auth/callback`, the role's scopes and `state`. The bot role adds `force_verify=true` so the streamer can pick a different account.
2. `GET /auth/callback` requires both a valid, unexpired state and the matching browser cookie. Consume the state before exchanging a code and clear the cookie on success or failure, including a denied authorization. Exchange the code at `POST https://id.twitch.tv/oauth2/token`, then call `GET https://id.twitch.tv/oauth2/validate` to learn `user_id`, `login`, client ID and scopes; verify the expected client and required scopes before storing tokens. Neither a callback from another browser nor a replay can connect an account.
3. Any failure (denied, bad state, missing cookie, wrong scopes) returns to the dashboard with a fixed readable error. Never echo a code, token or provider error body into browser-visible text or logs. A new login replaces any pending attempt in that browser.

**Lifecycle**

- Validate every stored token on start and every hour (Twitch requires hourly validation).
- Refresh when less than 5 minutes remain, or after a Helix 401 (retry the request once). Keep one in-flight refresh per role; concurrent callers await it, and the token pair is replaced atomically. Disconnect cancels or invalidates outstanding refresh work so it cannot restore a revoked role.
- A failed refresh (`invalid_grant`) disconnects that role. The dashboard shows **Reconnect**, and the app keeps running with the simulator.
- Disconnect: `POST /api/auth/disconnect` revokes the token at `POST https://id.twitch.tv/oauth2/revoke` and deletes it.
- An EventSub `revocation` with `authorization_revoked` disconnects the broadcaster role.

Tokens live only in the server's SQLite file. They never reach a browser, a log line or a commit.

## 7. EventSub client

Open one EventSub WebSocket without bearer credentials in its URL or handshake. The broadcaster's user access token authenticates the separate Helix requests that create subscriptions for its welcome session ID. Emote Exchange declares the subscriptions below. See Twitch's [WebSocket event handling documentation](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/).

| Type | Version | Condition | Scope |
|---|---|---|---|
| `channel.chat.message` | 1 | `broadcaster_user_id`=B, `user_id`=B | `user:read:chat` |
| `channel.follow` | 2 | `broadcaster_user_id`=B, `moderator_user_id`=B | `moderator:read:followers` |
| `channel.raid` | 1 | `to_broadcaster_user_id`=B | none |
| `stream.online` | 1 | `broadcaster_user_id`=B | none |
| `stream.offline` | 1 | `broadcaster_user_id`=B | none |

The protocol logic is a **pure state machine**: incoming frames and timer ticks go in, actions (open socket, close socket, create subscriptions, emit event) come out. A thin runner owns the socket and timers. That keeps every rule below testable with recorded frames ([ADR 0006](../adr/0006-pure-engines-with-injected-time.md)).

1. Set `keepalive_timeout_seconds=30` on a parsed `EVENTSUB_WS_URL` and connect; preserve any existing query parameters. Use the timeout returned by the welcome message for the watchdog.
2. On `session_welcome`, store the session ID. On a fresh connection, create every declared subscription with `POST EVENTSUB_SUBSCRIPTIONS_URL` (transport `{ "method": "websocket", "session_id": ... }`) within 10 seconds. Report each failure (for example 403 for a missing scope) on the dashboard.
3. If nothing arrives (notification or keepalive) for keepalive timeout + 5 s, treat the connection as lost. Reconnect with backoff 1, 2, 5, 10, 30 s (then stay at 30) and resubscribe.
4. On `session_reconnect`, open `reconnect_url`. Close the old socket only after the new one sends its welcome. Do not resubscribe, because subscriptions carry over.
5. On `notification`, drop duplicates by `metadata.message_id` (remember the last 2,000 for 10 minutes), normalize to a ChatEvent (section 8) and emit it.
6. On `revocation`, emit it. `authorization_revoked` disconnects auth (section 6).
7. Close codes 4001 and 4003 mean our bug, so log them loudly. Other closes reconnect.

Events missed during a lost connection are not replayed by Twitch. Engines must tolerate gaps.

The dashboard shows: connected/connecting/lost, session age, each subscription's status, time of the last event.

## 8. ChatEvents

Every source (Twitch or simulator) produces the same normalized events. Engines only ever see these. Every ChatEvent carries the common envelope `id` (stable unique event ID), `at` (event time in milliseconds) and `origin` (`twitch` or `sim`). The fields below are in addition to that envelope. Twitch uses the EventSub metadata ID/timestamp; simulated IDs and timestamps are deterministic for a seed and scenario. Connection changes carry the origin of their connection.

| Event | Fields |
|---|---|
| ChatMessage | `messageId` (Twitch chat message ID, distinct from the envelope's delivery ID), `chatter` {`id`, `login`, `displayName`, `color`, `isBroadcaster`, `isMod`, `isVip`, `isSubscriber`}, `text`, `parts` (ordered: text, emote, mention), `command` (`{name, args}` or null), `foreign` (true when shared chat delivered it from another channel), `selfSent` (true for this app's own messages) |
| MessageDeleted | `messageId`, `userId` |
| UserCleared | `userId` (timeout or ban: all their messages are gone) |
| ChatCleared | none |
| Follow | `user` {`id`, `login`, `displayName`} |
| Raid | `from` {`id`, `login`, `displayName`}, `viewers` |
| StreamOnline / StreamOffline | none |
| ConnectionChanged | `status`, `detail` |

Deletion and clear events are available normalization types if a later feature needs them; Exchange does not subscribe to those unused events. Event IDs also make Follow bonuses and stream bells idempotent. Every `say` effect retains its triggering event's `origin`; effects caused by simulated events, including ambient raid and closing-bell summaries, remain simulated. A dashboard action explicitly requesting a live chat test uses `origin: 'twitch'`; dashboard simulation controls use `origin: 'sim'`.

Normalization rules:

- **Emote parts.** Twitch's `emote` fragments are authoritative (`id`, name from fragment `text`, `animated` if `format` includes `animated`). Twitch delivers 7TV, BTTV and FFZ emotes as plain text, so split `text` fragments on whitespace and turn each word that exactly matches a catalog name (case-sensitive) into an emote part.
- **Mentions** come from `mention` fragments.
- **Foreign.** `foreign` is true when `source_broadcaster_user_id` is present and differs from B. Engines ignore foreign messages, so each community's state stays its own.
- **Self-sent.** `selfSent` is true when the chatter is the bot account, or the `message_id` is one the chat-out queue just sent (section 11). This catches the broadcaster-as-sender case.
- **Reply targets.** Use ChatMessage `messageId` for `reply_parent_message_id` and echo matching; the envelope `id` identifies EventSub delivery for deduplication.
- **Command** (section 12).

## 9. Emote catalog

Loaded at start and every 30 minutes. On a provider failure, keep the last good set (persisted in SQLite) and carry on.

| Provider | Channel set | Global set | Image URL |
|---|---|---|---|
| Twitch | `GET /helix/chat/emotes?broadcaster_id=B` | `GET /helix/chat/emotes/global` | `https://static-cdn.jtvnw.net/emoticons/v2/{id}/{static or animated}/dark/3.0` |
| 7TV | `https://7tv.io/v3/users/twitch/B` (the active `emote_set.emotes`) | `https://7tv.io/v3/emote-sets/global` | from each emote's `data.host` (url + a 2x or 4x webp file) |
| BTTV | `https://api.betterttv.net/3/cached/users/twitch/B` (`channelEmotes` + `sharedEmotes`) | `https://api.betterttv.net/3/cached/emotes/global` | `https://cdn.betterttv.net/emote/{id}/2x` |
| FFZ | `https://api.betterttv.net/3/cached/frankerfacez/users/twitch/B` | `.../frankerfacez/emotes/global` | from the response `images` |
| Demo | files in `client/public/demo-emotes/` (name = file name) | | served by the app |

- **Name clashes.** Channel sets beat global sets. Within the same scope: Twitch, then 7TV, BTTV, FFZ.
- **Unlisted Twitch emotes.** An emote fragment from a Twitch emote not in the catalog (another channel's sub emote) still counts as an emote, imaged by its fragment ID.
- **Lookups.** The catalog answers: is this word an emote, what is its key (`provider:id`), its display name and its image URL.
- **Demo mode** starts immediately using bundled original demo emotes. Optional 7TV and BTTV global sets load in the background when reachable; network failure or lack of keys cannot block startup or a scenario.

## 10. Helix client

`fetch` wrapper:

- Sends `Authorization: Bearer` and `Client-Id`.
- Times out after 10 s (`AbortSignal.timeout`).
- On 401, awaits the role's serialized refresh and retries once.
- On 429, waits until `Ratelimit-Reset` and retries once.
- Logs method, path and status, never tokens or bodies containing chat text.

## 11. Chat-out queue

The only way Emote Exchange sends chat. Each queued item carries `origin`, its generated text, priority, enqueue time and optional reply target.

- **Sender:** the bot account if connected, otherwise the broadcaster.
- **Rate:** at most 1 message per second and 18 per rolling 30 s, below Twitch's lowest limit of 20 per 30 s. These hold even for a modded bot: the app should stay quiet.
- **Priority and bounds:** `reply` (answers to a command) precedes `ambient`. Above 10 pending messages, discard the oldest ambient messages first. The hard capacity is 100 items; if all are replies, reject the newest item and record `queue_full`. Pending items expire after 30 seconds with `expired`. Collapse identical pending texts and retain only the latest 100 diagnostic log entries. Dropping a reply never reverses a completed trade or removes its overlay feedback.
- **Length:** cap at 500 characters, cut on a word boundary with an ellipsis.
- **Replies** use `reply_parent_message_id`.
- **Sim and demo mode:** check provenance before enqueueing for live transport and again before sending. Every `origin: 'sim'` item, including ambient output, and everything in demo mode goes to the dashboard's **Would have said** log. Mixed live/sim operation must never send a simulated effect to Twitch.
- **Self-sent marking:** remember each returned `message_id` for 2 minutes so the echo is marked `selfSent`.
- **Drops:** log `is_sent: false` with its `drop_reason` on the dashboard.
- **Quiet mode:** a dashboard switch stops all outbound chat.

## 12. Commands

- A message is a command when it starts with `!` followed by a letter.
- `name` is the first word, lowercased, without `!`. `args` are the remaining whitespace-separated words, original case.
- Roles come from badges: broadcaster, moderator, vip, subscriber.
- A cooldown helper keyed by user + command uses the injected clock.
- Unknown commands are ignored silently, because other bots share the channel.

## 13. Store

- `node:sqlite` `DatabaseSync` at `DATA_DIR/emote-exchange.sqlite`, with `journal_mode=WAL` and `foreign_keys=ON`.
- **Migrations:** an ordered list of SQL steps in code, tracked with `PRAGMA user_version`, applied in one transaction at start.
- **Writes:** engines return persist effects; the runtime applies all effects from one event or tick in a single transaction.
- **Platform tables:** `tokens` (role, user id, login, display name, access and refresh tokens, scopes, expiry), `kv` (settings as JSON), `emote_cache` (provider, scope, key, name, image URL, animated, fetched_at).
- **Backup:** dashboard Export downloads an app-defined game-state JSON snapshot. Import validates schema, sizes and numeric bounds before restoring it after confirmation. Tokens, OAuth state and other credentials are excluded from both export and import.

## 14. Overlay bus (SSE)

- `GET /events?client=overlay|dashboard` streams `text/event-stream`.
  - On connect: `event: snapshot` with the full public state.
  - Then `event: delta` messages.
  - A `: ping` comment every 15 s.
- Every JSON payload carries `v` (schema version) and `seq` (increasing during the process lifetime). Clients replace state on each snapshot and reset their sequence cursor to it, including after a server restart. The server sends a fresh snapshot on every connect, and `EventSource` reconnects on its own.
- **Display data only:** names, colors, emote names and image URLs, numbers and fixed app-generated status text. Never tokens, OAuth codes, raw chat text or arbitrary provider error bodies. Construct an explicit public projection rather than serializing engine or configuration objects.
- Coalesce replaceable state updates to at most 10 per second per client. For the initial implementation, a delta contains a complete replacement public projection, not a partial patch; intermediate price updates may be replaced safely. Transient moments such as trades and banners have stable IDs and live in bounded queues in that projection; clients deduplicate them by ID. Coalescing must retain still-current moments, rather than discarding arbitrary patches.
- Bound pending output to 1 MiB per client. Disconnect a slow client when the bound is exceeded; its reconnect receives a new snapshot. Remove disconnected clients and ping timers immediately. Keep moment queues finite and apply the app's documented expiry rules.
- `GET /api/snapshot` returns the same snapshot as JSON (used by tests and the dashboard).

## 15. HTTP server and security

**Server and routes**

- Hono on `@hono/node-server`, listening on `127.0.0.1` only. `pnpm dev:exchange` starts one local HTTP listener at port 4100, with Vite in middleware mode for the client and HMR on that same HTTP server. Production serves the built client from the same routes. No separate Vite port, proxy-origin exception or permissive CORS is needed.
- Routes:
  - `GET /` dashboard, `GET /overlay`, `GET /assets/*` (Vite build), `GET /events`, `GET /api/snapshot`, `GET /healthz`
  - `POST /api/*` actions
  - `GET /auth/login`, `GET /auth/callback`

**Threat model**

Any website the streamer visits can fire requests at `localhost`. So:

1. Validate `Host` before every route and before Vite/static handling. Accept only `localhost:<PORT>` or `127.0.0.1:<PORT>` at the configured port; reject missing, malformed or unrelated hosts with 403. Ignore forwarded-host headers. Apply the same allowlist to development WebSocket upgrades. This prevents an attacker-controlled hostname resolving to loopback from reading app data.
2. Every state-changing method, including POST, PUT, PATCH and DELETE, requires an exact `Origin` of `http://localhost:<PORT>` or `http://127.0.0.1:<PORT>`, plus `X-CTA: 1`. Reject missing, `null`, malformed and other origins or missing/wrong headers with 403. No wildcard, suffix, arbitrary-port or development-origin matches. Reject bodies above 64 KiB with 413 unless a separately documented bounded import route needs more.
3. No route or Vite middleware sends CORS headers. Cross-origin preflights are rejected. Set `Cache-Control: no-store` on auth, snapshot and event responses and `Referrer-Policy: no-referrer` on auth responses. HMR upgrades require an allowed Host and an allowed browser Origin.
4. GET routes change no game or auth-connection state. `/auth/login` may create pending state/cookies; `/auth/callback` may connect an account only with the matching single-use state and browser cookie from section 6. Other mutations use guarded actions. State-changing actions return fixed validation errors and never include secrets or raw chat.
5. Chat input is untrusted:
   - capped at 500 characters
   - parsed, never evaluated
   - only reaches SQL through bound parameters
   - only reaches HTML through text nodes (React escaping), never `dangerouslySetInnerHTML`
6. In development, mount API, SSE and auth routes before Vite middleware, set Vite `cors: false`, and share the Node HTTP server for HMR. The Host and Origin policy is identical in development and production. Validate ports and config at startup rather than weakening the guard when setup fails.

## 16. Simulator

**Events**

- Produces every ChatEvent with the common `id`, `at`, `origin: 'sim'` envelope, including follows, raids and stream bells.
- Chatters are named `sim_<word>` with stable colors.
- A seeded RNG makes every scenario replay identically, so tests reuse them.

**Controls** (dashboard and `POST /api/sim/*`)

- start/stop
- rate: 0.2 to 50 messages per second
- chatter count: 1 to 500
- persona mix
- scenario buttons

**Personas**

- Platform personas: plain chatter (lines from a bundled phrase bank of original, generic chat lines), emote spammer, follow and raid generator.
- Exchange supplies its trading personas and scenarios as data/functions when constructing the simulator; there is no dynamic plugin registry.

**Mixing with live chat**

- Sim and live chat can run together, so a small real chat can be shown at scale.
- While the simulator runs, the dashboard and the overlay show a small **SIM** badge. That keeps demo footage honest.
- The simulator never sends anything to Twitch.

## 17. Dashboard panels (`apps/emote-exchange/client`)

React panels owned by the Emote Exchange client and wired to the platform's public state and guarded HTTP actions:

- **ConnectionPanel**: broadcaster and bot status, connect/disconnect, EventSub status, subscriptions, last event time
- **OverlayUrlPanel**: URL, copy button, the OBS settings from the setup guide
- **SimulatorPanel**: controls from section 16, plus Exchange scenarios
- **ChatOutPanel**: sent, dropped, would-have-said, quiet-mode switch

Use the Exchange visual style from its product spec. The platform package exports no React components and does not depend on React.

## 18. Demo mode

**Starting without Twitch keys**

- With no Twitch client ID or secret, the app still starts using bundled demo assets and makes no authenticated Twitch requests.
- The dashboard shows "Demo mode: simulated chat only" with a link to the setup guide, and a large **Start demo** button.
- Every engine feature is reachable from the simulator.

**Goal:** a judge runs `pnpm i && pnpm dev:exchange` and sees the overlay working within 2 minutes ([ADR 0008](../adr/0008-simulator-and-demo-mode.md)).

## 19. Testing

- **Unit tests** (`node:test`): EventSub state machine (recorded frames based on the Twitch docs examples), normalizer (common event envelope, fragments, third-party matching, foreign and self-sent), bounded chat-out queue (fake clock), command parser, catalog precedence, browser-bound OAuth state, serialized refresh, Host and Origin guards, and lossless moment coalescing.
- **Mixed-source safety:** simulated follows, raids and closing bells produce zero live sends while a broadcaster is connected; test both reply and ambient effects.
- **Manual protocol check** with the Twitch CLI mock server, for reconnects and follow/raid triggers. The commands are listed in Sprint 1.
- **App smoke test**: start in demo mode, run a scenario, assert on `GET /api/snapshot`.
- **CI** (GitHub Actions, Node 24.12+): frozen install, `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm build`, and a production HTTP smoke check on every push and pull request.

## 20. Non-goals

- A hosted or multi-tenant service
- Twitch Extensions, IRC, webhooks, conduits
- More than one channel
- Affiliate-only features in the core (subs, Bits, Channel Points, polls, predictions)
- Mobile layouts and translations

## 21. Left to the builder

- Module APIs and file names inside the layout
- Log format
- Exact backoff timing within the stated bounds
- Dashboard visual style
- Client-only presentation helpers within the app
