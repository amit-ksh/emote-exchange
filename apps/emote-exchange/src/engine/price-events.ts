import type { Cause } from "./accounts.ts";
import type { Listing, MarketMoment } from "./market.ts";

export function priceEvents(
  listing: Listing,
  now: number,
  moments: MarketMoment[],
  cause: Cause = { id: `price:${listing.ipoAt}:${now}`, origin: listing.lastOrigin },
) {
  const emit = (kind: "HALT" | "MOON" | "CRASH") =>
    moments.push({
      id: `${cause.id}:${kind}:${encodeURIComponent(listing.emote.name)}`,
      at: now,
      origin: cause.origin,
      kind,
      ticker: listing.emote.name,
      price: listing.price,
    });
  let reference: { at: number; price: number } | undefined;
  for (const point of listing.priceHistory) {
    if (point.at > now - 60_000) break;
    reference = point;
  }
  const cents = Math.round(listing.price * 100);
  const referenceCents = Math.round((reference?.price ?? 0) * 100);
  const sessionCents = Math.round(listing.sessionOpenPrice * 100);
  if (
    reference &&
    (listing.lastHaltAt === null || now - listing.lastHaltAt >= 300_000) &&
    (cents * 10 >= referenceCents * 16 || cents * 10 <= referenceCents * 6)
  ) {
    listing.lastHaltAt = now;
    listing.haltedUntil = now + 30_000;
    emit("HALT");
  }
  if (!listing.moonFired && cents * 2 >= sessionCents * 5) {
    listing.moonFired = true;
    emit("MOON");
  }
  if (!listing.crashFired && cents * 5 <= sessionCents * 2) {
    listing.crashFired = true;
    emit("CRASH");
  }
}
