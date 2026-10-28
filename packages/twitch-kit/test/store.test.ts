import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { openStore } from "../src/store/index.ts";

test("store creates its directory and platform schema once, preserving rows on reopen", () => {
  const directory = mkdtempSync(join(tmpdir(), "emote-exchange-store-"));
  const filename = join(directory, "nested", "emote-exchange.sqlite");
  try {
    const first = openStore({ filename });
    try {
      assert.equal(first.read<{ user_version: number }>("PRAGMA user_version")[0]?.user_version, 1);
      assert.equal(
        first.read<{ journal_mode: string }>("PRAGMA journal_mode")[0]?.journal_mode,
        "wal",
      );
      assert.equal(first.read<{ foreign_keys: number }>("PRAGMA foreign_keys")[0]?.foreign_keys, 1);
      assert.deepEqual(
        first
          .read<{ name: string }>(
            "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name",
          )
          .map((row) => row.name),
        ["emote_cache", "kv", "tokens"],
      );
      first.writeBatch([
        { sql: "INSERT INTO kv(key, value) VALUES (?, ?)", params: ["retained", "42"] },
      ]);
    } finally {
      first.close();
    }
    const reopened = openStore({ filename });
    try {
      assert.equal(
        reopened.read<{ value: string }>("SELECT value FROM kv WHERE key = ?", ["retained"])[0]
          ?.value,
        "42",
      );
      assert.equal(
        reopened.read<{ user_version: number }>("PRAGMA user_version")[0]?.user_version,
        1,
      );
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("settings reject unsupported JSON, unknown keys and values that contradict their defaults", () => {
  const store = openStore({ filename: ":memory:" });
  try {
    for (const invalidDefault of [
      undefined,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      new Date(),
      { bad: undefined },
      { bad: () => 1 },
    ]) {
      assert.throws(() => store.settings({ value: invalidDefault }), /JSON/i);
    }
    const settings = store.settings({ rate: 10, quietMode: false, layout: { visible: true } });
    const unchecked = settings as {
      set(key: string, value: unknown): void;
      get(key: string): unknown;
    };
    for (const value of [undefined, Number.NaN, Number.POSITIVE_INFINITY, "fast"]) {
      assert.throws(() => unchecked.set("rate", value));
      assert.equal(settings.get("rate"), 10);
    }
    assert.throws(() => unchecked.set("layout", { visible: true, extra: "value" }));
    assert.throws(() => unchecked.set("layout", { visible: "yes" }));
    assert.throws(() => unchecked.set("unrecognized", true), /Unknown setting/i);
    assert.throws(() => unchecked.get("unrecognized"), /Unknown setting/i);
    settings.set("rate", 25);
    assert.throws(() =>
      store.writeBatch([{ sql: "UPDATE kv SET value = ? WHERE key = ?", params: ["{", "rate"] }]),
    );
    assert.equal(settings.get("rate"), 25);
    store.writeBatch([
      { sql: "UPDATE kv SET value = ? WHERE key = ?", params: ['"invalid-type"', "rate"] },
    ]);
    assert.throws(() => settings.get("rate"), /setting/i);
    store.writeBatch([{ sql: "UPDATE kv SET value = ? WHERE key = ?", params: ["1e400", "rate"] }]);
    assert.throws(() => settings.get("rate"), /JSON/i);
  } finally {
    store.close();
  }
});

test("settings supply isolated defaults and persist typed values across restarts", () => {
  const directory = mkdtempSync(join(tmpdir(), "emote-exchange-settings-"));
  const filename = join(directory, "emote-exchange.sqlite");
  const defaults = { quietMode: false, rate: 10, layout: { visible: true, names: ["tape"] } };
  try {
    const first = openStore({ filename });
    try {
      const settings = first.settings(defaults);
      assert.equal(settings.get("quietMode"), false);
      assert.equal(first.read<{ count: number }>("SELECT count(*) AS count FROM kv")[0]?.count, 0);
      settings.get("layout").names.push("chart");
      assert.deepEqual(settings.get("layout"), { visible: true, names: ["tape"] });
      settings.set("quietMode", true);
      settings.set("rate", 25);
      settings.set("layout", { visible: false, names: ["board"] });
      assert.equal(settings.get("quietMode"), true);
    } finally {
      first.close();
    }
    const reopened = openStore({ filename });
    try {
      const settings = reopened.settings(defaults);
      const rate: number = settings.get("rate");
      assert.equal(rate, 25);
      assert.equal(settings.get("quietMode"), true);
      assert.deepEqual(settings.get("layout"), { visible: false, names: ["board"] });
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("write batches use bound parameters and roll back every write if any statement fails", () => {
  const store = openStore({ filename: ":memory:" });
  try {
    const key = "chatter'); DROP TABLE tokens; --";
    store.writeBatch([{ sql: "INSERT INTO kv(key,value) VALUES (?,?)", params: [key, "true"] }]);
    assert.equal(
      store.read<{ value: string }>("SELECT value FROM kv WHERE key = ?", [key])[0]?.value,
      "true",
    );
    assert.throws(() =>
      store.writeBatch([
        { sql: "INSERT INTO kv(key,value) VALUES (?,?)", params: ["first", "1"] },
        { sql: "INSERT INTO kv(key,value) VALUES (?,?)", params: [key, "false"] },
      ]),
    );
    assert.equal(store.read<{ count: number }>("SELECT count(*) AS count FROM kv")[0]?.count, 1);
    assert.equal(
      store.read<{ count: number }>("SELECT count(*) AS count FROM tokens")[0]?.count,
      0,
    );
    store.writeBatch([
      { sql: "INSERT INTO kv(key,value) VALUES (?,?)", params: ["after-rollback", "2"] },
    ]);
    assert.equal(store.read<{ count: number }>("SELECT count(*) AS count FROM kv")[0]?.count, 2);
  } finally {
    store.close();
  }
});

test("store refuses unordered migrations and databases newer than its known schema", () => {
  for (const migrations of [
    [{ version: 3, sql: "SELECT 1;" }],
    [
      { version: 2, sql: "SELECT 1;" },
      { version: 2, sql: "SELECT 1;" },
    ],
    [{ version: 2.5, sql: "SELECT 1;" }],
    [{ version: 2, sql: "" }],
  ]) {
    assert.throws(() => {
      const unexpectedlyOpened = openStore({ filename: ":memory:", migrations });
      unexpectedlyOpened.close();
    }, /migration/i);
  }
  const directory = mkdtempSync(join(tmpdir(), "emote-exchange-future-schema-"));
  const filename = join(directory, "emote-exchange.sqlite");
  try {
    const future = new DatabaseSync(filename);
    future.exec("PRAGMA user_version=99");
    future.close();
    assert.throws(() => {
      const unexpectedlyOpened = openStore({ filename });
      unexpectedlyOpened.close();
    }, /newer/i);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("ordered migrations apply once and a failed migration rolls the entire startup back", () => {
  const directory = mkdtempSync(join(tmpdir(), "emote-exchange-migrations-"));
  const filename = join(directory, "emote-exchange.sqlite");
  const migrations = [
    {
      version: 2,
      sql: "CREATE TABLE migration_witness (id INTEGER PRIMARY KEY); INSERT INTO migration_witness VALUES (7);",
    },
  ];
  try {
    assert.throws(() => {
      const unexpectedlyOpened = openStore({
        filename,
        migrations: [...migrations, { version: 3, sql: "INSERT INTO missing_table VALUES (1);" }],
      });
      unexpectedlyOpened.close();
    });
    const failed = new DatabaseSync(filename);
    try {
      assert.equal(failed.prepare("PRAGMA user_version").get()?.user_version, 0);
      assert.equal(
        failed.prepare("SELECT count(*) AS count FROM sqlite_schema WHERE type = 'table'").get()
          ?.count,
        0,
      );
    } finally {
      failed.close();
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const store = openStore({ filename, migrations });
      try {
        assert.equal(
          store.read<{ user_version: number }>("PRAGMA user_version")[0]?.user_version,
          2,
        );
        assert.equal(store.read<{ id: number }>("SELECT id FROM migration_witness")[0]?.id, 7);
      } finally {
        store.close();
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
