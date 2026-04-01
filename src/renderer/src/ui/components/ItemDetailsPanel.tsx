import { useEffect, useState } from "react";
import { formatDate } from "../../app/formatDate";
import { localizeBackendMessage, localizeCategory, localizeUnit, type Dictionary } from "../../app/i18n";
import type { InventoryItem, InventoryMovement, Language } from "../../domain/models";
import { getItemMovements } from "../../services/inventoryGateway";
import { QrCodeImage } from "./QrCodeImage";

interface ItemDetailsPanelProps {
  dictionary: Dictionary;
  language: Language;
  item: InventoryItem;
  onBack: () => void;
  onPrint: () => void;
}

export function ItemDetailsPanel({ dictionary, language, item, onBack, onPrint }: ItemDetailsPanelProps) {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(true);
  const [movementError, setMovementError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoadingMovements(true);
    setMovementError(null);

    getItemMovements(item.id)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setMovements(result);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setMovementError(error instanceof Error ? localizeBackendMessage(error.message, dictionary) : dictionary.noMovements);
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingMovements(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dictionary, item.id]);

  return (
    <section className="panel item-details-panel" data-testid="item-details-panel">
      <div className="panel__header">
        <div>
          <h2>{dictionary.itemDetails}</h2>
          <p>{dictionary.itemDetailsHint}</p>
        </div>
        <div className="panel__actions">
          <button className="button-secondary" onClick={onBack} type="button">
            {dictionary.backToList}
          </button>
          <button disabled={!item.qrCodeDataUrl} onClick={onPrint} type="button">
            {dictionary.printQrLabel}
          </button>
        </div>
      </div>
      <div className="item-details-layout">
        <dl className="item-details-grid">
          <div>
            <dt>{dictionary.sku}</dt>
            <dd>{item.sku}</dd>
          </div>
          <div>
            <dt>{dictionary.itemName}</dt>
            <dd>{item.name}</dd>
          </div>
          <div>
            <dt>{dictionary.category}</dt>
            <dd>{localizeCategory(item.category, language)}</dd>
          </div>
          <div>
            <dt>{dictionary.location}</dt>
            <dd>{item.location}</dd>
          </div>
          <div>
            <dt>{dictionary.unit}</dt>
            <dd>{localizeUnit(item.unit, language)}</dd>
          </div>
          <div>
            <dt>{dictionary.supplier}</dt>
            <dd>{item.supplier || dictionary.notProvided}</dd>
          </div>
          <div>
            <dt>{dictionary.currentQuantity}</dt>
            <dd>{item.currentQuantity}</dd>
          </div>
          <div>
            <dt>{dictionary.reorderLevel}</dt>
            <dd>{item.reorderQuantity}</dd>
          </div>
          <div>
            <dt>{dictionary.lastUpdated}</dt>
            <dd>{formatDate(item.lastUpdated, language)}</dd>
          </div>
        </dl>
        <div className="item-details-qr">
          <h3>{dictionary.qrCode}</h3>
          {item.qrCodeDataUrl ? (
            <QrCodeImage text={item.qrCodeDataUrl} alt={item.sku} />
          ) : (
            <p>{dictionary.qrCodeUnavailable}</p>
          )}
        </div>
      </div>
      <div className="item-movements-section">
        <div className="panel__header">
          <div>
            <h3>{dictionary.movementHistory}</h3>
            <p>{dictionary.movementHistoryHint}</p>
          </div>
        </div>
        {loadingMovements ? (
          <div className="empty-state">
            <h3>{dictionary.loadingMovements}</h3>
          </div>
        ) : movementError ? (
          <div className="feedback-banner feedback-banner--error">{movementError}</div>
        ) : movements.length === 0 ? (
          <div className="empty-state">
            <h3>{dictionary.noMovements}</h3>
          </div>
        ) : (
          <div className="table-wrap">
            <table data-testid="movement-history-table">
              <thead>
                <tr>
                  <th>{dictionary.date}</th>
                  <th>{dictionary.type}</th>
                  <th>{dictionary.quantity}</th>
                  <th>{dictionary.performedBy}</th>
                  <th>{dictionary.reason}</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((movement) => (
                  <tr key={movement.id}>
                    <td>{formatDate(movement.createdAt, language)}</td>
                    <td>{movement.movementType === "receive" ? dictionary.receiveStock : dictionary.issueMaterial}</td>
                    <td>{movement.quantity}</td>
                    <td>{movement.performedBy || dictionary.notProvided}</td>
                    <td>{movement.reason || dictionary.notProvided}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
