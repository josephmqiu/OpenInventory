import { useEffect, useState, useCallback } from "react";
import type { AuditMovementFilters, AuditPageResult, Language, PersonnelMember } from "../../domain/models";
import { getAuditMovements } from "../../services/inventoryGateway";
import { MetricCard } from "./MetricCard";
import { AuditFilterBar, defaultDateFrom, defaultDateTo } from "./AuditFilterBar";
import { AuditLogTable } from "./AuditLogTable";
import { AuditSummaryView } from "./AuditSummaryView";
import { AuditDrillDown } from "./AuditDrillDown";
import { useTranslation } from "react-i18next";
import { useInventoryState } from "../../app/useInventoryState";

interface AuditPanelProps {
  language: Language;
  personnel: PersonnelMember[];
}

export type AuditTab = "log" | "personnel" | "items" | "alerts";

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

export function AuditPanel({ language, personnel }: AuditPanelProps) {
  const { i18n } = useTranslation(["common", "audit"]);
  const t = i18n.getFixedT(language, ["common", "audit"]);
  const { handleDeleteMovement: deleteMovement, actionError, clearFeedback } = useInventoryState();
  const [tab, setTab] = useState<AuditTab>("log");
  const [filters, setFilters] = useState<AuditMovementFilters>(initialFilters);
  const [data, setData] = useState<AuditPageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drillDown, setDrillDown] = useState<DrillDownState | null>(null);
  const [retryKey, setRetryKey] = useState(0);

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
  }, [filters, drillDown, retryKey]);

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
    setRetryKey((k) => k + 1);
  }, []);

  const handleDeleteMovement = useCallback(async (movementId: string) => {
    const success = await deleteMovement(movementId);
    if (success) {
      // Reload data after successful deletion
      setRetryKey((k) => k + 1);
    }
  }, [deleteMovement]);

  // Drill-down replaces content
  if (drillDown) {
    return (
      <AuditDrillDown
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
  // No explicit filters applied (date range is always set) → distinguishes the
  // "no movements ever" empty state from the "nothing matches" one.
  const isUnfiltered =
    !filters.movementType && !filters.itemSearch && !filters.performedBy && !filters.textSearch;

  return (
    <section className="panel">
      {/* Tab navigation */}
      <div className="filter-tabs" style={{ marginBottom: 12 }} role="tablist">
        {([
          { id: "log", label: t("activityLog", { ns: "audit" }) },
          { id: "personnel", label: t("byPersonnel", { ns: "audit" }) },
          { id: "items", label: t("byItem", { ns: "audit" }) },
          { id: "alerts", label: t("alertFrequency", { ns: "audit" }) },
        ] as const).map((tabDef) => (
          <button
            key={tabDef.id}
            type="button"
            className={`filter-tab${tab === tabDef.id ? " filter-tab--active" : ""}`}
            data-testid={`audit-tab-${tabDef.id}`}
            role="tab"
            aria-selected={tab === tabDef.id}
            onClick={() => handleTabChange(tabDef.id)}
          >
            {tabDef.label}
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <AuditFilterBar
        language={language}
        personnel={personnel}
        filters={filters}
        onFiltersChange={handleFiltersChange}
        disabled={loading}
      />

      {/* Metrics strip */}
      <div className="metrics-grid" style={{ marginBottom: 12 }}>
        <MetricCard
          label={t("totalMovements", { ns: "audit" })}
          value={loading ? "---" : String(summary?.totalMovements ?? 0)}
        />
        <MetricCard
          label={t("totalReceived", { ns: "audit" })}
          value={loading ? "---" : String(summary?.totalReceived ?? 0)}
        />
        <MetricCard
          label={t("totalIssued", { ns: "audit" })}
          value={loading ? "---" : String(summary?.totalIssued ?? 0)}
        />
        <MetricCard
          label={t("uniqueItemsMoved", { ns: "audit" })}
          value={loading ? "---" : String(summary?.uniqueItems ?? 0)}
        />
        <MetricCard
          label={t("uniquePersonnelActive", { ns: "audit" })}
          value={loading ? "---" : String(summary?.uniquePersonnel ?? 0)}
        />
      </div>

      {/* Content */}
      {(error || actionError) ? (
        <div className="feedback-banner feedback-banner--error">
          {error || actionError}
          <button type="button" className="button-secondary button-inline" onClick={error ? handleRetry : clearFeedback} style={{ marginLeft: 8 }}>
            {error ? t("retryLoad", { ns: "audit" }) : t("dismiss", { ns: "common" })}
          </button>
        </div>
      ) : tab === "log" ? (
        // Render AuditLogTable for every log-tab state (loading / empty / rows)
        // so its Columns menu stays mounted. The two empty messages — "nothing
        // ever" vs "nothing matches your filters" — are chosen here and passed
        // down as the table's empty state.
        <AuditLogTable
          language={language}
          data={data}
          filters={filters}
          loading={loading}
          emptyTitle={isUnfiltered ? t("noAuditDataEver", { ns: "audit" }) : t("noAuditData", { ns: "audit" })}
          emptyHint={isUnfiltered ? t("noAuditDataEverHint", { ns: "audit" }) : t("noAuditDataHint", { ns: "audit" })}
          onPageChange={handlePageChange}
          onItemClick={handleItemClick}
          onQuickFilter={handleQuickFilter}
          onDeleteMovement={handleDeleteMovement}
          onError={setError}
        />
      ) : (
        <div role="tabpanel">
          <AuditSummaryView
            language={language}
            filters={filters}
            view={tab}
            onItemClick={handleItemClick}
          />
        </div>
      )}
    </section>
  );
}
