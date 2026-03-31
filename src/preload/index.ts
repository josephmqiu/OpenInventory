import { contextBridge, ipcRenderer } from "electron";

export interface ElectronAPI {
  invoke: <T>(channel: string, args?: unknown) => Promise<T>;
}

const electronAPI: ElectronAPI = {
  invoke: <T>(channel: string, args?: unknown): Promise<T> => {
    return ipcRenderer.invoke(channel, args);
  },
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);
