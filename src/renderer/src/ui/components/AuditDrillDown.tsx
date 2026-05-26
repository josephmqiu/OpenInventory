import { useMemo } from "react";
import { formatDate } from "../../app/formatDate";
import type { AuditMovementFilters, AuditMovementRow, Language } from "../../domain/models";
import { getAuditMovements } from "../../services/inventoryGateway";
import { useTranslation } from "react-i18next";
import { useAsyncData } from "../hooks/useAsyncData";
import { useTableColumns } from "../hooks/useTableColumns";
import { ColumnsMenu } from "./ColumnsMenu";
import { DataTable, type ColumnDef } from "./DataTable";
import type { AuditTab } from "./AuditPanel";

interface AuditDrillDownProps {
  language: Language;
  itemId: string;
  itemName: string;
  filters: AuditMovementFilters;
  sourceTab: AuditTab;
  onBack: () => void;
}

export function AuditDrillDown({
  language,
  itemId,
  itemName,
  filters,
  sourceTab,
  onBack,
}: AuditDrillDownProps) {
  const { i18n } = useTranslation(["common", "audit"]);
  // Memoize so the catalog (and useTableColumns' memos) stay stable across renders.
  const t = useMemo(() => i18n.getFixedT(language, ["common", "audit"]), [i18n, language]);

  const { data: rows, loading, error } = useAsyncData(
    () =>
      getAuditMovements({
        ...filters,
        itemId,
        itemSearch: undefined,
        page: 1,
        pageSize: 500,
      }).then((result) => result.rows),
    [itemId, filters.dateFrom, filters.dateTo, filters.movementType, filters.performedBy, filters.textSearch],
  );

  const tabLabelMap: Record<AuditTab, string> = {
    log: t("activityLog", { ns: "audit" }),
    personnel: t("byPersonnel", { ns: "audit" }),
    items: t("byItem", { ns: "audit" }),
    alerts: t("alertFrequency", { ns: "audit" }),
  };
  const breadcrumbLabel = tabLabelMap[sourceTab];

  const catalog = useMemo<ColumnDef<AuditMovementRow>[]>(() => [
    { key: "date", header: t("date", { ns: "audit" }), menuLabel: t("date", { ns: "audit" }), defaultVisible: true, render: (row) => formatDate(row.performedAt, language) },
    {
      key: "type",
      header: t("type", { ns: "audit" }),
      menuLabel: t("type", { ns: "audit" }),
      defaultVisible: true,
      render: (row) =>
        row.movementType === "receive"
          ? t("receiveStock", { ns: "audit" })
          : t("issueMaterial", { ns: "audit" }),
    },
    {
      key: "quantity",
      header: t("quantity", { ns: "audit" }),
      menuLabel: t("quantity", { ns: "audit" }),
      defaultVisible: true,
      className: "cell-mono",
      render: (row) => (row.movementType === "receive" ? `+${row.quantity}` : `-${row.quantity}`),
    },
    { key: "balance", header: t("balance", { ns: "audit" }), menuLabel: t("balance", { ns: "audit" }), defaultVisible: true, className: "cell-mono cell-strong", render: (row) => row.newQuantity },
    {
      key: "performedBy",
      header: t("performedBy", { ns: "audit" }),
      menuLabel: t("performedBy", { ns: "audit" }),
      defaultVisible: true,
      render: (row) =>
        row.performedBy || (
          <span className="cell-muted">{t("notProvided", { ns: "common" })}</span>
        ),
    },
    { key: "reason", header: t("reason", { ns: "audit" }), menuLabel: t("reason", { ns: "audit" }), defaultVisible: true, render: (row) => row.reason || "" },
    { key: "referenceNo", header: t("referenceNo", { ns: "audit" }), menuLabel: t("referenceNo", { ns: "audit" }), defaultVisible: true, render: (row) => row.referenceNo || "" },
    { key: "notes", header: t("notes", { ns: "audit" }), menuLabel: t("notes", { ns: "audit" }), defaultVisible: true, render: (row) => row.notes || "" },
  ], [t, language]);

  // No sort on this table → no sortState/onClearSort. Show/hide + reorder only.
  const cols = useTableColumns("audit-drilldown", catalog, { resize: false });

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
          <p>
            {t("auditDrillDownHint", { ns: "audit", itemName })}
          </p>
        </div>
        <div className="panel__actions">
          <ColumnsMenu {...cols.menuProps} />
          <button type="button" className="button-secondary" onClick={onBack}>
            {t("backToList", { ns: "audit" })}
          </button>
        </div>
      </div>

      {error ? (
        <div className="feedback-banner feedback-banner--error">{error}</div>
      ) : (
        <DataTable
          {...cols.dataTableProps}
          data={rows ?? []}
          rowKey={(row) => row.id}
          loading={loading}
          loadingMessage={t("loadingAuditData", { ns: "audit" })}
          emptyTitle={t("noAuditData", { ns: "audit" })}
          emptyHint={t("noAuditDataHint", { ns: "audit" })}
          rowClassName={(row) => (row.isAnomaly ? "audit-row--anomaly" : "")}
        />
      )}
    </section>
  );
}
