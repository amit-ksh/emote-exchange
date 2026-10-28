# Emote Exchange

A local play-money emote market for Twitch, displayed through an OBS browser source. K1–K5 are implemented: SQLite storage, guarded actions, bounded SSE, Twitch sign-in, incoming events, queued chat sending and cached emote catalogs. The Simulator and market rules remain in [the implementation plan](../../docs/implementation-plan.md).

## Run the foundation

From the repository root with Node 24.12+ in the Node 24 LTS line and pnpm 11.25.0:

```sh
pnpm install
pnpm dev:exchange
```

Open [the dashboard](http://localhost:4100/) and [the overlay](http://127.0.0.1:4100/overlay). No credentials or `.env` are required. Demo mode currently identifies the no-credentials foundation; simulated market scenarios arrive in later sprints.

For the built client:

```sh
pnpm build
pnpm start:exchange
```

Keep the terminal running while using the app. Stop the development process before starting production on the same port.

Use **Test local connection** on the dashboard to verify a guarded action, a saved setting and a live SSE update. Successful checks survive restart. Local SQLite data lives in `apps/emote-exchange/data/emote-exchange.sqlite` by default; `DATA_DIR` overrides it, with relative paths resolved from the app directory. Data is git-ignored.

## OBS

Add a Browser Source at `http://127.0.0.1:4100/overlay`, width 1920, height 1080. The page background is transparent. Keep shutdown-when-hidden and refresh-on-activation off. The current overlay is a foundation label; market widgets arrive in E4.

## Twitch sign-in

Follow [the setup guide](../../docs/setup-guide.md) to register one confidential Twitch app. Copy `.env.example` to `.env` and keep secrets local. Restart, click **Connect Twitch** under Broadcaster, then sign in and approve the permissions. Connected accounts are validated and restored after restart. **Connect bot** is optional; each account has a Disconnect button.

After broadcaster login, the incoming-events panel should show **EventSub connected** and five **enabled** subscriptions. Type in your channel’s Twitch chat and check that **Live events** and **Chat messages** increase. The browser receives counts and fixed connection status; incoming chat text stays server-side. Counters reset on app restart. The header and overlay show **Twitch connected** when authorized; without credentials they show **Demo mode**. Market widgets and simulated scenarios are still pending.

EventSub recovers from lost connections with backoff and recreates subscriptions. Twitch reconnect handoffs retain subscriptions without creating duplicates. Missed events during a lost connection cannot be replayed. For a local Twitch CLI mock, override both `EVENTSUB_WS_URL` and `EVENTSUB_SUBSCRIPTIONS_URL` as shown in [K3](../../docs/sprints/sprint-1-twitch-kit.md). Overrides accept only the official Twitch endpoints or explicit HTTP/WS loopback mock destinations.

## Chat output

Under **Test your chat connection**, click **Send test message** to post exactly “Emote Exchange connected” to your channel. The app selects the bot role when connected, otherwise the broadcaster. The **Sent and dropped** log records the outcome; HTTP acceptance alone does not count as a sent message. This is an explicit live action, separate from previews and simulator controls.

**Preview without sending** adds the same text to **Would have said**, even while Twitch is connected. All simulated output takes that path. Without a broadcaster connection, live sending is disabled and app output stays local. **Quiet mode** pauses live sending and discards waiting live messages; its setting survives app restart. A request already delivered to Twitch cannot be recalled.

The queue sends at most once per second and 18 times in any rolling 30 seconds, counting retry attempts too. Replies precede ambient output. Pending output expires after 30 seconds, duplicate text collapses, and diagnostics retain the latest 100 entries. Logs and counters reset on app restart; queued messages are not replayed. Twitch drop codes use a fixed safe vocabulary; unknown codes show `twitch_dropped`, never arbitrary provider error text. Incoming chat text is never added to this log.

## Emote catalog

**Your channel, in emotes** lists channel and global counts for Twitch, 7TV, BTTV and FFZ, with sample images. The total counts unique case-sensitive names after precedence: channel before global, then Twitch, 7TV, BTTV and FFZ. Bundled demo names are available alongside provider sets. Twitch emote fragments remain authoritative, including emotes absent from the catalog.

Provider requests run in the background at startup and every 30 minutes. **Refresh emotes** requests an immediate update, useful after changing a channel set. **Cached** means a request failed and the last good set is still usable. **No channel set** covers an unconfigured provider or a 7TV profile without an active set. An empty configured set correctly shows zero. Channel caches are scoped to the connected broadcaster and are cleared when switching to another broadcaster; global caches remain reusable.

All 24 original SVG demo emotes load from `client/public/demo-emotes/` before any request. Names match the filename without `.svg`, for example `DemoBull` and `DemoMoon`. With no keys and no network, these assets remain sufficient for upcoming simulator scenarios; optional public globals cannot delay startup. The simulator itself arrives in K6.

To use your own 7TV emotes, sign in to 7TV with the connected Twitch account, add emotes to a set assigned to that channel, then refresh our catalog. Uploading new artwork is separate from adding existing emotes to a channel set. The live K5 check observed the channel emote `BOB` after this setup.

## Checks and troubleshooting

```sh
pnpm check
pnpm lint
pnpm test
pnpm build
pnpm smoke
```

- Port busy: stop the other Emote Exchange process, or set matching `PORT` and `PUBLIC_ORIGIN` in `.env`.
- Unsupported Node: use Node 24.12+ within major 24; native TypeScript needs no `tsx`.
- Production client missing: run `pnpm build` first.
- Overlay looks empty: the foundation label is at the bottom; the remaining canvas is transparent.
- Connection interrupted: the dashboard reports SSE reconnecting. Restart the local server if needed.
- Development: client edits update through Vite HMR; restart the command after server edits.
- Runtime mismatch: `pnpm install` provisions the project-local Node 24 runtime; check it with `pnpm exec node --version`.

Architecture and behavior: [Twitch Kit spec](../../docs/specs/twitch-kit.md), [Exchange spec](../../docs/specs/emote-exchange.md), [ADRs](../../docs/adr/), [sprints](../../docs/sprints/README.md).
