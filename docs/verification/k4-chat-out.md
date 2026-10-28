# K4 chat-out verification

Completed October 28, 2026. Scope: the shared Helix client, pure outgoing queue, runtime, guarded dashboard controls and sent-ID echo lookup. No dependency was added.

## Automated checks

`pnpm check`, `pnpm lint`, `pnpm test`, `pnpm build` and `pnpm smoke` passed. The suite has 62 tests: 53 in Twitch Kit and 9 in the app.

- `100 queued replies respect one per second and 18 per rolling 30 seconds, then expire` and `100 live replies remain rate limited through the real queue/Helix boundary`: fake clock and stubbed fetch verify the rate limits for 100 replies, 18 requests in the first window, and expiry of the remaining 82. Physical retry attempts reserve slots too.
- `reply priority, ambient eviction, duplicate collapse, reply-only capacity and bounded diagnostics`: ambient eviction over 10 pending, reply-only capacity 100, newest-reply rejection, duplicate collapse and 100 diagnostic entries.
- `a reply arriving during the cooldown overtakes pending ambient output`: a failing test exposed premature ambient selection during cooldown; selection now waits until a send slot is available.
- `simulation and demo output bypass the live queue and provenance is rechecked before each attempt` and `simulated replies and ambient raid/follow/bell effects never fetch even while live; demo output previews only`: simulated replies, raids, follows and bell output produce zero requests with live auth present; no-connection output stays local. A forged simulated in-flight item also fails the send guard.
- `quiet mode flushes pending messages, sent IDs expire after two minutes, and truncation preserves words and Unicode`: saved policy applies to pending output, two-minute sent-ID memory, 500-character cap and word-boundary ellipsis.
- `chat runtime prefers bot, falls back to broadcaster, passes reply IDs and marks sent echoes for two minutes`: role and token selection, broadcaster/channel identity, reply-parent ID and self-sent lookup. EventSub now uses that lookup.
- `provider drops and network failures expose fixed diagnostics, with no provider body or token` and `transport errors and account changes drop output without retrying or exposing exception text`: `is_sent: false`, safe drop codes, no exception/provider body leaks and discarded output after broadcaster change.
- `retries recheck quiet mode and count against the local rate limit`: turning quiet mode on while waiting for a retry prevents a second request.
- Helix tests verify headers, safe method/path/status logging, shared refresh after concurrent 401s, one retry, 429 reset timing, cancellation, delivery deadlines and rejection of arbitrary bearer destinations. Review added a failing test for an already-past reset timestamp; the fix retries immediately while keeping the caller's deadline.
- `chat actions are guarded, demo preview stays local, and quiet mode persists`: Host/Origin/X-CTA requirements, disabled live action without login, fixed-text preview, boolean validation and quiet setting restored after a fresh runtime. Public diagnostics contain app-generated output only.
- Existing EventSub runner tests still pass after replacing its private fetch/retry loop with the shared Helix client. Production smoke includes the initial chat-out projection and existing static/SSE/security checks.

API behavior was checked against the [Send Chat Message reference](https://dev.twitch.tv/docs/api/reference#send-chat-message), [sending/receiving guide](https://dev.twitch.tv/docs/chat/send-receive-messages/) and [Helix rate-limit guide](https://dev.twitch.tv/docs/api/guide). Unknown provider drop codes become the fixed `twitch_dropped` diagnostic rather than exposing provider error text.

## Live check

1. Restarted the production app. Saved broadcaster and bot roles restored, EventSub connected and all five subscriptions enabled. Outgoing sender was `bot` with an empty queue and quiet mode off.
2. Browser automation clicked only **Preview without sending**; public logs gained simulated **Would have said** entries and no sent entries.
3. Asked the streamer to refresh the dashboard and click **Send test message** once. They replied “sent”, confirming it appeared in Twitch chat.
4. The public snapshot recorded exactly “Emote Exchange connected”, `origin: twitch`, `kind: sent`, `is_sent: true`, HTTP 200, no drop reason, no pending or in-flight output. EventSub counted the returned chat event.

Both roles currently use the same Twitch identity. Bot-role selection is verified; a separate bot identity and live broadcaster-only fallback are not. Broadcaster fallback is covered with injected identities and tokens. No message was sent automatically by browser verification or during app startup.

## Browser and overlay

Headless Edge checked the built live dashboard at 1920 × 1080 and 960 × 540. The live send control was enabled, previews rendered under **Would have said**, and no horizontal overflow or page errors occurred. A separate app process with empty credential variables and fresh temporary storage disabled live sending, allowed previews and retained quiet mode across page reload. Runtime persistence is separately tested across restart.

The first browser check caught the controlled checkbox reverting while it waited for SSE. It now reflects the pending choice immediately and restores server state on failure. Screenshots of both outgoing panels were visually inspected. The real `/overlay` route was viewed in demo mode at 1920 × 1080 and 960 × 540, including transparency, label placement and scale. These were browser checks; the actual OBS application was not used. Local screenshots and verification scripts remain git-ignored in `artifacts/k4/`.

Remaining work: K5 catalog, K6 simulator, K7 complete setup panels, then the Exchange market. This queue accepts future app-generated effects; no market commands or simulator are claimed implemented yet.
