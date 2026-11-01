# Emote Exchange — Devpost submission

Prepared November 1, 2026. Copy the relevant sections into Devpost's fields. The public demo URL and final submission confirmation are still pending.

## Project name

Emote Exchange

## Elevator pitch

Turn Twitch chat's emote attention into a live community market. Buy, sell, earn Coins, build Streaks, and follow every moment on stream.

## Project links

| Field | Value |
|---|---|
| Source repository | https://github.com/amit-ksh/emote-exchange |
| Installation and judging instructions | https://github.com/amit-ksh/emote-exchange/blob/main/apps/emote-exchange/README.md |
| Public YouTube demo URL | Pending upload; see [demo-video.md](demo-video.md) for the finished exports |
| Main Codex build-session ID | `01a17e3d-2a72-7f72-8da3-a6350b3bfaaa` |
| Application type | Local streamer dashboard, Twitch chat game and OBS Browser Source overlay |

## Inspiration

Every Twitch community has its own language: the emotes everyone reaches for, the regulars who keep returning, and the moments that make chat explode. We wanted those shared reactions to become something viewers could play together.

Emote Exchange gives that attention a visible story. An emote becomes a Listing, chat activity moves its Price, and viewers decide when to buy or sell using free play Coins. The game lives alongside the stream, where the community already gathers.

## What it does

Emote Exchange turns a channel's recognized emotes into a live community market. Two different Chatters using an emote can trigger its IPO. Prices follow recent emote attention, with diminishing credit for repeated Uses from the same person.

Viewers participate directly in Twitch chat:

- **Buy and sell:** trade whole shares of a listed emote with `!buy` and `!sell`.
- **Follow a Portfolio:** use `!portfolio` or `!pf` to see Coins, Holdings, Net Worth and a live Streak.
- **Check in:** say `!greetings` followed by a few words to claim Coins once per open Stream. Consecutive Streams build a Streak and increase the reward.
- **Find the action:** `!market` shows playing instructions and the hottest tickers; `!top` shows the leading Traders.
- **Earn Coins:** start with a balance, earn a Stipend for qualifying chat minutes, receive a Follow bonus, or qualify for a Raid Visa after a Raid.

The streamer can give an existing Trader a Grant from the dashboard or with the broadcaster-only `!grant` command. Mods and the broadcaster can pause trading, Freeze a Trader or Delist an emote.

A transparent OBS overlay shows the Price tape, chart, leaderboard, recent activity and market moments such as IPOs, Halts, Moons and Crashes. The dashboard brings together market controls, Traders, emote catalogs and Live analytics for engagement, participation and the economy.

Coins have no cash value: there are no deposits, withdrawals or real-money redemption. Portfolios and Streaks survive app restarts. A bundled demo lets someone explore the app without connecting a Twitch account.

## Commands viewers can try

The examples use `DemoBull`; on a connected channel, choose an active Listing from `!market`.

| Command | What happens |
|---|---|
| `!buy DemoBull 2` | Buy two shares at the current Price, including the Fee |
| `!buy DemoBull max` | Buy as many shares as the Trader can afford within the trade limit |
| `!sell DemoBull 1` | Sell one share |
| `!sell DemoBull all` | Sell all owned shares of that Listing |
| `!portfolio` or `!pf` | Show Coins, Holdings, Net Worth and a live Streak |
| `!greetings good evening` | Claim the once-per-Stream Greeting reward |
| `!market` | Show instructions and the hottest tickers |
| `!top` | Show the top three Traders |

The broadcaster can use `!grant @name 500` to give an existing Trader 500 Coins. Mods and the broadcaster can use `!market pause`, `!market resume`, `!freeze @name`, `!unfreeze @name` and `!delist DemoBull`.

## Check-ins and Coin rewards

These are the default rewards; the app uses validated settings.

| Reward | Coins |
|---|---|
| Starting balance for a new Trader | 1,000 |
| Stipend for a minute with qualifying non-command chat | 10 |
| Follow bonus | 200 |
| Raid Visa for an eligible first-time Chatter within five minutes after a Raid | 500 |
| First Greeting claim | 50 |
| Each consecutive Stream's Greeting claim | 10 more, reaching 140 at Streak 10 |
| Broadcaster Grant | Chosen amount, up to the configured maximum; default maximum 10,000 |

The check-in follows **Streams**, not calendar days. A Trader can claim once per open Stream. Skipping a whole Stream breaks the Streak. Greeting words are not retained or echoed by the app; only the claim matters.

## How we built it with Codex

We used Codex throughout the project: reviewing the product plan, defining market behavior, implementing Twitch integration, building the dashboard and overlay, and checking recovery and moderation rules. The main build session is `01a17e3d-2a72-7f72-8da3-a6350b3bfaaa`.

A useful example came from reviewing the Pump and dump demo. Its early buys arrived before the emotes had become Listings, so those Trades could not succeed. Codex helped correct the sequence: establish Listings, buy, concentrate attention, then sell. That made the demonstration exercise the actual game loop rather than only moving numbers on screen.

The app uses TypeScript, Node.js, React, Vite, Hono and SQLite, with Twitch EventSub and Helix for the live connection. OBS displays the overlay as a Browser Source. ElevenLabs provides the video narration; it is not required to run the app.

## Challenges we ran into

**Making a small chat feel active.** The game needs meaningful Price movement without requiring thousands of messages. Attention Share, fading Heat and diminishing repeats help a small community create a visible market story.

**Making rewards understandable.** Coins, Fees, Greetings, Streaks and Grants need clear feedback. Bot replies, the Feed and the Traders list show what happened, while whole-Coin settlement keeps balances predictable.

**Keeping the stream readable.** An overlay competes with the content behind it. We refined contrast, numerical widths and Feed spacing over bright and dark backgrounds, including the striped scene used in the recorded demo.

## Accomplishments we're proud of

The full interaction loop works through real Twitch chat: a viewer checks in, buys, checks a Portfolio, sells and receives a streamer Grant. The bot replies and the overlay reflect those actions. The streamer can also watch participation on the Live page and manage the market from one dashboard.

The offline demo uses the same market rules, includes original bundled emotes and supports scenarios such as Opening day, Pump and dump, Raid wave and Greeting streak. Simulated activity is identified and does not send messages to Twitch.

## What we learned

A stream game needs reasons to participate beyond trading. Check-ins recognize returning Chatters, Grants let the streamer reward a moment, and the leaderboard gives the community something to follow together. Clear feedback and a readable overlay are central to making those features feel connected.

## What's next

We would like to add Portfolio overlay cards, optional sound cues, longer historical charts and export/import tools. These are future ideas, rather than features claimed in the current build.

## Built with

OpenAI Codex, TypeScript, Node.js, React, Vite, Hono, SQLite, Twitch API, Twitch EventSub, Server-Sent Events, OBS Studio. Demo narration: ElevenLabs.

## Screenshots

- [Market dashboard](../../apps/emote-exchange/screenshots/market-demo.jpg)
- [Live analytics](../../apps/emote-exchange/screenshots/live-demo.jpg)
- [OBS overlay](../../apps/emote-exchange/screenshots/overlay-obs.png)
- [Actual Twitch buy interaction from the launch film](media/launch-poster.png)

The dashboard scenario screenshots show simulation. The launch-film frame shows actual Twitch chat and app responses recorded locally in OBS.

## Try it locally

Follow the [app README](../../apps/emote-exchange/README.md) for the required Node and pnpm versions. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev:exchange
```

Open `http://localhost:4100/`, choose **Start demo**, and view `http://127.0.0.1:4100/overlay`. The bundled demo needs no Twitch keys. Live Twitch use requires the streamer's own application credentials and account connections, as described in the README.
