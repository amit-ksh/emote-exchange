# Exchange bug bash (Sprint 3)

One issue per row from the live walkthroughs. Fix S1 and S2 issues before recording the final footage.

- **S1:** broken or embarrassing during a stream.
- **S2:** confusing or prevents a documented core action.
- **S3:** polish.

| # | Severity | What happened | Expected | Recording timestamp | Fixed in | Verification |
|---|---|---|---|---|---|---|
| H2-1 | S2 | Trade Feed visually showed BUY and Price but omitted the share quantity; the accessible label alone contained it. | Viewers can read side, quantity, Ticker and Price. | Browser reproduction, October 29; not filmed | H2 commit | Actual Pump Feed reproduced `sim_bright_finchBUYDemoBear168.95`; restored visible compact quantity (`BUY 1`), bounded Ticker width, inspected at 1920×1080 and 960×540. Exact quantity remains in the full accessible label/title. |
| H2-2 | S2 | Chat-color contrast correction used the pre-redesign glass background and could leave Trader names below 4.5:1 over white footage. | At least 4.5:1 against the brightest composite panel. | Automated regression, October 29; not filmed | H2 commit | `Trader colors retain 4.5 contrast on the redesigned glass over white footage` failed for `#a3a3a3` before the fix and passes after matching rgba(34,34,34,.88) over white (RGB 61). |
| H3-1 | S2 | OBS Default source blending made glass backing lighter than browser checks over a bright image. | Dark readable backing in the actual OBS composite. | Before/after screenshots in `artifacts/h3/` | H3 commit | Set source Blending Method to SRGB Off at full/half scale; actual recorded frames and setup instruction in the H3 report. |
| H3-2 | S3 | A Raid caption wrapped onto the banner progress strip. | Detail stays inside the 900×140 banner. | Fresh Opening day recording `2026-10-29 23-08-42.mp4`, 00:14 | H3 commit | Shorter fixed Raid detail; all details stay on one line with ellipsis and retain their full accessible text/title. |
| H3-3 | S3 | An expired Feed left a heading above an unexplained empty panel. | A quiet-state explanation. | Actual OBS quiet-state check | H3 commit | Added “Waiting for market activity.” at the existing 24 px size; checked full and half scale. |
| H3-4 | S2 | Three-digit Board percentages clipped against the panel's right edge in native-resolution OBS frames. | Full number and arrow, with Trader names yielding space. | Final UI recording `2026-10-29 23-19-10.mp4` | H3 commit | Widened the aligned worth/change columns to 96/148 px; long names yield space and retain ellipses. |

H2 is a code/browser bug bash, not evidence that either live walkthrough has been recorded. No outstanding S1/S2 finding was identified in this review; H1/H5 may expose additional issues. Full checks after H2: 162 tests (71 Kit + 91 app), types, lint, build and production smoke passed. Soak tick p95 3.662 ms; sampled peak heap 150.8 MiB on the existing Windows reference machine. Final CSS weighting only gives Tickers more space; rechecked the overlay and rebuilt before commit.
