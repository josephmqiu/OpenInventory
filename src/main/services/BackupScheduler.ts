import type { BackupCoordinator } from "./BackupCoordinator";

const POLL_INTERVAL_MS = 60_000; // Check every 60 seconds
const STARTUP_DEBOUNCE_MS = 60 * 60 * 1000; // 1 hour: skip startup backup if last backup < 1h ago

const UNIT_TO_MS: Record<string, number> = {
  hours: 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
  weeks: 7 * 24 * 60 * 60 * 1000,
};

export interface ScheduleConfig {
  intervalValue: number;
  intervalUnit: "hours" | "days" | "weeks";
  onStartup: boolean;
  lastSuccessful: string; // ISO timestamp or ""
}

/**
 * BackupScheduler polls every 60 seconds and triggers a backup via
 * BackupCoordinator when the configured interval has elapsed since the last
 * successful backup. Uses timestamp comparison (not countdown) so it
 * correctly handles system sleep/wake.
 *
 * The scheduler is NOT an Effect service. It's a plain object managed by
 * BackupCoordinator, started after the app is ready, and stopped on dispose.
 */
export class BackupScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private coordinator: BackupCoordinator;
  private getConfig: () => Promise<ScheduleConfig>;

  constructor(
    coordinator: BackupCoordinator,
    getConfig: () => Promise<ScheduleConfig>,
  ) {
    this.coordinator = coordinator;
    this.getConfig = getConfig;
  }

  /** Start the scheduler. Also runs the startup check if onStartup is true. */
  async start(): Promise<void> {
    const config = await this.getConfig();

    // Startup backup check
    if (config.onStartup) {
      const elapsed = this.msElapsed(config.lastSuccessful);
      if (elapsed > STARTUP_DEBOUNCE_MS) {
        console.log("[BackupScheduler] Startup backup triggered");
        this.triggerBackup();
      }
    }

    // Start polling if interval is configured (intervalValue > 0)
    if (config.intervalValue > 0) {
      this.timer = setInterval(() => void this.pollCheck(), POLL_INTERVAL_MS);
      console.log(`[BackupScheduler] Polling every 60s (interval: ${config.intervalValue} ${config.intervalUnit})`);
    }
  }

  /** Stop the scheduler. Safe to call multiple times. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log("[BackupScheduler] Stopped");
    }
  }

  /** Check if it's time for a backup. */
  private async pollCheck(): Promise<void> {
    try {
      const config = await this.getConfig();
      if (config.intervalValue <= 0) return;

      const intervalMs = config.intervalValue * (UNIT_TO_MS[config.intervalUnit] ?? UNIT_TO_MS.hours);
      const elapsed = this.msElapsed(config.lastSuccessful);

      if (elapsed >= intervalMs) {
        console.log("[BackupScheduler] Scheduled backup triggered");
        this.triggerBackup();
      }
    } catch (e) {
      console.error("[BackupScheduler] Poll check failed:", e);
    }
  }

  /** Trigger a backup (non-blocking, errors are logged). */
  private triggerBackup(): void {
    this.coordinator.backupNow().catch((e) => {
      console.error("[BackupScheduler] Backup failed:", e);
    });
  }

  /** Calculate milliseconds since the last successful backup. Returns Infinity if never backed up. */
  private msElapsed(lastSuccessful: string): number {
    if (!lastSuccessful) return Infinity;
    const lastTime = new Date(lastSuccessful).getTime();
    if (Number.isNaN(lastTime)) return Infinity;
    const elapsed = Date.now() - lastTime;
    // Guard against clock skew: if lastSuccessful is in the future, treat as overdue
    // rather than suppressing backups until the clock catches up.
    return elapsed < 0 ? Infinity : elapsed;
  }
}
