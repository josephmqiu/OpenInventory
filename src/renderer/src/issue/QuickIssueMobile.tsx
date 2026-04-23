import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { i18n, localizeBackendMessage, localizeCategory, localizeUnit } from "../app/i18n";
import { formatNumber } from "../app/formatters";
import type { InventoryItem, Language, PersonnelMember, StockMutationInput } from "../../../shared/types";

interface QuickIssueMobileProps {
  busy: boolean;
  item: InventoryItem;
  language: Language;
  notice: { message: string; tone: "success" | "error" } | null;
  personnel: PersonnelMember[];
  clearNotice: () => void;
  onIssue: (input: StockMutationInput) => Promise<string>;
  onRefresh: () => void;
}

const PRESETS = [1, 5, 10] as const;

export function QuickIssueMobile({ busy, item, language, notice, personnel, clearNotice, onIssue, onRefresh }: QuickIssueMobileProps) {
  const { t } = useTranslation(["inventory", "quickIssue", "common"]);
  const tErrors = i18n.getFixedT(language, "errors");
  const [quantityInput, setQuantityInput] = useState("");
  const [performedBy, setPerformedBy] = useState("");
  const [feedback, setFeedback] = useState("");
  const [feedbackType, setFeedbackType] = useState<"success" | "error">("success");
  const submitInFlightRef = useRef(false);

  // Structural comparison guard: personnel gets a new array reference after every
  // issue (fresh API response), but the form should only reset when the actual
  // item or personnel list changes, not on every reference swap.
  const personnelKey = JSON.stringify(personnel.map((p) => p.id).sort());
  const prevPersonnelKey = useRef(personnelKey);

  useEffect(() => {
    if (personnelKey === prevPersonnelKey.current) return;
    prevPersonnelKey.current = personnelKey;
    setQuantityInput("");
    setPerformedBy(personnel[0]?.name ?? "");
    setFeedback("");
    setFeedbackType("success");
  }, [personnelKey, personnel]);

  useEffect(() => {
    setQuantityInput("");
    setPerformedBy(personnel[0]?.name ?? "");
    setFeedback("");
    setFeedbackType("success");
  }, [item.id]);

  useEffect(() => {
    if (notice?.tone === "error") {
      const timer = setTimeout(clearNotice, 5000);
      return () => clearTimeout(timer);
    }
  }, [notice, clearNotice]);

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
    if (busy || submitInFlightRef.current) {
      return;
    }

    submitInFlightRef.current = true;
    try {
      const message = await onIssue({
        itemId: item.id,
        quantity,
        performedBy: performedBy.trim(),
        reason: t("qrIssueReason", { ns: "quickIssue" }),
      });
      setQuantityInput("");
      setFeedback(message);
      setFeedbackType("success");
    } catch (error) {
      setFeedback(localizeBackendMessage(error as Error & { messageId?: string; messageValues?: Record<string, string | number> }, language, tErrors("genericActionError")));
      setFeedbackType("error");
    } finally {
      submitInFlightRef.current = false;
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
          <span className="qi-data-row__label">{t("category", { ns: "inventory" })}</span>
          <span className="qi-data-row__value">{localizeCategory(item.category, language)}</span>
        </div>
        <div className="qi-data-row">
          <span className="qi-data-row__label">{t("location", { ns: "inventory" })}</span>
          <span className="qi-data-row__value">{item.location}</span>
        </div>
        <div className="qi-data-row qi-data-row--hero">
          <span className="qi-data-row__label">{t("currentQuantity", { ns: "inventory" })}</span>
          <span className={`qi-data-row__value${isOutOfStock ? " qi-data-row__value--danger" : ""}`}>
            {formatNumber(item.currentQuantity, language)}
            <span className="qi-unit">{localizeUnit(item.unit, language)}</span>
          </span>
        </div>
        {isOutOfStock && (
          <div className="qi-out-of-stock">{t("outOfStock", { ns: "inventory" })}</div>
        )}
        {isOutOfStock && (
          <button type="button" className="qi-refresh-btn" onClick={onRefresh}>
            {t("refresh", { ns: "common" })}
          </button>
        )}
        <div className="qi-data-row">
          <span className="qi-data-row__label">{t("reorderLevel", { ns: "inventory" })}</span>
          <span className="qi-data-row__value">{formatNumber(item.reorderQuantity, language)}</span>
        </div>

        <div className="qi-divider" />

        <div className="qi-form">
          <div className="qi-field">
            <span className="qi-field__label">{t("quantity", { ns: "inventory" })}</span>
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
                {t("clear", { ns: "common" })}
              </button>
            </div>
            <div className="qi-input-row">
              <input
                autoFocus
                inputMode="numeric"
                pattern="[0-9]*"
                type="text"
                value={quantityInput}
                disabled={isOutOfStock}
                onChange={(e) => {
                  const value = e.target.value;
                  // 只允许输入数字
                  if (/^$|^\d+$/.test(value)) {
                    setQuantityInput(value);
                  }
                }}
              />
              <span className="qi-unit-chip">{localizeUnit(item.unit, language)}</span>
            </div>
          </div>

          {personnel.length === 0 ? (
            <div className="qi-empty-state">
              <span className="qi-field__label">{t("performedBy", { ns: "inventory" })}</span>
              <p>{t("personnelRequiredForIssue", { ns: "quickIssue" })}</p>
            </div>
          ) : (
            <div className="qi-field">
              <span className="qi-field__label">{t("performedBy", { ns: "inventory" })}</span>
              <select
                value={performedBy}
                onChange={(e) => setPerformedBy(e.target.value)}
              >
                {!performedBy && <option value="">{t("selectPersonnel", { ns: "inventory" })}</option>}
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
          {busy ? `${t("issueMaterial", { ns: "inventory" })}...` : t("issueMaterial", { ns: "inventory" })}
        </button>
      </div>
    </div>
  );
}
