import { useEffect, useRef, useState } from "react";
import { formatDate } from "../../app/formatDate";
import type { Language, RestoreComparisonData } from "../../domain/models";
import { useTranslation } from "react-i18next";

interface RestoreDialogProps {
  comparison: RestoreComparisonData;
  language: Language;
  onConfirm: () => void;
  onCancel: () => void;
}

export function RestoreDialog({ comparison, language, onConfirm, onCancel }: RestoreDialogProps) {
  const { i18n } = useTranslation(["common", "backup"]);
  const t = i18n.getFixedT(language, ["common", "backup"]);
  const [showDetails, setShowDetails] = useState(false);
  const { backup, current, backupIsNewer } = comparison;
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus trap: focus cancel button on mount
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onCancel();
      return;
    }
    if (e.key === "Tab") {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const warningText = backupIsNewer
    ? t("restoreComparisonNewer", { ns: "backup" })
    : t("restoreComparisonOlder", { ns: "backup" });

  return (
    <div className="restore-dialog-backdrop" data-testid="restore-dialog" onClick={onCancel}>
      <div
        ref={dialogRef}
        className="restore-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="restore-dialog-title"
        aria-describedby="restore-comparison"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 id="restore-dialog-title" className="restore-dialog__title">
          {t("restoreFromBackup", { ns: "backup" })}
        </h2>

        <div id="restore-comparison" className="restore-dialog__comparison">
          <div className="restore-dialog__section">
            <h3 className="restore-dialog__section-label">
              {t("backupSectionLabel", { ns: "backup" })}
            </h3>
            <p className="restore-dialog__section-date">
              {backup.createdAt
                ? formatDate(backup.createdAt, language)
                : t("unknownDate", { ns: "backup" })}
            </p>
            <p className="restore-dialog__section-stats">
              {t("sectionStats", {
                ns: "backup",
                items: backup.items,
                movements: backup.movements,
                personnel: backup.personnel,
              })}
            </p>
          </div>

          <div className="restore-dialog__section">
            <h3 className="restore-dialog__section-label">
              {t("currentDataSectionLabel", { ns: "backup" })}
            </h3>
            <p className="restore-dialog__section-date">
              {current.lastActivity
                ? t("lastActivity", {
                    ns: "backup",
                    value: formatDate(current.lastActivity, language),
                  })
                : ""}
            </p>
            <p className="restore-dialog__section-stats">
              {t("sectionStats", {
                ns: "backup",
                items: current.items,
                movements: current.movements,
                personnel: current.personnel,
              })}
            </p>
          </div>

          <div className="restore-dialog__warning">{warningText}</div>

          <p className="restore-dialog__notice">
            {t("safetyCopyNotice", { ns: "backup" })}
          </p>

          <details className="restore-dialog__details">
            <summary
              className="restore-dialog__details-toggle"
            onClick={(e) => {
              e.preventDefault();
              setShowDetails(!showDetails);
            }}
          >
              {showDetails
                ? t("hideDetails", { ns: "backup" })
                : t("showDetails", { ns: "backup" })}
            </summary>
            {showDetails && (
              <div className="restore-dialog__details-content">
                <dl>
                  <dt>{t("backupAppVersion", { ns: "backup" })}</dt>
                  <dd>{backup.appVersion}</dd>
                  <dt>{t("backupSchemaVersion", { ns: "backup" })}</dt>
                  <dd>{backup.schemaVersion}</dd>
                </dl>
              </div>
            )}
          </details>
        </div>

        <div className="restore-dialog__footer">
          <button
            ref={cancelRef}
            className="button-secondary"
            data-testid="restore-dialog-cancel"
          onClick={onCancel}
          type="button"
        >
            {t("cancel", { ns: "common" })}
          </button>
          <button
            className="button-secondary button-secondary--danger"
            data-testid="restore-dialog-confirm"
            onClick={onConfirm}
            type="button"
          >
            {t("restoreAnyway", { ns: "backup" })}
          </button>
        </div>
      </div>
    </div>
  );
}
