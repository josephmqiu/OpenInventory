import type { Dictionary } from "../../app/i18n";
import type { InventoryItem } from "../../domain/models";

interface ItemManagementTableProps {
  busy: boolean;
  dictionary: Dictionary;
  items: InventoryItem[];
  onCreateItem: () => void;
  onModifyItem: (itemId: string) => void;
  onRemoveItem: (itemId: string) => void;
}

export function ItemManagementTable({
  busy,
  dictionary,
  items,
  onCreateItem,
  onModifyItem,
  onRemoveItem,
}: ItemManagementTableProps) {
  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <h2>{dictionary.itemManagement}</h2>
          <p>{dictionary.manageItemsHint}</p>
        </div>
        <div className="panel__actions">
          <button disabled={busy} onClick={onCreateItem} type="button">{dictionary.createItem}</button>
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
                  <td>{item.sku}</td>
                  <td className="cell-title">{item.name}</td>
                  <td>{item.category}</td>
                  <td>{item.location}</td>
                  <td>{item.unit}</td>
                  <td>{item.supplier || dictionary.notAvailable}</td>
                  <td>{item.reorderQuantity}</td>
                  <td className="cell-strong">{item.currentQuantity}</td>
                  <td>{item.lastUpdated}</td>
                  <td>
                    <div className="row-actions row-actions--spread">
                      <button className="button-secondary button-inline" disabled={busy} onClick={() => onModifyItem(item.id)} type="button">
                        {dictionary.modifyItem}
                      </button>
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
