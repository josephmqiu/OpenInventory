import fs from "fs";

/**
 * Remove a directory tree, retrying with exponential backoff.
 *
 * On Windows (the production CI target) a just-closed Electron process can keep
 * SQLite / userData / log file handles open for a short window after exit, so a
 * naive `fs.rmSync(dir, { recursive, force })` intermittently throws EBUSY/EPERM.
 * Retrying with backoff absorbs that race. Used by the worker fixture teardown
 * and by specs that create their own temp dirs (backup, qr-export, restore-handoff).
 */
export async function removeDirWithRetry(dir: string, label = "temp dir"): Promise<void> {
  for (let i = 0; i < 5; i++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    } catch {
      if (i === 4) {
        console.warn(`[e2e] Could not clean ${label} after 5 retries: ${dir}`);
        return;
      }
      const delay = 100 * Math.pow(2, i);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
