import assert from "node:assert/strict";
import test from "node:test";
import { createOverlayBus } from "../src/bus.ts";

test("client counts distinguish overlays and clean up abort, cancel, slow clients and shutdown", async () => {
  const clock = fakeClock();
  const changes: number[] = [];
  const bus = createOverlayBus({
    initial: { text: "" },
    ...clock,
    maxPendingBytes: 350,
    onClientsChange: (): void => {
      changes.push(bus.clientCounts().overlay);
    },
  });
  assert.deepEqual(bus.clientCounts(), { dashboard: 0, overlay: 0 });
  const aborted = new AbortController();
  aborted.abort();
  bus.connect(aborted.signal, "overlay");
  assert.equal(changes.length, 0);
  const dashboard = bus.connect(new AbortController().signal, "dashboard").getReader();
  const abort = new AbortController();
  const overlay = bus.connect(abort.signal, "overlay").getReader();
  await dashboard.read();
  await overlay.read();
  assert.deepEqual(bus.clientCounts(), { dashboard: 1, overlay: 1 });
  abort.abort();
  assert.equal(bus.clientCounts().overlay, 0);
  const slow = bus.connect(new AbortController().signal, "overlay").getReader();
  await slow.read();
  for (let i = 0; i < 2; i++) {
    bus.publish({ text: "🙂".repeat(60) });
    clock.advance(100);
    await dashboard.read();
  }
  assert.equal(bus.clientCounts().overlay, 0);
  await slow.cancel();
  await dashboard.cancel();
  assert.deepEqual(bus.clientCounts(), { dashboard: 0, overlay: 0 });
  const remaining = bus.connect(new AbortController().signal, "overlay").getReader();
  await remaining.read();
  bus.close();
  assert.deepEqual(bus.clientCounts(), { dashboard: 0, overlay: 0 });
  assert.ok(changes.includes(1) && changes.includes(0));
});

test("closing the bus releases pending work and prevents new connections or publications", async () => {
  const clock = fakeClock();
  const bus = createOverlayBus({ initial: { value: 1 }, ...clock });
  const reader = bus.connect(new AbortController().signal).getReader();
  await reader.read();
  bus.publish({ value: 2 }, [{ id: "check:1", at: 0 }]);
  assert.ok(clock.pending() > 0);
  bus.close();
  bus.close();
  assert.equal(clock.pending(), 0);
  assert.equal((await reader.read()).done, true);
  assert.throws(() => bus.publish({ value: 3 }), /closed/i);
  assert.equal((await bus.connect(new AbortController().signal).getReader().read()).done, true);
  assert.equal(clock.pending(), 0);
});

function fakeClock() {
  let current = 0;
  let nextId = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  return {
    now: () => current,
    schedule(callback: () => void, delayMs: number) {
      const id = nextId++;
      timers.set(id, { at: current + delayMs, callback });
      return () => {
        timers.delete(id);
      };
    },
    advance(ms: number) {
      const target = current + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.at <= target)
          .sort((left, right) => left[1].at - right[1].at)[0];
        if (!due) break;
        current = due[1].at;
        timers.delete(due[0]);
        due[1].callback();
      }
      current = target;
    },
    pending: () => timers.size,
  };
}

function event(chunk: Uint8Array | undefined) {
  const text = new TextDecoder().decode(chunk);
  const [name, data] = text.trim().split("\n");
  return { name, data: JSON.parse(data.replace(/^data: /, "")) };
}

test("overlay connections begin with the current versioned public snapshot", async () => {
  const clock = fakeClock();
  const bus = createOverlayBus({ initial: { label: "Ready" }, ...clock });
  const reader = bus.connect(new AbortController().signal).getReader();
  assert.deepEqual(event((await reader.read()).value), {
    name: "event: snapshot",
    data: { label: "Ready", v: 1, seq: 0, moments: [] },
  });
  assert.deepEqual(bus.snapshot(), { label: "Ready", v: 1, seq: 0, moments: [] });
  await reader.cancel();
  bus.close();
});

test("bursts coalesce to the latest complete projection at ten updates per second", {
  timeout: 1000,
}, async () => {
  const clock = fakeClock();
  const bus = createOverlayBus({ initial: { price: 100 }, ...clock });
  const reader = bus.connect(new AbortController().signal).getReader();
  await reader.read();
  let received = false;
  const next = reader.read().then((chunk) => {
    received = true;
    return event(chunk.value);
  });
  bus.publish({ price: 101 });
  bus.publish({ price: 102 });
  clock.advance(50);
  bus.publish({ price: 103 });
  clock.advance(49);
  await Promise.resolve();
  assert.equal(received, false);
  clock.advance(1);
  assert.deepEqual(await next, {
    name: "event: delta",
    data: { price: 103, v: 1, seq: 3, moments: [] },
  });
  bus.publish({ price: 104 });
  clock.advance(100);
  assert.equal(event((await reader.read()).value).data.seq, 4);
  await reader.cancel();
  bus.close();
});

test("coalescing retains still-current moments once per stable ID within the finite queue", async () => {
  const clock = fakeClock();
  const bus = createOverlayBus({ initial: { price: 100 }, momentLimit: 2, ...clock });
  const reader = bus.connect(new AbortController().signal).getReader();
  await reader.read();
  const first = { id: "trade:1", at: 0, kind: "trade", shares: 5 };
  const second = { id: "banner:1", at: 0, kind: "IPO" };
  bus.publish({ price: 101 }, [first]);
  bus.publish({ price: 102 }, [second, first]);
  clock.advance(100);
  assert.deepEqual(event((await reader.read()).value).data.moments, [first, second]);
  const third = { id: "trade:2", at: 100, kind: "trade", shares: 2 };
  bus.publish({ price: 103 }, [third]);
  assert.deepEqual(bus.snapshot().moments, [second, third]);
  await reader.cancel();
  bus.close();
});

test("moments expire while idle and a replacement delta clears them", {
  timeout: 1000,
}, async () => {
  const clock = fakeClock();
  const bus = createOverlayBus({ initial: { price: 100 }, momentTtlMs: 250, ...clock });
  const reader = bus.connect(new AbortController().signal).getReader();
  await reader.read();
  bus.publish({ price: 100 }, [{ id: "trade:1", at: 0, kind: "trade" }]);
  clock.advance(100);
  assert.equal(event((await reader.read()).value).data.moments.length, 1);
  clock.advance(149);
  assert.equal(bus.snapshot().moments.length, 1);
  clock.advance(1);
  assert.deepEqual(event((await reader.read()).value).data, {
    price: 100,
    v: 1,
    seq: 2,
    moments: [],
  });
  assert.deepEqual(bus.snapshot().moments, []);
  await reader.cancel();
  bus.close();
});

test("heartbeats repeat every fifteen seconds and abort releases pending client timers", {
  timeout: 1000,
}, async () => {
  const clock = fakeClock();
  const bus = createOverlayBus({ initial: { label: "Ready" }, ...clock });
  const abort = new AbortController();
  const reader = bus.connect(abort.signal).getReader();
  await reader.read();
  const ping = reader.read();
  clock.advance(15_000);
  assert.equal(new TextDecoder().decode((await ping).value), ": ping\n\n");
  const secondPing = reader.read();
  clock.advance(15_000);
  assert.equal(new TextDecoder().decode((await secondPing).value), ": ping\n\n");
  bus.publish({ label: "Updated" });
  assert.equal(clock.pending(), 2);
  abort.abort();
  assert.equal(clock.pending(), 0);
  assert.equal((await reader.read()).done, true);
  bus.publish({ label: "Still updated" });
  clock.advance(60_000);
  assert.equal(clock.pending(), 0);
  bus.close();
});

test("byte backpressure closes only the slow client and releases its timers", {
  timeout: 1000,
}, async () => {
  const clock = fakeClock();
  const bus = createOverlayBus({ initial: { text: "" }, maxPendingBytes: 350, ...clock });
  const slow = bus.connect(new AbortController().signal).getReader();
  const healthy = bus.connect(new AbortController().signal).getReader();
  await slow.read();
  await healthy.read();
  bus.publish({ text: "🙂".repeat(60) });
  clock.advance(100);
  assert.equal(event((await healthy.read()).value).data.seq, 1);
  bus.publish({ text: "🙂".repeat(60) });
  clock.advance(100);
  assert.equal(event((await healthy.read()).value).data.seq, 2);
  assert.equal(event((await slow.read()).value).data.seq, 1);
  assert.equal((await slow.read()).done, true);
  assert.equal(clock.pending(), 1, "only the healthy client's heartbeat remains");
  await healthy.cancel();
  assert.equal(clock.pending(), 0);
  bus.close();
});

test("public projections and moments are detached from callers and returned snapshots", () => {
  const clock = fakeClock();
  const initial = { detail: { count: 1 } };
  const bus = createOverlayBus({ initial, ...clock });
  initial.detail.count = 99;
  assert.equal(bus.snapshot().detail.count, 1);
  const next = { detail: { count: 2 } };
  const moment = { id: "trade:1", at: 0, shares: 5 };
  bus.publish(next, [moment]);
  next.detail.count = 100;
  moment.shares = 100;
  const snapshot = bus.snapshot();
  snapshot.detail.count = 999;
  assert.equal(bus.snapshot().detail.count, 2);
  assert.equal(bus.snapshot().moments[0].shares, 5);
  bus.close();
});

test("invalid JSON projections, moment identities and limits are rejected without changing state", () => {
  const clock = fakeClock();
  for (const invalid of [
    { momentLimit: 0 },
    { momentLimit: 1.5 },
    { momentTtlMs: -1 },
    { maxPendingBytes: 0 },
    { maxPendingBytes: 1_048_577 },
  ]) {
    assert.throws(
      () => createOverlayBus({ initial: { value: 1 }, ...clock, ...invalid }),
      RangeError,
    );
  }
  const bus = createOverlayBus<{ value: unknown }>({ initial: { value: 1 }, ...clock });
  for (const value of [undefined, Number.NaN, Infinity, () => "x", Symbol("x"), 1n]) {
    assert.throws(() => bus.publish({ value }), TypeError);
    assert.deepEqual(bus.snapshot(), { value: 1, v: 1, seq: 0, moments: [] });
  }
  for (const invalid of [
    { id: "", at: 0 },
    { id: "x", at: Number.NaN },
    { id: "x", at: 1 },
  ]) {
    assert.throws(() => bus.publish({ value: 2 }, [invalid]), /moment/i);
    assert.deepEqual(bus.snapshot(), { value: 1, v: 1, seq: 0, moments: [] });
  }
  bus.close();
});
