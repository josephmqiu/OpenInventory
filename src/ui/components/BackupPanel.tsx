import type { Dictionary } from "../../app/i18n";
import type { BackupPlan } from "../../domain/models";

interface BackupPanelProps {
  dictionary: Dictionary;
  backupPlan: BackupPlan;
}

function toLabel(value: string): string {
  return value.split("_").join(" ");
}

function displayValue(value: string, fallback: string): string {
  return value.trim().length > 0 ? value : fallback;
}

export function BackupPanel({ dictionary, backupPlan }: BackupPanelProps) {
  const hasTargetPath = backupPlan.targetPath.trim().length > 0;

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
      <dl className="backup-grid">
        <div>
          <dt>{dictionary.targetPath}</dt>
          <dd>{displayValue(backupPlan.targetPath, dictionary.notAvailable)}</dd>
        </div>
        <div>
          <dt>{dictionary.targetType}</dt>
          <dd>{hasTargetPath ? toLabel(backupPlan.targetType) : dictionary.notAvailable}</dd>
        </div>
        <div>
          <dt>{dictionary.schedule}</dt>
          <dd>{displayValue(backupPlan.schedule, dictionary.notAvailable)}</dd>
        </div>
        <div>
          <dt>{dictionary.retention}</dt>
          <dd>{displayValue(backupPlan.retention, dictionary.notAvailable)}</dd>
        </div>
        <div>
          <dt>{dictionary.lastBackup}</dt>
          <dd>{displayValue(backupPlan.lastSuccessfulBackup, dictionary.notAvailable)}</dd>
        </div>
        <div>
          <dt>{dictionary.nextBackup}</dt>
          <dd>{displayValue(backupPlan.nextScheduledBackup, dictionary.notAvailable)}</dd>
        </div>
      </dl>
    </section>
  );
}