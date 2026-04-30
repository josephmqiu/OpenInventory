import { useState, useMemo } from "react";
import { formatDate } from "../../app/formatDate";
import type { AuditAnalyticsResult, AuditMovementFilters, Language } from "../../domain/models";
import { getAuditAnalytics } from "../../services/inventoryGateway";
import { useTranslation } from "react-i18next";
import { useAsyncData } from "../hooks/useAsyncData";
import { sortDataByKey } from "../utils/sortData";
import { DataTable, type ColumnDef, type SortState } from "./DataTable";

type SummaryView = "personnel" | "items" | "alerts";

interface AuditSummaryViewProps {
  language: Language;
  filters: AuditMovementFilters;
  view: SummaryView;
  onItemClick: (itemId: string, itemName: string) => void;
}

export function AuditSummaryView({ language, filters, view, onItemClick }: AuditSummaryViewProps) {
  const { i18n } = useTranslation(["common", "audit"]);
  const t = i18n.getFixedT(language, ["common", "audit"]);

  const { data, loading, error } = useAsyncData(
    () => {
      return getAuditAnalytics({
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        movementType: filters.movementType,
        itemId: filters.itemId,
        itemSearch: filters.itemSearch,
        performedBy: filters.performedBy,
        textSearch: filters.textSearch,
      });
    },
    [filters.dateFrom, filters.dateTo, filters.movementType, filters.itemId, filters.itemSearch, filters.performedBy, filters.textSearch],
  );

  const [sortStates, setSortStates] = useState<Record<SummaryView, SortState | null>>({
    personnel: null,
    items: null,
    alerts: null,
  });

  const currentSort = sortStates[view];
  const handleSortChange = (newState: SortState | null) => {
    setSortStates((prev) => ({ ...prev, [view]: newState }));
  };

  type PersonnelRow = AuditAnalyticsResult["byPersonnel"][number];
  type ItemRow = AuditAnalyticsResult["byItem"][number];
  type AlertRow = AuditAnalyticsResult["alertFrequency"][number];

  const sortedPersonnel = useMemo(
    () => data ? sortDataByKey(data.byPersonnel, currentSort) : [],
    [data, currentSort],
  );
  const sortedItems = useMemo(
    () => data ? sortDataByKey(data.byItem, currentSort) : [],
    [data, currentSort],
  );
  const sortedAlerts = useMemo(
    () => data ? sortDataByKey(data.alertFrequency, currentSort) : [],
    [data, currentSort],
  );

  if (loading) {
    return (
      <div className="empty-state">
        <h3>{t("loadingAuditData", { ns: "audit" })}</h3>
      </div>
    );
  }

  if (error) {
    return <div className="feedback-banner feedback-banner--error">{error}</div>;
  }

  if (!data) return null;

  if (view === "personnel") {
    const columns: ColumnDef<PersonnelRow>[] = [
      { key: "performedBy", header: t("performedBy", { ns: "audit" }), sortable: true, sortKey: "performedBy", render: (r) => r.performedBy },
      { key: "receiveCount", header: t("receiveCount", { ns: "audit" }), className: "cell-mono", sortable: true, sortKey: "receiveCount", render: (r) => r.receiveCount },
      { key: "issueCount", header: t("issueCount", { ns: "audit" }), className: "cell-mono", sortable: true, sortKey: "issueCount", render: (r) => r.issueCount },
      { key: "totalQuantity", header: t("totalQuantityMoved", { ns: "audit" }), className: "cell-mono", sortable: true, sortKey: "totalQuantity", render: (r) => r.totalQuantity },
      { key: "distinctItems", header: t("distinctItemsMoved", { ns: "audit" }), className: "cell-mono", sortable: true, sortKey: "distinctItems", render: (r) => r.distinctItems },
    ];
    return (
      <DataTable
        columns={columns}
        data={sortedPersonnel}
        rowKey={(r) => r.performedBy}
        emptyTitle={t("noAuditData", { ns: "audit" })}
        sortState={currentSort}
        onSortChange={handleSortChange}
      />
    );
  }

  if (view === "items") {
    const columns: ColumnDef<ItemRow>[] = [
      {
        key: "itemName",
        header: t("itemName", { ns: "audit" }),
        sortable: true,
        sortKey: "itemName",
        render: (r) => (
          <>
            <button type="button" className="cell-link" onClick={() => onItemClick(r.itemId, r.itemName)}>
              {r.itemName}
            </button>
            <span className="cell-subtitle">{r.itemSku}</span>
          </>
        ),
      },
      { key: "receiveCount", header: t("receiveCount", { ns: "audit" }), className: "cell-mono", sortable: true, sortKey: "receiveCount", render: (r) => r.receiveCount },
      { key: "issueCount", header: t("issueCount", { ns: "audit" }), className: "cell-mono", sortable: true, sortKey: "issueCount", render: (r) => r.issueCount },
      { key: "totalReceived", header: t("totalReceived", { ns: "audit" }), className: "cell-mono", sortable: true, sortKey: "totalReceived", render: (r) => r.totalReceived },
      { key: "totalIssued", header: t("totalIssued", { ns: "audit" }), className: "cell-mono", sortable: true, sortKey: "totalIssued", render: (r) => r.totalIssued },
      { key: "netChange", header: t("netChange", { ns: "audit" }), className: "cell-mono", sortable: true, sortKey: "netChange", render: (r) => (r.netChange > 0 ? `+${r.netChange}` : r.netChange) },
      { key: "currentQuantity", header: t("currentQuantity", { ns: "audit" }), className: "cell-mono", sortable: true, sortKey: "currentQuantity", render: (r) => r.currentQuantity },
    ];
    return (
      <DataTable
        columns={columns}
        data={sortedItems}
        rowKey={(r) => r.itemId}
        emptyTitle={t("noAuditData", { ns: "audit" })}
        sortState={currentSort}
        onSortChange={handleSortChange}
      />
    );
  }

  // view === "alerts"
  const alertColumns: ColumnDef<AlertRow>[] = [
    {
      key: "itemName",
      header: t("itemName", { ns: "audit" }),
      sortable: true,
      sortKey: "itemName",
      render: (r) => (
        <>
          <button type="button" className="cell-link" onClick={() => onItemClick(r.itemId, r.itemName)}>
            {r.itemName}
          </button>
          <span className="cell-subtitle">{r.itemSku}</span>
        </>
      ),
    },
    { key: "triggerCount", header: t("triggerCount", { ns: "audit" }), className: "cell-mono", sortable: true, sortKey: "triggerCount", render: (r) => r.triggerCount },
    { key: "lastTriggered", header: t("lastTriggered", { ns: "audit" }), sortable: true, sortKey: "lastTriggeredAt", render: (r) => formatDate(r.lastTriggeredAt, language) },
    {
      key: "status",
      header: t("status", { ns: "audit" }),
      sortable: true,
      sortKey: "currentStatus",
      render: (r) => (
        <span className={`status-pill status-pill--alert-${r.currentStatus}`}>
          {r.currentStatus}
        </span>
      ),
    },
    { key: "currentQuantity", header: t("currentQuantity", { ns: "audit" }), className: "cell-mono", sortable: true, sortKey: "currentQuantity", render: (r) => r.currentQuantity },
  ];
  return (
    <DataTable
      columns={alertColumns}
      data={sortedAlerts}
      rowKey={(r) => r.itemId}
      emptyTitle={t("noAuditData", { ns: "audit" })}
      sortState={currentSort}
      onSortChange={handleSortChange}
    />
  );
}
