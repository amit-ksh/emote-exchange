# Sprint plan

One Emote Exchange entry, from local setup on October 27 to an internal submission target on November 2, 2026. All times are IST (UTC+5:30). The organizer's exact deadline must be confirmed in [the hackathon brief](../hackathon-brief.md).

## Calendar and completion gates

| When | Sprint | Done when |
|---|---|---|
| Tue Oct 27 | [S0 Setup](sprint-0-setup.md) | One app and its Twitch infrastructure are scaffolded; dashboard, transparent overlay and health/SSE routes load without credentials; local checks pass. |
| Wed Oct 28 | [S1 Twitch Kit](sprint-1-twitch-kit.md) | Broadcaster auth, live chat reception, queued sending, guarded actions and simulator work; the app stays usable without Twitch keys. |
| Thu Oct 29 – Fri Oct 30 | [S2 Emote Exchange](sprint-2-emote-exchange.md) | Market rules, persistence, commands and core overlay work live and in demo mode; the spec's automated acceptance checks pass. |
| Sat Oct 31 – Sun Nov 1 | [S3 Harden and record](sprint-3-harden-and-record.md) | Two live walkthroughs completed, serious bugs fixed, OBS checks finished and submission footage recorded. |
| Mon Nov 2 | [S4 Ship](sprint-4-ship.md) | One accurate description, one verified video and one entry submitted by the internal target of **8:00 PM IST**. |

Dates are working targets, not evidence of completed tasks. Record actual completion and verification with each task. At the end of each day, run the available demo scenario and save a short recording; the app should remain showable throughout the build.

## Reviewed technical choices

- Keep `apps/emote-exchange` for the product and `packages/twitch-kit` for reusable Twitch/local-runtime infrastructure. The existing product folder is already clear.
- Use Node 24 native TypeScript on the server, Hono for local HTTP, SQLite for persistence, and native fetch/WebSocket/test tools.
- Use React and Vite for the dashboard and OBS overlay. Serve the built client and local endpoints on one app origin at port 4100.
- Use SSE for server-to-browser updates and guarded HTTP actions for dashboard controls. Introduce no external realtime service.
- Keep market and protocol rules pure and testable; runtime code performs networking, timing, persistence and delivery.
- Implement the broadcaster path first. Optional bot and provider integrations follow the core walkthrough rather than blocking setup.

The authoritative dependency list and protocol details are in [the Twitch Kit spec](../specs/twitch-kit.md). The [Exchange spec](../specs/emote-exchange.md) owns prices, integer-coin settlement and user-visible market behavior.

## Build order

1. Scaffold one app with an explicit foundation status and offline pages.
2. Establish guarded local actions, the snapshot/SSE contract and storage.
3. Connect Twitch with the minimum required subscriptions and a single outbound queue.
4. Build and verify deterministic market rules before wiring commands and persistence.
5. Complete the core overlay and dashboard, then check them at OBS size.
6. Run live walkthroughs and failure/recovery checks before recording the submission.

Parallel work is useful for independent adapters and visual implementation once their interfaces are agreed. Keep product behavior and verification evidence in the main build session. Log any additional work honestly in [the session log](../submission/codex-sessions.md).

## Cut lines

If work slips, cut optional scope in this order while preserving the live walkthrough, guarded routes, integer balances, restart recovery and offline demo:

1. Optional browser automation beyond required manual overlay checks.
2. CSV export, backup import/export and extra historical chart views.
3. Portfolio cards and decorative sound or motion polish.
4. Optional bot-account support; the broadcaster can send through the same queue.
5. Additional third-party provider adapters after the Twitch and local demo catalogs work.

Do not quietly cut a documented P0 rule. Revise the spec and the relevant task together when changing scope. Stop adding features by the hardening sprint.

## Codex workflow and evidence

Use the repository's real planning and review workflows. For each task:

1. Read its sprint block, linked spec sections and relevant decisions.
2. Write down the intended change and its acceptance checks.
3. Work test-first on engines, parsers, filters, queues and protocol code.
4. Run the acceptance checks and the repository checks.
5. Review the result and fix actionable findings.
6. Commit with the task ID and verification in the commit body.

Record actual build-session identifiers in [codex-sessions.md](../submission/codex-sessions.md). Capture a real plan, failing/passing tests and a fixed review finding; keep only claims supported by that evidence in the final description.

## Definition of done

- `pnpm check`, `pnpm lint` and `pnpm test` pass.
- Each task's acceptance checks have a recorded test name or manual verification step.
- UI changes have been viewed at their real OBS size, in demo mode, at full and half scale.
- Review findings are resolved, and the Code Review Rules in [AGENTS.md](../../AGENTS.md) are satisfied.
- One task commit records what changed and how it was checked.

Local setup completion does not imply that a remote CI run, live Twitch test, OBS check or submission has happened. Mark those gates only when observed.
