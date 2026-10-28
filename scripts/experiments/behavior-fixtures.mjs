// Numerical feasibility experiment only. This is not the product engine.
// Fixtures and thresholds are fixed by spec 5.10; no network, clock or RNG is used.
import { pathToFileURL } from "node:url";

export const defaults = {
  IPO_PRICE: 100,
  HEAT_HALF_LIFE: 90,
  QUIET_HEAT: 0.5,
  ELASTICITY: 0.75,
  PRICE_TAU: 20,
  IMPACT_PER_100: 0.02,
  IMPACT_HALF_LIFE: 30,
};
const rounded = (value) => Math.round(value * 100) / 100;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function simulate(names, duration, usesAt, constants) {
  const listings = Object.fromEntries(names.map((name) => [name, { heat: 2, base: 100 }]));
  const uses = new Map();
  const samples = [];
  for (let second = 0; second <= duration; second++) {
    // All recorded incoming events precede this second's tick. t=0 has dt=0.
    for (const [name, chatter] of usesAt(second)) {
      const key = `${name}:${chatter}`;
      const recent = (uses.get(key) ?? []).filter((at) => second - at < 30);
      listings[name].heat += 0.5 ** recent.length;
      recent.push(second);
      uses.set(key, recent);
    }
    const dt = second === 0 ? 0 : 1;
    for (const listing of Object.values(listings))
      listing.heat *= 2 ** (-dt / constants.HEAT_HALF_LIFE);
    const total = Object.values(listings).reduce((sum, listing) => sum + listing.heat, 0);
    if (total >= constants.QUIET_HEAT) {
      for (const listing of Object.values(listings)) {
        const ratio = clamp((listing.heat / total) * Math.max(names.length, 4), 0.1, 10);
        const target = constants.IPO_PRICE * ratio ** constants.ELASTICITY;
        listing.base += (target - listing.base) * (1 - Math.exp(-dt / constants.PRICE_TAU));
      }
    }
    samples.push(
      Object.fromEntries(names.map((name) => [name, rounded(Math.max(1, listings[name].base))])),
    );
  }
  return samples;
}

export function evaluateFixtures(constants = defaults) {
  const names = ["A", "B", "C", "D"];
  const b1Uses = (second) => {
    const events = [];
    if (second < 60 && second % 5 === 0)
      for (let chatter = 0; chatter < 10; chatter++) events.push(["A", `sim_group_${chatter}`]);
    if (second <= 60 && second % 15 === 0)
      for (const name of ["B", "C", "D"]) events.push([name, `sim_${name}_${second}`]);
    if (second >= 65 && second % 5 === 0)
      for (const name of ["B", "C", "D"]) events.push([name, `sim_${name}_${second}`]);
    return events;
  };
  const b1 = simulate(names, 360, b1Uses, constants);
  const b2 = simulate(
    names,
    30,
    (second) => [
      ...(second < 30 ? [["A", "sim_solo"]] : []),
      ...(second === 0 ? [0, 1, 2].map((i) => ["B", `sim_distinct_${i}`]) : []),
    ],
    constants,
  );
  const b5 = simulate(
    ["A", "B", "C"],
    150,
    (second) =>
      second % 5 === 0
        ? [
            ["B", "sim_always_b"],
            ["C", "sim_always_c"],
            [second < 60 ? "A" : second < 120 ? "B" : "C", "sim_switcher"],
          ]
        : [],
    constants,
  );
  const aPeak = Math.max(...b1.slice(0, 61).map((sample) => sample.A));
  const soloPeak = Math.max(...b2.map((sample) => sample.A));
  const impact = clamp((constants.IMPACT_PER_100 * 5000) / 100, -0.5, 1);
  const immediate = rounded(100 * (1 + impact));
  const after30 = rounded(100 * (1 + impact * 2 ** (-30 / constants.IMPACT_HALF_LIFE)));
  const gains = {
    A: b5[30].A / b5[0].A - 1,
    B: b5[90].B / b5[59].B - 1,
    C: b5[150].C / b5[119].C - 1,
  };
  return {
    constants,
    fixtures: [
      { id: "B1", passed: b1[60].A >= 180, measured: { A60: b1[60].A }, target: "A60 >= 180" },
      {
        id: "B2",
        passed: b2[30].B > b2[30].A && soloPeak <= 125,
        measured: { A30: b2[30].A, B30: b2[30].B, APeak: soloPeak },
        target: "B increase > A increase; A peak <= 125",
      },
      {
        id: "B3",
        passed: b1[360].A <= aPeak * 0.6,
        measured: { APeak0to60: aPeak, A360: b1[360].A, decline: 1 - b1[360].A / aPeak },
        target: "A360 <= 0.6 * APeak0to60",
      },
      {
        id: "B4",
        passed: immediate <= 200 && Math.abs(after30 - 100 - (immediate - 100) / 2) <= 0.01 + 1e-10,
        measured: { impact, immediate, after30 },
        target: "immediate <= 200; excess halves within 0.01 after 30 seconds",
      },
      {
        id: "B5",
        passed: Object.values(gains).every((gain) => gain >= 0.15),
        measured: {
          A0: b5[0].A,
          A30: b5[30].A,
          B59: b5[59].B,
          B90: b5[90].B,
          C119: b5[119].C,
          C150: b5[150].C,
          gains,
        },
        target: "A30/A0, B90/B59 and C150/C119 >= 1.15",
      },
    ],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = evaluateFixtures();
  console.log(JSON.stringify(result, null, 2));
  if (result.fixtures.some((fixture) => !fixture.passed)) process.exitCode = 1;
}
