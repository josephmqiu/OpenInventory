import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppSnapshot } from "../domain/models";
import { GatewayError, loadAppSnapshot } from "./inventoryGateway";

const snapshot: AppSnapshot = {
  items: [],
  alerts: [],
  personnel: [],
  backupPlan: {
    targetPath: "",
    targetType: "local_folder",
    schedule: "",
    retention: "",
    lastSuccessfulBackup: "",
    nextScheduledBackup: "",
    status: "healthy",
  },
  language: "en",
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (typeof window !== "undefined") {
    window.__TAURI_INTERNALS__ = undefined;
    window.localStorage?.clear?.();
  }
});

describe("loadAppSnapshot", () => {
  it("uses the desktop invoke bridge when the Tauri runtime is available", async () => {
    const invoke = vi
      .fn(async () => snapshot) as unknown as NonNullable<Window["__TAURI_INTERNALS__"]>["invoke"];
    window.__TAURI_INTERNALS__ = { invoke };

    await expect(loadAppSnapshot()).resolves.toEqual(snapshot);
    expect(invoke).toHaveBeenCalledWith("load_app_snapshot", undefined);
  });

  it("uses the HTTP API in browser-hosted mode", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(snapshot), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadAppSnapshot()).resolves.toEqual(snapshot);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/snapshot",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("throws an unsupported runtime error when neither desktop nor HTTP APIs are available", async () => {
    vi.stubGlobal("window", undefined);

    await expect(loadAppSnapshot()).rejects.toThrowError(
      "Loading the inventory workspace requires the desktop app or LAN HTTP access.",
    );
  });

  it("extracts an API error message from the response body", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ message: "Snapshot unavailable." }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadAppSnapshot()).rejects.toEqual(new GatewayError("Snapshot unavailable.", 503));
  });

  it("falls back to a generic message when the error response cannot be parsed", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("not-json", {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadAppSnapshot()).rejects.toMatchObject({
      message: "Request failed with status 500.",
      name: "GatewayError",
      status: 500,
    });
  });

  it("falls back to a generic message when the API omits a message field", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: "missing message" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadAppSnapshot()).rejects.toMatchObject({
      message: "Request failed with status 404.",
      name: "GatewayError",
      status: 404,
    });
  });
});
