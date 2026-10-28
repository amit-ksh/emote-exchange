import { createHash, randomBytes } from "node:crypto";
import type { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Store } from "./store/index.ts";

export type AuthRole = "broadcaster" | "bot";
export interface AuthAccount {
  connected: boolean;
  login: string | null;
  scopes: string[];
  reconnect: boolean;
}
export interface AuthPublicState {
  configured: boolean;
  broadcaster: AuthAccount;
  bot: AuthAccount;
}
interface AuthOptions {
  store: Store;
  clientId: string;
  clientSecret: string;
  publicOrigin: string;
  fetcher?: typeof fetch;
  now?: () => number;
  onChange?: () => void;
}
interface TokenRow {
  role: AuthRole;
  user_id: string;
  login: string;
  access_token: string;
  refresh_token: string;
  scopes: string;
  expires_at: number;
}
const scopes = {
  broadcaster: ["user:read:chat", "user:write:chat", "moderator:read:followers"],
  bot: ["user:write:chat"],
};
const roles: AuthRole[] = ["broadcaster", "bot"];
const isRole = (value: unknown): value is AuthRole => value === "broadcaster" || value === "bot";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const empty = (): AuthAccount => ({ connected: false, login: null, scopes: [], reconnect: false });
class AuthFailure extends Error {
  status: number;
  constructor(status: number) {
    super("Twitch authorization failed.");
    this.status = status;
  }
}

export function createTwitchAuth(options: AuthOptions) {
  const now = options.now ?? Date.now;
  const configured = Boolean(options.clientId && options.clientSecret);
  const pending = new Map<string, { nonceHash: string; role: AuthRole; expires: number }>();
  const accounts = { broadcaster: empty(), bot: empty() };
  let closed = false;
  const fetcher = options.fetcher ?? fetch;
  const lastValidated = new Map<AuthRole, number>();
  const revisions = { broadcaster: 0, bot: 0 };
  const refreshes = new Map<AuthRole, Promise<void>>();
  const row = (role: AuthRole) =>
    options.store.read<TokenRow>("SELECT * FROM tokens WHERE role = ?", [role])[0];
  const changed = () => {
    if (!closed) options.onChange?.();
  };
  async function request(path: string, init?: RequestInit) {
    const response = await fetcher(`https://id.twitch.tv/oauth2/${path}`, {
      ...init,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new AuthFailure(response.status);
    const data: unknown = await response.json();
    if (!data || typeof data !== "object") throw new Error("Invalid authorization response");
    return data as Record<string, unknown>;
  }
  async function validate(role: AuthRole, access: string) {
    const data = await request("validate", { headers: { Authorization: `OAuth ${access}` } });
    if (
      data.client_id !== options.clientId ||
      typeof data.user_id !== "string" ||
      !data.user_id ||
      typeof data.login !== "string" ||
      !data.login ||
      !Array.isArray(data.scopes) ||
      !scopes[role].every((scope) => (data.scopes as unknown[]).includes(scope)) ||
      !data.scopes.every((scope) => typeof scope === "string") ||
      !Number.isSafeInteger(data.expires_in) ||
      (data.expires_in as number) <= 0
    )
      throw new Error("Authorization identity or scopes rejected");
    return {
      userId: data.user_id,
      login: data.login,
      scopes: data.scopes as string[],
      expiresAt: now() + (data.expires_in as number) * 1000,
    };
  }
  function save(
    role: AuthRole,
    access: string,
    refresh: string,
    identity: Awaited<ReturnType<typeof validate>>,
  ) {
    options.store.writeBatch([
      {
        sql: "INSERT INTO tokens(role,user_id,login,display_name,access_token,refresh_token,scopes,expires_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(role) DO UPDATE SET user_id=excluded.user_id,login=excluded.login,display_name=excluded.display_name,access_token=excluded.access_token,refresh_token=excluded.refresh_token,scopes=excluded.scopes,expires_at=excluded.expires_at",
        params: [
          role,
          identity.userId,
          identity.login,
          identity.login,
          access,
          refresh,
          JSON.stringify(identity.scopes),
          identity.expiresAt,
        ],
      },
    ]);
    lastValidated.set(role, now());
    accounts[role] = {
      connected: true,
      login: identity.login,
      scopes: identity.scopes,
      reconnect: false,
    };
    changed();
  }
  async function exchange(role: AuthRole, body: URLSearchParams, revision: number) {
    const tokens = await request("token", { method: "POST", body });
    if (
      typeof tokens.access_token !== "string" ||
      !tokens.access_token ||
      typeof tokens.refresh_token !== "string" ||
      !tokens.refresh_token
    )
      throw new Error("Invalid token response");
    const identity = await validate(role, tokens.access_token);
    if (closed || revisions[role] !== revision) throw new Error("Authorization attempt ended.");
    save(role, tokens.access_token, tokens.refresh_token, identity);
  }
  function invalidate(role: AuthRole, reconnect = true) {
    if (closed) return;
    revisions[role]++;
    for (const [id, attempt] of pending) if (attempt.role === role) pending.delete(id);
    options.store.writeBatch([{ sql: "DELETE FROM tokens WHERE role = ?", params: [role] }]);
    accounts[role] = { ...empty(), reconnect };
    lastValidated.delete(role);
    changed();
  }
  function refresh(role: AuthRole): Promise<void> {
    const existing = refreshes.get(role);
    if (existing) return existing;
    const stored = closed ? undefined : row(role);
    if (!stored) return Promise.reject(new Error("Reconnect Twitch to continue."));
    const revision = revisions[role];
    const work = exchange(
      role,
      new URLSearchParams({
        client_id: options.clientId,
        client_secret: options.clientSecret,
        grant_type: "refresh_token",
        refresh_token: stored.refresh_token,
      }),
      revision,
    )
      .catch((error) => {
        if (
          !closed &&
          revisions[role] === revision &&
          error instanceof AuthFailure &&
          (error.status === 400 || error.status === 401)
        )
          invalidate(role);
        throw new Error("Reconnect Twitch to continue.");
      })
      .finally(() => {
        if (refreshes.get(role) === work) refreshes.delete(role);
      });
    refreshes.set(role, work);
    return work;
  }
  let maintenance: Promise<void> | undefined;
  function maintain(force = false): Promise<void> {
    if (maintenance) return maintenance;
    maintenance = (async () => {
      if (!configured || closed) return;
      for (const role of roles) {
        if (closed) return;
        const stored = row(role);
        if (!stored) continue;
        const revision = revisions[role];
        try {
          if (stored.expires_at - now() < 300_000) {
            await refresh(role);
            continue;
          }
          if (!force && now() - (lastValidated.get(role) ?? 0) < 3_600_000) continue;
          const identity = await validate(role, stored.access_token);
          if (identity.userId !== stored.user_id) {
            invalidate(role);
            continue;
          }
          if (
            !closed &&
            revisions[role] === revision &&
            row(role)?.access_token === stored.access_token &&
            row(role)?.refresh_token === stored.refresh_token
          )
            save(role, stored.access_token, stored.refresh_token, identity);
        } catch (error) {
          if (closed || revisions[role] !== revision) continue;
          if (error instanceof AuthFailure && error.status === 401) {
            try {
              await refresh(role);
            } catch {
              /* Reconnect state is handled by refresh. */
            }
          } else {
            accounts[role] = { ...empty(), reconnect: true };
            changed();
          }
        }
      }
    })().finally(() => {
      maintenance = undefined;
    });
    return maintenance;
  }
  async function disconnect(role: AuthRole) {
    if (closed) return;
    const stored = row(role);
    invalidate(role, false);
    if (stored) {
      try {
        await fetcher("https://id.twitch.tv/oauth2/revoke", {
          method: "POST",
          body: new URLSearchParams({ client_id: options.clientId, token: stored.access_token }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        /* Local disconnect remains effective when Twitch is unavailable. */
      }
    }
  }
  return {
    initialize: () => maintain(true),
    maintenance: () => maintain(),
    refresh,
    disconnect,
    invalidate,
    accessToken(role: AuthRole) {
      return accounts[role].connected ? row(role)?.access_token : undefined;
    },
    publicState(): AuthPublicState {
      return structuredClone({ configured, ...accounts });
    },
    mount(app: Hono) {
      app.use("/auth/*", async (c, next) => {
        c.header("Cache-Control", "no-store");
        c.header("Referrer-Policy", "no-referrer");
        await next();
      });
      app.get("/auth/login", (c) => {
        const role = c.req.query("role") ?? "broadcaster";
        if (!configured || closed || !isRole(role)) return c.redirect("/?auth=failed");
        if (new URL(c.req.url).origin !== options.publicOrigin)
          return c.redirect(`${options.publicOrigin}/auth/login?role=${role}`);
        const previous = getCookie(c, "exchange_oauth");
        for (const [id, attempt] of pending) {
          if (attempt.expires <= now() || (previous && attempt.nonceHash === hash(previous)))
            pending.delete(id);
        }
        if (pending.size >= 100) return c.redirect("/?auth=failed");
        const state = randomBytes(32).toString("hex");
        const nonce = randomBytes(32).toString("hex");
        pending.set(state, { nonceHash: hash(nonce), role, expires: now() + 600_000 });
        setCookie(c, "exchange_oauth", nonce, {
          httpOnly: true,
          sameSite: "Lax",
          path: "/auth",
          maxAge: 600,
        });
        const url = new URL("https://id.twitch.tv/oauth2/authorize");
        url.search = new URLSearchParams({
          client_id: options.clientId,
          redirect_uri: `${options.publicOrigin}/auth/callback`,
          response_type: "code",
          scope: scopes[role].join(" "),
          state,
          ...(role === "bot" ? { force_verify: "true" } : {}),
        }).toString();
        return c.redirect(url.href);
      });
      app.get("/auth/callback", async (c) => {
        const state = c.req.query("state") ?? "";
        const code = c.req.query("code");
        const attempt = pending.get(state);
        pending.delete(state);
        const cookie = getCookie(c, "exchange_oauth");
        deleteCookie(c, "exchange_oauth", { path: "/auth" });
        if (
          closed ||
          !attempt ||
          attempt.expires <= now() ||
          !cookie ||
          hash(cookie) !== attempt.nonceHash ||
          c.req.query("error") ||
          !code
        )
          return c.redirect("/?auth=failed");
        try {
          const revision = ++revisions[attempt.role];
          await exchange(
            attempt.role,
            new URLSearchParams({
              client_id: options.clientId,
              client_secret: options.clientSecret,
              grant_type: "authorization_code",
              code,
              redirect_uri: `${options.publicOrigin}/auth/callback`,
            }),
            revision,
          );
          return c.redirect("/?auth=connected");
        } catch {
          return c.redirect("/?auth=failed");
        }
      });
      app.post("/api/auth/disconnect", async (c) => {
        const body: unknown = await c.req.json().catch(() => null);
        const role = body && typeof body === "object" && "role" in body ? body.role : undefined;
        if (!isRole(role)) return c.json({ error: "Choose a valid account role." }, 400);
        await disconnect(role);
        return c.json({ ok: true });
      });
    },
    close() {
      closed = true;
      pending.clear();
    },
  };
}
