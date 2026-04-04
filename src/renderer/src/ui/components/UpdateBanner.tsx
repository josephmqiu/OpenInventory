import type { UpdateStatus } from "../../domain/models";
import { useTT } from "../hooks/useTT";

interface UpdateBannerProps {
  status: UpdateStatus;
  onDownload: () => void;
  onInstall: () => void;
  onDismiss: () => void;
}

export function UpdateBanner({ status, onDownload, onInstall, onDismiss }: UpdateBannerProps) {
  const tt = useTT();

  if (status.stage === "idle" || status.stage === "checking" || status.stage === "not-available") {
    return null;
  }

  if (status.stage === "available") {
    return (
      <div className="update-banner update-banner--info">
        <span>{tt("updateAvailable", "Version {version} is available", { version: status.version })}</span>
        <div className="update-banner__actions">
          <button className="button-secondary" onClick={onDownload} type="button">
            {tt("updateDownload", "Download")}
          </button>
          <button className="button-inline button-secondary update-banner__dismiss" onClick={onDismiss} type="button" aria-label={tt("dismiss", "Dismiss")}>
            &times;
          </button>
        </div>
      </div>
    );
  }

  if (status.stage === "downloading") {
    const pct = Math.round(status.percent);
    return (
      <div className="update-banner update-banner--info">
        <span>{tt("updateDownloading", "Downloading update... {percent}%", { percent: pct })}</span>
        <div className="update-banner__progress">
          <div className="update-banner__progress-bar" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }

  if (status.stage === "downloaded") {
    return (
      <div className="update-banner update-banner--success">
        <span>{tt("updateReady", "Update ready — restart to apply")}</span>
        <div className="update-banner__actions">
          <button className="button-secondary" onClick={onInstall} type="button">
            {tt("updateRestart", "Restart Now")}
          </button>
          <button className="button-inline button-secondary update-banner__dismiss" onClick={onDismiss} type="button" aria-label={tt("dismiss", "Dismiss")}>
            &times;
          </button>
        </div>
      </div>
    );
  }

  if (status.stage === "error") {
    return (
      <div className="update-banner update-banner--error">
        <span>{tt("updateError", "Update check failed")}</span>
        <button className="button-inline button-secondary update-banner__dismiss" onClick={onDismiss} type="button" aria-label={tt("dismiss", "Dismiss")}>
          &times;
        </button>
      </div>
    );
  }

  return null;
}
