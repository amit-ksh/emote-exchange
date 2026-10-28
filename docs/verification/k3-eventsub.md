# K3 EventSub verification

Completed October 28, 2026. Scope: incoming events and connection diagnostics, with no outbound chat.

## Automated checks

`pnpm check`, `pnpm lint`, `pnpm test`, `pnpm build` and `pnpm smoke` passed. The suite has 46 tests: 38 in Twitch Kit and 8 in the app. No dependency was added.

Acceptance evidence:

- `fresh EventSub welcome schedules subscriptions within ten seconds and resets the watchdog`: pure welcome/subscribe effects and returned keepalive timeout + 5 seconds.
- `handoff retains the old socket until welcome and carries subscriptions and delivery deduplication`: unchanged reconnect URL, close after welcome, no repeated subscription creation or delivery.
- `lost sockets back off at 1, 2, 5, 10 and 30 seconds and fresh welcomes resubscribe`: capped retries and new session subscriptions.
- `keepalives extend the returned timeout, delivery memory is bounded and expires, and stop is terminal`: returned 10-second timeout, 2,000-entry cap, 10-minute expiry and cleanup.
- `revocations emit once, bug close codes surface, and untrusted reconnect hosts are rejected`: protocol effects for revocations and 4001/4003 diagnostics.
- `runner opens without credentials, creates exactly five subscriptions, counts deduped events and stops on auth loss`: preserved initial query, keepalive parameter, correct versions/conditions/session and authenticated Helix requests, handoff without repeated requests, private counters-only projection.
- `subscription failures expose status only, refresh once, ignore stale completions and handle revocation`: safe HTTP diagnostics, 401 retry and authorization-revoked disconnect.
- `disconnect cancels subscriptions and late unauthorized responses cannot refresh or restore state`: abort pending work and ignore late responses. This test first failed with five unwanted refreshes; a generation check fixed the race.
- Normalizer tests cover delivery ID versus reply message ID, RFC3339 metadata time, Twitch origin, commands, fragments, roles, foreign/shared chat, bot identity, recently sent IDs, 500-character bounds, follows, raids and online/offline events. K5 and K4 will supply the catalog and sent-ID lookup interfaces.
- Config checks accept official Twitch endpoints or explicit loopback mocks, reject foreign credential destinations, and preserve existing WebSocket query parameters. Production smoke checks include the disconnected no-keys projection, guarded action, SSE and static assets.

Fixtures are small authored examples shaped from the [Twitch WebSocket lifecycle](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/) and [EventSub reference](https://dev.twitch.tv/docs/eventsub/eventsub-reference/). They contain no captured personal messages or credentials.

## Real Twitch check

1. Restarted the local production app with the existing private `.env` and saved tokens. Both account roles restored; they currently identify the same account, as recorded in K2.
2. Public snapshot showed `status: connected`; chat v1, follow v2, raid v1, online v1 and offline v1 all returned HTTP 202 and `enabled`.
3. Asked the streamer to type one message in their own Twitch channel. They replied “sent”. The next public snapshot showed `eventCount: 1` and `chatMessageCount: 1`, both previously 0. All subscriptions remained enabled, with no protocol issue.
4. The app did not send a chat message. This check verifies reception, including counting a message from the currently shared broadcaster/bot identity. A separate bot identity is optional and remains unverified.

The Twitch CLI is not installed on this machine. Its mock reconnect/follow/raid commands were not run. Those paths have injected socket/fetch and pure protocol coverage; real follow/raid notifications and an actual Twitch reconnect handoff remain additional manual checks.

## Browser and overlay

Headless Edge loaded the built live dashboard at 1920 × 1080 and 960 × 540: EventSub connected, five enabled subscriptions, no horizontal overflow and no page errors. A separate process with empty credential variables and fresh temporary storage verified keyless startup and disconnected state. The real `/overlay` route in demo mode was checked at both sizes, including transparent background, no horizontal overflow and proportional label scaling. Screenshots were visually inspected. These are browser checks, not an OBS application check.

Fixed the connection heading to retain its heading semantics while announcing status changes with `aria-live`. Corrected the subscription divider to use the existing border token. Local screenshots and the browser verification script are in git-ignored `artifacts/k3/`.

Market widgets, simulator scenarios, emote catalogs and the chat-out queue remain later tasks. The running app is a connection foundation, not a working Exchange market.
