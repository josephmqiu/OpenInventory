import type { ReactNode } from "react";
import type { UpdateStatus } from "../../domain/models";
import { useTT } from "../hooks/useTT";

interface UpdateSettingsPanelProps {
  status: UpdateStatus;
  appVersion: string | null;
  onCheck: () => void;
  onRestart: () => void;
}

/**
 * Settings → Update tab. The canonical home for version info, manual checks, and
 * every update state. Low emphasis, in-flow — updates download silently, so the
 * only prominent moment is "ready → restart".
 *
 * Status stage → UI mapping:
 *   idle           → first run (version + Check; the 3s startup check moves it on)
 *   checking       → spinner
 *   available      → treated as downloading at 0% (autoDownload starts immediately)
 *   downloading    → progress
 *   downloaded     → ready (Restart)
 *   not-available  → up to date
 *   error          → message + Try again
 */
export function UpdateSettingsPanel({ status, appVersion, onCheck, onRestart }: UpdateSettingsPanelProps) {
  const tt = useTT();
  const currentVersion = appVersion ?? "";

  let dot: ReactNode;
  let title: ReactNode;
  let sub: ReactNode;
  let progress: number | null = null;
  let action: ReactNode = null;

  const checkButton = (disabled: boolean) => (
    <button className="button-secondary" onClick={onCheck} type="button" disabled={disabled}>
      {tt("updateCheckButton", "Check for updates")}
    </button>
  );

  switch (status.stage) {
    case "checking":
      dot = <span className="spinner" aria-hidden="true" />;
      title = tt("updateChecking", "Checking for updates…");
      sub = tt("updateVersionLine", "Version {version}", { version: currentVersion });
      action = checkButton(true);
      break;
    case "available":
    case "downloading": {
      const raw = status.stage === "downloading" ? status.percent : 0;
      const percent = Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw))) : 0;
      dot = <span className="status-dot status-dot--accent" />;
      title = tt("updateDownloadingTitle", "Downloading update…");
      sub = tt("updateDownloadingHint", "{percent}% · downloads automatically in the background", { percent });
      progress = percent;
      break;
    }
    case "downloaded":
      dot = <span className="status-dot status-dot--accent" />;
      title = tt("updateReadyVersion", "Version {version} is ready to install", { version: status.version });
      sub = tt("updateReadyHint", "Restart to apply the update.");
      action = (
        <button onClick={onRestart} type="button">
          {tt("updateRestartButton", "Restart to update")}
        </button>
      );
      break;
    case "not-available":
      dot = <span className="status-dot status-dot--success" />;
      title = tt("updateUpToDate", "You're up to date");
      sub = tt("updateVersionLine", "Version {version}", { version: status.version || currentVersion });
      action = checkButton(false);
      break;
    case "error":
      dot = <span className="status-dot status-dot--danger" />;
      title = <span className="error-text">{tt("updateErrorTitle", "Couldn't check for updates")}</span>;
      sub = status.message;
      action = (
        <button className="button-secondary" onClick={onCheck} type="button">
          {tt("updateTryAgain", "Try again")}
        </button>
      );
      break;
    case "idle":
    default:
      dot = <span className="status-dot status-dot--muted" />;
      title = tt("updateVersionLine", "Version {version}", { version: currentVersion });
      sub = tt("updateFirstRunHint", "Updates install automatically. Check anytime.");
      action = checkButton(false);
      break;
  }

  return (
    <section className="panel" data-testid="update-panel">
      <div className="panel__header">
        <div>
          <h2>{tt("updateSectionTitle", "Software Update")}</h2>
          <p>{tt("updateSectionDesc", "OpenInventory keeps itself up to date automatically.")}</p>
        </div>
        {action && <div className="panel__actions">{action}</div>}
      </div>
      <div className="update-status" role="status" aria-live="polite">
        {dot}
        <div className="update-status__main">
          <div className="update-status__title">{title}</div>
          <div className="update-status__sub">{sub}</div>
          {progress !== null && (
            <div className="mini-progress">
              <div className="mini-progress__bar" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
