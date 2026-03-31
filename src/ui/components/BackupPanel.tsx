import { useEffect, useMemo, useState } from "react";
import { formatDate } from "../../app/formatDate";
import { localizeBackupTargetType, type Dictionary } from "../../app/i18n";
import type { BackupPlan, BackupTargetType, Language, UpdateBackupPlanInput } from "../../domain/models";

interface BackupPanelProps {
  busy: boolean;
  dictionary: Dictionary;
  language: Language;
  backupPlan: BackupPlan;
  onBackupNow: () => Promise<void>;
  onSave: (input: UpdateBackupPlanInput) => Promise<void>;
}

const TARGET_TYPES: BackupTargetType[] = ["local_folder", "lan_share", "cloud_folder"];

function displayValue(value: string, fallback: string): string {
  return value.trim().length > 0 ? value : fallback;
}

function createFormState(backupPlan: BackupPlan): UpdateBackupPlanInput {
  return {
    targetPath: backupPlan.targetPath,
    targetType: backupPlan.targetType,
    schedule: backupPlan.schedule,
    retention: backupPlan.retention,
  };
}

export function BackupPanel({ busy, dictionary, language, backupPlan, onBackupNow, onSave }: BackupPanelProps) {
  const [form, setForm] = useState<UpdateBackupPlanInput>(() => createFormState(backupPlan));

  useEffect(() => {
    setForm(createFormState(backupPlan));
  }, [backupPlan]);

  const hasTargetPath = form.targetPath.trim().length > 0;
  const hasChanges = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(createFormState(backupPlan)),
    [backupPlan, form],
  );

  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <h2>{dictionary.backupPlan}</h2>
          <p>{dictionary.backupStorageHint}</p>
        </div>
        <span className={`status-pill status-pill--backup-${backupPlan.status}`}>
          {backupPlan.status === "healthy" ? dictionary.backupReady : dictionary.needsAttention}
        </span>
      </div>
      {!hasTargetPath && <div className="panel-banner">{dictionary.backupNotConfigured}</div>}
      <div className="form-grid">
        <label>
          <span>{dictionary.targetPath}</span>
          <input
            value={form.targetPath}
            onChange={(event) => setForm({ ...form, targetPath: event.target.value })}
          />
        </label>
        <label>
          <span>{dictionary.targetType}</span>
          <select
            value={form.targetType}
            onChange={(event) => setForm({ ...form, targetType: event.target.value as BackupTargetType })}
          >
            {TARGET_TYPES.map((value) => (
              <option key={value} value={value}>
                {localizeBackupTargetType(value, language)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{dictionary.schedule}</span>
          <input
            value={form.schedule}
            onChange={(event) => setForm({ ...form, schedule: event.target.value })}
          />
        </label>
        <label>
          <span>{dictionary.retention}</span>
          <input
            value={form.retention}
            onChange={(event) => setForm({ ...form, retention: event.target.value })}
          />
        </label>
      </div>
      <dl className="backup-grid">
        <div>
          <dt>{dictionary.lastBackup}</dt>
          <dd>{displayValue(formatDate(backupPlan.lastSuccessfulBackup, language), dictionary.notAvailable)}</dd>
        </div>
        <div>
          <dt>{dictionary.nextBackup}</dt>
          <dd>{displayValue(formatDate(backupPlan.nextScheduledBackup, language), dictionary.notAvailable)}</dd>
        </div>
      </dl>
      <div className="action-panel__footer action-panel__footer--spread">
        <button
          className="button-secondary"
          disabled={busy || !backupPlan.targetPath.trim()}
          onClick={() => void onBackupNow()}
          type="button"
        >
          {busy ? "Backing Up..." : "Backup Now"}
        </button>
        <button
          className="button-secondary"
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
