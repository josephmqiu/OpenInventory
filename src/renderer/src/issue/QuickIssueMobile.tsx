import { useEffect, useState } from "react";
import { localizeBackendMessage, localizeCategory, localizeUnit, type Dictionary } from "../app/i18n";
import type { InventoryItem, Language, PersonnelMember, StockMutationInput } from "../../../shared/types";

interface QuickIssueMobileProps {
  busy: boolean;
  dictionary: Dictionary;
  item: InventoryItem;
  language: Language;
  personnel: PersonnelMember[];
  onIssue: (input: StockMutationInput) => Promise<string>;
}

const PRESETS = [1, 5, 10] as const;

export function QuickIssueMobile({ busy, dictionary, item, language, personnel, onIssue }: QuickIssueMobileProps) {
  const [quantityInput, setQuantityInput] = useState("");
  const [performedBy, setPerformedBy] = useState("");
  const [feedback, setFeedback] = useState("");
  const [feedbackType, setFeedbackType] = useState<"success" | "error">("success");

  useEffect(() => {
    setQuantityInput("");
    setPerformedBy(personnel[0]?.name ?? "");
    setFeedback("");
    setFeedbackType("success");
  }, [item.id, personnel]);

  const quantity = Number.parseInt(quantityInput, 10);
  const quantityIsValid = Number.isInteger(quantity) && quantity > 0 && quantity <= item.currentQuantity;
  const isOutOfStock = item.currentQuantity <= 0;

  const addQty = (n: number) => {
    const current = Number.parseInt(quantityInput, 10) || 0;
    const next = Math.min(current + n, item.currentQuantity);
    setQuantityInput(String(next));
  };

  const clearQty = () => setQuantityInput("");

  const handleSubmit = async () => {
    try {
      const message = await onIssue({
        itemId: item.id,
        quantity,
        performedBy: performedBy.trim(),
        reason: dictionary.qrIssueReason,
      });
      setQuantityInput("");
      setFeedback(message);
      setFeedbackType("success");
    } catch (error) {
      setFeedback(error instanceof Error ? localizeBackendMessage(error.message, dictionary) : dictionary.genericActionError);
      setFeedbackType("error");
    }
  };

  return (
    <div className="qi-card">
      <div className="qi-card__content">
        {feedback && (
          <div className={`qi-feedback qi-feedback--${feedbackType}`}>{feedback}</div>
        )}

        <div className="qi-header">
          <div className="qi-header__name">{item.name}</div>
          <div className="qi-header__sku">{item.sku}</div>
        </div>

        <div className="qi-data-row">
          <span className="qi-data-row__label">{dictionary.category}</span>
          <span className="qi-data-row__value">{localizeCategory(item.category, language)}</span>
        </div>
        <div className="qi-data-row">
          <span className="qi-data-row__label">{dictionary.location}</span>
          <span className="qi-data-row__value">{item.location}</span>
        </div>
        <div className="qi-data-row qi-data-row--hero">
          <span className="qi-data-row__label">{dictionary.currentQuantity}</span>
          <span className={`qi-data-row__value${isOutOfStock ? " qi-data-row__value--danger" : ""}`}>
            {item.currentQuantity.toLocaleString()}
            <span className="qi-unit">{localizeUnit(item.unit, language)}</span>
          </span>
        </div>
        {isOutOfStock && (
          <div className="qi-out-of-stock">{dictionary.outOfStock ?? "Out of stock"}</div>
        )}
        <div className="qi-data-row">
          <span className="qi-data-row__label">{dictionary.reorderLevel}</span>
          <span className="qi-data-row__value">{item.reorderQuantity}</span>
        </div>

        <div className="qi-divider" />

        <div className="qi-form">
          <div className="qi-field">
            <span className="qi-field__label">{dictionary.quantity}</span>
            <div className="qi-presets">
              {PRESETS.map((n) => (
                <button
                  key={n}
                  className="qi-preset-btn"
                  data-testid={n === 5 ? "qi-preset-5" : n === 10 ? "qi-preset-10" : undefined}
                  type="button"
                  disabled={isOutOfStock}
                  onClick={() => addQty(n)}
                >
                  +{n}
                </button>
              ))}
              <button
                className="qi-preset-btn qi-preset-btn--clear"
                data-testid="qi-preset-clear"
                type="button"
                onClick={clearQty}
              >
                {dictionary.clear ?? "Clear"}
              </button>
            </div>
            <div className="qi-input-row">
              <input
                autoFocus
                inputMode="numeric"
                min="1"
                max={item.currentQuantity}
                pattern="[0-9]*"
                type="number"
                value={quantityInput}
                disabled={isOutOfStock}
                onChange={(e) => setQuantityInput(e.target.value)}
              />
              <span className="qi-unit-chip">{localizeUnit(item.unit, language)}</span>
            </div>
          </div>

          {personnel.length === 0 ? (
            <div className="qi-empty-state">
              <span className="qi-field__label">{dictionary.performedBy}</span>
              <p>{dictionary.personnelRequiredForIssue}</p>
            </div>
          ) : (
            <div className="qi-field">
              <span className="qi-field__label">{dictionary.performedBy}</span>
              <select
                value={performedBy}
                onChange={(e) => setPerformedBy(e.target.value)}
              >
                {!performedBy && <option value="">{dictionary.selectPersonnel}</option>}
                {personnel.map((m) => (
                  <option key={m.id} value={m.name}>{m.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="qi-submit-area">
        <button
          className="qi-submit-btn"
          data-testid="qi-submit"
          type="button"
          disabled={busy || !quantityIsValid || !performedBy.trim() || isOutOfStock}
          onClick={() => void handleSubmit()}
        >
          {busy ? `${dictionary.issueMaterial}...` : dictionary.issueMaterial}
        </button>
      </div>
    </div>
  );
}
