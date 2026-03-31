import { useEffect, useState, useCallback } from "react";
import type { Dictionary } from "../../app/i18n";
import type { AuditMovementFilters, AuditPageResult, Language, PersonnelMember } from "../../domain/models";
import { getAuditMovements } from "../../services/inventoryGateway";
import { MetricCard } from "./MetricCard";
import { AuditFilterBar, defaultDateFrom, defaultDateTo } from "./AuditFilterBar";
import { AuditLogTable } from "./AuditLogTable";
import { AuditSummaryView } from "./AuditSummaryView";
import { AuditDrillDown } from "./AuditDrillDown";

interface AuditPanelProps {
  dictionary: Dictionary;
  language: Language;
  personnel: PersonnelMember[];
}

type AuditTab = "log" | "summary";

interface DrillDownState {
  itemId: string;
  itemName: string;
  sourceTab: AuditTab;
}

function initialFilters(): AuditMovementFilters {
  return {
    dateFrom: defaultDateFrom(),
    dateTo: defaultDateTo(),
    page: 1,
    pageSize: 50,
  };
}

export function AuditPanel({ dictionary, language, personnel }: AuditPanelProps) {
  const [tab, setTab] = useState<AuditTab>("log");
  const [filters, setFilters] = useState<AuditMovementFilters>(initialFilters);
  const [data, setData] = useState<AuditPageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drillDown, setDrillDown] = useState<DrillDownState | null>(null);

  // Fetch data when filters change (Activity Log)
  useEffect(() => {
    if (drillDown) return; // Don't fetch main data while drilled down

    let cancelled = false;
    setLoading(true);
    setError(null);

    getAuditMovements(filters)
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
  }, [filters, drillDown]);

  const handleFiltersChange = useCallback((newFilters: AuditMovementFilters) => {
    setFilters(newFilters);
    setDrillDown(null);
  }, []);

  const handlePageChange = useCallback(
    (page: number) => {
      setFilters((prev) => ({ ...prev, page }));
    },
    [],
  );

  const handleItemClick = useCallback(
    (itemId: string, itemName: string) => {
      setDrillDown({ itemId, itemName, sourceTab: tab });
    },
    [tab],
  );

  const handleQuickFilter = useCallback(
    (update: Partial<AuditMovementFilters>) => {
      setFilters((prev) => ({ ...prev, ...update, page: 1 }));
      setDrillDown(null);
    },
    [],
  );

  const handleBackFromDrillDown = useCallback(() => {
    setDrillDown(null);
  }, []);

  const handleTabChange = useCallback((newTab: AuditTab) => {
    setTab(newTab);
    setDrillDown(null);
  }, []);

  const handleRetry = useCallback(() => {
    setError(null);
    setFilters((prev) => ({ ...prev })); // Trigger re-fetch
  }, []);

  // Drill-down replaces content
  if (drillDown) {
    return (
      <AuditDrillDown
        dictionary={dictionary}
        language={language}
        itemId={drillDown.itemId}
        itemName={drillDown.itemName}
        filters={filters}
        sourceTab={drillDown.sourceTab}
        onBack={handleBackFromDrillDown}
      />
    );
  }

  const summary = data?.summary;

  return (
    <section className="panel">
      {/* Tab navigation */}
      <div className="audit-tabs" role="tablist">
        <button
          type="button"
          className={`audit-tab${tab === "log" ? " audit-tab--active" : ""}`}
          role="tab"
          aria-selected={tab === "log"}
          onClick={() => handleTabChange("log")}
        >
          {dictionary.activityLog}
        </button>
        <button
          type="button"
          className={`audit-tab${tab === "summary" ? " audit-tab--active" : ""}`}
          role="tab"
          aria-selected={tab === "summary"}
          onClick={() => handleTabChange("summary")}
        >
          {dictionary.activitySummary}
        </button>
      </div>

      {/* Filter bar */}
      <AuditFilterBar
        dictionary={dictionary}
        language={language}
        personnel={personnel}
        filters={filters}
        onFiltersChange={handleFiltersChange}
        disabled={loading}
      />

      {/* Metrics strip */}
      <div className="metrics-grid" style={{ marginBottom: 12 }}>
        <MetricCard
          label={dictionary.totalMovements}
          value={loading ? "---" : String(summary?.totalMovements ?? 0)}
        />
        <MetricCard
          label={dictionary.totalReceived}
          value={loading ? "---" : String(summary?.totalReceived ?? 0)}
        />
        <MetricCard
          label={dictionary.totalIssued}
          value={loading ? "---" : String(summary?.totalIssued ?? 0)}
        />
        <MetricCard
          label={dictionary.uniqueItemsMoved}
          value={loading ? "---" : String(summary?.uniqueItems ?? 0)}
        />
        <MetricCard
          label={dictionary.uniquePersonnelActive}
          value={loading ? "---" : String(summary?.uniquePersonnel ?? 0)}
        />
      </div>

      {/* Content */}
      {error ? (
        <div className="feedback-banner feedback-banner--error">
          {error}
          <button type="button" className="button-secondary button-inline" onClick={handleRetry} style={{ marginLeft: 8 }}>
            {dictionary.retryLoad}
          </button>
        </div>
      ) : tab === "log" ? (
        loading ? (
          <div className="empty-state">
            <h3>{dictionary.loadingAuditData}</h3>
          </div>
        ) : data && data.rows.length > 0 ? (
          <AuditLogTable
            dictionary={dictionary}
            language={language}
            data={data}
            filters={filters}
            onPageChange={handlePageChange}
            onItemClick={handleItemClick}
            onQuickFilter={handleQuickFilter}
          />
        ) : data && data.total === 0 && !filters.movementType && !filters.itemSearch && !filters.performedBy && !filters.textSearch ? (
          <div className="empty-state">
            <h3>{dictionary.noAuditDataEver}</h3>
            <p>{dictionary.noAuditDataEverHint}</p>
          </div>
        ) : (
          <div className="empty-state">
            <h3>{dictionary.noAuditData}</h3>
            <p>{dictionary.noAuditDataHint}</p>
          </div>
        )
      ) : (
        /* Activity Summary tab */
        <div role="tabpanel">
          <AuditSummaryView
            dictionary={dictionary}
            language={language}
            filters={filters}
            onItemClick={handleItemClick}
          />
        </div>
      )}
    </section>
  );
}
