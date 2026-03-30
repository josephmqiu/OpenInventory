import { localizeCategory, localizeStockStatus, localizeUnit, type Dictionary } from "../../app/i18n";
import type { InventoryItem, Language } from "../../domain/models";

interface InventoryTableProps {
  busy: boolean;
  dictionary: Dictionary;
  language: Language;
  items: InventoryItem[];
  onIssueMaterial: () => void;
  onReceiveStock: () => void;
}

export function InventoryTable({
  busy,
  dictionary,
  language,
  items,
  onIssueMaterial,
  onReceiveStock,
}: InventoryTableProps) {
  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <h2>{dictionary.currentInventoryLevels}</h2>
          <p>{dictionary.inventoryOperationsHint}</p>
        </div>
        <div className="panel__actions">
          <button disabled={busy} onClick={onReceiveStock} type="button">{dictionary.receiveStock}</button>
          <button className="button-secondary" disabled={busy} onClick={onIssueMaterial} type="button">{dictionary.issueMaterial}</button>
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
                <th>{dictionary.sku}</th>
                <th>{dictionary.itemName}</th>
                <th>{dictionary.category}</th>
                <th>{dictionary.location}</th>
                <th>{dictionary.currentQuantity}</th>
                <th>{dictionary.unit}</th>
                <th>{dictionary.reorderLevel}</th>
                <th>{dictionary.status}</th>
                <th>{dictionary.lastUpdated}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.sku}</td>
                  <td>
                    <div className="cell-title">{item.name}</div>
                    <div className="cell-subtitle">{item.supplier}</div>
                  </td>
                  <td>{localizeCategory(item.category, language)}</td>
                  <td>{item.location}</td>
                  <td className="cell-strong">{item.currentQuantity}</td>
                  <td>{localizeUnit(item.unit, language)}</td>
                  <td>{item.reorderQuantity}</td>
                  <td>
                    <span className={`status-pill status-pill--${item.status}`}>{localizeStockStatus(item.status, language)}</span>
                  </td>
                  <td>{item.lastUpdated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
