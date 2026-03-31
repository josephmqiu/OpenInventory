declare global {
  interface Window {
    electronAPI?: {
      invoke: <T>(channel: string, args?: unknown) => Promise<T>;
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

export function readIssueRouteItemId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const match = /^\/issue\/([^/]+)\/?$/i.exec(window.location.pathname);
  return match ? decodeURIComponent(match[1]) : null;
}
