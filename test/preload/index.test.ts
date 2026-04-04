import { beforeEach, describe, expect, it, vi } from "vitest";

const electronMocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(async (_channel: string, args?: unknown) => args),
  on: vi.fn(),
  removeListener: vi.fn(),
}));

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld: electronMocks.exposeInMainWorld,
  },
  ipcRenderer: {
    invoke: electronMocks.invoke,
    on: electronMocks.on,
    removeListener: electronMocks.removeListener,
  },
}));

type ExposedElectronApi = {
  invoke: <T>(channel: string, args?: unknown) => Promise<T>;
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
};

async function loadElectronApi(): Promise<ExposedElectronApi> {
  await import("../../src/preload/index");
  expect(electronMocks.exposeInMainWorld).toHaveBeenCalledOnce();
  return electronMocks.exposeInMainWorld.mock.calls[0][1] as ExposedElectronApi;
}

beforeEach(() => {
  vi.resetModules();
  electronMocks.exposeInMainWorld.mockReset();
  electronMocks.invoke.mockReset();
  electronMocks.invoke.mockImplementation(async (_channel: string, args?: unknown) => args);
  electronMocks.on.mockReset();
  electronMocks.removeListener.mockReset();
});

describe("preload electronAPI bridge", () => {
  it("exposes the electronAPI object to the renderer", async () => {
    const api = await loadElectronApi();

    expect(electronMocks.exposeInMainWorld).toHaveBeenCalledWith(
      "electronAPI",
      expect.objectContaining({
        invoke: expect.any(Function),
        on: expect.any(Function),
      }),
    );
    expect(typeof api.invoke).toBe("function");
    expect(typeof api.on).toBe("function");
  });

  it("forwards allowed invoke channels to ipcRenderer", async () => {
    const api = await loadElectronApi();
    electronMocks.invoke.mockResolvedValueOnce({ ok: true });

    await expect(api.invoke("load-app-snapshot", { refresh: true })).resolves.toEqual({ ok: true });
    expect(electronMocks.invoke).toHaveBeenCalledWith("load-app-snapshot", { refresh: true });
  });

  it("rejects invoke calls for disallowed channels", async () => {
    const api = await loadElectronApi();

    await expect(api.invoke("totally-forbidden-channel")).rejects.toThrow(
      "IPC channel not allowed: totally-forbidden-channel",
    );
    expect(electronMocks.invoke).not.toHaveBeenCalled();
  });

  it("subscribes to allowed event channels and removes the exact listener on unsubscribe", async () => {
    let registeredHandler: ((event: unknown, ...args: unknown[]) => void) | undefined;
    electronMocks.on.mockImplementation((_channel: string, handler: (...args: unknown[]) => void) => {
      registeredHandler = handler as (event: unknown, ...args: unknown[]) => void;
    });
    const api = await loadElectronApi();
    const callback = vi.fn();

    const unsubscribe = api.on("auto-update-status", callback);

    expect(electronMocks.on).toHaveBeenCalledWith("auto-update-status", expect.any(Function));
    registeredHandler?.({}, { stage: "checking" });
    expect(callback).toHaveBeenCalledWith({ stage: "checking" });

    unsubscribe();
    expect(electronMocks.removeListener).toHaveBeenCalledWith("auto-update-status", registeredHandler);
  });

  it("warns and returns a no-op unsubscribe for disallowed event channels", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const api = await loadElectronApi();

    const unsubscribe = api.on("forbidden-event", vi.fn());

    expect(warnSpy).toHaveBeenCalledWith("IPC event channel not allowed: forbidden-event");
    expect(electronMocks.on).not.toHaveBeenCalled();
    expect(() => unsubscribe()).not.toThrow();
    warnSpy.mockRestore();
  });
});
