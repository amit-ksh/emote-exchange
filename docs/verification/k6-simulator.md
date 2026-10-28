# K6 simulator verification

Completed October 28, 2026. Scope: pure seeded event generation, runtime controls, app-supplied input profiles, offline demo behavior and SIM labels. No dependency was added.

## Automated checks

`pnpm check`, `pnpm lint`, `pnpm test`, `pnpm build` and `pnpm smoke` passed. The suite has 81 tests: 68 in Twitch Kit and 13 in the app.

- `same seed and logical clock reproduce IDs, timestamps and events across different tick schedules`: identical normalized events under fine and uneven timer cadence; unique event IDs, `sim_` names and stable colors.
- `configured chat rates hold from 0.2 to 50 messages per second and catch-up batches stay bounded`: exact 60-second chat totals at 0.2, 1, 7.5 and 50/s. Follow events remain additional to the chat rate. Each tick processes at most 250 scheduled message slots rather than allocating an unbounded catch-up list.
- `every normalized event kind retains simulation provenance, and stop prevents later events`: chat, follow, raid, online/offline, deletion, user/chat clearing and connection changes carry deterministic IDs, scheduled time and `origin: sim`. Commands and emote parts normalize correctly. Stopped generators do not emit from ticks or injection requests.
- `invalid settings fail without changing state and repeated runs have distinct delivery identities`: bounded inputs, immutable prior state and a new run ordinal. The app persists that ordinal separately from transient simulator state.
- `real simulator follow, raid and bell events never send live chat through the app's notice handler`: generated events traverse the real app notice handler and chat-out queue with connected auth and stubbed Helix; the fetch count stays zero and every diagnostic is Would have said with SIM origin.
- `Exchange scenarios supply input patterns and fixed bundled emotes without claiming market results`: Free play plus the six product profiles are registered as data/functions; no platform plugin registry or market behavior is introduced.
- `the full Soak input profile keeps 500 chatters and 24 emotes at 50 messages per second for 40 virtual minutes`: 120,000 chat messages, exactly 500 chatter IDs and 24 emote keys, followed by automatic completion. This verifies input generation, not a completed market performance soak.
- `guarded simulator controls drive demo counters, previews and SIM state without raw chat`: all action routes require Host/Origin/X-CTA, invalid rates/viewer counts are rejected, a duplicate active start is rejected, Stop freezes counts, and manual follow/raid/bells produce local previews. Raw chatter/message objects are absent from the public packet.
- Production smoke starts the built app without credentials, starts a scenario, observes the counter rising, injects follow/raid/close events, verifies previews and stops the run. Existing assets, persisted actions, SSE and HTTP guard checks still pass.

The generator is pure and touches no clock, randomness, store or network. Its state holds the seeded RNG; the runtime supplies time and executes callbacks. Replay uses the same seed, settings, logical epoch and initial run ordinal. Absolute timestamps intentionally align with the injected runtime epoch, while run ordinals prevent independent starts from sharing event identities.

## Offline browser walkthrough

Created an isolated copy of app source, built client, original public assets and setup guide, omitting `.env` and application data. A test-only module resolver reused the existing Twitch Kit installation. The copy used fresh storage and replaced outbound fetch with a rejection before startup. The real credential file was left untouched.

1. Dashboard showed Demo mode: simulated chat only, 24 available original emotes and a working local setup guide route.
2. Clicked Start demo with Opening day. The counter began at the start/online events and grew with chat; one observed run reached 620 events and 583 chat messages before Stop.
3. Clicked Fake follow, Fake raid, Open bell and Close bell. Each produced a SIM preview. The live send button stayed disabled and no live output appeared.
4. Stop removed the SIM labels and prevented later generation. Selected Soak; controls populated 50 messages/s and 500 chatters. An observed maximum-rate run produced 4,999 chat messages at 99,980 ms and was then stopped.
5. The dashboard had no horizontal overflow at 960 × 540. Full-size dashboard and samples were also inspected. An initial exact-label selector did not match the native select; the current DOM confirmed the accessible combobox and selecting by role worked.

## Mixed live/sim walkthrough

Restarted the production app at 4100 with saved auth. EventSub connected and all subscriptions remained enabled. Clicked Start simulator, Fake follow, Fake raid and Close bell. The header showed Twitch connected and SIM together. An observed snapshot contained 97 simulated chat messages, only SIM preview logs, zero sent logs and no live queue work. Server output contained no chat-send request. Stopped the generator afterward. Browser console diagnostics showed no errors or warnings.

## Overlay inspection

Viewed the actual offline `/overlay` with simulation running at exact 1920 × 1080 and 960 × 540 viewports. DOM geometry confirmed scale matrices 1 and 0.5 respectively, transparent page background and no horizontal overflow. The SIM badge remained visible at the top left; the foundation label remained at the bottom left. Stop removed the badge through SSE. Rechecked screenshot dimensions after discovering a newly created tab had started at the browser's default viewport; the saved final overlay images use the requested dimensions.

Local screenshots and isolated acceptance helpers are git-ignored under `artifacts/k6/`. These are browser checks; actual OBS remains a later manual gate. K7 final setup/checklist work and Sprint 2 market rules, fixture seeding and full overlay remain pending. Diagnostic bell notices are explicitly previews until the market engine supplies its own effects.
