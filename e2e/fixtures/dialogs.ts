import type { ElectronApplication } from "@playwright/test";

type Envelope<T> = { ok: true; data: T };
type StubbedIpcChannel =
  | "select-restore-source"
  | "validate-backup"
  | "restore-from-backup";
type UnknownHandler = (...args: unknown[]) => unknown;

export async function stubSaveDialog(
  app: ElectronApplication,
  filePath: string,
): Promise<void> {
  await app.evaluate(async ({ dialog }, nextPath) => {
    const g = globalThis as typeof globalThis & {
      __e2eOriginalSaveDialog?: typeof dialog.showSaveDialog;
      __e2eSaveDialogDefaultPath?: string | null;
    };
    g.__e2eOriginalSaveDialog ??= dialog.showSaveDialog;
    g.__e2eSaveDialogDefaultPath = null;
    dialog.showSaveDialog = async (_window, options) => {
      g.__e2eSaveDialogDefaultPath = options?.defaultPath ?? null;
      return { canceled: false, filePath: nextPath };
    };
  }, filePath);
}

export async function readSaveDialogDefaultPath(
  app: ElectronApplication,
): Promise<string | null> {
  return app.evaluate(() => {
    const g = globalThis as typeof globalThis & {
      __e2eSaveDialogDefaultPath?: string | null;
    };
    return g.__e2eSaveDialogDefaultPath ?? null;
  });
}

export async function stubOpenDialog(
  app: ElectronApplication,
  directoryPath: string,
): Promise<void> {
  await app.evaluate(async ({ dialog }, nextPath) => {
    const g = globalThis as typeof globalThis & {
      __e2eOriginalOpenDialog?: typeof dialog.showOpenDialog;
    };
    g.__e2eOriginalOpenDialog ??= dialog.showOpenDialog;
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [nextPath],
    });
  }, directoryPath);
}

export async function stubRestoreSelection(
  app: ElectronApplication,
  selectedPath: string,
): Promise<void> {
  await app.evaluate(async ({ ipcMain }, nextPath) => {
    const g = globalThis as typeof globalThis & {
      __e2eOriginalIpcHandlers?: Partial<Record<StubbedIpcChannel, UnknownHandler | null>>;
    };
    const invokeHandlers = (ipcMain as typeof ipcMain & {
      _invokeHandlers?: Map<string, UnknownHandler>;
    })._invokeHandlers;
    g.__e2eOriginalIpcHandlers ??= {};
    g.__e2eOriginalIpcHandlers["select-restore-source"] ??=
      invokeHandlers?.get("select-restore-source") ?? null;

    ipcMain.removeHandler("select-restore-source");
    ipcMain.handle("select-restore-source", async () => ({ ok: true, data: nextPath }));
  }, selectedPath);
}

export async function stubValidateBackupResult(
  app: ElectronApplication,
  result: {
    validation: { valid: boolean; error?: string };
    comparison?: unknown;
  },
): Promise<void> {
  await app.evaluate(async ({ ipcMain }, nextResult) => {
    const g = globalThis as typeof globalThis & {
      __e2eOriginalIpcHandlers?: Partial<Record<StubbedIpcChannel, UnknownHandler | null>>;
    };
    const invokeHandlers = (ipcMain as typeof ipcMain & {
      _invokeHandlers?: Map<string, UnknownHandler>;
    })._invokeHandlers;
    g.__e2eOriginalIpcHandlers ??= {};
    g.__e2eOriginalIpcHandlers["validate-backup"] ??=
      invokeHandlers?.get("validate-backup") ?? null;

    ipcMain.removeHandler("validate-backup");
    ipcMain.handle("validate-backup", async () => {
      return { ok: true, data: nextResult } satisfies Envelope<typeof nextResult>;
    });
  }, result);
}

export async function stubRestoreFromBackupSuccess(
  app: ElectronApplication,
): Promise<void> {
  await app.evaluate(async ({ ipcMain }) => {
    const g = globalThis as typeof globalThis & {
      __e2eOriginalIpcHandlers?: Partial<Record<StubbedIpcChannel, UnknownHandler | null>>;
      __e2eRestoreCalls?: string[];
    };
    const invokeHandlers = (ipcMain as typeof ipcMain & {
      _invokeHandlers?: Map<string, UnknownHandler>;
    })._invokeHandlers;
    g.__e2eOriginalIpcHandlers ??= {};
    g.__e2eRestoreCalls = [];
    g.__e2eOriginalIpcHandlers["restore-from-backup"] ??=
      invokeHandlers?.get("restore-from-backup") ?? null;

    ipcMain.removeHandler("restore-from-backup");
    ipcMain.handle("restore-from-backup", async (_event, rawArgs) => {
      const args = rawArgs as { dirPath?: string } | undefined;
      g.__e2eRestoreCalls?.push(args?.dirPath ?? "");
      return { ok: true, data: undefined } satisfies Envelope<undefined>;
    });
  });
}

export async function readRestoreFromBackupCalls(
  app: ElectronApplication,
): Promise<string[]> {
  return app.evaluate(() => {
    const g = globalThis as typeof globalThis & {
      __e2eRestoreCalls?: string[];
    };
    return g.__e2eRestoreCalls ?? [];
  });
}

export async function stubRestoreRelaunchCapture(
  app: ElectronApplication,
): Promise<void> {
  await app.evaluate(async ({ app }) => {
    const g = globalThis as typeof globalThis & {
      __e2eOriginalExit?: typeof app.exit;
      __e2eOriginalRelaunch?: typeof app.relaunch;
      __e2eRestoreRelaunchCalls?: Array<{ type: "relaunch" | "exit"; code?: number }>;
    };
    g.__e2eOriginalRelaunch ??= app.relaunch.bind(app);
    g.__e2eOriginalExit ??= app.exit.bind(app);
    g.__e2eRestoreRelaunchCalls = [];
    app.relaunch = () => {
      g.__e2eRestoreRelaunchCalls?.push({ type: "relaunch" });
    };
    app.exit = (code?: number) => {
      g.__e2eRestoreRelaunchCalls?.push({ type: "exit", code });
    };
  });
}

export async function readRestoreRelaunchCalls(
  app: ElectronApplication,
): Promise<Array<{ type: "relaunch" | "exit"; code?: number }>> {
  return app.evaluate(() => {
    const g = globalThis as typeof globalThis & {
      __e2eRestoreRelaunchCalls?: Array<{ type: "relaunch" | "exit"; code?: number }>;
    };
    return g.__e2eRestoreRelaunchCalls ?? [];
  });
}

export async function restoreElectronTestStubs(
  app: ElectronApplication,
): Promise<void> {
  await app.evaluate(async ({ app, dialog, ipcMain }) => {
    const g = globalThis as typeof globalThis & {
      __e2eOriginalExit?: typeof app.exit;
      __e2eOriginalIpcHandlers?: Partial<Record<StubbedIpcChannel, UnknownHandler | null>>;
      __e2eOriginalOpenDialog?: typeof dialog.showOpenDialog;
      __e2eOriginalRelaunch?: typeof app.relaunch;
      __e2eOriginalSaveDialog?: typeof dialog.showSaveDialog;
      __e2eRestoreCalls?: string[];
      __e2eRestoreRelaunchCalls?: Array<{ type: "relaunch" | "exit"; code?: number }>;
      __e2eSaveDialogDefaultPath?: string | null;
    };

    if (g.__e2eOriginalSaveDialog) {
      dialog.showSaveDialog = g.__e2eOriginalSaveDialog;
      delete g.__e2eOriginalSaveDialog;
    }

    if (g.__e2eOriginalOpenDialog) {
      dialog.showOpenDialog = g.__e2eOriginalOpenDialog;
      delete g.__e2eOriginalOpenDialog;
    }

    const originalHandlers = g.__e2eOriginalIpcHandlers;
    if (originalHandlers) {
      for (const [channel, handler] of Object.entries(originalHandlers) as Array<
        [StubbedIpcChannel, UnknownHandler | null]
      >) {
        ipcMain.removeHandler(channel);
        if (handler) {
          ipcMain.handle(channel, handler);
        }
      }
      delete g.__e2eOriginalIpcHandlers;
    }

    if (g.__e2eOriginalRelaunch) {
      app.relaunch = g.__e2eOriginalRelaunch;
      delete g.__e2eOriginalRelaunch;
    }

    if (g.__e2eOriginalExit) {
      app.exit = g.__e2eOriginalExit;
      delete g.__e2eOriginalExit;
    }

    delete g.__e2eRestoreCalls;
    delete g.__e2eRestoreRelaunchCalls;
    delete g.__e2eSaveDialogDefaultPath;
  });
}
