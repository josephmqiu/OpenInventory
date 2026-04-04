import { beforeEach, describe, expect, it, vi } from "vitest";

const toolkitMocks = vi.hoisted(() => ({
  is: {
    dev: false,
  },
}));

const updaterMocks = vi.hoisted(() => ({
  autoUpdater: (() => {
    const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    return {
      autoDownload: true,
      autoInstallOnAppQuit: false,
      checkForUpdates: vi.fn().mockResolvedValue(undefined),
      downloadUpdate: vi.fn().mockResolvedValue(undefined),
      quitAndInstall: vi.fn(),
      on(event: string, listener: (...args: unknown[]) => void) {
        const current = listeners.get(event) ?? [];
        current.push(listener);
        listeners.set(event, current);
        return this;
      },
      emit(event: string, ...args: unknown[]) {
        for (const listener of listeners.get(event) ?? []) {
          listener(...args);
        }
      },
      removeAllListeners() {
        listeners.clear();
        return this;
      },
    };
  })(),
}));

vi.mock("@electron-toolkit/utils", () => toolkitMocks);
vi.mock("electron-updater", () => ({
  default: {
    autoUpdater: updaterMocks.autoUpdater,
  },
}));

import {
  makeAutoUpdateService,
  type UpdateStatus,
} from "../../src/main/services/AutoUpdateService";

describe("AutoUpdateService", () => {
  let statuses: UpdateStatus[];

  beforeEach(() => {
    statuses = [];
    toolkitMocks.is.dev = false;
    updaterMocks.autoUpdater.removeAllListeners();
    updaterMocks.autoUpdater.autoDownload = true;
    updaterMocks.autoUpdater.autoInstallOnAppQuit = false;
    updaterMocks.autoUpdater.checkForUpdates.mockReset();
    updaterMocks.autoUpdater.checkForUpdates.mockResolvedValue(undefined);
    updaterMocks.autoUpdater.downloadUpdate.mockReset();
    updaterMocks.autoUpdater.downloadUpdate.mockResolvedValue(undefined);
    updaterMocks.autoUpdater.quitAndInstall.mockReset();
  });

  function createService() {
    return makeAutoUpdateService((status) => statuses.push(status));
  }

  it("configures the updater to require explicit downloads and install on quit", () => {
    createService();

    expect(updaterMocks.autoUpdater.autoDownload).toBe(false);
    expect(updaterMocks.autoUpdater.autoInstallOnAppQuit).toBe(true);
  });

  it("maps updater lifecycle events onto UpdateStatus values", () => {
    const service = createService();

    updaterMocks.autoUpdater.emit("checking-for-update");
    expect(service.getStatus()).toEqual({ stage: "checking" });

    updaterMocks.autoUpdater.emit("update-available", {
      version: "1.2.3",
      releaseNotes: "Bug fixes",
    });
    expect(service.getStatus()).toEqual({
      stage: "available",
      version: "1.2.3",
      releaseNotes: "Bug fixes",
    });

    updaterMocks.autoUpdater.emit("download-progress", {
      percent: 42,
      transferred: 4200,
      total: 10000,
    });
    expect(service.getStatus()).toEqual({
      stage: "downloading",
      percent: 42,
      transferred: 4200,
      total: 10000,
    });

    updaterMocks.autoUpdater.emit("update-downloaded", { version: "1.2.3" });
    expect(service.getStatus()).toEqual({ stage: "downloaded", version: "1.2.3" });

    updaterMocks.autoUpdater.emit("error", new Error("Network timeout"));
    expect(service.getStatus()).toEqual({ stage: "error", message: "Network timeout" });

    expect(statuses).toEqual([
      { stage: "checking" },
      { stage: "available", version: "1.2.3", releaseNotes: "Bug fixes" },
      { stage: "downloading", percent: 42, transferred: 4200, total: 10000 },
      { stage: "downloaded", version: "1.2.3" },
      { stage: "error", message: "Network timeout" },
    ]);
  });

  it("coerces non-string release notes to an empty string", () => {
    const service = createService();

    updaterMocks.autoUpdater.emit("update-available", {
      version: "2.0.0",
      releaseNotes: [{ note: "array payload" }],
    });

    expect(service.getStatus()).toEqual({
      stage: "available",
      version: "2.0.0",
      releaseNotes: "",
    });
  });

  it("returns dev not-available status instead of calling checkForUpdates in dev mode", () => {
    toolkitMocks.is.dev = true;
    const service = createService();

    service.checkForUpdates();

    expect(updaterMocks.autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    expect(service.getStatus()).toEqual({ stage: "not-available", version: "dev" });
  });

  it("calls checkForUpdates in production and reports rejections as errors", async () => {
    updaterMocks.autoUpdater.checkForUpdates.mockRejectedValueOnce(new Error("DNS failed"));
    const service = createService();

    service.checkForUpdates();

    expect(updaterMocks.autoUpdater.checkForUpdates).toHaveBeenCalledOnce();
    await vi.waitFor(() => {
      expect(service.getStatus()).toEqual({ stage: "error", message: "DNS failed" });
    });
  });

  it("does not download unless an update is available", () => {
    createService().downloadUpdate();

    expect(updaterMocks.autoUpdater.downloadUpdate).not.toHaveBeenCalled();
  });

  it("downloads when the current stage is available and reports rejections as errors", async () => {
    updaterMocks.autoUpdater.downloadUpdate.mockRejectedValueOnce(new Error("Disk full"));
    const service = createService();
    updaterMocks.autoUpdater.emit("update-available", { version: "3.0.0", releaseNotes: "" });

    service.downloadUpdate();

    expect(updaterMocks.autoUpdater.downloadUpdate).toHaveBeenCalledOnce();
    await vi.waitFor(() => {
      expect(service.getStatus()).toEqual({ stage: "error", message: "Disk full" });
    });
  });

  it("does not install unless the update has finished downloading", () => {
    createService().installUpdate();

    expect(updaterMocks.autoUpdater.quitAndInstall).not.toHaveBeenCalled();
  });

  it("installs only from the downloaded state", () => {
    const service = createService();
    updaterMocks.autoUpdater.emit("update-downloaded", { version: "1.0.0" });

    service.installUpdate();

    expect(updaterMocks.autoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });
});
