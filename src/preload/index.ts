import { contextBridge, ipcRenderer } from "electron";

export interface ElectronAPI {
  invoke: <T>(channel: string, args?: unknown) => Promise<T>;
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
  "update-app-language",
  "remove-inventory-item",
  "add-personnel",
  "remove-personnel",
  "load-lan-access-state",
  "update-lan-access",
  "regenerate-lan-access-key",
]);

const electronAPI: ElectronAPI = {
  invoke: <T>(channel: string, args?: unknown): Promise<T> => {
    if (!ALLOWED_CHANNELS.has(channel)) {
      return Promise.reject(new Error(`IPC channel not allowed: ${channel}`));
    }
    return ipcRenderer.invoke(channel, args);
  },
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);
