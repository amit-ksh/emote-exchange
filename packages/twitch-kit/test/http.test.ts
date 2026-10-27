import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import test from "node:test";
import { createHttpApp } from "../src/index.ts";

const port = 4100;
const snapshot = { v: 1, seq: 0, label: "Foundation" };

test("health reports a running local server", async () => {
  const app = createHttpApp({ port, getSnapshot: () => snapshot });
  const response = await app.request("http://localhost:4100/healthz", {
    headers: { Host: "localhost:4100" },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test("every route rejects missing or unrelated Host values", async () => {
  const app = createHttpApp({ port, getSnapshot: () => snapshot });
  for (const path of ["/healthz", "/api/snapshot", "/events", "/", "/assets/missing.js"]) {
    for (const host of [undefined, "example.com:4100", "localhost:4101", "localhost.evil:4100"]) {
      const response = await app.request(`http://localhost:4100${path}`, {
        headers: host ? { Host: host } : {},
      });
      assert.equal(response.status, 403, `${path} with Host ${host}`);
    }
  }
  const response = await app.request("http://127.0.0.1:4100/healthz", {
    headers: { Host: "127.0.0.1:4100" },
  });
  assert.equal(response.status, 200);
});

test("mutations require an exact loopback Origin and X-CTA for every method", async () => {
  const app = createHttpApp({ port, getSnapshot: () => snapshot });
  app.on(["POST", "PUT", "PATCH", "DELETE"], "/api/check", (context) =>
    context.json({ accepted: true }),
  );
  const rejectedHeaders: Record<string, string>[] = [
    {},
    { Origin: "null", "X-CTA": "1" },
    { Origin: "http://example.com", "X-CTA": "1" },
    { Origin: "http://localhost:4101", "X-CTA": "1" },
    { Origin: "http://localhost:4100" },
    { Origin: "http://localhost:4100", "X-CTA": "0" },
  ];
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    for (const extraHeaders of rejectedHeaders) {
      const response = await app.request("http://localhost:4100/api/check", {
        method,
        headers: { Host: "localhost:4100", ...extraHeaders },
      });
      assert.equal(response.status, 403);
      assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
    }
    for (const origin of ["http://localhost:4100", "http://127.0.0.1:4100"]) {
      const response = await app.request("http://localhost:4100/api/check", {
        method,
        headers: { Host: "localhost:4100", Origin: origin, "X-CTA": "1" },
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
    }
  }
  const preflight = await app.request("http://localhost:4100/api/check", {
    method: "OPTIONS",
    headers: { Host: "localhost:4100", Origin: "http://example.com" },
  });
  assert.equal(preflight.status, 403);
  assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), null);
});

test("snapshot exposes the supplied display projection without caching or CORS", async () => {
  const app = createHttpApp({ port, getSnapshot: () => snapshot });
  const response = await app.request("http://localhost:4100/api/snapshot", {
    headers: { Host: "localhost:4100" },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), snapshot);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
});

test("SSE starts with a snapshot and abort closes the stream and releases its listener", async () => {
  const app = createHttpApp({ port, getSnapshot: () => snapshot });
  const abort = new AbortController();
  const request = new Request("http://localhost:4100/events?client=overlay", {
    headers: { Host: "localhost:4100" },
    signal: abort.signal,
  });
  const originalListeners = getEventListeners(request.signal, "abort").length;
  const response = await app.request(request);
  assert.equal(response.headers.get("Content-Type"), "text/event-stream");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  assert.ok(response.body);
  const reader = response.body.getReader();
  const first = await reader.read();
  assert.equal(
    new TextDecoder().decode(first.value),
    `event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`,
  );
  abort.abort();
  assert.equal((await reader.read()).done, true);
  assert.equal(getEventListeners(request.signal, "abort").length, originalListeners);
});

test("guarded actions reject a body larger than 64 KiB", async () => {
  const app = createHttpApp({ port, getSnapshot: () => snapshot });
  app.post("/api/check", async (context) => {
    await context.req.text();
    return context.json({ accepted: true });
  });
  const response = await app.request("http://localhost:4100/api/check", {
    method: "POST",
    headers: { Host: "localhost:4100", Origin: "http://localhost:4100", "X-CTA": "1" },
    body: "x".repeat(65_537),
  });
  assert.equal(response.status, 413);
});
