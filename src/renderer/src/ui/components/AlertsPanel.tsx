import { useMemo, useState } from "react";
import { formatDate } from "../../app/formatDate";
import { localizeAlertStatus } from "../../app/i18n";
import type { InventoryAlert, Language } from "../../domain/models";
import { useTT } from "../hooks/useTT";
import { useTableColumns } from "../hooks/useTableColumns";
import { sortDataByKey } from "../utils/sortData";
import { ColumnsMenu } from "./ColumnsMenu";
import { DataTable, type ColumnDef, type SortState } from "./DataTable";

interface AlertsPanelProps {
  alerts: InventoryAlert[];
  language: Language;
}

type FilterTab = "all" | "open" | "resolved";

export function AlertsPanel({ alerts, language }: AlertsPanelProps) {
  const tt = useTT();
  const [filter, setFilter] = useState<FilterTab>("all");
  const [sortState, setSortState] = useState<SortState | null>(null);

  const openCount = alerts.filter((a) => a.status === "open").length;
  const resolvedCount = alerts.filter((a) => a.status === "resolved").length;

  const filtered = filter === "all" ? alerts : alerts.filter((a) => a.status === filter);

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: "all", label: tt("all", "All"), count: alerts.length },
    { key: "open", label: localizeAlertStatus("open", language), count: openCount },
    { key: "resolved", label: localizeAlertStatus("resolved", language), count: resolvedCount },
  ];

  const severityClass = (alert: InventoryAlert): string => {
    if (alert.status === "resolved") return "";
    return alert.currentQuantity === 0 ? "danger" : "warning";
  };

  // px defaultWidths (not %) so hiding a column doesn't break a 100%-sum layout;
  // `fluid` lets the table stretch like the inventory table. The severity stripe
  // is a structural row indicator (DESIGN.md): pinned, non-hideable, non-resizable.
  const catalog = useMemo<ColumnDef<InventoryAlert>[]>(() => [
    {
      key: "severity",
      header: "",
      menuLabel: tt("severity", "Severity"),
      pin: "start",
      hideable: false,
      resizable: false,
      defaultVisible: true,
      defaultWidth: 28,
      className: "cell-severity-stripe",
      render: (alert) => {
        const severity = severityClass(alert);
        return severity ? <span className={`severity-bar severity-bar--${severity}`} /> : null;
      },
    },
    { key: "name", header: tt("itemName", "Item Name"), menuLabel: tt("itemName", "Item Name"), defaultVisible: true, defaultWidth: 220, className: "cell-title", sortable: true, sortKey: "itemName", render: (a) => a.itemName },
    { key: "sku", header: tt("sku", "SKU"), menuLabel: tt("sku", "SKU"), defaultVisible: true, defaultWidth: 150, className: "cell-mono cell-truncate", sortable: true, sortKey: "sku", render: (a) => a.sku },
    {
      key: "qty",
      header: tt("currentQuantity", "Qty"),
      menuLabel: tt("currentQuantity", "Qty"),
      defaultVisible: true,
      defaultWidth: 110,
      sortable: true,
      sortKey: "currentQuantity",
      render: (alert) => {
        const severity = severityClass(alert);
        return <span className={`cell-strong${severity ? ` cell-strong--${severity}` : ""}`}>{alert.currentQuantity}</span>;
      },
    },
    { key: "reorder", header: tt("reorderLevel", "Reorder"), menuLabel: tt("reorderLevel", "Reorder"), defaultVisible: true, defaultWidth: 110, className: "cell-strong", sortable: true, sortKey: "thresholdQuantity", render: (a) => a.thresholdQuantity },
    {
      key: "status",
      header: tt("status", "Status"),
      menuLabel: tt("status", "Status"),
      defaultVisible: true,
      defaultWidth: 130,
      sortable: true,
      sortKey: "status",
      render: (alert) => (
        <span className={`status-pill status-pill--alert-${alert.status}`}>
          {localizeAlertStatus(alert.status, language)}
        </span>
      ),
    },
    { key: "date", header: tt("date", "Date"), menuLabel: tt("date", "Date"), defaultVisible: true, defaultWidth: 160, className: "cell-date", sortable: true, sortKey: "triggeredAt", render: (a) => formatDate(a.triggeredAt, language) },
  ], [tt, language]);

  // Show/hide + reorder only — no resize on this short fixed table (resize:false).
  const cols = useTableColumns("alerts", catalog, {
    sortState,
    onClearSort: () => setSortState(null),
    resize: false,
  });

  const sorted = useMemo(
    () => sortDataByKey(filtered, sortState),
    [filtered, sortState],
  );

  return (
    <section className="panel">
      <div className="panel__header">
        <div className="filter-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`filter-tab${filter === tab.key ? " filter-tab--active" : ""}`}
              onClick={() => setFilter(tab.key)}
              type="button"
            >
              {tab.label}
              <span className="filter-tab__count">{tab.count}</span>
            </button>
          ))}
        </div>
        <ColumnsMenu {...cols.menuProps} />
      </div>
      <DataTable
        {...cols.dataTableProps}
        data={sorted}
        rowKey={(a) => a.id}
        className="table--fixed"
        fluid
        rowClassName={(alert) => {
          const severity = severityClass(alert);
          return severity ? `row-severity row-severity--${severity}` : "";
        }}
        sortState={sortState}
        onSortChange={setSortState}
        emptyTitle={tt("noAlerts", "No low-stock alerts.")}
        emptyHint={tt("noAlertsHint", "Alerts will appear when an item reaches or drops below its reorder level.")}
      />
    </section>
  );
}
