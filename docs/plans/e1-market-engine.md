# E1 implementation plan

October 28, 2026. The E0 gate passes with unchanged defaults. This is the written plan requested by Sprint 2; no build-session video has been captured in this task.

## Public interface and scope

Test the pure market interface named in the E1 task: `initialMarketState(options)`, `stepMarket(state, input, now)` and `marketDisplay(state)`. Inputs are normalized ChatEvents or an explicit Tick. Initialization accepts validated settings, recognized Emotes and explicit fixture seed Listings. Deterministic rules do not consume randomness. Runtime wiring, SQL, commands/replies, fills and market UI are separate E2–E5 tasks.

State holds Traders keyed by identity, up to 24 active Listings, pending IPO Uses, repeat windows, candles and bounded Price samples. Use Maps so valid symbol tickers and prototype-like names are ordinary keys. All timestamps use injected integer milliseconds. Events at a shared timestamp are applied in recorded order before the tick; t=0 has zero elapsed time. Reject backwards processing time.

Only recognized commands create a Trader; foreign and self-sent messages are ignored. Non-command chat creates a Trader, even without an Emote. An Emote is counted once per message by ticker; catalog precedence resolves metadata, and authoritative Twitch fragments remain valid when absent from the catalog. Keep raw text and command arguments out of state/effects/display. Later command execution remains E2/E3 work.

## Test-first slices

1. Trader identity, qualifying-use filtering, repeat attenuation and IPO: one Chatter cannot IPO alone; two within ten minutes list at 100 and emit a stable, provenance-carrying IPO moment.
2. Exact 30-second repeat and ten-minute IPO boundaries, pending eligibility, capacity and coldest-unused auto-Delist; deterministic ties. Auto-Delist has no Holdings to settle in E1; E2 must add atomic payouts with trading.
3. Tick calculations using unchanged E0 defaults. Run fixed B1/B2/B3/B5 events through the engine interface with explicit seeds, comparing measured endpoints and thresholds. Verify a quiet base, impact decay, rounded Price floor and 1–3 Listing attention scaling.
4. Histories: current plus ten previous minute candles, ten minutes of Price samples plus one boundary sample, 30-second repeats and ten-minute pending Uses pruned on every input. Verify long runs, stale pending removal and input-state immutability.
5. Settings validation and display/effect review. Persistence effects describe changed business rows and checkpoint need; broadcast effects use an explicit display projection with fixed moments, never raw chat or the internal engine state.

## Completion checks

Run `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm experiment:market`, `pnpm build` and `pnpm smoke`. Record named tests and numerical measurements. Review against the repository's Code Review Rules and commit E1 separately. No UI changes or new dependency are planned, so K7's browser evidence remains separate; this task does not claim a working on-screen market, actual OBS or recorded footage.
