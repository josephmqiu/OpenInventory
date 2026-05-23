import { contextBridge, ipcRenderer } from "electron";

export interface ElectronAPI {
  invoke: <T>(channel: string, args?: unknown) => Promise<T>;
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
}

const ALLOWED_CHANNELS = new Set([
  "app-health",
  "load-app-snapshot",
  "create-inventory-item",
  "update-inventory-item",
  "receive-stock",
  "issue-material",
  "batch-issue-material",
  "get-item-movements",
  "update-backup-plan",
  "backup-now",
  "export-qr-label",
  "export-qr-labels",
  "select-backup-directory",
  "select-restore-source",
  "validate-backup",
  "restore-from-backup",
  "update-app-language",
  "update-app-currency",
  "remove-inventory-item",
  "add-personnel",
  "remove-personnel",
  "delete-movement",
  "load-lan-access-state",
  "update-lan-access",
  "regenerate-lan-access-key",
  "get-audit-movements",
  "get-audit-analytics",
  "check-for-updates",
  "download-update",
  "install-update",
  "get-app-version",
  "get-update-status",
]);

const ALLOWED_EVENT_CHANNELS = new Set([
  "auto-update-status",
]);

const electronAPI: ElectronAPI = {
  invoke: <T>(channel: string, args?: unknown): Promise<T> => {
    if (!ALLOWED_CHANNELS.has(channel)) {
      return Promise.reject(new Error(`IPC channel not allowed: ${channel}`));
    }
    return ipcRenderer.invoke(channel, args);
  },
  on: (channel: string, callback: (...args: unknown[]) => void): (() => void) => {
    if (!ALLOWED_EVENT_CHANNELS.has(channel)) {
      console.warn(`IPC event channel not allowed: ${channel}`);
      return () => {};
    }
    const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void => callback(...args);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);
