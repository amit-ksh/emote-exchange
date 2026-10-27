# Server-Sent Events push state to overlays; actions go over plain HTTP

Overlays and dashboards receive live state over SSE (`GET /events`: a snapshot on connect, then deltas) and send actions as `POST /api/*`. Overlays only ever listen, so SSE fits: it's plain HTTP, Hono supports it, the browser's `EventSource` reconnects on its own inside OBS, and the server needs no WebSocket dependency.

## Considered options

- **A WebSocket server:** two-way, which we don't need, plus an extra dependency.
- **Polling:** laggy, and wasteful at the update rates the Exchange tape needs.
