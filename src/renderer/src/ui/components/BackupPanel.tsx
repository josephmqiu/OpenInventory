import { useEffect, useMemo, useState } from "react";
import { formatDate } from "../../app/formatDate";
import type { Dictionary } from "../../app/i18n";
import type { BackupPlan, BackupIntervalUnit, Language, UpdateBackupPlanInput } from "../../domain/models";

interface BackupPanelProps {
  busy: boolean;
  dictionary: Dictionary;
  language: Language;
  backupPlan: BackupPlan;
  onBackupNow: () => Promise<void>;
  onSave: (input: UpdateBackupPlanInput) => Promise<void>;
  onBrowse?: () => Promise<string | null>;
  onRestore?: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function createFormState(backupPlan: BackupPlan): UpdateBackupPlanInput {
  return {
    targetPath: backupPlan.targetPath,
    intervalValue: backupPlan.schedule.intervalValue,
    intervalUnit: backupPlan.schedule.intervalUnit,
    onStartup: backupPlan.schedule.onStartup,
  };
}

const INTERVAL_UNITS: { value: BackupIntervalUnit; label: string }[] = [
  { value: "hours", label: "hours" },
  { value: "days", label: "days" },
  { value: "weeks", label: "weeks" },
];

export function BackupPanel({
  busy,
  dictionary,
  language,
  backupPlan,
  onBackupNow,
  onSave,
  onBrowse,
  onRestore,
}: BackupPanelProps) {
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
    backupPlan.status === "error" ? dictionary.needsAttention
    : !isConfigured ? dictionary.needsAttention
    : dictionary.backupReady;
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

  return (
    <section className="panel">
      {/* Header */}
      <div className="panel__header">
        <div>
          <h2>{dictionary.backupPlan}</h2>
          <p>{dictionary.backupStorageHint}</p>
        </div>
        <span className={`status-pill status-pill--${statusClass}`}>
          {statusLabel}
        </span>
      </div>

      {/* Status strip — visible when configured */}
      {isConfigured && (
        <dl className="backup-status-strip" aria-live="polite">
          <div className="backup-status-strip__cell">
            <dt>{dictionary.lastBackup}</dt>
            <dd>
              {hasBackedUp ? (
                <>
                  {formatDate(backupPlan.lastSuccessfulBackup, language)}
                  {backupPlan.lastFileSize > 0 && `, ${formatFileSize(backupPlan.lastFileSize)}`}
                  {backupPlan.lastVerified && ", verified"}
                </>
              ) : (
                <span className="text-muted">No backups yet</span>
              )}
            </dd>
          </div>
          {isOverdue && (
            <div className="backup-status-strip__badge backup-status-strip__badge--warning">
              Overdue
            </div>
          )}
        </dl>
      )}

      {/* Warning banners */}
      {!isConfigured && (
        <div className="panel-banner panel-banner--warning">{dictionary.backupNotConfigured}</div>
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
          {isBacking ? dictionary.backupNowInProgress : dictionary.backupNow}
        </button>
        {onRestore && (
          <button
            className="button-secondary"
            data-testid="backup-restore"
            disabled={busy || isBacking}
            onClick={onRestore}
            type="button"
          >
            Restore from Backup
          </button>
        )}
      </div>

      {/* Config section */}
      <div className="form-grid">
        {/* Destination: read-only input + Browse button */}
        <label>
          <span>{dictionary.targetPath}</span>
          <div className="backup-path-row">
            <input
              className="backup-path-input"
              value={form.targetPath}
              placeholder="No destination selected"
              onChange={(e) => setForm({ ...form, targetPath: e.target.value })}
              onClick={() => void handleBrowse()}
            />
            <button
              className="button-secondary backup-browse-btn"
              type="button"
              disabled={busy || isBacking}
              onClick={() => void handleBrowse()}
              aria-label="Choose backup destination folder"
            >
              Browse
            </button>
          </div>
        </label>

        {/* Cloud detection info */}
        {backupPlan.cloudProvider && (
          <p className="backup-cloud-info">
            This folder is synced by {backupPlan.cloudProvider}
          </p>
        )}

        {/* Schedule: number + unit + startup checkbox */}
        <label>
          <span>{dictionary.schedule}</span>
          <div className="backup-schedule-row">
            <span className="backup-schedule-label">Every</span>
            <input
              type="number"
              min={0}
              className="backup-schedule-number"
              value={form.intervalValue}
              onChange={(e) =>
                setForm({ ...form, intervalValue: parseInt(e.target.value, 10) || 0 })
              }
            />
            <select
              className="backup-schedule-unit"
              value={form.intervalUnit}
              onChange={(e) =>
                setForm({ ...form, intervalUnit: e.target.value as BackupIntervalUnit })
              }
            >
              {INTERVAL_UNITS.map((u) => (
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
          <span>Also back up when the app starts</span>
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
          {busy ? `${dictionary.save}...` : dictionary.save}
        </button>
      </div>
    </section>
  );
}
