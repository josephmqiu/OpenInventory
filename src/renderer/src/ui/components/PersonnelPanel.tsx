import { useState } from "react";
import type { Dictionary } from "../../app/i18n";
import type { PersonnelMember } from "../../domain/models";

interface PersonnelPanelProps {
  busy: boolean;
  dictionary: Dictionary;
  personnel: PersonnelMember[];
  onAddPersonnel: (name: string) => Promise<void>;
  onRemovePersonnel: (personnelId: string) => Promise<void>;
}

export function PersonnelPanel({
  busy,
  dictionary,
  personnel,
  onAddPersonnel,
  onRemovePersonnel,
}: PersonnelPanelProps) {
  const [name, setName] = useState("");

  const handleAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    await onAddPersonnel(trimmed);
    setName("");
  };

  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <h2>{dictionary.personnel}</h2>
          <p>{dictionary.managePersonnelHint}</p>
        </div>
      </div>

      <div className="personnel-toolbar">
        <label className="personnel-toolbar__input">
          <span>{dictionary.personnelName}</span>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <button disabled={busy || name.trim().length === 0} onClick={() => void handleAdd()} type="button">
          {dictionary.addPersonnel}
        </button>
      </div>

      {personnel.length === 0 ? (
        <div className="empty-state">
          <h3>{dictionary.noPersonnel}</h3>
          <p>{dictionary.noPersonnelHint}</p>
        </div>
      ) : (
        <div className="personnel-list">
          {personnel.map((member) => (
            <article className="personnel-card" key={member.id}>
              <strong>{member.name}</strong>
              <button
                className="button-danger-ghost button-inline"
                disabled={busy}
                onClick={() => void onRemovePersonnel(member.id)}
                type="button"
              >
                {dictionary.removePersonnel}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
