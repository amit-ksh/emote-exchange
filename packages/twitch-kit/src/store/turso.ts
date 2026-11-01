import { randomUUID } from "node:crypto";
import type { SQLInputValue } from "node:sqlite";
import type { Client, InStatement } from "@libsql/client";
import { createClient } from "@libsql/client/web";
import type { Migration, Store, StoreWrite } from "./index.ts";
import { openStore, platformSchema, storeSettings } from "./index.ts";

interface Options {
  url?: string;
  authToken?: string;
  migrations?: readonly Migration[];
  client?: Client;
}

// The remote primary is authoritative. A private in-memory SQLite mirror serves
// synchronous reads to the existing domain repositories; it changes only after
// the remote transaction commits. This is not a best-effort replication queue.
export async function openTursoStore(options: Options): Promise<Store> {
  const client =
    options.client ??
    createClient({
      url: options.url ?? "",
      authToken: options.authToken,
      fetch: (input: string | URL | Request, init?: RequestInit) =>
        fetch(input, {
          ...init,
          signal: AbortSignal.any([
            ...(init?.signal ? [init.signal] : []),
            AbortSignal.timeout(15_000),
          ]),
        }),
    });
  let cache: Store | undefined;
  const owner = randomUUID();
  let closed = false;
  let failed = false;
  let tail = Promise.resolve();
  let queued = 0;
  let stage = "version";
  try {
    const steps = [{ version: 1, sql: platformSchema }, ...(options.migrations ?? [])];
    for (const [index, step] of steps.entries())
      if (step.version !== index + 1 || !step.sql.trim()) throw new Error();
    await client.execute(
      "CREATE TABLE IF NOT EXISTS store_schema(singleton INTEGER PRIMARY KEY CHECK(singleton=1), version INTEGER NOT NULL)",
    );
    const version = Number(
      (await client.execute("SELECT version FROM store_schema WHERE singleton=1")).rows[0]
        ?.version ?? 0,
    );
    if (!Number.isSafeInteger(version) || version < 0 || version > steps.length) throw new Error();
    if (version < steps.length) {
      stage = "migration";
      // These are checked-in schema statements, with no user values or triggers.
      await client.batch(
        [
          ...steps
            .filter((step) => step.version > version)
            .flatMap((step) =>
              step.sql
                .split(";")
                .map((sql) => sql.trim())
                .filter(Boolean),
            ),
          {
            sql: "INSERT INTO store_schema(singleton,version) VALUES(1,?) ON CONFLICT(singleton) DO UPDATE SET version=excluded.version",
            args: [steps.length],
          },
        ],
        "write",
      );
    }
    stage = "writer";
    await client.execute(
      "CREATE TABLE IF NOT EXISTS runtime_writer(singleton INTEGER PRIMARY KEY CHECK(singleton=1), owner TEXT NOT NULL, guard INTEGER NOT NULL DEFAULT 1 CHECK(guard=1))",
    );
    // A deployment's new process fences its predecessor before restoring state.
    await client.execute({
      sql: "INSERT INTO runtime_writer(singleton,owner) VALUES(1,?) ON CONFLICT(singleton) DO UPDATE SET owner=excluded.owner",
      args: [owner],
    });
    stage = "restore";
    cache = openStore({ filename: ":memory:", migrations: options.migrations });
    const identifier = (value: unknown): string => {
      if (typeof value !== "string" || !/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error();
      return `"${value}"`;
    };
    const tables = (
      await client.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('runtime_writer','store_schema') ORDER BY rowid",
      )
    ).rows;
    for (const table of tables) {
      const name = identifier(table.name);
      const columns = (await client.execute(`PRAGMA table_info(${name})`)).rows.map((row) =>
        identifier(row.name),
      );
      // SQL identifiers come only from schema metadata, never chat or HTTP input.
      for (let offset = 0; ; offset += 1000) {
        const result = await client.execute({
          sql: `SELECT * FROM ${name} LIMIT 1000 OFFSET ?`,
          args: [offset],
        });
        if (!result.rows.length) break;
        cache.writeBatch(
          result.rows.map((row) => ({
            sql: `INSERT INTO ${name}(${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
            params: result.columns.map((column) => {
              const value = row[column];
              return value instanceof ArrayBuffer ? new Uint8Array(value) : value;
            }) as SQLInputValue[],
          })),
        );
      }
    }
    const mirror = cache;
    const store: Store = {
      asyncWrites: true,
      read: (sql, params) => mirror.read(sql, params),
      settings: (defaults) => storeSettings(store, defaults),
      writeBatch(writes: readonly StoreWrite[]) {
        if (closed || failed || queued >= 2000)
          return Promise.reject(
            new Error("Remote storage unavailable. Restart after resolving storage."),
          );
        const statements: InStatement[] = writes.map((write) => ({
          sql: write.sql,
          args: (write.params ?? []).map((value) =>
            ArrayBuffer.isView(value)
              ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
              : value,
          ),
        }));
        queued++;
        const task = tail
          .then(async () => {
            if (failed) throw new Error();
            await client.batch(
              [
                {
                  sql: "UPDATE runtime_writer SET guard=CASE WHEN owner=? THEN 1 ELSE 0 END WHERE singleton=1",
                  args: [owner],
                },
                ...statements,
              ],
              "write",
            );
            mirror.writeBatch(writes);
          })
          .catch(() => {
            failed = true;
            throw new Error(
              "Remote storage transaction failed. No success effects were delivered; restart to restore committed state.",
            );
          })
          .finally(() => {
            queued--;
          });
        tail = task.catch(() => {});
        return task;
      },
      settled: async () => {
        await tail;
        if (failed) throw new Error("Remote storage unavailable.");
      },
      async close() {
        if (closed) return;
        closed = true;
        await tail;
        // Do not clear a successor's fencing token when an old process exits.
        client.close();
        mirror.close();
      },
    };
    return store;
  } catch (error) {
    client.close();
    cache?.close();
    throw Object.assign(
      new Error(
        "Unable to initialize Turso storage. Check DB_URL, TURSO_AUTH_TOKEN, connectivity and schema version.",
        { cause: error },
      ),
      { stage },
    );
  }
}
