import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import { openTursoStore } from "../src/store/turso.ts";

function cleanFixture(dir: string) {
  try {
    rmSync(dir, { force: true, recursive: true, maxRetries: 5, retryDelay: 100 });
  } catch (error) {
    // libSQL's Windows file transport can retain a mapped handle until process exit.
    if (process.platform !== "win32" || (error as NodeJS.ErrnoException).code !== "EPERM")
      throw error;
  }
}

test("Turso commits parameterized batches atomically, mirrors only acknowledged writes and restores after restart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "exchange-turso-"));
  const url = pathToFileURL(join(dir, "remote.sqlite")).href;
  let store: Awaited<ReturnType<typeof openTursoStore>> | undefined;
  try {
    const client = createClient({ url });
    let release: (() => void) | undefined;
    const batch = client.batch.bind(client);
    const migration = {
      version: 2,
      sql: "CREATE TABLE counters(id TEXT PRIMARY KEY, coins INTEGER NOT NULL CHECK(coins>=0));",
    };
    store = await openTursoStore({ client, migrations: [migration] });
    client.batch = async (...args) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return batch(...args);
    };
    const pending = store.writeBatch([
      { sql: "INSERT INTO counters VALUES (?,?)", params: ["ann'); DROP TABLE counters;--", 50] },
    ]);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(store.read("SELECT * FROM counters").length, 0);
    assert.ok(release);
    release();
    await pending;
    assert.equal(store.read<{ coins: number }>("SELECT * FROM counters")[0].coins, 50);
    client.batch = batch;
    await assert.rejects(
      Promise.resolve(
        store.writeBatch([
          { sql: "INSERT INTO counters VALUES (?,?)", params: ["bob", 10] },
          { sql: "UPDATE counters SET coins=-1" },
        ]),
      ),
      /storage/i,
    );
    assert.equal(store.read("SELECT * FROM counters").length, 1);
    await store.close();
    store = undefined;
    store = await openTursoStore({ client: createClient({ url }), migrations: [migration] });
    assert.equal(store.read<{ coins: number }>("SELECT * FROM counters")[0].coins, 50);
    const check = createClient({ url });
    assert.equal((await check.execute("SELECT count(*) AS n FROM counters")).rows[0].n, 1);
    check.close();
  } finally {
    await store?.close();
    cleanFixture(dir);
  }
});

test("a new Turso runtime fences the previous writer instead of allowing two markets to overwrite balances", async () => {
  const dir = mkdtempSync(join(tmpdir(), "exchange-fence-"));
  const url = pathToFileURL(join(dir, "remote.sqlite")).href;
  const first = await openTursoStore({ client: createClient({ url }) });
  let second: typeof first | undefined;
  try {
    second = await openTursoStore({ client: createClient({ url }) });
    await assert.rejects(Promise.resolve(first.settings({ count: 0 }).set("count", 1)), /storage/i);
    await second.settings({ count: 0 }).set("count", 2);
    assert.equal(second.settings({ count: 0 }).get("count"), 2);
  } finally {
    await first.close();
    await second?.close();
    cleanFixture(dir);
  }
});

test("schema installation uses an atomic batch without sequence requests or writable control PRAGMAs", async () => {
  const client = createClient({ url: "file::memory:" });
  client.executeMultiple = async () => {
    throw new Error("HTTP sequence request rejected");
  };
  client.migrate = async () => {
    throw new Error("Writable control PRAGMA rejected");
  };
  const store = await openTursoStore({ client });
  try {
    await store.settings({ count: 0 }).set("count", 1);
    assert.equal(store.settings({ count: 0 }).get("count"), 1);
  } finally {
    await store.close();
  }
});
