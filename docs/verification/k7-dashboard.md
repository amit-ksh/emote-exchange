# K7 dashboard verification

Completed October 28, 2026. No dependency added. The platform panels and setup checklist are implemented; market rules and the full product dashboard/overlay remain Sprint 2 work.

## Behavior

- Setup checklist: Connect Twitch follows broadcaster auth; Overlay connected follows active `client=overlay` SSE streams; Go live completes only after a normalized Twitch StreamOnline event. StreamOffline clears it. Simulated bells cannot alter the Twitch stream status.
- Stream status starts unknown and returns to unknown after an EventSub gap or account change. Connecting auth is not evidence that the stream is live. Starting the app during an already-running stream leaves the step waiting until the next stream event; the UI explains this limitation.
- Overlay connection means a browser receives updates, including an ordinary preview tab. It cannot identify OBS. Counts are transient, clear on disconnect and start at zero after restart.
- Overlay URL uses 127.0.0.1 and the configured port. Copy has a readable manual fallback; the panel includes dimensions, transparency, both OBS lifecycle settings and conditional audio guidance from the setup guide.
- Existing ConnectionPanel/EventSub, SimulatorPanel and ChatOutPanel retain guarded actions and explicit public projections. Checklist status announcements include the completed-step count. Disconnected dashboards show Waiting until a current SSE snapshot arrives.

## Automated checks

`pnpm check`, `pnpm lint`, `pnpm test`, `pnpm build` and `pnpm smoke` passed. There are 84 tests: 70 in Twitch Kit and 14 in the app.

- `client counts distinguish overlays and clean up abort, cancel, slow clients and shutdown`: dashboard streams do not count as overlays; pre-aborted connections do not register; cleanup handles abort, cancel, backpressure and shutdown.
- `stream status uses Twitch bells, stays unknown at connection and resets after gaps or auth changes`: only channel-matching normalized events update status; both bell directions and reset behavior are checked.
- `overlay checklist counts only overlay SSE clients and reconnects with a fresh snapshot`: multiple overlays, HEAD, invalid client kinds, reconnect, fresh process sequence and simulated-bell isolation are checked through HTTP.
- The new app test exposed Hono's HEAD-to-GET handling: registering a HEAD route alone still allowed an SSE connection. An `/events` middleware now returns HEAD metadata before the stream handler, preserving Host guards and preventing phantom clients.
- Production smoke opens a real HTTP overlay SSE stream, checks its initial snapshot and public count, cancels it and verifies the count returns to zero. HEAD and unknown-client checks also pass, alongside existing simulator, persistence, guard and asset checks.

## Browser checks

Used an isolated app copy without `.env`, fresh storage and outbound fetch blocked on 4113. The real credential file was untouched. Demo showed all four panels, Start demo increased counts, and opening/closing the actual overlay ticked/cleared the checklist. Copy URL returned `http://127.0.0.1:4113/overlay` in the clipboard. A browser focus timeout during a copy retry was recovered by observing the current state and closing the temporary overlay tab before retrying; the final click copied the expected URL.

Viewed the actual demo overlay at 1920 × 1080 and 960 × 540 with simulation running. DOM geometry confirmed scale matrices 1 and 0.5, transparent backgrounds and no overflow. Dashboard checks at 960 and 320 CSS pixels found no horizontal overflow. Keyboard Tab showed a visible focus ring, and Space operated Quiet mode. Native controls and the accessibility tree exposed names, roles and states. An actual screen reader, 200% browser zoom and a full automated accessibility audit were not run.

Stopped the isolated server while leaving its dashboard open: the UI showed Reconnecting and cleared checklist completion. Restarted on the same port with fresh storage. Without refreshing, the dashboard returned to Receiving local updates and replaced the old run's 370 events / 350 chats with zero. This exercises accepting a fresh snapshot even when its sequence is lower after restart.

On the real app at 4100, both saved roles restored, EventSub connected with all subscriptions enabled, and the catalog showed 439 names including three channel 7TV entries. The auth step completed; a preview overlay completed the second step. Running simulation and clicking Open bell left Go live waiting. Chat preview stayed in Would have said, Sent and dropped remained empty, and keyboard Quiet mode toggled on and back off. No live test message was sent in K7. Browser console inspection found no warnings or errors.

Saved local screenshots under git-ignored `artifacts/k7/`, including full/half demo overlay and the final setup checklist. Temporary tabs were closed and viewport overrides reset. The live app remains running with simulator stopped and Quiet mode restored off. Actual OBS and a real Twitch stream-online/offline walkthrough are pending; protocol behavior is verified with fixtures, not claimed as a live broadcast check.
