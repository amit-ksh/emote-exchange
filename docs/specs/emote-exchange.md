# Emote Exchange: product spec

`apps/emote-exchange` · Port 4100 · Words: [GLOSSARY](../../apps/emote-exchange/GLOSSARY.md)

Status: reviewed plan. The initial scaffold provides the local server and screen placeholders; the market, Twitch connection and simulator are built in subsequent sprint tasks. This document describes the finished app, not current functionality.

## 1. Pitch

**A live stock market where the stocks are your channel's emotes.**

Every emote chat uses becomes a listing. Its price follows how much of chat's attention it has right now. Viewers get free play coins and trade with `!buy` and `!sell`. The stream overlay shows a ticker tape, a live chart, a leaderboard and big moments like an IPO, a trading halt, a moon or a crash. When chat realizes it can pump an emote by spamming it and then sell, coordinated chaos follows.

## 2. Why it should exist

- Emote spam is the most common thing Twitch chat does, and today it goes nowhere. Here it moves a market.
- Viewers see their names on stream: trades in the feed, the leaderboard, "@ann sold the top".
- Portfolios carry across streams, which gives viewers a reason to come back.
- A greeting streak gives viewers a reason to show up every stream and say hello, and Grants let the streamer reward someone live.
- It works for any channel, including brand-new ones (Twitch global emotes plus free 7TV/BTTV/FFZ sets), with 3 chatters or 3,000.

**Product distinction:** the market is driven by chat's own behavior. Treat any novelty claim as unverified until primary-source research is recorded; the submission must describe what shipped rather than claim there are no similar products.

## 3. Goals, non-goals, anti-goals

**Goals**
- G1: A viewer understands it and makes a first trade within 30 seconds of seeing the overlay.
- G2: Prices visibly react to what chat does within seconds, and reward many people over one spammer.
- G3: The streamer sets it up in 3 steps and never has to babysit it.
- G4: It looks great on stream at 1080p, readable even when the stream is shrunk on a phone.

**Non-goals**
- Real money, prizes, or anything convertible to value
- Channel Points (P2, Affiliate-only)
- Short selling, options, limit orders
- Multiple channels
- Hosting
- AI

**Anti-goals** (failure even if it works)
- Anything that feels like gambling for real value. Coins are play money, and the overlay says so.
- The bot flooding chat. The overlay is the main feedback channel.
- One person controlling a price by spamming alone.
- Raw chat text on stream. The overlay shows only names, tickers and numbers.

## 4. Experience walkthrough

1. **Setup.**
   - The streamer runs `pnpm dev:exchange` and opens `localhost:4100`.
   - They click **Connect Twitch** and copy the overlay URL into OBS (see the [setup guide](../setup-guide.md)).
   - The dashboard shows a checklist that ticks itself.
2. **Opening.** When the stream goes live, the opening banner reads "MARKET OPEN". The tape says "Two chatters list an emote. Type !market". Synthesized bell audio is optional P1.
3. **First listing.** Two viewers use `stonks` in normal messages. Banner: "IPO: stonks @ 100.00". It appears on the tape.
4. **First trade.** A viewer types `!buy stonks 5`. A toast appears: "@ann BUY 5 stonks @ 100.00". A short reply in chat confirms. Their coins drop from 1,000 to 495.
5. **Pump.** Chat starts spamming `stonks`. Its price climbs, the chart turns green, and the banner says "stonks TO THE MOON +150%". Someone sells at the top and lands on the leaderboard.
6. **Halt.** A sudden spike trips the circuit breaker: "TRADING HALTED: stonks 30s". Chat panics.
7. **Raid.** "RAID: <channel> brought 25 investors". New chatters get a 500-coin raid visa.
8. **Close.** At stream end the closing bell rings. One chat message sums up the session: top gainer, biggest crash, richest trader.

## 5. Market rules

All defaults live in one validated settings object. P0 exposes the settings named in section 8; the full settings form is P1. The defaults below are starting points, checked against the fixed behavior fixtures before E1 and tuned in Sprint 2 task E6 against section 5.10.

### 5.1 Currency and traders

- **Coins** are whole numbers. Balances are always integers.
- A chatter becomes a **trader** with `STARTING_COINS` = 1,000 on their first qualifying message or command.
- Traders are keyed by Twitch user ID, so name changes keep their portfolio.
- Simulated traders keep `sim_` names and live in the same tables.

### 5.2 Qualifying use

A **use** of emote E is a ChatMessage that:
- contains E at least once (many copies in one message still count as one use)
- is not a command
- is not `selfSent`
- is not `foreign`

**Use weight:** each chatter's repeat uses of the same emote within 30 s count less: `0.5^k`, where k is that chatter's uses of E in the previous 30 s. So one person's spam adds 1, 0.5, 0.25 and so on, while ten people add 10.

For deterministic event ordering, expire Uses whose age is at least 30 s before counting k. At a timestamp, apply incoming events in their recorded order, then the tick. The elapsed-time unit in price and Heat formulas is seconds; event timestamps and persisted deadlines are integer milliseconds.

### 5.3 Listings (IPO)

- An unlisted emote IPOs when at least `IPO_MIN_CHATTERS` = 2 distinct chatters use it within `IPO_WINDOW` = 10 min.
- IPO price is `IPO_PRICE` = 100.00. Heat starts from the uses that triggered the IPO.
- There are at most `MAX_LISTINGS` = 24 active listings. When a new IPO needs a slot, the coldest listing with no uses for 30 minutes is auto-delisted (5.9).
- If no listing qualifies, the IPO waits.

### 5.4 Heat and price

Each active listing e has heat, a base price and an impact term. Every second (the **tick**):

1. **Heat decays:** `heat_e *= 2^(-dt / HEAT_HALF_LIFE)`, with `HEAT_HALF_LIFE` = 90 s. Uses add their weight to heat as they arrive.
2. **Quiet market:** if `sum(heat) < QUIET_HEAT` (0.5), freeze base prices; prices drift only by impact decay. Resume the normal target calculation when Heat reaches the threshold.
3. **Attention share:** `share_e = heat_e / sum(heat)`, then `ratio_e = clamp(share_e * max(N, 4), 0.1, 10)`, where N is the number of active listings. Using `max(N, 4)` lets an early market of 1 to 3 listings still move.
4. **Target:** `target_e = IPO_PRICE * ratio_e ^ ELASTICITY`, with `ELASTICITY` = 0.75.
5. **Base glides toward target:** `base_e += (target_e - base_e) * (1 - e^(-dt / PRICE_TAU))`, with `PRICE_TAU` = 20 s.
6. **Impact:** a buy of q shares adds `IMPACT_PER_100 * q / 100` (`IMPACT_PER_100` = 0.02), a sell subtracts the same. Impact decays with a 30 s half-life and is clamped to [-0.5, +1.0].
7. **Price:** `price_e = max(1.00, base_e * (1 + impact_e))`, rounded to 0.01. Fills and display use this rounded price.
8. **Candles:** each tick updates the current 1-minute candle (open, high, low, close). P0 keeps the current candle and the previous 10 minutes per Listing; extending retention to 24 hours is P1.

Why attention share and not raw counts: it moves in a 3-person chat and a 3,000-person chat alike, and it makes the market a story about where chat's attention goes ([ADR 0009](../adr/0009-exchange-price-follows-attention-share.md)).

### 5.5 Trading

| Command | Meaning |
|---|---|
| `!buy <ticker> <qty>` | qty is a positive whole number, or `max` (as many as coins allow) |
| `!sell <ticker> <qty>` | qty is a positive whole number, or `all` |

- **Ticker matching:** an exact, case-sensitive emote name first. Otherwise a unique case-insensitive match. Otherwise reject with "Unknown ticker. Try !market".
- **Fills** happen immediately at the current price.
  - **Notional:** `notional = price * qty`, using the current Price already rounded to 0.01.
  - **Fee:** `fee = max(1, notional * FEE)`, with `FEE` = 0.01. The fee has a 1-Coin minimum.
  - **Buy cost:** `ceil(notional + fee)`.
  - **Sell proceeds:** `max(0, floor(notional - fee))`.
  - Derive settlement from integer Price hundredths and an exact fee ratio, rounding only the final whole-Coin debit or credit, so floating-point noise cannot add or remove a Coin. For example, 5 shares at 100.00 cost 505 Coins; 1 share at 1.50 costs 3 Coins to buy and yields 0 Coins to sell.
  - `max` finds the largest affordable positive quantity including the fee and quantity cap; reject if none is affordable. An accepted fill uses the Price before that Trade's impact, then recomputes the displayed Price after applying impact.
- **Rejected trades** (state unchanged, short reply):
  - not enough coins or shares
  - qty over 1,000,000
  - unknown or halted ticker (the reply shows seconds left)
  - market paused
  - trader frozen
  - cooldown: 1 trade per 3 s per trader
- Each accepted trade updates impact, appears in the trade feed, and is recorded with its time, side, shares, price and coins.

### 5.6 Stipend and bonuses

| Rule | Default |
|---|---|
| Stipend: coins for each minute in which a trader posts at least one qualifying (non-command) message, credited at the minute boundary | 10 |
| Follow bonus (creates the trader if new), plus a feed item "new investor @x" | 200 |
| Raid visa: for 5 minutes after a raid, each chatter whose very first message arrives gets the bonus, plus a feed item. First-time chatters right after a raid are our best guess at raiders, because Twitch doesn't say who came along. | 500 |

Greetings (5.11) and Grants (5.12) are the other two ways to earn Coins.

### 5.7 Halts, moon, crash

- **Halt:** if a price is up 60% or more, or down 40% or more, against 60 seconds earlier, trading on that ticker halts for 30 s. At most one halt per ticker per 5 minutes. Prices keep updating during a halt.
- **Session open price:** set when the stream goes online (or on app start if already live, or by the **Open bell** button in demo mode). A Listing that IPOs after the opening Bell uses its IPO Price. With no open session, a Listing uses its IPO Price until the next opening Bell. Change % on the overlay is measured against this reference.
- A Halt needs a Price sample at least 60 s old; an IPO cannot Halt against an invented earlier Price. Keep enough bounded history to compare with the latest sample at or before `now - 60 s`.
- **Moon:** price reaches 2.5x the session open. **Crash:** price falls to 0.4x. Each fires at most once per ticker per session.

### 5.8 Bells and session summary

- `stream.online` (or the Open bell button) rings the opening bell and shows "MARKET OPEN".
- `stream.offline` (or the Close bell button) rings the closing bell, shows a summary banner, and posts one chat message: "Closing bell: top gainer stonks +142%, biggest crash LUL -61%, richest @ann (5,230 coins)."
- Trading stays open while offline. The bells are ceremony, and the summary covers the session since the opening bell.

### 5.9 Delisting, freezing, seasons

- **Delist** (mod command, dashboard, or the auto-delist in 5.3): each holder receives `floor(price * shares)` Coins with no fee, rounded once for that holder's entire Holding. Clear those Holdings atomically and remove the Listing from the board. It can IPO again later with fresh Heat, impact, halt history and IPO Price.
- **Freeze:** a frozen trader can't trade (for abuse). Unfreeze restores them.
- **Pause:** the whole market stops accepting trades (prices keep moving).
- **Season reset** (dashboard, with typed confirmation `RESET`): clears Traders, Holdings, Listings, candles and pending engine state atomically. CSV export before reset is optional P1; reset must work without export support.

### 5.10 Behavior targets (used to tune defaults)

Each target is an automated simulator scenario in the test suite. The fixed fixtures below prevent tuning by changing initial conditions. All events use stable `sim_` IDs, and every run uses the same seed. IPO eligibility itself is covered separately by acceptance test 2.

**Shared fixture:** at `t=0`, seed active Listings A, B, C and D with Price/base/session reference 100.00, Heat 2 each, impact 0, and no recent Uses or Halt history. Seed fixture state explicitly; do not count an unrecorded warm-up toward the scenario. Advance one-second ticks with events before the tick. Unless overridden, no Trades occur and each named distinct Chatter has 1,000 Coins.

| # | Scenario | Target |
|---|---|---|
| B1 | Shared fixture. The same 10 Chatters each Use A at t=0,5,...,55 s. B, C and D each receive one Use from a fresh Chatter at t=0,15,30,45,60 s. | At t=60 s, A is at least 180.00. |
| B2 | Shared fixture. One Chatter Uses A at t=0,1,...,29 s. Three other Chatters each Use B once at t=0. No other Uses. | At t=30 s B's increase exceeds A's; A never exceeds 125.00 during the run. |
| B3 | Continue B1 through t=360 s. After t=60 A receives no Uses. B, C and D each receive one Use from a fresh Chatter every 5 s, starting at t=65. | At t=360 s A is at least 40% below its maximum Price in t=0..60 s. |
| B4 | Override the fixture to Heat 0 for all Listings and give one Trader 1,000,000 Coins. At t=0 that Trader buys 5,000 A at 100.00; no other events occur. | Immediate post-impact Price is at most 200.00; at t=30 s its excess over base 100.00 is half the immediate excess, within 0.01. |
| B5 | Use only A, B and C, each seeded as above. Three Chatters post every 5 s from t=0 to 150. Two always Use B and C respectively. The third Uses A before t=60, B from t=60 to 115, and C from t=120 onward. | A at t=30 rises at least 15% from t=0; B at t=90 rises at least 15% from its t=59 Price; C at t=150 rises at least 15% from its t=119 Price. |

**P0 planning gate (E0):** turn these fixtures into a dependency-free executable numerical experiment before implementing E1. Record measured endpoints and the constants used. Preserve the target thresholds. If the formula and targets cannot be satisfied together, record the failing fixture and a worked result, then agree a spec/ADR change before engine implementation; do not quietly weaken a target. The analytical B4 clamp/decay check can run before trading exists. These experiments validate feasibility; engine tests still exercise the public engine interface test-first.

### 5.11 Greetings and streaks (P1)

A viewer says hello once per Stream to claim Coins. Saying hello on consecutive Streams builds a Streak, and the Streak raises the bonus.

- **Stream:** one broadcast night. An opening Bell starts a new Stream unless the previous Stream Session ended less than `STREAM_RESTART_GAP` = 2 h earlier (its closing Bell, or its last tick if it never closed). A dropped connection or an app restart therefore continues the same Stream. The demo-mode Open bell button always starts a new Stream, so a Streak can be demonstrated.
- **Claim:** `!greetings <words>`, with at least one word after the command, for example `!greetings good morning`. The words are never judged. They are not stored, not echoed in any reply, not broadcast and not shown on the overlay: Twitch chat already shows them, and the Exchange only needs to know a greeting happened.
- **Window:** a claim needs an open Stream Session (the Bell has rung) and a Trader who is not frozen. A Trader can claim once per Stream. A second claim in the same Stream changes nothing and gets one reply.
- **Streak:** the number of consecutive Streams in which the Trader claimed. A first claim, or a claim after missing at least one whole Stream, sets it to 1. A claim in the Stream right after their last claim adds 1.
- **Bonus:** `GREETING_BASE` + `GREETING_STREAK_STEP` * (min(Streak, `GREETING_STREAK_CAP`) - 1) Coins, with defaults 50, 10 and 10: 50 Coins at Streak 1, 100 at Streak 6, 140 from Streak 10. Credits saturate at the Coin cap (section 12). Like every default it is tuned in E6.
- **Shown Streak:** a Streak is shown only while it is alive, meaning the Trader's last claim was in the current Stream or the one before it. Once a whole Stream passes without a claim the Streak is not shown, and the next claim restarts it at 1.
- **Replies** (fixed templates through the chat-out queue, within the reply budget): a claim answers "@ann good to see you. Streak 4, +80 Coins."; a repeat answers "@ann you already said hello this Stream. Streak 4."; a bare `!greetings` answers "Say hello with a few words: !greetings good morning"; outside an open Stream Session it answers that the market is closed. Simulated Traders never reply to Twitch.
- **Where the Streak shows:** the `!portfolio` reply and the portfolio card (P1), the Feed item "ann greeted · streak 4 · +80", and the dashboard Traders list. The overlay Board is unchanged, because its 24 px rows have no room for a badge.
- A greeting is a command, so it adds no Heat and no Stipend minute (5.2). A Season reset clears Streaks along with the Traders.

### 5.12 Grants (P1)

The streamer can give a Trader Coins live, for a good moment, a giveaway or a comeback.

- **Who:** the broadcaster only, from chat (`!grant @user N`) or from the dashboard Traders list. Mods cannot grant by default.
- **Amount:** a whole number from 1 to `GRANT_MAX` (default 10,000, a validated setting). Zero, negative, fractional and non-numeric amounts are rejected with no change. Credits saturate at the Coin cap (section 12) and record the applied amount.
- **Target:** the command's mention, by the mentioned user's ID, or else an exact case-insensitive login match for a typed name. The target must already be a Trader. An unknown name is rejected with a reply, and no Trader is created.
- **Effect:** the Trader's Coins rise by the amount. It is not a Trade, adds no Heat and does not touch Prices.
- **Record:** every grant writes one `grants` row (section 10). A repeated `request_id` credits once: the dashboard sends one per click, and chat uses the message ID.
- **Feedback:** a Feed item "ann +500 · gift from the streamer" and one reply "@ann received 500 Coins from the streamer." through the chat-out queue. Grants to a simulated Trader never reply to Twitch.
- **Dashboard:** a Grant action on each Traders row opens a small form with an amount field and quick amounts (100, 500, 1,000), then shows "Give ann 500 Coins?" with a Confirm button. It posts through the guarded route (Origin and `X-CTA`).

## 6. Commands

**Viewers**

| Command | Result |
|---|---|
| `!buy T Q` / `!sell T Q` | Trade (5.5). Feed toast, plus a reply (rate-limited) |
| `!portfolio` (alias `!pf`) | P0 reply: "@ann 1,240 coins, stonks x10 (+12%), net worth 2,035". A live Streak (5.11) adds ", streak 4" to the end. P1 additionally shows a portfolio card for 6 s, with the Streak. |
| `!top` | Overlay leaderboard pulses, plus a reply listing the top 3 |
| `!market` | Reply: how to play, plus the 5 hottest tickers |
| `!greetings <words>` | P1: claim the Greeting bonus once per Stream and build a Streak (5.11). Feed item, plus a reply |

**Mods and the broadcaster**

`!market pause` · `!market resume` · `!delist T` · `!freeze @user` · `!unfreeze @user`

**Broadcaster only:** `!grant @user N` (P1, 5.12)

**Reply budget**

- At most 1 reply per user per 20 s, and everything goes through the chat-out queue.
- If a reply is dropped by the budget, the overlay still shows the result.
- Trades by simulated traders never reply to Twitch.

## 7. Overlay

One page, `/overlay`, a transparent 1920 x 1080 canvas made of widgets. Parameters:
- `?widgets=tape,chart,board,feed,banners,cards` (default: all implemented widgets; cards are P1)
- `?motion=reduced`
- `?sound=off`

| Widget | Zone (px at 1080p) | Behavior |
|---|---|---|
| **Tape** | bottom strip, full width, 64 high | Scrolls at 60 px/s. Each item shows the emote image (40 px), ticker, price, and session change with an up or down arrow. Halted items show a pause mark. Empty state: "Two chatters list an emote. Type !market". |
| **Chart** | top-right, 520 x 300 | The hottest listing (switches at most every 20 s, with a crossfade): a 10-minute line/area chart, a big price, the change %, and a 64 px emote. |
| **Board** | right, under the chart, 520 x 260 | Top 5 traders by net worth: rank, name in their chat color, net worth, session change. A smooth reorder when ranks change. |
| **Feed** | left, above the tape, 480 x 260 | Last 5 events as toasts ("@ann BUY 5 stonks @ 132.40", follows, visas, delists, and in P1 greetings such as "ann greeted · streak 4 · +80" and grants such as "ann +500 · gift from the streamer"). They slide in and fade after 8 s. |
| **Banners** | top-center, 900 x 140 | IPO, HALT, MOON, CRASH, RAID, BELL, DELIST, PAUSED. One at a time, 4 s each, queued. Priority: RAID > HALT > MOON/CRASH > IPO > the rest. |
| **Cards (P1)** | center-left, 420 x 220 | Portfolio card (with the Streak while it is alive) for 6 s after `!portfolio`; at most 20 pending, replacing an older pending card for the same Trader, then dropping the oldest on overflow. |
| **SIM badge** | top-left corner, small | Shown only while the simulator runs. |

**Art direction**

The look is a trading floor in stream colors.

- **Panels:** dark neutral glass (`rgba(34,34,34,.88)`), 1 px hairlines and soft 28 px corners.
- **Color:** green `#2BD47D` up, red `#FF5A5F` down, lime `#e2ff1f` as the only brand accent. Lime never encodes Price direction.
- **Type:** self-hosted Inter Tight with tabular figures; Doto 800 only for large display numerals. No monospace except URLs/timestamps.
- **Emotes** are the logos.

Art direction updated by the streamer's October 28 redesign request; [the detailed brief](../redesign-prompt.md) supersedes the original purple/font styling. Behavior and widget zones remain unchanged.

**Readability rules**

- Minimum text 24 px, tickers 28 px.
- Contrast of at least 4.5:1 against the panel.
- Up and down use arrows as well as color, for color-blind viewers.
- At most 3 flashes per second anywhere.

**Motion**

- A price tick flashes the cell background for 150 ms.
- Banners scale in with a spring and slide out.
- `motion=reduced` turns all movement into fades.

**Sound (P1)** (Web Audio, synthesized, `sound=off` to mute)

- opening and closing bell
- a soft ding on IPO
- a low thud on HALT
- nothing per trade (too noisy)

**Performance**

- 60 fps at 1080p in an OBS browser source.
- Price updates are batched to one per second.
- Nothing animates off-screen.

## 8. Dashboard (`/`)

- **Setup checklist:** Connect Twitch, Overlay in OBS (ticks when an overlay client connects to SSE), Go live (ticks on `stream.online`).
- **twitch-kit panels:** connection, overlay URL, simulator, chat-out.
- **Market table:** every listing with heat, price, session change and holders. Delist button.
- **Traders:** search, coins, net worth, freeze/unfreeze. P1 adds the Streak and a Grant action (5.12).
- **Settings:** P0 exposes Starting Coins, Fee, trade cooldown and Heat half-life with validated ranges and reset-to-default. Other defaults remain in the validated server settings object; the full form is P1.
- **Demo controls:** Open bell, Close bell, Fake raid (N viewers), Fake follow.
- **Season:** P0 reset (type the word RESET to confirm). CSV export and JSON backup export/import are P1.

## 9. Simulator scenarios

These are registered with twitch-kit's simulator. Each also backs an automated test.

| Scenario | What it does |
|---|---|
| Opening day | 12 chatters, mixed chat, 6 emotes IPO within 2 minutes, light trading |
| Pump and dump | 15 chatters spam one emote for 60 s, early buyers sell into the spike, it halts, then crashes |
| Solo spammer | A prelisted market shows one Chatter spamming A while three others Use B once, matching B2. The display explains why the group wins. |
| Raid wave | Raid event with 40 viewers, 20 new chatters arrive and claim visas |
| Greeting streak (P1) | 12 chatters over 4 Streams (Open and Close bell between them): most greet every Stream and two skip one. Streaks build and break, Feed items appear and the bonus grows |
| Quiet market | Chat drops to 0.2 msg/s for 5 minutes |
| Soak | 50 msg/s, 500 Chatters, 24 Listings, 30 minutes after a 10-minute warm-up; fixed participant and emote sets |

## 10. Data

The tables, in addition to twitch-kit's shared tables.

| Table | Key | Fields |
|---|---|---|
| `traders` | user_id | login, display_name, color, coins (integer), frozen, created_at, last_active_at, is_sim, greeting_streak (integer, P1), last_greeting_stream_no (integer or null, P1) |
| `listings` | ticker | emote_key, provider, image_url, status (active, delisted), ipo_at, session_open_price, base, last_price, halted_until, last_use_at |
| `holdings` | user_id + ticker | shares (integer), cost_basis (integer coins) |
| `trades` | id | at, user_id, ticker, side, shares, price, coins |
| `candles` | ticker + minute_start | open, high, low, close |
| `sessions` | id | opened_at, closed_at, summary JSON, stream_no (integer, P1) |
| `grants` (P1) | id | at, user_id, amount (integer coins actually applied), source (chat, dashboard), request_id (unique) |
| `engine_state` | singleton | version, saved_at, last_tick_at, bounded runtime state JSON |

**Persistence**

- Each applied event or tick commits durable rows and the versioned engine-state checkpoint in the same transaction. A periodic 30 s checkpoint may compact state but must not be the only record of accepted Trades or rule state.
- The checkpoint includes Heat, impact and their timestamps; pending IPO distinct Chatters/Uses; rolling repeat-use timestamps; last tick; per-Trader trade cooldown and stipend participation; active Raid Visa window; halt deadlines and last-Halt times; session references, the current Stream number and Moon/Crash flags; and bounded Price history. Public SSE payloads are projected separately and never expose this internal record or raw message text.
- At the same recovery timestamp, restore-from-rows reproduces all durable business state and rule state exactly. Overlay animations, queue playback and socket state are ephemeral and are not replayed on restart.
- Before accepting new events, expire elapsed cooldowns and windows against injected recovery time. For downtime under 10 minutes, decay Heat/impact analytically over the gap, keep base/last Price until the first normal tick, and omit invented Uses, Stipends, candles and market-moment effects for the gap. For downtime of 10 minutes or longer, clear Heat, impact, pending IPO and repeat-use history; retain base/last Prices, Portfolios and session flags. Retain unexpired absolute Halt deadlines in both cases. A backwards recovery timestamp is a validation error rather than a negative elapsed time.
- Bound time-dependent state: repeat-use history retains 30 s; pending IPO Uses retain 10 minutes and are pruned on every event/tick; trade/reply cooldown maps expire after their windows; stipend participation retains only the current minute; chart/Halt Price history retains 10 minutes plus one boundary sample. P0 candles retain at most 11 minute buckets per Listing (P1 1,441). Pending IPO keys are restricted to recognized catalog Emotes and removed when expired or listed.
- Keep the public Feed to 5 items and pending Banners to 32, coalescing the same kind/Ticker before dropping the oldest lowest-priority Banner. P1 cards have their separate 20-card limit. Persistent Traders, Holdings and Trade records are business data; their expected growth is distinct from expiring runtime history. Avoid an unbounded in-memory duplicate of the entire Trade log.

## 11. Engine contract

`apps/emote-exchange/src/engine` is pure ([ADR 0006](../adr/0006-pure-engines-with-injected-time.md)).

- **Inputs:** a ChatEvent, a dashboard action, or a tick, plus `now`.
- **Outputs:** effects.
  - persist (rows to write)
  - broadcast (overlay delta)
  - say (chat text + reply target + priority)
  - sound (cue name)
- **No direct access** to clock, randomness, DB or network.
- **Restoring** state from the DB is a separate pure function from rows to state.

## 12. Edge cases

| Case | Handling |
|---|---|
| Tickers made of symbols (Twitch's `:)` and `<3`) | Valid tickers. Commands split on whitespace, so `!buy <3 5` works |
| Same name in two providers | One listing per name. The image comes from the higher-precedence provider (twitch-kit section 9) |
| Twitch emote from another channel's sub set | Counts. Imaged by its fragment ID |
| Bot echoes and foreign shared-chat messages | Ignored (`selfSent`, `foreign`) |
| Message deleted by a mod | Its heat stays (already counted). Not worth reversing |
| Banned user | Portfolio kept. Mods can freeze |
| Restart while halted | `halted_until` is persisted and honored |
| Stream drops and restarts, or the app restarts, within 2 h | Same Stream: one Greeting claim, Streak unchanged (5.11) |
| Emote removed from the channel's 7TV set | Listing stays tradable until delisted. Image falls back to the cached URL |
| Integer overflow | qty capped at 1,000,000 and total Coins at 1,000,000,000 per Trader. Credits saturate at the cap; a saturated credit never becomes fractional or wraps. Record the applied amount, including zero. Validate safe integers before arithmetic. |

## 13. Acceptance tests

Each line is a test (automated where marked "auto") or a scripted manual check in Sprint 3.

1. **auto** Demo mode: no `.env`, the server starts, the dashboard shows Demo mode. The Opening day scenario lists at least 4 emotes within 2 minutes (simulated time).
2. **auto** IPO: 2 distinct chatters use X within 10 min, so X lists at 100.00 and an IPO banner effect is emitted. One chatter using it 10 times does not IPO it.
3. **auto** B1 to B5 hold (section 5.10).
4. **auto** Buy: 1,000 coins, `!buy X 5` at 100.00, leaves 495 coins and 5 shares, emits a feed toast and a reply.
5. **auto** Each rejection reason in 5.5 leaves state unchanged and produces exactly one reply (subject to the budget).
6. **auto** Sell all: proceeds use the minimum-fee formula in 5.5 and the Holding is gone. Cover the 1.50-Price/one-share minimum-fee example, `max` affordability and integer no-fee Delist payouts.
7. **auto** Halt: +60% within 60 s halts for 30 s, buys are rejected with the seconds left, and there's no second halt within 5 minutes.
8. **auto** Stipend: a trader chatting in 3 separate minutes gets +30. Commands don't count.
9. **auto** Follow bonus and raid visa amounts and windows.
10. **auto** Foreign, self-sent and command messages never add heat.
11. **auto** Restart: run a scenario and rebuild at the same timestamp; Portfolios, Listings, Prices, candles and rule state are equal. Recover across a short and a long gap; verify cooldown expiry, no duplicate Stipend, no repeated Moon/Crash and the stale-Heat policy in section 10. When greetings ship, a live Streak and the current Stream number also survive the rebuild.
12. **auto** Reply budget: 100 `!portfolio` commands from 100 users within 10 s produce at most 18 chat sends per rolling 30 s through the queue. P0 requires correct reply handling; if P1 cards ship, their queue respects the 20-card bound and overflow policy.
13. **auto** Soak: after warm-up, simulate 30 minutes at 24 Listings, 500 Traders and 50 msg/s. Assert the retention/queue bounds in section 10, stable fixed-cohort cardinality and valid Coins. Report tick p95 and peak heap; target p95 below 5 ms on the documented reference machine. Raw heap may grow while candles fill their retention window; it is not a zero-growth assertion or a machine-independent CI threshold.
14. **manual** Live on Twitch: 2 test accounts trade, a real follow gives its bonus, the closing bell posts the summary in chat.
15. **manual** OBS: 60 fps, every widget readable on a phone-sized stream preview, the SIM badge shows only while simulating.
16. **auto** (P1) Greetings: a first `!greetings good morning` pays 50 and sets Streak 1; a second claim in the same Stream pays nothing and gets one reply; the next Stream pays 60 and sets Streak 2; skipping a whole Stream restarts at 1 and hides the old Streak; an opening Bell less than 2 h after a closing Bell continues the Stream (no second claim, Streak unchanged) while the demo Open bell always starts a new one; a bare `!greetings`, a frozen Trader and a closed market each leave Coins unchanged; the greeting words never appear in any persist, broadcast or say effect; credits saturate at the Coin cap.
17. **auto** (P1) Grants: `!grant @ann 500` from the broadcaster credits exactly 500, writes one `grants` row and emits one Feed item and one reply; from a Mod or a viewer it changes nothing; zero, negative, fractional, non-numeric and above-`GRANT_MAX` amounts and unknown targets change nothing; a repeated `request_id` credits once; a saturated credit records the applied amount; a grant to a `sim_` Trader never reaches Twitch; the dashboard route rejects a request without the Origin and `X-CTA` guard.

## 14. Priorities

- **P0 (must ship):** the behavior-fixture feasibility gate, market rules, essential dashboard controls, guarded actions, persistence/recovery, simulator, Tape/Chart/Board/Feed/Banners/SIM overlay, and all P0 parts of acceptance tests 1-15. Each live/OBS check records actual evidence; credentials and OBS availability are external verification prerequisites.
- **P1:**
  - portfolio cards
  - greetings and streaks (5.11)
  - grants, by chat command and from the dashboard (5.12)
  - candles beyond what the chart needs
  - full settings UI (a P0 subset is fine)
  - CSV export
  - JSON backup
  - sounds
  - Playwright overlay smoke test with screenshots
- **P2:**
  - Channel Points convert to coins (Affiliate channels only)
  - "Earnings call" events (a random listing reports, chat votes beat or miss)
  - Short selling

## 15. Left to the builder

- Internal data structures
- Exact animation curves
- Board reorder animation
- Chart rendering (canvas, hand-drawn, no chart library needed)
- Default tuning within the behavior targets
- How settings are grouped
