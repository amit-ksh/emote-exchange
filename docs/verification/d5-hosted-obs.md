# D5: hosted OBS broadcast check

Verified November 2, 2026 against the Render runtime deployed at `https://emote-exchange.onrender.com` (application code from `b9db2b1`). This check is distinct from the earlier browser-only overlay and local demo recordings.

## Setup and observed behavior

- Opened the existing official OBS 33.0.0 installation at `D:\obs-studio`. Preserved the earlier Emote Exchange Devpost scene collection and created the separate collection named `test run`, using the name entered by the owner.
- Added one Browser Source using `https://emote-exchange.onrender.com/overlay`, width 1920 and height 1080, with transparent browser CSS. The scene had no desktop, window, camera or audio-capture sources. Inspected the real OBS preview: Price tape, hottest Listing chart, Trader Board and Feed rendered; SIM was absent after the simulator stopped. Saved ignored `artifacts/hosted-obs/preview.jpg`.
- The first Start Streaming attempt did not broadcast: OBS reported Missing Stream Setup. The owner manually connected their Twitch account in OBS Settings → Stream, and those settings were applied. No stream key or OAuth credential was read, printed or committed.
- The owner explicitly authorized a roughly 30-second public test on `ammit_ksh`. Started the prepared overlay-only scene, inspected the transport, then stopped streaming. The check lasted approximately 61 seconds because the public Twitch page/player inspection took longer than expected.
- OBS showed Stop Streaming while connected, a live timer, approximately 6,016 kbps, **Dropped Frames 0 (0.0%)** and **30.00 / 30.00 FPS**. The selected OBS profile runs at 30 fps. Evidence: ignored `artifacts/hosted-obs/broadcast-attempt.jpg`.
- The hosted public projection received a real Stream opening Bell at `2026-11-02T02:52:32.230Z` and a closing Bell at `2026-11-02T02:53:33.388Z` (8:22:32–8:23:33 AM IST), duration 61.158 seconds. The closing Session Summary contains `analytics.live: true`. This establishes that hosted EventSub saw the actual broadcast lifecycle; no simulated online/offline event was injected for this check.
- After stopping, OBS showed **Start Streaming** and its stream timer reset to disabled `00:00:00`. The hosted Session had a non-null closing timestamp. The local simulator and the old local Twitch receiver remained stopped.

## Limits

The embedded Twitch player reported that it could not play media. Audience-side video playback and phone-sized player readability were therefore not verified. The successful OBS transport and actual hosted Stream bells do not stand in for a watched Twitch player. This test ran at the existing profile's 30 fps; a 60 fps OBS broadcast is not claimed. No new recording or VOD URL was established.

The hosted overlay had separately been inspected in a real browser at 1920×1080 and 960×540, as recorded in D3.3. That half-scale browser check is not represented as an OBS half-scale broadcast check.

## Validation

No application code changed for this task. Existing application validation remains the 184-test check/lint/test/build plus Windows/Ubuntu production smoke baseline from D3.1. The new acceptance evidence is the actual OBS preview, transport statistics, stopped-state check and the public hosted Stream opening/closing timestamps. All screenshots and private submission artifacts stay local and git-ignored.

## Independent follow-up checks

Repeated November 2, 2026 after the owner's request to finish checks without their involvement:

- `pnpm check`, `pnpm lint`, `pnpm build` and `pnpm test` passed: 10 deployment checks, 77 Twitch Kit tests and 97 Exchange tests, 184 total, with no skips. The 40-virtual-minute Soak retained 500 Traders and 24 Listings with bounded state; measured tick p95 was 1.434 ms and sampled peak heap was 133.9 MiB on this machine.
- `pnpm smoke` passed against a fresh temporary database and a keyless production process: dashboard, overlay lifecycle, bundled demo assets, simulator, SSE/access guards and process restart with Portfolios preserved and no output replay. This did not start a second live Twitch receiver or modify hosted Portfolios.
- The first hosted probe timed out after ten seconds. A cold-start retry returned health 200. At `2026-11-02T04:58:07.429Z` (10:28:07 AM IST), the public hosted check passed: health 200, anonymous private snapshot 401, public overlay snapshot 200, foreign-Origin snapshot/SSE 403, and a real version-1 SSE projection delivered. No checked response contained CORS headers. Local JSON evidence remains ignored in `artifacts/render/public-runtime-verification.json`.
- A privacy scan passed across 224 release-candidate files and both built client assets, comparing seven configured credential/token values without printing them. Private video, submission, reference, environment and database paths remain excluded.
- A fresh native window inventory showed no OBS window open. No new broadcast, OAuth grant, chat message or recording was initiated for these follow-up checks.

Multi-streamer account isolation is **not implemented or verified** by this task. The deployed configuration still admits one configured owner, and the existing hosted auth test explicitly rejects another broadcaster. ADR 0011 describes planned work; it is not evidence of a working multi-channel runtime. Real second-streamer OAuth will remain a separate manual authorization check after deterministic isolation tests and implementation exist.
