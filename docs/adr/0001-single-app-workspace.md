# One Emote Exchange entry in a small pnpm workspace

Status: accepted, revised 2026-10-27 at the user's request to focus the project on Emote Exchange.

Build one product in `apps/emote-exchange`, supported by `packages/twitch-kit`. The workspace keeps the existing product and transport glossaries and a useful seam between pure market rules and Twitch I/O. Keep product-specific screens in the app; introduce no shared UI package for a single dashboard.

The second application and its planning have been removed. One polished entry is the scope for the remaining hackathon period. The repository directory may remain `emo-trade`; package names and documentation use Emote Exchange consistently.

## Considered options

- Flatten everything into the repository root: fewer directories, but loses the existing separation between Twitch transport and market rules for little setup benefit.
- Continue with multiple entries: more implementation, safety and recording work than the remaining schedule supports.

## Consequences

One Twitch registration, local process, dashboard, overlay, submission kit and primary Codex chat. `pnpm dev:exchange` runs the app at port 4100. Future applications require a separate scope decision.
