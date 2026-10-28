import type { AnalyticsDisplay } from "./engine/analytics.ts";

export function createAnalyticsFeed(options: {
  now: () => number;
  snapshot: () => AnalyticsDisplay;
  autoTick?: boolean;
}) {
  const encoder = new TextEncoder();
  const clients = new Set<{
    controller: ReadableStreamDefaultController<Uint8Array>;
    at: number;
    cleanup: () => void;
  }>();
  let timer: ReturnType<typeof setInterval> | undefined;
  let sequence = 0;
  let closed = false;
  function remove(client: typeof clients extends Set<infer T> ? T : never, finish: boolean) {
    if (!clients.delete(client)) return;
    client.cleanup();
    if (finish) client.controller.close();
    if (!clients.size && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  }
  function frame() {
    return encoder.encode(
      `event: analytics\ndata: ${JSON.stringify({ ...options.snapshot(), seq: ++sequence })}\n\n`,
    );
  }
  function tick() {
    if (closed || !clients.size) return;
    const now = options.now();
    const ready = [...clients].filter((client) => now - client.at >= 1000);
    if (!ready.length) return;
    const chunk = frame();
    for (const client of ready) {
      if (chunk.byteLength > (client.controller.desiredSize ?? 0)) {
        remove(client, true);
        continue;
      }
      client.controller.enqueue(chunk);
      client.at = now;
    }
  }
  return {
    tick,
    connect(signal: AbortSignal) {
      let client: Parameters<typeof remove>[0] | undefined;
      return new ReadableStream<Uint8Array>(
        {
          start(controller) {
            if (closed || signal.aborted) {
              controller.close();
              return;
            }
            const abort = () => {
              if (client) remove(client, true);
            };
            client = {
              controller,
              at: options.now(),
              cleanup: () => signal.removeEventListener("abort", abort),
            };
            clients.add(client);
            signal.addEventListener("abort", abort, { once: true });
            const chunk = frame();
            if (chunk.byteLength > 262_144) {
              remove(client, true);
              return;
            }
            controller.enqueue(chunk);
            if (!timer && options.autoTick !== false) {
              timer = setInterval(tick, 1000);
              timer.unref();
            }
          },
          cancel() {
            if (client) remove(client, false);
          },
        },
        { highWaterMark: 262_144, size: (chunk) => chunk.byteLength },
      );
    },
    close() {
      closed = true;
      for (const client of [...clients]) remove(client, true);
    },
  };
}
