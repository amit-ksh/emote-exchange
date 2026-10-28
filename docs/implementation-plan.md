# Emote Exchange implementation plan

Reviewed 2026-10-27. Scope: one local Twitch application and one hackathon entry. This document records the review decisions; detailed rules remain in the two specs.

## Product and folders

Emote Exchange turns chat's emote attention into a play-money market. P0 is a complete loop: connect or simulate chat, list emotes, buy/sell, move prices, show market moments in OBS, and restore state after restart.

Keep `apps/emote-exchange` for market rules, runtime wiring and React screens. Keep `packages/twitch-kit` for Twitch transport, normalization, chat-out, storage, SSE and simulation. Keep the existing checkout directory `emo-trade`; moving the user's folder adds no product value. The product sprint is `sprint-2-emote-exchange.md`. The second app's folder, spec, sprint, submission and safety ADRs have been removed. [ADR 0001](adr/0001-single-app-workspace.md) records the revised scope.

## Technology decision

UI direction: use the local, git-ignored `references/` images as inspiration, with the builder choosing the final composition. Carry their soft panels, clear numerical hierarchy and restrained color accents into the full dashboard. Preserve the overlay's contrast and legibility over stream footage. The foundation screens are temporary; E4/E5 own the full product design.

| Concern | Choice | Reason |
|---|---|---|
| Runtime | Node 24 LTS, minimum 24.12 | Stable native TypeScript stripping; built-in fetch, WebSocket, tests and SQLite |
| Workspace | pnpm, exact package-manager version, project-local Node runtime and committed lockfile | Repeatable Windows-friendly setup for the app and transport package |
| HTTP | Hono + @hono/node-server | Small local HTTP surface, SSE and static files |
| Client | React + Vite, plain CSS | Dashboard and OBS overlay from one client build; no router or chart dependency needed |
| Development | Vite middleware in the Node server on port 4100 | One command and one origin; no competing dashboard port or CORS |
| Storage | node:sqlite, WAL, migrations | Local persistence without a service or native addon installation |
| Live transport | EventSub WebSocket + Helix; browser SSE | Twitch pushes events; browsers consume display projections |
| Quality | strict TypeScript, Biome, node:test, GitHub Actions | Fast checks and deterministic behavior tests |

Use only Twitch Kit spec section 4 dependencies. Do not add hosting, an ORM, a UI kit, Redux, a chart library, a WebSocket server package or paid AI to the foundation. Source package exports use `.ts` entrypoints; validate the pnpm workspace symlink import on Node's native loader.

Primary references reviewed: [Node TypeScript](https://nodejs.org/docs/latest-v24.x/api/typescript.html), [Hono Node adapter](https://hono.dev/docs/getting-started/nodejs), [Vite middleware mode](https://vite.dev/guide/ssr.html#setting-up-the-dev-server), [Twitch WebSocket lifecycle](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/), [Twitch OAuth](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/). The server connection is unauthenticated; authenticated Helix subscription requests attach it to a user. Native TypeScript still needs a separate type check.

## Review corrections

- Align one-app registration, setup, submission and calendar. Use Nov 2, 8:00 PM IST as an internal target; confirm organizer discrepancies against the official rules before submission.
- Apply a real minimum one-Coin trade fee, specify integer Delist settlement, and assign a Session Open Price when a Listing IPOs after a Bell.
- Specify deterministic starting conditions for B1–B5 and gate market implementation on executable price experiments. Behavior targets remain requirements; proposed fixtures are not evidence they already pass.
- Persist the runtime facts needed for restart behavior, including cooldowns, stipend participation, pending IPOs and session flags. Bound caches, histories, queues and public moment retention.
- Keep portfolio cards, full settings, backups, CSV and sounds consistently P1. P0 acceptance must not depend on those extras.
- Give every normalized event an identity, time and origin. Preserve origin through effects so simulated bells, follows and raids cannot send live chat.
- Bind OAuth state to the initiating browser, serialize refreshes, and check loopback Host on every request plus Origin and `X-CTA` for mutations.
- Begin SSE with complete display snapshots; coalesce replaceable projections without losing independently identified market moments. Bundle demo assets so network access is optional.

## Build order and completion bars

| Task | Delivery | Done when |
|---|---|---|
| S0.0 | Reviewed docs | Scope, specs, ADRs, glossary links and sprint priorities agree |
| S0.2 | App foundation, current setup scope | Install/check/lint/test/build pass; development and production dashboard/overlay work on 4100; HTTP guards and SSE verified |
| K1–K7 | Twitch Kit | Auth, reconnects, emote catalog, chat-out queue, store and seeded simulator work through normalized events, including failure paths |
| E0–E3 | Pure market and trading | Deterministic fixtures, integer Coins, IPO/Heat/fills/bonuses/halts/recovery pass the spec's P0 checks |
| E4–E6 | Market overlay, controls, tuning | All P0 scenarios work end to end in demo and live modes; overlay checked at full/half OBS scale |
| E7–E9 (P1) | Greetings and streaks, broadcaster Grants, Live analytics | Queued after P0; E8 and E9 require E5. Schedule E9 after E7/E8 for reward accounting and Greeting streak verification. Each task retains its own tests and visual acceptance gate. |
| H/V | Harden, record, submit | Live/OBS acceptance recorded, fresh-clone demo works, submission evidence reflects actual implementation |

The numbered tasks in [sprints](sprints/README.md) are authoritative for individual work items. S0 setup is a foundation, not a working market: do not show invented balances, working login controls or a Start demo button until their behavior exists.

## Verification and external work

Run `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm build`, a frozen install, and development/production route checks for S0. Test HTTP behavior through public requests. Review dashboard and transparent overlay at 1920 × 1080 and 960 × 540 in a real browser. An actual OBS browser-source test remains distinct from browser screenshots.

Twitch registration/credentials, live chat tests, OBS recording, a GitHub remote/CI run and Devpost submission require the streamer's accounts and tools. Track these honestly; none are necessary to run the foundation without credentials. Completed foundation checks are recorded in [S0 verification](verification/s0-setup.md).
