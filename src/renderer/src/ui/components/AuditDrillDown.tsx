import { formatDate } from "../../app/formatDate";
import type { AuditMovementFilters, AuditMovementRow, Language } from "../../domain/models";
import { getAuditMovements } from "../../services/inventoryGateway";
import { useTranslation } from "react-i18next";
import { useAsyncData } from "../hooks/useAsyncData";
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
  const t = i18n.getFixedT(language, ["common", "audit"]);

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

  const columns: ColumnDef<AuditMovementRow>[] = [
    { key: "date", header: t("date", { ns: "audit" }), render: (row) => formatDate(row.performedAt, language) },
    {
      key: "type",
      header: t("type", { ns: "audit" }),
      render: (row) =>
        row.movementType === "receive"
          ? t("receiveStock", { ns: "audit" })
          : t("issueMaterial", { ns: "audit" }),
    },
    {
      key: "quantity",
      header: t("quantity", { ns: "audit" }),
      className: "cell-mono",
      render: (row) => (row.movementType === "receive" ? `+${row.quantity}` : `-${row.quantity}`),
    },
    { key: "balance", header: t("balance", { ns: "audit" }), className: "cell-mono cell-strong", render: (row) => row.newQuantity },
    {
      key: "performedBy",
      header: t("performedBy", { ns: "audit" }),
      render: (row) =>
        row.performedBy || (
          <span className="cell-muted">{t("notProvided", { ns: "common" })}</span>
        ),
    },
    { key: "reason", header: t("reason", { ns: "audit" }), render: (row) => row.reason || "" },
    { key: "referenceNo", header: t("referenceNo", { ns: "audit" }), render: (row) => row.referenceNo || "" },
    { key: "notes", header: t("notes", { ns: "audit" }), render: (row) => row.notes || "" },
  ];

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
          <button type="button" className="button-secondary" onClick={onBack}>
            {t("backToList", { ns: "audit" })}
          </button>
        </div>
      </div>

      {error ? (
        <div className="feedback-banner feedback-banner--error">{error}</div>
      ) : (
        <DataTable
          columns={columns}
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
