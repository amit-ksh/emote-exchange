import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { CatalogEmote } from "../src/emotes/providers.ts";
import { buildCatalog, parseProvider } from "../src/emotes/providers.ts";

const fixture = (provider: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/emotes-${provider}.json`, import.meta.url), "utf8"));
test("provider response fixtures produce named images, animated flags and provider keys", () => {
  const twitch = parseProvider("twitch", "global", fixture("twitch"));
  assert.deepEqual(twitch[0], {
    provider: "twitch",
    scope: "global",
    key: "twitch:196892",
    name: "TwitchUnity",
    imageUrl: "https://static-cdn.jtvnw.net/emoticons/v2/196892/static/dark/3.0",
    animated: false,
  });
  const seven = parseProvider("7tv", "global", fixture("7tv"));
  assert.equal(seven.length, 2);
  assert.ok(seven[0].imageUrl.endsWith("/2x.webp"));
  assert.ok(seven[0].imageUrl.startsWith("https://cdn.7tv.app/"));
  assert.equal(seven[1].animated, true);
  const bttv = parseProvider("bttv", "global", fixture("bttv"));
  assert.equal(bttv[0].imageUrl, "https://cdn.betterttv.net/emote/54fa8f1401e468494b85b537/2x");
  const ffz = parseProvider("ffz", "global", fixture("ffz"));
  assert.equal(ffz[0].key, "ffz:9");
  assert.equal(ffz[0].imageUrl, "https://cdn.betterttv.net/frankerfacez_emote/9/4");
});
test("channel wrappers preserve 7TV aliases and merge BTTV channel/shared emotes", () => {
  const seven = fixture("7tv");
  seven.emotes[0].name = "ChannelAlias";
  assert.equal(parseProvider("7tv", "channel", { emote_set: seven })[0].name, "ChannelAlias");
  const bttv = fixture("bttv");
  assert.equal(
    parseProvider("bttv", "channel", { channelEmotes: [bttv[0]], sharedEmotes: [bttv[1]] }).length,
    2,
  );
  assert.deepEqual(parseProvider("7tv", "channel", { emote_set: null }), []);
  assert.deepEqual(parseProvider("twitch", "channel", { data: [] }), []);
  assert.throws(() => parseProvider("7tv", "global", { error: "provider body" }), /catalog/);
});
test("channel beats global, then Twitch, 7TV, BTTV and FFZ; matching is case sensitive", () => {
  const entries: CatalogEmote[] = [];
  for (const scope of ["global", "channel"] as const)
    for (const provider of ["ffz", "bttv", "7tv", "twitch"] as const)
      entries.push({
        provider,
        scope,
        key: `${provider}:${scope}`,
        name: "Clash",
        imageUrl: "https://cdn.betterttv.net/emote/example/2x",
        animated: false,
      });
  let catalog = buildCatalog(entries);
  assert.equal(catalog.get("Clash")?.key, "twitch:channel");
  assert.equal(catalog.get("clash"), undefined);
  catalog = buildCatalog(entries.filter((entry) => entry.provider !== "twitch"));
  assert.equal(catalog.get("Clash")?.key, "7tv:channel");
  catalog = buildCatalog(
    entries.filter((entry) => entry.scope === "global" || entry.provider === "ffz"),
  );
  assert.equal(catalog.get("Clash")?.key, "ffz:channel");
});
test("malformed entries and hostile image URLs cannot become browser data", () => {
  const source = fixture("7tv");
  source.emotes[0].data.host.url = "//evil.example/private";
  source.emotes[1].name = "contains whitespace";
  assert.throws(() => parseProvider("7tv", "global", source), /catalog/);
  for (const bad of [null, {}, { data: "not-an-array" }])
    assert.throws(() => parseProvider("twitch", "global", bad), /catalog/);
});
