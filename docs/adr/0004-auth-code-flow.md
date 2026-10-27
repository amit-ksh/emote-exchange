# OAuth authorization code flow for one local Twitch application

Status: accepted, scope revised 2026-10-27 with ADR 0001.

Emote Exchange uses one confidential Twitch developer application. The streamer supplies its client ID and secret in the local `.env`, then logs in through the authorization code flow with redirect `http://localhost:4100/auth/callback`. Tokens remain on the server. This supports refresh tokens and Twitch EventSub WebSocket subscriptions using a user access token.

This is a developer-run local application. A bundled desktop distribution would need a fresh authentication review: an embedded shared client secret cannot be kept confidential on end-user machines.

## Considered options

- Implicit grant: lacks refresh tokens.
- Device code flow: worth revisiting for a packaged desktop distribution; adds a code-entry interaction unnecessary for this developer-run local server.

## Consequences

The optional bot account uses the same registration and a separate role/token record. The broadcaster sends chat when no bot is connected. OAuth state is single-use, expiring, role-bound and bound to the initiating browser with an HttpOnly SameSite=Lax cookie. Token refresh is serialized per role.

Reference: [Twitch OAuth flows](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/).
