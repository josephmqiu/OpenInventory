import { useEffect, useMemo, useState } from "react";
import { localizeCategory, localizeUnit, type Dictionary } from "../../app/i18n";
import type { InventoryItem, Language } from "../../domain/models";
import { ItemDetailsPanel } from "./ItemDetailsPanel";
import { printQrLabels } from "../printing/qrLabelPrinter";

interface ItemManagementTableProps {
  busy: boolean;
  dictionary: Dictionary;
  language: Language;
  items: InventoryItem[];
  onCreateItem: () => void;
  onModifyItem: (itemId: string) => void;
  onRemoveItem: (itemId: string) => void;
}

export function ItemManagementTable({
  busy,
  dictionary,
  language,
  items,
  onCreateItem,
  onModifyItem,
  onRemoveItem,
}: ItemManagementTableProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detailItemId, setDetailItemId] = useState<string>("");

  useEffect(() => {
    const validIds = new Set(items.map((item) => item.id));
    setSelectedIds((current) => current.filter((id) => validIds.has(id)));
    if (detailItemId && !validIds.has(detailItemId)) {
      setDetailItemId("");
    }
  }, [detailItemId, items]);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.includes(item.id)),
    [items, selectedIds],
  );
  const detailItem = useMemo(
    () => items.find((item) => item.id === detailItemId) ?? null,
    [detailItemId, items],
  );
  const allSelected = items.length > 0 && selectedIds.length === items.length;

  const toggleSelection = (itemId: string) => {
    setSelectedIds((current) =>
      current.includes(itemId) ? current.filter((entry) => entry !== itemId) : [...current, itemId],
    );
  };

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : items.map((item) => item.id));
  };

  const handlePrint = (itemsToPrint: InventoryItem[]) => {
    printQrLabels(itemsToPrint, dictionary);
  };

  return (
    <>
      {detailItem && (
        <ItemDetailsPanel
          dictionary={dictionary}
          language={language}
          item={detailItem}
          onBack={() => setDetailItemId("")}
          onPrint={() => handlePrint([detailItem])}
        />
      )}
      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>{dictionary.itemManagement}</h2>
            <p>{dictionary.manageItemsHint}</p>
          </div>
          <div className="panel__actions panel__actions--wrap">
            <span className="selection-count">{dictionary.selectedItemsCount(selectedIds.length)}</span>
            <button
              className="button-secondary"
              disabled={busy || selectedItems.length === 0}
              onClick={() => handlePrint(selectedItems)}
              type="button"
            >
              {dictionary.printSelectedQrs}
            </button>
            <button disabled={busy} onClick={onCreateItem} type="button">
              {dictionary.createItem}
            </button>
          </div>
        </div>
        {items.length === 0 ? (
          <div className="empty-state">
            <h3>{dictionary.noInventoryItems}</h3>
            <p>{dictionary.noInventoryItemsHint}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>
                    <label className="checkbox-cell">
                      <input checked={allSelected} onChange={toggleSelectAll} type="checkbox" />
                      <span>{dictionary.selectAllItems}</span>
                    </label>
                  </th>
                  <th>{dictionary.sku}</th>
                  <th>{dictionary.itemName}</th>
                  <th>{dictionary.category}</th>
                  <th>{dictionary.location}</th>
                  <th>{dictionary.unit}</th>
                  <th>{dictionary.supplier}</th>
                  <th>{dictionary.reorderLevel}</th>
                  <th>{dictionary.currentQuantity}</th>
                  <th>{dictionary.lastUpdated}</th>
                  <th>{dictionary.manage}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <input
                        checked={selectedIds.includes(item.id)}
                        onChange={() => toggleSelection(item.id)}
                        type="checkbox"
                      />
                    </td>
                    <td>{item.sku}</td>
                    <td className="cell-title">{item.name}</td>
                    <td>{localizeCategory(item.category, language)}</td>
                    <td>{item.location}</td>
                    <td>{localizeUnit(item.unit, language)}</td>
                    <td>{item.supplier || dictionary.notAvailable}</td>
                    <td>{item.reorderQuantity}</td>
                    <td className="cell-strong">{item.currentQuantity}</td>
                    <td>{item.lastUpdated}</td>
                    <td>
                      <div className="row-actions row-actions--spread">
                        <button
                          className="button-secondary button-inline"
                          disabled={busy}
                          onClick={() => setDetailItemId(item.id)}
                          type="button"
                        >
                          {dictionary.viewDetails}
                        </button>
                        <button
                          className="button-secondary button-inline"
                          disabled={busy}
                          onClick={() => onModifyItem(item.id)}
                          type="button"
                        >
                          {dictionary.modifyItem}
                        </button>
                        <button
                          className="button-danger button-inline"
                          disabled={busy}
                          onClick={() => onRemoveItem(item.id)}
                          type="button"
                        >
                          {dictionary.removeItem}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
