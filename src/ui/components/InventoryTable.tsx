import type { Dictionary } from "../../app/i18n";
import type { InventoryItem } from "../../domain/models";

interface InventoryTableProps {
  busy: boolean;
  dictionary: Dictionary;
  items: InventoryItem[];
  onCreateItem: () => void;
  onIssueMaterial: () => void;
  onReceiveStock: () => void;
  onRemoveItem: (itemId?: string) => void;
}

function toLabel(value: string): string {
  return value.split("_").join(" ");
}

export function InventoryTable({
  busy,
  dictionary,
  items,
  onCreateItem,
  onIssueMaterial,
  onReceiveStock,
  onRemoveItem,
}: InventoryTableProps) {
  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <h2>{dictionary.currentInventoryLevels}</h2>
          <p>Visible quantities, reorder thresholds, and stock state.</p>
        </div>
        <div className="panel__actions">
          <button disabled={busy} onClick={onCreateItem} type="button">{dictionary.createItem}</button>
          <button disabled={busy} onClick={onReceiveStock} type="button">{dictionary.receiveStock}</button>
          <button className="button-secondary" disabled={busy} onClick={onIssueMaterial} type="button">{dictionary.issueMaterial}</button>
          <button className="button-danger" disabled={busy} onClick={() => onRemoveItem()} type="button">{dictionary.removeItem}</button>
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
                <th>{dictionary.removeItem}</th>
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
                  <td>{item.category}</td>
                  <td>{item.location}</td>
                  <td className="cell-strong">{item.currentQuantity}</td>
                  <td>{item.unit}</td>
                  <td>{item.reorderQuantity}</td>
                  <td>
                    <span className={`status-pill status-pill--${item.status}`}>{toLabel(item.status)}</span>
                  </td>
                  <td>{item.lastUpdated}</td>
                  <td>
                    <div className="row-actions">
                      <button className="button-danger button-inline" disabled={busy} onClick={() => onRemoveItem(item.id)} type="button">
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
  );
}
