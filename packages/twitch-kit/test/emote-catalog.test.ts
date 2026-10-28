import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createEmoteCatalog, loadDemoCatalog } from "../src/emotes/catalog.ts";
import { normalizeEvent } from "../src/eventsub/normalize.ts";
import { openStore } from "../src/store/index.ts";

const demoDirectory = new URL(
  "../../../apps/emote-exchange/client/public/demo-emotes/",
  import.meta.url,
);
const data = (provider: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/emotes-${provider}.json`, import.meta.url), "utf8"));
const demo = () => loadDemoCatalog(demoDirectory);
test("manual refresh does not postpone the scheduled 30-minute refresh", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const f = fixture();
  t.after(f.close);
  const catalog = createEmoteCatalog({ ...f.options, autoRefresh: true });
  t.after(() => catalog.close());
  catalog.start();
  await catalog.refresh();
  assert.equal(f.calls(), 8);
  f.advance(1_200_000);
  await catalog.refresh();
  assert.equal(f.calls(), 16);
  f.advance(600_000);
  t.mock.timers.tick(1_800_000);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.calls(), 24);
});
test("a linked 7TV profile with no active emote set reports setup needed", async (t) => {
  const f = fixture();
  t.after(f.close);
  const catalog = createEmoteCatalog({
    ...f.options,
    fetcher: async (url, init) =>
      String(url).includes("7tv.io/v3/users/")
        ? Response.json({ emote_set: null })
        : f.options.fetcher(url, init),
  });
  t.after(() => catalog.close());
  await catalog.refresh();
  const channel = catalog
    .publicState()
    .sources.find((source) => source.provider === "7tv" && source.scope === "channel");
  assert.equal(channel?.status, "not-configured");
  assert.equal(channel?.count, 0);
});
function fixture() {
  const store = openStore({ filename: ":memory:" });
  let now = 1000;
  let identity: string | undefined = "100";
  let fail = false;
  let calls = 0;
  const fetcher: typeof fetch = async (url) => {
    calls++;
    if (fail) throw new Error("private provider failure");
    const address = String(url);
    const provider = address.includes("7tv.io")
      ? "7tv"
      : address.includes("frankerfacez")
        ? "ffz"
        : "bttv";
    const body = data(provider);
    return Response.json(
      address.includes("users/")
        ? provider === "7tv"
          ? { emote_set: body }
          : provider === "bttv"
            ? { channelEmotes: [body[0]], sharedEmotes: [body[1]] }
            : body
        : body,
    );
  };
  const options = {
    store,
    demo: demo(),
    auth: { identity: () => identity },
    now: () => now,
    autoRefresh: false,
    fetcher,
    helix: {
      request: async () => {
        calls++;
        if (fail) throw new Error("private token");
        return Response.json(data("twitch"));
      },
      close: () => {},
    },
  };
  const catalog = createEmoteCatalog(options);
  return {
    store,
    catalog,
    options,
    fail: () => {
      fail = true;
    },
    advance: (ms: number) => {
      now += ms;
    },
    calls: () => calls,
    setIdentity: (id: string | undefined) => {
      identity = id;
      catalog.syncAuth();
    },
    close: () => {
      catalog.close();
      store.close();
    },
  };
}
test("all 24 original demo assets are immediately available with every network request failing", async (t) => {
  const f = fixture();
  t.after(f.close);
  f.fail();
  assert.equal(f.catalog.publicState().demoCount, 24);
  assert.equal(f.catalog.publicState().ready, true);
  assert.equal(f.calls(), 0);
  await f.catalog.refresh();
  for (const emote of demo()) {
    assert.deepEqual(f.catalog.lookup(emote.name), emote);
    assert.ok(readFileSync(new URL(`${emote.name}.svg`, demoDirectory), "utf8").includes("<svg"));
  }
  assert.equal(f.catalog.publicState().total, 24);
  assert.equal(JSON.stringify(f.catalog.publicState()).includes("private"), false);
});
test("last good sets persist, failed refresh restores cached data, and 30-minute scheduling bounds calls", async (t) => {
  const f = fixture();
  t.after(f.close);
  await f.catalog.refresh();
  assert.equal(f.calls(), 8);
  assert.equal(f.catalog.lookup("TwitchUnity")?.scope, "channel");
  assert.ok(f.catalog.publicState().sources.every((source) => source.status === "ready"));
  await f.catalog.refresh(false);
  assert.equal(f.calls(), 8);
  f.advance(1_800_000);
  await f.catalog.refresh(false);
  assert.equal(f.calls(), 16);
  f.catalog.close();
  f.fail();
  const restored = createEmoteCatalog(f.options);
  t.after(() => restored.close());
  assert.ok(restored.lookup("TwitchUnity"));
  await restored.refresh();
  assert.ok(restored.publicState().sources.every((source) => source.status === "cached"));
  assert.equal(restored.lookup("reckH")?.provider, "7tv");
  const message = JSON.parse(
    readFileSync(new URL("./fixtures/eventsub.json", import.meta.url), "utf8"),
  );
  message.payload.event.message = { text: "reckH", fragments: [{ type: "text", text: "reckH" }] };
  const event = normalizeEvent(message, {
    broadcasterId: "100",
    lookupEmote: (word) => restored.lookup(word),
  });
  assert.ok(
    event?.type === "ChatMessage" &&
      event.parts[0].type === "emote" &&
      event.parts[0].key.startsWith("7tv:"),
  );
});

test("late channel responses cannot restore another account's catalog after disconnect or close", async (t) => {
  const f = fixture();
  t.after(f.close);
  const responses: (() => void)[] = [];
  const catalog = createEmoteCatalog({
    ...f.options,
    fetcher: async (url, init) => {
      if (!String(url).includes("users/")) return f.options.fetcher(url, init);
      return new Promise<Response>((resolve) =>
        responses.push(() => {
          void f.options.fetcher(url, init).then(resolve);
        }),
      );
    },
  });
  const refreshing = catalog.refresh();
  f.options.auth.identity = () => undefined;
  catalog.syncAuth();
  catalog.close();
  for (const resolve of responses) resolve();
  await refreshing;
  assert.equal(f.store.read("SELECT key FROM emote_cache WHERE scope LIKE 'channel:%'").length, 0);
  assert.equal(
    catalog
      .publicState()
      .sources.filter((source) => source.scope === "channel")
      .every((source) => source.count === 0),
    true,
  );
});
test("channel cache never leaks across accounts and no-keys startup makes no authenticated requests", async (t) => {
  const f = fixture();
  t.after(f.close);
  await f.catalog.refresh();
  f.setIdentity("200");
  assert.equal(f.catalog.lookup("TwitchUnity")?.scope, "global");
  assert.ok(
    f.catalog
      .publicState()
      .sources.filter((source) => source.scope === "channel")
      .every((source) => source.count === 0),
  );
  f.setIdentity(undefined);
  const before = f.calls();
  await f.catalog.refresh();
  assert.equal(f.calls() - before, 3);
  assert.ok(
    f.catalog
      .publicState()
      .sources.filter((source) => source.scope === "channel")
      .every((source) => source.status === "needs-auth"),
  );
});
test("empty successful sets replace old rows and 404 reports no channel set without inventing data", async (t) => {
  const f = fixture();
  t.after(f.close);
  await f.catalog.refresh();
  f.catalog.close();
  const empty = createEmoteCatalog({
    ...f.options,
    fetcher: async () => new Response(null, { status: 404 }),
    helix: { request: async () => Response.json({ data: [] }), close: () => {} },
  });
  t.after(() => empty.close());
  await empty.refresh();
  assert.equal(empty.lookup("TwitchUnity"), undefined);
  assert.ok(
    empty
      .publicState()
      .sources.filter((source) => source.provider === "twitch")
      .every((source) => source.count === 0 && source.status === "ready"),
  );
  assert.ok(
    empty
      .publicState()
      .sources.filter((source) => source.provider === "7tv")
      .every((source) => source.status === "cached" && source.httpStatus === 404),
  );
});
