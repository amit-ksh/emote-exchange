# E4 overlay verification

October 28, 2026. Base: `01a1a79`. [Written plan](../plans/e4-overlay.md); this plan was not filmed.

Implemented transparent `/overlay`: Tape, canvas Chart, Board, Feed, Banners and SIM, local licensed fonts, URL widget selection and reduced motion. Numeric updates batch at one second; hidden pages pause presentation. Queues coalesce, prioritize, expire and retain bounded IDs. Browser data passes an explicit display-field reader.

## Visual checks

Used an isolated keyless app on port 4101 with ignored `artifacts/e4-demo` storage. Opening day (seed 42/43, 4 messages/s, 12 Chatters) and Pump and dump (seed 42, 6 messages/s, 15 Chatters) drove actual simulator events, engine and SQLite. This was a populated market across runs, not the fixed E6 story fixture.

Chrome's device toolbar verified 1920×1080 and 960×540, no throttling, fit-to-window. Inspected Chart, Board, scrolling Tape, Feed, SIM and single queued Banners; observed IPO, Raid, Moon, Crash and Halt/countdown. Reduced-motion URL checked at both sizes: static three-item Tape pages and fades. Selective `widgets=chart,board` rendered only those two widgets. SIM cleared when stopped. The transparent page was inspected against the browser's white backdrop, the brightest contrast case. IAB previews were 1280×720; its viewport override did not apply, so those previews are not the exact-size evidence.

| Area | Finding and fix |
|---|---|
| Typography | Loaded both local fonts; 24 px minimum, 28 px Tickers. Abbreviated long Trader names, retained full accessible labels/titles. Compact large prices and changes. |
| Surfaces | 82% near-black glass and hairlines. Down indicators use a darker chip; chat colors adjusted to 4.5:1 against brightest glass. Arrows accompany direction colors. |
| Layout | Widened percentage columns after +103.4% clipped; Tape items now 520 px. Shifted Banner left to leave 40 px before Chart. Feed quantities compact with exact values in accessible labels/titles. |
| Motion | Fixed a buffer-drain bug that suppressed Feed/Banners, and removed a changing negative animation delay. One Banner at a time; five eight-second Feed entries. No sound/cards shipped (P1). |
| Performance | CSS Tape transforms, canvas chart, memoized widgets, one-second numeric batching; no chart dependency or backdrop blur. |

Local ignored evidence: `artifacts/e4/overlay-1920.png` (Chrome device capture at DPR 2), `overlay-half-chrome.png` (toolbar shows 960×540), plus preview JPEGs. The gameplay center stays clear. Actual OBS and dark-footage inspection remain manual submission gates; Chrome preview does not establish OBS performance.

## Chrome Performance capture

Captured Pump and dump in Chrome Performance, virtual 1920×1080, fit-to-window, no CPU/network throttling, development build with React DevTools installed. Trace started 13:35:19 UTC (19:05:19 IST), duration 52.477 seconds. Saved ignored `artifacts/e4/pump-performance.json.gz`; analysis and `pump-frame-summary.json` accompany it.

The trace's single compositor frame stream recorded 7,050 DrawFrame events: **134.32 frames/s average**, frame intervals p50 6.993 ms, **p95 11.930 ms**, p99 18.345 ms. 85 intervals exceeded 16.67 ms; maximum 198.577 ms. There were 587 DroppedFrame events on the approximately 144 Hz stream. This exceeds the 60 fps target on average and at p95, with occasional stalls; it is not a claim of uninterrupted 60 fps or an OBS measurement. DevTools reported scripting 7,242 ms, rendering 1,779 ms, painting 711 ms over the recording.

## Data and tests

- `opening Bell snapshots Trader Net Worth for session change and that baseline survives reopening`: uses genuine Net Worth at Bell, persists it, then measures subsequent rewards.
- `schema 2 upgrades preserve Coins and Holdings without inventing a session baseline`: old rows migrate with unavailable change until next Bell.
- Overlay tests cover explicit safe projections, unsafe images/numbers, URL controls, queue priority/coalescing/expiry/duplicates, twenty-second Chart selection and compact Price boundaries.
- Restarted the real app on 4100 after migration: `amit1541` still has **894 Coins, DemoBull 1 share, cost basis 106**; historical session change is null. Both saved auth roles reconnect. No additional live chat was sent for E4.

## Review

**Standards:** no actionable findings against pure engines, integer Coins, parameterized SQL, browser data boundaries, chat queue and guarded routes. No dependency added.

**Spec:** fixed Feed Ticker size, large-quantity clipping, and exact Board ordering before public Net Worth capping. Deferred P1 cards/sound and actual OBS gate are explicit. Final automated checks are recorded in the task commit body.

Final checks: pnpm check, pnpm lint, pnpm test (126: 70 kit + 56 app), pnpm build and pnpm smoke all passed. git diff --check passed.
