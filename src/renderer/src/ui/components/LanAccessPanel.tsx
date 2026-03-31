import { useEffect, useMemo, useState } from "react";
import type { Dictionary } from "../../app/i18n";
import type { LanAccessState, UpdateLanAccessInput } from "../../domain/models";

interface LanAccessPanelProps {
  busy: boolean;
  dictionary: Dictionary;
  lanAccess: LanAccessState;
  onSave: (input: UpdateLanAccessInput) => Promise<void>;
  onRegenerateKey: () => Promise<void>;
}

function createFormState(lanAccess: LanAccessState): UpdateLanAccessInput {
  return {
    enabled: lanAccess.enabled,
    port: lanAccess.port,
  };
}

function statusLabel(status: LanAccessState["status"], dictionary: Dictionary): string {
  switch (status) {
    case "running":
      return dictionary.lanStatusRunning;
    case "error":
      return dictionary.lanStatusError;
    default:
      return dictionary.lanStatusStopped;
  }
}

export function LanAccessPanel({ busy, dictionary, lanAccess, onSave, onRegenerateKey }: LanAccessPanelProps) {
  const [form, setForm] = useState<UpdateLanAccessInput>(() => createFormState(lanAccess));
  const [copyFeedback, setCopyFeedback] = useState<{ message: string; tone: "success" | "error" } | null>(null);

  useEffect(() => {
    setForm(createFormState(lanAccess));
  }, [lanAccess]);

  const hasChanges = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(createFormState(lanAccess)),
    [form, lanAccess],
  );

  const handleCopyAccessKey = async () => {
    try {
      await navigator.clipboard.writeText(lanAccess.accessKey);
      setCopyFeedback({ message: dictionary.lanCopySuccess, tone: "success" });
    } catch {
      setCopyFeedback({ message: dictionary.lanCopyError, tone: "error" });
    }
  };

  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <h2>{dictionary.lanAccess}</h2>
          <p>{dictionary.lanEnableHint}</p>
        </div>
        <span className={`status-pill status-pill--lan-${lanAccess.status}`}>
          {statusLabel(lanAccess.status, dictionary)}
        </span>
      </div>

      <div className="panel-banner panel-banner--info">{dictionary.lanNetworkHint}</div>
      {copyFeedback && <div className={`feedback-banner feedback-banner--${copyFeedback.tone}`}>{copyFeedback.message}</div>}

      <div className="form-grid">
        <label>
          <span>{dictionary.lanEnabled}</span>
          <select
            value={form.enabled ? "enabled" : "disabled"}
            onChange={(event) => setForm({ ...form, enabled: event.target.value === "enabled" })}
          >
            <option value="enabled">{dictionary.lanEnabled}</option>
            <option value="disabled">{dictionary.lanDisabled}</option>
          </select>
        </label>
        <label>
          <span>{dictionary.lanPort}</span>
          <input
            min="1"
            max="65535"
            type="number"
            value={form.port}
            onChange={(event) => setForm({ ...form, port: Number(event.target.value) })}
          />
        </label>
        <label>
          <span>{dictionary.lanAccessKey}</span>
          <div className="row-actions row-actions--spread">
            <input readOnly value={lanAccess.accessKey} />
            <button className="button-secondary button-inline" disabled={busy} onClick={() => void handleCopyAccessKey()} type="button">
              {dictionary.lanCopy}
            </button>
          </div>
        </label>
      </div>

      <div className="backup-grid lan-access-grid">
        <div>
          <dt>{dictionary.lanStatus}</dt>
          <dd>{lanAccess.statusMessage}</dd>
        </div>
        <div>
          <dt>{dictionary.lanOpenOnDevice}</dt>
          <dd className="lan-url-list">
            {lanAccess.urls.length > 0 ? (
              lanAccess.urls.map((url) => (
                <a key={url} href={url} rel="noreferrer" target="_blank">
                  {url}
                </a>
              ))
            ) : (
              <span>{dictionary.lanUrlsUnavailable}</span>
            )}
          </dd>
        </div>
      </div>

      <div className="action-panel__footer action-panel__footer--spread">
        <button
          className="button-secondary"
          disabled={busy}
          onClick={() => void onRegenerateKey()}
          type="button"
        >
          {dictionary.lanRegenerateKey}
        </button>
        <button
          disabled={busy || !hasChanges || form.port <= 0 || form.port > 65535}
          onClick={() => void onSave(form)}
          type="button"
        >
          {busy ? `${dictionary.save}...` : dictionary.lanSaveSettings}
        </button>
      </div>
    </section>
  );
}
