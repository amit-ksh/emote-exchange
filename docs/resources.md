# Resources

Primary documentation for the chosen stack and remaining integration work. Check protocol and provider details against the linked sources when implementing them; endpoint and rate-limit notes in old planning drafts are not a substitute for current documentation.

## Hackathon

- [Overview](https://twitchcon-codex.devpost.com/), [rules](https://twitchcon-codex.devpost.com/rules), [resources and FAQ](https://twitchcon-codex.devpost.com/resources)
- [TwitchDev Discord](https://discord.com/invite/G8UQqNy)

The internal shipping target is November 2, 2026, 8:00 PM IST. Confirm the organizer's deadline and eligibility separately; see [the brief](hackathon-brief.md).

## Twitch integration

| Topic | Primary source | Used for |
|---|---|---|
| Application registration | [Register an app](https://dev.twitch.tv/docs/authentication/register-app/) | One local Emote Exchange application. |
| Authorization code flow | [Get tokens](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/) | Server-side broadcaster and optional bot authorization. |
| Token lifecycle | [Validate](https://dev.twitch.tv/docs/authentication/validate-tokens/), [refresh](https://dev.twitch.tv/docs/authentication/refresh-tokens/) | Startup and hourly validation, refresh and disconnect handling. |
| OAuth scopes | [Scopes](https://dev.twitch.tv/docs/authentication/scopes/) | Least scopes needed for enabled features. |
| Chat and delivery limits | [Chat documentation](https://dev.twitch.tv/docs/chat/) | The single outbound queue and sender roles. |
| EventSub WebSockets | [Handling events](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/) | Welcome, keepalive, reconnect, limits and deduplication. |
| Subscription definitions | [Subscription types](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/) | Chat, follows, raids and stream status. |
| Event payloads | [EventSub reference](https://dev.twitch.tv/docs/eventsub/eventsub-reference/) | Normalized events and Twitch emote fragments. |
| Helix endpoints | [API reference](https://dev.twitch.tv/docs/api/reference/) | Chat replies, emote sets and subscription creation. |
| Protocol mock testing | [Twitch CLI](https://dev.twitch.tv/docs/cli/), [WebSocket commands](https://dev.twitch.tv/docs/cli/websocket-event-command/) | Reconnect and event verification. |

The app keeps its own conservative outbound limits even when an account is allowed more. Confirm the Send Chat Message endpoint's authorization and length requirements directly before implementing the sender.

## Third-party emote providers

Best-effort integrations: cache the last successful catalog and preserve offline demo behavior when any provider fails.

| Provider | Planned channel endpoint | Planned global endpoint |
|---|---|---|
| 7TV | `https://7tv.io/v3/users/twitch/{twitch_user_id}` | `https://7tv.io/v3/emote-sets/global` |
| BTTV | `https://api.betterttv.net/3/cached/users/twitch/{twitch_user_id}` | `https://api.betterttv.net/3/cached/emotes/global` |
| FFZ through BTTV's cache | `https://api.betterttv.net/3/cached/frankerfacez/users/twitch/{twitch_user_id}` | `https://api.betterttv.net/3/cached/frankerfacez/emotes/global` |

Verify each response shape and image URL against provider documentation or a recorded public response in K5. Provider availability is not required for the foundation milestone or offline demo assets.

## Runtime and tooling

| Tool | Why | Documentation |
|---|---|---|
| Node.js 24 LTS | Native TypeScript, SQLite, tests, WebSocket and fetch. | [Node.js](https://nodejs.org/en/docs) |
| pnpm | A workspace containing the app and Twitch infrastructure. | [pnpm](https://pnpm.io/) |
| TypeScript | Strict static checks; Node executes server `.ts` files. | [TypeScript](https://www.typescriptlang.org/docs/) |
| Hono and its Node adapter | Local HTTP routes, streaming and static client delivery. | [Hono](https://hono.dev/docs/) |
| React | Dashboard and overlay rendering. | [React](https://react.dev/) |
| Vite | Client development and production build. | [Vite](https://vite.dev/guide/) |
| Biome | Formatting and lint checks. | [Biome](https://biomejs.dev/guides/getting-started/) |
| GitHub Actions | Repeatable checks on the committed source. | [Actions docs](https://docs.github.com/en/actions) |
| Playwright, optional | Overlay browser smoke checks if time permits. | [Playwright](https://playwright.dev/docs/intro) |

The approved dependency list lives in [Twitch Kit spec section 4](specs/twitch-kit.md#4-dependencies). Record licenses for packages and assets in the actual shipped dependency graph; hosting and CI allowances depend on the selected account and plan.

## Design and recording

| Resource | Intended use |
|---|---|
| [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) | Market prices and tickers in the complete overlay. |
| [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk) | Overlay labels in the complete product. |
| Original bundled demo emotes | Offline demonstrations without an external catalog. |
| Browser Web Audio | Small synthesized cues without external sound files. |
| [OBS Studio](https://obsproject.com/) | Twitch stream, browser overlay and build recordings. |
| [DaVinci Resolve](https://www.blackmagicdesign.com/products/davinciresolve) or [Clipchamp](https://clipchamp.com/) | Video editing. |
| [YouTube Studio](https://studio.youtube.com/) | Submission video when required by the organizer. |

Bundle fonts locally with their license files when adding them. Keep the app functional with local fallback fonts until then. Use recording assets whose permissions have been checked.

## Codex

Use the installed app's available planning and review workflows. Record real sessions, tests and review findings in [the session log](submission/codex-sessions.md), and describe only build methods actually used in [the submission draft](submission/emote-exchange.md).
