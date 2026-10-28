# E3 runtime, commands and recovery verification

Implemented October 28, 2026. Automated verification passes; the sprint's real-account buy acceptance is **pending**. See [the written plan](../plans/e3-runtime-and-recovery.md). No dependency or product UI was added.

## Runtime and storage

Normalized Twitch and simulator events enter the same pure engine using the injected processing clock. A one-second timer applies Tick. Catalog refreshes replace the resolved catalog without changing active Listing identities. All persist effects from one input and the final versioned checkpoint commit in one SQLite transaction before assigning state, publishing moments or queuing replies. Write failure preserves the last committed Portfolio, emits no success effects and exposes fixed `storage-error` status until restart.

Migration 2 adds Traders, Listings, Holdings, Trades, credits, candles, sessions, first-message facts and the singleton engine checkpoint alongside the existing platform tables. Values use bound parameters; Reset table names come from a fixed code list. Listing rows include approved Emote/scalar metadata JSON alongside the documented columns. Trade history is never loaded into the engine or copied into its checkpoint. Tokens remain separate in platform storage.

Checkpoint version 1 holds settings, processing/tick/start times, Pause, session identity, Raid window, pending Uses, repeat histories, trade/reply cooldowns, participation, delivery suppression and bounded Listing rule/history data. Traders, Holdings, candles, sessions and first-message facts restore from separate rows. Unsupported, missing, backwards or malformed checkpoints fail rather than silently resetting the market.

Same-time restoration preserves business/rule state and clears ephemeral Feed/moment playback. Short downtime analytically decays Heat/impact over the gap, retains cached base/Price until a normal tick, and expires windows without inventing rewards, candles or effects. At ten minutes or longer, stale Heat/impact/pending/repeats clear while Portfolios, cached Prices and session flags remain. Unexpired Halt deadlines survive; expired deadlines are cleared and saved on startup. Recovered state commits without manufacturing a tick or replaying output.

## Commands and display

The engine handles `!portfolio`/`!pf`, `!top` and `!market`, including a TOP pulse moment and fixed help text. Portfolio replies show shares, cost-basis-relative change and integer Net Worth. The existing queue caps output at 500 characters. Unknown bot commands stay silent.

`!market pause/resume`, `!delist`, `!freeze` and `!unfreeze` require normalized Mod or broadcaster badges. VIP/subscriber badges do not authorize them. Targets resolve to known Listings/Traders before dispatching trusted actions. The runtime persists a per-Trader deadline allowing at most one command reply every 20 seconds; a suppressed reply never reverses a fill or removes its feedback. Ambient closing summaries are separate from that budget. All output goes through the existing chat-out queue with causal origin.

Snapshots/SSE add an explicit `market` projection: approved Listing names/images, Prices, Heat, Halt deadlines, candles, holder counts, Trader names/colors, integer Coins, capped display Net Worth, Holdings, session and five-item Feed. Raw chat, command arguments, checkpoints, reply deadlines and tokens are excluded. Foundation panels remain visible until E4/E5 render the market.

## Automated evidence

| Check | Public test evidence |
|---|---|
| Acceptance 11: exact restart | `same-timestamp restore preserves business and bounded rule state without replaying Feed`: actual buy, pending IPO, participation, cooldown and session round-trip; restored rows are detached. |
| Downtime | `short and long downtime expire windows without invented Stipends candles or repeated Moon effects`: 15-second analytical decay, unchanged cached Price 180, normal tick 156.57, retained Halt, exact ten-minute stale-state reset, no repeated Moon or invented Stipend; backwards/version rejection. |
| Invalid data | `malformed persisted rules cannot silently become a fresh or numerically invalid market`: rejects invalid flags, timestamps, deadlines, Heat/impact/history Prices and rows without a checkpoint. |
| Atomic SQLite | `SQLite rows and checkpoint reopen equivalent and a failed event rolls back every durable change`: real file-backed reopen; an invalid row rolls back preceding valid changes and checkpoint; Reset clears business state. |
| Delist/re-IPO | `Delist followed by a fresh IPO cannot restore candles from the old Listing`: review regression at Halt expiry, preventing an old candle open 273.74 from becoming the fresh IPO's open 100. |
| Commands/roles | Both `commands.test.ts` cases: Portfolio aliases, top/help, unknown-command silence, VIP/subscriber denials, Mod Pause/Freeze/Unfreeze and broadcaster Delist. |
| Output ordering and budget | `runtime persists before publishing or queuing...`: callbacks observe committed SQLite state; a second fill succeeds with reply suppressed; deadline survives restart and expires exactly at 20 seconds. |
| Write failure | `a storage failure delivers no reply or success moment...`: preserves Portfolio, publishes fixed error status, and refuses later commands until restart. |
| Acceptance 12/provenance | `100 live portfolio commands respect the real queue limits...`: engine replies traverse the real queue with mocked Helix; sends stay one second apart and at most 18 in every rolling 30 seconds. Simulated replies/follows/raids/closing summary make no live send with a connected sender. |
| Actual simulator safety | `real simulator follow raid and bell effects pass through the market and never send live chat`: actual simulator -> engine -> queue/Helix adapters, with zero fetches for SIM output. Obsolete diagnostic notices were removed. |
| App wiring | `normalized chat and simulator events drive persisted market snapshots...`: IPO DemoBull, buy leaves 495 Coins, Trade in snapshot/moments and queue preview, Price moves on tick; no raw text/internal histories/reply map. |
| Keyless acceptance 1 | `keyless Opening day lists at least four emotes within two minutes through automatic app ticks`: real simulator -> engine -> SQLite -> snapshot path with injected clock/timers, actual fills and SIM previews. |

`pnpm check`, `pnpm lint`, `pnpm test` (119 tests: 70 Twitch Kit, 49 app), `pnpm build` and `pnpm smoke` pass. Production smoke starts the built app without credentials, checking routes, guards, SSE/client lifecycle, assets, simulator and real FOLLOW/RAID/BELL moments plus closing summary preview. No new visual/OBS result is claimed. Full runtime soak/performance remains E6.

## Live acceptance pending

The development app runs on port 4100 with the existing private configuration. Broadcaster and bot reconnect as `ammit_ksh`; EventSub is connected with all five subscriptions enabled. A guarded Opening day run prepared DemoBull, then the simulator was stopped. This is connectivity evidence, **not a real buy**.

Remaining human step: from a second Twitch account that is not the connected bot, send `!buy DemoBull 1` in `ammit_ksh` chat. Verify its Coins/Holding in `/api/snapshot`, a Twitch-origin Trade and a successful outgoing queue log/reply. If halted, wait for expiry and retry after the reply budget. The connected bot's messages are deliberately ignored, even when it is also the broadcaster. No account was disconnected to bypass this. Only the public username and message are needed; no new app credentials are required.
