import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { localizeStockStatus, localizeUnit } from "../app/i18n";
import { formatNumber } from "../app/formatters";
import { filterInventoryItems, type InventoryStatusFilter } from "../domain/itemFilter";
import type { Language, PublicCatalogItem } from "../../../shared/types";

interface QuickItemListProps {
  items: PublicCatalogItem[];
  language: Language;
  search: string;
  filter: InventoryStatusFilter;
  onSearchChange: (search: string) => void;
  onFilterChange: (filter: InventoryStatusFilter) => void;
  onSelectItem: (itemId: string) => void;
  onRefresh: () => void;
}

const FILTERS: InventoryStatusFilter[] = ["all", "low_stock", "out_of_stock"];

/**
 * Read-only browse/search list for the mobile LAN lookup page. Lets a floor
 * worker look up "how much of X and Y is left" without re-scanning. Search +
 * status filter are owned by QuickIssueApp so they persist across detail visits.
 */
export function QuickItemList({
  items,
  language,
  search,
  filter,
  onSearchChange,
  onFilterChange,
  onSelectItem,
  onRefresh,
}: QuickItemListProps) {
  const { t } = useTranslation(["common", "inventory", "quickIssue"]);

  const filtered = useMemo(
    () =>
      [...filterInventoryItems(items, { search, filter })].sort((a, b) =>
        a.name.localeCompare(b.name, language),
      ),
    [items, search, filter, language],
  );

  const chipLabel = (f: InventoryStatusFilter): string => {
    if (f === "all") return t("allItems", { ns: "common" });
    if (f === "low_stock") return localizeStockStatus("low_stock", language);
    return localizeStockStatus("out_of_stock", language);
  };

  const renderEmpty = () => {
    if (items.length === 0) {
      return <p className="qi-list__empty">{t("noItemsInInventory", { ns: "quickIssue" })}</p>;
    }
    if (search.trim()) {
      return <p className="qi-list__empty">{t("noMatchingItems", { ns: "common", search })}</p>;
    }
    return (
      <div className="qi-list__empty">
        <p>{t("noItemsMatchFilter", { ns: "quickIssue" })}</p>
        <button type="button" className="qi-list__show-all" onClick={() => onFilterChange("all")}>
          {t("showAll", { ns: "quickIssue" })}
        </button>
      </div>
    );
  };

  return (
    <div className="qi-list">
      <div className="qi-list__head">
        <span className="qi-list__title">{t("inventoryLookup", { ns: "quickIssue" })}</span>
        <span className="qi-list__count">{t("itemsShown", { ns: "quickIssue", count: filtered.length })}</span>
      </div>

      <div className="qi-list__controls">
        <input
          className="qi-list__search"
          type="search"
          inputMode="search"
          autoComplete="off"
          value={search}
          placeholder={t("searchInventory", { ns: "common" })}
          aria-label={t("searchInventory", { ns: "common" })}
          onChange={(event) => onSearchChange(event.target.value)}
        />
        <div className="qi-list__filters" role="group" aria-label={t("inventoryLookup", { ns: "quickIssue" })}>
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={`qi-list__chip${filter === f ? " qi-list__chip--active" : ""}`}
              aria-pressed={filter === f}
              onClick={() => onFilterChange(f)}
            >
              {chipLabel(f)}
            </button>
          ))}
          <button className="qi-list__refresh" type="button" onClick={onRefresh}>
            {t("refresh", { ns: "common" })}
          </button>
        </div>
      </div>

      <div className="qi-list__scroll">
        {filtered.length === 0
          ? renderEmpty()
          : filtered.map((item) => {
              const isOut = item.status === "out_of_stock";
              const isLow = item.status === "low_stock";
              const rowClass = isOut ? " qi-list-row--danger" : isLow ? " qi-list-row--warning" : "";
              const qtyClass = isOut ? " qi-list-row__qty--danger" : isLow ? " qi-list-row__qty--warning" : "";
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`qi-list-row${rowClass}`}
                  data-testid="qi-list-row"
                  onClick={() => onSelectItem(item.id)}
                >
                  <span className="qi-list-row__main">
                    <span className="qi-list-row__name">{item.name}</span>
                    <span className="qi-list-row__meta">
                      {item.sku} · {item.location}
                    </span>
                  </span>
                  <span className={`qi-list-row__qty${qtyClass}`}>
                    {(isOut || isLow) && (
                      <span className="qi-list-row__tag">
                        {localizeStockStatus(item.status, language)}
                      </span>
                    )}
                    {formatNumber(item.currentQuantity, language)}
                    <span className="qi-list-row__unit">{localizeUnit(item.unit, language)}</span>
                  </span>
                </button>
              );
            })}
      </div>
    </div>
  );
}
