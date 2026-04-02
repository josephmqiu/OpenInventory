import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackupScheduler, type ScheduleConfig } from "../../src/main/services/BackupScheduler";

// Mock BackupCoordinator
function makeMockCoordinator() {
  return {
    backupNow: vi.fn().mockResolvedValue({}),
  } as any;
}

function makeConfig(overrides: Partial<ScheduleConfig> = {}): ScheduleConfig {
  return {
    intervalValue: 0,
    intervalUnit: "hours",
    onStartup: false,
    lastSuccessful: "",
    ...overrides,
  };
}

describe("BackupScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not start timer when intervalValue is 0", async () => {
    const coordinator = makeMockCoordinator();
    const scheduler = new BackupScheduler(coordinator, async () => makeConfig());

    await scheduler.start();

    // Advance 5 minutes — no backup should fire
    vi.advanceTimersByTime(5 * 60_000);
    expect(coordinator.backupNow).not.toHaveBeenCalled();

    scheduler.stop();
  });

  it("triggers startup backup when onStartup is true and no recent backup", async () => {
    const coordinator = makeMockCoordinator();
    const scheduler = new BackupScheduler(coordinator, async () =>
      makeConfig({ onStartup: true, lastSuccessful: "" }),
    );

    await scheduler.start();

    expect(coordinator.backupNow).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it("skips startup backup when last backup is recent (< 1 hour)", async () => {
    const coordinator = makeMockCoordinator();
    const recentBackup = new Date(Date.now() - 30 * 60_000).toISOString(); // 30 min ago
    const scheduler = new BackupScheduler(coordinator, async () =>
      makeConfig({ onStartup: true, lastSuccessful: recentBackup }),
    );

    await scheduler.start();

    expect(coordinator.backupNow).not.toHaveBeenCalled();
    scheduler.stop();
  });

  it("triggers backup when interval has elapsed", async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
    const coordinator = makeMockCoordinator();
    const scheduler = new BackupScheduler(coordinator, async () =>
      makeConfig({ intervalValue: 1, intervalUnit: "hours", lastSuccessful: twoHoursAgo }),
    );

    await scheduler.start();

    // Advance past the 60s poll interval and flush async
    await vi.advanceTimersByTimeAsync(61_000);

    expect(coordinator.backupNow).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it("does not trigger backup when interval has not elapsed", async () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60_000).toISOString();
    const coordinator = makeMockCoordinator();
    const scheduler = new BackupScheduler(coordinator, async () =>
      makeConfig({ intervalValue: 4, intervalUnit: "hours", lastSuccessful: thirtyMinAgo }),
    );

    await scheduler.start();

    // Advance past the poll interval and flush async
    await vi.advanceTimersByTimeAsync(61_000);

    expect(coordinator.backupNow).not.toHaveBeenCalled();
    scheduler.stop();
  });

  it("clears timer on stop", async () => {
    const coordinator = makeMockCoordinator();
    const scheduler = new BackupScheduler(coordinator, async () =>
      makeConfig({ intervalValue: 1, intervalUnit: "hours", lastSuccessful: "" }),
    );

    await scheduler.start();
    // Startup backup fires (lastSuccessful is empty → not applicable for startup check but timer starts)
    scheduler.stop();

    // Advance a long time — should not fire anything after stop
    vi.advanceTimersByTime(10 * 60_000);

    // At most 1 call from startup (if onStartup was true), but since onStartup is false, 0
    expect(coordinator.backupNow).toHaveBeenCalledTimes(0);
  });

  it("handles days unit correctly", async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString();
    const coordinator = makeMockCoordinator();
    const scheduler = new BackupScheduler(coordinator, async () =>
      makeConfig({ intervalValue: 1, intervalUnit: "days", lastSuccessful: twoDaysAgo }),
    );

    await scheduler.start();
    await vi.advanceTimersByTimeAsync(61_000);

    expect(coordinator.backupNow).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it("handles weeks unit correctly", async () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60_000).toISOString();
    const coordinator = makeMockCoordinator();
    const scheduler = new BackupScheduler(coordinator, async () =>
      makeConfig({ intervalValue: 1, intervalUnit: "weeks", lastSuccessful: twoWeeksAgo }),
    );

    await scheduler.start();
    await vi.advanceTimersByTimeAsync(61_000);

    expect(coordinator.backupNow).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });
});
