# S0 verification — October 27, 2026

Scope: reviewed Emote Exchange plan and Sprint 0 application foundation. The market, Simulator, OAuth and SQLite implementation remain S1/S2 work.

## Automated and command checks

| Check | Result |
|---|---|
| `pnpm install` | Passed; approved packages pinned exactly and lockfile committed |
| `pnpm install --frozen-lockfile --store-dir .pnpm-store` | Passed without lockfile changes |
| `pnpm exec node --version` | v24.22.1 through the project-local pnpm runtime |
| `pnpm check` | Both workspace packages and React client passed |
| `pnpm lint` | Biome recommended rules and formatting passed |
| `pnpm test` | 10 tests passed; names below |
| `pnpm build` | Vite production client built successfully |
| `pnpm smoke` | Built dashboard, overlay, JS assets, snapshot, SSE and guards passed through a real Node process |
| Internal Markdown links | No missing file targets; obsolete second-app paths absent |

Public-interface test names:

- health reports a running local server
- every route rejects missing or unrelated Host values
- mutations require an exact loopback Origin and X-CTA for every method
- snapshot exposes the supplied display projection without caching or CORS
- SSE starts with a snapshot and abort closes the stream and releases its listener
- guarded actions reject a body larger than 64 KiB
- Exchange exposes an honest foundation-only display snapshot
- configuration defaults to the documented local origin
- configuration accepts a different port and its exact loopback origin
- configuration rejects invalid ports and nonlocal or mismatched public origins

HTTP tests were written red before implementation. Review also found that a malformed absolute request target could crash the server. The production smoke check reproduced the failure (`ECONNRESET`), then passed after the adapter returned HTTP 400 and stayed healthy. It uses raw `node:http` requests because Fetch normalizes Host and request targets.

## Browser and runtime checks

Real Microsoft Edge 156.0.4314.42, headless, against the actual `/` and `/overlay` routes in both development and production:

- Dashboard inspected at 1920 × 1080 and 960 × 540. No horizontal overflow, clipped controls or JavaScript errors. Vertical scrolling is normal for the dashboard.
- Snapshot loaded and SSE displayed “Receiving local updates.” Copy URL wrote the expected loopback overlay URL; Open overlay opened the correct page.
- Development HMR connected on the same HTTP server at port 4100. A hostile Host was rejected even on `/@vite/client`; no CORS header was returned.
- Overlay inspected at 1920 × 1080 and 960 × 540. The label stays inside the viewport and scales by exactly one half. At full size its bounds are x=40, y=913.41, width=574.75, height=126.59; at half size these values halve.
- The overlay's empty canvas has alpha 0 in the captured PNG, and HTML/body backgrounds are transparent. No SIM badge appears because the Simulator is not running.
- A real `/events` connection received the initial snapshot and a ping after approximately 15 seconds, then disconnected cleanly.

Local screenshots and the one-off browser verification script are in ignored `artifacts/s0/`. No visual corrections were needed after inspection; uniform scaling and transparent styles met the foundation requirements.

## Setup fixes from review

- pnpm's project-local Node 24 runtime prevents a globally installed pnpm bound to Node 22 from breaking native TypeScript tests/startup. Global tool settings were preserved.
- Semantic lint rules remain enabled after the Biome configuration migration.
- CI bootstraps pnpm 11 in standalone mode, then uses Node 24 and includes the production smoke check on Linux and Windows.
- Development uses Vite HMR without Node's broad import watcher, which otherwise watches Vite-generated config files and can repeatedly restart the server.

## External checks still pending

- A real OBS Browser Source and stream recording were not exercised. Browser checks used the exact OBS dimensions but do not prove OBS rendering or stream frame rate.
- Twitch registration, OAuth, live chat and market acceptance are later tasks.
- The CI workflow exists, but no GitHub remote, push or hosted CI run was performed.
- Codex session evidence and Devpost submission still require the streamer's actual account actions.
- The user's UI inspiration files in `references/` were preserved locally and the folder is git-ignored.
