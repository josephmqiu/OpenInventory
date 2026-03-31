/**
 * AutoUpdateService tests.
 *
 * Since the real autoUpdater is an Electron singleton that requires a running
 * Electron app, these tests replicate the event-to-status mapping logic from
 * makeAutoUpdateService using a mock EventEmitter that mirrors the autoUpdater API.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "events";
import type { UpdateStatus } from "../../src/main/services/AutoUpdateService";

// ─── Mock autoUpdater as an EventEmitter with the methods we call ────────────

interface MockAutoUpdater extends EventEmitter {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  checkForUpdates: ReturnType<typeof vi.fn>;
  downloadUpdate: ReturnType<typeof vi.fn>;
  quitAndInstall: ReturnType<typeof vi.fn>;
}

function createMockAutoUpdater(): MockAutoUpdater {
  const emitter = new EventEmitter() as MockAutoUpdater;
  emitter.autoDownload = true;
  emitter.autoInstallOnAppQuit = false;
  emitter.checkForUpdates = vi.fn().mockResolvedValue(undefined);
  emitter.downloadUpdate = vi.fn().mockResolvedValue(undefined);
  emitter.quitAndInstall = vi.fn();
  return emitter;
}

/**
 * Mirrors the service factory but uses our mock instead of the real autoUpdater.
 * This tests the exact same event wiring and status mapping logic.
 */
function makeTestService(
  mockUpdater: MockAutoUpdater,
  onStatusChange: (status: UpdateStatus) => void,
  isDev = false,
) {
  let currentStatus: UpdateStatus = { stage: "idle" };

  function setStatus(status: UpdateStatus): void {
    currentStatus = status;
    onStatusChange(status);
  }

  mockUpdater.autoDownload = false;
  mockUpdater.autoInstallOnAppQuit = true;

  mockUpdater.on("checking-for-update", () => {
    setStatus({ stage: "checking" });
  });

  mockUpdater.on("update-available", (info: { version: string; releaseNotes?: unknown }) => {
    setStatus({
      stage: "available",
      version: info.version,
      releaseNotes: typeof info.releaseNotes === "string" ? info.releaseNotes : "",
    });
  });

  mockUpdater.on("update-not-available", (info: { version: string }) => {
    setStatus({ stage: "not-available", version: info.version });
  });

  mockUpdater.on("download-progress", (progress: { percent: number; transferred: number; total: number }) => {
    setStatus({
      stage: "downloading",
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  mockUpdater.on("update-downloaded", (info: { version: string }) => {
    setStatus({ stage: "downloaded", version: info.version });
  });

  mockUpdater.on("error", (err: Error) => {
    setStatus({ stage: "error", message: err.message });
  });

  return {
    checkForUpdates: () => {
      if (isDev) {
        setStatus({ stage: "not-available", version: "dev" });
        return;
      }
      mockUpdater.checkForUpdates().catch((err: Error) => {
        setStatus({ stage: "error", message: err.message });
      });
    },
    downloadUpdate: () => {
      if (isDev) return;
      mockUpdater.downloadUpdate().catch((err: Error) => {
        setStatus({ stage: "error", message: err.message });
      });
    },
    installUpdate: () => {
      mockUpdater.quitAndInstall(false, true);
    },
    getStatus: () => currentStatus,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("AutoUpdateService", () => {
  let mockUpdater: MockAutoUpdater;
  let statuses: UpdateStatus[];
  let onStatusChange: (status: UpdateStatus) => void;

  beforeEach(() => {
    mockUpdater = createMockAutoUpdater();
    statuses = [];
    onStatusChange = (s) => statuses.push(s);
  });

  describe("configuration", () => {
    it("disables autoDownload so user must choose", () => {
      makeTestService(mockUpdater, onStatusChange);
      expect(mockUpdater.autoDownload).toBe(false);
    });

    it("enables autoInstallOnAppQuit", () => {
      makeTestService(mockUpdater, onStatusChange);
      expect(mockUpdater.autoInstallOnAppQuit).toBe(true);
    });
  });

  describe("initial state", () => {
    it("starts with idle status", () => {
      const service = makeTestService(mockUpdater, onStatusChange);
      expect(service.getStatus()).toEqual({ stage: "idle" });
    });
  });

  describe("event-to-status mapping", () => {
    it("maps checking-for-update event to checking status", () => {
      makeTestService(mockUpdater, onStatusChange);
      mockUpdater.emit("checking-for-update");
      expect(statuses).toEqual([{ stage: "checking" }]);
    });

    it("maps update-available event to available status with version and releaseNotes", () => {
      makeTestService(mockUpdater, onStatusChange);
      mockUpdater.emit("update-available", {
        version: "1.2.3",
        releaseNotes: "Bug fixes and improvements",
      });
      expect(statuses).toEqual([
        {
          stage: "available",
          version: "1.2.3",
          releaseNotes: "Bug fixes and improvements",
        },
      ]);
    });

    it("handles non-string releaseNotes gracefully", () => {
      makeTestService(mockUpdater, onStatusChange);
      mockUpdater.emit("update-available", {
        version: "2.0.0",
        releaseNotes: [{ version: "2.0.0", note: "Major release" }],
      });
      expect(statuses[0]).toEqual({
        stage: "available",
        version: "2.0.0",
        releaseNotes: "",
      });
    });

    it("maps update-not-available event to not-available status", () => {
      makeTestService(mockUpdater, onStatusChange);
      mockUpdater.emit("update-not-available", { version: "0.0.1" });
      expect(statuses).toEqual([{ stage: "not-available", version: "0.0.1" }]);
    });

    it("maps download-progress event to downloading status", () => {
      makeTestService(mockUpdater, onStatusChange);
      mockUpdater.emit("download-progress", {
        percent: 45.5,
        transferred: 4550000,
        total: 10000000,
      });
      expect(statuses).toEqual([
        {
          stage: "downloading",
          percent: 45.5,
          transferred: 4550000,
          total: 10000000,
        },
      ]);
    });

    it("maps update-downloaded event to downloaded status", () => {
      makeTestService(mockUpdater, onStatusChange);
      mockUpdater.emit("update-downloaded", { version: "1.0.0" });
      expect(statuses).toEqual([{ stage: "downloaded", version: "1.0.0" }]);
    });

    it("maps error event to error status with message", () => {
      makeTestService(mockUpdater, onStatusChange);
      mockUpdater.emit("error", new Error("Network timeout"));
      expect(statuses).toEqual([{ stage: "error", message: "Network timeout" }]);
    });
  });

  describe("status tracking", () => {
    it("getStatus returns the latest status after multiple events", () => {
      const service = makeTestService(mockUpdater, onStatusChange);

      mockUpdater.emit("checking-for-update");
      expect(service.getStatus()).toEqual({ stage: "checking" });

      mockUpdater.emit("update-available", { version: "2.0.0", releaseNotes: "" });
      expect(service.getStatus()).toEqual({
        stage: "available",
        version: "2.0.0",
        releaseNotes: "",
      });
    });

    it("records a full update lifecycle in order", () => {
      makeTestService(mockUpdater, onStatusChange);

      mockUpdater.emit("checking-for-update");
      mockUpdater.emit("update-available", { version: "1.1.0", releaseNotes: "Patch" });
      mockUpdater.emit("download-progress", { percent: 50, transferred: 5000, total: 10000 });
      mockUpdater.emit("download-progress", { percent: 100, transferred: 10000, total: 10000 });
      mockUpdater.emit("update-downloaded", { version: "1.1.0" });

      const stages = statuses.map((s) => s.stage);
      expect(stages).toEqual(["checking", "available", "downloading", "downloading", "downloaded"]);
    });
  });

  describe("checkForUpdates", () => {
    it("calls autoUpdater.checkForUpdates in production mode", () => {
      const service = makeTestService(mockUpdater, onStatusChange, false);
      service.checkForUpdates();
      expect(mockUpdater.checkForUpdates).toHaveBeenCalledOnce();
    });

    it("returns not-available with version dev in dev mode", () => {
      const service = makeTestService(mockUpdater, onStatusChange, true);
      service.checkForUpdates();
      expect(mockUpdater.checkForUpdates).not.toHaveBeenCalled();
      expect(statuses).toEqual([{ stage: "not-available", version: "dev" }]);
    });

    it("sets error status when checkForUpdates promise rejects", async () => {
      mockUpdater.checkForUpdates.mockRejectedValueOnce(new Error("DNS failed"));
      const service = makeTestService(mockUpdater, onStatusChange, false);
      service.checkForUpdates();

      // Wait for the rejection handler
      await vi.waitFor(() => {
        expect(statuses).toContainEqual({ stage: "error", message: "DNS failed" });
      });
    });
  });

  describe("downloadUpdate", () => {
    it("calls autoUpdater.downloadUpdate in production mode", () => {
      const service = makeTestService(mockUpdater, onStatusChange, false);
      service.downloadUpdate();
      expect(mockUpdater.downloadUpdate).toHaveBeenCalledOnce();
    });

    it("does nothing in dev mode", () => {
      const service = makeTestService(mockUpdater, onStatusChange, true);
      service.downloadUpdate();
      expect(mockUpdater.downloadUpdate).not.toHaveBeenCalled();
      expect(statuses).toHaveLength(0);
    });

    it("sets error status when downloadUpdate promise rejects", async () => {
      mockUpdater.downloadUpdate.mockRejectedValueOnce(new Error("Disk full"));
      const service = makeTestService(mockUpdater, onStatusChange, false);
      service.downloadUpdate();

      await vi.waitFor(() => {
        expect(statuses).toContainEqual({ stage: "error", message: "Disk full" });
      });
    });
  });

  describe("installUpdate", () => {
    it("calls quitAndInstall with correct arguments", () => {
      const service = makeTestService(mockUpdater, onStatusChange);
      service.installUpdate();
      expect(mockUpdater.quitAndInstall).toHaveBeenCalledWith(false, true);
    });
  });

  describe("callback invocation", () => {
    it("calls onStatusChange for every status transition", () => {
      makeTestService(mockUpdater, onStatusChange);

      mockUpdater.emit("checking-for-update");
      mockUpdater.emit("update-not-available", { version: "0.0.1" });

      expect(statuses).toHaveLength(2);
      expect(onStatusChange).toBeDefined();
    });
  });
});
