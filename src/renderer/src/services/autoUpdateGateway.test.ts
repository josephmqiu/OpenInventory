/**
 * Auto-update gateway and hook tests.
 *
 * Tests the renderer-side auto-update integration:
 * - Gateway functions route through the correct IPC channels
 * - Gateway functions no-op in non-desktop runtime
 * - onAutoUpdateStatus subscribes to push events and returns an unsubscribe function
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkForUpdates,
  downloadUpdate,
  getAppVersion,
  getUpdateStatus,
  installUpdate,
  onAutoUpdateStatus,
} from "./inventoryGateway";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (typeof window !== "undefined") {
    window.electronAPI = undefined;
  }
});

describe("auto-update gateway — desktop runtime", () => {
  it("checkForUpdates invokes check-for-updates channel", async () => {
    const invoke = vi.fn(async () => undefined);
    window.electronAPI = { invoke, on: vi.fn() };

    await checkForUpdates();
    expect(invoke).toHaveBeenCalledWith("check-for-updates", undefined);
  });

  it("downloadUpdate invokes download-update channel", async () => {
    const invoke = vi.fn(async () => undefined);
    window.electronAPI = { invoke, on: vi.fn() };

    await downloadUpdate();
    expect(invoke).toHaveBeenCalledWith("download-update", undefined);
  });

  it("installUpdate invokes install-update channel", async () => {
    const invoke = vi.fn(async () => undefined);
    window.electronAPI = { invoke, on: vi.fn() };

    await installUpdate();
    expect(invoke).toHaveBeenCalledWith("install-update", undefined);
  });

  it("getAppVersion invokes get-app-version channel and returns the version", async () => {
    const invoke = vi.fn(async () => "1.2.3");
    window.electronAPI = { invoke, on: vi.fn() };

    await expect(getAppVersion()).resolves.toBe("1.2.3");
    expect(invoke).toHaveBeenCalledWith("get-app-version", undefined);
  });

  it("getUpdateStatus invokes get-update-status channel and returns the status", async () => {
    const invoke = vi.fn(async () => ({ stage: "downloaded", version: "1.2.3" }));
    window.electronAPI = { invoke, on: vi.fn() };

    await expect(getUpdateStatus()).resolves.toEqual({ stage: "downloaded", version: "1.2.3" });
    expect(invoke).toHaveBeenCalledWith("get-update-status", undefined);
  });
});

describe("auto-update gateway — non-desktop runtime", () => {
  it("checkForUpdates is a no-op when electronAPI is absent", async () => {
    // No electronAPI = http runtime
    await expect(checkForUpdates()).resolves.toBeUndefined();
  });

  it("downloadUpdate is a no-op when electronAPI is absent", async () => {
    await expect(downloadUpdate()).resolves.toBeUndefined();
  });

  it("installUpdate is a no-op when electronAPI is absent", async () => {
    await expect(installUpdate()).resolves.toBeUndefined();
  });

  it("getAppVersion returns null when electronAPI is absent", async () => {
    await expect(getAppVersion()).resolves.toBeNull();
  });

  it("getUpdateStatus returns null when electronAPI is absent", async () => {
    await expect(getUpdateStatus()).resolves.toBeNull();
  });
});

describe("onAutoUpdateStatus", () => {
  it("subscribes to auto-update-status channel and returns unsubscribe function", () => {
    const unsub = vi.fn();
    const onFn = vi.fn().mockReturnValue(unsub);
    window.electronAPI = { invoke: vi.fn(), on: onFn };

    const result = onAutoUpdateStatus(() => {});
    expect(onFn).toHaveBeenCalledWith("auto-update-status", expect.any(Function));
    expect(typeof result).toBe("function");
  });

  it("returns a no-op unsubscribe when electronAPI is absent", () => {
    const unsub = onAutoUpdateStatus(() => {});
    expect(typeof unsub).toBe("function");
    // Should not throw
    unsub();
  });

  it("returns a no-op unsubscribe when electronAPI.on is not defined", () => {
    window.electronAPI = { invoke: vi.fn() } as unknown as typeof window.electronAPI;
    const unsub = onAutoUpdateStatus(() => {});
    expect(typeof unsub).toBe("function");
    unsub();
  });

  it("forwards status updates to the callback", () => {
    let capturedCallback: ((...args: unknown[]) => void) | undefined;
    const onFn = vi.fn((channel: string, cb: (...args: unknown[]) => void) => {
      if (channel === "auto-update-status") {
        capturedCallback = cb;
      }
      return () => {};
    });
    window.electronAPI = { invoke: vi.fn(), on: onFn };

    const receivedStatuses: unknown[] = [];
    onAutoUpdateStatus((status) => receivedStatuses.push(status));

    // Simulate push from main process
    capturedCallback!({ stage: "checking" });
    capturedCallback!({ stage: "available", version: "1.0.0", releaseNotes: "" });

    expect(receivedStatuses).toEqual([
      { stage: "checking" },
      { stage: "available", version: "1.0.0", releaseNotes: "" },
    ]);
  });
});
