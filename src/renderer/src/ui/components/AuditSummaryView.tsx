import { useEffect, useState } from "react";
import { formatDate } from "../../app/formatDate";
import type { Dictionary } from "../../app/i18n";
import type { AuditAnalyticsResult, AuditMovementFilters, Language } from "../../domain/models";
import { getAuditAnalytics } from "../../services/inventoryGateway";

interface AuditSummaryViewProps {
  dictionary: Dictionary;
  language: Language;
  filters: AuditMovementFilters;
  onItemClick: (itemId: string, itemName: string) => void;
}

export function AuditSummaryView({ dictionary, language, filters, onItemClick }: AuditSummaryViewProps) {
  const [data, setData] = useState<AuditAnalyticsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const { page: _p, pageSize: _ps, ...analyticsFilters } = filters;
    getAuditAnalytics(analyticsFilters)
      .then((result) => {
        if (!cancelled) setData(result);
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
  }, [filters.dateFrom, filters.dateTo, filters.movementType, filters.itemSearch, filters.performedBy, filters.textSearch]);

  if (loading) {
    return (
      <div className="empty-state">
        <h3>{dictionary.loadingAuditData}</h3>
      </div>
    );
  }

  if (error) {
    return <div className="feedback-banner feedback-banner--error">{error}</div>;
  }

  if (!data) return null;

  return (
    <div className="content-stack">
      {/* By Personnel */}
      <div className="audit-summary-section">
        <h3>{dictionary.byPersonnel}</h3>
        {data.byPersonnel.length === 0 ? (
          <div className="empty-state"><h3>{dictionary.noAuditData}</h3></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{dictionary.performedBy}</th>
                  <th>{dictionary.receiveCount}</th>
                  <th>{dictionary.issueCount}</th>
                  <th>{dictionary.totalQuantityMoved}</th>
                  <th>{dictionary.distinctItemsMoved}</th>
                </tr>
              </thead>
              <tbody>
                {data.byPersonnel.map((row) => (
                  <tr key={row.performedBy}>
                    <td>{row.performedBy}</td>
                    <td className="cell-mono">{row.receiveCount}</td>
                    <td className="cell-mono">{row.issueCount}</td>
                    <td className="cell-mono">{row.totalQuantity}</td>
                    <td className="cell-mono">{row.distinctItems}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* By Item */}
      <div className="audit-summary-section">
        <h3>{dictionary.byItem}</h3>
        {data.byItem.length === 0 ? (
          <div className="empty-state"><h3>{dictionary.noAuditData}</h3></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{dictionary.itemName}</th>
                  <th>{dictionary.receiveCount}</th>
                  <th>{dictionary.issueCount}</th>
                  <th>{dictionary.totalReceived}</th>
                  <th>{dictionary.totalIssued}</th>
                  <th>{dictionary.netChange}</th>
                  <th>{dictionary.currentQuantity}</th>
                </tr>
              </thead>
              <tbody>
                {data.byItem.map((row) => (
                  <tr key={row.itemId}>
                    <td>
                      <button type="button" className="cell-link" onClick={() => onItemClick(row.itemId, row.itemName)}>
                        {row.itemName}
                      </button>
                      <span className="cell-subtitle">{row.itemSku}</span>
                    </td>
                    <td className="cell-mono">{row.receiveCount}</td>
                    <td className="cell-mono">{row.issueCount}</td>
                    <td className="cell-mono">{row.totalReceived}</td>
                    <td className="cell-mono">{row.totalIssued}</td>
                    <td className="cell-mono">{row.netChange > 0 ? `+${row.netChange}` : row.netChange}</td>
                    <td className="cell-mono">{row.currentQuantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Alert Frequency */}
      <div className="audit-summary-section">
        <h3>{dictionary.alertFrequency}</h3>
        {data.alertFrequency.length === 0 ? (
          <div className="empty-state"><h3>{dictionary.noAuditData}</h3></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{dictionary.itemName}</th>
                  <th>{dictionary.triggerCount}</th>
                  <th>{dictionary.lastTriggered}</th>
                  <th>{dictionary.status}</th>
                  <th>{dictionary.currentQuantity}</th>
                </tr>
              </thead>
              <tbody>
                {data.alertFrequency.map((row) => (
                  <tr key={row.itemId}>
                    <td>
                      <button type="button" className="cell-link" onClick={() => onItemClick(row.itemId, row.itemName)}>
                        {row.itemName}
                      </button>
                      <span className="cell-subtitle">{row.itemSku}</span>
                    </td>
                    <td className="cell-mono">{row.triggerCount}</td>
                    <td>{formatDate(row.lastTriggeredAt, language)}</td>
                    <td>
                      <span className={`status-pill status-pill--alert-${row.currentStatus}`}>
                        {row.currentStatus}
                      </span>
                    </td>
                    <td className="cell-mono">{row.currentQuantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
