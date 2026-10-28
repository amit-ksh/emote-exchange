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

**Complete — October 28, 2026.** The pure engine passes Trader/qualifying-use/IPO rules, exact repeat and IPO expiry boundaries, the 24-Listing cap and coldest-unused replacement, fixed B1/B2/B3/B5 endpoints, quiet/impact/rounding behavior and bounded candles/history. A 120,000-message input/engine probe retained 24 Listings and 500 Traders; tick p95 was 1.26 ms on the recorded machine. No defaults changed. Trading, runtime/SQLite wiring and product UI remain E2–E5 work. See [E1 verification](../verification/e1-market-engine.md) and [the written plan](../plans/e1-market-engine.md). The plan was not filmed.

Use `/plan` first. Film the plan.

```text
Read AGENTS.md, docs/specs/emote-exchange.md sections 5.1-5.4 and 5.10, section 11 (Engine contract), apps/emote-exchange/GLOSSARY.md, and ADRs 0006 and 0009. Task E1.

Build the pure market engine in apps/emote-exchange/src/engine: Traders created on first qualifying message or recognized command, qualifying-use rules (commands, selfSent and foreign excluded, one Use per Emote per message, the 0.5^k repeat weight per Chatter over 30 s), IPO (2 distinct Chatters within 10 minutes, IPO Price 100, max 24 Listings with the auto-delist rule), Heat decay, frozen base in a quiet market, attention share with max(N, 4), target, base glide, Price floor and rounding, and bounded 1-minute candles for the 10-minute chart. Time and RNG are injected. All defaults are in one validated settings object. Apply the ordering and retention rules from the spec.

Test first through the public engine interface. Use the fixed E0 fixtures for B1, B2, B3 and B5, and add separate IPO tests. Keep one red-to-green behavior slice at a time. Tune constants only within the unchanged targets, and record changes. A required formula change goes through the spec/ADR decision rule.
Done when the unit tests for 5.1-5.4 and B1, B2, B3 and B5 pass, and histories/candles respect their bounds.
```

## E2 Trading, fees, cooldowns, halts, moon and crash, stipend, bonuses

**Complete — October 28, 2026.** The pure engine passes settlement/rejection rules, rewards, exact Halt boundaries, Moon/Crash, bells, Delist payouts, Freeze/Pause and confirmed Reset. Four seeded mixed-action runs verify integer Coins and reconcile every applied ledger amount. All 107 workspace tests and required checks pass. See [E2 verification](../verification/e2-trading-and-events.md) and [the written plan](../plans/e2-trading-and-events.md). Runtime, SQL/recovery, command reply budgets and live trade verification remain E3; product UI remains E4/E5.

```text
Read docs/specs/emote-exchange.md sections 5.5-5.9 and 13 (Acceptance tests 4-10). Task E2.

Extend the engine: !buy and !sell semantics (qty, max, all, ticker matching exact then unique case-insensitive), immediate fills at the pre-impact Price, notional=price*qty and fee=max(1,notional*FEE), buy cost=ceil(notional+fee), sell proceeds=max(0,floor(notional-fee)), every rejection reason in 5.5 with exactly one say effect each, trade impact with decay and clamp, the 3 s trade cooldown, Halts (+60% or -40% vs an actual sample at least 60 s old, 30 s, max one per 5 minutes per Ticker), Session Open Price including later IPOs, Moon and Crash once per Ticker per session, Stipend at minute boundaries, Follow bonus, Raid Visa window, Delist payout floor(price*shares) once per holder without a fee, Freeze, Pause, confirmed Season reset, and closing Session Summary. Use integer Price hundredths for settlement arithmetic and honor the Coin cap.

Test first: acceptance tests 4-10 and B4 through the engine interface, minimum-fee settlement at Price 1.50, max affordability, and Delist integer payouts. Use a seeded sequence test with node:test to verify that mixed Trades, bonuses, Delists and resets never produce fractional, negative or overflowing Coin balances; no property-testing dependency is needed.
Done when all engine tests pass.
```

## E3 Commands, replies, wiring and persistence

**Complete — October 28, 2026.** Runtime wiring, transactional rows/checkpoints, pure recovery, viewer/Mod commands, persisted reply budgets and safe market snapshots pass automated checks (119 workspace tests). The keyless app lists/trades through the simulator and SQLite. A real `!buy DemoBull 1` from `amit1541` filled at 104.39, left 894 Coins and one persisted share, and received a Twitch-acknowledged reply through the connected sender. See [E3 evidence](../verification/e3-runtime-and-recovery.md) and [the plan](../plans/e3-runtime-and-recovery.md). Product UI remains E4/E5; full live/OBS walkthroughs remain later gates.

```text
Read docs/specs/emote-exchange.md sections 6 (Commands), 10 (Data) and 13 (Acceptance tests 11-12), and docs/specs/twitch-kit.md sections 11-13. Task E3.

Wire the engine into the app runtime: ChatEvents (Twitch and simulator) plus a 1 s tick go into the engine; effects are applied (persist rows and versioned engine checkpoint together in one transaction per event/tick, broadcast through the bus, say through the chat-out queue). Add the reply budget (at most 1 reply per user per 20 s), Mod commands with role checks from badges, migrations for section 10, pure restore-from-rows, and the short/long downtime recovery rules. Persist all bounded rule state named in section 10, including cooldowns, Stipend participation, session flags and Halt history. SSE receives only the explicit public projection. Portfolio cards and sound playback are optional P1.

Test first: restart equivalence at the same timestamp; short/long gaps, stale Heat and cooldown expiry; no duplicate Stipend/Moon/Crash; reply budget under a burst of 100 portfolio commands; and Mod commands rejected for non-Mods.
Done when tests pass, and a real !buy from a test account shows in the snapshot and gets a reply through the queue from the connected sender (broadcaster by default, optional bot). Record live verification separately if credentials are unavailable.
```

## E4 Overlay

**Complete — October 28, 2026 (Chrome gate).** All P0 widgets work in demo mode at full and half scale, including reduced motion. Chrome Pump and dump capture averaged 134.32 frames/s, p95 interval 11.93 ms, with occasional stalls recorded. Actual OBS remains a separate manual gate. See [E4 evidence](../verification/e4-overlay.md) and [the plan](../plans/e4-overlay.md). Dashboard controls remain E5; scenario/soak work remains E6.

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

## E7 Greetings and streaks (P1)

**Queued — not implemented.** Complete the P0 dashboard and scenario work first. The following owner-provided task rules take precedence over section 5.11 if they differ. During implementation, do not edit anything under `docs/` or any `GLOSSARY.md`; the owner updates planning documents separately.

```text
Task E7: Greetings and streaks (P1). Read AGENTS.md, docs/specs/emote-exchange.md sections 5.1, 5.2, 5.6, 6, 10, 11 and 12, apps/emote-exchange/GLOSSARY.md, and ADRs 0006 and 0008. Do not edit anything under docs/ or GLOSSARY.md; the owner updates the plan docs separately. If the spec already has section 5.11 and it differs from the rules below, these rules win.

Add to the pure engine (apps/emote-exchange/src/engine), test first:

- Stream: one broadcast night. An opening Bell starts a new Stream unless the previous Stream Session ended less than STREAM_RESTART_GAP = 2 h earlier (its closing Bell, or its last tick if it never closed). A dropped stream or an app restart therefore continues the same Stream. The demo-mode Open bell button always starts a new Stream so streaks can be shown. Store stream_no on the session row and in the engine checkpoint.
- Command !greetings <words>: needs at least one word after the command. The words are never judged, stored, echoed in a reply, broadcast, or shown on the overlay. Only the fact of a greeting is used.
- Window: a claim needs an open Stream Session and a Trader who is not frozen. One claim per Trader per Stream. A repeat in the same Stream changes nothing and gets one reply.
- Streak: consecutive Streams with a claim. A first claim, or a claim after skipping at least one whole Stream, sets 1. A claim in the Stream right after the last claim adds 1.
- Bonus = GREETING_BASE + GREETING_STREAK_STEP * (min(Streak, GREETING_STREAK_CAP) - 1), defaults 50, 10, 10 (50 at Streak 1, 100 at 6, 140 from 10), in the validated settings object. Integer Coins, saturating at the Coin cap.
- Shown Streak: shown only while alive, meaning the last claim was in the current Stream or the one before. After a whole Stream with no claim it is hidden and the next claim restarts at 1.
- A greeting is a command, so it adds no Heat and no Stipend minute. A Season reset clears Streaks.
- Replies are fixed templates through the chat-out queue and the existing reply budget: claim "@ann good to see you. Streak 4, +80 Coins."; repeat "@ann you already said hello this Stream. Streak 4."; bare command "Say hello with a few words: !greetings good morning"; closed market says so. Simulated Traders never reply to Twitch.
- Show the Streak in the !portfolio reply (append ", streak 4" while alive), in a Feed item "ann greeted · streak 4 · +80" (names and numbers only), and in the dashboard Traders list. Do not change the overlay Board: its 24 px rows have no room for a badge.
- Persistence: traders.greeting_streak and traders.last_greeting_stream_no, sessions.stream_no, via a migration; restore-from-rows reproduces them exactly.
- Simulator: register a "Greeting streak" scenario: 12 chatters over 4 Streams with Open and Close bell between, most greet every Stream and two skip one.

Tests (node:test, through the engine interface): first claim pays 50 and sets Streak 1; a repeat in the same Stream pays nothing and gets one reply; the next Stream pays 60 and sets Streak 2; skipping a Stream restarts at 1 and hides the old Streak; a bell less than 2 h after a close continues the Stream while the demo Open bell starts a new one; a bare command, a frozen Trader and a closed market leave Coins unchanged; the greeting words never appear in any persist, broadcast or say effect; credits saturate at the cap; restart equivalence with a live Streak.

Done when the tests above pass, pnpm check, lint and test pass, and the Feed item reads correctly in the real overlay at 1920x1080 and half scale in demo mode (say what you looked at and fixed). Commit as "E7: greetings and streaks" with the verification in the body.
```

## E8 Grants (P1)

**Queued — blocked on E5's Traders list.** The following owner-provided task rules take precedence over section 5.12 if they differ. During implementation, do not edit planning documents or glossaries.

```text
Task E8: Grants (P1). Read AGENTS.md, docs/specs/emote-exchange.md sections 6, 8, 10, 11 and 12, docs/specs/twitch-kit.md sections 11, 12 and 15 (chat-out queue, commands, guarded actions), and ADR 0006. Do not edit anything under docs/ or GLOSSARY.md. If the spec has section 5.12 and it differs, these rules win. Start only after E5's Traders list exists.

Add, test first:

- Broadcaster-only command !grant @user N and a Grant action on each dashboard Traders row. Mods and viewers cannot grant; treat them like any other Mod command from a non-Mod.
- N is a whole number from 1 to GRANT_MAX (default 10,000, a validated setting with a range and reset-to-default). Zero, negative, fractional and non-numeric values change nothing. Credits saturate at the Coin cap and record the applied amount, including zero.
- Target: the command's mention part, by the mentioned user's ID, else an exact case-insensitive login match for a typed name. The target must already be a Trader; an unknown name gets a reply and creates no Trader. If twitch-kit's normalized mention part does not carry the user ID, extend the normalizer and its tests.
- Effect: Coins rise by the amount. It is not a Trade, adds no Heat and does not touch Prices.
- Record: a grants table (id, at, user_id, amount applied, source chat or dashboard, request_id unique) via a migration. A repeated request_id credits once: the dashboard sends one per click, chat uses the message ID.
- Feedback: a Feed item "ann +500 · gift from the streamer" and one reply "@ann received 500 Coins from the streamer." through the chat-out queue. Grants to a sim_ Trader never reply to Twitch.
- Dashboard: a small form with an amount field and quick amounts 100, 500 and 1,000, then "Give ann 500 Coins?" with a Confirm button. It posts through the guarded route (Origin and X-CTA). No CORS headers. No SQL built by string concatenation.

Tests: broadcaster grant credits exactly N, writes one row, emits one Feed item and one reply; Mod and viewer attempts change nothing; every invalid amount and an unknown target change nothing; a repeated request_id credits once; saturation records the applied amount; a sim_ target never reaches Twitch; the route rejects a request missing the Origin or X-CTA guard.

Done when those pass, pnpm check, lint and test pass, and a dashboard grant in demo mode shows the Feed item on the real overlay and the new balance in the Traders list. Commit as "E8: broadcaster grants" with the verification in the body.
```

## E9 Live analytics page (P1)

**Queued — blocked on E5.** Schedule after E7 and E8 so Greetings, Grants and the Greeting streak verification scenario are available. During implementation, do not edit planning documents or glossaries.

```text
Task E9: Live analytics page (P1). Read AGENTS.md, docs/specs/emote-exchange.md sections 5.5, 5.6, 7 (readability), 8, 10 and 11, docs/specs/twitch-kit.md sections 7 and 11 to 15, and ADRs 0006 and 0007. Do not edit anything under docs/ or GLOSSARY.md. Start only after E5.

Goal: a "Live" page in the dashboard where the streamer watches engagement update in real time, to see whether the market is helping the stream.

Engine side: a pure analytics reducer fed by the same normalized events as the market, with injected time and no I/O. State is bounded: 60 one-minute buckets, a 5-minute active window, per-Stream sets bounded by chatter count and cleared when a new Stream starts, and the last 20 Moments. Count only ChatMessages that are not selfSent and not foreign, and exclude the broadcaster. Keep counters per origin (twitch, sim). The page has a Live / Sim / All switch, defaulting to Live once any live event arrives, else Sim, with the SIM badge when Sim is shown.

Metrics:
- Chat messages per minute: last 60 s and a 60-minute sparkline. Commands count as messages.
- Active chatters: distinct chatters in the last 5 min, with a sparkline.
- Trading participation: Traders with at least one accepted Trade this Stream, divided by distinct chatters this Stream, as a whole percent.
- New chatters this Stream and how many made a first Trade within 10 min of joining.
- Trades per minute and Coins traded per minute, sparkline.
- Economy: Coins held by Traders; Coins issued this Stream by source (starting Coins, Stipend, Follow, Raid Visa, Greeting, Grant); Coins burned by Fees. Do not claim Coins are conserved.
- Greetings: claimed this Stream, returning Traders (Streak 2 or more), longest live Streak with name. Show only if E7 exists.
- Market now: hottest Listing, three biggest movers up and three down against the Session Open Price, active Listing count.
- Moments: the last 20 IPO, Halt, Moon, Crash and Raid items with times.
- Stream: uptime, follows and raids this Stream. Viewers is optional: poll Helix Get Streams every 60 s only while the page is open and the stream is online, show "-" on failure, and skip it if it needs new scopes or dependencies.
- Versus recent Streams: on the closing Bell write a summary (average and peak messages per minute, peak active chatters, participation, new-chatter conversion, Coins issued and burned) into sessions.summary. Show the delta against the median of the last 5 completed live Streams, hidden until two exist.

Delivery: an explicit, versioned public projection pushed over SSE at most once per second, only while a Live page client is connected, with the same Host and Origin guards as the snapshot stream and no CORS headers. Names, numbers, tickers and Moment kinds only: no chat text, no tokens. The client reader validates the payload like the existing snapshot reader. Analytics are runtime state, not replayed after a restart: the page restarts empty ("Counters reset when the app restarts") and the Stream summary covers the time since restart.

UI: add Live to the dashboard navigation. Layout: four stat cards (Messages per min, Active chatters, Trading participation, Trades per min) with a small delta against recent Streams when available; two sparkline charts; Economy, Greetings, Market now and Moments cards. Draw sparklines on canvas or SVG with no chart dependency. Empty state when no Stream Session is open ("Open the market to start collecting. In demo mode, press Start demo."), a reconnecting state when SSE drops, text alternatives for charts, and reduced-motion support. Use the dashboard's current visual language, or the redesign's tokens if they have landed. Update the DOM at 1 Hz, not the whole tree.

Tests (node:test, test first): bucket rollover; exact 5-minute and 10-minute boundaries; distinct counts; participation and new-chatter conversion; issued-by-source reconciles with the engine's applied ledger amounts; origin separation; bounds (60 buckets, 20 Moments, sets cleared on a new Stream); the projection contains no chat text or token; SSE route guards; client reader rejects malformed payloads.

Done when the tests pass, pnpm check, lint and test pass, and you have looked at the Live page in demo mode with Pump and dump and Greeting streak running, at 1440x900 and 390 px wide (say what you looked at and fixed). Commit as "E9: live analytics page" with the verification in the body.
```

## Sprint exit checklist

- [ ] E0 report records all five fixed fixtures and chosen defaults
- [ ] P0 parts of acceptance tests 1-13 pass (`pnpm --filter emote-exchange test`); optional P1 checks match the features actually shipped
- [ ] Spec walkthrough (section 4) done live on your channel with 2 test accounts: IPO, buy, pump, halt or moon, fake or real raid, closing bell summary in chat
- [ ] Overlay checked in OBS at 1080p and phone size
- [ ] `/review` done on each task, commits pushed, CI green
- [ ] Codex footage captured: E1 plan, a red-to-green test run, a `/review` finding
- [ ] Any deferred live/OBS verification has a named prerequisite and is completed before submission
