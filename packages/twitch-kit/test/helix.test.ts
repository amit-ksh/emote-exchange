import assert from "node:assert/strict";
import test from "node:test";
import { createHelix } from "../src/helix.ts";

test("concurrent Helix 401s share a refresh, retry once with the new token and log only method/path/status", async (t) => {
  let token = "secret-old";
  let refreshes = 0;
  const logs: unknown[] = [];
  const requests: string[] = [];
  const client = createHelix({
    clientId: "private-client",
    auth: {
      accessToken: () => token,
      refresh: async () => {
        refreshes++;
        await new Promise((r) => setImmediate(r));
        token = "secret-new";
      },
    },
    log: (entry) => logs.push(entry),
    fetcher: async (_url, init) => {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("Client-Id"), "private-client");
      assert.equal(init?.redirect, "error");
      assert.ok(init?.signal);
      requests.push(headers.get("Authorization") ?? "");
      return Response.json(
        { message: "private-provider-body" },
        { status: headers.get("Authorization") === "Bearer secret-old" ? 401 : 200 },
      );
    },
  });
  t.after(() => client.close());
  const results = await Promise.all([
    client.request({ role: "bot", path: "/chat/messages?ignored=secret-query", method: "POST" }),
    client.request({ role: "bot", path: "/chat/messages", method: "POST" }),
  ]);
  assert.ok(results.every((response) => response.status === 200));
  assert.equal(refreshes, 1);
  assert.equal(requests.length, 4);
  assert.deepEqual(logs[0], { method: "POST", path: "/helix/chat/messages", status: 401 });
  assert.equal(JSON.stringify(logs).includes("secret"), false);
  assert.equal(JSON.stringify(logs).includes("private"), false);
});
test("429 waits until reset and retries once; retries repeat the caller's send guard", async (t) => {
  let now = 1000;
  let attempts = 0;
  let guards = 0;
  const delays: number[] = [];
  const client = createHelix({
    clientId: "id",
    auth: { accessToken: () => "secret", refresh: async () => {} },
    now: () => now,
    log: () => {},
    wait: async (delay) => {
      delays.push(delay);
      now += delay;
    },
    fetcher: async () => {
      attempts++;
      return new Response(null, { status: 429, headers: { "Ratelimit-Reset": "3" } });
    },
  });
  t.after(() => client.close());
  const response = await client.request({
    role: "broadcaster",
    path: "/chat/messages",
    method: "POST",
    beforeAttempt: async () => {
      guards++;
      return true;
    },
  });
  assert.equal(response.status, 429);
  assert.deepEqual(delays, [2000]);
  assert.equal(attempts, 2);
  assert.equal(guards, 2);
});

test("429 already-reset buckets retry immediately, but requests keep their delivery deadline", async (t) => {
  let requests = 0;
  const delays: number[] = [];
  const client = createHelix({
    clientId: "id",
    auth: { accessToken: () => "secret", refresh: async () => {} },
    now: () => 5000,
    log: () => {},
    wait: async (ms) => {
      delays.push(ms);
    },
    fetcher: async () => {
      requests++;
      return new Response(null, {
        status: 429,
        headers: { "Ratelimit-Reset": requests <= 2 ? "4" : "60" },
      });
    },
  });
  t.after(() => client.close());
  assert.equal((await client.request({ role: "bot", path: "/chat/messages" })).status, 429);
  assert.equal(requests, 2);
  assert.deepEqual(delays, [0]);
  assert.equal(
    (await client.request({ role: "bot", path: "/chat/messages", deadline: 6000 })).status,
    429,
  );
  assert.equal(requests, 3);
  assert.deepEqual(delays, [0]);
});
test("abort and refused retry guards stop requests, and arbitrary bearer destinations are rejected", async (t) => {
  const abort = new AbortController();
  let requests = 0;
  const client = createHelix({
    clientId: "id",
    auth: { accessToken: () => "secret", refresh: async () => {} },
    log: () => {},
    fetcher: async () => {
      requests++;
      return new Response(null, { status: 401 });
    },
  });
  t.after(() => client.close());
  let guards = 0;
  await assert.rejects(
    client.request({
      role: "bot",
      path: "/chat/messages",
      beforeAttempt: async () => ++guards === 1,
    }),
    /canceled/,
  );
  assert.equal(requests, 1);
  abort.abort();
  await assert.rejects(
    client.request({ role: "bot", path: "/chat/messages", signal: abort.signal }),
    /canceled/,
  );
  for (const path of ["https://evil.example/steal", "//evil.example/steal", "/../oauth2/token"])
    await assert.rejects(client.request({ role: "bot", path }), /destination/);
  assert.equal(requests, 1);
});
