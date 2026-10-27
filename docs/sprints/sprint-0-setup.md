# Sprint 0: Review and setup (Tue Oct 27)

**Goal:** one reviewed Emote Exchange plan and a runnable local foundation. Market behavior and live Twitch integration belong to S1 and S2.

## S0.0 Review the plan

Read every repository doc, record the revised scope in [implementation-plan.md](../implementation-plan.md), align specifications and ADRs, and remove second-application planning. Keep `apps/emote-exchange` and `packages/twitch-kit`; rename the product sprint to `sprint-2-emote-exchange.md`.

Done when: docs agree on scope, approved technology, P0/P1 priorities and setup acceptance. Internal links resolve.

## S0.1 Accounts and tools (streamer)

Follow [setup-guide.md](../setup-guide.md). Node 24.12+, pnpm and Git are needed for setup. Twitch credentials and OBS are needed for live verification, but do not block the no-credentials foundation.

Done when: tooling works; remaining account/OBS actions are explicitly recorded rather than claimed complete.

## S0.2 Scaffold the workspace

Read `AGENTS.md`, the implementation plan, Twitch Kit spec sections 3, 4, 5, 14, 15 and 19, and ADRs 0001, 0002, 0005 and 0007.

- Root scripts: `dev:exchange`, `start:exchange`, `build`, `check`, `lint`, `test`. Strict TypeScript, Biome, pnpm workspace/lockfile, editor config and ignore rules.
- `packages/twitch-kit`: Hono HTTP foundation with loopback Host validation, Origin + `X-CTA` mutation guard, `/healthz`, `/api/snapshot`, `/events` snapshot and 15-second ping. Test the public HTTP interface, including rejected origins and hosts, before implementing its behavior.
- `apps/emote-exchange`: Node native TypeScript entrypoint, `.env.example` containing all spec variables, README, React/Vite client. Dashboard `/` says Demo mode and explains setup status. Transparent `/overlay` shows a small foundation label at 1920 × 1080. Public snapshots contain display data only.
- Development uses Vite middleware in the same Node process on 127.0.0.1:4100. The command works without a prior build. Production serves the Vite build with the same routes. Assets and config resolve from the app directory regardless of launching CWD.
- GitHub Actions: Node 24, pinned pnpm, frozen lockfile install, check, lint, test and build.
- Only dependencies approved by Twitch Kit section 4. No OAuth, simulated market or placeholder numbers presented as working market features.

Done when: install, check, lint, test and build pass; `pnpm dev:exchange` and `pnpm start:exchange` serve both routes; `/healthz`, snapshots and SSE work without Twitch keys; browser verification at full and half OBS sizes finds no clipping. Record actual OBS and live Twitch checks separately if unavailable.

Acceptance:

- [x] All local commands pass; frozen install is repeatable.
- [x] Dashboard and overlay load at port 4100 in development and production.
- [x] Overlay inspected at 1920 × 1080 and 960 × 540; background is transparent.
- [x] HTTP tests verify health, display snapshot, SSE and request guards.
- [x] CI workflow exists. GitHub execution requires a remote and push.
- [x] Commit `S0.2: scaffold Emote Exchange` with verification in the body.

Observed results and remaining external checks: [S0 verification](../verification/s0-setup.md).

## S0.3 Glossaries and recording

Preserve both active glossaries in `GLOSSARY-MAP.md`. Record the primary Codex session in [codex-sessions.md](../submission/codex-sessions.md), and capture setup footage if OBS is available. Do not invent a session ID or claim footage was recorded.
