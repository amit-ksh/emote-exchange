# E0 behavior-fixture feasibility

Completed October 28, 2026. **All five fixed fixtures pass with the documented defaults.** No formula, constant, threshold or fixture was changed. This numerical experiment establishes feasibility; it is not the application engine or evidence of completed market acceptance tests.

Reproduce from the repository root:

```sh
pnpm experiment:market
```

The dependency-free script is `scripts/experiments/behavior-fixtures.mjs`. It prints constants, measurements, thresholds and pass/fail as JSON, exiting nonzero if any target fails. CI runs it separately from the engine tests on both configured operating systems. A remote CI run remains unverified until the repository is pushed.

## Initial conditions and calculation order

- B1/B2/B3 seed A/B/C/D at time zero: Price, base and session reference 100.00, Heat 2 each, impact zero, no recent Uses or Halt history. B5 seeds only A/B/C with those same values. No warm-up is applied. Each named Chatter has the spec's 1,000-Coin fixture balance; with no Trades in these cases, balances never enter the numerical calculation.
- B4 analytically overrides all Heat to zero and gives one Trader 1,000,000 Coins. A 5,000-share buy at the pre-impact Price 100 is affordable even with the planned 1% fee. The experiment checks clamp and decay only; it does not implement a fill, fee settlement or a trade engine.
- Logical time is integer seconds, equivalent to the spec's integer-millisecond timestamps. At t=0 apply recorded events in order, then a zero-duration tick; the initial Price stays 100. Subsequent ticks have dt=1 second. Apply incoming Uses before each tick, decay Heat, calculate total/share/target, glide the full-precision base, then round the sampled Price to 0.01. Rounded display values never replace the full-precision base.
- Before each Use, expire prior Uses with age at least 30 seconds. A Chatter's remaining uses of that same Listing determine k and the added weight `0.5^k`. Each input is already one qualifying non-command/non-self/non-foreign Use, with no repeated emote copies inside a message. Those filters and IPO eligibility need separate E1 engine tests.
- Stable `sim_` Chatter identities are deterministic. The fixtures make no random draws, so repeating the exact event list always produces identical results without relying on an RNG seed. No real clock, network, database, Twitch session or existing app data is involved.

| Constant | Value |
|---|---:|
| IPO Price / initial base | 100 |
| Heat half-life | 90 seconds |
| Quiet Heat threshold | 0.5 |
| Elasticity | 0.75 |
| Price tau | 20 seconds |
| Attention scale | max(active Listings, 4) |
| Ratio clamp | 0.1 to 10 |
| Repeat window / multiplier | 30 seconds / 0.5 per recent Use |
| Impact per 100 shares | 0.02 |
| Impact half-life | 30 seconds |
| Impact clamp | -0.5 to +1.0 |
| Price floor / precision | 1.00 / 0.01 |

## Fixed events and measured endpoints

| Fixture | Events | Measured result | Required target | Result |
|---|---|---|---|---|
| B1 | Same ten Chatters Use A at 0,5,…,55 s. B/C/D each get one fresh Chatter Use at 0,15,30,45,60 s. | A at 60 s = **181.64** | A ≥ 180.00 | Pass |
| B2 | One Chatter Uses A at 0,1,…,29 s; three other Chatters each Use B at 0 s. | A at 30 s / peak = **112.99**; B at 30 s = **129.68** | B's increase exceeds A's; A never exceeds 125.00 | Pass |
| B3 | Continue B1. No A Uses after 60 s. B/C/D each get one fresh Chatter Use every 5 s from 65 through 360 s. | A peak over 0–60 s = **185.05**; A at 360 s = **18.75**, down **89.87%** | Decline ≥ 40% from that peak | Pass |
| B4 | Quiet fixture, 5,000-share buy at time zero; no other events. | Immediate impact **+1.0**, Price **200.00**; after 30 s **150.00** | Immediate Price ≤ 200.00; excess over 100 halves within 0.01 | Pass |
| B5 | Three Chatters post every 5 s from 0–150 s. Two always Use B/C; third Uses A before 60, B at 60–115, C from 120. | A 100.00 → **118.71** at 30 s (**+18.71%**); B 122.82 at 59 s → **149.94** at 90 s (**+22.08%**); C 109.16 at 119 s → **141.24** at 150 s (**+29.39%**) | Each specified phase gains ≥ 15% | Pass |

B4 worked result: `clamp(0.02 × 5000 / 100, -0.5, 1) = 1`. Quiet-market base stays 100. Immediate Price is `100 × (1 + 1) = 200`. After 30 seconds the impact is `1 × 2^(-30/30) = 0.5`, so Price is 150 and the excess is exactly half. The impact clamp independently bounds any immediate buy-only price at twice the current base.

## Review and remaining work

Reviewed the event boundaries and inclusive/exclusive intervals against spec 5.10: A's B1 uses stop at 55 s; background fresh Uses include 60 s; B3 begins new Uses at 65 s; B2 stops A at 29 s; B5 switches at exactly 60 and 120 s and compares against 59/119 s. Uses at exactly 30 seconds old expire before counting repeats. B1 and B3 share one continuous run and reference the maximum only through 60 s.

`pnpm experiment:market`, `pnpm check`, `pnpm lint`, `pnpm test` (84), `pnpm build` and `pnpm smoke` passed. K7's browser/overlay verification is unchanged by this script and documentation task. E1 must implement and test the real public engine interface with B1/B2/B3/B5 plus IPO and qualifying-use checks. E2 must verify B4 through actual trading and integer settlement. This report does not claim Listings, prices, Holdings or trading are wired into the app yet.
