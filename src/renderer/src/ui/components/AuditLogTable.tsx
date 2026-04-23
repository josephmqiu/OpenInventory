import { formatDate } from "../../app/formatDate";
import type { AuditMovementRow, AuditPageResult, AuditMovementFilters, Language } from "../../domain/models";
import { useTranslation } from "react-i18next";
import { DataTable, type ColumnDef, type SortState } from "./DataTable";
import { ConfirmDialog } from "./ConfirmDialog";
import { useState } from "react";
import { Trash2 } from "lucide-react";

interface AuditLogTableProps {
  language: Language;
  data: AuditPageResult;
  filters: AuditMovementFilters;
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

function exportAuditCsv(rows: AuditMovementRow[], labels: AuditCsvLabels, total: number): void {
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
  onPageChange,
  onItemClick,
  onQuickFilter,
  onDeleteMovement,
  onError,
}: AuditLogTableProps) {
  const { i18n } = useTranslation(["common", "audit"]);
  const t = i18n.getFixedT(language, ["common", "audit"]);
  const totalPages = Math.max(1, Math.ceil(data.total / filters.pageSize));
  const currentPage = filters.page;
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [selectedMovementId, setSelectedMovementId] = useState<string | null>(null);
  const labels: AuditCsvLabels = {
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
  };

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
    if (data.total <= data.rows.length) {
      exportAuditCsv(data.rows, labels, data.total);
      return;
    }
    const { getAuditMovements } = await import("../../services/inventoryGateway");
    try {
      const allData = await getAuditMovements({ ...filters, page: 1, pageSize: 10000 });
      exportAuditCsv(allData.rows, labels, allData.total);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteClick = (movementId: string) => {
    setSelectedMovementId(movementId);
    setConfirmDialogOpen(true);
  };

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

  const clickDate = (dateStr: string) => {
    const dayStart = dateStr.slice(0, 10) + " 00:00:00";
    const dayEnd = dateStr.slice(0, 10) + " 23:59:59";
    onQuickFilter({ dateFrom: dayStart, dateTo: dayEnd });
  };

  const columns: ColumnDef<AuditMovementRow>[] = [
    {
      key: "date",
      header: labels.date,
      sortable: true,
      sortKey: "date",
      render: (row) => (
        <button type="button" className="cell-filterable" onClick={() => clickDate(row.performedAt)} title={t("clickToFilter", { ns: "audit" })}>
          {formatDate(row.performedAt, language)}
        </button>
      ),
    },
    {
      key: "itemName",
      header: labels.itemName,
      sortable: true,
      sortKey: "itemName",
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
      sortable: true,
      sortKey: "type",
      render: (row) => (
        <button type="button" className="cell-filterable" onClick={() => onQuickFilter({ movementType: row.movementType as "receive" | "issue" })} title={t("clickToFilter", { ns: "audit" })}>
          {row.movementType === "receive" ? labels.receiveStock : labels.issueMaterial}
        </button>
      ),
    },
    { key: "quantity", header: labels.quantity, className: "cell-mono", sortable: true, sortKey: "quantity", render: (row) => row.quantity },
    {
      key: "performedBy",
      header: labels.performedBy,
      sortable: true,
      sortKey: "performedBy",
      render: (row) =>
        row.performedBy ? (
          <button type="button" className="cell-filterable" onClick={() => onQuickFilter({ performedBy: row.performedBy! })} title={t("clickToFilter", { ns: "audit" })}>
            {row.performedBy}
          </button>
        ) : (
          <span className="cell-muted">{t("notProvided", { ns: "common" })}</span>
        ),
    },
    { key: "previousQuantity", header: labels.previousQuantity, className: "cell-mono", sortable: true, sortKey: "previousQuantity", render: (row) => row.previousQuantity },
    { key: "newQuantity", header: labels.newQuantity, className: "cell-mono", sortable: true, sortKey: "newQuantity", render: (row) => row.newQuantity },
    { key: "reason", header: labels.reason, sortable: true, sortKey: "reason", render: (row) => row.reason || "" },
    { key: "referenceNo", header: labels.referenceNo, sortable: true, sortKey: "referenceNo", render: (row) => row.referenceNo || "" },
    { key: "notes", header: labels.notes, sortable: true, sortKey: "notes", render: (row) => row.notes || "" },
    {
      key: "actions",
      header: "",
      sortable: false,
      className: "cell-actions",
      render: (row) => (
        <button
            type="button"
            className="button-danger button-inline button-icon"
            onClick={() => handleDeleteClick(row.id)}
            title={t("deleteMovement", { ns: "audit" })}
          >
          <Trash2 size={16} />
        </button>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={data.rows}
        rowKey={(row) => row.id}
        rowClassName={(row) => (row.isAnomaly ? "audit-row--anomaly" : "")}
        className="audit-table"
        sortState={sortState}
        onSortChange={handleSortChange}
      />
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
          <button type="button" className="button-secondary button-inline" onClick={handleExport} disabled={data.total === 0}>
            {t("exportCsv", { ns: "audit" })}
          </button>
        </div>
      </div>
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
