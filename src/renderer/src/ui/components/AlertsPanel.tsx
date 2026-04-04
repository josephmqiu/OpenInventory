import { useMemo, useState } from "react";
import { formatDate } from "../../app/formatDate";
import { localizeAlertStatus } from "../../app/i18n";
import type { InventoryAlert, Language } from "../../domain/models";
import { useTT } from "../hooks/useTT";
import { sortDataByKey } from "../utils/sortData";
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

  const columns = useMemo<ColumnDef<InventoryAlert>[]>(() => [
    {
      key: "severity",
      header: "",
      width: "3%",
      className: "cell-severity-stripe",
      render: (alert) => {
        const severity = severityClass(alert);
        return severity ? <span className={`severity-bar severity-bar--${severity}`} /> : null;
      },
    },
    { key: "name", header: tt("itemName", "Item Name"), width: "25%", className: "cell-title", sortable: true, sortKey: "itemName", render: (a) => a.itemName },
    { key: "sku", header: tt("sku", "SKU"), width: "17%", className: "cell-mono cell-truncate", sortable: true, sortKey: "sku", render: (a) => a.sku },
    {
      key: "qty",
      header: tt("currentQuantity", "Qty"),
      width: "13%",
      sortable: true,
      sortKey: "currentQuantity",
      render: (alert) => {
        const severity = severityClass(alert);
        return <span className={`cell-strong${severity ? ` cell-strong--${severity}` : ""}`}>{alert.currentQuantity}</span>;
      },
    },
    { key: "reorder", header: tt("reorderLevel", "Reorder"), width: "13%", className: "cell-strong", sortable: true, sortKey: "thresholdQuantity", render: (a) => a.thresholdQuantity },
    {
      key: "status",
      header: tt("status", "Status"),
      width: "13%",
      sortable: true,
      sortKey: "status",
      render: (alert) => (
        <span className={`status-pill status-pill--alert-${alert.status}`}>
          {localizeAlertStatus(alert.status, language)}
        </span>
      ),
    },
    { key: "date", header: tt("date", "Date"), width: "16%", className: "cell-date", sortable: true, sortKey: "triggeredAt", render: (a) => formatDate(a.triggeredAt, language) },
  ], [tt, language]);

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
      </div>
      <DataTable
        columns={columns}
        data={sorted}
        rowKey={(a) => a.id}
        className="table--fixed"
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
