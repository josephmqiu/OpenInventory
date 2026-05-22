import { useTranslation } from "react-i18next";
import { localizeCategory, localizeStockStatus, localizeUnit } from "../app/i18n";
import { formatNumber } from "../app/formatters";
import type { InventoryItem, Language } from "../../../shared/types";

interface QuickIssueMobileProps {
  item: InventoryItem;
  language: Language;
  onRefresh: () => void;
}

export function QuickIssueMobile({ item, language, onRefresh }: QuickIssueMobileProps) {
  const { t } = useTranslation(["inventory", "quickIssue", "common"]);

  const isOutOfStock = item.currentQuantity <= 0;
  const isLowStock = !isOutOfStock && item.currentQuantity <= item.reorderQuantity;

  return (
    <div className="qi-card">
      <div className="qi-card__content">
        <div className="qi-header">
          <div className="qi-header__name">{item.name}</div>
          <div className="qi-header__sku">{item.sku}</div>
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
        {isLowStock && (
          <div className="qi-low-stock">{localizeStockStatus("low_stock", language)}</div>
        )}

        <div className="qi-data-row">
          <span className="qi-data-row__label">{t("category", { ns: "inventory" })}</span>
          <span className="qi-data-row__value">{localizeCategory(item.category, language)}</span>
        </div>
        <div className="qi-data-row">
          <span className="qi-data-row__label">{t("location", { ns: "inventory" })}</span>
          <span className="qi-data-row__value">{item.location}</span>
        </div>
        <div className="qi-data-row">
          <span className="qi-data-row__label">{t("reorderLevel", { ns: "inventory" })}</span>
          <span className="qi-data-row__value">{formatNumber(item.reorderQuantity, language)}</span>
        </div>
        <div className="qi-data-row">
          <span className="qi-data-row__label">{t("supplier", { ns: "inventory" })}</span>
          <span className="qi-data-row__value">{item.supplier}</span>
        </div>
      </div>

      <div className="qi-submit-area">
        <button
          className="qi-refresh-btn"
          data-testid="qi-refresh"
          type="button"
          onClick={onRefresh}
        >
          {t("refresh", { ns: "common" })}
        </button>
      </div>
    </div>
  );
}
