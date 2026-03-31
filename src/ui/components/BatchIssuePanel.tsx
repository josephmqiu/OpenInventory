import { useEffect, useMemo, useState } from "react";
import { localizeUnit, type Dictionary } from "../../app/i18n";
import type { BatchIssueMaterialInput, InventoryItem, Language, PersonnelMember } from "../../domain/models";

interface BatchIssuePanelProps {
  busy: boolean;
  dictionary: Dictionary;
  errorMessage: string | null;
  items: InventoryItem[];
  language: Language;
  personnel: PersonnelMember[];
  onClose: () => void;
  onSubmit: (input: BatchIssueMaterialInput) => Promise<boolean>;
}

function toPositiveQuantity(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return Math.floor(parsed);
}

export function BatchIssuePanel({
  busy,
  dictionary,
  errorMessage,
  items,
  language,
  personnel,
  onClose,
  onSubmit,
}: BatchIssuePanelProps) {
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [performedBy, setPerformedBy] = useState("");
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [localSuccess, setLocalSuccess] = useState<string | null>(null);

  useEffect(() => {
    setQuantities(Object.fromEntries(items.map((item) => [item.id, ""])));
    setPerformedBy((current) => current || personnel[0]?.name || "");
    setReason("");
    setLocalError(null);
    setLocalSuccess(null);
  }, [items, personnel]);

  const issueItems = useMemo(
    () =>
      items
        .map((item) => ({
          itemId: item.id,
          quantity: toPositiveQuantity(quantities[item.id] ?? ""),
        }))
        .filter((item) => item.quantity > 0),
    [items, quantities],
  );

  const inlineError = localError ?? errorMessage;

  const handleSubmit = async () => {
    setLocalError(null);
    setLocalSuccess(null);

    if (items.length === 0) {
      setLocalError(dictionary.issueCartNoSelection);
      return;
    }

    if (!performedBy.trim()) {
      setLocalError(dictionary.formValidationError);
      return;
    }

    if (issueItems.length === 0) {
      setLocalError(dictionary.formValidationError);
      return;
    }

    const success = await onSubmit({
      items: issueItems,
      performedBy,
      reason,
    });

    if (!success) {
      return;
    }

    setQuantities(Object.fromEntries(items.map((item) => [item.id, ""])));
    setLocalSuccess(dictionary.successBatchIssueMaterial);
  };

  return (
    <section className="panel batch-issue-panel">
      <div className="panel__header">
        <div>
          <h2>{dictionary.issueCartTitle}</h2>
          <p>{dictionary.issueCartHint}</p>
        </div>
        <button className="button-secondary" onClick={onClose} type="button">
          {dictionary.cancel}
        </button>
      </div>

      {localSuccess ? <div className="feedback-banner feedback-banner--success">{localSuccess}</div> : null}
      {inlineError ? <div className="feedback-banner feedback-banner--error">{inlineError}</div> : null}

      {items.length === 0 ? (
        <div className="empty-state">
          <h3>{dictionary.issueCartNoSelection}</h3>
          <p>{dictionary.manageItemsHint}</p>
        </div>
      ) : (
        <>
          <div className="panel-banner panel-banner--info">{dictionary.issueCartInlineHint}</div>
          <div className="batch-issue-layout">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{dictionary.itemName}</th>
                    <th>{dictionary.sku}</th>
                    <th>{dictionary.currentQuantity}</th>
                    <th>{dictionary.quantity}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="cell-title">{item.name}</div>
                        <div className="cell-subtitle">{item.location}</div>
                      </td>
                      <td>{item.sku}</td>
                      <td className="cell-strong">
                        {item.currentQuantity} {localizeUnit(item.unit, language)}
                      </td>
                      <td>
                        <input
                          className="batch-issue-input"
                          min="0"
                          step="1"
                          type="number"
                          value={quantities[item.id] ?? ""}
                          onChange={(event) =>
                            setQuantities((current) => ({
                              ...current,
                              [item.id]: event.target.value,
                            }))
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="batch-issue-sidebar">
              <div className="form-summary">
                <strong>{dictionary.issueCartSelectedItems}</strong>
                <span>{dictionary.selectedItemsCount(items.length)}</span>
              </div>
              <label className="batch-issue-field">
                <span>{dictionary.performedBy}</span>
                <select value={performedBy} onChange={(event) => setPerformedBy(event.target.value)}>
                  <option value="">{dictionary.selectPersonnel}</option>
                  {personnel.map((member) => (
                    <option key={member.id} value={member.name}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="batch-issue-field">
                <span>{dictionary.reason}</span>
                <input value={reason} onChange={(event) => setReason(event.target.value)} />
              </label>
              {personnel.length === 0 && (
                <div className="empty-state">
                  <h3>{dictionary.performedBy}</h3>
                  <p>{dictionary.personnelRequiredForIssue}</p>
                </div>
              )}
              <div className="action-panel__footer action-panel__footer--spread">
                <button className="button-secondary" onClick={onClose} type="button">
                  {dictionary.cancel}
                </button>
                <button disabled={busy || personnel.length === 0} onClick={() => void handleSubmit()} type="button">
                  {busy ? `${dictionary.save}...` : dictionary.batchIssue}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
