import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceOverlayQueue,
  initialOverlayQueue,
  overlayOptions,
  priceLabel,
  readableChatColor,
  readOverlayMarket,
  selectChart,
} from "../client/src/overlay-model.ts";
import type { MarketMoment } from "../src/engine/market.ts";
import { marketProjection } from "../src/market-display.ts";
import { market } from "./market-fixture.ts";

test("Trader colors retain 4.5 contrast on the redesigned glass over white footage", () => {
  const luminance = (rgb: number[]) =>
    rgb.reduce((sum, channel, index) => {
      const value = channel / 255;
      return (
        sum +
        (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) *
          [0.2126, 0.7152, 0.0722][index]
      );
    }, 0);
  // rgba(34,34,34,.88) over white rounds to RGB 61,61,61.
  const background = luminance([61, 61, 61]);
  for (const original of [
    "#a3a3a3",
    "#000000",
    "#ff0000",
    "#00ff00",
    "#0000ff",
    "#ffffff",
    "invalid",
  ]) {
    const result = readableChatColor(original);
    const rgb = [1, 3, 5].map((index) => Number.parseInt(result.slice(index, index + 2), 16));
    assert.ok((luminance(rgb) + 0.05) / (background + 0.05) >= 4.5, original);
  }
  assert.equal(readableChatColor("#ffffff"), "#ffffff");
});

test("Tape Price labels stay within six monospace characters at compact rounding boundaries", () => {
  for (const value of [1, 999.99, 1000, 9999.99, 99_999.99, 999_999.99, 999_999_999.99, 1e12]) {
    assert.ok(priceLabel(value).length <= 6, `${value}: ${priceLabel(value)}`);
  }
  assert.equal(priceLabel(1.5), "1.50");
});

test("overlay reads only approved display fields and URL controls preserve a reduced-motion path", () => {
  const display = marketProjection(market());
  assert.deepEqual(
    readOverlayMarket({ ...display, rawChat: "private chat", accessToken: "private token" }),
    display,
  );
  assert.equal(
    readOverlayMarket({
      ...display,
      listings: [{ ...display.listings[0], imageUrl: "https://attacker.invalid/private.svg" }],
    }),
    null,
  );
  assert.equal(
    readOverlayMarket({ ...display, listings: [{ ...display.listings[0], price: Number.NaN }] }),
    null,
  );
  assert.equal(readOverlayMarket({ ...display, traders: [{ userId: "a", coins: -1 }] }), null);
  const options = overlayOptions(
    "?widgets=chart,board,cards,unknown&motion=reduced&sound=off",
    false,
  );
  assert.deepEqual([...options.widgets], ["chart", "board"]);
  assert.equal(options.reduced, true);
  assert.equal(overlayOptions("", true).reduced, true);
  assert.equal(overlayOptions("", false).widgets.size, 5);
  assert.equal(overlayOptions("?widgets=", false).widgets.size, 0);
});

test("overlay moment queues coalesce bound prioritize and expire without replaying duplicate IDs", () => {
  const event = (id: string, kind: MarketMoment["kind"], ticker = id, at = 0): MarketMoment => ({
    id,
    kind,
    ticker,
    at,
    origin: "sim",
  });
  let state = advanceOverlayQueue(initialOverlayQueue(), [event("bell", "BELL")], 0);
  assert.equal(state.active?.moment.id, "bell");
  state = advanceOverlayQueue(
    state,
    Array.from({ length: 40 }, (_, i) => event(`ipo-${i}`, "IPO")),
    1,
  );
  assert.equal(state.pending.length, 32);
  assert.equal(
    state.pending.some((row) => row.id === "ipo-0"),
    false,
  );
  state = advanceOverlayQueue(
    state,
    [event("raid", "RAID"), event("halt", "HALT", "X"), event("halt-latest", "HALT", "X")],
    2,
  );
  assert.equal(state.pending.length, 32);
  assert.equal(state.pending.filter((row) => row.kind === "HALT").length, 1);
  assert.equal(state.pending.find((row) => row.kind === "HALT")?.id, "halt-latest");
  state = advanceOverlayQueue(state, [], 4000);
  assert.equal(state.active?.moment.id, "raid");
  state = advanceOverlayQueue(state, [event("raid", "RAID")], 8000);
  assert.equal(state.active?.moment.id, "halt-latest");
  assert.equal(state.feed.length, 0, "eight-second toasts expire at the boundary");
  const expired = advanceOverlayQueue(state, [], 40_000);
  assert.equal(expired.active, null);
  assert.equal(expired.pending.length, 0);
  assert.equal(expired.feed.length, 0);
});

test("Chart selects the hottest Listing at most once per twenty seconds", () => {
  const first = { ...marketProjection(market()).listings[0], ticker: "A", heat: 2 };
  const second = { ...first, ticker: "B", heat: 1 };
  const chosen = selectChart(null, [first, second], 0);
  assert.equal(chosen?.ticker, "A");
  assert.equal(
    selectChart(
      chosen,
      [
        { ...first, heat: 1 },
        { ...second, heat: 5 },
      ],
      19_999,
    )?.ticker,
    "A",
  );
  assert.equal(
    selectChart(
      chosen,
      [
        { ...first, heat: 1 },
        { ...second, heat: 5 },
      ],
      20_000,
    )?.ticker,
    "B",
  );
  assert.equal(
    selectChart(chosen, [second], 10_000)?.ticker,
    "A",
    "Delist cannot cause early chart switching",
  );
  assert.equal(selectChart(chosen, [], 20_000), null);
});
