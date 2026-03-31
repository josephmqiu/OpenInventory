import { Effect, Context, Layer } from "effect";
import http from "http";
import os from "os";
import path from "path";
import { createLanRouter } from "../infrastructure/lan/router";
import { generateAccessKey } from "../infrastructure/lan/auth";
import type { DatabaseServiceApi, LanAccessSettings } from "./DatabaseService";
import { ServerError, type AppError } from "../domain/errors";

export interface LanAccessState {
  enabled: boolean;
  port: number;
  accessKey: string;
  urls: string[];
  status: "running" | "stopped" | "error";
  statusMessage: string;
}

export interface LanServerServiceApi {
  readonly loadState: () => Effect.Effect<LanAccessState, AppError>;
  readonly updateAccess: (input: {
    enabled: boolean;
    port: number;
  }) => Effect.Effect<LanAccessState, AppError>;
  readonly regenerateAccessKey: () => Effect.Effect<LanAccessState, AppError>;
  readonly shutdown: () => Effect.Effect<void, AppError>;
}

export class LanServerService extends Context.Tag("LanServerService")<
  LanServerService,
  LanServerServiceApi
>() {}

export function makeLanServerService(
  dbService: DatabaseServiceApi,
  rendererDir: string,
): LanServerServiceApi {
  let server: http.Server | null = null;
  let currentSettings: LanAccessSettings = {
    enabled: false,
    port: 4123,
    accessKey: "",
    primaryUrl: "",
  };

  function getLocalIps(): string[] {
    const interfaces = os.networkInterfaces();
    const ips: string[] = [];
    for (const [, addrs] of Object.entries(interfaces)) {
      if (!addrs) continue;
      for (const addr of addrs) {
        if (addr.family === "IPv4" && !addr.internal) {
          ips.push(addr.address);
        }
      }
    }
    return ips;
  }

  function buildUrls(port: number): string[] {
    return getLocalIps().map((ip) => `http://${ip}:${port}`);
  }

  function buildState(
    status: "running" | "stopped" | "error",
    statusMessage: string = "",
  ): LanAccessState {
    const port = actualPort || currentSettings.port;
    return {
      enabled: currentSettings.enabled,
      port,
      accessKey: currentSettings.accessKey,
      urls: status === "running" ? buildUrls(port) : [],
      status,
      statusMessage,
    };
  }

  /** The actual port the server is listening on (may differ from config when port is 0). */
  let actualPort = 0;

  async function startServer(): Promise<void> {
    if (server) {
      await stopServer();
    }

    const router = createLanRouter({
      dbService,
      getAccessKey: () => currentSettings.accessKey,
      rendererDir,
    });

    server = http.createServer(router);

    return new Promise<void>((resolve, reject) => {
      server!.listen(currentSettings.port, () => {
        const addr = server!.address();
        actualPort = typeof addr === "object" && addr ? addr.port : currentSettings.port;
        resolve();
      });
      server!.on("error", (err) => {
        server = null;
        reject(err);
      });
    });
  }

  async function stopServer(): Promise<void> {
    if (!server) return;
    return new Promise<void>((resolve) => {
      server!.close(() => {
        server = null;
        resolve();
      });
    });
  }

  return {
    loadState: () =>
      Effect.tryPromise({
        try: async () => {
          const settings = await Effect.runPromise(dbService.loadLanAccessSettings());
          currentSettings = settings;

          if (!settings.accessKey) {
            const newKey = generateAccessKey();
            currentSettings.accessKey = newKey;
            await Effect.runPromise(dbService.saveLanAccessSettings(currentSettings));
          }

          if (settings.enabled && !server) {
            try {
              await startServer();
              const urls = buildUrls(currentSettings.port);
              if (urls.length > 0) {
                currentSettings.primaryUrl = urls[0];
                await Effect.runPromise(dbService.saveLanAccessSettings(currentSettings));
              }
              return buildState("running");
            } catch (err) {
              return buildState("error", String(err));
            }
          }

          return buildState(server ? "running" : "stopped");
        },
        catch: (e) => new ServerError({ message: String(e) }),
      }),

    updateAccess: (input) =>
      Effect.tryPromise({
        try: async () => {
          currentSettings.enabled = input.enabled;
          currentSettings.port = input.port;

          if (input.enabled) {
            try {
              await startServer();
              const urls = buildUrls(input.port);
              currentSettings.primaryUrl = urls[0] ?? "";
              await Effect.runPromise(dbService.saveLanAccessSettings(currentSettings));
              return buildState("running");
            } catch (err) {
              await Effect.runPromise(dbService.saveLanAccessSettings(currentSettings));
              return buildState("error", String(err));
            }
          } else {
            await stopServer();
            currentSettings.primaryUrl = "";
            await Effect.runPromise(dbService.saveLanAccessSettings(currentSettings));
            return buildState("stopped");
          }
        },
        catch: (e) => new ServerError({ message: String(e) }),
      }),

    regenerateAccessKey: () =>
      Effect.tryPromise({
        try: async () => {
          const newKey = generateAccessKey();
          currentSettings.accessKey = newKey;
          await Effect.runPromise(dbService.saveLanAccessSettings(currentSettings));

          if (currentSettings.enabled && server) {
            // Restart server to pick up new key
            await stopServer();
            await startServer();
          }

          return buildState(server ? "running" : "stopped");
        },
        catch: (e) => new ServerError({ message: String(e) }),
      }),

    shutdown: () =>
      Effect.tryPromise({
        try: async () => {
          await stopServer();
        },
        catch: (e) => new ServerError({ message: String(e) }),
      }),
  };
}
