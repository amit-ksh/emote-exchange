# V1 live footage and narrated edit

November 1, 2026. The narrated **2:05 video export is complete**. Public YouTube hosting and license/publication checks remain; no submission is claimed.

## Actual recordings

Used a separate `Emote Exchange Devpost` OBS scene collection. Canvas and recording output 1920×1080, 30 FPS. No public Twitch broadcast was started. The capture combines the actual app dashboard, its actual overlay at approximately half scale, and Twitch's official chat embed for `ammit_ksh`. A dark original CSS gradient and background lettering sit behind the transparent overlay. There is no unrelated gameplay, desktop capture, microphone or music. OBS used the installed `D:\obs-studio` instance; the earlier portable QA collection was used only as the import template.

Original recording: `2026-11-01 19-14-08.mp4`, 7:01.43, H.264 1080p30. Preserved locally as ignored `artifacts/video/devpost/live-twitch-raw.mp4`; SHA-256 `1ab902a4738fe3a027ae2f261580776720999ec80ff390d910f3d70ebace1acf`.

Verified actual viewer `amit1541` and bot `ammit_ksh` in the official Twitch chat and actual OBS output:

| Action | Actual result | Raw recording |
|---|---|---|
| `!buy DemoBull 2` | Queued reply `BUY 2 DemoBull @ 17.78 (37 Coins)`; Feed and saved Trade; Coins 1,094 → 1,057 | Accepted 19:16:14.554 IST, approximately 02:05.6 |
| `!portfolio` | Reply reports 1,057 Coins, DemoBull ×3 and Net Worth 1,110; includes an older retained share | Visible in frame at 03:14 |
| `!sell DemoBull 1` | Queued reply `SELL 1 DemoBull @ 17.78 (16 Coins)`; Feed and saved Trade | Accepted 19:17:40.908 IST, approximately 03:32.0 |
| Final `!portfolio` and dashboard search | 1,073 Coins, DemoBull ×2, Net Worth 1,108; recorded Traders row matches | Final chat reply and filtered dashboard around 05:30 |

The existing live database was preserved, with no Season reset, grant or simulated input during this recording. Existing SIM Traders remain visibly named `sim_*`; the simulator was stopped. The channel was Twitch-connected but not publicly broadcasting, and the capture is labeled as local OBS output. This is a real command-loop recording, not the full two-viewer H1/H5 checklist: fresh IPO, real Follow/Raid, recorded restart and closing summary remain separate checks.

Additional actual OBS recording `2026-11-01 19-23-32.mp4` shows the real implementation-plan excerpt, `stepMarket` source, the historical E6 review record and its current scenario test. It is labeled as repository evidence and historical records, not a reconstructed Codex conversation or a filmed past red/green test. File retained under ignored `artifacts/video/devpost/build-evidence-raw.mp4`.

## Narration and edit

The initial connected-connector attempts with Andrew returned capacity errors: no generation started or charged. The user then supplied a local API-key file. Read it only for authentication, without printing its contents, and used the official ElevenLabs SDK in ignored tooling. The account's available voice list included **George — Warm, Captivating Storyteller**, selected for clear English narration. No application dependency or configuration changed.

Generated one complete 1,871-character / 294-word take using `eleven_multilingual_v2`, with character alignment; spoken duration 121.487 seconds. A separate Scribe v2 recognition pass returned **all 294 normalized words exactly**, including Twitch, OBS, Codex and the market description. Audio verification used that full recognition check and signal measurements; no human listening test is claimed.

Re-edited picture cuts against the actual speech timing, removed the review watermark and added **28 English subtitle cues**, burned in plus SRT. Each cue has at most two lines of 42 characters, monotonic timestamps and no overlap. During SIM, captions move into the empty center so they do not cover the Tape. Inspected final buy, portfolio, sell, SIM, build and outro frames at native resolution: replies and source excerpts fit; no subtitle clipping was found. OBS recording was stopped after the source captures.

Final [MP4](../submission/media/emote-exchange-devpost.mp4): **125 seconds, 3,750 frames, 1920×1080 at 30 FPS, H.264/yuv420p, AAC 48 kHz stereo, fast-start**, 7,885,050 bytes. SHA-256 `66a42c05ae4056e82cc8a7794e800923cead2e23e682dc95c415d5b0afd9cc5c`. Decoded every final video/audio frame, exit 0. Measured narration about **−16.31 LUFS**, **−1.37 dBTP**, 1.7 LU range; no clipping. Raw desktop/mic audio was effectively silent and is excluded from the export. The final audio contains only generated narration.

`pnpm check`, `pnpm lint`, `pnpm test` and `pnpm build` passed: **71 Kit + 91 app = 162 tests**, zero failures. Soak p95 2.725 ms and sampled peak heap 132.4 MiB. Application code was unchanged. The later report of three additional DemoBull messages is not used as evidence of a recorded attention/Price change; the verified command loop and labeled simulation supply those parts of the edit.

The supplied API account reported a **free plan**. The title, metadata, end card and [publishing package](../submission/video-publishing.md) include `elevenlabs.io`; a commercial audio license is not claimed. Confirm intended usage against ElevenLabs' policy before publication. Public YouTube upload and logged-out playback remain V2 checks under the [official rules](https://twitchcon-codex.devpost.com/rules), checked November 1. No video was uploaded or Devpost entry submitted here.
