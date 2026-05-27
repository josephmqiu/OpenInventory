import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  AuditReportPeriodArgs,
  AuditReportResult,
  AuditReportTotals,
  Language,
} from "../../domain/models";
import { getPeriodReport } from "../../services/inventoryGateway";
import { useAsyncData } from "../hooks/useAsyncData";
import { formatPrice, formatNumber } from "../../app/formatters";
import { localeByLanguage } from "../../app/i18nResources";
import { MetricCard, type MetricDelta } from "./MetricCard";
import { AuditDrillDown } from "./AuditDrillDown";
import {
  formatPeriodLabel,
  shiftPeriod,
  type AuditPeriodGranularity,
} from "../../../../shared/auditPeriod";

interface PeriodReportPanelProps {
  language: Language;
}

type Tt = (key: string, opts?: Record<string, unknown>) => string;

const GRANULARITIES: AuditPeriodGranularity[] = ["month", "quarter", "half", "year"];

function maxIndex(g: AuditPeriodGranularity): number {
  return g === "month" ? 12 : g === "quarter" ? 4 : g === "half" ? 2 : 1;
}

/** The most recent fully-elapsed period for a granularity (current period is half-data). */
function lastCompletedPeriod(g: AuditPeriodGranularity): AuditReportPeriodArgs {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-based
  if (g === "month") {
    const a = y * 12 + m - 1;
    return { granularity: "month", year: Math.floor(a / 12), index: (a % 12) + 1 };
  }
  if (g === "quarter") {
    const a = y * 4 + Math.floor(m / 3) - 1;
    return { granularity: "quarter", year: Math.floor(a / 4), index: (a % 4) + 1 };
  }
  if (g === "half") {
    const a = y * 2 + (m < 6 ? 0 : 1) - 1;
    return { granularity: "half", year: Math.floor(a / 2), index: (a % 2) + 1 };
  }
  return { granularity: "year", year: y - 1, index: 1 };
}

/** Signed percent change of `current` vs `prior`, as a neutral instrument delta. */
export function pctDelta(current: number, prior: number): MetricDelta {
  if (prior === 0) {
    if (current === 0) return { text: "0%", direction: "flat" };
    // From a zero baseline the percentage is undefined, but the DIRECTION must
    // still follow the sign of `current` — net value is often negative, so a
    // 0 → −500 swing is a decrease (down), never a "+100% up".
    return current > 0
      ? { text: "+100%", direction: "up" }
      : { text: "−100%", direction: "down" };
  }
  const pct = ((current - prior) / Math.abs(prior)) * 100;
  const direction = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
  const sign = pct > 0 ? "+" : "";
  return { text: `${sign}${pct.toFixed(0)}%`, direction };
}

function yoySubline(t: Tt, current: number, yoy: number, yoyHasData: boolean): string {
  if (!yoyHasData) return t("yoyLabel", { text: t("noPriorYearData") });
  return t("yoyLabel", { text: pctDelta(current, yoy).text });
}

// ─── Multi-section CSV (reuses the Blob-download pattern from AuditLogTable) ──

export interface PeriodCsvLabels {
  reportTitle: string;
  period: string;
  generatedOn: string;
  currency: string;
  valueCaveat: string;
  unpricedNote: string;
  metric: string;
  value: string;
  topItemsTitle: string;
  byPersonnelTitle: string;
  alertsTitle: string;
  item: string;
  sku: string;
  issuedQty: string;
  issuedValue: string;
  personnel: string;
  receives: string;
  issues: string;
  totalQty: string;
  triggers: string;
}

function csvRow(cells: (string | number)[]): string {
  return cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",");
}

export function buildPeriodReportCsv(
  report: AuditReportResult,
  language: Language,
  labels: PeriodCsvLabels,
  generatedOnText: string,
): string {
  const money = (minor: number) => formatPrice(minor, report.currency, language);
  const lines: string[] = [];
  lines.push(csvRow([labels.reportTitle, report.period.label]));
  lines.push(csvRow([labels.period, `${report.period.from} – ${report.period.to}`]));
  lines.push(csvRow([labels.generatedOn, generatedOnText]));
  lines.push(csvRow([labels.currency, report.currency]));
  lines.push(csvRow([labels.valueCaveat]));
  if (report.totals.unvaluedItemCount > 0) {
    lines.push(csvRow([labels.unpricedNote]));
  }
  lines.push("");

  // Summary
  lines.push(csvRow([labels.metric, labels.value]));
  const tt = report.totals;
  lines.push(csvRow(["movements", tt.totalMovements]));
  lines.push(csvRow(["received_qty", tt.totalReceivedQty]));
  lines.push(csvRow(["issued_qty", tt.totalIssuedQty]));
  lines.push(csvRow(["received_value", money(tt.receivedValueMinor)]));
  lines.push(csvRow(["issued_value", money(tt.issuedValueMinor)]));
  lines.push(csvRow(["net_value", money(tt.netValueMinor)]));
  lines.push("");

  // Top items
  lines.push(csvRow([labels.topItemsTitle]));
  lines.push(csvRow([labels.item, labels.sku, labels.issuedQty, labels.issuedValue]));
  for (const r of report.topItems) {
    // Match the UI: unpriced items show "—", never a fake 0 value (honest valuation).
    lines.push(csvRow([r.itemName, r.itemSku, r.issuedQty, r.hasPrice ? money(r.issuedValueMinor) : "—"]));
  }
  lines.push("");

  // By personnel
  lines.push(csvRow([labels.byPersonnelTitle]));
  lines.push(csvRow([labels.personnel, labels.receives, labels.issues, labels.totalQty]));
  for (const r of report.analytics.byPersonnel) {
    lines.push(csvRow([r.performedBy, r.receiveCount, r.issueCount, r.totalQuantity]));
  }
  lines.push("");

  // Alerts
  lines.push(csvRow([labels.alertsTitle]));
  lines.push(csvRow([labels.item, labels.sku, labels.triggers]));
  for (const r of report.analytics.alertFrequency) {
    lines.push(csvRow([r.itemName, r.itemSku, r.triggerCount]));
  }

  return lines.join("\n");
}

function downloadCsv(content: string, filename: string): void {
  const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PeriodReportPanel({ language }: PeriodReportPanelProps) {
  const { i18n } = useTranslation(["common", "audit"]);
  // All keys this panel uses live in the `audit` namespace; bind to it directly.
  const t = useMemo(() => i18n.getFixedT(language, "audit") as Tt, [i18n, language]);

  const [period, setPeriod] = useState<AuditReportPeriodArgs>(() => lastCompletedPeriod("month"));
  const [drill, setDrill] = useState<{ itemId: string; itemName: string } | null>(null);
  // Bumped by the error-retry button. Cloning `period` wouldn't re-fetch because
  // the deps are the primitive fields, so an explicit nonce drives the retry.
  const [reloadNonce, setReloadNonce] = useState(0);

  const { data: report, loading, error } = useAsyncData<AuditReportResult>(
    () => getPeriodReport(period),
    [period.granularity, period.year, period.index, reloadNonce],
  );

  const setGranularity = useCallback((g: AuditPeriodGranularity) => {
    setDrill(null);
    setPeriod(lastCompletedPeriod(g));
  }, []);

  const step = useCallback((delta: number) => {
    setDrill(null);
    setPeriod((p) => shiftPeriod(p, delta));
  }, []);

  const handleExportCsv = useCallback(() => {
    if (!report) return;
    const labels: PeriodCsvLabels = {
      reportTitle: t("periodSummary"),
      period: t("dateRange"),
      generatedOn: t("generatedOn", { datetime: "" }),
      currency: t("currencyLabel"),
      valueCaveat: t("valuedAtCurrentPrices"),
      unpricedNote: t("unpricedExcluded", {
        excluded: report.totals.unvaluedItemCount,
        total: report.totals.valuedItemCount + report.totals.unvaluedItemCount,
      }),
      metric: t("metric"),
      value: t("value"),
      topItemsTitle: t("topItemsTitle"),
      byPersonnelTitle: t("byPersonnel"),
      alertsTitle: t("alertFrequency"),
      item: t("itemName"),
      sku: t("sku"),
      issuedQty: t("issuedQty"),
      issuedValue: t("issuedValue"),
      personnel: t("performedBy"),
      receives: t("receiveCount"),
      issues: t("issueCount"),
      totalQty: t("totalQuantityMoved"),
      triggers: t("triggerCount"),
    };
    const generatedOnText = new Date().toLocaleString(localeByLanguage[language]);
    const csv = buildPeriodReportCsv(report, language, labels, generatedOnText);
    downloadCsv(csv, `period-summary-${period.year}-${period.granularity}-${period.index}.csv`);
  }, [report, t, language, period]);

  // Drill-down replaces the report body (shared component).
  if (drill && report) {
    return (
      <AuditDrillDown
        language={language}
        itemId={drill.itemId}
        itemName={drill.itemName}
        filters={{ dateFrom: report.period.from, dateTo: report.period.to, page: 1, pageSize: 50 }}
        sourceTab="items"
        onBack={() => setDrill(null)}
      />
    );
  }

  const money = (minor: number) =>
    report ? formatPrice(minor, report.currency, language) : "—";

  return (
    <section className="panel report-panel">
      {/* 1. Report identity block (also the print header) */}
      <header className="report-identity">
        <h2 className="report-identity__title">
          {t("periodSummary")} · {report ? report.period.label : formatPeriodLabel(period, language)}
        </h2>
        {report && (
          <p className="report-identity__meta">
            {report.period.from} – {report.period.to}
            {" · "}
            {t("generatedOn", { datetime: new Date().toLocaleString(localeByLanguage[language]) })}
            {" · "}
            {report.currency}
          </p>
        )}
        <p className="report-identity__caveat">{t("valuedAtCurrentPrices")}</p>
        {report && report.totals.unvaluedItemCount > 0 && (
          <p className="report-identity__warning" role="status">
            {t("unpricedExcluded", {
              excluded: report.totals.unvaluedItemCount,
              total: report.totals.valuedItemCount + report.totals.unvaluedItemCount,
            })}
          </p>
        )}
      </header>

      {/* 2. Period control (hidden in print via @media print) */}
      <div className="report-controls no-print">
        <div className="filter-tabs" role="tablist" aria-label={t("periodGranularity")}>
          {GRANULARITIES.map((g) => (
            <button
              key={g}
              type="button"
              role="tab"
              aria-selected={period.granularity === g}
              className={`filter-tab${period.granularity === g ? " filter-tab--active" : ""}`}
              data-testid={`report-granularity-${g}`}
              onClick={() => setGranularity(g)}
            >
              {t(`granularity_${g}`)}
            </button>
          ))}
        </div>
        <div className="report-period-picker">
          <button type="button" className="button-secondary button-inline" aria-label={t("prevPeriod")} onClick={() => step(-1)}>
            ‹
          </button>
          {period.granularity !== "year" && (
            <select
              className="report-period-select"
              aria-label={t("periodGranularity")}
              data-testid="report-index-select"
              value={period.index}
              onChange={(e) => { setDrill(null); setPeriod((p) => ({ ...p, index: Number(e.target.value) })); }}
            >
              {Array.from({ length: maxIndex(period.granularity) }, (_, i) => i + 1).map((idx) => (
                <option key={idx} value={idx}>
                  {formatPeriodLabel({ ...period, index: idx }, language)}
                </option>
              ))}
            </select>
          )}
          <select
            className="report-period-select"
            aria-label="year"
            value={period.year}
            onChange={(e) => { setDrill(null); setPeriod((p) => ({ ...p, year: Number(e.target.value) })); }}
          >
            {Array.from({ length: 7 }, (_, i) => new Date().getFullYear() - i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button type="button" className="button-secondary button-inline" aria-label={t("nextPeriod")} onClick={() => step(1)}>
            ›
          </button>
        </div>
        <div className="report-actions">
          <button type="button" className="button-secondary button-inline" onClick={() => window.print()}>
            {t("print")}
          </button>
          <button type="button" className="button-secondary button-inline" disabled={!report || !report.totals.hasData} onClick={handleExportCsv}>
            {t("exportCsv")}
          </button>
        </div>
      </div>

      {error && (
        <div className="feedback-banner feedback-banner--error">
          {error}
          <button type="button" className="button-secondary button-inline" onClick={() => setReloadNonce((n) => n + 1)} style={{ marginLeft: 8 }}>
            {t("retryLoad")}
          </button>
        </div>
      )}

      {!error && report && !report.totals.hasData && (
        <p className="report-empty">{t("noMovementInPeriod", { period: report.period.label })}</p>
      )}

      {!error && report && report.totals.hasData && (
        <PeriodReportBody report={report} prior={report.priorTotals} t={t} money={money} language={language} onDrill={setDrill} />
      )}

      {loading && !report && <p>{t("loadingAuditData")}</p>}
    </section>
  );
}

function PeriodReportBody({
  report,
  prior,
  t,
  money,
  language,
  onDrill,
}: {
  report: AuditReportResult;
  prior: AuditReportTotals;
  t: Tt;
  money: (minor: number) => string;
  language: Language;
  onDrill: (d: { itemId: string; itemName: string }) => void;
}) {
  const cur = report.totals;
  const yoy = report.yoyTotals;
  const trendMax = Math.max(1, ...report.trend.map((p) => p.issuedValueMinor));

  return (
    <>
      {/* 3. Instrument band — value metrics primary, with prior + YoY deltas */}
      <div className="metrics-grid metrics-grid--instrument" style={{ marginBottom: 12 }}>
        <MetricCard
          label={t("issuedValue")}
          value={money(cur.issuedValueMinor)}
          delta={pctDelta(cur.issuedValueMinor, prior.issuedValueMinor)}
          subline={yoySubline(t, cur.issuedValueMinor, yoy.issuedValueMinor, yoy.hasData)}
        />
        <MetricCard
          label={t("receivedValue")}
          value={money(cur.receivedValueMinor)}
          delta={pctDelta(cur.receivedValueMinor, prior.receivedValueMinor)}
          subline={yoySubline(t, cur.receivedValueMinor, yoy.receivedValueMinor, yoy.hasData)}
        />
        <MetricCard
          label={t("netValue")}
          value={money(cur.netValueMinor)}
          delta={pctDelta(cur.netValueMinor, prior.netValueMinor)}
          subline={yoySubline(t, cur.netValueMinor, yoy.netValueMinor, yoy.hasData)}
        />
        <MetricCard
          label={t("inventoryHealth")}
          value={formatNumber(report.inventoryHealth.lowOrZeroItemCount, language)}
          tone={report.inventoryHealth.lowOrZeroItemCount > 0 ? "danger" : "default"}
        />
      </div>

      {/* Secondary counts */}
      <div className="metrics-grid metrics-grid--secondary" style={{ marginBottom: 16 }}>
        <MetricCard label={t("totalMovements")} value={formatNumber(cur.totalMovements, language)} delta={pctDelta(cur.totalMovements, prior.totalMovements)} />
        <MetricCard label={t("totalReceived")} value={formatNumber(cur.totalReceivedQty, language)} delta={pctDelta(cur.totalReceivedQty, prior.totalReceivedQty)} />
        <MetricCard label={t("totalIssued")} value={formatNumber(cur.totalIssuedQty, language)} delta={pctDelta(cur.totalIssuedQty, prior.totalIssuedQty)} />
      </div>

      {/* 3a. Trend strip — monochrome 6-bar instrument row (issued value) */}
      {report.trend.length > 0 && (
        <section className="trend-strip" aria-label={t("trendTitle")}>
          <h3 className="report-section-title">{t("trendTitle")}</h3>
          <div className="trend-bars">
            {report.trend.map((point, i) => {
              const isCurrent = i === report.trend.length - 1;
              const heightPct = Math.round((point.issuedValueMinor / trendMax) * 100);
              return (
                <div key={i} className="trend-bar-col" title={`${point.label}: ${money(point.issuedValueMinor)}`}>
                  <div className="trend-bar-track">
                    <div
                      className={`trend-bar${isCurrent ? " trend-bar--current" : ""}`}
                      style={{ height: `${Math.max(2, heightPct)}%` }}
                    />
                  </div>
                  <span className="trend-bar-label">{point.label}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 3b. Biggest movers vs prior period */}
      <section className="report-section">
        <h3 className="report-section-title">{t("biggestMoversTitle", { label: report.priorPeriod.label })}</h3>
        {report.biggestMovers.length === 0 ? (
          <p className="report-empty">{t("noPriorPeriod")}</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("itemName")}</th>
                <th className="num">{t("issuedValue")}</th>
                <th className="num">{t("netChange")}</th>
              </tr>
            </thead>
            <tbody>
              {report.biggestMovers.map((m) => {
                const up = m.deltaValueMinor > 0;
                const sign = up ? "+" : "−";
                return (
                  <tr key={m.itemId} className="data-table__row--clickable" onClick={() => onDrill({ itemId: m.itemId, itemName: m.itemName })}>
                    <td>{m.itemName} <span className="muted">{m.itemSku}</span></td>
                    <td className="num">{money(m.currentIssuedValueMinor)}</td>
                    <td className="num">{sign}{money(Math.abs(m.deltaValueMinor)).replace(/^[+-]?/, "")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* 4. Top items by issued value */}
      <section className="report-section">
        <h3 className="report-section-title">{t("topItemsTitle")}</h3>
        {report.topItems.length === 0 ? (
          <p className="report-empty">{t("noAuditData")}</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("itemName")}</th>
                <th>{t("sku")}</th>
                <th className="num">{t("issuedQty")}</th>
                <th className="num">{t("issuedValue")}</th>
              </tr>
            </thead>
            <tbody>
              {report.topItems.map((r) => (
                <tr key={r.itemId} className="data-table__row--clickable" onClick={() => onDrill({ itemId: r.itemId, itemName: r.itemName })}>
                  <td>{r.itemName}</td>
                  <td>{r.itemSku}</td>
                  <td className="num">{formatNumber(r.issuedQty, language)}</td>
                  <td className="num">{r.hasPrice ? money(r.issuedValueMinor) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* By personnel */}
      <section className="report-section">
        <h3 className="report-section-title">{t("byPersonnel")}</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("performedBy")}</th>
              <th className="num">{t("receiveCount")}</th>
              <th className="num">{t("issueCount")}</th>
              <th className="num">{t("totalQuantityMoved")}</th>
            </tr>
          </thead>
          <tbody>
            {report.analytics.byPersonnel.map((r) => (
              <tr key={r.performedBy}>
                <td>{r.performedBy}</td>
                <td className="num">{formatNumber(r.receiveCount, language)}</td>
                <td className="num">{formatNumber(r.issueCount, language)}</td>
                <td className="num">{formatNumber(r.totalQuantity, language)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
