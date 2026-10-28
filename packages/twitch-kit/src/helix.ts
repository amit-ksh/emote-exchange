import { setTimeout as delay } from "node:timers/promises";
import type { AuthRole } from "./auth.ts";

export interface HelixAuth {
  accessToken: (role: AuthRole) => string | undefined;
  refresh: (role: AuthRole) => Promise<void>;
}
export interface HelixRequest {
  role: AuthRole;
  path: string;
  method?: "GET" | "POST" | "DELETE" | "PATCH";
  body?: unknown;
  signal?: AbortSignal;
  deadline?: number;
  // Called again on every retry, immediately before touching the network.
  beforeAttempt?: (signal: AbortSignal) => Promise<boolean>;
  url?: string;
}
export class HelixError extends Error {
  kind: "canceled" | "unauthorized" | "network" | "destination";
  constructor(kind: HelixError["kind"]) {
    super(`Helix request ${kind}.`);
    this.kind = kind;
  }
}
export interface HelixOptions {
  clientId: string;
  auth: HelixAuth;
  fetcher?: typeof fetch;
  now?: () => number;
  wait?: (ms: number, signal: AbortSignal) => Promise<void>;
  log?: (entry: { method: string; path: string; status: number }) => void;
}
export type HelixClient = ReturnType<typeof createHelix>;
export function createHelix(options: HelixOptions) {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  const wait = options.wait ?? ((ms, signal) => delay(ms, undefined, { signal }));
  const log =
    options.log ?? ((entry) => console.info(`Helix ${entry.method} ${entry.path} ${entry.status}`));
  const controllers = new Set<AbortController>();
  const refreshing = new Map<AuthRole, Promise<void>>();
  let closed = false;
  return {
    async request(request: HelixRequest): Promise<Response> {
      let url: URL;
      try {
        if (!request.path.startsWith("/") || request.path.startsWith("//")) throw new Error();
        url = new URL(request.url ?? `https://api.twitch.tv/helix${request.path}`);
        const official =
          url.origin === "https://api.twitch.tv" && url.pathname.startsWith("/helix/");
        const mock = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
        if ((!official && !mock) || url.username || url.password || url.hash) throw new Error();
      } catch {
        throw new HelixError("destination");
      }
      const controller = new AbortController();
      controllers.add(controller);
      const deadline = request.deadline ?? Infinity;
      const lifetime = [controller.signal];
      if (request.signal) lifetime.push(request.signal);
      if (Number.isFinite(deadline))
        lifetime.push(AbortSignal.timeout(Math.max(1, Math.min(2_147_483_647, deadline - now()))));
      const signal = AbortSignal.any(lifetime);
      let refreshed = false;
      let rateRetried = false;
      const method = request.method ?? "GET";
      const active = () => {
        if (closed || signal.aborted || now() >= deadline) throw new HelixError("canceled");
      };
      try {
        while (true) {
          active();
          if (request.beforeAttempt && !(await request.beforeAttempt(signal)))
            throw new HelixError("canceled");
          active();
          const token = options.auth.accessToken(request.role);
          if (!token) throw new HelixError("unauthorized");
          const response = await fetcher(url.href, {
            method,
            redirect: "error",
            headers: {
              Authorization: `Bearer ${token}`,
              "Client-Id": options.clientId,
              ...(request.body === undefined ? {} : { "Content-Type": "application/json" }),
            },
            body: request.body === undefined ? undefined : JSON.stringify(request.body),
            signal: AbortSignal.any([
              signal,
              AbortSignal.timeout(Math.max(1, Math.min(10_000, deadline - now()))),
            ]),
          });
          log({ method, path: url.pathname, status: response.status });
          if (closed || signal.aborted || now() >= deadline) {
            await response.body?.cancel();
            throw new HelixError("canceled");
          }
          if (response.status === 401 && !refreshed) {
            refreshed = true;
            await response.body?.cancel();
            if (options.auth.accessToken(request.role) === token) {
              let pending = refreshing.get(request.role);
              if (!pending) {
                pending = options.auth.refresh(request.role);
                refreshing.set(request.role, pending);
                void pending
                  .finally(() => {
                    if (refreshing.get(request.role) === pending) refreshing.delete(request.role);
                  })
                  .catch(() => {});
              }
              await pending;
            }
            continue;
          }
          if (response.status === 429 && !rateRetried) {
            const header = response.headers.get("Ratelimit-Reset");
            const reset = header === null ? NaN : Number(header) * 1000;
            const ms = Math.max(0, reset - now());
            if (Number.isFinite(reset) && reset >= 0 && ms <= 2_147_483_647 && reset < deadline) {
              rateRetried = true;
              await response.body?.cancel();
              await wait(ms, signal);
              continue;
            }
          }
          return response;
        }
      } catch (error) {
        if (error instanceof HelixError) throw error;
        if (closed || signal.aborted || now() >= deadline) throw new HelixError("canceled");
        log({ method, path: url.pathname, status: 0 });
        throw new HelixError("network");
      } finally {
        controllers.delete(controller);
      }
    },
    close() {
      closed = true;
      for (const controller of controllers) controller.abort();
      controllers.clear();
    },
  };
}
