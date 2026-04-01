import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import { configureSqlitePragmas } from "../../src/main/infrastructure/sqlite-pragmas";
import { createTestDb, type TestDb } from "../setup/test-db";

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const fn of cleanups.splice(0)) fn();
});

describe("configureSqlitePragmas", () => {
  it("sets WAL journal mode", () => {
    const t = createTestDb();
    cleanups.push(t.cleanup);
    configureSqlitePragmas(t.db);

    const result = t.db.pragma("journal_mode") as { journal_mode: string }[];
    expect(result[0].journal_mode).toBe("wal");
  });

  it("sets busy_timeout to 5000ms", () => {
    const t = createTestDb();
    cleanups.push(t.cleanup);
    configureSqlitePragmas(t.db);

    const result = t.db.pragma("busy_timeout", { simple: true });
    expect(result).toBe(5000);
  });

  it("sets synchronous to FULL (2)", () => {
    const t = createTestDb();
    cleanups.push(t.cleanup);
    configureSqlitePragmas(t.db);

    const result = t.db.pragma("synchronous") as { synchronous: number }[];
    expect(result[0].synchronous).toBe(2); // FULL = 2
  });

  it("enables foreign keys", () => {
    const t = createTestDb();
    cleanups.push(t.cleanup);
    configureSqlitePragmas(t.db);

    const result = t.db.pragma("foreign_keys") as { foreign_keys: number }[];
    expect(result[0].foreign_keys).toBe(1);
  });
});
