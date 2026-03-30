import type { Dictionary } from "../../app/i18n";
import { formatCurrency } from "../../domain/inventory";
import type { RefillOrder } from "../../domain/models";

interface RefillOrdersTableProps {
  busy: boolean;
  dictionary: Dictionary;
  onCreateRefillOrder: () => void;
  orders: RefillOrder[];
}

function toLabel(value: string): string {
  return value.split("_").join(" ");
}

export function RefillOrdersTable({ busy, dictionary, onCreateRefillOrder, orders }: RefillOrdersTableProps) {
  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <h2>{dictionary.refillOrders}</h2>
          <p>Every inventory purchase is recorded here before receipt posting.</p>
        </div>
        <button disabled={busy} onClick={onCreateRefillOrder} type="button">{dictionary.createRefillOrder}</button>
      </div>
      {orders.length === 0 ? (
        <div className="empty-state">
          <h3>{dictionary.noRefillOrders}</h3>
          <p>{dictionary.noRefillOrdersHint}</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{dictionary.orderNumber}</th>
                <th>{dictionary.supplier}</th>
                <th>{dictionary.orderDate}</th>
                <th>{dictionary.expectedDelivery}</th>
                <th>{dictionary.receivedDate}</th>
                <th>{dictionary.status}</th>
                <th>{dictionary.totalAmount}</th>
                <th>{dictionary.createdBy}</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>{order.orderNumber}</td>
                  <td>{order.supplier}</td>
                  <td>{order.orderDate}</td>
                  <td>{order.expectedDeliveryDate}</td>
                  <td>{order.receivedDate ?? "-"}</td>
                  <td>
                    <span className={`status-pill status-pill--order-${order.status}`}>{toLabel(order.status)}</span>
                  </td>
                  <td>{formatCurrency(order.totalAmount)}</td>
                  <td>{order.createdBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}