# Emote Exchange

A local play-money emote market for Twitch, displayed through an OBS browser source. The current build includes the local foundation plus K1: SQLite storage, validated settings, guarded actions and bounded SSE updates. Twitch login, the Simulator and market rules are planned in [the implementation plan](../../docs/implementation-plan.md).

## Run the foundation

From the repository root with Node 24.12+ in the Node 24 LTS line and pnpm 11.25.0:

```sh
pnpm install
pnpm dev:exchange
```

Open [the dashboard](http://localhost:4100/) and [the overlay](http://127.0.0.1:4100/overlay). No credentials or `.env` are required. Demo mode currently identifies the no-credentials foundation; simulated market scenarios arrive in later sprints.

For the built client:

```sh
pnpm build
pnpm start:exchange
```

Keep the terminal running while using the app. Stop the development process before starting production on the same port.

Use **Test local connection** on the dashboard to verify a guarded action, a saved setting and a live SSE update. Successful checks survive restart. Local SQLite data lives in `apps/emote-exchange/data/emote-exchange.sqlite` by default; `DATA_DIR` overrides it, with relative paths resolved from the app directory. Data is git-ignored.

## OBS

Add a Browser Source at `http://127.0.0.1:4100/overlay`, width 1920, height 1080. The page background is transparent. Keep shutdown-when-hidden and refresh-on-activation off. The current overlay is a foundation label; market widgets arrive in E4.

## Live Twitch setup, later

Follow [the setup guide](../../docs/setup-guide.md) to register one confidential Twitch app. Copy `.env.example` to `.env` and keep secrets local. The foundation stays in Demo mode even when credentials are supplied; login is not implemented until K2.

## Checks and troubleshooting

```sh
pnpm check
pnpm lint
pnpm test
pnpm build
pnpm smoke
```

- Port busy: stop the other Emote Exchange process, or set matching `PORT` and `PUBLIC_ORIGIN` in `.env`.
- Unsupported Node: use Node 24.12+ within major 24; native TypeScript needs no `tsx`.
- Production client missing: run `pnpm build` first.
- Overlay looks empty: the foundation label is at the bottom; the remaining canvas is transparent.
- Connection interrupted: the dashboard reports SSE reconnecting. Restart the local server if needed.
- Development: client edits update through Vite HMR; restart the command after server edits.
- Runtime mismatch: `pnpm install` provisions the project-local Node 24 runtime; check it with `pnpm exec node --version`.

Architecture and behavior: [Twitch Kit spec](../../docs/specs/twitch-kit.md), [Exchange spec](../../docs/specs/emote-exchange.md), [ADRs](../../docs/adr/), [sprints](../../docs/sprints/README.md).
