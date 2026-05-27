import { formatDate } from "../../app/formatDate";
import type { AuditMovementRow, AuditPageResult, AuditMovementFilters, Language } from "../../domain/models";
import { useTranslation } from "react-i18next";
import { DataTable, type ColumnDef, type SortState } from "./DataTable";
import { ColumnsMenu } from "./ColumnsMenu";
import { useTableColumns } from "../hooks/useTableColumns";
import { ConfirmDialog } from "./ConfirmDialog";
import { useCallback, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";

interface AuditLogTableProps {
  language: Language;
  /** Null during the initial load before the first page arrives. */
  data: AuditPageResult | null;
  filters: AuditMovementFilters;
  /** Show a loading state in place of the table (toolbar stays mounted). */
  loading?: boolean;
  /** Empty-state title when there are no rows (caller picks the message). */
  emptyTitle?: string;
  /** Empty-state hint under the title. */
  emptyHint?: string;
  onPageChange: (page: number) => void;
  onItemClick: (itemId: string, itemName: string) => void;
  onQuickFilter: (update: Partial<AuditMovementFilters>) => void;
  onDeleteMovement: (movementId: string) => Promise<void>;
  onError?: (msg: string) => void;
}

export type AuditCsvLabels = {
  date: string;
  itemName: string;
  sku: string;
  type: string;
  quantity: string;
  previousQuantity: string;
  newQuantity: string;
  performedBy: string;
  reason: string;
  referenceNo: string;
  notes: string;
  receiveStock: string;
  issueMaterial: string;
};

export function buildAuditCsvContent(rows: AuditMovementRow[], labels: AuditCsvLabels): string {
  const headers = [
    labels.date,
    labels.itemName,
    labels.sku,
    labels.type,
    labels.quantity,
    labels.previousQuantity,
    labels.newQuantity,
    labels.performedBy,
    labels.reason,
    labels.referenceNo,
    labels.notes,
  ];
  const csvRows = rows.map((row) => [
    row.performedAt,
    row.itemName,
    row.itemSku,
    row.movementType === "receive" ? labels.receiveStock : labels.issueMaterial,
    String(row.quantity),
    String(row.previousQuantity),
    String(row.newQuantity),
    row.performedBy ?? "",
    row.reason ?? "",
    row.referenceNo ?? "",
    row.notes ?? "",
  ]);
  return [headers, ...csvRows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

function exportAuditCsv(rows: AuditMovementRow[], labels: AuditCsvLabels): void {
  const csvContent = buildAuditCsvContent(rows, labels);
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function AuditLogTable({
  language,
  data,
  filters,
  loading = false,
  emptyTitle,
  emptyHint,
  onPageChange,
  onItemClick,
  onQuickFilter,
  onDeleteMovement,
  onError,
}: AuditLogTableProps) {
  const { i18n } = useTranslation(["common", "audit"]);
  // Memoize the fixed-T so the catalog (and useTableColumns' memos) stay stable
  // across the 2-3s poll re-renders rather than rebuilding every tick.
  const t = useMemo(() => i18n.getFixedT(language, ["common", "audit"]), [i18n, language]);

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const currentPage = filters.page;
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [selectedMovementId, setSelectedMovementId] = useState<string | null>(null);

  const labels = useMemo<AuditCsvLabels>(
    () => ({
      date: t("date", { ns: "audit" }),
      itemName: t("itemName", { ns: "audit" }),
      sku: t("sku", { ns: "audit" }),
      type: t("type", { ns: "audit" }),
      quantity: t("quantity", { ns: "audit" }),
      previousQuantity: t("previousQuantity", { ns: "audit" }),
      newQuantity: t("newQuantity", { ns: "audit" }),
      performedBy: t("performedBy", { ns: "audit" }),
      reason: t("reason", { ns: "audit" }),
      referenceNo: t("referenceNo", { ns: "audit" }),
      notes: t("notes", { ns: "audit" }),
      receiveStock: t("receiveStock", { ns: "audit" }),
      issueMaterial: t("issueMaterial", { ns: "audit" }),
    }),
    [t],
  );

  const sortState: SortState | null = filters.sortBy && filters.sortDir
    ? { key: filters.sortBy, dir: filters.sortDir }
    : null;

  const handleSortChange = (newState: SortState | null) => {
    onQuickFilter({
      sortBy: newState?.key,
      sortDir: newState?.dir,
    });
  };

  const handleExport = async () => {
    if (!data) return;
    if (data.total <= data.rows.length) {
      exportAuditCsv(data.rows, labels);
      return;
    }
    const { getAuditMovements } = await import("../../services/inventoryGateway");
    try {
      const allData = await getAuditMovements({ ...filters, page: 1, pageSize: 10000 });
      exportAuditCsv(allData.rows, labels);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteClick = useCallback((movementId: string) => {
    setSelectedMovementId(movementId);
    setConfirmDialogOpen(true);
  }, []);

  const handleConfirmDelete = async () => {
    if (selectedMovementId) {
      try {
        await onDeleteMovement(selectedMovementId);
      } catch (err) {
        onError?.(err instanceof Error ? err.message : String(err));
      } finally {
        setConfirmDialogOpen(false);
        setSelectedMovementId(null);
      }
    }
  };

  const handleCancelDelete = () => {
    setConfirmDialogOpen(false);
    setSelectedMovementId(null);
  };

  const clickDate = useCallback(
    (dateStr: string) => {
      const dayStart = dateStr.slice(0, 10) + " 00:00:00";
      const dayEnd = dateStr.slice(0, 10) + " 23:59:59";
      onQuickFilter({ dateFrom: dayStart, dateTo: dayEnd });
    },
    [onQuickFilter],
  );

  // Catalog = the 11 activity-log columns, all shown by default. Actions is
  // pinned last and structural; everything else is hideable + reorderable.
  // No resize here (audit table keeps its `max-content` sizing).
  const catalog = useMemo<ColumnDef<AuditMovementRow>[]>(
    () => [
      {
        key: "date",
        header: labels.date,
        menuLabel: labels.date,
        sortable: true,
        sortKey: "date",
        defaultVisible: true,
        render: (row) => (
          <button type="button" className="cell-filterable" onClick={() => clickDate(row.performedAt)} title={t("clickToFilter", { ns: "audit" })}>
            {formatDate(row.performedAt, language)}
          </button>
        ),
      },
      {
        key: "itemName",
        header: labels.itemName,
        menuLabel: labels.itemName,
        sortable: true,
        sortKey: "itemName",
        defaultVisible: true,
        render: (row) => (
          <>
            <button type="button" className="cell-link" onClick={() => onItemClick(row.itemId, row.itemName)}>
              {row.itemName}
            </button>
            <span className="cell-subtitle">{row.itemSku}</span>
          </>
        ),
      },
      {
        key: "type",
        header: labels.type,
        menuLabel: labels.type,
        sortable: true,
        sortKey: "type",
        defaultVisible: true,
        render: (row) => (
          <button type="button" className="cell-filterable" onClick={() => onQuickFilter({ movementType: row.movementType as "receive" | "issue" })} title={t("clickToFilter", { ns: "audit" })}>
            {row.movementType === "receive" ? labels.receiveStock : labels.issueMaterial}
          </button>
        ),
      },
      { key: "quantity", header: labels.quantity, menuLabel: labels.quantity, className: "cell-mono", sortable: true, sortKey: "quantity", defaultVisible: true, render: (row) => row.quantity },
      {
        key: "performedBy",
        header: labels.performedBy,
        menuLabel: labels.performedBy,
        sortable: true,
        sortKey: "performedBy",
        defaultVisible: true,
        render: (row) =>
          row.performedBy ? (
            <button type="button" className="cell-filterable" onClick={() => onQuickFilter({ performedBy: row.performedBy! })} title={t("clickToFilter", { ns: "audit" })}>
              {row.performedBy}
            </button>
          ) : (
            <span className="cell-muted">{t("notProvided", { ns: "common" })}</span>
          ),
      },
      { key: "previousQuantity", header: labels.previousQuantity, menuLabel: labels.previousQuantity, className: "cell-mono", sortable: true, sortKey: "previousQuantity", defaultVisible: true, render: (row) => row.previousQuantity },
      { key: "newQuantity", header: labels.newQuantity, menuLabel: labels.newQuantity, className: "cell-mono", sortable: true, sortKey: "newQuantity", defaultVisible: true, render: (row) => row.newQuantity },
      { key: "reason", header: labels.reason, menuLabel: labels.reason, sortable: true, sortKey: "reason", defaultVisible: true, render: (row) => row.reason || "" },
      { key: "referenceNo", header: labels.referenceNo, menuLabel: labels.referenceNo, sortable: true, sortKey: "referenceNo", defaultVisible: true, render: (row) => row.referenceNo || "" },
      { key: "notes", header: labels.notes, menuLabel: labels.notes, sortable: true, sortKey: "notes", defaultVisible: true, render: (row) => row.notes || "" },
      {
        key: "actions",
        header: "",
        menuLabel: t("actions", { ns: "audit" }),
        sortable: false,
        className: "cell-actions",
        pin: "end",
        hideable: false,
        defaultVisible: true,
        render: (row) => (
          <button
            type="button"
            className="button-danger button-inline button-icon"
            aria-label={t("deleteMovement", { ns: "audit" })}
            data-testid={`delete-movement-${row.id}`}
            onClick={() => handleDeleteClick(row.id)}
            title={t("deleteMovement", { ns: "audit" })}
          >
            <Trash2 size={16} />
          </button>
        ),
      },
    ],
    [labels, t, language, clickDate, handleDeleteClick, onItemClick, onQuickFilter],
  );

  // Audit sort is server-side: clearing a stranded sort goes through onQuickFilter
  // (triggers a refetch), not local state — so the hook's sort-clear is injected here.
  // No resize on this table (max-content sizing, shipped without resize).
  const cols = useTableColumns("audit-log-table", catalog, {
    sortState,
    onClearSort: () => onQuickFilter({ sortBy: undefined, sortDir: undefined }),
    resize: false,
  });

  return (
    <>
      <div className="audit-toolbar">
        <ColumnsMenu {...cols.menuProps} />
      </div>
      <DataTable
        {...cols.dataTableProps}
        data={rows}
        rowKey={(row) => row.id}
        rowClassName={(row) => (row.isAnomaly ? "audit-row--anomaly" : "")}
        className="audit-table"
        loading={loading}
        loadingMessage={t("loadingAuditData", { ns: "audit" })}
        emptyTitle={emptyTitle}
        emptyHint={emptyHint}
        sortState={sortState}
        onSortChange={handleSortChange}
      />
      {!loading && rows.length > 0 && (
        <div className="audit-pagination">
          <span>
            {t("pageOf", { ns: "audit", current: currentPage, total: totalPages })}
          </span>
          <div className="audit-pagination__controls">
            <button
              type="button"
              className="button-secondary button-inline"
              disabled={currentPage <= 1}
              onClick={() => onPageChange(currentPage - 1)}
            >
              {t("previousPage", { ns: "audit" })}
            </button>
            <button
              type="button"
              className="button-secondary button-inline"
              disabled={currentPage >= totalPages}
              onClick={() => onPageChange(currentPage + 1)}
            >
              {t("nextPage", { ns: "audit" })}
            </button>
            <button type="button" className="button-secondary button-inline" onClick={handleExport} disabled={total === 0}>
              {t("exportCsv", { ns: "audit" })}
            </button>
          </div>
        </div>
      )}
      <ConfirmDialog
        isOpen={confirmDialogOpen}
        title={t("deleteMovement", { ns: "audit" })}
        message={t("deleteMovementConfirm", { ns: "audit" })}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        confirmText={t("delete", { ns: "common" })}
        cancelText={t("cancel", { ns: "common" })}
      />
    </>
  );
}
