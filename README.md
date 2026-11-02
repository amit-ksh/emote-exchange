# Emote Exchange

A local Twitch app that turns a channel's emotes into a play-money market. Chat attention moves prices; viewers trade with `!buy` and `!sell`; OBS shows the action in a transparent overlay.

This repository focuses on one Codex x TwitchCon hackathon entry. The plan is to finish a reliable demo and a readable overlay before adding optional features.

## Status

K1–K7 and E0–E9 are implemented: Twitch integration, persistent market/trading, the overlay and dashboard controls, greetings/Streaks, broadcaster Grants and Live analytics. The 184-test suite, types, lint and production build pass; earlier clean-folder smoke checks are recorded separately. [H4 hardening](docs/verification/h4-hardening.md) verifies guards, recovery, privacy and simulated transport failures. [D3](docs/verification/d3-render-turso.md) records hosted access and real Turso durability checks; [D5](docs/verification/d5-hosted-obs.md) records the actual hosted OBS broadcast and its verification limits. Hosted mode currently supports one configured owner; multi-streamer isolation is planned. See the [app README](apps/emote-exchange/README.md) for the full feature tour.

## Set up locally

### 1. Install the prerequisites

Install [Git](https://git-scm.com/downloads) and [Node.js](https://nodejs.org/en/download) **24.22.1** (supported: 24.12+ within major 24). Install the repository's pinned pnpm version:

```sh
npm install --global pnpm@11.25.0
node --version
pnpm --version
```

The workspace also provisions Node 24.22.1 for its pnpm scripts. You need internet access for the initial dependency/runtime downloads. OBS is optional until you want to put the overlay on stream.

### 2. Clone, install and start

These commands work in PowerShell, macOS and Linux terminals:

```sh
git clone https://github.com/amit-ksh/emote-exchange.git
cd emote-exchange
pnpm install --frozen-lockfile
pnpm dev:exchange
```

Keep the terminal running. Open the [dashboard](http://localhost:4100/), click **Start demo**, then open the [overlay](http://127.0.0.1:4100/overlay). The Opening day scenario creates Listings and Trades from simulated chat. Stop the server with **Ctrl+C**.

**No `.env`, Twitch credentials, Turso database or Render account is needed for the local demo.** Bundled emotes and fonts work offline after installation. The server creates its local SQLite database at `apps/emote-exchange/data/emote-exchange.sqlite` on first startup.

### 3. Connect Twitch when ready (optional)

Register a **Confidential** application in the [Twitch developer console](https://dev.twitch.tv/console) and add this exact OAuth redirect URL:

```text
http://localhost:4100/auth/callback
```

If reusing your hosted Twitch application, add the local callback alongside its existing hosted callback. Create the local environment file only if you do not already have one:

```powershell
# Windows PowerShell, from the repository root
Copy-Item apps/emote-exchange/.env.example apps/emote-exchange/.env
```

```sh
# macOS / Linux, from the repository root
cp apps/emote-exchange/.env.example apps/emote-exchange/.env
```

Edit **`apps/emote-exchange/.env`**, keeping local configuration as follows, and fill in your own client ID and secret:

```dotenv
DEPLOYMENT_MODE=local
PORT=4100
PUBLIC_ORIGIN=http://localhost:4100
DATA_DIR=./data
TWITCH_CLIENT_ID=your_client_id
TWITCH_CLIENT_SECRET=your_client_secret
```

Restart with `pnpm dev:exchange`, open the dashboard at `http://localhost:4100/`, then go to **Setup** and click **Connect Twitch** in the Broadcaster row. Optionally use **Connect bot** for replies. Complete Twitch authorization in your browser. Check Diagnostics for the EventSub connection and five enabled subscriptions; test a normal channel message from another account. The [app README](apps/emote-exchange/README.md#connect-your-twitch-channel) covers scopes, emotes, commands and bot behavior.

The app loads `.env` from the app folder, not the repository root. Existing process environment variables take precedence. Keep the environment file and data directory private; both are git-ignored. Local mode uses SQLite and does not require the hosted Turso settings.

### 4. Add the overlay to OBS

Add a **Browser Source** with URL `http://127.0.0.1:4100/overlay`, width **1920**, height **1080**, over your stream scene. Keep the local server running while OBS uses it. See [all OBS settings](apps/emote-exchange/README.md#obs-browser-source) for transparency, blending and frame rate.

### Run the production build locally

Stop the development server first, then run from the repository root:

```sh
pnpm build
pnpm start:exchange
```

Dashboard and overlay URLs stay the same. Only one process can use port 4100 at a time. Saved Portfolios and settings survive restart; simulator generation must be started again. Demo and real Twitch activity share the saved market within the same app instance.

### Common setup problems

| Problem | Fix |
|---|---|
| `pnpm` is not found | Install the pinned version above and reopen the terminal if needed. |
| Node/TypeScript startup error | Use Node 24.12+ within major 24, then rerun the frozen install. |
| Port 4100 is in use | Stop the other app process, or change `PORT` and `PUBLIC_ORIGIN` together and register the matching Twitch callback. |
| Missing client build | Run `pnpm build` before `pnpm start:exchange`. |
| Twitch login fails | Check both credentials, the Confidential client type and the exact callback. Restart after editing `.env`. |
| Local startup refers to Render or `/var/data` | Set `DEPLOYMENT_MODE=local`, `DATA_DIR=./data` and the local `PUBLIC_ORIGIN`; check inherited terminal variables too. |
| Overlay looks empty | Start demo and wait for Listings. Its center is intentionally transparent. |

For more, see [app troubleshooting](apps/emote-exchange/README.md#troubleshooting).

## Hosted deployment

For the whole app on Render, follow [Render deployment](docs/render-deployment.md). Hosted mode adds HTTPS, owner-only dashboard access, a public read-only OBS feed and acknowledged Turso transactions without a persistent disk. The earlier [Vercel investigation](docs/hosting.md) is retained for context. The deployment checker recognizes owner-protected endpoints and verifies public OBS delivery; live Twitch checks still require sign-in.

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
| Vercel and hosted deployment | [Current limitations and configuration](docs/hosting.md) |
| Domain terminology | [Glossary map](GLOSSARY-MAP.md) |
| Repository working instructions | [AGENTS.md](AGENTS.md) |

Run `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm build` and `pnpm smoke` from the repository root to verify the installation. The test suite includes a longer simulator Soak; production smoke uses isolated temporary data and checks restart recovery. Run `pnpm experiment:market` to reproduce the fixed price experiments.
