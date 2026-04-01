import { Effect, Context, Layer } from "effect";
import http from "http";
import os from "os";
import { createLanRouter } from "../infrastructure/lan/router";
import { generateAccessKey } from "../infrastructure/lan/auth";
import { DatabaseService, type DatabaseServiceApi, type LanAccessSettings } from "./DatabaseService";
import { backendMessages, normalizeBackendLanguage, ServerError, type AppError } from "../domain/errors";
import type { LanAccessState } from "../../shared/types";
export type { LanAccessState } from "../../shared/types";

// ─── Service Interface ───────────────────────────────────────────────────────

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

// ─── Shared Helpers ──────────────────────────────────────────────────────────

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

// ─── Scoped Layer (production) ───────────────────────────────────────────────

export function makeLanServerLayer(
  rendererDir: string,
): Layer.Layer<LanServerService, never, DatabaseService> {
  return Layer.scoped(
    LanServerService,
    Effect.acquireRelease(
      Effect.gen(function* () {
        const db = yield* DatabaseService;
        const mutex = yield* Effect.makeSemaphore(1);
        const serialized = <A, E>(eff: Effect.Effect<A, E>) =>
          mutex.withPermits(1)(eff);

        // Mutable closure state
        let server: http.Server | null = null;
        let currentSettings: LanAccessSettings = {
          enabled: false,
          port: 4123,
          accessKey: "",
          primaryUrl: "",
        };
        let actualPort = 0;

        function buildState(
          status: "running" | "stopped" | "error",
          statusMessage = "",
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

        // Wrap Node callback APIs as Effects
        const startServerEffect: Effect.Effect<void, Error> = Effect.async<void, Error>(
          (resume) => {
            const doStart = (): void => {
              const router = createLanRouter({
                dbService: db,
                getAccessKey: () => currentSettings.accessKey,
                rendererDir,
              });
              server = http.createServer(router);
              server.listen(currentSettings.port, () => {
                const addr = server!.address();
                actualPort =
                  typeof addr === "object" && addr
                    ? addr.port
                    : currentSettings.port;
                resume(Effect.void);
              });
              server.on("error", (err) => {
                server = null;
                resume(Effect.fail(err));
              });
            };
            if (server) {
              server.close(() => {
                server = null;
                doStart();
              });
            } else {
              doStart();
            }
          },
        );

        const stopServerEffect: Effect.Effect<void> = Effect.async<void>(
          (resume) => {
            if (!server) {
              resume(Effect.void);
              return;
            }
            server.close(() => {
              server = null;
              resume(Effect.void);
            });
          },
        );

        const resolveMessages = db.loadSnapshot().pipe(
          Effect.map((s) =>
            backendMessages(normalizeBackendLanguage(s.language)),
          ),
          Effect.catchAll(() => Effect.succeed(backendMessages("en"))),
        );

        const api: LanServerServiceApi = {
          loadState: () =>
            serialized(
              Effect.gen(function* () {
                const messages = yield* resolveMessages;
                const settings = yield* db.loadLanAccessSettings();
                currentSettings = settings;

                if (!settings.accessKey) {
                  currentSettings.accessKey = generateAccessKey();
                  yield* db.saveLanAccessSettings(currentSettings);
                }

                if (settings.enabled && !server) {
                  const started = yield* startServerEffect.pipe(
                    Effect.as(true),
                    Effect.catchAll(() => Effect.succeed(false)),
                  );
                  if (started) {
                    const urls = buildUrls(
                      actualPort || currentSettings.port,
                    );
                    if (urls.length > 0) {
                      currentSettings.primaryUrl = urls[0];
                    }
                    yield* db.saveLanAccessSettings(currentSettings);
                    return buildState(
                      "running",
                      messages.lanServerRunning,
                    );
                  }
                  return buildState("error", messages.lanServerError);
                }

                return buildState(
                  server ? "running" : "stopped",
                  server
                    ? messages.lanServerRunning
                    : messages.lanServerStopped,
                );
              }).pipe(
                Effect.catchAll(() =>
                  Effect.fail(
                    new ServerError({
                      message: backendMessages("en").serverError,
                    }),
                  ),
                ),
              ),
            ),

          updateAccess: (input) =>
            serialized(
              Effect.gen(function* () {
                const messages = yield* resolveMessages;
                currentSettings.enabled = input.enabled;
                currentSettings.port = input.port;

                if (input.enabled) {
                  const started = yield* startServerEffect.pipe(
                    Effect.as(true),
                    Effect.catchAll(() => Effect.succeed(false)),
                  );
                  if (started) {
                    const urls = buildUrls(input.port);
                    currentSettings.primaryUrl = urls[0] ?? "";
                  } else {
                    currentSettings.primaryUrl = "";
                  }
                  yield* db.saveLanAccessSettings(currentSettings);
                  return started
                    ? buildState("running", messages.lanServerRunning)
                    : buildState("error", messages.lanServerError);
                }

                yield* stopServerEffect;
                currentSettings.primaryUrl = "";
                yield* db.saveLanAccessSettings(currentSettings);
                return buildState("stopped", messages.lanServerStopped);
              }).pipe(
                Effect.catchAll(() =>
                  Effect.fail(
                    new ServerError({
                      message: backendMessages("en").serverError,
                    }),
                  ),
                ),
              ),
            ),

          regenerateAccessKey: () =>
            serialized(
              Effect.gen(function* () {
                const messages = yield* resolveMessages;
                currentSettings.accessKey = generateAccessKey();
                yield* db.saveLanAccessSettings(currentSettings);

                if (currentSettings.enabled && server) {
                  yield* stopServerEffect;
                  yield* startServerEffect.pipe(
                    Effect.catchAll(() => Effect.void),
                  );
                }

                return buildState(
                  server ? "running" : "stopped",
                  server
                    ? messages.lanServerRunning
                    : messages.lanServerStopped,
                );
              }).pipe(
                Effect.catchAll(() =>
                  Effect.fail(
                    new ServerError({
                      message: backendMessages("en").serverError,
                    }),
                  ),
                ),
              ),
            ),

          shutdown: () =>
            stopServerEffect.pipe(
              Effect.catchAll(() => Effect.void),
            ) as Effect.Effect<void, AppError>,
        };

        return api;
      }),
      // Finalizer: stop the server when the scope closes
      (api) => api.shutdown().pipe(Effect.catchAll(() => Effect.void)),
    ),
  );
}

// ─── Test-Only Factory (backward compatible, no layer) ───────────────────────

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

  let actualPort = 0;

  function buildState(
    status: "running" | "stopped" | "error",
    statusMessage = "",
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
        actualPort =
          typeof addr === "object" && addr
            ? addr.port
            : currentSettings.port;
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

  async function resolveMessages() {
    try {
      const snapshot = await Effect.runPromise(dbService.loadSnapshot());
      return backendMessages(normalizeBackendLanguage(snapshot.language));
    } catch {
      return backendMessages("en");
    }
  }

  return {
    loadState: () => {
      let messages = backendMessages("en");
      return Effect.tryPromise({
        try: async () => {
          messages = await resolveMessages();
          const settings = await Effect.runPromise(
            dbService.loadLanAccessSettings(),
          );
          currentSettings = settings;

          if (!settings.accessKey) {
            const newKey = generateAccessKey();
            currentSettings.accessKey = newKey;
            await Effect.runPromise(
              dbService.saveLanAccessSettings(currentSettings),
            );
          }

          if (settings.enabled && !server) {
            try {
              await startServer();
              const urls = buildUrls(currentSettings.port);
              if (urls.length > 0) {
                currentSettings.primaryUrl = urls[0];
                await Effect.runPromise(
                  dbService.saveLanAccessSettings(currentSettings),
                );
              }
              return buildState("running", messages.lanServerRunning);
            } catch {
              return buildState("error", messages.lanServerError);
            }
          }

          return buildState(
            server ? "running" : "stopped",
            server ? messages.lanServerRunning : messages.lanServerStopped,
          );
        },
        catch: () => new ServerError({ message: messages.serverError }),
      });
    },

    updateAccess: (input) => {
      let messages = backendMessages("en");
      return Effect.tryPromise({
        try: async () => {
          messages = await resolveMessages();
          currentSettings.enabled = input.enabled;
          currentSettings.port = input.port;

          if (input.enabled) {
            try {
              await startServer();
              const urls = buildUrls(input.port);
              currentSettings.primaryUrl = urls[0] ?? "";
              await Effect.runPromise(
                dbService.saveLanAccessSettings(currentSettings),
              );
              return buildState("running", messages.lanServerRunning);
            } catch {
              await Effect.runPromise(
                dbService.saveLanAccessSettings(currentSettings),
              );
              return buildState("error", messages.lanServerError);
            }
          }

          await stopServer();
          currentSettings.primaryUrl = "";
          await Effect.runPromise(
            dbService.saveLanAccessSettings(currentSettings),
          );
          return buildState("stopped", messages.lanServerStopped);
        },
        catch: () => new ServerError({ message: messages.serverError }),
      });
    },

    regenerateAccessKey: () => {
      let messages = backendMessages("en");
      return Effect.tryPromise({
        try: async () => {
          messages = await resolveMessages();
          const newKey = generateAccessKey();
          currentSettings.accessKey = newKey;
          await Effect.runPromise(
            dbService.saveLanAccessSettings(currentSettings),
          );

          if (currentSettings.enabled && server) {
            await stopServer();
            await startServer();
          }

          return buildState(
            server ? "running" : "stopped",
            server ? messages.lanServerRunning : messages.lanServerStopped,
          );
        },
        catch: () => new ServerError({ message: messages.serverError }),
      });
    },

    shutdown: () => {
      const messages = backendMessages("en");
      return Effect.tryPromise({
        try: async () => {
          await stopServer();
        },
        catch: () => new ServerError({ message: messages.serverError }),
      });
    },
  };
}
