import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";
import { createTwitchAuth } from "../src/auth.ts";
import { openStore } from "../src/store/index.ts";

const origin = "http://localhost:4100";
function must(value: string | null) {
  assert.ok(value);
  return value;
}
function fixture(
  fetcher: typeof fetch = async () => {
    throw new Error("Unexpected network call");
  },
) {
  const store = openStore({ filename: ":memory:" });
  let now = 1_000;
  const auth = createTwitchAuth({
    store,
    clientId: "test-client",
    clientSecret: "test-secret",
    publicOrigin: origin,
    fetcher,
    now: () => now,
  });
  const app = new Hono();
  auth.mount(app);
  return {
    store,
    auth,
    app,
    advance: (ms: number) => {
      now += ms;
    },
    close: () => {
      auth.close();
      store.close();
    },
  };
}
async function login(app: Hono, role = "broadcaster") {
  const response = await app.request(`${origin}/auth/login?role=${role}`);
  return {
    response,
    cookie: must(response.headers.get("set-cookie")).split(";")[0],
    state: must(new URL(must(response.headers.get("location"))).searchParams.get("state")),
  };
}

test("OAuth login canonicalizes host and binds single-use expiring state to the initiating browser", async (t) => {
  const f = fixture();
  t.after(f.close);
  const canonical = await f.app.request("http://127.0.0.1:4100/auth/login?role=bot");
  assert.equal(canonical.headers.get("location"), `${origin}/auth/login?role=bot`);
  assert.equal(canonical.headers.get("set-cookie"), null);
  const attempt = await login(f.app, "bot");
  const url = new URL(must(attempt.response.headers.get("location")));
  assert.equal(url.origin, "https://id.twitch.tv");
  assert.equal(url.searchParams.get("client_id"), "test-client");
  assert.equal(url.searchParams.get("redirect_uri"), `${origin}/auth/callback`);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("force_verify"), "true");
  assert.equal(url.searchParams.get("scope"), "user:write:chat");
  assert.match(must(attempt.response.headers.get("set-cookie")), /HttpOnly/);
  assert.match(must(attempt.response.headers.get("set-cookie")), /SameSite=Lax/);
  for (const headers of [
    {},
    { Cookie: "exchange_oauth=wrong" },
    { Cookie: attempt.cookie },
  ] as Record<string, string>[]) {
    const rejected = await f.app.request(
      `${origin}/auth/callback?code=private-code&state=${attempt.state}`,
      { headers },
    );
    assert.equal(rejected.headers.get("location"), "/?auth=failed");
    assert.equal((await rejected.text()).includes("private-code"), false);
  }
  const expired = await login(f.app);
  f.advance(600_001);
  assert.equal(
    (
      await f.app.request(`${origin}/auth/callback?code=x&state=${expired.state}`, {
        headers: { Cookie: expired.cookie },
      })
    ).headers.get("location"),
    "/?auth=failed",
  );
});

const granted = ["user:read:chat", "user:write:chat", "moderator:read:followers"];
const json = (value: unknown, status = 200) => Response.json(value, { status });
test("maintenance validates hourly, refreshes near expiry and clears an invalid grant", async (t) => {
  let validations = 0;
  let exchanges = 0;
  let invalid = false;
  const f = fixture(async (input) => {
    if (String(input).endsWith("/validate")) {
      validations++;
      return json({
        client_id: "test-client",
        user_id: "123",
        login: "streamer",
        scopes: granted,
        expires_in: 7200,
      });
    }
    exchanges++;
    return invalid
      ? json({ error: "invalid_grant", message: "private-provider-body" }, 400)
      : json({ access_token: "private-access", refresh_token: "private-refresh" });
  });
  t.after(f.close);
  const attempt = await login(f.app);
  await f.app.request(`${origin}/auth/callback?code=x&state=${attempt.state}`, {
    headers: { Cookie: attempt.cookie },
  });
  await f.auth.maintenance();
  assert.equal(validations, 1);
  f.advance(3_600_001);
  await f.auth.maintenance();
  assert.equal(validations, 2);
  f.advance(6_900_001);
  await f.auth.maintenance();
  assert.equal(exchanges, 2);
  invalid = true;
  f.advance(6_900_001);
  await f.auth.maintenance();
  assert.equal(f.auth.publicState().broadcaster.reconnect, true);
  assert.equal(f.store.read("SELECT * FROM tokens").length, 0);
  assert.equal(JSON.stringify(f.auth.publicState()).includes("private"), false);
});
test("refresh is shared and disconnect prevents an in-flight refresh restoring the account", async (t) => {
  let refreshCalls = 0;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const f = fixture(async (input, init) => {
    if (String(input).endsWith("/validate"))
      return json({
        client_id: "test-client",
        user_id: "123",
        login: "streamer",
        scopes: granted,
        expires_in: 3600,
      });
    if (String(input).endsWith("/revoke")) return new Response(null);
    if (String(init?.body).includes("refresh_token")) {
      refreshCalls++;
      await gate;
    }
    return json({ access_token: "private-access", refresh_token: "private-refresh" });
  });
  t.after(f.close);
  const attempt = await login(f.app);
  await f.app.request(`${origin}/auth/callback?code=x&state=${attempt.state}`, {
    headers: { Cookie: attempt.cookie },
  });
  const first = f.auth.refresh("broadcaster");
  const second = f.auth.refresh("broadcaster");
  assert.equal(first, second);
  await f.auth.disconnect("broadcaster");
  assert.ok(release);
  release();
  await assert.rejects(first);
  assert.equal(refreshCalls, 1);
  assert.equal(f.auth.publicState().broadcaster.connected, false);
  assert.equal(f.store.read("SELECT * FROM tokens").length, 0);
});

test("denial, mismatched client or missing scopes never save an account", async (t) => {
  for (const validation of [
    { client_id: "other-client", scopes: granted },
    { client_id: "test-client", scopes: [] },
  ]) {
    const f = fixture(async (input) =>
      String(input).endsWith("/validate")
        ? json({ ...validation, user_id: "123", login: "streamer", expires_in: 3600 })
        : json({ access_token: "private-access", refresh_token: "private-refresh" }),
    );
    t.after(f.close);
    const denied = await login(f.app);
    const callback = `${origin}/auth/callback?state=${denied.state}`;
    await f.app.request(`${callback}&error=access_denied`, { headers: { Cookie: denied.cookie } });
    assert.equal(
      (
        await f.app.request(`${callback}&code=x`, { headers: { Cookie: denied.cookie } })
      ).headers.get("location"),
      "/?auth=failed",
    );
    const attempt = await login(f.app);
    assert.equal(
      (
        await f.app.request(`${origin}/auth/callback?code=x&state=${attempt.state}`, {
          headers: { Cookie: attempt.cookie },
        })
      ).headers.get("location"),
      "/?auth=failed",
    );
    assert.equal(f.store.read("SELECT * FROM tokens").length, 0);
  }
});
test("successful OAuth validates client and scopes, persists privately, rejects replay and restores login", async (t) => {
  const f = fixture(async (input) =>
    String(input).endsWith("/validate")
      ? json({
          client_id: "test-client",
          user_id: "123",
          login: "test_streamer",
          scopes: granted,
          expires_in: 3600,
        })
      : json({ access_token: "private-access", refresh_token: "private-refresh" }),
  );
  t.after(f.close);
  const attempt = await login(f.app);
  const callback = `${origin}/auth/callback?code=private-code&state=${attempt.state}`;
  const response = await f.app.request(callback, { headers: { Cookie: attempt.cookie } });
  assert.equal(response.headers.get("location"), "/?auth=connected");
  assert.equal(f.auth.publicState().broadcaster.login, "test_streamer");
  assert.equal(
    f.store.read<{ access_token: string }>("SELECT access_token FROM tokens")[0].access_token,
    "private-access",
  );
  assert.equal(JSON.stringify(f.auth.publicState()).includes("private-"), false);
  assert.equal(
    (await f.app.request(callback, { headers: { Cookie: attempt.cookie } })).headers.get(
      "location",
    ),
    "/?auth=failed",
  );
  const restored = createTwitchAuth({
    store: f.store,
    clientId: "test-client",
    clientSecret: "test-secret",
    publicOrigin: origin,
    now: () => 1000,
    fetcher: async () =>
      json({
        client_id: "test-client",
        user_id: "123",
        login: "test_streamer",
        scopes: granted,
        expires_in: 3600,
      }),
  });
  await restored.initialize();
  assert.equal(restored.publicState().broadcaster.connected, true);
  restored.close();
});
