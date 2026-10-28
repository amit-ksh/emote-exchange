# Sprint 2: Emote Exchange (Thu Oct 29 - Fri Oct 30)

**Goal:** every P0 feature works live and in demo mode, and the P0 portions of acceptance tests 1-13 in the spec pass. Record actual evidence for live/OBS checks 14-15; do not mark them passed from automated tests.
**Spec:** [../specs/emote-exchange.md](../specs/emote-exchange.md). **Words:** [GLOSSARY](../../apps/emote-exchange/GLOSSARY.md).

| Day | Tasks | Demo checkpoint |
|---|---|---|
| Thu Oct 29 | E0, E1, E2, then E3 wiring | Deterministic fixture report, then market tests: prices move, Trades settle and state restores |
| Fri Oct 30 | E4 and E5 in parallel, then E6 | The P0 walkthrough (spec section 4) in demo and live modes, recorded; P1 extras follow only if time remains |

## E0 Prove the behavior fixtures

**Complete — October 28, 2026.** The dependency-free numerical experiment passes B1–B5 with the existing defaults and unchanged fixtures/thresholds. B4 is checked analytically; settlement and market-engine tests remain E1/E2 work. Run `pnpm experiment:market`. See [the measured results and event order](../verification/e0-behavior-fixtures.md). No spec or ADR change was needed.

```text
Read docs/specs/emote-exchange.md sections 5.2, 5.4 and 5.10, and ADR 0009. Task E0.

Before E1, implement a dependency-free numerical experiment for the exact B1-B5 fixtures. Record initial conditions, event order, constants and measured endpoints. B4 checks the impact clamp/decay analytically until trading exists. Do not present this experiment as the app's engine or as completed engine tests. Keep the target thresholds fixed. If a target is incompatible with the formula, record a worked counterexample and agree the required spec/ADR change before building E1.

Done when all five fixed fixtures meet their thresholds with recorded defaults, or the human has resolved a documented incompatibility in the spec/ADR. This is a P0 planning gate.
```

## E1 Market engine: listings, heat, price, ticks, candles

Use `/plan` first. Film the plan.

```text
Read AGENTS.md, docs/specs/emote-exchange.md sections 5.1-5.4 and 5.10, section 11 (Engine contract), apps/emote-exchange/GLOSSARY.md, and ADRs 0006 and 0009. Task E1.

Build the pure market engine in apps/emote-exchange/src/engine: Traders created on first qualifying message or recognized command, qualifying-use rules (commands, selfSent and foreign excluded, one Use per Emote per message, the 0.5^k repeat weight per Chatter over 30 s), IPO (2 distinct Chatters within 10 minutes, IPO Price 100, max 24 Listings with the auto-delist rule), Heat decay, frozen base in a quiet market, attention share with max(N, 4), target, base glide, Price floor and rounding, and bounded 1-minute candles for the 10-minute chart. Time and RNG are injected. All defaults are in one validated settings object. Apply the ordering and retention rules from the spec.

Test first through the public engine interface. Use the fixed E0 fixtures for B1, B2, B3 and B5, and add separate IPO tests. Keep one red-to-green behavior slice at a time. Tune constants only within the unchanged targets, and record changes. A required formula change goes through the spec/ADR decision rule.
Done when the unit tests for 5.1-5.4 and B1, B2, B3 and B5 pass, and histories/candles respect their bounds.
```

## E2 Trading, fees, cooldowns, halts, moon and crash, stipend, bonuses

```text
Read docs/specs/emote-exchange.md sections 5.5-5.9 and 13 (Acceptance tests 4-10). Task E2.

Extend the engine: !buy and !sell semantics (qty, max, all, ticker matching exact then unique case-insensitive), immediate fills at the pre-impact Price, notional=price*qty and fee=max(1,notional*FEE), buy cost=ceil(notional+fee), sell proceeds=max(0,floor(notional-fee)), every rejection reason in 5.5 with exactly one say effect each, trade impact with decay and clamp, the 3 s trade cooldown, Halts (+60% or -40% vs an actual sample at least 60 s old, 30 s, max one per 5 minutes per Ticker), Session Open Price including later IPOs, Moon and Crash once per Ticker per session, Stipend at minute boundaries, Follow bonus, Raid Visa window, Delist payout floor(price*shares) once per holder without a fee, Freeze, Pause, confirmed Season reset, and closing Session Summary. Use integer Price hundredths for settlement arithmetic and honor the Coin cap.

Test first: acceptance tests 4-10 and B4 through the engine interface, minimum-fee settlement at Price 1.50, max affordability, and Delist integer payouts. Use a seeded sequence test with node:test to verify that mixed Trades, bonuses, Delists and resets never produce fractional, negative or overflowing Coin balances; no property-testing dependency is needed.
Done when all engine tests pass.
```

## E3 Commands, replies, wiring and persistence

```text
Read docs/specs/emote-exchange.md sections 6 (Commands), 10 (Data) and 13 (Acceptance tests 11-12), and docs/specs/twitch-kit.md sections 11-13. Task E3.

Wire the engine into the app runtime: ChatEvents (Twitch and simulator) plus a 1 s tick go into the engine; effects are applied (persist rows and versioned engine checkpoint together in one transaction per event/tick, broadcast through the bus, say through the chat-out queue). Add the reply budget (at most 1 reply per user per 20 s), Mod commands with role checks from badges, migrations for section 10, pure restore-from-rows, and the short/long downtime recovery rules. Persist all bounded rule state named in section 10, including cooldowns, Stipend participation, session flags and Halt history. SSE receives only the explicit public projection. Portfolio cards and sound playback are optional P1.

Test first: restart equivalence at the same timestamp; short/long gaps, stale Heat and cooldown expiry; no duplicate Stipend/Moon/Crash; reply budget under a burst of 100 portfolio commands; and Mod commands rejected for non-Mods.
Done when tests pass, and a real !buy from a test account shows in the snapshot and gets a reply through the queue from the connected sender (broadcaster by default, optional bot). Record live verification separately if credentials are unavailable.
```

## E4 Overlay

Use `/plan` first. Then iterate visually: run demo mode, look at it in OBS, give Codex specific fixes.

```text
Read docs/specs/emote-exchange.md section 7 (Overlay) fully, and section 5.7 for the banner triggers. Task E4.

Build /overlay as a transparent 1920x1080 page with the P0 widgets Tape, Chart, Board, Feed, Banners and SIM badge, using the zones, behaviors, art direction, readability rules, motion rules and URL parameters specified. Portfolio cards and synthesized Web Audio sounds are separate P1 work. Bundle the fonts locally (JetBrains Mono, Space Grotesk). Draw the chart on a canvas (no chart library). Render Emote images from the public snapshot. Batch Price updates to 1 per second. Respect motion=reduced; keep sound=off compatible even when no sounds ship. Bound queues as section 10 requires. No widget shows raw chat text.

Then run demo mode with the Opening day and Pump and dump scenarios and check every implemented widget at 1920x1080 and at 50% scale. Report what you checked, and list anything that clipped, overlapped or was hard to read, with your fix.
Done when every P0 widget works in demo mode at full and half scale, and the overlay meets the 60 fps target in Chrome's performance panel during Pump and dump. Record a real OBS check separately; Chrome evidence does not prove OBS frame rate.
```

**You check (be picky):** OBS at 1080p and on a phone-sized preview. Text crisp, nothing clipped, arrows plus color for up and down, banners never stack, no flashing over 3 per second, tape scroll smooth.

## E5 Dashboard

```text
Read docs/specs/emote-exchange.md section 8 (Dashboard). Task E5.

Build the Exchange dashboard around the twitch-kit panels: setup checklist, market table (Heat, Price, session change, holders, Delist), Traders (search, Coins, Net Worth, Freeze/Unfreeze), the P0 settings from section 8 (validated ranges and reset-to-default), demo controls (Open bell, Close bell, Fake Raid with N viewers, Fake Follow), and Season reset with typed confirmation RESET. Full settings, CSV export and JSON backup export/import are optional P1 work, each accepted separately. Every state-changing action goes through guarded POST routes.
Done when every P0 control works in demo mode and live, reset works without CSV support, and changing a setting changes future engine behavior without a restart. Record actual live checks and their prerequisites separately.
```

## E6 Scenarios, soak and tuning

```text
Read docs/specs/emote-exchange.md sections 9 (Simulator scenarios), 5.10 and 13 (test 13). Task E6.

Register Opening day, Pump and dump, Solo spammer, Raid wave, Quiet market and Soak with the twitch-kit simulator, each also wrapped as an automated test that asserts its story (Pump and dump produces at least one Moon or Halt and then a drop). Keep B1-B5's initial conditions and thresholds fixed. For Soak, use 24 Listings, 500 fixed Chatters and 50 msg/s, warm up for 10 simulated minutes, then run for 30 more. Assert the history/queue retention bounds, stable fixed-cohort cardinalities and valid Coins. Report tick p95 and peak heap; target p95 under 5 ms on the documented reference machine rather than a hardware-independent CI cutoff. Then run Opening day and Pump and dump in real time with the overlay open and tune defaults for readable pacing. Report final defaults and reasons.
Done when all scenario tests and retention checks pass, the reference-machine performance result is recorded, and full/half-scale overlay checks are recorded.
```

## Sprint exit checklist

- [ ] E0 report records all five fixed fixtures and chosen defaults
- [ ] P0 parts of acceptance tests 1-13 pass (`pnpm --filter emote-exchange test`); optional P1 checks match the features actually shipped
- [ ] Spec walkthrough (section 4) done live on your channel with 2 test accounts: IPO, buy, pump, halt or moon, fake or real raid, closing bell summary in chat
- [ ] Overlay checked in OBS at 1080p and phone size
- [ ] `/review` done on each task, commits pushed, CI green
- [ ] Codex footage captured: E1 plan, a red-to-green test run, a `/review` finding
- [ ] Any deferred live/OBS verification has a named prerequisite and is completed before submission
