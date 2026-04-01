declare global {
  interface Window {
    electronAPI?: {
      invoke: <T>(channel: string, args?: unknown) => Promise<T>;
      on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
    };
  }
}

export type Runtime = "desktop" | "http";

export function detectRuntime(): Runtime {
  if (typeof window !== "undefined" && window.electronAPI) {
    return "desktop";
  }

  return "http";
}

export function isDevPreviewRuntime(): boolean {
  return import.meta.env.DEV;
}
