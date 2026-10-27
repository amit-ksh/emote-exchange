# Sprint 3: Harden and record (October 31 – November 1)

**Goal:** two live walkthroughs completed, the bugs they found fixed, the overlay polished at OBS size, and every shot for one submission video recorded.

Keep implementation work to reliability fixes and polish. Each acceptance claim needs a test name, a recording timestamp or a manual observation.

## H1 Live walkthrough #1 (Saturday)

Run Emote Exchange with the two test viewer accounts and record the entire session locally in OBS.

1. Connect Twitch, check the connection status and ring the opening bell.
2. Use the same original emote from two accounts and watch it IPO.
3. Buy from a test account; check the reply, balance and trade feed.
4. Coordinate normal emote messages and watch the price move.
5. Sell part of a holding and verify the leaderboard changes.
6. Test a real follow. Try a real raid when available; otherwise use an explicitly labeled fake raid.
7. Stop and restart the app during the Session; check that holdings and balances recover and the overlay reconnects.
8. Ring the closing bell and verify the summary.

Log each confusing moment or defect in [bugbash.md](../submission/bugbash.md), including what was expected and the recording timestamp.

## H2 Bug bash

- **S1:** broken or embarrassing during a stream.
- **S2:** confusing or prevents a documented core action.
- **S3:** polish.

Fix all S1 and S2 issues before final recording. For each issue, reproduce the behavior with a failing test or a precise manual sequence, fix the cause, then record the passing verification under task `H2-<n>`.

## H3 Overlay and dashboard polish

Run Opening day and Pump and dump in demo mode. View the actual `/overlay` at 1920 × 1080 and at 50% scale in OBS, over both a bright busy scene and a dark scene.

- [ ] Panel edges, baselines and spacing align.
- [ ] Names up to 25 characters, long tickers and numbers above 1,000,000 fit or truncate clearly.
- [ ] Text and directional arrows are readable at half scale; color alone does not convey price direction.
- [ ] Panels have enough backing to remain readable over the scene.
- [ ] Banners queue without overlap; updates do not shift the layout.
- [ ] Reduced motion works; no flashing exceeds the spec's limit.
- [ ] Empty, quiet, disconnected and reconnecting states explain what is happening.
- [ ] The SIM badge matches active simulation.
- [ ] Bell and trade cues are balanced against the streamer's voice, and sound-off works.
- [ ] The dashboard's setup checklist and error messages are clear to a first-time user.
- [ ] Every implemented dashboard action works with valid input and reports rejected input clearly.

Record what was viewed, what clipped or overlapped, and what was fixed. Use browser performance tooling to verify the overlay performance target; visual smoothness alone is not an FPS measurement.

## H4 Hardening (Sunday)

Verify these through tests and a real running app as appropriate:

1. Restart during a Session: persisted state returns, live connection recovery is visible, and the overlay recovers by itself.
2. Disconnect the network for 60 seconds: the dashboard shows the gap; local demo controls still work; reconnect does not duplicate subscriptions or events.
3. Token expiration and revocation: refresh succeeds or the account clearly disconnects without leaking credentials.
4. Every state-changing route rejects foreign or missing Origin and missing `X-CTA`. OAuth callbacks validate their own single-use state.
5. Inspect snapshot payloads, logs and built client files for secrets and raw chat text. Display only the approved Exchange data.
6. Check the outbound queue under a command burst and confirm simulated activity never sends a Twitch message.
7. Follow the README in a clean folder: install, checks, start and demo. Fix every missing step.

Review the complete change set and resolve actionable findings. Record any gate requiring a real account or OBS honestly if the environment could not verify it.

## H5 Live walkthrough #2 and final footage

Repeat H1 after fixes. This recording supplies the real Twitch demonstration. Frame the chat, overlay and dashboard so cause and effect are clear. Keep simulated load visibly labeled.

Capture extra shots from [the Exchange video script](../submission/emote-exchange.md), plus actual build footage:

- A spec or task plan used to guide implementation.
- A meaningful test going red, then green.
- A real review finding and its fix.
- Actual session details required by the organizer.

If a shot is missing, capture a real remaining task; do not recreate a staged result.

## H6 Judge-facing README

Update `apps/emote-exchange/README.md` to match the shipped behavior. Include the current screenshot, exact demo commands, live setup, OBS settings, viewer/mod commands, architecture links, fairness rules and the most likely troubleshooting cases. Run every command documented there. Link to evidence of Codex work without claiming workflows that were not used.

## Sprint exit checklist

- [ ] Two live walkthroughs recorded.
- [ ] All S1/S2 issues fixed and verified.
- [ ] OBS checks completed at full and half scale.
- [ ] Hardening checklist verified with evidence.
- [ ] Judge-facing setup verified in a clean folder.
- [ ] Every planned video shot captured.
- [ ] Check, lint and tests pass on the final source.
