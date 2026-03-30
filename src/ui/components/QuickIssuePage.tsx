import { useEffect, useState } from "react";
import { localizeCategory, localizeUnit, type Dictionary } from "../../app/i18n";
import type { InventoryItem, Language, PersonnelMember, StockMutationInput } from "../../domain/models";

interface QuickIssuePageProps {
  busy: boolean;
  dictionary: Dictionary;
  item: InventoryItem;
  language: Language;
  personnel: PersonnelMember[];
  onIssue: (input: StockMutationInput) => Promise<string>;
}

export function QuickIssuePage({ busy, dictionary, item, language, personnel, onIssue }: QuickIssuePageProps) {
  const [quantityInput, setQuantityInput] = useState("");
  const [performedBy, setPerformedBy] = useState("");

  useEffect(() => {
    setQuantityInput("");
    setPerformedBy(personnel[0]?.name ?? "");
  }, [item.id, personnel]);

  const quantity = Number.parseInt(quantityInput, 10);
  const quantityIsValid = Number.isInteger(quantity) && quantity > 0 && quantity <= item.currentQuantity;
  const notify = (message: string) => {
    if (typeof window !== "undefined") {
      window.alert(message);
    }
  };

  const handleIssueClick = async () => {
    try {
      const message = await onIssue({
        itemId: item.id,
        quantity,
        performedBy: performedBy.trim(),
        reason: "QR issue",
      });
      setQuantityInput("");
      notify(message);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to complete the requested action.");
    }
  };

  return (
    <section className="panel quick-issue-panel">
      <div className="panel__header">
        <div>
          <h2>{dictionary.issueMaterial}</h2>
          <p>{dictionary.actionPanelHint.issueMaterial}</p>
        </div>
      </div>

      <div className="item-details-layout quick-issue-layout">
        <dl className="item-details-grid">
          <div>
            <dt>{dictionary.sku}</dt>
            <dd>{item.sku}</dd>
          </div>
          <div>
            <dt>{dictionary.itemName}</dt>
            <dd>{item.name}</dd>
          </div>
          <div>
            <dt>{dictionary.category}</dt>
            <dd>{localizeCategory(item.category, language)}</dd>
          </div>
          <div>
            <dt>{dictionary.location}</dt>
            <dd>{item.location}</dd>
          </div>
          <div>
            <dt>{dictionary.currentQuantity}</dt>
            <dd>
              {item.currentQuantity} {localizeUnit(item.unit, language)}
            </dd>
          </div>
          <div>
            <dt>{dictionary.reorderLevel}</dt>
            <dd>{item.reorderQuantity}</dd>
          </div>
          <div>
            <dt>{dictionary.unit}</dt>
            <dd>{localizeUnit(item.unit, language)}</dd>
          </div>
          <div>
            <dt>{dictionary.supplier}</dt>
            <dd>{item.supplier || dictionary.notAvailable}</dd>
          </div>
        </dl>

        <div className="quick-issue-form">
          <label>
            <span>{dictionary.quantity}</span>
            <div className="quick-issue-quantity-row">
              <input
                autoFocus
                inputMode="numeric"
                min="1"
                max={item.currentQuantity}
                pattern="[0-9]*"
                type="number"
                value={quantityInput}
                onChange={(event) => setQuantityInput(event.target.value)}
              />
              <span className="quick-issue-unit-chip">{localizeUnit(item.unit, language)}</span>
            </div>
          </label>
          <label>
            <span>{dictionary.performedBy}</span>
            <select value={performedBy} onChange={(event) => setPerformedBy(event.target.value)}>
              {!performedBy && <option value="">{dictionary.selectPersonnel}</option>}
              {personnel.map((member) => (
                <option key={member.id} value={member.name}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={busy || !quantityIsValid || !performedBy.trim()}
            onClick={() => void handleIssueClick()}
            type="button"
          >
            {busy ? `${dictionary.issueMaterial}...` : dictionary.issueMaterial}
          </button>
        </div>
      </div>
    </section>
  );
}

