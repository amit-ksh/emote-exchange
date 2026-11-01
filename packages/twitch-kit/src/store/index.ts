import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { SQLInputValue } from "node:sqlite";
import { DatabaseSync } from "node:sqlite";

export interface StoreWrite {
  sql: string;
  params?: readonly SQLInputValue[];
}

export interface OpenStoreOptions {
  filename: string;
  migrations?: readonly Migration[];
}

export interface Migration {
  version: number;
  sql: string;
}

export interface Store {
  readonly asyncWrites?: boolean;
  close(): void | Promise<void>;
  read<T>(sql: string, params?: readonly SQLInputValue[]): T[];
  writeBatch(writes: readonly StoreWrite[]): void | Promise<void>;
  settings<T extends Record<string, unknown>>(defaults: T): Settings<T>;
  settled?(): Promise<void>;
}

export interface Settings<T extends Record<string, unknown>> {
  get<K extends keyof T>(key: K): T[K];
  set<K extends keyof T>(key: K, value: T[K]): void | Promise<void>;
}

function assertJson(value: unknown, ancestors = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (typeof value !== "object" || value === null || ancestors.has(value)) {
    throw new TypeError("Settings must contain finite, serializable JSON values.");
  }
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  ) {
    throw new TypeError("Settings must contain plain JSON objects.");
  }
  if (Object.getOwnPropertySymbols(value).length > 0)
    throw new TypeError("Settings must contain JSON keys.");
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (const item of value) assertJson(item, ancestors);
  } else {
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.hasOwn(descriptor, "value"))
        throw new TypeError("Settings cannot contain JSON getters.");
      assertJson(descriptor.value, ancestors);
    }
  }
  ancestors.delete(value);
}

function matchesDefault(value: unknown, baseline: unknown): boolean {
  if (baseline === null) return value === null;
  if (Array.isArray(baseline)) {
    return (
      Array.isArray(value) &&
      (baseline.length === 0 ||
        value.every((item) => baseline.some((template) => matchesDefault(item, template))))
    );
  }
  if (typeof baseline === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const expected = baseline as Record<string, unknown>;
    const actual = value as Record<string, unknown>;
    const keys = Object.keys(expected);
    return (
      Object.keys(actual).length === keys.length &&
      keys.every((key) => Object.hasOwn(actual, key) && matchesDefault(actual[key], expected[key]))
    );
  }
  return typeof value === typeof baseline;
}

export const platformSchema = `
  CREATE TABLE tokens (
    role TEXT PRIMARY KEY CHECK (role IN ('broadcaster', 'bot')),
    user_id TEXT NOT NULL,
    login TEXT NOT NULL,
    display_name TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    scopes TEXT NOT NULL CHECK (json_valid(scopes)),
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL CHECK (json_valid(value))
  );
  CREATE TABLE emote_cache (
    provider TEXT NOT NULL,
    scope TEXT NOT NULL,
    key TEXT NOT NULL,
    name TEXT NOT NULL,
    image_url TEXT NOT NULL,
    animated INTEGER NOT NULL CHECK (animated IN (0, 1)),
    fetched_at INTEGER NOT NULL,
    PRIMARY KEY (provider, scope, key)
  );
`;

export function openStore({ filename, migrations = [] }: OpenStoreOptions) {
  const steps = [{ version: 1, sql: platformSchema }, ...migrations];
  for (const [index, step] of steps.entries()) {
    if (!Number.isSafeInteger(step.version) || step.version !== index + 1 || !step.sql.trim()) {
      throw new Error("Migrations must contain contiguous, ascending versions and nonempty SQL.");
    }
  }
  if (filename !== ":memory:") mkdirSync(dirname(resolve(filename)), { recursive: true });
  const database = new DatabaseSync(filename);
  try {
    database.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
    const version = Number(database.prepare("PRAGMA user_version").get()?.user_version);
    if (version > steps.length) throw new Error("Database schema is newer than this application.");
    if (!Number.isSafeInteger(version) || version < 0)
      throw new Error("Database schema version is invalid.");
    if (version < steps.length) {
      database.exec("BEGIN IMMEDIATE");
      try {
        for (const step of steps) {
          if (step.version <= version) continue;
          database.exec(step.sql);
          database.exec(`PRAGMA user_version=${step.version}`);
        }
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    }
  } catch (error) {
    database.close();
    throw error;
  }
  const store: Store = {
    close() {
      database.close();
    },
    read<T>(sql: string, params: readonly SQLInputValue[] = []): T[] {
      return database.prepare(sql).all(...params) as T[];
    },
    writeBatch(writes: readonly StoreWrite[]) {
      database.exec("BEGIN IMMEDIATE");
      try {
        for (const { sql, params = [] } of writes) database.prepare(sql).run(...params);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    settings<T extends Record<string, unknown>>(defaults: T): Settings<T> {
      return storeSettings(store, defaults);
    },
  };
  return store;
}

export function storeSettings<T extends Record<string, unknown>>(
  store: Store,
  defaults: T,
): Settings<T> {
  assertJson(defaults);
  const baseline = JSON.parse(JSON.stringify(defaults)) as T;
  const checkedKey = (key: keyof T): string => {
    if (typeof key !== "string" || !Object.hasOwn(baseline, key))
      throw new Error("Unknown setting.");
    return key;
  };
  return {
    get<K extends keyof T>(key: K): T[K] {
      const row = store.read<{ value: string }>("SELECT value FROM kv WHERE key = ?", [
        checkedKey(key),
      ])[0];
      const value: unknown = JSON.parse(row ? String(row.value) : JSON.stringify(baseline[key]));
      assertJson(value);
      if (!matchesDefault(value, baseline[key]))
        throw new TypeError("Stored setting does not match its default type.");
      return value as T[K];
    },
    set<K extends keyof T>(key: K, value: T[K]) {
      const settingKey = checkedKey(key);
      assertJson(value);
      if (!matchesDefault(value, baseline[key]))
        throw new TypeError("Setting does not match its default type.");
      const json = JSON.stringify(value);
      return store.writeBatch([
        {
          sql: "INSERT INTO kv(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          params: [settingKey, json],
        },
      ]);
    },
  };
}
