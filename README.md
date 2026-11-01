# Emote Exchange

A local Twitch app that turns a channel's emotes into a play-money market. Chat attention moves prices; viewers trade with `!buy` and `!sell`; OBS shows the action in a transparent overlay.

This repository focuses on one Codex x TwitchCon hackathon entry. The plan is to finish a reliable demo and a readable overlay before adding optional features.

## Status

K1–K7 and E0–E9 are implemented: Twitch integration, persistent market/trading, the overlay and dashboard controls, greetings/Streaks, broadcaster Grants and Live analytics. The 162-test suite, types, lint, production build and clean-folder smoke checks pass. [H4 hardening](docs/verification/h4-hardening.md) verifies guards, recovery, privacy and simulated transport failures. Full recorded live walkthroughs and actual OBS checks remain submission gates. Start with the [judge-facing app README](apps/emote-exchange/README.md).

## Quick start

The [E0 numerical experiment](docs/verification/e0-behavior-fixtures.md) passes all five fixed targets. Run `pnpm experiment:market` to reproduce it. The [E1 engine](docs/verification/e1-market-engine.md) and [E2 trading](docs/verification/e2-trading-and-events.md) cover Prices, exact settlement and rewards; [E3](docs/verification/e3-runtime-and-recovery.md) records persistence and a real Twitch buy. [E4](docs/verification/e4-overlay.md), [E5](docs/verification/e5-dashboard.md) and [E6](docs/verification/e6-scenarios.md) record overlay, dashboard and scenario verification. The app README documents all shipped E7–E9 features and current limits.

Use Node.js 24.12+ in the Node 24 LTS line and pnpm 11.25.0, then run from the repository root:

```sh
pnpm install --frozen-lockfile
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
| Video and submission draft | Kept locally in git-ignored `docs/submission/` |
| Domain terminology | [Glossary map](GLOSSARY-MAP.md) |
| Repository working instructions | [AGENTS.md](AGENTS.md) |

Run `pnpm check`, `pnpm lint`, `pnpm test` and `pnpm build` before committing a task. For production, run `pnpm build` then `pnpm start:exchange`. See [the app README](apps/emote-exchange/README.md) for setup and troubleshooting.
