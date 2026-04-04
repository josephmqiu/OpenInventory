import { useEffect, useMemo, useState } from "react";
import { formatDate } from "../../app/formatDate";
import { formatFileSize } from "../../app/formatters";
import type { BackupPlan, BackupIntervalUnit, Language, UpdateBackupPlanInput } from "../../domain/models";
import { useTranslation } from "react-i18next";

interface BackupPanelProps {
  busy: boolean;
  language: Language;
  backupPlan: BackupPlan;
  onBackupNow: () => Promise<void>;
  onSave: (input: UpdateBackupPlanInput) => Promise<void>;
  onBrowse?: () => Promise<string | null>;
  onRestore?: () => void;
}

function createFormState(backupPlan: BackupPlan): UpdateBackupPlanInput {
  return {
    targetPath: backupPlan.targetPath,
    intervalValue: backupPlan.schedule.intervalValue,
    intervalUnit: backupPlan.schedule.intervalUnit,
    onStartup: backupPlan.schedule.onStartup,
  };
}

export function BackupPanel({
  busy,
  language,
  backupPlan,
  onBackupNow,
  onSave,
  onBrowse,
  onRestore,
}: BackupPanelProps) {
  const { i18n } = useTranslation(["common", "backup"]);
  const t = i18n.getFixedT(language, ["common", "backup"]);
  const [form, setForm] = useState<UpdateBackupPlanInput>(() => createFormState(backupPlan));

  useEffect(() => {
    setForm(createFormState(backupPlan));
  }, [backupPlan]);

  const hasTargetPath = form.targetPath.trim().length > 0;
  const hasChanges = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(createFormState(backupPlan)),
    [backupPlan, form],
  );

  const isBacking = backupPlan.status === "backing_up";
  const isConfigured = backupPlan.targetPath.trim().length > 0;
  const hasBackedUp = backupPlan.lastSuccessfulBackup.length > 0;
  const isOverdue =
    isConfigured &&
    hasBackedUp &&
    backupPlan.schedule.intervalValue > 0 &&
    (() => {
      const lastMs = new Date(backupPlan.lastSuccessfulBackup).getTime();
      const unitMs = backupPlan.schedule.intervalUnit === "weeks" ? 604800000
        : backupPlan.schedule.intervalUnit === "days" ? 86400000
        : 3600000;
      return Date.now() - lastMs > backupPlan.schedule.intervalValue * unitMs * 1.5;
    })();

  // Status pill
  const statusLabel =
    backupPlan.status === "error" || !isConfigured
      ? t("needsAttention", { ns: "backup" })
      : t("backupReady", { ns: "backup" });
  const statusClass =
    backupPlan.status === "error" ? "backup-error"
    : !isConfigured ? "backup-warning"
    : "backup-healthy";

  const handleBrowse = async () => {
    if (!onBrowse) return;
    const selectedPath = await onBrowse();
    if (selectedPath) {
      setForm({ ...form, targetPath: selectedPath });
    }
  };

  const intervalUnits: { value: BackupIntervalUnit; label: string }[] = [
    { value: "hours", label: t("hours", { ns: "backup" }) },
    { value: "days", label: t("days", { ns: "backup" }) },
    { value: "weeks", label: t("weeks", { ns: "backup" }) },
  ];

  return (
    <section className="panel">
      {/* Header */}
      <div className="panel__header">
        <div>
          <h2>{t("backupPlan", { ns: "backup" })} <span className={`status-pill status-pill--${statusClass}`}>{statusLabel}</span></h2>
          <p>{t("backupStorageHint", { ns: "backup" })}</p>
        </div>
      </div>

      {/* Status strip — visible when configured */}
      {isConfigured && (
        <dl className="backup-status-strip" aria-live="polite">
          <div className="backup-status-strip__cell">
            <dt>{t("lastBackup", { ns: "backup" })}</dt>
            <dd>
              {hasBackedUp ? (
                <>
                  {formatDate(backupPlan.lastSuccessfulBackup, language)}
                  {backupPlan.lastFileSize > 0 && `, ${formatFileSize(backupPlan.lastFileSize, language)}`}
                  {backupPlan.lastVerified && `, ${t("verified", { ns: "backup" })}`}
                </>
              ) : (
                <span className="text-muted">{t("noBackupsYet", { ns: "backup" })}</span>
              )}
            </dd>
          </div>
          {isOverdue && (
            <div className="backup-status-strip__badge backup-status-strip__badge--warning">
              {t("backupOverdue", { ns: "backup" })}
            </div>
          )}
        </dl>
      )}

      {/* Warning banners */}
      {!isConfigured && (
        <div className="panel-banner panel-banner--warning">
          {t("backupNotConfigured", { ns: "backup" })}
        </div>
      )}
      {backupPlan.lastError && (
        <div className="panel-banner panel-banner--error" role="alert">{backupPlan.lastError}</div>
      )}

      {/* Actions */}
      <div className="backup-actions">
        <button
          className="button-secondary"
          data-testid="backup-now"
          disabled={busy || !isConfigured || isBacking}
          onClick={() => void onBackupNow()}
          type="button"
        >
          {isBacking
            ? t("backupNowInProgress", { ns: "backup" })
            : t("backupNow", { ns: "backup" })}
        </button>
        {onRestore && (
          <button
            className="button-secondary"
            data-testid="backup-restore"
            disabled={busy || isBacking}
            onClick={onRestore}
            type="button"
          >
            {t("restoreFromBackup", { ns: "backup" })}
          </button>
        )}
      </div>

      {/* Config section */}
      <div className="form-grid">
        {/* Destination: read-only input + Browse button */}
        <label>
          <span>{t("targetPath", { ns: "backup" })}</span>
          <div className="backup-path-row">
            <input
              className="backup-path-input"
              value={form.targetPath}
              placeholder={t("noDestinationSelected", { ns: "backup" })}
              onChange={(e) => setForm({ ...form, targetPath: e.target.value })}
            />
            <button
              className="button-secondary backup-browse-btn"
              type="button"
              disabled={busy || isBacking}
              onClick={() => void handleBrowse()}
              aria-label={t("chooseDestination", { ns: "backup" })}
            >
              {t("browse", { ns: "backup" })}
            </button>
          </div>
        </label>

        {/* Cloud detection info */}
        {backupPlan.cloudProvider && (
          <p className="backup-cloud-info">
            {t("syncedBy", { ns: "backup", provider: backupPlan.cloudProvider })}
          </p>
        )}

        {/* Schedule: number + unit + startup checkbox */}
        <label>
          <span>{t("schedule", { ns: "backup" })}</span>
          <div className="backup-schedule-row">
            <span className="backup-schedule-label">{t("every", { ns: "backup" })}</span>
            <input
              type="number"
              min={0}
              className="backup-schedule-number"
              value={form.intervalValue}
              onChange={(e) =>
                setForm({ ...form, intervalValue: parseInt(e.target.value, 10) || 0 })
              }
              onKeyDown={(e) => { if (e.key === "Enter" && !busy && hasChanges) { e.preventDefault(); void onSave(form); } }}
            />
            <select
              className="backup-schedule-unit"
              value={form.intervalUnit}
              onChange={(e) =>
                setForm({ ...form, intervalUnit: e.target.value as BackupIntervalUnit })
              }
            >
              {intervalUnits.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
        </label>
        <label className="backup-startup-check">
          <input
            type="checkbox"
            checked={form.onStartup}
            onChange={(e) => setForm({ ...form, onStartup: e.target.checked })}
          />
          <span>{t("alsoBackupOnStartup", { ns: "backup" })}</span>
        </label>
      </div>

      {/* Save */}
      <div className="action-panel__footer action-panel__footer--spread">
        <div />
        <button
          className="button-secondary"
          data-testid="backup-save"
          disabled={busy || !hasChanges}
        onClick={() => void onSave(form)}
        type="button"
      >
          {busy
            ? `${t("save", { ns: "common" })}...`
            : t("save", { ns: "common" })}
        </button>
      </div>
    </section>
  );
}
