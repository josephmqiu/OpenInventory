import { useEffect, useMemo, useState } from "react";
import type { LanAccessState, UpdateLanAccessInput } from "../../domain/models";

interface LanAccessPanelProps {
  busy: boolean;
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

export function LanAccessPanel({ busy, lanAccess, onSave, onRegenerateKey }: LanAccessPanelProps) {
  const [form, setForm] = useState<UpdateLanAccessInput>(() => createFormState(lanAccess));

  useEffect(() => {
    setForm(createFormState(lanAccess));
  }, [lanAccess]);

  const hasChanges = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(createFormState(lanAccess)),
    [form, lanAccess],
  );

  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <h2>LAN Access</h2>
          <p>Serve the inventory app on your local network so phones and tablets can look up and manage items.</p>
        </div>
        <span className={`status-pill status-pill--lan-${lanAccess.status}`}>
          {lanAccess.status.replace("_", " ")}
        </span>
      </div>

      <div className="panel-banner panel-banner--info">
        Devices must be on the same local network and use the access key shown below.
      </div>

      <div className="form-grid">
        <label>
          <span>Enabled</span>
          <select
            value={form.enabled ? "enabled" : "disabled"}
            onChange={(event) => setForm({ ...form, enabled: event.target.value === "enabled" })}
          >
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>
        </label>
        <label>
          <span>Port</span>
          <input
            min="1"
            max="65535"
            type="number"
            value={form.port}
            onChange={(event) => setForm({ ...form, port: Number(event.target.value) })}
          />
        </label>
        <label>
          <span>Access Key</span>
          <input readOnly value={lanAccess.accessKey} />
        </label>
      </div>

      <div className="backup-grid lan-access-grid">
        <div>
          <dt>Status</dt>
          <dd>{lanAccess.statusMessage}</dd>
        </div>
        <div>
          <dt>Open On Another Device</dt>
          <dd className="lan-url-list">
            {lanAccess.urls.length > 0 ? (
              lanAccess.urls.map((url) => (
                <a key={url} href={url} rel="noreferrer" target="_blank">
                  {url}
                </a>
              ))
            ) : (
              <span>Enable LAN access to see device URLs.</span>
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
          Regenerate Access Key
        </button>
        <button
          disabled={busy || !hasChanges || form.port <= 0 || form.port > 65535}
          onClick={() => void onSave(form)}
          type="button"
        >
          {busy ? "Saving..." : "Save LAN Settings"}
        </button>
      </div>
    </section>
  );
}
