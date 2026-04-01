import { afterEach, describe, expect, it } from "vitest";
import { Effect } from "effect";
import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";
import { BackupService, BackupServiceLive } from "../../src/main/services/BackupService";

function runBackup(sourcePath: string, targetDir: string) {
  return Effect.runPromise(
    Effect.flatMap(BackupService, (service) => service.backupDatabase(sourcePath, targetDir)).pipe(
      Effect.provide(BackupServiceLive),
    ),
  );
}

function createTempDatabase(tempDir: string): string {
  const dbPath = path.join(tempDir, "inventory.db");
  const db = new Database(dbPath);
  db.exec("CREATE TABLE test_table (id INTEGER PRIMARY KEY, name TEXT NOT NULL);");
  db.exec("INSERT INTO test_table (name) VALUES ('openinventory');");
  db.close();
  return dbPath;
}

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { force: true, recursive: true });
  }
});

describe("BackupService", () => {
  it("creates a timestamped backup file in the target directory", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-backup-service-"));
    tempDirs.push(tempDir);
    const sourcePath = createTempDatabase(tempDir);
    const targetDir = path.join(tempDir, "backups");

    const backupPath = await runBackup(sourcePath, targetDir);

    expect(backupPath).toMatch(/inventory-monitor-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.db$/);
    expect(path.dirname(backupPath)).toBe(targetDir);
    expect(fs.existsSync(backupPath)).toBe(true);

    const backupDb = new Database(backupPath, { readonly: true });
    const row = backupDb.prepare("SELECT name FROM test_table").get() as { name: string };
    backupDb.close();

    expect(row.name).toBe("openinventory");
  });

  it("wraps target-directory failures as IoError", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-backup-service-"));
    tempDirs.push(tempDir);
    const sourcePath = createTempDatabase(tempDir);
    const blockingFile = path.join(tempDir, "not-a-directory");
    fs.writeFileSync(blockingFile, "blocking file");

    await expect(runBackup(sourcePath, blockingFile)).rejects.toThrow(/IoError|Backup failed/);
  });
});
