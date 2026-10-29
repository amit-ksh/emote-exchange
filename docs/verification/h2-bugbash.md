# H2: code and browser bug bash

October 29, 2026. Reviewed the current engine/runtime/browser boundaries and the actual demo overlay against the Exchange spec, security requirements and redesign. Findings are tracked in [bugbash.md](../submission/bugbash.md).

- **H2-1, S2:** Trade rows omitted their share quantity visibly. Reproduced with the actual Pump simulator: accessible text included `BUY 1`, but rendered text showed `BUY` alone. Restored visible compact quantities next to BUY/SELL, kept exact values in accessible labels/titles, and made Tickers truncate within their own flexible column. Gave that column slightly more space so normal `DemoBear` fits while long Trader names end with an ellipsis. Inspected genuine BUY/SELL rows at 1920×1080 and the settled 960×540 viewport: quantity, Ticker and Price stay separate, with no right-edge overflow.
- **H2-2, S2:** Trader color correction still assumed the previous glass surface. The new `Trader colors retain 4.5 contrast on the redesigned glass over white footage` test failed for `#a3a3a3`. Corrected the worst-case background to RGB 61, the rounded composite of rgba(34,34,34,.88) over white. The regression now passes for gray, black, red, green, blue, white and malformed input; white is preserved.

Checks: `pnpm check`, `pnpm lint`, `pnpm test` (162: 71 Kit + 91 app), `pnpm build` and `pnpm smoke` passed. The complete test run's Soak measured tick p95 3.662 ms and sampled peak heap 150.8 MiB on the existing Windows reference machine. Rebuilt and repeated lint/smoke after the final CSS width adjustment. No rules, dependencies, live-account state or chat sending changed.

Browser screenshots remain in ignored `artifacts/h2/`. This is not a recorded live walkthrough or an OBS frame-rate claim. The regression's actual red/green results are in this Codex session; that run was not filmed.
