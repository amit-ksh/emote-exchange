# Emote Exchange

A local Twitch app that turns a channel's emotes into a play-money market. Chat attention moves prices; viewers trade with `!buy` and `!sell`; OBS shows the action in a transparent overlay.

This repository focuses on one Codex x TwitchCon hackathon entry. The plan is to finish a reliable demo and a readable overlay before adding optional features.

## Status

The single-app plan, local foundation and K1–K7 are complete: private SQLite storage, guarded HTTP actions, bounded SSE, Twitch OAuth, incoming events, queued chat sending, cached emote catalogs and a seeded simulator with 24 original offline assets. Live reception, chat sending, 7TV and keyless offline simulation are verified. E1–E3's market rules, runtime, commands and recovery pass automated checks, and a real-account buy/persisted Holding/queued reply is verified. The product UI and full live/OBS walkthroughs remain in [the sprint plan](docs/sprints/README.md).

## Quick start

The [E0 numerical experiment](docs/verification/e0-behavior-fixtures.md) passes all five fixed targets. Run `pnpm experiment:market` to reproduce it. The [E1 engine](docs/verification/e1-market-engine.md) reproduces B1/B2/B3/B5 and passes a 24-Listing/500-Trader probe (`pnpm probe:market`). [E2](docs/verification/e2-trading-and-events.md) adds settlement/B4, rewards, Halts, bells and reset. [E3](docs/verification/e3-runtime-and-recovery.md) wires normalized chat, one-second ticks, SQLite recovery and queued command replies into the app. `/api/snapshot` includes the market; dashboard/overlay panels await E4/E5.

Use Node.js 24.12+ in the Node 24 LTS line and pnpm 11.25.0, then run from the repository root:

```sh
pnpm install
pnpm dev:exchange
```

Dashboard: [http://localhost:4100](http://localhost:4100). OBS browser source: [http://127.0.0.1:4100/overlay](http://127.0.0.1:4100/overlay), at 1920 × 1080. Demo mode starts without Twitch credentials. See the app README for the features available in the current milestone.

To configure Twitch, copy `apps/emote-exchange/.env.example` to `.env`, register one Twitch application, and follow [the setup guide](docs/setup-guide.md).

## Structure

```text
apps/emote-exchange/    Node server, market engine, dashboard and OBS overlay
packages/twitch-kit/    Twitch and local-runtime infrastructure, without market rules
docs/                  Specs, decisions, sprints and submission material
```

The explicit app folder already matches the product name. The workspace folder can retain its local name; no machine-specific path is part of the app contract.

## Documentation

| Need | Read |
|---|---|
| Reviewed scope, technology and build order | [Implementation plan](docs/implementation-plan.md) |
| Task prompts and completion gates | [Sprint plan](docs/sprints/README.md) |
| Product behavior and acceptance checks | [Emote Exchange spec](docs/specs/emote-exchange.md) |
| Technical architecture and approved dependencies | [Twitch Kit spec](docs/specs/twitch-kit.md) |
| Setup, Twitch registration and OBS | [Setup guide](docs/setup-guide.md) |
| Reasons for technical choices | [Architecture decisions](docs/adr/) |
| Accounts, assets and documentation links | [Resources](docs/resources.md) |
| Organizer requirements to confirm | [Hackathon brief](docs/hackathon-brief.md) |
| Video and submission draft | [Submission kit](docs/submission/emote-exchange.md) |
| Domain terminology | [Glossary map](GLOSSARY-MAP.md) |
| Repository working instructions | [AGENTS.md](AGENTS.md) |

Run `pnpm check`, `pnpm lint`, `pnpm test` and `pnpm build` before committing a task. For production, run `pnpm build` then `pnpm start:exchange`. See [the app README](apps/emote-exchange/README.md) for setup and troubleshooting.
