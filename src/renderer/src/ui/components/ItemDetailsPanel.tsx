import { useMemo, useState } from "react";
import { formatDate } from "../../app/formatDate";
import { formatNumber } from "../../app/formatters";
import { translateErrorMessage, localizeCategory, localizeUnit } from "../../app/i18n";
import type { InventoryItem, InventoryMovement, Language } from "../../domain/models";
import { getItemMovements } from "../../services/inventoryGateway";
import { useAsyncData } from "../hooks/useAsyncData";
import { useTT } from "../hooks/useTT";
import { sortDataByKey } from "../utils/sortData";
import { DataTable, type ColumnDef, type SortState } from "./DataTable";
import { QrCodeImage } from "./QrCodeImage";

interface ItemDetailsPanelProps {
  language: Language;
  item: InventoryItem;
  onBack: () => void;
  onExport: () => void;
  onModifyItem?: (itemId: string) => void;
  onRemoveItem?: (itemId: string) => void;
}

export function ItemDetailsPanel({ language, item, onBack, onExport, onModifyItem, onRemoveItem }: ItemDetailsPanelProps) {
  const tt = useTT();
  const [sortState, setSortState] = useState<SortState | null>(null);

  const { data: movements, loading: loadingMovements, error: movementError } = useAsyncData(
    () => getItemMovements(item.id).catch((error: unknown) => {
      throw new Error(
        error instanceof Error
          ? translateErrorMessage(error as Error & { messageId?: string; messageValues?: Record<string, string | number> }, language, tt("noMovements", "No movements recorded yet."))
          : tt("noMovements", "No movements recorded yet."),
      );
    }),
    [item.id, language],
  );

  const sortedMovements = useMemo(
    () => sortDataByKey(movements ?? [], sortState),
    [movements, sortState],
  );

  const movementColumns: ColumnDef<InventoryMovement>[] = [
    { key: "date", header: tt("date", "Date"), sortable: true, sortKey: "createdAt", render: (m) => formatDate(m.createdAt, language) },
    { key: "type", header: tt("type", "Type"), sortable: true, sortKey: "movementType", render: (m) => (m.movementType === "receive" ? tt("receiveStock", "Receive Stock") : tt("issueMaterial", "Issue Material")) },
    { key: "quantity", header: tt("quantity", "Quantity"), sortable: true, sortKey: "quantity", render: (m) => formatNumber(m.quantity, language) },
    { key: "performedBy", header: tt("performedBy", "Performed By"), sortable: true, sortKey: "performedBy", render: (m) => m.performedBy || tt("notProvided", "Not provided") },
    { key: "reason", header: tt("reason", "Reason"), render: (m) => m.reason || tt("notProvided", "Not provided") },
  ];

  return (
    <section className="panel item-details-panel" data-testid="item-details-panel">
      <div className="panel__header">
        <div>
          <h2>{tt("itemDetails", "Item Details")}</h2>
          <p>{tt("itemDetailsHint", "Review item information, preview the SKU QR label, and export it.")}</p>
        </div>
        <div className="panel__actions">
          <button className="button-secondary" onClick={onBack} type="button">
            {tt("backToList", "Back To List")}
          </button>
          {onModifyItem && (
            <button className="button-secondary" onClick={() => onModifyItem(item.id)} type="button">
              {tt("modifyItem", "Modify Item")}
            </button>
          )}
          {onRemoveItem && (
            <button className="button-danger-ghost" onClick={() => onRemoveItem(item.id)} type="button">
              {tt("removeItem", "Remove Item")}
            </button>
          )}
          <button data-testid="item-export-qr-label" disabled={!item.qrCodeDataUrl} onClick={onExport} type="button">
            {tt("exportQrLabel", "Export QR Label")}
          </button>
        </div>
      </div>
      {/* Key-value detail table stays as a description list, not DataTable */}
      <table className="item-details-table">
        <tbody>
          <tr><td className="item-details-table__label">{tt("sku", "SKU")}</td><td className="cell-mono">{item.sku}</td><td className="item-details-table__label">{tt("category", "Category")}</td><td>{localizeCategory(item.category, language)}</td></tr>
          <tr><td className="item-details-table__label">{tt("itemName", "Item Name")}</td><td>{item.name}</td><td className="item-details-table__label">{tt("location", "Location")}</td><td>{item.location}</td></tr>
          <tr><td className="item-details-table__label">{tt("unit", "Unit")}</td><td>{localizeUnit(item.unit, language)}</td><td className="item-details-table__label">{tt("supplier", "Supplier")}</td><td>{item.supplier || tt("notProvided", "Not provided")}</td></tr>
          <tr><td className="item-details-table__label">{tt("currentQuantity", "Qty")}</td><td className="cell-strong">{formatNumber(item.currentQuantity, language)}</td><td className="item-details-table__label">{tt("reorderLevel", "Reorder")}</td><td>{formatNumber(item.reorderQuantity, language)}</td></tr>
          <tr><td className="item-details-table__label">{tt("lastUpdated", "Updated")}</td><td>{formatDate(item.lastUpdated, language)}</td><td className="item-details-table__label">{tt("qrCode", "QR Code")}</td><td>{item.qrCodeDataUrl ? <QrCodeImage text={item.qrCodeDataUrl} alt={item.sku} /> : tt("qrCodeUnavailable", "N/A")}</td></tr>
        </tbody>
      </table>
      <div className="item-movements-section">
        <div className="panel__header">
          <div>
            <h3>{tt("movementHistory", "Movement History")}</h3>
            <p>{tt("movementHistoryHint", "Latest 50 stock movements for this item.")}</p>
          </div>
        </div>
        {movementError ? (
          <div className="feedback-banner feedback-banner--error">{
            typeof movementError === "string" ? movementError : tt("noMovements", "No movements recorded yet.")
          }</div>
        ) : (
          <DataTable
            columns={movementColumns}
            data={sortedMovements}
            rowKey={(m) => m.id}
            loading={loadingMovements}
            loadingMessage={tt("loadingMovements", "Loading movement history...")}
            emptyTitle={tt("noMovements", "No movements recorded yet.")}
            testId="movement-history-table"
            sortState={sortState}
            onSortChange={setSortState}
          />
        )}
      </div>
    </section>
  );
}
