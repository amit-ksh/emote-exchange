# Isolated hosted Twitch channels

Accepted November 2, 2026. The owner requested that other streamers connect their own Twitch accounts, with a separate market, settings and bot connection. They first required deployment and the local product demo, which are now complete, and explicitly requested this remaining implementation and verification.

Implementation status: planned, not implemented or verified. The deployed app still admits only the configured owner under ADR 0010. The decision below describes the target architecture, not current behavior.

## Decision

Hosted mode may serve multiple independent channels from one Node process. This supersedes ADR 0010's single-owner admission restriction and the multi-channel non-goals in the original specs for hosted mode only. Local mode remains one process, one local Exchange.

Use Twitch-validated broadcaster IDs as channel identities. A browser session selects its authorized channel; a request parameter never selects a private dashboard or action. Bot authorization is bound to the initiating channel's session. Each channel owns its auth lifecycle, EventSub connection, catalog, market engine, simulator, chat-out queue, analytics, settings and SSE buses. Nothing is shared between game runtimes.

Keep the existing primary channel's unprefixed database tables and `/overlay` link working. Other channels receive separate physical tables in the same selected Turso database. Table prefixes derive only from validated numeric Twitch IDs. SQL values remain bound parameters; a schema-derived identifier mapping qualifies checked-in statements while preserving string literals and comments. Schema versions, atomic acknowledged writes and writer fencing are independent per channel. Restore reads only that channel's known schema tables.

The server maintains a small channel directory, admitting at most ten channels on this single-instance deployment. Admission is serialized and capped before allocating a runtime. This bounds persistent WebSockets, mirrors, timers and catalog work; it does not promise unlimited hosted capacity. Reconnects reuse the same broadcaster ID, including after a login rename. The existing primary channel is registered from its stored validated identity without moving or resetting its game data.

Public overlays use `/overlay?channel=<broadcaster-id>` with the same channel selector propagated to the public snapshot and SSE reader. Missing selectors retain the original primary overlay alias. An unknown selector fails rather than falling back to another channel. Public data remains the explicit names/numbers/emote projection; private snapshots, analytics, settings, bot connection and guarded actions are selected exclusively by the valid session. Preserve exact Host/Origin checks, X-CTA and no CORS.

OAuth remains one Twitch developer application, with the same confidential server-side client ID/secret and callback. Each streamer grants their own broadcaster token; optional bot grants belong to that channel. A wrong-channel or expired session cannot finish bot authorization. Logout closes the current dashboard streams without disconnecting other channel sessions or revoking their tokens. Restart requires browser sign-in again, while committed game state and channel credentials restore separately.

## Verification boundaries

Test through the existing Store and HTTP interfaces: two channels with the same Trader IDs and Tickers retain different balances/settings; independent restart/fencing; browser-bound OAuth selects the correct runtime; cross-channel parameters/cookies cannot read or mutate another dashboard or bot connection; public overlays and SSE receive only their selected market; mixed simulated output never reaches Twitch. Keep the primary channel compatibility checks and the full local-mode suite.

Real second-streamer OAuth and cross-channel live traffic require that streamer's manual account authorization. Deterministic two-identity integration tests establish isolation independently; they do not establish a real second account authorization. Deploy only after all standard checks and the local isolation acceptance checks pass. No new dependency is needed.
