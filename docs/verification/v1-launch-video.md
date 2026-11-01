# V1 app-only launch video

November 1, 2026. The owner requested an Ion-inspired launch film, Sarah narration, separate command/feature chapters, real chat footage and a striped overlay background. The new exports discuss the app only. The earlier 2:05 Devpost walkthrough remains available with its build-evidence chapter.

## Recorded features

Recorded a new 13:15.13 local OBS source at 1920×1080, 30 FPS, starting **20:25:02 IST**. Source retained privately in ignored `artifacts/video/launch/live-features-raw.mp4`. The scene combines the real dashboard, actual overlay at approximately half scale over original CSS stripes, and Twitch's official chat embed. No public broadcast was started. No desktop/authentication capture or microphone audio is included.

The existing market was preserved; the simulator was stopped. Existing `sim_*` Traders remain in the saved leaderboard and are visibly named. The commands below came from the real viewer account `amit1541`; successful bot replies came from `ammit_ksh` and have queue log status `sent`, HTTP 200.

| Action | Actual result | Source time |
|---|---|---|
| `!greetings good evening` | Streak 1, +50 Coins; Greeting Feed item and queued reply | About 01:33 |
| `!buy DemoBull 2` | 2 shares at 383.37, debit 775 Coins; Trade Feed and reply | About 02:40 |
| `!portfolio` | 378 Coins, DemoBull ×4, Net Worth 1,911, Streak 1 | About 03:38 |
| `!sell DemoBull 1` | Credit 379 Coins, leaving 757 Coins and three shares | About 04:50 |
| Dashboard Grant | Reviewed “Give amit1541 500 Coins?”, confirmed once; Coins 757 → 1,257; Feed “amit1541 +500 · gift from the streamer” and Twitch reply | About 06:59 |
| `!market` | Playing instructions and hottest tickers in bot reply | About 08:34 |
| `!top` | Leaderboard reply, including the real viewer and retained SIM Traders | About 09:06 |
| Live dashboard / Pause | Actual Live charts, reward totals and Streak; paused trading then restored it | About 11:15 / 12:27 |

No real Follow or Raid was staged for this capture. Their rewards are explained with original informational graphics. Default starting Coins are 1,000; chat Stipend 10 per qualifying minute, Follow 200 and eligible Raid Visa 500. Check-in is once per open Stream, not a calendar-day reward. No `!daily` command is claimed.

## Narration and picture

Used the requested **Sarah — Mature, Reassuring, Confident**, voice `EXAVITQu4vr4xnSDxMaL`, through the official ElevenLabs SDK and `eleven_multilingual_v2`. The supplied key was read only in memory from its private local file; it was never copied into the app or release files. One 1,531-character take, 97.803 seconds spoken. Independent Scribe v2 recognition matches all **261 normalized tokens** exactly, treating spoken “P F” as `pf` and splitting punctuation consistently. Verification used recognition and audio measurements; no human listening test is claimed.

Original cream/lime backgrounds, large type and short animated text entrances take stylistic cues from the owner's Ion reference. No Ion frames or audio are reused. The feature film has 14 edit sections, with separate buy, sell, portfolio, greetings, Grant, market, top, rewards, controls and Live shots. The closing card lists viewer, broadcaster and moderation commands. The shorter teaser reuses selected complete Sarah sentences without another voice generation.

Inspected native 1920×1080 frames for titles, buy, sell, portfolio, check-in, Grant confirmation, Grant Feed/reply, market, top, rewards, paused controls, Live and closing command card. Also inspected the buy composition at 960×540. Feature titles, command examples and subtitles fit; actual bot text remains present at native size. Reframed the source into separate overlay/chat close-ups instead of shrinking the entire composite, moved captions below the action, added the missing starting-Coins default and role-separated command list. Actual greeting and Grant Feed items are readable over the stripes. OBS recording is stopped and trading was restored to running.

## Exports and checks

- [Feature film](../submission/media/emote-exchange-launch.mp4): **101 seconds**, **3,030 frames**, 1080p30 H.264/yuv420p, AAC 48 kHz stereo, fast-start MP4. 27 burned English cues plus [SRT](../submission/media/emote-exchange-launch.srt).
- [Launch teaser](../submission/media/emote-exchange-teaser.mp4): **34 seconds**, 1080p30, same real footage and Sarah voice, with its own [SRT](../submission/media/emote-exchange-teaser.srt).
- Full frame/audio decoding, subtitle word/timing audit, file hashes and atom order are recorded in the [media audit](../submission/media/launch-audit.json). Full-film loudness measured **−16.0 LUFS**, **−1.5 dB true peak**, 2.0 LU range.
- `pnpm check`, `pnpm lint`, `pnpm test` and `pnpm build` passed. Tests: **71 twitch-kit + 91 app = 162**, no failures. The 40-minute virtual Soak passed; concurrent video encoding was running during that test, so its timing sample is not an isolated benchmark.
- No application code or dependencies changed. New exports and publication notes are the committed deliverables. Supplied credential/token values are checked against tracked release files, built assets and reachable Git patches before commit.

No YouTube upload or Devpost submission is claimed. See [publishing notes](../submission/video-publishing.md) for title/attribution, the narration account's free-plan restrictions and the earlier build-evidence cut.
