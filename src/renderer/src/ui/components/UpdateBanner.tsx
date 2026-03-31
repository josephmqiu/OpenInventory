import type { UpdateStatus } from "../../domain/models";
import type { Dictionary } from "../../app/i18n";

interface UpdateBannerProps {
  status: UpdateStatus;
  dictionary: Dictionary;
  onDownload: () => void;
  onInstall: () => void;
  onDismiss: () => void;
}

export function UpdateBanner({ status, dictionary, onDownload, onInstall, onDismiss }: UpdateBannerProps) {
  if (status.stage === "idle" || status.stage === "checking" || status.stage === "not-available") {
    return null;
  }

  if (status.stage === "available") {
    return (
      <div className="update-banner update-banner--info">
        <span>{dictionary.updateAvailable.replace("{version}", status.version)}</span>
        <div className="update-banner__actions">
          <button className="button-secondary" onClick={onDownload} type="button">{dictionary.updateDownload}</button>
          <button className="button-inline button-secondary update-banner__dismiss" onClick={onDismiss} type="button" aria-label={dictionary.dismiss}>&times;</button>
        </div>
      </div>
    );
  }

  if (status.stage === "downloading") {
    const pct = Math.round(status.percent);
    return (
      <div className="update-banner update-banner--info">
        <span>{dictionary.updateDownloading.replace("{percent}", String(pct))}</span>
        <div className="update-banner__progress">
          <div className="update-banner__progress-bar" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }

  if (status.stage === "downloaded") {
    return (
      <div className="update-banner update-banner--success">
        <span>{dictionary.updateReady}</span>
        <div className="update-banner__actions">
          <button className="button-secondary" onClick={onInstall} type="button">{dictionary.updateRestart}</button>
          <button className="button-inline button-secondary update-banner__dismiss" onClick={onDismiss} type="button" aria-label={dictionary.dismiss}>&times;</button>
        </div>
      </div>
    );
  }

  if (status.stage === "error") {
    return (
      <div className="update-banner update-banner--error">
        <span>{dictionary.updateError}</span>
        <button className="button-inline button-secondary update-banner__dismiss" onClick={onDismiss} type="button" aria-label={dictionary.dismiss}>&times;</button>
      </div>
    );
  }

  return null;
}
