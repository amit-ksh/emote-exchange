import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";
import { createTwitchAuth } from "../src/auth.ts";
import { openStore } from "../src/store/index.ts";

const origin = "https://exchange.example";
const scopes = ["user:read:chat", "user:write:chat", "moderator:read:followers"];

test("hosted OAuth rejects another broadcaster before saving tokens and creates a secure owner session", async (t) => {
  const store = openStore({ filename: ":memory:" });
  let login = "stranger";
  let now = 1000;
  const auth = createTwitchAuth({
    store,
    clientId: "client",
    clientSecret: "private-secret",
    publicOrigin: origin,
    ownerLogin: "ammit_ksh",
    now: () => now,
    fetcher: async (input) =>
      Response.json(
        String(input).endsWith("/validate")
          ? { client_id: "client", user_id: "123", login, scopes, expires_in: 7200 }
          : { access_token: "private-access", refresh_token: "private-refresh" },
      ),
  });
  t.after(() => {
    auth.close();
    store.close();
  });
  const app = new Hono();
  auth.mount(app);
  async function connect() {
    // The reverse proxy terminates TLS; the internal request URL is HTTP.
    const start = await app.request("http://exchange.example/auth/login");
    assert.equal(new URL(start.headers.get("location") ?? "").host, "id.twitch.tv");
    assert.match(start.headers.get("set-cookie") ?? "", /Secure/);
    const state = new URL(start.headers.get("location") ?? "").searchParams.get("state");
    const cookie = (start.headers.get("set-cookie") ?? "").split(";")[0];
    return app.request(`${origin}/auth/callback?state=${state}&code=private-code`, {
      headers: { Cookie: cookie },
    });
  }
  const rejected = await connect();
  assert.equal(rejected.headers.get("location"), "/?auth=failed");
  assert.equal(store.read("SELECT * FROM tokens").length, 0);
  assert.equal(auth.authorizeDashboard(undefined), false);
  login = "ammit_ksh";
  const accepted = await connect();
  assert.equal(accepted.headers.get("location"), "/?auth=connected");
  const session = accepted.headers
    .getSetCookie()
    .find((value) => value.startsWith("exchange_dashboard="));
  assert.ok(session);
  assert.match(session, /Secure/);
  assert.match(session, /HttpOnly/);
  assert.match(session, /SameSite=Lax/);
  const cookie = session.split(";")[0];
  assert.equal(auth.authorizeDashboard(cookie), true);
  assert.equal(auth.authorizeDashboard(`${cookie}x`), false);
  const signal = auth.dashboardSignal(cookie);
  assert.ok(signal);
  assert.equal(signal.aborted, false);
  assert.equal(JSON.stringify(auth.publicState()).includes("private"), false);
  now += 12 * 60 * 60 * 1000;
  assert.equal(auth.authorizeDashboard(cookie), false);
  assert.equal(signal.aborted, true);
});

test("hosted bot login requires an owner session", async (t) => {
  const store = openStore({ filename: ":memory:" });
  const auth = createTwitchAuth({
    store,
    clientId: "client",
    clientSecret: "secret",
    publicOrigin: origin,
    ownerLogin: "ammit_ksh",
  });
  t.after(() => {
    auth.close();
    store.close();
  });
  const app = new Hono();
  auth.mount(app);
  assert.equal((await app.request(`${origin}/auth/login?role=bot`)).status, 403);
});
