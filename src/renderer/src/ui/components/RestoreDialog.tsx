import { useState } from "react";
import { formatDate } from "../../app/formatDate";
import type { Language, RestoreComparisonData } from "../../domain/models";

interface RestoreDialogProps {
  comparison: RestoreComparisonData;
  language: Language;
  onConfirm: () => void;
  onCancel: () => void;
}

export function RestoreDialog({ comparison, language, onConfirm, onCancel }: RestoreDialogProps) {
  const [showDetails, setShowDetails] = useState(false);
  const { backup, current, backupIsNewer } = comparison;

  const warningText = backupIsNewer
    ? "This backup is more recent than your current data."
    : "Your current data appears more recent than this backup. Restoring will replace newer data with older data.";

  return (
    <div className="restore-dialog-backdrop" onClick={onCancel}>
      <div
        className="restore-dialog"
        role="alertdialog"
        aria-describedby="restore-comparison"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="restore-dialog__title">Restore from Backup</h2>

        <div id="restore-comparison" className="restore-dialog__comparison">
          <div className="restore-dialog__section">
            <h3 className="restore-dialog__section-label">BACKUP</h3>
            <p className="restore-dialog__section-date">
              {backup.createdAt ? formatDate(backup.createdAt, language) : "Unknown date"}
            </p>
            <p className="restore-dialog__section-stats">
              {backup.items} items &middot; {backup.movements} movements &middot; {backup.personnel} personnel
            </p>
          </div>

          <div className="restore-dialog__section">
            <h3 className="restore-dialog__section-label">YOUR CURRENT DATA</h3>
            <p className="restore-dialog__section-date">
              {current.lastActivity ? `Last activity: ${formatDate(current.lastActivity, language)}` : ""}
            </p>
            <p className="restore-dialog__section-stats">
              {current.items} items &middot; {current.movements} movements &middot; {current.personnel} personnel
            </p>
          </div>

          {!backupIsNewer && (
            <div className="restore-dialog__warning">
              {warningText}
            </div>
          )}

          <p className="restore-dialog__notice">
            A safety copy of your current data will be saved.
          </p>

          <details className="restore-dialog__details">
            <summary
              className="restore-dialog__details-toggle"
              onClick={(e) => {
                e.preventDefault();
                setShowDetails(!showDetails);
              }}
            >
              {showDetails ? "Hide details" : "Show details"}
            </summary>
            {showDetails && (
              <div className="restore-dialog__details-content">
                <dl>
                  <dt>Backup app version</dt>
                  <dd>{backup.appVersion}</dd>
                  <dt>Backup schema version</dt>
                  <dd>{backup.schemaVersion}</dd>
                </dl>
              </div>
            )}
          </details>
        </div>

        <div className="restore-dialog__footer">
          <button
            className="button-secondary"
            onClick={onCancel}
            autoFocus
            type="button"
          >
            Cancel
          </button>
          <button
            className="button-secondary button-secondary--danger"
            onClick={onConfirm}
            type="button"
          >
            Restore Anyway
          </button>
        </div>
      </div>
    </div>
  );
}
