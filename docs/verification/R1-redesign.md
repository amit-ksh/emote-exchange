# R1 redesign — verification pending

October 28, 2026. Implements `docs/redesign-prompt.md`, using the CSS system in the supplied `C:/Users/ksami/Downloads/design.html`. No engine/server/protocol/reader changes or dependencies.

## Ten design decisions

1. Exact neutral light/dark surface tokens and one lime brand accent.
2. Self-hosted Inter Tight for UI and Doto for large display numbers, with OFL files.
3. Six dashboard views instead of one long page, using React state.
4. Sticky desktop sidebar; horizontal navigation below 900 px.
5. Tonal cards, rounded controls and hairline row separators.
6. Theme follows the OS initially; manual selection persists with guarded localStorage.
7. Setup and overlay checklist retain live state; no mock balances or counters.
8. Simulator tuning sits in Advanced; Overview shows compact existing Start/Stop controls.
9. Emotes use provider tiles, search/filter chips and progressive sample-grid disclosure; Chat uses one filtered output list.
10. Overlay shares dark tokens and typography, lime marks, unboxed Tape, end-ellipsis names and clearer system-event rows.

## Checks completed

- `pnpm check`, `pnpm test` (126), `pnpm build`, and `pnpm smoke` passed.
- Biome formatting applied and the final specificity warning fixed.
- Dashboard inspected in IAB at its actual 1280×720 dark viewport. Removed hero/roadmap/foundation copy; real connected account, checklist, overlay URL and counters rendered.
- Existing handlers and snapshot readers remain intact. No new live chat was sent.

## Still required before task completion/commit

Windows Computer Use stopped because it could not confidently determine Chrome's active URL. Browser work stopped as directed. Exact 1440×900 dashboard views, 390 px mobile, light theme, interaction checks and redesigned overlay 1920×1080/960×540 visual verification remain pending. No new performance/OBS claim is made.

Optional portfolio Cards/sounds remain unimplemented P1; optional future Market/Traders/Settings/Season screens remain E5. The current catalog API exposes samples: search and Show more operate on those approved examples, not an invented full catalog. Existing provider image URLs retain their established CDN loading; all newly added fonts are local.
