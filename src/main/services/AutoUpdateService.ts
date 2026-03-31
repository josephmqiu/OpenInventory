import { autoUpdater, type UpdateInfo, type ProgressInfo } from "electron-updater";
import { is } from "@electron-toolkit/utils";

export type UpdateStatus =
  | { stage: "idle" }
  | { stage: "checking" }
  | { stage: "available"; version: string; releaseNotes: string }
  | { stage: "not-available"; version: string }
  | { stage: "downloading"; percent: number; transferred: number; total: number }
  | { stage: "downloaded"; version: string }
  | { stage: "error"; message: string };

export interface AutoUpdateServiceApi {
  readonly checkForUpdates: () => void;
  readonly downloadUpdate: () => void;
  readonly installUpdate: () => void;
  readonly getStatus: () => UpdateStatus;
}

export function makeAutoUpdateService(
  onStatusChange: (status: UpdateStatus) => void,
): AutoUpdateServiceApi {
  let currentStatus: UpdateStatus = { stage: "idle" };

  function setStatus(status: UpdateStatus): void {
    currentStatus = status;
    onStatusChange(status);
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    setStatus({ stage: "checking" });
  });

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    setStatus({
      stage: "available",
      version: info.version,
      releaseNotes: typeof info.releaseNotes === "string" ? info.releaseNotes : "",
    });
  });

  autoUpdater.on("update-not-available", (info: UpdateInfo) => {
    setStatus({ stage: "not-available", version: info.version });
  });

  autoUpdater.on("download-progress", (progress: ProgressInfo) => {
    setStatus({
      stage: "downloading",
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    setStatus({ stage: "downloaded", version: info.version });
  });

  autoUpdater.on("error", (err: Error) => {
    setStatus({ stage: "error", message: err.message });
  });

  return {
    checkForUpdates: () => {
      if (is.dev) {
        setStatus({ stage: "not-available", version: "dev" });
        return;
      }
      autoUpdater.checkForUpdates().catch((err: Error) => {
        setStatus({ stage: "error", message: err.message });
      });
    },
    downloadUpdate: () => {
      if (is.dev) return;
      autoUpdater.downloadUpdate().catch((err: Error) => {
        setStatus({ stage: "error", message: err.message });
      });
    },
    installUpdate: () => {
      autoUpdater.quitAndInstall(false, true);
    },
    getStatus: () => currentStatus,
  };
}
