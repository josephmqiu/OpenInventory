import { useEffect, useState } from "react";
import type { UpdateStatus } from "../domain/models";
import { detectRuntime } from "./runtime";
import * as gateway from "../services/inventoryGateway";

/** Dev-only: map a `?update=<stage>` query param to a sample status so the update
 *  UI can be exercised in the browser preview (production is always Electron, where
 *  the real electron-updater events drive the status instead). */
function devStatusFromQuery(): UpdateStatus | null {
  const stage = new URLSearchParams(window.location.search).get("update");
  switch (stage) {
    case "checking":
      return { stage: "checking" };
    case "available":
      return { stage: "available", version: "0.1.5", releaseNotes: "" };
    case "downloading":
      return { stage: "downloading", percent: 45, transferred: 45_000_000, total: 100_000_000 };
    case "downloaded":
      return { stage: "downloaded", version: "0.1.5" };
    case "not-available":
      return { stage: "not-available", version: "0.1.4" };
    case "error":
      return { stage: "error", message: "Cannot connect to update server. Please check your internet connection." };
    default:
      return null;
  }
}

export function useAutoUpdate() {
  const [status, setStatus] = useState<UpdateStatus>({ stage: "idle" });
  const [appVersion, setAppVersion] = useState<string | null>(null);
  // Session-scoped: dismissing the topbar chip hides it until the next launch.
  // Keyed to the downloaded version so a newer update later in the session still shows.
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  useEffect(() => {
    if (detectRuntime() === "desktop") {
      // Subscribe first so we never miss a push, then seed the current status —
      // but only if no push has already arrived (don't clobber a fresher event).
      const unsub = gateway.onAutoUpdateStatus(setStatus);
      void gateway.getUpdateStatus().then((current) => {
        if (current) setStatus((prev) => (prev.stage === "idle" ? current : prev));
      }).catch(() => {});
      void gateway.getAppVersion().then((v) => {
        if (v) setAppVersion(v);
      }).catch(() => {});
      return unsub;
    }

    // Browser preview (dev only): no Electron updater. Provide a dev affordance so
    // the update UI is testable — drive states via `?update=<stage>` or the
    // `window.__setUpdateStatus(status)` hook (used by the preview tooling).
    if (import.meta.env.DEV) {
      setAppVersion("0.0.0-dev");
      const initial = devStatusFromQuery();
      if (initial) setStatus(initial);
      const w = window as unknown as { __setUpdateStatus?: (s: UpdateStatus) => void };
      w.__setUpdateStatus = setStatus;
      return () => {
        delete w.__setUpdateStatus;
      };
    }
    return undefined;
  }, []);

  const chipDismissed = status.stage === "downloaded" && dismissedVersion === status.version;

  return {
    updateStatus: status,
    appVersion,
    checkForUpdates: () => void gateway.checkForUpdates(),
    installUpdate: () => void gateway.installUpdate(),
    chipDismissed,
    dismissChip: () => {
      if (status.stage === "downloaded") setDismissedVersion(status.version);
    },
  };
}
