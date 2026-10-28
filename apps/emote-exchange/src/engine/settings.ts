export interface MarketSettings {
  STREAM_RESTART_GAP: number;
  GREETING_BASE: number;
  GREETING_STREAK_STEP: number;
  GREETING_STREAK_CAP: number;
  STARTING_COINS: number;
  IPO_MIN_CHATTERS: number;
  IPO_WINDOW_MS: number;
  IPO_PRICE: number;
  MAX_LISTINGS: number;
  HEAT_HALF_LIFE: number;
  QUIET_HEAT: number;
  ELASTICITY: number;
  PRICE_TAU: number;
  IMPACT_PER_100: number;
  IMPACT_HALF_LIFE: number;
  FEE: number;
  TRADE_COOLDOWN_MS: number;
  STIPEND_COINS: number;
  FOLLOW_COINS: number;
  RAID_VISA_COINS: number;
  RAID_WINDOW_MS: number;
}
export const defaultMarketSettings: Readonly<MarketSettings> = Object.freeze({
  STREAM_RESTART_GAP: 7_200_000,
  GREETING_BASE: 50,
  GREETING_STREAK_STEP: 10,
  GREETING_STREAK_CAP: 10,
  STARTING_COINS: 1000,
  IPO_MIN_CHATTERS: 2,
  IPO_WINDOW_MS: 600_000,
  IPO_PRICE: 100,
  MAX_LISTINGS: 24,
  HEAT_HALF_LIFE: 90,
  QUIET_HEAT: 0.5,
  ELASTICITY: 0.75,
  PRICE_TAU: 20,
  IMPACT_PER_100: 0.02,
  IMPACT_HALF_LIFE: 30,
  FEE: 0.01,
  TRADE_COOLDOWN_MS: 3000,
  STIPEND_COINS: 10,
  FOLLOW_COINS: 200,
  RAID_VISA_COINS: 500,
  RAID_WINDOW_MS: 300_000,
});
const ranges: Record<keyof MarketSettings, readonly [number, number, boolean]> = {
  STREAM_RESTART_GAP: [7_200_000, 7_200_000, true],
  GREETING_BASE: [0, 1_000_000, true],
  GREETING_STREAK_STEP: [0, 1_000_000, true],
  GREETING_STREAK_CAP: [1, 1000, true],
  STARTING_COINS: [0, 1_000_000_000, true],
  IPO_MIN_CHATTERS: [2, 100, true],
  IPO_WINDOW_MS: [1000, 600_000, true],
  IPO_PRICE: [1, 1_000_000, false],
  MAX_LISTINGS: [1, 24, true],
  HEAT_HALF_LIFE: [1, 3600, false],
  QUIET_HEAT: [0.000001, 1000, false],
  ELASTICITY: [0.1, 2, false],
  PRICE_TAU: [0.1, 3600, false],
  IMPACT_PER_100: [0, 1, false],
  IMPACT_HALF_LIFE: [1, 3600, false],
  FEE: [0, 0.1, false],
  TRADE_COOLDOWN_MS: [0, 60_000, true],
  STIPEND_COINS: [0, 1_000_000_000, true],
  FOLLOW_COINS: [0, 1_000_000_000, true],
  RAID_VISA_COINS: [0, 1_000_000_000, true],
  RAID_WINDOW_MS: [300_000, 300_000, true],
};
export function marketSettings(overrides: unknown = {}): Readonly<MarketSettings> {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides))
    throw new Error("Invalid market settings.");
  const result = { ...defaultMarketSettings };
  for (const [key, value] of Object.entries(overrides)) {
    if (!Object.hasOwn(ranges, key)) throw new Error("Unknown market settings.");
    const name = key as keyof MarketSettings;
    const [min, max, integer] = ranges[name];
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < min ||
      value > max ||
      (integer && !Number.isSafeInteger(value))
    )
      throw new Error("Invalid market settings.");
    if (name === "IPO_PRICE" && Math.abs(value * 100 - Math.round(value * 100)) > 1e-6)
      throw new Error("Invalid market settings Price precision.");
    if (name === "FEE" && Math.abs(value * 10_000 - Math.round(value * 10_000)) > 1e-8)
      throw new Error("Invalid market settings Fee precision.");
    result[name] = value;
  }
  return Object.freeze(result);
}
