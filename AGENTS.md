# AGENTS.md

Emote Exchange is one Codex x TwitchCon hackathon entry in a pnpm workspace: `apps/emote-exchange` (port 4100), supported by `packages/twitch-kit`. The streamer runs one local Node process. OBS loads `http://127.0.0.1:4100/overlay`. Internal submission target: Nov 2, 2026, 8:00 PM IST. Prefer finished and polished over clever.

## Before you start

- **A sprint task**: read its block in `docs/sprints/` and every spec section the prompt names. The task's "Done when" line is the completion bar.
- **Twitch auth, EventSub, chat sending, emotes, storage, SSE, the simulator, HTTP routes**: `docs/specs/twitch-kit.md`.
- **Market rules or the Exchange overlay and dashboard**: `docs/specs/emote-exchange.md`.
- **Naming things**: the glossaries listed in `GLOSSARY-MAP.md`. Code uses glossary terms (Listing, Heat, Trader).
- **Current scope and implementation order**: `docs/implementation-plan.md`. Setup completion does not mean the market or live Twitch integration is implemented.
- **A change that contradicts an ADR in `docs/adr/` or a spec rule**: stop and ask the human. When agreed, record it as a new ADR or a spec edit.
- **A dependency not listed in twitch-kit spec section 4**: ask first.

## Commands

`pnpm i` · `pnpm check` (types) · `pnpm lint` · `pnpm test` · `pnpm build` · `pnpm dev:exchange` · `pnpm start:exchange` · `pnpm --filter <package> test`

## How we build

- **Pure engines.** Product rules and the EventSub protocol are pure functions of `(state, input, now, rng)` that return effects. The runtime layer alone touches the clock, randomness, SQLite, the network, SSE and chat.
- **Test-first** for engines, parsers, filters, the chat-out queue and protocol code: write the failing `node:test` case, watch it go red, then make it green.
- **Node 24.12+ native TypeScript** on the server: erasable syntax only (no enums, namespaces or constructor parameter properties), relative imports end in `.ts`. Use `import type` for types.
- **One way out to chat**: twitch-kit's chat-out queue.
- **Display data only to browsers**: overlays and dashboards receive approved names, numbers, emote names and image URLs. Raw incoming chat remains server-side.
- **Secrets stay in `.env`** (git-ignored). `.env.example` lists every variable with a placeholder.
- **Servers listen on 127.0.0.1.** Validate loopback Host on every request. State-changing routes go through twitch-kit's Origin + `X-CTA` guard.
- **Demo mode keeps working**: with no Twitch keys, the simulator can drive every feature. Simulated chatters are named `sim_*`.
- **Coins are integers.** Prices are numbers rounded to 0.01 for fills and display.
- **UI work is checked in the real overlay** at its OBS size in demo mode, at full and half scale. Report what you looked at and what you fixed.

## Done means

- `pnpm check`, `pnpm lint`, `pnpm test` and `pnpm build` pass.
- Each acceptance check in the task is verified, and your final message says how (test name or manual step).
- One commit per task, message `<task-id>: <summary>`, with the verification in the body.

## Code Review Rules

- Flag raw incoming chat text reaching an overlay or dashboard, and simulated effects reaching Twitch chat.
- Flag tokens or secrets sent to a browser, written to logs, or committed.
- Flag engine code that reads `Date.now()`, `Math.random()`, the database or the network.
- Flag outbound chat that bypasses the chat-out queue.
- Flag state-changing routes missing the Origin + `X-CTA` guard, and any CORS header.
- Flag coin balances that can become fractional or negative.
- Flag SQL built by string concatenation with chat input.
