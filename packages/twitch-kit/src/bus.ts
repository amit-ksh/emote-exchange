export interface PublicMoment {
  id: string;
  at: number;
  [key: string]: unknown;
}

export type PublicSnapshot<Display extends object> = Display & {
  v: 1;
  seq: number;
  moments: readonly PublicMoment[];
};

export interface OverlayBus<Display extends object> {
  snapshot(): PublicSnapshot<Display>;
  publish(display: Display, moments?: readonly PublicMoment[]): void;
  connect(signal: AbortSignal): ReadableStream<Uint8Array>;
  close(): void;
}

export interface OverlayBusOptions<Display extends object> {
  initial: Display;
  now: () => number;
  schedule: (callback: () => void, delayMs: number) => () => void;
  maxPendingBytes?: number;
  momentLimit?: number;
  momentTtlMs?: number;
}

export function createOverlayBus<Display extends object>(
  options: OverlayBusOptions<Display>,
): OverlayBus<Display> {
  const copy = <Value>(value: Value): Value =>
    JSON.parse(
      JSON.stringify(value, (_key, item: unknown) => {
        if (
          ["undefined", "function", "symbol", "bigint"].includes(typeof item) ||
          (typeof item === "number" && !Number.isFinite(item))
        ) {
          throw new TypeError("Public projections must contain only JSON values.");
        }
        return item;
      }),
    );
  let display = copy(options.initial);
  let seq = 0;
  let closed = false;
  let moments: PublicMoment[] = [];
  const momentLimit = options.momentLimit ?? 100;
  const momentTtlMs = options.momentTtlMs ?? 30_000;
  const maxPendingBytes = options.maxPendingBytes ?? 1_048_576;
  for (const limit of [momentLimit, momentTtlMs, maxPendingBytes]) {
    if (!Number.isSafeInteger(limit) || limit <= 0)
      throw new RangeError("Bus limits must be positive whole numbers.");
  }
  if (maxPendingBytes > 1_048_576)
    throw new RangeError("Pending client output cannot exceed 1 MiB.");
  let cancelExpiry: (() => void) | undefined;
  const encoder = new TextEncoder();
  interface Client {
    controller: ReadableStreamDefaultController<Uint8Array>;
    sentAt: number;
    cancelFlush?: () => void;
    cancelPing?: () => void;
    removeAbort?: () => void;
  }
  const clients = new Set<Client>();
  const snapshot = (): PublicSnapshot<Display> => {
    expire();
    return JSON.parse(JSON.stringify({ ...display, v: 1, seq, moments }));
  };

  function scheduleExpiry() {
    cancelExpiry?.();
    cancelExpiry = undefined;
    if (!moments.length) return;
    const expiresAt = Math.min(...moments.map((moment) => moment.at + momentTtlMs));
    cancelExpiry = options.schedule(
      () => {
        cancelExpiry = undefined;
        expire();
        scheduleExpiry();
      },
      Math.max(0, expiresAt - options.now()),
    );
  }

  function expire() {
    const remaining = moments.filter((moment) => options.now() - moment.at < momentTtlMs);
    if (remaining.length === moments.length) return;
    moments = remaining;
    seq += 1;
    for (const client of clients) queue(client);
  }

  function queue(client: Client) {
    if (client.cancelFlush) return;
    client.cancelFlush = options.schedule(
      () => {
        client.cancelFlush = undefined;
        client.sentAt = options.now();
        enqueue(client, `event: delta\ndata: ${JSON.stringify(snapshot())}\n\n`);
      },
      Math.max(0, 100 - (options.now() - client.sentAt)),
    );
  }

  function enqueue(client: Client, text: string): boolean {
    if (!clients.has(client)) return false;
    const chunk = encoder.encode(text);
    if (chunk.byteLength > (client.controller.desiredSize ?? 0)) {
      remove(client, true);
      return false;
    }
    client.controller.enqueue(chunk);
    return true;
  }

  function remove(client: Client, close: boolean) {
    if (!clients.has(client)) return;
    client.cancelFlush?.();
    client.cancelPing?.();
    client.removeAbort?.();
    clients.delete(client);
    if (close) client.controller.close();
  }

  function ping(client: Client) {
    client.cancelPing = options.schedule(() => {
      client.cancelPing = undefined;
      if (!clients.has(client)) return;
      if (enqueue(client, ": ping\n\n")) ping(client);
    }, 15_000);
  }

  return {
    snapshot,
    publish(next, added = []) {
      if (closed) throw new Error("Overlay bus is closed.");
      const currentTime = options.now();
      for (const moment of added) {
        if (
          typeof moment.id !== "string" ||
          !moment.id ||
          !Number.isSafeInteger(moment.at) ||
          moment.at < 0 ||
          moment.at > currentTime
        ) {
          throw new TypeError("Public moments require a stable ID and a valid event timestamp.");
        }
      }
      const nextDisplay = copy(next);
      const nextMoments = copy(added);
      expire();
      display = nextDisplay;
      for (const moment of nextMoments) {
        if (
          options.now() - moment.at < momentTtlMs &&
          !moments.some((current) => current.id === moment.id)
        )
          moments.push(moment);
      }
      moments = moments.slice(-momentLimit);
      scheduleExpiry();
      seq += 1;
      for (const client of clients) queue(client);
    },
    connect(signal) {
      let current: Client | undefined;
      return new ReadableStream<Uint8Array>(
        {
          start(controller) {
            if (closed || signal.aborted) {
              controller.close();
              return;
            }
            current = { controller, sentAt: options.now() };
            clients.add(current);
            const client = current;
            const onAbort = () => remove(client, true);
            signal.addEventListener("abort", onAbort, { once: true });
            current.removeAbort = () => signal.removeEventListener("abort", onAbort);
            if (enqueue(current, `event: snapshot\ndata: ${JSON.stringify(snapshot())}\n\n`))
              ping(current);
          },
          cancel() {
            if (current) remove(current, false);
          },
        },
        { highWaterMark: maxPendingBytes, size: (chunk) => chunk.byteLength },
      );
    },
    close() {
      if (closed) return;
      closed = true;
      cancelExpiry?.();
      for (const client of clients) remove(client, true);
    },
  };
}
