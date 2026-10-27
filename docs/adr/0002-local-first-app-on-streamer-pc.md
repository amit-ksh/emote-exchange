# Each entry is a local app on the streamer's PC, not a hosted service

Emote Exchange is one Node process the streamer runs on their own machine, bound to 127.0.0.1, with its dashboard at `localhost:4100` and its overlay loaded by OBS from `127.0.0.1:4100/overlay`. State lives in a local SQLite file. This needs no hosting account and keeps tokens on the streamer's own disk. Judges run the app with `pnpm i` and one dev command.

## Considered options

- **Hosted multi-tenant web app (Vercel, Cloudflare and similar):** easier first touch for a judge (just log in), but it needs per-user token storage and encryption, a public EventSub transport, a database service and abuse handling. That's a week of work no judging criterion rewards, plus ongoing cost and a security surface.
- **Pure static page with the token in the overlay URL:** tokens leak whenever the URL is shown, browser storage inside OBS is fragile for portfolios, and the dashboard and overlay can't share state across processes.

## Consequences

The streamer keeps a terminal window running while live. The README says so, and the dashboard shows a clear "running" state. Because any website can send requests to localhost, every state-changing route checks Origin plus a custom header (twitch-kit spec, section 15).
