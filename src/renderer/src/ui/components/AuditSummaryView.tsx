import { useState, useMemo } from "react";
import { formatDate } from "../../app/formatDate";
import type { AuditAnalyticsResult, AuditMovementFilters, Language } from "../../domain/models";
import { getAuditAnalytics } from "../../services/inventoryGateway";
import { useTranslation } from "react-i18next";
import { useAsyncData } from "../hooks/useAsyncData";
import { useTableColumns } from "../hooks/useTableColumns";
import { sortDataByKey } from "../utils/sortData";
import { ColumnsMenu } from "./ColumnsMenu";
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
  // Memoize so the catalogs (and useTableColumns' memos) stay stable across renders.
  const t = useMemo(() => i18n.getFixedT(language, ["common", "audit"]), [i18n, language]);

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

  // Catalogs lifted to the top level (above the loading/error early returns) and
  // all three hooks called unconditionally — Rules of Hooks. Only the active
  // view's menu + table render below, so there's one view-aware menu at a time.
  const personnelCatalog = useMemo<ColumnDef<PersonnelRow>[]>(() => [
    { key: "performedBy", header: t("performedBy", { ns: "audit" }), menuLabel: t("performedBy", { ns: "audit" }), defaultVisible: true, sortable: true, sortKey: "performedBy", render: (r) => r.performedBy },
    { key: "receiveCount", header: t("receiveCount", { ns: "audit" }), menuLabel: t("receiveCount", { ns: "audit" }), defaultVisible: true, className: "cell-mono", sortable: true, sortKey: "receiveCount", render: (r) => r.receiveCount },
    { key: "issueCount", header: t("issueCount", { ns: "audit" }), menuLabel: t("issueCount", { ns: "audit" }), defaultVisible: true, className: "cell-mono", sortable: true, sortKey: "issueCount", render: (r) => r.issueCount },
    { key: "totalQuantity", header: t("totalQuantityMoved", { ns: "audit" }), menuLabel: t("totalQuantityMoved", { ns: "audit" }), defaultVisible: true, className: "cell-mono", sortable: true, sortKey: "totalQuantity", render: (r) => r.totalQuantity },
    { key: "distinctItems", header: t("distinctItemsMoved", { ns: "audit" }), menuLabel: t("distinctItemsMoved", { ns: "audit" }), defaultVisible: true, className: "cell-mono", sortable: true, sortKey: "distinctItems", render: (r) => r.distinctItems },
  ], [t]);

  const itemsCatalog = useMemo<ColumnDef<ItemRow>[]>(() => [
    {
      key: "itemName",
      header: t("itemName", { ns: "audit" }),
      menuLabel: t("itemName", { ns: "audit" }),
      defaultVisible: true,
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
    { key: "receiveCount", header: t("receiveCount", { ns: "audit" }), menuLabel: t("receiveCount", { ns: "audit" }), defaultVisible: true, className: "cell-mono", sortable: true, sortKey: "receiveCount", render: (r) => r.receiveCount },
    { key: "issueCount", header: t("issueCount", { ns: "audit" }), menuLabel: t("issueCount", { ns: "audit" }), defaultVisible: true, className: "cell-mono", sortable: true, sortKey: "issueCount", render: (r) => r.issueCount },
    { key: "totalReceived", header: t("totalReceived", { ns: "audit" }), menuLabel: t("totalReceived", { ns: "audit" }), defaultVisible: true, className: "cell-mono", sortable: true, sortKey: "totalReceived", render: (r) => r.totalReceived },
    { key: "totalIssued", header: t("totalIssued", { ns: "audit" }), menuLabel: t("totalIssued", { ns: "audit" }), defaultVisible: true, className: "cell-mono", sortable: true, sortKey: "totalIssued", render: (r) => r.totalIssued },
    { key: "netChange", header: t("netChange", { ns: "audit" }), menuLabel: t("netChange", { ns: "audit" }), defaultVisible: true, className: "cell-mono", sortable: true, sortKey: "netChange", render: (r) => (r.netChange > 0 ? `+${r.netChange}` : r.netChange) },
    { key: "currentQuantity", header: t("currentQuantity", { ns: "audit" }), menuLabel: t("currentQuantity", { ns: "audit" }), defaultVisible: true, className: "cell-mono", sortable: true, sortKey: "currentQuantity", render: (r) => r.currentQuantity },
  ], [t, onItemClick]);

  const alertsCatalog = useMemo<ColumnDef<AlertRow>[]>(() => [
    {
      key: "itemName",
      header: t("itemName", { ns: "audit" }),
      menuLabel: t("itemName", { ns: "audit" }),
      defaultVisible: true,
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
    { key: "triggerCount", header: t("triggerCount", { ns: "audit" }), menuLabel: t("triggerCount", { ns: "audit" }), defaultVisible: true, className: "cell-mono", sortable: true, sortKey: "triggerCount", render: (r) => r.triggerCount },
    { key: "lastTriggered", header: t("lastTriggered", { ns: "audit" }), menuLabel: t("lastTriggered", { ns: "audit" }), defaultVisible: true, sortable: true, sortKey: "lastTriggeredAt", render: (r) => formatDate(r.lastTriggeredAt, language) },
    {
      key: "status",
      header: t("status", { ns: "audit" }),
      menuLabel: t("status", { ns: "audit" }),
      defaultVisible: true,
      sortable: true,
      sortKey: "currentStatus",
      render: (r) => (
        <span className={`status-pill status-pill--alert-${r.currentStatus}`}>
          {r.currentStatus}
        </span>
      ),
    },
    { key: "currentQuantity", header: t("currentQuantity", { ns: "audit" }), menuLabel: t("currentQuantity", { ns: "audit" }), defaultVisible: true, className: "cell-mono", sortable: true, sortKey: "currentQuantity", render: (r) => r.currentQuantity },
  ], [t, onItemClick, language]);

  const personnelCols = useTableColumns("audit-summary-personnel", personnelCatalog, {
    sortState: sortStates.personnel,
    onClearSort: () => setSortStates((p) => ({ ...p, personnel: null })),
    resize: false,
  });
  const itemsCols = useTableColumns("audit-summary-items", itemsCatalog, {
    sortState: sortStates.items,
    onClearSort: () => setSortStates((p) => ({ ...p, items: null })),
    resize: false,
  });
  const alertsCols = useTableColumns("audit-summary-alerts", alertsCatalog, {
    sortState: sortStates.alerts,
    onClearSort: () => setSortStates((p) => ({ ...p, alerts: null })),
    resize: false,
  });

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
    return (
      <div className="audit-summary">
        <div className="audit-toolbar">
          <ColumnsMenu {...personnelCols.menuProps} />
        </div>
        <DataTable
          {...personnelCols.dataTableProps}
          data={sortedPersonnel}
          rowKey={(r) => r.performedBy}
          emptyTitle={t("noAuditData", { ns: "audit" })}
          sortState={currentSort}
          onSortChange={handleSortChange}
        />
      </div>
    );
  }

  if (view === "items") {
    return (
      <div className="audit-summary">
        <div className="audit-toolbar">
          <ColumnsMenu {...itemsCols.menuProps} />
        </div>
        <DataTable
          {...itemsCols.dataTableProps}
          data={sortedItems}
          rowKey={(r) => r.itemId}
          emptyTitle={t("noAuditData", { ns: "audit" })}
          sortState={currentSort}
          onSortChange={handleSortChange}
        />
      </div>
    );
  }

  // view === "alerts"
  return (
    <div className="audit-summary">
      <div className="audit-toolbar">
        <ColumnsMenu {...alertsCols.menuProps} />
      </div>
      <DataTable
        {...alertsCols.dataTableProps}
        data={sortedAlerts}
        rowKey={(r) => r.itemId}
        emptyTitle={t("noAuditData", { ns: "audit" })}
        sortState={currentSort}
        onSortChange={handleSortChange}
      />
    </div>
  );
}
