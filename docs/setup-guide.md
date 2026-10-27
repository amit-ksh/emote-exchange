# Setup guide

Start with demo mode. Twitch credentials and OBS are needed for the later live verification, not for installing the app.

## 1. Local tools and demo mode

| Tool | Purpose | Setup |
|---|---|---|
| Node.js 24 LTS | Runs native TypeScript, built-in SQLite, tests and WebSocket | Install Node 24 and check `node --version`. |
| pnpm | Workspace dependencies and commands | Use the version pinned in the root `package.json`. |
| Git | Task commits and source history | Install [Git](https://git-scm.com/downloads). |
| OBS Studio | Browser-source overlay and recordings | Install [OBS Studio](https://obsproject.com/). |
| Twitch CLI | Optional protocol mock tests | Follow [the official Twitch CLI guide](https://dev.twitch.tv/docs/cli/). |
| Codex | Build and review work | Use the installed Codex app or CLI. Record the real build session in [codex-sessions.md](submission/codex-sessions.md). |

From the repository root:

```sh
pnpm install
pnpm dev:exchange
```

Open [the dashboard](http://localhost:4100/) and [the overlay](http://127.0.0.1:4100/overlay). The foundation milestone serves these pages without Twitch credentials. Simulator controls and market behavior arrive in their own sprint tasks; use the app README to check what is currently implemented.

## 2. Twitch accounts

The broadcaster account is sufficient for the initial live integration. A dedicated bot account and test viewers can be added later.

| Account | Purpose |
|---|---|
| Broadcaster | Owns the channel and Twitch application; authorizes channel access. |
| Bot, optional | Sends the app's replies under its own name. Without it, the broadcaster sends replies through the same queue. |
| Two test viewers | Verify listing eligibility, trading, follows and the live walkthrough. |

Verify the broadcaster's email and enable two-factor authentication before registering an application. When using a dedicated bot, follow the current Twitch authorization guidance for the selected subscriptions and sender role. Keep account credentials outside this repository.

## 3. Register one Twitch application

Open [the Twitch developer console](https://dev.twitch.tv/console) as the broadcaster and register the local Emote Exchange app. Consult [Twitch's registration instructions](https://dev.twitch.tv/docs/authentication/register-app/) if the console fields change.

| Field | Value |
|---|---|
| Name | `Emote Exchange Local <yourname>`; choose an available name. |
| OAuth Redirect URL | `http://localhost:4100/auth/callback` |
| Category | Choose the category appropriate for a chat app in the current console. |
| Client Type | Confidential; the secret stays in the local Node server. |

Create `apps/emote-exchange/.env` from `.env.example`. Copy the client ID and client secret directly into it, using the variable names in that file. Never paste secrets into Codex prompts, commit them, or put them in client code.

Once auth is implemented, start the app and use **Connect Twitch** on the dashboard. The optional bot login is a separate authorization role in the same application. The callback URL and configured `PUBLIC_ORIGIN` must agree.

For optional Twitch CLI experiments, register any additional callback URL required by the CLI explicitly, following its documentation.

## 4. Demo emotes and recording assets

Use the bundled original demo emotes for offline demonstrations. The demo must remain useful without third-party emote services.

For a live recording, prepare emotes and other assets you have permission to show. Membership in a global or third-party emote catalog is not a blanket license for every use. Keep a small asset list with its source and permission or license when preparing the final video.

If using original channel emotes through an external provider:

1. Create six to eight distinct images that read clearly at small sizes, with transparent backgrounds.
2. Upload them to your chosen provider and enable them for the broadcaster's channel.
3. Give them distinct names, such as `stonks`, `rugpull` and `cozyHug`.
4. Keep matching local demo assets in `apps/emote-exchange/client/public/demo-emotes/`.

## 5. OBS

Add a Browser source to a scene with the following settings:

| Setting | Value |
|---|---|
| URL | `http://127.0.0.1:4100/overlay` |
| Width × Height | 1920 × 1080 |
| Control audio via OBS | On when testing the implemented sound cues. |
| Shutdown source when not visible | Off |
| Refresh browser when scene becomes active | Off |

Check the transparent background at full size and at 50% scale, over both bright and dark scenes. Connect OBS to the broadcaster's Twitch account for live tests. Record the complete test locally, and separately capture real Codex build and review footage for the submission.

## 6. Repository and submission accounts

1. Create a remote repository with a descriptive name such as `emote-exchange` and push the local commits when ready.
2. Read and confirm the current [hackathon rules](https://twitchcon-codex.devpost.com/rules), including eligibility, deadline and repository access requirements.
3. Create one Emote Exchange submission draft.
4. Use [the submission kit](submission/emote-exchange.md) to collect the video, screenshots and actual build-session details.
5. Verify access to the source and video from the judge's perspective before submitting.

The internal submission target is **November 2, 2026, 8:00 PM IST**. This is a team planning target; confirm the organizer's deadline independently.

## Checklist

- [ ] Node 24 and the pinned pnpm version work.
- [ ] Install, type check, lint and tests pass.
- [ ] Dashboard and transparent overlay load without Twitch credentials.
- [ ] OBS source checked at full and half scale.
- [ ] Broadcaster account is ready and one Twitch application is registered.
- [ ] Client ID and secret are stored only in the git-ignored `.env` file.
- [ ] Live authorization and a real chat message verified after the platform sprint.
- [ ] Original or licensed recording assets prepared.
- [ ] Remote repository and one submission draft prepared.
- [ ] Organizer deadline and eligibility confirmed.
- [ ] Actual Codex build-session details recorded.
