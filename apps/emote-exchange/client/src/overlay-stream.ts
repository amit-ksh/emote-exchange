import { useEffect, useRef, useState } from "react";
import type { MarketMoment } from "../../src/engine/market.ts";
import type { OverlayMarket } from "./overlay-model.ts";
import {
  advanceOverlayQueue,
  initialOverlayQueue,
  readOverlayMarket,
  readOverlayMoments,
  selectChart,
} from "./overlay-model.ts";

export function useOverlayStream() {
  const [market, setMarket] = useState<OverlayMarket | null>(null);
  const [queue, setQueue] = useState(initialOverlayQueue);
  const [selected, setSelected] = useState<{ ticker: string; at: number } | null>(null);
  const [sim, setSim] = useState(false);
  const [status, setStatus] = useState("connecting");
  const [now, setNow] = useState(Date.now);
  const [visible, setVisible] = useState(!document.hidden);
  const latest = useRef<OverlayMarket | null>(null);
  useEffect(() => {
    let lastSequence = -1;
    let streamReceived = false;
    let active = true;
    const pending = new Map<string, MarketMoment>();
    const abort = new AbortController();
    const flush = () => {
      if (!active || document.hidden || !latest.current) return;
      setMarket(latest.current);
      setSelected((old) => selectChart(old, latest.current?.listings ?? [], Date.now()));
    };
    const accept = (value: unknown, type: "snapshot" | "delta" | "fetch") => {
      if (!active || !value || typeof value !== "object") return;
      const row = value as Record<string, unknown>;
      if (
        row.v !== 1 ||
        !Number.isSafeInteger(row.seq) ||
        typeof row.simulatorRunning !== "boolean"
      )
        throw new Error();
      if (type === "fetch" && streamReceived) return;
      if (type === "delta" && (row.seq as number) <= lastSequence) return;
      const data = readOverlayMarket(row.market);
      if (!data) throw new Error();
      if (type === "snapshot" && (row.seq as number) < lastSequence)
        setQueue((old) => ({ ...initialOverlayQueue(), seen: old.seen }));
      lastSequence = row.seq as number;
      if (type !== "fetch") streamReceived = true;
      const first = latest.current === null;
      latest.current = data;
      setSim(row.simulatorRunning);
      setStatus("connected");
      for (const moment of [...data.feed, ...readOverlayMoments(row.moments)])
        pending.set(moment.id, moment);
      while (pending.size > 256) {
        const id = pending.keys().next().value;
        if (id !== undefined) pending.delete(id);
      }
      if (first) flush();
    };
    const events = new EventSource("/events?client=overlay");
    const receive = (event: MessageEvent<string>) => {
      try {
        accept(JSON.parse(event.data), event.type === "snapshot" ? "snapshot" : "delta");
      } catch {
        setStatus("reconnecting");
      }
    };
    events.addEventListener("snapshot", receive);
    events.addEventListener("delta", receive);
    events.onerror = () => setStatus("reconnecting");
    void fetch("/api/snapshot?client=overlay", { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        accept(await response.json(), "fetch");
      })
      .catch(() => {
        if (active && !streamReceived) setStatus("reconnecting");
      });
    const prices = window.setInterval(flush, 1000);
    const clock = window.setInterval(() => {
      if (document.hidden) return;
      const at = Date.now();
      setNow(at);
      const incoming = [...pending.values()];
      pending.clear();
      setQueue((old) => advanceOverlayQueue(old, incoming, at));
    }, 250);
    const visibility = () => {
      setVisible(!document.hidden);
      if (!document.hidden) flush();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      active = false;
      abort.abort();
      events.close();
      clearInterval(prices);
      clearInterval(clock);
      document.removeEventListener("visibilitychange", visibility);
      latest.current = null;
    };
  }, []);
  return { market, queue, selected, sim, status, now, visible };
}
