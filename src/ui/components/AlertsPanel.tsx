import type { Dictionary } from "../../app/i18n";
import type { InventoryAlert } from "../../domain/models";

interface AlertsPanelProps {
  dictionary: Dictionary;
  alerts: InventoryAlert[];
}

export function AlertsPanel({ dictionary, alerts }: AlertsPanelProps) {
  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <h2>{dictionary.alerts}</h2>
          <p>Threshold crossings, acknowledgement status, and quantity at trigger time.</p>
        </div>
      </div>
      {alerts.length === 0 ? (
        <div className="empty-state">
          <h3>{dictionary.noAlerts}</h3>
          <p>{dictionary.noAlertsHint}</p>
        </div>
      ) : (
        <div className="alert-list">
          {alerts.map((alert) => (
            <article className="alert-card" key={alert.id}>
              <div>
                <strong>{alert.itemName}</strong>
                <p>
                  {alert.sku} | {dictionary.currentQuantity}: {alert.currentQuantity} | {dictionary.reorderLevel}: {alert.thresholdQuantity}
                </p>
              </div>
              <div className="alert-card__meta">
                <span className={`status-pill status-pill--alert-${alert.status}`}>{alert.status}</span>
                <small>{alert.triggeredAt}</small>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
