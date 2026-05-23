import { useEffect, useMemo, useRef, useState } from "react";
import { localizeStockStatus, stockStatusSeverity } from "../../app/i18n";
import { formatPrice } from "../../app/formatters";
import type { ActionKind, CurrencyCode, InventoryItem, Language } from "../../domain/models";
import { exportQrLabel, exportSelectedQrLabels } from "../../services/inventoryGateway";
import { buildQrLabelExportPayload, buildQrLabelExportPayloads } from "../export/qrLabelExport";
import { useTT } from "../hooks/useTT";
import { sortData } from "../utils/sortData";
import { DataTable, type ColumnDef, type SortState } from "./DataTable";
import { ItemDetailsPanel } from "./ItemDetailsPanel";

interface UnifiedInventoryTableProps {
  busy: boolean;
  language: Language;
  currency: CurrencyCode;
  items: InventoryItem[];
  filter: "all" | "low_stock" | "out_of_stock";
  onFilterChange: (filter: "all" | "low_stock" | "out_of_stock") => void;
  search: string;
  onSearchChange: (search: string) => void;
  detailItemId: string;
  onDetailItemIdChange: (itemId: string) => void;
  onAction: (kind: ActionKind, itemId?: string) => void;
  onBatchIssue: (itemIds: string[]) => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}

export function UnifiedInventoryTable({
  busy,
  language,
  currency,
  items,
  filter,
  onFilterChange,
  search,
  onSearchChange,
  detailItemId,
  onDetailItemIdChange,
  onAction,
  onBatchIssue,
  onError,
  onNotice,
}: UnifiedInventoryTableProps) {
  const tt = useTT();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sortState, setSortState] = useState<SortState | null>(null);

  // Structural comparison guard: only reset selection when item IDs actually change
  // (items array gets new references every poll tick via useInventoryState)
  const itemIdsKey = useMemo(() => JSON.stringify(items.map((i) => i.id).sort()), [items]);
  const validItemIds = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  const prevIdsRef = useRef(itemIdsKey);

  useEffect(() => {
    if (prevIdsRef.current === itemIdsKey) return;
    prevIdsRef.current = itemIdsKey;
    setSelectedIds((current) => current.filter((id) => validItemIds.has(id)));
    if (detailItemId && !validItemIds.has(detailItemId)) {
      onDetailItemIdChange("");
    }
  }, [itemIdsKey, validItemIds, detailItemId, onDetailItemIdChange]);

  // --- Derived state ---

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.includes(item.id)),
    [items, selectedIds],
  );
  const detailItem = useMemo(
    () => items.find((item) => item.id === detailItemId) ?? null,
    [detailItemId, items],
  );
  const selectedItemsReadyToExport =
    selectedItems.length > 0 && selectedItems.every((item) => Boolean(item.qrCodeDataUrl));
  const hasSelection = selectedIds.length > 0;

  // --- Filter counts ---

  const lowStockCount = useMemo(
    () => items.filter((i) => i.status === "low_stock").length,
    [items],
  );
  const outOfStockCount = useMemo(
    () => items.filter((i) => i.status === "out_of_stock").length,
    [items],
  );

  // --- Client-side filtering ---

  const filtered = useMemo(() => {
    const searchLower = search.toLowerCase();
    return items.filter((item) => {
      if (filter === "low_stock" && item.status !== "low_stock") return false;
      if (filter === "out_of_stock" && item.status !== "out_of_stock") return false;
      if (
        search &&
        !item.name.toLowerCase().includes(searchLower) &&
        !item.sku.toLowerCase().includes(searchLower) &&
        !item.location.toLowerCase().includes(searchLower)
      )
        return false;
      return true;
    });
  }, [items, filter, search]);

  const sorted = useMemo(
    () => sortData(filtered, sortState, (row, key) => {
      switch (key) {
        case "name": return row.name;
        case "sku": return row.sku;
        case "location": return row.location;
        case "currentQuantity": return row.currentQuantity;
        case "reorderQuantity": return row.reorderQuantity;
        case "unitPriceMinor": return row.unitPriceMinor ?? -1;
        case "status": return row.status;
        default: return undefined;
      }
    }),
    [filtered, sortState],
  );

  const allSelected = sorted.length > 0 && sorted.every((item) => selectedIds.includes(item.id));

  // --- Selection handlers ---

  const toggleSelection = (itemId: string) => {
    setSelectedIds((current) =>
      current.includes(itemId) ? current.filter((entry) => entry !== itemId) : [...current, itemId],
    );
  };

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : sorted.map((item) => item.id));
  };

  // --- QR export handler ---

  const handleExport = async (itemsToExport: InventoryItem[]) => {
    if (itemsToExport.length === 0 || itemsToExport.some((item) => !item.qrCodeDataUrl)) {
      onError(tt("qrCodeUnavailable", "QR code unavailable."));
      return;
    }

    try {
      if (itemsToExport.length === 1) {
        const savedPath = await exportQrLabel(await buildQrLabelExportPayload(itemsToExport[0]));
        if (!savedPath) {
          return;
        }
        onNotice(tt("exportQrLabelSuccess", "QR label exported."));
        return;
      }

      const savedPaths = await exportSelectedQrLabels(
        await buildQrLabelExportPayloads(itemsToExport),
      );
      if (!savedPaths) {
        return;
      }
      onNotice(
        tt(
          "exportSelectedQrsSuccess",
          savedPaths.length === 1 ? "{count} QR label exported." : "{count} QR labels exported.",
          { count: savedPaths.length },
        ),
      );
    } catch {
      onError(
        itemsToExport.length === 1
          ? tt("exportQrLabelFailed", "Unable to export the QR label.")
          : tt("exportSelectedQrsFailed", "Unable to export the selected QR labels."),
      );
    }
  };

  // --- Column definitions ---

  const columns = useMemo<ColumnDef<InventoryItem>[]>(() => [
    {
      key: "name",
      header: tt("itemName", "Item Name"),
      className: "cell-title",
      headerClassName: "col-name",
      sortable: true,
      sortKey: "name",
      render: (item) => item.name,
    },
    {
      key: "sku",
      header: tt("sku", "SKU"),
      className: "cell-mono cell-truncate",
      headerClassName: "col-sku",
      sortable: true,
      sortKey: "sku",
      render: (item) => item.sku,
    },
    {
      key: "location",
      header: tt("location", "Location"),
      headerClassName: "col-location",
      sortable: true,
      sortKey: "location",
      render: (item) => item.location,
    },
    {
      key: "qty",
      header: tt("currentQuantity", "Qty"),
      className: "cell-strong",
      headerClassName: "col-qty",
      sortable: true,
      sortKey: "currentQuantity",
      render: (item) => item.currentQuantity,
    },
    {
      key: "reorder",
      header: tt("reorderLevel", "Reorder"),
      headerClassName: "col-reorder",
      sortable: true,
      sortKey: "reorderQuantity",
      render: (item) => item.reorderQuantity,
    },
    {
      key: "price",
      header: tt("price", "Price"),
      className: "cell-mono",
      headerClassName: "col-price",
      sortable: true,
      sortKey: "unitPriceMinor",
      render: (item) =>
        item.unitPriceMinor === null
          ? tt("noPrice", "—")
          : formatPrice(item.unitPriceMinor, currency, language),
    },
    {
      key: "status",
      header: tt("status", "Status"),
      headerClassName: "col-status",
      sortable: true,
      sortKey: "status",
      render: (item) => (
        <span className={`status-label status-label--${stockStatusSeverity(item.status)}`}>
          {localizeStockStatus(item.status, language)}
        </span>
      ),
    },
    {
      key: "actions",
      header: tt("actions", "Actions"),
      render: (item) => (
        <div className="row-actions row-actions--compact">
          <button
            aria-label={`${tt("receiveStock", "Receive Stock")}: ${item.name}`}
            className="button-secondary button-inline"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              onAction("receiveStock", item.id);
            }}
            type="button"
          >
            + {tt("recv", "Recv")}
          </button>
          <button
            aria-label={`${tt("issueMaterial", "Issue Material")}: ${item.name}`}
            className="button-secondary button-inline"
            data-testid={`issue-btn-${item.sku}`}
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              onAction("issueMaterial", item.id);
            }}
            type="button"
          >
            - {tt("issue", "Issue")}
          </button>
        </div>
      ),
    },
  ], [tt, language, currency, busy, onAction]);

  // --- Empty state messages ---

  const emptyTitle = (() => {
    if (items.length === 0) {
      return tt("noInventoryItems", "No inventory records yet.");
    }
    if (search) {
      return tt("noMatchingItems", "No items match \"{search}\".", { search });
    }
    if (filter === "low_stock" || filter === "out_of_stock") {
      return tt("allAboveReorderLevels", "All items are above reorder levels.");
    }
    return undefined;
  })();

  const emptyHint =
    items.length === 0
      ? tt(
          "noInventoryItemsHint",
          "Create the first item to start tracking on-hand quantity and low-stock rules.",
        )
      : undefined;

  return (
    <>
      {/* 1. Item details panel (conditional) */}
      {detailItem && (
        <ItemDetailsPanel
          language={language}
          currency={currency}
          item={detailItem}
          onBack={() => onDetailItemIdChange("")}
          onExport={() => void handleExport([detailItem])}
          onModifyItem={(id) => onAction("modifyItem", id)}
          onRemoveItem={(id) => onAction("removeItem", id)}
        />
      )}

      <section className="panel">
        <div className="panel__header">
          {/* 2/3. Toolbar or Selection bar */}
          {hasSelection ? (
            <div className="panel__actions panel__actions--wrap">
              <span className="selection-count">
                {tt("selectedItemsCount", "{count} selected", { count: selectedIds.length })}
              </span>
              <button
                className="button-secondary"
                disabled={busy || selectedItems.length === 0}
                onClick={() => onBatchIssue(selectedIds)}
                type="button"
              >
                {tt("batchIssue", "Batch Issue")}
              </button>
              <button
                data-testid="item-export-selected-qrs"
                className="button-secondary"
                disabled={busy || !selectedItemsReadyToExport}
                onClick={() => void handleExport(selectedItems)}
                type="button"
              >
                {tt("exportSelectedQrs", "Export QR Codes")}
              </button>
              <button
                className="button-secondary"
                onClick={() => setSelectedIds([])}
                type="button"
              >
                {tt("clearSelection", "Clear")}
              </button>
            </div>
          ) : (
            <div className="panel__actions">
              <button disabled={busy} onClick={() => onAction("createItem")} type="button">
                {tt("createItem", "+ Create Item")}
              </button>
              <button
                className="button-secondary"
                disabled={busy}
                onClick={() => onAction("receiveStock")}
                type="button"
              >
                {tt("receiveStock", "Receive Stock")}
              </button>
              <button
                className="button-secondary"
                disabled={busy}
                onClick={() => onAction("issueMaterial")}
                type="button"
              >
                {tt("issueMaterial", "Issue Material")}
              </button>
            </div>
          )}
        </div>

        {/* 4. Filter tabs + search bar */}
        <div className="inventory-toolbar">
          <div className="filter-tabs inventory-toolbar__filters">
            <button
              className={`filter-tab${filter === "all" ? " filter-tab--active" : ""}`}
              onClick={() => { onFilterChange("all"); setSelectedIds([]); }}
              type="button"
            >
              {tt("allItems", "All")}
              <span className="filter-tab__count">{items.length}</span>
            </button>
            <button
              className={`filter-tab${filter === "low_stock" ? " filter-tab--active" : ""}`}
              onClick={() => { onFilterChange("low_stock"); setSelectedIds([]); }}
              type="button"
            >
              {tt("lowStockFilter", "Low Stock")}
              <span className="filter-tab__count">{lowStockCount}</span>
            </button>
            <button
              className={`filter-tab${filter === "out_of_stock" ? " filter-tab--active" : ""}`}
              onClick={() => { onFilterChange("out_of_stock"); setSelectedIds([]); }}
              type="button"
            >
              {tt("outOfStockFilter", "Out of Stock")}
              <span className="filter-tab__count">{outOfStockCount}</span>
            </button>
          </div>
          <input
            className="inventory-search"
            placeholder={tt("searchInventory", "Search by name, SKU, or location...")}
            type="search"
            role="search"
            aria-label={tt("searchInventory", "Search by name, SKU, or location...")}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {/* 5. Table */}
        <DataTable
          columns={columns}
          data={sorted}
          rowKey={(item) => item.id}
          className="table--fixed"
          onRowClick={(item) => onDetailItemIdChange(item.id)}
          selection={{
            selectedIds,
            onToggle: toggleSelection,
            onToggleAll: toggleSelectAll,
            getId: (item) => item.id,
            allSelected,
          }}
          sortState={sortState}
          onSortChange={setSortState}
          emptyTitle={emptyTitle}
          emptyHint={emptyHint}
        />
      </section>
    </>
  );
}
