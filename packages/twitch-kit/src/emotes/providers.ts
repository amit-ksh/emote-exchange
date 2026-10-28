import type { Emote } from "../eventsub/normalize.ts";
import { record } from "../eventsub/protocol.ts";

export const providers = ["twitch", "7tv", "bttv", "ffz"] as const;
export type Provider = (typeof providers)[number];
export type Scope = "channel" | "global";
export interface CatalogEmote extends Emote {
  provider: Provider | "demo";
  scope: Scope | "demo";
}
export const validName = (value: unknown): value is string =>
  typeof value === "string" && /^[^\s<>\p{Cc}]{1,100}$/u.test(value);
function identifier(value: unknown): string | null {
  const id =
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? String(value) : value;
  return typeof id === "string" && /^[\w-]{1,128}$/.test(id) ? id : null;
}
export function imageUrl(provider: Provider, value: unknown): string | null {
  if (typeof value !== "string" || value.length > 1024) return null;
  try {
    const url = new URL(value.startsWith("//") ? `https:${value}` : value);
    const hosts =
      provider === "twitch"
        ? ["static-cdn.jtvnw.net"]
        : provider === "7tv"
          ? ["cdn.7tv.app", "cdn.7tv.io"]
          : provider === "bttv"
            ? ["cdn.betterttv.net"]
            : ["cdn.betterttv.net", "cdn.frankerfacez.com"];
    return url.protocol === "https:" &&
      hosts.includes(url.hostname) &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.hash &&
      !url.search
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function parseProvider(provider: Provider, scope: Scope, value: unknown): CatalogEmote[] {
  const body = record(value);
  let entries: unknown;
  if (provider === "twitch") entries = body.data;
  else if (provider === "7tv")
    entries =
      scope === "channel"
        ? body.emote_set === null
          ? []
          : record(body.emote_set).emotes
        : body.emotes;
  else if (provider === "bttv" && scope === "channel") {
    if (!Array.isArray(body.channelEmotes) || !Array.isArray(body.sharedEmotes))
      throw new Error("Invalid emote catalog.");
    entries = [...body.channelEmotes, ...body.sharedEmotes];
  } else entries = value;
  if (!Array.isArray(entries) || entries.length > 10_000) throw new Error("Invalid emote catalog.");
  const result = new Map<string, CatalogEmote>();
  for (const value of entries) {
    const entry = record(value);
    const id = identifier(entry.id);
    const name = provider === "7tv" || provider === "twitch" ? entry.name : entry.code;
    if (!id || !validName(name)) continue;
    let url: unknown;
    let animated = false;
    if (provider === "twitch") {
      animated = Array.isArray(entry.format) && entry.format.includes("animated");
      url = `https://static-cdn.jtvnw.net/emoticons/v2/${id}/${animated ? "animated" : "static"}/dark/3.0`;
    } else if (provider === "7tv") {
      const data = record(entry.data);
      const host = record(data.host);
      const files = Array.isArray(host.files) ? host.files.map(record) : [];
      const file = ["2x.webp", "4x.webp", "3x.webp", "1x.webp"]
        .map((name) => files.find((item) => item.name === name))
        .find(Boolean);
      animated = data.animated === true;
      if (file && typeof host.url === "string") url = `${host.url.replace(/\/$/, "")}/${file.name}`;
    } else if (provider === "bttv") {
      animated = entry.animated === true || entry.imageType === "gif";
      url = `https://cdn.betterttv.net/emote/${id}/2x`;
    } else {
      animated = entry.animated === true || entry.imageType === "gif";
      const images = record(entry.images);
      url = images["4x"] ?? images["2x"] ?? images["1x"];
    }
    const safeUrl = imageUrl(provider, url);
    if (safeUrl) {
      const key = `${provider}:${id}`;
      if (!result.has(key))
        result.set(key, { provider, scope, key, name, imageUrl: safeUrl, animated });
    }
  }
  if (entries.length && !result.size) throw new Error("Invalid emote catalog.");
  return [...result.values()];
}
export function buildCatalog(entries: readonly CatalogEmote[]): Map<string, CatalogEmote> {
  const providerRank = ["twitch", "7tv", "bttv", "ffz", "demo"];
  const scopeRank = ["channel", "global", "demo"];
  const sorted = entries
    .slice()
    .sort(
      (a, b) =>
        scopeRank.indexOf(a.scope) - scopeRank.indexOf(b.scope) ||
        providerRank.indexOf(a.provider) - providerRank.indexOf(b.provider) ||
        a.key.localeCompare(b.key),
    );
  const result = new Map<string, CatalogEmote>();
  for (const entry of sorted) if (!result.has(entry.name)) result.set(entry.name, { ...entry });
  return result;
}
