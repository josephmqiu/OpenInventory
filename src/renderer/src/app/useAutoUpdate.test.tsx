import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UpdateStatus } from "../domain/models";

const gatewayMocks = vi.hoisted(() => ({
  onAutoUpdateStatus: vi.fn(),
  getAppVersion: vi.fn(),
  getUpdateStatus: vi.fn().mockResolvedValue({ stage: "idle" }),
  checkForUpdates: vi.fn(),
  installUpdate: vi.fn(),
  downloadUpdate: vi.fn(),
}));
const runtimeMocks = vi.hoisted(() => ({ detectRuntime: vi.fn() }));

vi.mock("../services/inventoryGateway", () => gatewayMocks);
vi.mock("./runtime", () => runtimeMocks);

import { useAutoUpdate } from "./useAutoUpdate";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  window.history.replaceState({}, "", "/");
  delete (window as unknown as { __setUpdateStatus?: unknown }).__setUpdateStatus;
});

describe("useAutoUpdate — desktop runtime", () => {
  it("subscribes to status pushes, loads the app version, and dismisses the chip", async () => {
    runtimeMocks.detectRuntime.mockReturnValue("desktop");
    let push: (s: UpdateStatus) => void = () => {};
    gatewayMocks.onAutoUpdateStatus.mockImplementation((cb: (s: UpdateStatus) => void) => {
      push = cb;
      return () => {};
    });
    gatewayMocks.getAppVersion.mockResolvedValue("0.1.4");

    const { result } = renderHook(() => useAutoUpdate());

    expect(result.current.updateStatus).toEqual({ stage: "idle" });
    await waitFor(() => expect(result.current.appVersion).toBe("0.1.4"));

    act(() => push({ stage: "downloaded", version: "0.1.5" }));
    expect(result.current.updateStatus).toEqual({ stage: "downloaded", version: "0.1.5" });

    expect(result.current.chipDismissed).toBe(false);
    act(() => result.current.dismissChip());
    expect(result.current.chipDismissed).toBe(true);
  });

  it("routes actions through the gateway", () => {
    runtimeMocks.detectRuntime.mockReturnValue("desktop");
    gatewayMocks.onAutoUpdateStatus.mockReturnValue(() => {});
    gatewayMocks.getAppVersion.mockResolvedValue("0.1.4");

    const { result } = renderHook(() => useAutoUpdate());
    act(() => result.current.checkForUpdates());
    act(() => result.current.installUpdate());

    expect(gatewayMocks.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(gatewayMocks.installUpdate).toHaveBeenCalledTimes(1);
  });
});

describe("useAutoUpdate — browser/dev simulator", () => {
  it("sets a dev version, exposes a window hook to drive status, and skips the Electron channel", async () => {
    runtimeMocks.detectRuntime.mockReturnValue("http");

    const { result } = renderHook(() => useAutoUpdate());

    await waitFor(() => expect(result.current.appVersion).toBe("0.0.0-dev"));
    // does not subscribe to the (unavailable) Electron push channel in the browser
    expect(gatewayMocks.onAutoUpdateStatus).not.toHaveBeenCalled();

    const setStatus = (window as unknown as { __setUpdateStatus: (s: UpdateStatus) => void }).__setUpdateStatus;
    expect(typeof setStatus).toBe("function");
    act(() => setStatus({ stage: "downloaded", version: "0.1.5" }));
    expect(result.current.updateStatus).toEqual({ stage: "downloaded", version: "0.1.5" });
  });
});
