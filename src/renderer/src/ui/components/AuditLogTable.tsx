import { formatDate } from "../../app/formatDate";
import type { Dictionary } from "../../app/i18n";
import type { AuditMovementRow, AuditPageResult, AuditMovementFilters, Language } from "../../domain/models";

interface AuditLogTableProps {
  dictionary: Dictionary;
  language: Language;
  data: AuditPageResult;
  filters: AuditMovementFilters;
  onPageChange: (page: number) => void;
  onItemClick: (itemId: string, itemName: string) => void;
  onQuickFilter: (update: Partial<AuditMovementFilters>) => void;
}

function exportAuditCsv(rows: AuditMovementRow[], dictionary: Dictionary, total: number): void {
  const headers = [
    dictionary.date,
    dictionary.itemName,
    dictionary.sku,
    dictionary.type,
    dictionary.quantity,
    dictionary.previousQuantity,
    dictionary.newQuantity,
    dictionary.performedBy,
    dictionary.reason,
    dictionary.referenceNo,
    dictionary.notes,
  ];
  const csvRows = rows.map((row) => [
    row.performedAt,
    row.itemName,
    row.itemSku,
    row.movementType === "receive" ? dictionary.receiveStock : dictionary.issueMaterial,
    String(row.quantity),
    String(row.previousQuantity),
    String(row.newQuantity),
    row.performedBy ?? "",
    row.reason ?? "",
    row.referenceNo ?? "",
    row.notes ?? "",
  ]);
  const csvContent = [headers, ...csvRows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);

  if (total > rows.length) {
    // The caller should show a truncation warning via state
  }
}

export function AuditLogTable({
  dictionary,
  language,
  data,
  filters,
  onPageChange,
  onItemClick,
  onQuickFilter,
}: AuditLogTableProps) {
  const totalPages = Math.max(1, Math.ceil(data.total / filters.pageSize));
  const currentPage = filters.page;

  const handleExport = async () => {
    if (data.total <= data.rows.length) {
      exportAuditCsv(data.rows, dictionary, data.total);
      return;
    }
    // Fetch all results (up to 10K) for export
    const { getAuditMovements } = await import("../../services/inventoryGateway");
    try {
      const allData = await getAuditMovements({ ...filters, page: 1, pageSize: 10000 });
      exportAuditCsv(allData.rows, dictionary, allData.total);
    } catch {
      // Export failed silently handled
    }
  };

  const clickDate = (dateStr: string) => {
    const dayStart = dateStr.slice(0, 10) + " 00:00:00";
    const dayEnd = dateStr.slice(0, 10) + " 23:59:59";
    onQuickFilter({ dateFrom: dayStart, dateTo: dayEnd });
  };

  return (
    <>
      <div className="table-wrap audit-table">
        <table>
          <thead>
            <tr>
              <th>{dictionary.date}</th>
              <th>{dictionary.itemName}</th>
              <th>{dictionary.type}</th>
              <th>{dictionary.quantity}</th>
              <th>{dictionary.performedBy}</th>
              <th>{dictionary.previousQuantity}</th>
              <th>{dictionary.newQuantity}</th>
              <th>{dictionary.reason}</th>
              <th>{dictionary.referenceNo}</th>
              <th>{dictionary.notes}</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr
                key={row.id}
                className={row.isAnomaly ? "audit-row--anomaly" : ""}
                aria-label={row.isAnomaly ? dictionary.anomalyTooltip(row.quantity / (row.quantity / 5)) : undefined}
              >
                <td>
                  <button
                    type="button"
                    className="cell-filterable"
                    onClick={() => clickDate(row.performedAt)}
                    title={dictionary.clickToFilter}
                  >
                    {formatDate(row.performedAt, language)}
                  </button>
                </td>
                <td>
                  <button
                    type="button"
                    className="cell-link"
                    onClick={() => onItemClick(row.itemId, row.itemName)}
                  >
                    {row.itemName}
                  </button>
                  <span className="cell-subtitle">{row.itemSku}</span>
                </td>
                <td>
                  <button
                    type="button"
                    className="cell-filterable"
                    onClick={() => onQuickFilter({ movementType: row.movementType as "receive" | "issue" })}
                    title={dictionary.clickToFilter}
                  >
                    {row.movementType === "receive" ? dictionary.receiveStock : dictionary.issueMaterial}
                  </button>
                </td>
                <td className="cell-mono">{row.quantity}</td>
                <td>
                  {row.performedBy ? (
                    <button
                      type="button"
                      className="cell-filterable"
                      onClick={() => onQuickFilter({ performedBy: row.performedBy! })}
                      title={dictionary.clickToFilter}
                    >
                      {row.performedBy}
                    </button>
                  ) : (
                    <span className="cell-muted">{dictionary.notProvided}</span>
                  )}
                </td>
                <td className="cell-mono">{row.previousQuantity}</td>
                <td className="cell-mono">{row.newQuantity}</td>
                <td>{row.reason || ""}</td>
                <td>{row.referenceNo || ""}</td>
                <td>{row.notes || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="audit-pagination">
        <span>{dictionary.pageOf(currentPage, totalPages)}</span>
        <div className="audit-pagination__controls">
          <button
            type="button"
            className="button-secondary button-inline"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
          >
            {dictionary.previousPage}
          </button>
          <button
            type="button"
            className="button-secondary button-inline"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
          >
            {dictionary.nextPage}
          </button>
          <button type="button" className="button-secondary button-inline" onClick={handleExport} disabled={data.total === 0}>
            {dictionary.exportCsv}
          </button>
        </div>
      </div>
    </>
  );
}
