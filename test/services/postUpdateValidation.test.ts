import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkPostUpdateDatabase,
  markPostUpdateValidationSucceeded,
} from "../../src/main/services/postUpdateValidation";
import {
  LATEST_MIGRATION_VERSION,
  runPendingMigrations,
} from "../../src/main/infrastructure/migrations";
import { createTestDb, type TestDb } from "../setup/test-db";

let t: TestDb;

beforeEach(() => {
  t = createTestDb();
  runPendingMigrations(t.db);
});

afterEach(async () => {
  await t.cleanup();
});

describe("post-update validation", () => {
  it("requires validation when the app version has not been marked", () => {
    const result = checkPostUpdateDatabase(t.dbPath, "1.2.3");

    expect(result.required).toBe(true);
    expect(result.previousVersion).toBe("");
    expect(result.currentVersion).toBe("1.2.3");
    expect(result.errors).toEqual([]);
  });

  it("does not require validation once the current version has been marked successful", () => {
    markPostUpdateValidationSucceeded(t.dbPath, "1.2.3");

    const result = checkPostUpdateDatabase(t.dbPath, "1.2.3");

    expect(result.required).toBe(false);
    expect(result.previousVersion).toBe("1.2.3");
    expect(result.errors).toEqual([]);
  });

  it("fails closed when required tables are missing", () => {
    t.db.exec("DROP TABLE personnel");

    const result = checkPostUpdateDatabase(t.dbPath, "1.2.3");

    expect(result.required).toBe(true);
    expect(result.errors).toContain("missing required table: personnel");
  });

  it("fails closed when schema migrations are not current", () => {
    t.db.prepare("DELETE FROM schema_migrations WHERE version = ?").run(LATEST_MIGRATION_VERSION);

    const result = checkPostUpdateDatabase(t.dbPath, "1.2.3");

    expect(result.required).toBe(true);
    expect(result.errors).toContain(
      `schema version ${LATEST_MIGRATION_VERSION - 1} does not match app schema ${LATEST_MIGRATION_VERSION}`,
    );
  });
});
