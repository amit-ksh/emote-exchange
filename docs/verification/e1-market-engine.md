# E1 market-engine verification

Completed October 28, 2026. The pure engine implements Traders, qualifying Uses, IPOs, Heat, base/impact Price ticks and bounded chart data. No dependency, formula, fixture threshold or default constant changed. The [written plan](../plans/e1-market-engine.md) preceded implementation; no video recording was made.

## Interface and scope

`initialMarketState(options)` accepts injected integer-millisecond time, a resolved Emote catalog, validated settings overrides and optional explicit seed Listings for deterministic fixtures. `stepMarket(state, input, now)` returns a new state and typed effects. Inputs are normalized ChatEvents or Tick. These deterministic rules consume no RNG. The runtime must apply events in recorded order before the tick at the same logical timestamp. Source envelopes retain identity/origin; the injected `now` is the processing clock, and backwards processing time is rejected.

The engine reads no real clock, random source, database or network. It calls no chat sender. `marketDisplay(state)` contains only Trader count and approved Listing names/images/numbers. Raw chat, command arguments and arbitrary connection details are never retained in the engine state or effects. Resolved catalog metadata wins by name; uncatalogued authoritative Twitch fragments are accepted with validated Twitch keys/CDN URLs. Other unknown third-party names cannot grow pending IPO state. Symbol tickers and `__proto__` are ordinary Map keys.

Persist effects describe changed Trader/Listing rows, delisted rows, current candle writes, a candle retention cutoff and the requirement to checkpoint the returned state atomically. They do not perform SQL or serialize Maps to JSON. Broadcast effects carry an explicit display projection and stable IPO/DELIST moments with causal origin. E3 owns storage encoding and runtime execution. Callers treat returned state as immutable; copy-on-write arrays/records preserve prior states without copying the entire chart on every message. Effect rows are detached from state.

All spec defaults for this slice live in `src/engine/settings.ts`. Unknown settings, non-finite values, invalid ranges, fractional Coins, more than 24 Listings, malformed seed data and invalid/backwards clocks are rejected. Starting Coins range is 0–1,000,000,000 whole Coins; Heat half-life is 1–3,600 seconds. These are server-side validation bounds; no new settings UI ships in E1. Fixed rules such as 30-second repeats, the 30-minute idle Delist criterion and one-minute candle buckets are not tuning controls.

## Test-first evidence

The ten new `test/market.test.ts` cases use only the public engine seam, explicit inputs/state and returned effects. Each new behavior slice was run red before its implementation. The fixed B2/B5 acceptance cases also confirmed the general tick behavior already introduced by B1/B3.

- `two distinct Chatters IPO at 100 with one Use per Emote per message and safe SIM effects`: ten repeated messages from one Chatter cannot IPO alone. Ten attenuated Uses plus one fresh Chatter produce Heat 2.998046875, Price/reference 100, integer initial Coins and a SIM IPO moment. Repeated copies inside a message count once.
- `foreign, self-sent and command chat never adds Heat; recognized commands and plain chat keep Trader identity`: ignores foreign/self-sent/unknown-bot commands, creates Traders for recognized commands and plain chat, and updates renamed identities without resetting Coins or creation time. Command execution/replies are not implemented here.
- `repeat Uses expire at 30 seconds and pending IPO Uses at ten minutes on every input`: verifies just-before/exact boundaries and cleanup on Tick and non-chat input. Pending Heat at IPO sums the decayed qualifying contributions that remain in the IPO window.
- `B1 and B3 match the fixed E0 endpoints through real Heat and price ticks`: A60 **181.64**, maximum over 0–60 seconds **185.05**, A360 **18.75**. Both thresholds pass.
- `B2 and B5 preserve the lone-spammer ceiling and all three small-chat attention shifts`: B2 A peak **112.99**, B30 **129.68**. B5 A30 **118.71**; B59/B90 **122.82/149.94**; C119/C150 **109.16/141.24**. All three increases exceed 15%, matching E0 exactly.
- `a full market waits for a slot then auto-Delists the coldest thirty-minute-unused Listing deterministically`: 25th Listing waits, exact idle boundary opens a slot, equal Heat ties resolve by IPO time then code-point ticker order, and both row changes/moments retain SIM origin. There are no Holdings to settle yet; E2 must add atomic Delist payouts when trading is added.
- `symbol tickers and uncatalogued authoritative Twitch fragments work while unknown third-party words do not IPO`: valid symbol/prototype-like names and uncatalogued Twitch fragments work; unknown provider words and a hostile image URL do not enter the market.
- `quiet bases freeze while impact decays, and real tick candles/history stay bounded without invented gap samples`: quiet base stays 100 while seeded Price 200 decays to 150 after 30 seconds; Price floor/cent rounding are checked. A 20-minute tick run retains 11 minute candles and 601 actual one-second Price samples. Subsecond calls remain bounded; a gap creates no invented intermediate samples/candles; pruning also runs on non-chat inputs.
- `settings, clocks and explicit seeds are validated and configured starting Coins remain whole`: checks settings boundaries, input isolation, configured Heat half-life, duplicate/excess seeds and malformed inputs.
- `early markets scale attention as four Listings and preserve the real IPO sample under subsecond ticks`: one/two Listing prices after 20 seconds are **215.58/143.10**; prior state and returned writes are isolated. A review test exposed loss of the first actual IPO sample during subsecond coalescing; the fix preserves that sample while retaining the per-second bound.

## Input/engine load probe

Reproduce with `pnpm probe:market`. It uses the real bundled assets, K6 Soak profile and normalized simulator output with seed 42. It drives 40 virtual minutes at 50 chat messages/second, warms up for ten minutes, then measures 1,800 engine ticks. This is an E1 input/engine probe, **not the full product soak**: no fills, SQL transactions, SSE clients, banner queues, Twitch sends or rendering are exercised.

Observed on Windows x64, Node v24.22.1, **13th Gen Intel Core i5-13420H**:

| Measurement | Result |
|---|---:|
| Messages | 120,000 |
| Active Listings after warm-up | 24, stable |
| Traders after warm-up | 500, stable |
| Tick p95 | 1.2646 ms |
| Maximum measured tick | 4.8353 ms |
| Peak sampled process heap | 129.31 MiB |
| Total wall time | 64.00 seconds |

Every tick checks at most 11 candles and 602 retained Price samples per Listing, 30-second repeat windows, ten-minute pending windows and finite Prices at least 1. The final cohort has exactly 1,000 integer Coins each, SIM provenance and `sim_` names. Heap includes simulator/Node/module overhead and is sampled without forced GC; it is not a zero-growth assertion or a portable CI timing limit. The full trading/runtime soak and its measurements remain E6/hardening work.

## Completion checks and remaining work

`pnpm check`, `pnpm lint`, `pnpm test` (94 tests: 70 Twitch Kit, 24 app), `pnpm experiment:market`, `pnpm build` and `pnpm smoke` pass. Reviewed the engine for real clock/random/IO calls, raw-chat retention, fractional Coins and chat-output bypasses; none remain. No UI changed in E1, so K7's browser and full/half overlay evidence remains separate. The running dashboard still shows the foundation until E3/E4 wire and display market state. E2 adds actual fills, fees, cooldowns, rewards, halts, session bells and payouts; B4 still needs a real trade-engine test. Persistence/recovery, command replies, actual OBS and live trading acceptance remain pending.
