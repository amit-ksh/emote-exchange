# E2 trading and market-event verification

Completed October 28, 2026. The pure engine now settles Trades, rewards and Delists, enforces cooldowns/Freeze/Pause/Halts, and emits session and market moments. No dependency, price formula, behavior target or existing default changed. See [the written plan](../plans/e2-trading-and-events.md).

## Scope and effect contract

`stepMarket(state, input, now)` remains the public test seam. Trusted dashboard actions add Pause, Freeze, Delist and Reset inputs; Reset requires exactly `RESET`. E3 must authorize actions and chat moderation commands before dispatch. No new HTTP route or UI control ships here.

Settlement uses integer Price hundredths, fee basis points and BigInt intermediates. Only safe numbers enter state/effects. Buy cost rounds up once; sale proceeds and no-fee Delist payouts round down once. Credits saturate at 1,000,000,000 Coins and record the amount actually applied, including zero. Holdings retain whole shares and whole-Coin cost basis; partial sales allocate cost basis proportionally without unsafe intermediate arithmetic. `max` includes the fee and one-million-share cap; `all` remains subject to that cap. Prices fill before impact. Impact clamps to [-0.5, 1] and decays with the unchanged 30-second half-life.

Persist effects include changed Traders, Holdings, Trades, credits, first-message facts, sessions, Listing rule flags and a reset marker. They require the returned checkpoint and rows to commit atomically. E3 owns encoding, SQL transactions, restart recovery and queue execution. A Reset clears market business/rule state and retains the resolved catalog, settings and bounded delivery suppression so an immediate replay cannot erase new activity or repeat an old fill.

Recognized commands onboard/refresh Traders independently of trade acceptance. Observing a first message and paying an already-earned Stipend are also independent of whether a Trade succeeds. A rejection leaves its settlement, impact and unexpired cooldown unchanged and emits exactly one reply; normal clock/window expiry and unrelated earned rewards still happen. Foreign and self-sent chat never counts. Unknown bot commands cannot add Heat or earn a Stipend, but record prior-chat eligibility to prevent a later Raid Visa being awarded to an existing Chatter.

First-message facts are Season business data. Delivery suppression retains at most 2,000 identities for ten minutes; cooldowns expire on input; participation retains only the current qualifying minute. A clock gap pays only a recorded qualifying minute, never invented intervening chat. Recovery across downtime remains a separate E3 rule. Feed retains five moments in causal order; public projections and returned moment objects are detached. No raw chat or command arguments enter retained state/display effects. All replies and bells retain causal origin, and the engine performs no chat/network/clock/database access.

## Acceptance evidence

Run `pnpm --filter @emote-exchange/app exec node --test test/trading.test.ts test/market.test.ts`.

| Requirement | Public-engine test and result |
|---|---|
| Acceptance 4: five-share buy | `a five-share buy fills at the pre-impact Price...`: 1,000 -> 495 Coins, five shares, cost basis 505, fill 100.00, displayed post-impact Price 100.10, one reply/feed/ledger result. Prior state stays unchanged. |
| Acceptance 5: rejections | `every trade rejection leaves Coins Holdings impact and cooldown unchanged...`: insufficient Coins/shares, malformed/oversized quantities, unknown/ambiguous ticker, Pause, Freeze and cooldown; one fixed reply and no fill. Exact ticker wins over a second differently cased Listing. Malformed `max`/`all` with extra arguments cannot trade. Halt rejection is covered below. |
| Acceptance 6: settlement | `minimum fees, max affordability, sell all and exact decimal settlement...`: 1 share at 1.50 costs 3 and sells for 0; 1,000 Coins buys max nine shares at 100.00 with a 9-Coin fee; 10,000 shares at 7.15 debit 72,215 and credit 70,785. Entire Holdings disappear on sale. |
| Coin cap and Delist | `Delist pays each entire Holding once...`: three shares at 1.50 pay 4 Coins without a fee; repeat Delist does not pay twice. A capped sale records only its applied 101,000,000-Coin credit. `automatic Delist pays holders atomically...` verifies two holders, one atomic removal, and a later IPO with fresh Price/impact/Halt/Moon/Crash history. |
| Acceptance 7 and B4 | `B4 uses a real 5000-share fill...`: real fill at 100.00 moves Price to 200.00, then 150.00 after 30 seconds. No invented pre-IPO Halt sample. A +60% movement against an actual minute-old sample Halts for 30 seconds; rejected buys show time left; exact expiry allows trading; repeat Halts are suppressed until exactly five minutes. Expired Halt rows persist even on a rejected command. |
| Exact threshold | `a forty-percent Halt includes the exact cent boundary from 2.05 to 1.23`: integer-cent comparisons include the boundary despite binary floating-point multiplication error. Moon and Crash comparisons also use integer cents. |
| Acceptance 8 and 9 | `Stipends pay actual chat minutes once...`: three qualifying minutes award 30 total; no idle-minute credits. Follow awards 200 once per delivery; a Follow alone is not prior chat. Raid Visa awards 500 on first chat inside the five-minute window, including at 299,999 ms, and excludes the exact 300,000-ms boundary and prior unknown-command Chatters. Capped credits record zero. |
| Acceptance 10 | E1's `foreign, self-sent and command chat never adds Heat...` still passes. `commands foreign chat and self echoes earn no Stipend...` checks no command/foreign/self reward and verifies Prices keep moving while paused. |
| Session rules | `Moon and Crash fire once per session...`: one trigger each, fresh opening references/flags, later IPO reference 100, deterministic richest tie, one closing SIM summary, duplicate/closed-session suppression, and offline trading. Summary display mutation cannot alter engine state. |
| Confirmed reset | `confirmed Season reset clears portfolios and rule state atomically...`: wrong confirmation throws; valid reset clears Traders/Holdings/Listings/pending/repeats/cooldowns/participation/first-message facts/Feed and emits the reset marker. Replaying that delivery cannot erase a new Trader. |
| Mixed-sequence safety | `seeded mixed Trades bonuses Delists and resets preserve integer Coins...`: four seeds (42, 117, 2026, 98765), 1,000 mixed actions plus ticks each, eight fixed Trader identities. Every balance remains safe, whole and within cap, and every delta reconciles against applied ledger amounts. Coverage includes buys, sells, all credit kinds, Delists and resets; Holdings refer to existing Traders/Listings, participation/delivery/Feed remain bounded, and replies retain SIM origin. |
| Feed isolation | `Raid Visa precedes its first Trade in the Feed...`: RAID -> VISA -> TRADE and returned moments cannot mutate retained state. |

## Input/engine probe

`pnpm probe:market` passes on the final reviewed engine with seed 42: 120,000 messages over 40 virtual minutes, ten-minute warm-up, 1,800 measured ticks, 24 stable Listings and 500 stable Traders. Each Trader finishes with exactly 1,400 Coins from recorded qualifying-minute Stipends. The probe checks the existing bounded candles/Price/repeat/pending histories and valid integer Coins. It has no trades, SQL, SSE, rendering or outbound sends, so full product soak remains E6.

Observed on Windows x64, Node v24.22.1, 13th Gen Intel Core i5-13420H: tick p95 **3.0429 ms**, maximum **14.1539 ms**, sampled peak heap **151.48 MiB**, elapsed **164.14 seconds**. The p95 meets the reference-machine target of under 5 ms; the maximum is reported separately. Heap includes simulator/runtime overhead without forced GC. These measurements are not portable CI limits or an OBS frame-rate claim.

## Review and checks

Review regressions exposed and fixed extra arguments accepted by `max`/`all`, reversed Visa/Trade Feed order, shared returned moment objects, exact-cent Halt boundary error, and an expired Halt row omitted after rejected trade processing. The cases were observed failing before their fixes. Core behavior slices were also developed red-to-green; regression/sequence cases confirm composed behavior through the same public seam.

`pnpm check`, `pnpm lint`, `pnpm test` (**107 tests: 70 Twitch Kit, 37 app**), `pnpm build`, `pnpm experiment:market` and `pnpm smoke` pass. B1/B2/B3/B5 engine endpoints remain unchanged, and B4 now additionally runs through real settlement. The production smoke verifies the existing foundation routes, guards, SSE and simulator; it does not claim a wired trading UI.

No UI changed. Actual OBS, live trading, restart equivalence, reply budgets for market commands and complete trading/runtime soak remain E3–E6/hardening verification. The existing app still shows the foundation panels until runtime and product UI wiring ship. No additional Twitch message was sent for E2.
