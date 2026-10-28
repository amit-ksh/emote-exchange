# K1 verification — October 28, 2026

K1 is complete. K2–K7 remain pending; this milestone implements no Twitch login, live chat, simulator or market rules.

## Implementation

- SQLite store creates the app data directory, enables WAL and foreign keys, and applies ordered migrations through `PRAGMA user_version` in one transaction. Platform tables are `tokens`, `kv` and `emote_cache`. Parameterized write batches roll back atomically.
- Typed settings use app defaults, detached JSON values and runtime shape validation. Unsupported values, unknown keys and corrupt stored values are rejected.
- SSE sends a full snapshot on connect, increasing sequence numbers and coalesced replacement projections at no more than ten updates per second. Stable-ID moments are deduplicated, bounded to 100 and expire after 30 seconds by default. A client exceeding the 1 MiB UTF-8 output bound disconnects independently. Abort, cancellation and shutdown release timers/listeners.
- The dashboard's **Test local connection** action requires Origin and `X-CTA`, persists its counter and broadcasts a delta. Configuration resolves `DATA_DIR` against the app directory. Browser projections contain only explicit display fields.

## Acceptance evidence

`pnpm check`, `pnpm lint`, `pnpm test` (27 tests), `pnpm build` and `pnpm smoke` passed.

| Requirement | Evidence |
|---|---|
| Schema creation and restart persistence | `store creates its directory and platform schema once, preserving rows on reopen` |
| Migrations apply once and roll back on failure | `ordered migrations apply once and a failed migration rolls the entire startup back` |
| Future/invalid migrations rejected | `store refuses unordered migrations and databases newer than its known schema` |
| Atomic writes and bound chat-input parameters | `write batches use bound parameters and roll back every write if any statement fails` |
| Typed, isolated persisted settings | Both settings tests in `packages/twitch-kit/test/store.test.ts` |
| Snapshot, sequence and ten-per-second coalescing | First snapshot and burst tests in `packages/twitch-kit/test/bus.test.ts` |
| Moments retained, deduplicated and expired | Stable-ID queue and idle-expiry tests in `bus.test.ts` |
| Byte backpressure and cleanup | Slow-client, heartbeat/abort and closed-bus tests in `bus.test.ts` |
| Host, Origin/header, PATCH, preflight and body bounds | Six HTTP tests in `packages/twitch-kit/test/http.test.ts` |
| Guarded action and restart recovery | `a guarded local connection check is published and survives restart` |
| Development and production dashboard actions | Real headless Edge clicked the button on port 4100 in both modes, observed SSE-updated counts, reloaded, then restarted with the same SQLite directory and observed the retained count |
| Overlay dimensions | Actual `/overlay` checked at 1920 × 1080 and 960 × 540 in both modes; transparent background and label bounds passed; no page errors |

The dashboard screenshot and full/half overlay screenshots were visually inspected. The new status button fits the existing panel; no clipping or visual repairs were needed. Screenshots and the one-off browser check are in ignored `artifacts/k1/`. Actual OBS rendering and live Twitch tests remain separate future checks.

Review caught and fixed a smoke-test timer name collision. The promise-based delay is now separate from the callback timer that bounds SSE reads. The production smoke check uses its own temporary data directory, so it does not modify the streamer's database.

## Resources for upcoming tasks

No credentials were needed for K1. The streamer has confirmed a Twitch channel exists; its public channel name is still needed for live testing. For K2's live verification, register one confidential application in the Twitch developer console, with callback `http://localhost:4100/auth/callback`, and put `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` directly in `apps/emote-exchange/.env`. Keep secrets out of chat.

For later live/recording acceptance: OBS, two test chatters, and original/licensed emotes if a custom set is desired. A bot account is optional. A GitHub remote is needed when pushing and running hosted CI. UI inspiration is already available in the ignored `references/` folder; the user authorized the builder to choose the design direction.
