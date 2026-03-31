declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      invoke?: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
    };
  }
}

export type Runtime = "desktop" | "http";

function getTauriInvoke() {
  return typeof window === "undefined" ? undefined : window.__TAURI_INTERNALS__?.invoke;
}

export function detectRuntime(): Runtime {
  if (typeof getTauriInvoke() === "function") {
    return "desktop";
  }

  return "http";
}

export function readIssueRouteItemId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const match = /^\/issue\/([^/]+)\/?$/i.exec(window.location.pathname);
  return match ? decodeURIComponent(match[1]) : null;
}
