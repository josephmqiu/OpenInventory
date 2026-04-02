import fs from "fs";
import path from "path";

/**
 * Check for .restore-pending.json on startup and apply settings overrides.
 * Call this AFTER the database is initialized but BEFORE loading the snapshot.
 *
 * Extracted from BackupCoordinator so it can be tested without Electron imports.
 */
export function applyRestorePending(
  dbPath: string,
  writeSetting: (key: string, value: string) => void,
): {
  restored: boolean;
  backupDir?: string;
  restoredAt?: string;
} {
  const pendingPath = path.join(path.dirname(dbPath), ".restore-pending.json");
  if (!fs.existsSync(pendingPath)) {
    return { restored: false };
  }

  try {
    const raw = fs.readFileSync(pendingPath, "utf-8");
    const pending = JSON.parse(raw) as {
      preserveSettings: Record<string, string>;
      backupDir: string;
      restoredAt: string;
    };

    // Apply preserved settings to the restored DB
    for (const [key, value] of Object.entries(pending.preserveSettings)) {
      writeSetting(key, value);
    }

    // Clean up
    fs.unlinkSync(pendingPath);

    return {
      restored: true,
      backupDir: pending.backupDir,
      restoredAt: pending.restoredAt,
    };
  } catch {
    // Corrupt pending file — clean up and continue
    try { fs.unlinkSync(pendingPath); } catch { /* ignore */ }
    return { restored: false };
  }
}
