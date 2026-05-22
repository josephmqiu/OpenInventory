import { useMemo, useState } from "react";
import { formatDate } from "../../app/formatDate";
import { formatPrice } from "../../app/formatters";
import { buildDashboardMetrics } from "../../domain/inventory";
import type { CurrencyCode, InventoryAlert, InventoryItem, Language } from "../../domain/models";
import { getAuditAnalytics } from "../../services/inventoryGateway";
import { useAsyncData } from "../hooks/useAsyncData";
import { useTT } from "../hooks/useTT";
import { sortDataByKey } from "../utils/sortData";
import { AlertsPanel } from "./AlertsPanel";
import { DataTable, type ColumnDef, type SortState } from "./DataTable";
import { MetricCard } from "./MetricCard";

import type { AuditAnalyticsResult, ItemActivityRow } from "../../domain/models";

interface DashboardViewProps {
  items: InventoryItem[];
  alerts: InventoryAlert[];
  language: Language;
  currency: CurrencyCode;
  onNavigateToInventory: (filter: "all" | "low_stock" | "out_of_stock") => void;
  onNavigateToItem: (itemId: string) => void;
}

type SubTab = "overview" | "alerts";

export function DashboardView({
  items,
  alerts,
  language,
  currency,
  onNavigateToInventory,
  onNavigateToItem,
}: DashboardViewProps) {
  const tt = useTT();
  const [tab, setTab] = useState<SubTab>("overview");
  const [topMoverSort, setTopMoverSort] = useState<SortState | null>(null);
  const [alertSort, setAlertSort] = useState<SortState | null>(null);

  const metrics = useMemo(() => buildDashboardMetrics(items, alerts), [items, alerts]);

  // Total inventory value = Σ(qty × unit price) over priced items only; track
  // coverage so the figure isn't read as a complete total when items are unpriced.
  const valuation = useMemo(() => {
    let totalMinor = 0;
    let pricedCount = 0;
    for (const item of items) {
      if (item.unitPriceMinor !== null) {
        totalMinor += item.unitPriceMinor * item.currentQuantity;
        pricedCount += 1;
      }
    }
    return { totalMinor, pricedCount, total: items.length };
  }, [items]);

  const openAlertCount = metrics.openAlertCount;
  const lowCount = metrics.lowStockCount;
  const oosCount = metrics.outOfStockCount;
  const okCount = metrics.totalItems - lowCount - oosCount;

  // --- Analytics fetch (30-day window) ---
  const dateFrom = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10) + " 00:00:00";
  }, []);

  const {
    data: analytics,
    loading: analyticsLoading,
    error: analyticsError,
  } = useAsyncData<AuditAnalyticsResult>(
    () => getAuditAnalytics({ dateFrom }),
    [dateFrom],
  );

  // --- Top movers ---
  const topMovers = useMemo<ItemActivityRow[]>(
    () => [...(analytics?.byItem ?? [])]
      .sort((a, b) => b.receiveCount + b.issueCount - (a.receiveCount + a.issueCount))
      .slice(0, 5),
    [analytics?.byItem],
  );

  const topMoverColumns = useMemo<ColumnDef<ItemActivityRow>[]>(() => [
    { key: "name", header: tt("itemName", "Name"), width: "25%", className: "cell-title", sortable: true, sortKey: "itemName", render: (r) => r.itemName },
    { key: "sku", header: tt("sku", "SKU"), width: "15%", className: "cell-mono", sortable: true, sortKey: "itemSku", render: (r) => r.itemSku },
    { key: "recv", header: tt("recvQty", "Recv Qty"), width: "15%", sortable: true, sortKey: "totalReceived", render: (r) => r.totalReceived },
    { key: "issue", header: tt("issueQty", "Issue Qty"), width: "15%", sortable: true, sortKey: "totalIssued", render: (r) => r.totalIssued },
    { key: "net", header: tt("net", "Net"), width: "15%", sortable: true, sortKey: "netChange", render: (r) => r.netChange },
    { key: "current", header: tt("current", "Current"), width: "15%", className: "cell-strong", sortable: true, sortKey: "currentQuantity", render: (r) => r.currentQuantity },
  ], [tt]);

  const sortedTopMovers = useMemo(
    () => sortDataByKey(topMovers, topMoverSort),
    [topMovers, topMoverSort],
  );

  // --- Recent alerts (open only, max 5) ---
  const recentAlerts = useMemo(() => alerts.filter((a) => a.status === "open").slice(0, 5), [alerts]);

  const itemBySku = useMemo(() => new Map(items.map((i) => [i.sku, i])), [items]);

  const alertColumns = useMemo<ColumnDef<InventoryAlert>[]>(() => [
    {
      key: "severity",
      header: "",
      width: "3%",
      className: "cell-severity-stripe",
      render: (alert) => {
        const severity = alert.currentQuantity === 0 ? "danger" : "warning";
        return <span className={`severity-bar severity-bar--${severity}`} />;
      },
    },
    { key: "name", header: tt("itemName", "Item Name"), width: "25%", className: "cell-title", sortable: true, sortKey: "itemName", render: (a) => a.itemName },
    { key: "sku", header: tt("sku", "SKU"), width: "17%", className: "cell-mono", sortable: true, sortKey: "sku", render: (a) => a.sku },
    {
      key: "qtyReorder",
      header: tt("qtySlashReorder", "Qty / Reorder"),
      width: "18%",
      sortable: true,
      sortKey: "currentQuantity",
      render: (a) => `${a.currentQuantity} / ${a.thresholdQuantity}`,
    },
    {
      key: "time",
      header: tt("time", "Time"),
      width: "20%",
      className: "cell-date",
      sortable: true,
      sortKey: "triggeredAt",
      render: (a) => formatDate(a.triggeredAt, language),
    },
  ], [tt, language]);

  const sortedAlerts = useMemo(
    () => sortDataByKey(recentAlerts, alertSort),
    [recentAlerts, alertSort],
  );

  // --- Render helpers ---
  const renderAnalyticsError = () => (
    <div className="empty-state">
      <p>{tt("movementDataUnavailable", "Movement data unavailable.")}</p>
    </div>
  );

  const renderAnalyticsEmpty = () => (
    <div className="empty-state">
      <p>{tt("noMovementsLast30", "No stock movements in the last 30 days.")}</p>
    </div>
  );

  const renderOverview = () => (
    <>
      {/* 1. Metrics strip */}
      <div className="metrics-grid">
        <MetricCard
          label={tt("totalItems", "Total Items")}
          value={metrics.totalItems}
          onClick={() => onNavigateToInventory("all")}
        />
        <MetricCard
          label={tt("totalUnits", "Total Units")}
          value={metrics.totalUnits}
        />
        <MetricCard
          label={
            valuation.pricedCount < valuation.total
              ? `${tt("totalInventoryValue", "Total Value")} · ${tt("pricedCoverage", "{priced} of {total} items priced", { priced: valuation.pricedCount, total: valuation.total })}`
              : tt("totalInventoryValue", "Total Value")
          }
          value={
            valuation.pricedCount === 0
              ? tt("noPrice", "—")
              : formatPrice(valuation.totalMinor, currency, language)
          }
        />
        <MetricCard
          label={tt("lowStock", "Low Stock")}
          value={metrics.lowStockCount}
          tone="warning"
          onClick={() => onNavigateToInventory("low_stock")}
        />
        <MetricCard
          label={tt("outOfStock", "Out of Stock")}
          value={metrics.outOfStockCount}
          tone="danger"
          onClick={() => onNavigateToInventory("out_of_stock")}
        />
        <MetricCard
          label={tt("openAlerts", "Open Alerts")}
          value={openAlertCount}
          tone="warning"
          onClick={() => setTab("alerts")}
        />
      </div>

      {/* 2. Stock status bar */}
      {items.length > 0 && (
        <div className="stock-bar">
          {okCount > 0 && (
            <div
              className="stock-bar__segment stock-bar__segment--ok"
              style={{ flex: okCount, minWidth: 32 }}
            >
              {okCount}
            </div>
          )}
          {lowCount > 0 && (
            <div
              className="stock-bar__segment stock-bar__segment--low"
              style={{ flex: lowCount, minWidth: 32 }}
            >
              {lowCount}
            </div>
          )}
          {oosCount > 0 && (
            <div
              className="stock-bar__segment stock-bar__segment--oos"
              style={{ flex: oosCount, minWidth: 32 }}
            >
              {oosCount}
            </div>
          )}
        </div>
      )}

      {/* 3. Movement summary */}
      {analyticsError ? (
        renderAnalyticsError()
      ) : analytics && analytics.summary.totalMovements === 0 ? (
        renderAnalyticsEmpty()
      ) : (
        <>
          <h3 className="dashboard-section-heading">
            {tt("movementSummary", "Movement Summary (30 Days)")}
          </h3>
          <div className="metrics-grid metrics-grid--compact">
            <MetricCard
              label={tt("totalMovements", "Total Movements")}
              value={analyticsLoading ? "---" : (analytics?.summary.totalMovements ?? "---")}
            />
            <MetricCard
              label={tt("received", "Received")}
              value={
                analyticsLoading
                  ? "---"
                  : analytics
                    ? `${analytics.summary.totalReceived} ${tt("unitsLabel", "units")}`
                    : "---"
              }
            />
            <MetricCard
              label={tt("issued", "Issued")}
              value={
                analyticsLoading
                  ? "---"
                  : analytics
                    ? `${analytics.summary.totalIssued} ${tt("unitsLabel", "units")}`
                    : "---"
              }
            />
          </div>

          {/* 4. Top movers */}
          <h3 className="dashboard-section-heading">
            {tt("topMovers", "Top Movers (30 Days)")}
          </h3>
          <DataTable
            columns={topMoverColumns}
            data={sortedTopMovers}
            rowKey={(r) => r.itemId}
            loading={analyticsLoading}
            loadingMessage={tt("loadingMovements", "Loading movement data...")}
            emptyTitle={tt("noMovementsLast30", "No stock movements in the last 30 days.")}
            className="table--fixed"
            sortState={topMoverSort}
            onSortChange={setTopMoverSort}
          />
        </>
      )}

      {/* 5. Recent alerts */}
      <h3 className="dashboard-section-heading">
        {tt("recentAlerts", "Recent Alerts")}
      </h3>
      {recentAlerts.length === 0 ? (
        <div className="empty-state">
          <p>{tt("allAboveReorder", "All items above reorder levels.")}</p>
        </div>
      ) : (
        <DataTable
          columns={alertColumns}
          data={sortedAlerts}
          rowKey={(a) => a.id}
          className="table--fixed"
          onRowClick={(alert) => {
            const item = itemBySku.get(alert.sku);
            if (item) onNavigateToItem(item.id);
          }}
          sortState={alertSort}
          onSortChange={setAlertSort}
        />
      )}
      <button
        className="dashboard-link"
        onClick={() => onNavigateToInventory("low_stock")}
        type="button"
      >
        {tt("viewLowStockItems", "View all low-stock items")}
      </button>
    </>
  );

  return (
    <section className="panel dashboard-view">
      <div className="filter-tabs">
        <button
          className={`filter-tab${tab === "overview" ? " filter-tab--active" : ""}`}
          onClick={() => setTab("overview")}
          type="button"
        >
          {tt("overview", "Overview")}
        </button>
        <button
          className={`filter-tab${tab === "alerts" ? " filter-tab--active" : ""}`}
          onClick={() => setTab("alerts")}
          type="button"
        >
          {tt("alerts", "Alerts")}
          <span className="filter-tab__count">{openAlertCount}</span>
        </button>
      </div>

      {tab === "overview" ? renderOverview() : <AlertsPanel alerts={alerts} language={language} />}
    </section>
  );
}
