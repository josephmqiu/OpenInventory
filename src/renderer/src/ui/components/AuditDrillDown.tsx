import { useEffect, useState } from "react";
import { formatDate } from "../../app/formatDate";
import type { Dictionary } from "../../app/i18n";
import type { AuditMovementFilters, AuditMovementRow, Language } from "../../domain/models";
import { getAuditMovements } from "../../services/inventoryGateway";

interface AuditDrillDownProps {
  dictionary: Dictionary;
  language: Language;
  itemId: string;
  itemName: string;
  filters: AuditMovementFilters;
  sourceTab: "log" | "summary";
  onBack: () => void;
}

export function AuditDrillDown({
  dictionary,
  language,
  itemId,
  itemName,
  filters,
  sourceTab,
  onBack,
}: AuditDrillDownProps) {
  const [rows, setRows] = useState<AuditMovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getAuditMovements({
      ...filters,
      itemId,
      itemSearch: undefined,
      page: 1,
      pageSize: 500,
    })
      .then((result) => {
        if (!cancelled) setRows(result.rows);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [itemId, filters.dateFrom, filters.dateTo]);

  const breadcrumbLabel = sourceTab === "log" ? dictionary.activityLog : dictionary.activitySummary;

  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <div className="audit-breadcrumb">
            <button type="button" className="cell-link" onClick={onBack}>
              {breadcrumbLabel}
            </button>
            <span className="audit-breadcrumb__separator">&gt;</span>
            <span>{itemName}</span>
          </div>
          <p>{dictionary.auditDrillDownHint(itemName)}</p>
        </div>
        <div className="panel__actions">
          <button type="button" className="button-secondary" onClick={onBack}>
            {dictionary.backToList}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="empty-state">
          <h3>{dictionary.loadingAuditData}</h3>
        </div>
      ) : error ? (
        <div className="feedback-banner feedback-banner--error">
          {error}
          <button type="button" className="button-secondary button-inline" onClick={() => setError(null)}>
            {dictionary.retryLoad}
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <h3>{dictionary.noAuditData}</h3>
          <p>{dictionary.noAuditDataHint}</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{dictionary.date}</th>
                <th>{dictionary.type}</th>
                <th>{dictionary.quantity}</th>
                <th>{dictionary.balance}</th>
                <th>{dictionary.performedBy}</th>
                <th>{dictionary.reason}</th>
                <th>{dictionary.referenceNo}</th>
                <th>{dictionary.notes}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={row.isAnomaly ? "audit-row--anomaly" : ""}>
                  <td>{formatDate(row.performedAt, language)}</td>
                  <td>{row.movementType === "receive" ? dictionary.receiveStock : dictionary.issueMaterial}</td>
                  <td className="cell-mono">{row.movementType === "receive" ? `+${row.quantity}` : `-${row.quantity}`}</td>
                  <td className="cell-mono cell-strong">{row.newQuantity}</td>
                  <td>{row.performedBy || <span className="cell-muted">{dictionary.notProvided}</span>}</td>
                  <td>{row.reason || ""}</td>
                  <td>{row.referenceNo || ""}</td>
                  <td>{row.notes || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
