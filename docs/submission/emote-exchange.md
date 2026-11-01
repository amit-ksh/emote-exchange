# Emote Exchange — submission copy

For the current paste-ready entry and demo assets, use [Devpost submission](devpost-submission.md) and [demo-video package](demo-video.md). This file retains the longer build narrative and evidence index.

Prepared October 29, 2026 from the shipped app. This file contains paste-ready description text and a factual evidence index. It is not a claim that a video or Devpost entry has been submitted.

## Entry fields

- **Title:** Emote Exchange
- **Tagline:** Chat attention becomes a live emote market.
- **Repository:** https://github.com/amit-ksh/emote-exchange
- **Setup:** https://github.com/amit-ksh/emote-exchange/blob/main/apps/emote-exchange/README.md
- **Built with:** TypeScript, Node.js 24, React, Vite, Hono, SQLite, Twitch EventSub/Helix, Server-Sent Events, OpenAI Codex. The overlay is designed as an OBS Browser Source.
- **Main Codex session ID:** `01a17e3d-2a72-7f72-8da3-a6350b3bfaaa`
- **Video status:** The [2:05 narrated Twitch demo](media/emote-exchange-devpost.mp4) includes real chat commands and replies, dashboard/overlay output, labeled simulation and actual repository build evidence. English captions and ElevenLabs narration are included. [Publishing notes](video-publishing.md) cover the free-plan audio attribution/license and YouTube upload; hosting is still pending. The supplied “Ion launch video” link is unrelated.

## Inspiration

Twitch emotes are a shared language. A burst of emote attention can become the story of a stream, but that story usually disappears as chat scrolls past. Emote Exchange turns it into a small community game: chat creates the Listings, attention moves the Prices, and viewers decide when to buy or sell with free play Coins.

## What it does

Two different chatters using the same recognized emote can trigger an IPO. Viewers trade whole shares using `!buy` and `!sell`, check `!portfolio`, and follow the top Traders. Prices follow each Listing's share of recent emote attention. Repeated Uses from one Chatter count progressively less, so one person cannot contribute the same Heat as a participating group.

A transparent overlay shows the Price tape, chart, leaderboard, Feed and queued IPO, Halt, Moon, Crash, Raid and Bell moments. The local dashboard provides setup, emote catalogs, simulation, market controls, Trader moderation and validated settings. Traders can claim greetings once per Stream and build Streaks; only the broadcaster can give Grants. The Live page separates live and simulated activity and reports engagement, trading participation, reward issuance and Fees.

Portfolios, settings and Streaks survive restart. The app keeps Twitch credentials server-side and sends only explicit display projections to browsers. Chat output uses one bounded, rate-limited queue, and simulated effects never go to Twitch.

The keyless demo includes 24 original local SVG emotes and eight scenarios, including Opening day, Pump and dump, Raid wave and Greeting streak. Demo activity is labeled; it can run without Twitch credentials or internet access after installation. Coins have no purchase, withdrawal or real-money redemption.

## How it was built with Codex

The build began with repository documentation, domain vocabulary, architecture decisions and sprint acceptance checks. Codex helped turn the price formulas into executable fixed fixtures before the market engine was implemented. Those fixtures established that attention shifts could move a small-chat market without changing the initial conditions to make a test pass.

The market and EventSub protocol are pure state machines with injected time. The runtime owns SQLite transactions, network calls, clocks, the chat queue and browser delivery. That separation made it possible to test exact Coin settlement, stream restart boundaries, duplicate events and output provenance without requiring a live stream for every change.

A concrete review finding was that Pump and dump issued buys before the emotes had IPO'd, so none of the early buys could fill. Codex changed the scenario to establish Listings first, then buy, concentrate attention and sell. The engine-backed test now requires accepted Trades and the intended price story.

During the final overlay review, a contrast regression test failed for the gray `#a3a3a3` on the redesigned glass over white footage. The correction matched the actual panel composite and the test passed. The same review restored visible share quantities in trade Feed rows, then checked the real overlay at 1920×1080 and half scale.

The current suite has 162 tests, including a forty-minute virtual Soak. Types, lint, tests, production build and smoke checks pass. The smoke test starts a real process, creates Trades, restarts during an open Session and compares saved Portfolios. These are local verification results; recorded Twitch/OBS walkthroughs and remote CI are tracked separately.

## Challenges

**Making a market work for a small chat.** Relative attention, Heat decay and diminishing repeats create movement without needing thousands of messages. Fixed deterministic fixtures preserve the behavior targets.

**Keeping play Coins exact.** Prices have two decimals, but Coins stay whole. Buy/sell settlement uses exact scaled arithmetic and a minimum Fee; credits saturate at the cap and record only what was applied.

**Recovering without replaying the stream.** Durable business state is committed before success effects. Reconnects begin with fresh browser snapshots, while transient animations and outbound messages are not replayed after restart.

## Accomplishments and lessons

The same normalized input model drives Twitch and the simulator, so the offline demo exercises the actual market rather than a separate animation. Testing at engine, persistence, HTTP and transport boundaries made subtle timing and provenance rules reviewable. Finishing the dashboard and failure states mattered as much as the market formula: the streamer needs to know what happened and what to do next.

## What's next

Optional future work includes portfolio overlay cards, sound cues, CSV and backup import/export, and longer historical charts. These features are not part of the submitted build's current claims.

## Evidence index

| Claim | Evidence |
|---|---|
| Price feasibility before engine implementation | [E0 fixtures](../verification/e0-behavior-fixtures.md), [experiment source](../../scripts/experiments/behavior-fixtures.mjs) |
| Actual Twitch buy, persisted Holding and queued reply | [E3 live verification](../verification/e3-runtime-and-recovery.md) |
| Scenario review finding and repair | [E6 verification](../verification/e6-scenarios.md) |
| Contrast red/green result and visible Feed quantity repair | [H2 verification](../verification/h2-bugbash.md), [bug bash](bugbash.md) |
| Recovery, guards, privacy and clean-folder setup | [H4 hardening](../verification/h4-hardening.md) |
| Current UI and setup | [README](../../apps/emote-exchange/README.md) |
| Main build session | [Session record](codex-sessions.md) |

## Organizer requirements checked October 29

[Official rules](https://twitchcon-codex.devpost.com/rules) and [overview](https://twitchcon-codex.devpost.com/) require an accessible repository, description, main build-session ID and a YouTube video under three minutes showing Twitch functionality and Codex use. English materials are required unless accompanied by translations. The repository can remain private if the organizer receives the required access. The entrant must personally confirm eligibility and acceptance of the official rules.

The deadline is November 2, 2026 at 2 PM Pacific Time; the repository's earlier internal target remains November 2 at 8 PM IST. The FAQ has an inconsistent UTC conversion, so do not use its UTC sentence to delay submission. No entry or linked material should be treated as final before its access, video and submission gates pass.

## Remaining publishing fields

A correct Emote Exchange video URL, judge access to the private repository, and the actual Devpost project/confirmation URL are still required. These are deliberately recorded as missing rather than represented by invented links. [Release status](release-status.md) tracks the evidence and account-dependent gates.
