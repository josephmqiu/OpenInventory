import electronUpdater from "electron-updater";
const { autoUpdater } = electronUpdater;
type UpdateInfo = electronUpdater.UpdateInfo;
type ProgressInfo = electronUpdater.ProgressInfo;
import { is } from "@electron-toolkit/utils";
import { app } from "electron";

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

export interface AutoUpdateServiceOptions {
  readonly prepareInstall?: (version: string) => Promise<unknown>;
}

export function makeAutoUpdateService(
  onStatusChange: (status: UpdateStatus) => void,
  options: AutoUpdateServiceOptions = {},
): AutoUpdateServiceApi {
  let currentStatus: UpdateStatus = { stage: "idle" };
  let installInProgress = false;

  function setStatus(status: UpdateStatus): void {
    currentStatus = status;
    onStatusChange(status);
  }

  // Silent background download (Claude/ChatGPT-style): the user is never asked to
  // download — electron-updater fetches automatically once an update is available,
  // and the only user-facing moment is "ready → restart".
  autoUpdater.autoDownload = true;
  // Install ONLY via the explicit Restart path (installUpdate → prepareInstall →
  // quitAndInstall). autoInstallOnAppQuit would silently install a downloaded
  // update on ordinary quit, bypassing the verified pre-update backup that
  // prepareInstall performs — leaving no rollback point if the update is bad.
  autoUpdater.autoInstallOnAppQuit = false;

  // 检查更新服务器配置
  try {
    const appVersion = app.getVersion();
    console.log(`[AutoUpdateService] App version: ${appVersion}`);
  } catch (error) {
    console.error("[AutoUpdateService] Error getting app version:", error);
  }

  autoUpdater.on("checking-for-update", () => {
    console.log("[AutoUpdateService] Checking for updates...");
    setStatus({ stage: "checking" });
  });

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    console.log(`[AutoUpdateService] Update available: ${info.version}`);
    setStatus({
      stage: "available",
      version: info.version,
      releaseNotes: typeof info.releaseNotes === "string" ? info.releaseNotes : "",
    });
  });

  autoUpdater.on("update-not-available", (info: UpdateInfo) => {
    console.log(`[AutoUpdateService] No update available. Current version: ${info.version}`);
    setStatus({ stage: "not-available", version: info.version });
  });

  autoUpdater.on("download-progress", (progress: ProgressInfo) => {
    console.log(`[AutoUpdateService] Download progress: ${Math.round(progress.percent)}%`);
    setStatus({
      stage: "downloading",
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    console.log(`[AutoUpdateService] Update downloaded: ${info.version}`);
    setStatus({ stage: "downloaded", version: info.version });
  });

  autoUpdater.on("error", (err: Error) => {
    console.error("[AutoUpdateService] Update error:", err);
    let errorMessage = err.message;
    
    // 提供更清晰的错误信息
    if (errorMessage.includes("net::ERR_NAME_NOT_RESOLVED")) {
      errorMessage = "Cannot connect to update server. Please check your internet connection.";
    } else if (errorMessage.includes("404")) {
      errorMessage = "Update server not found. Please contact support.";
    } else if (errorMessage.includes("ENOENT")) {
      errorMessage = "Update configuration not found. Please check the app settings.";
    }
    
    setStatus({ stage: "error", message: errorMessage });
  });

  return {
    checkForUpdates: () => {
      if (is.dev) {
        console.log("[AutoUpdateService] Development mode: skipping update check");
        setStatus({ stage: "not-available", version: "dev" });
        return;
      }
      
      console.log("[AutoUpdateService] Starting update check...");
      autoUpdater.checkForUpdates().catch((err: Error) => {
        console.error("[AutoUpdateService] Check for updates failed:", err);
        let errorMessage = err.message;
        
        if (errorMessage.includes("net::ERR_NAME_NOT_RESOLVED")) {
          errorMessage = "Cannot connect to update server. Please check your internet connection.";
        } else if (errorMessage.includes("404")) {
          errorMessage = "Update server not found. Please contact support.";
        } else if (errorMessage.includes("ENOENT")) {
          errorMessage = "Update configuration not found. Please check the app settings.";
        }
        
        setStatus({ stage: "error", message: errorMessage });
      });
    },
    downloadUpdate: () => {
      if (is.dev || currentStatus.stage !== "available") return;
      
      console.log("[AutoUpdateService] Starting update download...");
      autoUpdater.downloadUpdate().catch((err: Error) => {
        console.error("[AutoUpdateService] Download update failed:", err);
        setStatus({ stage: "error", message: err.message });
      });
    },
    installUpdate: () => {
      if (currentStatus.stage !== "downloaded" || installInProgress) return;
      
      console.log("[AutoUpdateService] Installing update...");
      installInProgress = true;
      const version = currentStatus.version;
      Promise.resolve(options.prepareInstall?.(version))
        .then(() => {
          autoUpdater.quitAndInstall(false, true);
        })
        .catch((err: Error) => {
          installInProgress = false;
          console.error("[AutoUpdateService] Update install preparation failed:", err);
          setStatus({
            stage: "error",
            message: `Update install blocked: ${err instanceof Error ? err.message : err}`,
          });
        });
    },
    getStatus: () => currentStatus,
  };
}
