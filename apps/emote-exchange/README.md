# Emote Exchange

A local play-money emote market for Twitch, displayed through an OBS browser source. K1–K7 and E1–E3 are verified. [E3](../../docs/verification/e3-runtime-and-recovery.md) connects real/simulated events and one-second ticks to the market, persists settlement/checkpoints atomically, restores after restart and queues command replies. Automated checks and a real Twitch buy from `amit1541` pass, including the persisted Holding and Twitch-acknowledged bot reply. The complete on-screen market remains E4/E5 in [the implementation plan](../../docs/implementation-plan.md).

## Run the foundation

From the repository root with Node 24.12+ in the Node 24 LTS line and pnpm 11.25.0:

```sh
pnpm install
pnpm dev:exchange
```

Open [the dashboard](http://localhost:4100/) and [the overlay](http://127.0.0.1:4100/overlay). No credentials or `.env` are required. Click **Start demo** to drive the market with simulated chat and channel events. Market data is available in `/api/snapshot`; market widgets arrive in E4/E5.

For the built client:

```sh
pnpm build
pnpm start:exchange
```

Keep the terminal running while using the app. Stop the development process before starting production on the same port.

Use **Test local connection** on the dashboard to verify a guarded action, a saved setting and a live SSE update. Successful checks survive restart. Local SQLite data lives in `apps/emote-exchange/data/emote-exchange.sqlite` by default; `DATA_DIR` overrides it, with relative paths resolved from the app directory. Data is git-ignored.

## OBS

Add a Browser Source at `http://127.0.0.1:4100/overlay`, width 1920, height 1080. The page background is transparent. Keep shutdown-when-hidden and refresh-on-activation off. The current overlay is a foundation label with a SIM badge while simulation runs; market widgets arrive in E4.

## Setup checklist

The dashboard groups the connection, overlay URL, simulator and chat-output panels under an automatic checklist. **Connect Twitch** completes when broadcaster auth is connected. **Overlay connected** completes when at least one overlay browser receives SSE updates, including a normal preview tab; this does not prove OBS is configured. Closing the last overlay clears it.

**Go live** completes after Twitch reports `stream.online` and clears after `stream.offline`. It starts unknown after app startup, an account change or an EventSub gap, until another stream event arrives. Starting the app during an already-running stream may leave it waiting. Simulated bells never tick this live step. Without a current local connection, checklist steps wait until a fresh snapshot arrives; reconnects recover automatically, including after server restart.

Use **Copy URL** in the overlay panel and paste into an OBS Browser source. Keep **Shutdown source when not visible** and **Refresh browser when scene becomes active** off. Enable **Control audio via OBS** when testing implemented sound cues. Check placement over bright and dark scenes at full and half scale.

## Twitch sign-in

Follow [the setup guide](../../docs/setup-guide.md) to register one confidential Twitch app. Copy `.env.example` to `.env` and keep secrets local. Restart, click **Connect Twitch** under Broadcaster, then sign in and approve the permissions. Connected accounts are validated and restored after restart. **Connect bot** is optional; each account has a Disconnect button.

After broadcaster login, the incoming-events panel should show **EventSub connected** and five **enabled** subscriptions. Type in your channel’s Twitch chat and check that **Live events** and **Chat messages** increase. The browser receives counts and fixed connection status; incoming chat text stays server-side. Counters reset on app restart. The header and overlay show **Twitch connected** when authorized; without credentials they show **Demo mode**. The simulator works in either mode; market widgets are still pending.

EventSub recovers from lost connections with backoff and recreates subscriptions. Twitch reconnect handoffs retain subscriptions without creating duplicates. Missed events during a lost connection cannot be replayed. For a local Twitch CLI mock, override both `EVENTSUB_WS_URL` and `EVENTSUB_SUBSCRIPTIONS_URL` as shown in [K3](../../docs/sprints/sprint-1-twitch-kit.md). Overrides accept only the official Twitch endpoints or explicit HTTP/WS loopback mock destinations.

## Chat output

Under **Test your chat connection**, click **Send test message** to post exactly “Emote Exchange connected” to your channel. The app selects the bot role when connected, otherwise the broadcaster. The **Sent and dropped** log records the outcome; HTTP acceptance alone does not count as a sent message. This is an explicit live action, separate from previews and simulator controls.

**Preview without sending** adds the same text to **Would have said**, even while Twitch is connected. All simulated output takes that path. Without a broadcaster connection, live sending is disabled and app output stays local. **Quiet mode** pauses live sending and discards waiting live messages; its setting survives app restart. A request already delivered to Twitch cannot be recalled.

The queue sends at most once per second and 18 times in any rolling 30 seconds, counting retry attempts too. Replies precede ambient output. Pending output expires after 30 seconds, duplicate text collapses, and diagnostics retain the latest 100 entries. Logs and counters reset on app restart; queued messages are not replayed. Twitch drop codes use a fixed safe vocabulary; unknown codes show `twitch_dropped`, never arbitrary provider error text. Incoming chat text is never added to this log.

## Emote catalog

**Your channel, in emotes** lists channel and global counts for Twitch, 7TV, BTTV and FFZ, with sample images. The total counts unique case-sensitive names after precedence: channel before global, then Twitch, 7TV, BTTV and FFZ. Bundled demo names are available alongside provider sets. Twitch emote fragments remain authoritative, including emotes absent from the catalog.

Provider requests run in the background at startup and every 30 minutes. **Refresh emotes** requests an immediate update, useful after changing a channel set. **Cached** means a request failed and the last good set is still usable. **No channel set** covers an unconfigured provider or a 7TV profile without an active set. An empty configured set correctly shows zero. Channel caches are scoped to the connected broadcaster and are cleared when switching to another broadcaster; global caches remain reusable.

All 24 original SVG demo emotes load from `client/public/demo-emotes/` before any request. Names match the filename without `.svg`, for example `DemoBull` and `DemoMoon`. With no keys and no network, these assets support every simulator preset; optional public globals cannot delay startup.

To use your own 7TV emotes, sign in to 7TV with the connected Twitch account, add emotes to a set assigned to that channel, then refresh our catalog. Uploading new artwork is separate from adding existing emotes to a channel set. The live K5 check observed the channel emote `BOB` after this setup.

## Simulator and demo mode

In **Give it a dry run**, choose a scenario, seed, message rate (0.2–50 per second), chatter count (1–500) and persona weights, then click **Start demo** or **Start simulator**. The simulated counter climbs independently of the live EventSub counter. **Stop simulator** stops generation. Stop before changing settings. Persona weights are relative; scripted presets reserve some message slots for their own commands and emote patterns. Follow and raid generators add channel events alongside the configured chat-message rate.

While running, use **Fake follow**, **Fake raid**, **Open bell** and **Close bell** to inject simulated market events. Raid viewers must be 1–10,000. Follows/Raids update rewards and moments; Close bell produces the Session Summary under **Would have said**, including while Twitch is connected. Simulation never uses the live sender. Dashboard and overlay show **SIM** while the generator runs; Stop clears the badge.

Free play plus Opening day, Pump and dump, Solo spammer, Raid wave, Quiet market and Soak are available. They now drive Prices, IPOs, balances and fills in `/api/snapshot` and queued reply previews. E6 still owns each scenario's full market story and runtime soak verification. Solo spammer includes three initial B uses before its steady schedule. Soak uses a fixed 500-chatter/24-emote pool for 40 virtual minutes, including a ten-minute warm-up.

For repeatable tests, use the same seed, settings, logical start time and run ordinal. Events use scheduled timestamps rather than timer arrival times. Persisted run ordinals prevent event-ID collisions across separate starts or app restarts. Settings, counters and simulator state remain server-side; the browser receives summaries rather than chat messages. Runs stay stopped after app restart.

Without `.env`, the banner reads **Demo mode: simulated chat only**. The linked setup guide is served locally at `/setup-guide`; no internet is needed to read it or run the bundled demo.

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
