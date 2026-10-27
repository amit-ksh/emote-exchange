# Submission kit: Emote Exchange

Working draft for the finished entry. Foundation setup alone does not support the product claims below. Replace placeholders and remove any feature that was not shipped and verified. Confirm form and video requirements against [the organizer brief](../hackathon-brief.md).

## Entry fields

- **Title:** Emote Exchange
- **Tagline:** A live market where the stocks are your channel's emotes.
- **Built with:** TypeScript, Node.js, React, Vite, Hono, SQLite, Twitch API, EventSub, OBS and OpenAI Codex; retain only technologies used in the final build.
- **Repo:** `<repository URL>/tree/main/apps/emote-exchange`
- **Video:** `<verified video URL>`
- **Build session:** `<actual identifier from codex-sessions.md>`

## Description draft

### Inspiration

Emote spam is a shared language in Twitch chat. We wanted to turn that attention into a game: when viewers rally around an emote, its market moves with them.

### What it does

Emote Exchange turns channel emotes into Listings in a play-money market. Two chatters using the same emote can trigger an IPO. Viewers receive free play coins and trade with `!buy` and `!sell`. Prices follow current chat attention, with diminishing weight for repeated use by one chatter.

The intended overlay shows the ticker tape, a chart, leaderboard, trade feed and market moments such as IPOs and trading halts. The streamer controls the Session from a local dashboard. Demo mode demonstrates the market without Twitch credentials, with simulated activity clearly labeled.

Before submitting, replace this paragraph with a verified feature list covering the actual provider support, persistence, follow/raid behavior, closing summary and demo scenarios. Coins have no purchase, cash-out or real-money value.

### How we built it with Codex

We reviewed the product rules, technical choices and task acceptance checks before implementation. The app separates pure market rules from the runtime that handles Twitch, persistence and browser delivery.

Add concrete evidence of the workflows actually used:

- A planning decision and why it improved the app: `<example>`.
- A meaningful test written before the implementation: `<test and result>`.
- A review finding that was fixed: `<issue and fix>`.
- Additional sessions or delegated work, if used: `<contribution>`.

The chosen architecture is a local Node 24 process with native TypeScript, built-in SQLite and WebSocket, Hono HTTP routes, React/Vite pages, and SSE updates to an OBS browser-source overlay. Twitch integration uses EventSub and the Helix API. State which parts are implemented and demonstrated in the submitted revision.

### Challenges

`<One or two real problems, their tradeoffs and the implemented solutions. Examples: a lively market for a small chat, integer settlement, rate-limited replies, or reconnect recovery.>`

### Accomplishments and lessons

`<Specific observed outcome, test evidence and what the build taught us. Avoid unmeasured performance or originality claims.>`

### What's next

`<A small list clearly labeled as future work, separate from shipped functionality.>`

## Video script (editing target 2:45)

| Time | Shot | Story |
|---|---|---|
| 0:00–0:10 | Real chat uses an original emote and its chart moves. | What if chat's emotes were a market? |
| 0:10–0:30 | Tape, chart, leaderboard and trade feed. | Explain attention-driven prices and play coins. |
| 0:30–1:20 | A real viewer buys, coordinated chat activity moves price, and a sale changes holdings. Add visibly labeled simulation only when needed. | Show cause and effect rather than listing features. |
| 1:20–1:35 | Closing bell and the implemented Session summary. | Show a clear end to the live walkthrough. |
| 1:35–2:20 | Actual plan, a useful red-to-green test, a fixed review finding and build-session evidence. | Explain the concrete role Codex played. |
| 2:20–2:40 | Local dashboard, OBS URL and offline demo. | Show the verified setup steps. |
| 2:40–2:45 | Title card. | Emote Exchange, built with Codex for Twitch. |

Adjust the script to the finished app and the confirmed duration limit. Do not stage a missing feature or test outcome.

## Recording and submission checks

- [ ] Real Twitch behavior is visible; simulated activity uses `sim_` names and a SIM badge.
- [ ] The images, emotes and sound assets have checked permissions.
- [ ] Captions are readable and the video plays from a logged-out browser.
- [ ] Every product claim matches the submitted revision and verification evidence.
- [ ] Form fields, repository access, duration and session information match organizer requirements.
- [ ] All placeholders are removed before submission.

## Screenshots

1. The overlay during a real market interaction.
2. Twitch chat showing a trade command and queued reply.
3. The dashboard and actual connection/setup state.
4. A meaningful Codex plan or test/review result.
