import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { applyRestorePending } from "../../src/main/services/restorePending";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { force: true, recursive: true });
  }
});

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-restore-pending-"));
  tempDirs.push(dir);
  return dir;
}

function writePendingFile(
  dir: string,
  content: Record<string, unknown>,
): string {
  const pendingPath = path.join(dir, ".restore-pending.json");
  fs.writeFileSync(pendingPath, JSON.stringify(content));
  return pendingPath;
}

describe("applyRestorePending", () => {
  it("returns { restored: false } when no pending file exists", () => {
    const tempDir = makeTempDir();
    const dbPath = path.join(tempDir, "inventory-monitor.db");

    const result = applyRestorePending(dbPath, () => {});

    expect(result).toEqual({ restored: false });
  });

  it("applies all preserved settings and returns restored metadata when valid file exists", () => {
    const tempDir = makeTempDir();
    const dbPath = path.join(tempDir, "inventory-monitor.db");
    const restoredAt = new Date().toISOString();
    const backupDir = "/backups/2026-04-01";

    writePendingFile(tempDir, {
      preserveSettings: {
        "backup.target_path": "/new/backups",
        "backup.schedule": "daily",
        "ui.language": "zh-CN",
      },
      backupDir,
      restoredAt,
    });

    const writeSetting = vi.fn();
    const result = applyRestorePending(dbPath, writeSetting);

    expect(result.restored).toBe(true);
    expect(result.backupDir).toBe(backupDir);
    expect(result.restoredAt).toBe(restoredAt);
  });

  it("calls writeSetting for each key in preserveSettings", () => {
    const tempDir = makeTempDir();
    const dbPath = path.join(tempDir, "inventory-monitor.db");

    writePendingFile(tempDir, {
      preserveSettings: {
        "backup.target_path": "/new/backups",
        "backup.schedule": "daily",
        "ui.language": "zh-CN",
      },
      backupDir: "/backups",
      restoredAt: new Date().toISOString(),
    });

    const writeSetting = vi.fn();
    applyRestorePending(dbPath, writeSetting);

    expect(writeSetting).toHaveBeenCalledTimes(3);
    expect(writeSetting).toHaveBeenCalledWith("backup.target_path", "/new/backups");
    expect(writeSetting).toHaveBeenCalledWith("backup.schedule", "daily");
    expect(writeSetting).toHaveBeenCalledWith("ui.language", "zh-CN");
  });

  it("deletes the .restore-pending.json file after processing", () => {
    const tempDir = makeTempDir();
    const dbPath = path.join(tempDir, "inventory-monitor.db");

    const pendingPath = writePendingFile(tempDir, {
      preserveSettings: { "ui.language": "en" },
      backupDir: "/backups",
      restoredAt: new Date().toISOString(),
    });

    expect(fs.existsSync(pendingPath)).toBe(true);

    applyRestorePending(dbPath, vi.fn());

    expect(fs.existsSync(pendingPath)).toBe(false);
  });

  it("handles corrupt JSON gracefully — returns false and deletes the file", () => {
    const tempDir = makeTempDir();
    const dbPath = path.join(tempDir, "inventory-monitor.db");
    const pendingPath = path.join(tempDir, ".restore-pending.json");

    fs.writeFileSync(pendingPath, "not valid json{{{");

    const writeSetting = vi.fn();
    const result = applyRestorePending(dbPath, writeSetting);

    expect(result).toEqual({ restored: false });
    expect(writeSetting).not.toHaveBeenCalled();
    expect(fs.existsSync(pendingPath)).toBe(false);
  });

  it("handles missing preserveSettings object — iterates empty entries", () => {
    const tempDir = makeTempDir();
    const dbPath = path.join(tempDir, "inventory-monitor.db");

    writePendingFile(tempDir, {
      preserveSettings: {},
      backupDir: "/backups",
      restoredAt: "2026-04-01T00:00:00Z",
    });

    const writeSetting = vi.fn();
    const result = applyRestorePending(dbPath, writeSetting);

    expect(result.restored).toBe(true);
    expect(result.backupDir).toBe("/backups");
    expect(result.restoredAt).toBe("2026-04-01T00:00:00Z");
    expect(writeSetting).not.toHaveBeenCalled();
  });

  it("handles file where preserveSettings is undefined — catches error and cleans up", () => {
    const tempDir = makeTempDir();
    const dbPath = path.join(tempDir, "inventory-monitor.db");
    const pendingPath = path.join(tempDir, ".restore-pending.json");

    // Valid JSON but missing the preserveSettings key entirely
    fs.writeFileSync(pendingPath, JSON.stringify({ backupDir: "/b", restoredAt: "x" }));

    const writeSetting = vi.fn();
    const result = applyRestorePending(dbPath, writeSetting);

    // Object.entries(undefined) throws, so the catch block fires
    expect(result).toEqual({ restored: false });
    expect(fs.existsSync(pendingPath)).toBe(false);
  });
});
