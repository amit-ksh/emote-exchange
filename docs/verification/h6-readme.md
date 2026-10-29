# H6: judge-facing README verification

October 29, 2026. Replaced the obsolete foundation/E3 status in `apps/emote-exchange/README.md` with the shipped E0–E9 behavior. Updated the repository entry point and two stale setup-guide statements so the judge-facing path agrees.

## What the README covers

- Three-step keyless demo, exact development/production commands, all eight scenarios and expected results.
- Current Market and Live screenshots, captured from the actual production app with simulated activity. They contain only demo names and show the Demo/Sim state. Market captured at 1440×900; Live captured as a full page at the same desktop width. Inspected the saved images for legible numbers, chart labels, complete columns, source labels and visible controls; no UI change was needed.
- Twitch registration/redirect, confidential client configuration, required broadcaster and optional bot scopes, emote-set setup and explicit live-send behavior.
- Viewer, Mod and broadcaster command roles; whole-Coin settlement, repeat-use weighting, reward/Streak rules and Grant limits.
- OBS source settings and URL options; browser verification distinguished from actual OBS performance.
- Shared live/demo persistence, destructive reset scope, server-only tokens, reconnect behavior and analytics reset semantics.
- Current optional-feature limits, troubleshooting, architecture links and actual implementation/review/test evidence. No invented Codex session identifier, hosted CI run, OBS recording or completed submission.

## Commands actually run

The clean source copy from H4 had no `.env`, saved market or copied dependencies. Tests ran against the same application source used for this README; H6 changes documentation and screenshot assets only.

| Command, from repository root | Result |
|---|---|
| `pnpm install --frozen-lockfile` | Clean-folder install passed with pnpm 11.25.0 and provisioned Node 24.22.1. |
| `pnpm dev:exchange` | Started the clean app on isolated port 4102 (matching `PORT`/`PUBLIC_ORIGIN` overrides). Browser Start demo created six Listings and accepted Trades. |
| `pnpm build` | Production build passed in both the working repository and clean folder. |
| `pnpm start:exchange` | Stopped development, started the clean production build on 4102, and opened the dashboard. Six saved Listings/Holdings remained, and simulator generation was stopped after restart. Production Start demo was exercised again. |
| `pnpm check` | Passed in the working repository and clean source installation. |
| `pnpm lint` | Passed; no source formatting changes required after H4. |
| `pnpm test` | All 161 tests passed in the clean installation (71 Twitch Kit, 90 app), including the full virtual Soak. No code changed in H6, so the long Soak was not repeated for prose/screenshot edits. |
| `pnpm smoke` | Passed with the built client and temporary SQLite state, including actual open-Session process restart and Portfolios/SSE recovery. |

Validated every local Markdown target in the app README, both JPEG signatures/dimensions and the executable command list. The browser returned JPEG bytes; corrected the image extensions to `.jpg` before committing. The root README's price experiment command was also rerun. Screenshot provenance: isolated production server on 4101, Pump and dump after Opening day; existing demo state intentionally retained. These screenshots do not represent fresh-market price targets or a live Twitch channel.

H4's browser full/half overlay checks remain the relevant overlay evidence; H6 adds no overlay code. External account walkthroughs and actual OBS recording/performance remain H1/H3/H5 gates.
