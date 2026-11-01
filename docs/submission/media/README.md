# Video assets

## App-only launch video — Sarah

[emote-exchange-teaser.mp4](emote-exchange-teaser.mp4) is the **34-second launch cut**, closer to the Ion reference's pace, with its own [SRT](emote-exchange-teaser.srt) and [edit decisions](teaser-edit.json). It reuses the same Sarah narration and real demo footage.

[emote-exchange-launch.mp4](emote-exchange-launch.mp4) is the owner's revised **1:41** launch-style video. Original animated cream/lime graphics frame actual Twitch-connected OBS clips over a striped background. Separate chapters cover buy, sell, portfolio, check-in/Streaks, Grants, market, top, Coin rewards, controls and Live analytics. The final card lists viewer, broadcaster and moderation commands. There is no build or test-results segment.

[SRT](emote-exchange-launch.srt) · [edit decisions](launch-edit.json) · [poster](launch-poster.png) · [verification](../../verification/v1-launch-video.md). Sarah synthetic narration by ElevenLabs; retain `elevenlabs.io` in the publishing title. The free-plan restrictions in the [publishing notes](../video-publishing.md) apply. No YouTube upload or Devpost submission is claimed.

## Narrated Twitch demo — November 1

[emote-exchange-devpost.mp4](emote-exchange-devpost.mp4) is the completed **2:05** export: actual Twitch chat commands, dashboard and overlay; labeled SIM footage; actual repository planning/source/review records; ElevenLabs George narration and burned English captions. H.264/yuv420p, 1920×1080 at 30 FPS, AAC stereo 48 kHz, fast-start MP4. No review watermark, music or desktop audio. [SRT captions](emote-exchange-devpost.srt), [edit decisions](devpost-edit.json), [poster](devpost-poster.png).

SHA-256: `66a42c05ae4056e82cc8a7794e800923cead2e23e682dc95c415d5b0afd9cc5c` (7,885,050 bytes).

Use the title and credits in [publishing notes](../video-publishing.md). Narration was generated on an ElevenLabs **free plan**: non-commercial use only, with `elevenlabs.io` or `11.ai` in the publishing title. A commercial license is not claimed; the repository's MIT license does not grant commercial rights to this narration. The export has not been uploaded to YouTube or submitted to Devpost. [Full verification](../../verification/v1-live-video.md).

## Earlier simulated demo — October 29

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
