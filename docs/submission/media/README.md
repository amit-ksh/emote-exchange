# Local demo assets

`emote-exchange-demo.mp4` is an 88-second simulated local demo, 1920×1080 at 60 FPS, H.264/yuv420p, fast-start MP4, no audio. English captions are burned in; `emote-exchange-demo.srt` provides companion timed text. This is not the final hackathon video or a real Twitch walkthrough.

SHA-256: `0ed07dcd7567deb2158f18f401535509989bb03f41982e6bece31323e94e55c8` (4,389,931 bytes).

## Edit decisions

All source footage is the actual local OBS recording `2026-10-29 23-29-51.mp4`, retained in ignored `artifacts/h3/recordings/`. Title and outro are original text cards. No desktop or authentication capture is used.

| Output time | Source | Content |
|---|---|---|
| 00:00–00:06 | Original title card | App name and explanation |
| 00:06–00:28 | Recording 00:55–01:17 | Full-size bright scene, Bell and market panels |
| 00:28–00:56 | Recording 01:20–01:48 | Pump and dump; Trades, Heat and Halts |
| 00:56–01:08 | Recording 00:04–00:16 | Actual half-scale overlay; quiet Feed |
| 01:08–01:20 | Recording 02:56–03:08 | Reduced motion over dark scene |
| 01:20–01:28 | Original outro | Free play Coins; simulated local recording |

The SIM badge is visible while simulation runs and clears when generation stops. The half-scale quiet segment shows persisted simulated market state with the generator stopped. Emotes are original bundled demo SVGs; the bright background is an original QA pattern. Segoe UI is rendered from the installed font; font files are not distributed. No music, voice or third-party gameplay is included.

Validated by decoding every video frame without errors and reviewing full-size, half-scale, reduced-motion, title and outro frames. [Verification and remaining project-video gates](../../verification/v1-demo.md).
