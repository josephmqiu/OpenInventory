import { localizeCategory, localizeUnit, type Dictionary } from "../../app/i18n";
import type { InventoryItem, Language } from "../../domain/models";

interface ItemDetailsPanelProps {
  dictionary: Dictionary;
  language: Language;
  item: InventoryItem;
  onBack: () => void;
  onPrint: () => void;
}

export function ItemDetailsPanel({ dictionary, language, item, onBack, onPrint }: ItemDetailsPanelProps) {
  return (
    <section className="panel item-details-panel">
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
            <dd>{item.supplier || dictionary.notAvailable}</dd>
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
            <dd>{item.lastUpdated}</dd>
          </div>
        </dl>
        <div className="item-details-qr">
          <h3>{dictionary.qrCode}</h3>
          {item.qrCodeDataUrl ? (
            <img alt={item.sku} src={item.qrCodeDataUrl} />
          ) : (
            <p>{dictionary.qrCodeUnavailable}</p>
          )}
        </div>
      </div>
    </section>
  );
}
