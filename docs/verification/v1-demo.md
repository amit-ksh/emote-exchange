# V1: captioned local demo

October 29, 2026. Recorded actual local OBS footage and edited an 88-second, 1920×1080, 60 FPS H.264 demo with burned English captions. The final edit uses `2026-10-29 23-29-51.mp4`, with Pump and dump, bright full-size output, the actual half-scale region, quiet-state copy and reduced motion. SIM is visible during simulated activity and clears when generation stops. Title/outro identify this as a local demo with free play Coins and no real money. Audio is omitted; there is no music, microphone recording, third-party gameplay or recreated Codex conversation.

Reviewable deliverables (committed):

- [88-second demo MP4](../submission/media/emote-exchange-demo.mp4)
- [Timed English captions](../submission/media/emote-exchange-demo.srt)
- [Edit decisions and provenance](../submission/media/README.md)

The original OBS MP4s, burned ASS layout and actual edit script remain local under ignored `artifacts/h3/` and `artifacts/video/`. No tool binaries or raw recordings are committed.

Verified the output by decoding all 5,280 video frames with FFmpeg, exit 0, and inspecting title, active Trade/Halt, full-size bright, half-scale, reduced-motion and outro frames. Corrected an escaped line break in the outro during review. Captions occupy the clear center or the space outside the half-scale overlay rather than covering its widgets.

Final October 30 decode passed with no errors. Committed MP4: 4,389,931 bytes; SHA-256 `0ed07dcd7567deb2158f18f401535509989bb03f41982e6bece31323e94e55c8`.

This video is a useful standalone simulated demo. The full hackathon video remains unfinished: H1/H5 require recorded interaction from two independent Twitch viewer accounts and a real follow; actual Codex build shots and YouTube hosting/logged-out playback are separate V1/V2 gates. The supplied Ion launch video is unrelated. Do not describe this demo as a live Twitch walkthrough or a submitted project video.

Asset provenance: emotes are the app's original bundled demo SVGs; the bright striped background is an original generated QA pattern. Captions are rendered with the installed Segoe UI font; its font files are not distributed. Raw recordings contain the approved overlay display and SIM names, with no incoming chat text, tokens or desktop capture.
