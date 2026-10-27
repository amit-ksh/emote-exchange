# Sprint 4: Ship (Monday, November 2)

**Goal:** submit one Emote Exchange entry by the internal target of **8:00 PM IST**. Confirm the organizer's exact deadline and requirements in [the brief](../hackathon-brief.md); this plan does not establish an official cutoff.

Use the day for the submission and critical fixes only.

| Time (IST) | Step |
|---|---|
| 09:00–13:00 | V1 Edit the Exchange video and captions. |
| 13:00–15:00 | V2 Upload and verify playback; select screenshots. |
| 15:00–17:00 | D1 Complete the description and build evidence. |
| 17:00–18:00 | D2 Verify repository access and clean-folder setup. |
| 18:00–20:00 | D3 Review and submit the entry. |
| After submission | D4 Record the submitted version and follow the organizer's change restrictions. |

## V1 / V2 Video

Follow [the submission script](../submission/emote-exchange.md), then check:

- [ ] Duration meets the confirmed organizer requirement; target about 2:45 while editing.
- [ ] The app is visibly working with real Twitch chat.
- [ ] Codex footage shows actual implementation and review work.
- [ ] Claims match the shipped features and test evidence.
- [ ] Simulated load is labeled, and recording-asset permissions have been checked.
- [ ] Captions are present and readable.
- [ ] Hosting and visibility meet the rules, and playback works from a logged-out browser.

## D1 Entry content

Confirm the final form requirements, then fill them from [the submission kit](../submission/emote-exchange.md):

- [ ] Title, tagline and accurate full description.
- [ ] Technologies actually used in the shipped build.
- [ ] Source repository URL and app setup link.
- [ ] Working video URL.
- [ ] Actual build-session information from [the log](../submission/codex-sessions.md).
- [ ] Three to five useful screenshots: overlay, chat interaction, dashboard and build evidence.

Remove unfinished placeholders and future-tense feature claims before submission.

## D2 Repository

- [ ] `pnpm check`, `pnpm lint`, `pnpm test` and the production client build pass.
- [ ] Fresh-folder setup works by following the README exactly.
- [ ] The committed files and history contain no credentials; `.env` stays ignored.
- [ ] Judges have the repository access required by the confirmed rules.
- [ ] The submitted commit is recorded and, when using a remote, its CI result is checked.
- [ ] A submission tag such as `submission-2026-11-02` points at the intended commit.

Do not describe a local check as a successful remote CI run.

## D3 Submit

- [ ] Review the final entry from the judge's perspective.
- [ ] Click the form's submission action; a saved draft does not count.
- [ ] Verify the organizer UI shows the entry as submitted.
- [ ] Save the confirmation and final entry URL.

## D4 After submitting

Record the submitted source revision, video URL and submission URL. Follow the organizer's actual restrictions on later edits. If a frozen entry is required, continue later product work on a separate branch or copy.
