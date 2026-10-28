# Sprint 1: Twitch Kit

**Goal:** live chat flows in from your channel, a test message goes out, the simulator drives the same events, demo mode works.
**Spec:** [../specs/twitch-kit.md](../specs/twitch-kit.md). Calendar: [sprint index](README.md).
**Before starting:** complete Sprint 0, prepare emotes and OBS using the setup guide, and put the one Twitch app's client ID and secret in `apps/emote-exchange/.env` for live checks. Automated and demo checks must also pass with no keys or network.

Order matters for K1-K3. K4 and K5 can be delegated independently once their public interfaces are agreed. Prefer a working vertical slice of broadcaster login, incoming chat and safe replies before expanding optional bot support or provider polish. All client panels live in the app; `packages/twitch-kit` contains no React UI.

## K1 Store, settings and the HTTP security baseline

**Complete — October 28, 2026.** Storage, settings, bounded SSE and the guarded dashboard check are implemented. All 27 tests at that milestone and the required checks passed. Development and production browser verification passed at port 4100. See [K1 verification](../verification/k1-platform.md).

```text
Read AGENTS.md and docs/specs/twitch-kit.md sections 13 (Store), 14 (Overlay bus), 15 (HTTP server and security). Task K1.

Build in packages/twitch-kit:
1. The node:sqlite store: open DATA_DIR/emote-exchange.sqlite with WAL and foreign keys, a migrations runner using PRAGMA user_version, the platform tables tokens, kv and emote_cache, and a helper that applies a batch of writes in one transaction.
2. The settings helper over kv: typed get/set with defaults supplied by the app.
3. Extend the scaffold's overlay bus: SSE with snapshot-on-connect, replacement-projection deltas, a ping every 15 s, v and seq on every JSON payload, at most 10 updates per second per client, plus GET /api/snapshot. Preserve still-current trade/banner moments with stable IDs in bounded queues; replacing intermediate prices must not lose moments. Close slow clients above 1 MiB pending output and clean up clients/timers on disconnect.
4. Extend the scaffold's security guard: validate exact Host on all routes, static/Vite handling and upgrades. Every state-changing method, including POST, PUT, PATCH and DELETE, requires Origin to be http://localhost:<PORT> or http://127.0.0.1:<PORT> and X-CTA: 1. Reject other hosts/origins, null or missing origins and wrong/missing headers with 403; cap action bodies at 64 KiB. No CORS headers anywhere. Vite runs as same-origin middleware on 4100 with cors:false and HMR on the same HTTP server; no separate dev port or origin exception.

Test first: migrations apply once and are idempotent, the transaction helper rolls back on error, SSE sends a snapshot first and increases seq, coalescing retains queued moments, slow clients are bounded and cleaned up, the guard rejects hostile/missing Host, missing/null/wrong Origin and missing/wrong header, and accepts both exact loopback origins. Verify PATCH, preflight rejection, oversized bodies and absence of CORS headers. Use the HTTP/public-bus interface rather than private implementation details.
Done when all tests pass and the Emote Exchange dashboard at 4100 can POST a dummy action through the guard in development and production.
```

## K2 Auth (authorization code flow, two roles)

**Complete — October 28, 2026.** The broadcaster was authorized manually and restored after app restart/startup validation. Both roles restore, but currently use the same Twitch account; a dedicated bot identity remains an optional check. Automated OAuth/lifecycle checks and connection controls pass. See [K2 verification](../verification/k2-auth.md).

```text
Read docs/specs/twitch-kit.md section 6 (Auth) and ADR 0004. Task K2.

Implement GET /auth/login?role=broadcaster|bot, GET /auth/callback, POST /api/auth/disconnect, token storage in the tokens table, validation on start and hourly, refresh at less than 5 minutes left or after a 401, and revocation handling. First canonicalize login to PUBLIC_ORIGIN so its browser cookie returns on the registered callback hostname. State is single-use, 32 random bytes, 10-minute expiry, bound to a role and an independent browser nonce cookie (HttpOnly, SameSite=Lax, host-only, Path=/auth). Consume state and clear the cookie for success, denial and failure. Validate client ID and required scopes before storing tokens. Scopes per role exactly as in the spec. The bot role adds force_verify=true. Serialize refresh per role and prevent an in-flight refresh from restoring a disconnected account.

Test first, with fetch stubbed: the authorize URL has the right params, the alternate allowed hostname redirects to PUBLIC_ORIGIN before setting state, bad/expired/reused state or a missing/mismatched cookie is rejected, denial consumes state, code exchange then validation stores the right user/scopes only for our client, concurrent 401s share one refresh, disconnect wins over pending refresh, invalid_grant disconnects the role, and no token/code ever appears in a public payload or log line.
Then wire the ConnectionPanel data into GET /api/snapshot: per role, connected or not, login, scopes.
Done when tests pass and broadcaster login survives restart on the Emote Exchange dashboard. Verify the optional bot role when a second account is available; track an unavailable live check honestly rather than claiming it passed. Document exact clicks in the app README.
```

**You check:** log in as broadcaster and, if available, as bot. Each connected role survives restart. Disconnect removes that role without stopping demo mode.

## K3 EventSub client and ChatEvents

**Complete — October 28, 2026.** Real saved login restored, EventSub connected, all five subscriptions enabled, and the streamer's chat message increased both counters from 0 to 1. Protocol, normalizer and runner checks pass; raw chat remains server-side. See [K3 verification](../verification/k3-eventsub.md).

```text
Read docs/specs/twitch-kit.md sections 7 (EventSub client) and 8 (ChatEvents), and ADR 0006. Task K3.

1. A pure EventSub protocol state machine: inputs are frames and timer ticks, outputs are actions (open, close, create subscriptions, emit). Cover welcome, the subscribe-within-10s rule, the keepalive watchdog (timeout + 5 s), session_reconnect (keep the old socket until the new welcome, no resubscribe), lost connection (backoff 1, 2, 5, 10, 30 s, then resubscribe), dedupe by metadata.message_id (2,000 entries, 10 minutes), revocation, and close codes.
2. A thin runner using Node's global WebSocket and timers, with EVENTSUB_WS_URL and EVENTSUB_SUBSCRIPTIONS_URL from config. Open the socket without bearer credentials; set the keepalive parameter using URL parsing and use the returned welcome timeout.
3. Create only Exchange's declared subscriptions from section 7 with authenticated Helix requests using the broadcaster token and the welcome session ID. Do not subscribe to unused chat-moderation events. Report per-subscription status on the snapshot.
4. The normalizer from Twitch payloads to ChatEvents: common id/at/origin envelope for every event, emote/mention/text parts, command parsing (section 12), foreign (shared chat source differs from the broadcaster), selfSent (bot account, or a message ID the chat-out queue recently sent). Third-party emote matching goes through an interface that K5 implements. Stub it for now. Preserve event provenance for downstream say effects and use event IDs to avoid duplicate bonus/bell processing.

Test first with recorded frames shaped like the Twitch docs examples. Put the fixtures in packages/twitch-kit/test/fixtures/. Cover the common envelope for chat, follows, raids and stream status, duplicate delivery, and reconnect without duplicate subscriptions. Follow the primary source linked in spec section 7.
Done when tests pass, and with my real login the dashboard shows "EventSub connected", all subscriptions enabled, and a live event counter that goes up when I type in my channel's chat.
```

**You check with the Twitch CLI mock:**

```sh
twitch event websocket start-server
# in .env: EVENTSUB_WS_URL=ws://127.0.0.1:8080/ws  EVENTSUB_SUBSCRIPTIONS_URL=http://127.0.0.1:8080/eventsub/subscriptions
twitch event trigger channel.follow --transport=websocket
twitch event trigger channel.raid --transport=websocket
twitch event websocket reconnect      # the app should move to the new session without resubscribing
```

Run `twitch event trigger --help` to see which other events the mock supports. The simulator covers chat messages.

## K4 Helix client and chat-out queue

**Complete — October 28, 2026.** The streamer clicked **Send test message** and confirmed it appeared in Twitch. The queue used the bot role and recorded HTTP 200 with `is_sent: true`. Both roles currently identify the same account; a distinct bot identity remains optional and unverified. Rate limits, bounded queues, quiet mode, preview isolation and safe Helix retries pass automated checks. See [K4 verification](../verification/k4-chat-out.md).

```text
Read docs/specs/twitch-kit.md sections 10 (Helix client) and 11 (Chat-out queue). Task K4.

Build the Helix fetch wrapper (headers, 10 s timeout, serialized 401 refresh-and-retry once, 429 wait for Ratelimit-Reset then retry once, safe logging) and the chat-out queue: sender selection (bot, else broadcaster), at most 1 message per second and 18 per rolling 30 s, reply-before-ambient priority, discard oldest ambient above 10 pending, hard capacity 100 (reject newest if all replies), 30-second expiry, collapse duplicates, 500-character cap cut on a word boundary, reply_parent_message_id, remember sent message IDs for 2 minutes for selfSent marking, record is_sent false/drop_reason, quiet mode, and bounded 100-entry diagnostic logs. Every queued item carries origin. Route every simulated effect, including ambient output from raid/follow/bell events, and all demo output to Would Have Said before live enqueue and recheck provenance before send.

Test first with a fake clock and a stubbed fetch: rate limits hold under a burst of 100, reply-only queues remain bounded, ambient eviction/expiry/drop diagnostics work, truncation is correct, and neither simulated replies nor ambient output call fetch even while connected live. Test refresh sharing with concurrent requests.
Done when tests pass and a "Send test message" button on the ChatOutPanel posts "Emote Exchange connected" to the channel from the bot if connected, otherwise the broadcaster. This explicitly requested live test is separate from simulator controls.
```

## K5 Emote catalog

**Complete — October 28, 2026.** All four providers, persisted fallback, case-sensitive precedence, normalizer lookup and 24 original bundled demo emotes are implemented. The streamer added `BOB` to the channel's 7TV set; refresh returned one ready channel emote and the dashboard exposed it alongside global provider counts. Offline startup and full/half overlay browser checks passed. See [K5 verification](../verification/k5-emotes.md). K6–K7 remain pending.

```text
Read docs/specs/twitch-kit.md section 9 (Emote catalog) and docs/resources.md (third-party emote providers). Task K5.

Build providers for Twitch (channel + global via Helix), 7TV, BTTV, FFZ (via BTTV's cache) and the bundled original demo set (files in client/public/demo-emotes/, the name is the file name). Then: precedence (channel before global; Twitch, 7TV, BTTV, FFZ), refresh every 30 minutes, persistence of the last good result in emote_cache, and lookups (is this word an emote, plus its key, name and image URL). Plug it into K3's normalizer interface for third-party matching. Demo startup and scenarios use bundled assets immediately; optional public globals enrich them in the background and cannot block startup.

Test first with recorded JSON responses in test/fixtures (keep them small, a few emotes each): parsing each provider, precedence on name clashes, failure falls back to cache, case-sensitive matching, and complete demo catalog availability with all network calls failing.
Done when tests pass and the dashboard lists the emote counts per provider for my channel, including my 7TV emotes.
```

## K6 Simulator and demo mode

```text
Read docs/specs/twitch-kit.md sections 16 (Simulator) and 18 (Demo mode), and ADR 0008. Task K6.

Build the seeded simulator: start/stop, rate 0.2-50 messages per second, chatter count 1-500, platform personas (plain chatter using an original phrase bank you write, emote spammer, follow and raid generator), Exchange scenarios supplied as data/functions, sim_ names with stable colors, the common deterministic id/at/origin:'sim' envelope on every event type, the SIM flag on the snapshot, and nothing ever sent to Twitch. Demo mode: with no Twitch keys the app starts, the snapshot says demo, the dashboard shows the banner and a Start demo button, and bundled original demo emotes are sufficient without network access. Public globals are optional background enrichment.

Test first: the same seed gives the same IDs/timestamps/events, configured rates hold, and all simulated event types never reach the live chat-out sender. Include a connected broadcaster plus simulated closing bell/raid/follow to cover mixed-source operation.
Done when tests pass and, with .env removed and network unavailable, Emote Exchange starts in demo mode and the dashboard's event counter climbs after Start demo.
```

## K7 Dashboard panels

```text
Read docs/specs/twitch-kit.md section 17. Task K7.

Build the React panels in apps/emote-exchange/client: ConnectionPanel, OverlayUrlPanel (copy button plus OBS settings from the setup guide), SimulatorPanel (with Exchange scenarios) and ChatOutPanel. Each posts actions with X-CTA:1 and reads the explicit public state through SSE. Use them on the Exchange dashboard under a simple setup checklist (Connect Twitch, Overlay connected, Go live). The checklist ticks itself from the snapshot. "Overlay connected" ticks when an overlay client connects to /events; this indicates a browser connection, not proof that the client is OBS. The overlay URL always uses 127.0.0.1:4100/overlay by default.
Done when the dashboard at 4100 shows all four panels working with the live connection and in demo mode, copy controls work, and reconnecting clients recover from a new snapshot. Check the real overlay at 1920x1080 and half scale as required by AGENTS.md.
```

## End-of-day demo checkpoint

Run Emote Exchange:
- [ ] Type in the channel's chat from a test account: the dashboard counts events
- [ ] Follow from a test account: the dashboard sees the Follow
- [ ] Send a test message: it arrives from the bot if connected, otherwise the broadcaster
- [ ] With `.env` removed: demo mode starts and the simulator runs
- [ ] With live auth connected: simulated raid/follow/closing-bell effects produce zero live chat sends
- [ ] check, lint, test, build and production smoke checks pass
- [ ] `/review` done, commits pushed, CI green
- [ ] 30-second clip recorded
