import { useEffect, useMemo, useRef, useState } from "react";
import { formatNumber } from "../../app/formatters";
import { localizeUnit } from "../../app/i18n";
import type { BatchIssueMaterialInput, InventoryItem, Language, PersonnelMember } from "../../domain/models";
import { useTT } from "../hooks/useTT";
import { sortData } from "../utils/sortData";
import { DataTable, type ColumnDef, type SortState } from "./DataTable";

interface BatchIssuePanelProps {
  busy: boolean;
  errorMessage: string | null;
  items: InventoryItem[];
  language: Language;
  personnel: PersonnelMember[];
  onClose: () => void;
  onSubmit: (input: BatchIssueMaterialInput) => Promise<boolean>;
}

export function toPositiveQuantity(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return Math.floor(parsed);
}

export function buildIssueItems(
  items: readonly { id: string }[],
  quantities: Record<string, string>,
): { itemId: string; quantity: number }[] {
  return items
    .map((item) => ({
      itemId: item.id,
      quantity: toPositiveQuantity(quantities[item.id] ?? ""),
    }))
    .filter((item) => item.quantity > 0);
}

export function BatchIssuePanel({
  busy,
  errorMessage,
  items,
  language,
  personnel,
  onClose,
  onSubmit,
}: BatchIssuePanelProps) {
  const tt = useTT();
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [performedBy, setPerformedBy] = useState("");
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [localSuccess, setLocalSuccess] = useState<string | null>(null);
  const [sortState, setSortState] = useState<SortState | null>(null);
  const previousItemIdsKeyRef = useRef<string | null>(null);
  const itemIdsKey = useMemo(() => JSON.stringify(items.map((item) => item.id).sort()), [items]);

  useEffect(() => {
    const itemIdsChanged = previousItemIdsKeyRef.current !== itemIdsKey;
    previousItemIdsKeyRef.current = itemIdsKey;

    if (!itemIdsChanged) {
      setPerformedBy((current) => current || personnel[0]?.name || "");
      return;
    }

    setQuantities(Object.fromEntries(items.map((item) => [item.id, ""])));
    setPerformedBy((current) => current || personnel[0]?.name || "");
    setReason("");
    setLocalError(null);
    setLocalSuccess(null);
  }, [itemIdsKey]);

  const issueItems = useMemo(
    () => buildIssueItems(items, quantities),
    [items, quantities],
  );

  const inlineError = localError ?? errorMessage;

  const handleSubmit = async () => {
    setLocalError(null);
    setLocalSuccess(null);

    if (items.length === 0) {
      setLocalError(tt("issueCartNoSelection", "Select at least one item to open the Issue Cart."));
      return;
    }

    if (!performedBy.trim()) {
      setLocalError(tt("formValidationError", "Check the required fields and quantity values."));
      return;
    }

    if (issueItems.length === 0) {
      setLocalError(tt("formValidationError", "Check the required fields and quantity values."));
      return;
    }

    const success = await onSubmit({
      items: issueItems,
      performedBy,
      reason,
    });

    if (!success) {
      return;
    }

    setQuantities(Object.fromEntries(items.map((item) => [item.id, ""])));
    setLocalSuccess(tt("successBatchIssueMaterial", "Batch material issue recorded."));
  };

  const sortedItems = useMemo(
    () => sortData(items, sortState, (row, key) => {
      switch (key) {
        case "name": return row.name;
        case "sku": return row.sku;
        case "currentQuantity": return row.currentQuantity;
        default: return undefined;
      }
    }),
    [items, sortState],
  );

  const columns: ColumnDef<InventoryItem>[] = [
    {
      key: "name",
      header: tt("itemName", "Item Name"),
      sortable: true,
      sortKey: "name",
      render: (item) => (
        <>
          <div className="cell-title">{item.name}</div>
          <div className="cell-subtitle">{item.location}</div>
        </>
      ),
    },
    { key: "sku", header: tt("sku", "SKU"), sortable: true, sortKey: "sku", render: (item) => item.sku },
    {
      key: "currentQty",
      header: tt("currentQuantity", "Current Quantity"),
      className: "cell-strong",
      sortable: true,
      sortKey: "currentQuantity",
      render: (item) => `${formatNumber(item.currentQuantity, language)} ${localizeUnit(item.unit, language)}`,
    },
    {
      key: "quantity",
      header: tt("quantity", "Quantity"),
      render: (item) => (
        <input
          className="batch-issue-input"
          inputMode="numeric"
          pattern="[0-9]*"
          type="text"
          value={quantities[item.id] ?? ""}
          onChange={(event) => {
            const value = event.target.value;
            // 只允许输入数字
            if (/^$|^\d+$/.test(value)) {
              setQuantities((current) => ({
                ...current,
                [item.id]: value,
              }));
            }
          }}
        />
      ),
    },
  ];

  return (
    <section className="panel batch-issue-panel">
      <div className="panel__header">
        <div>
          <h2>{tt("issueCartTitle", "Issue Cart")}</h2>
          <p>{tt("issueCartHint", "Issue multiple selected items in one transaction. Rows with zero quantity are skipped.")}</p>
        </div>
        <button className="button-secondary" onClick={onClose} type="button">
          {tt("cancel", "Cancel")}
        </button>
      </div>

      {localSuccess ? <div className="feedback-banner feedback-banner--success">{localSuccess}</div> : null}
      {inlineError ? <div className="feedback-banner feedback-banner--error">{inlineError}</div> : null}

      {items.length === 0 ? (
        <div className="empty-state">
          <h3>{tt("issueCartNoSelection", "Select at least one item to open the Issue Cart.")}</h3>
          <p>{tt("manageItemsHint", "Create, modify, delete, and export item QR labels from this page.")}</p>
        </div>
      ) : (
        <>
          <div className="panel-banner panel-banner--info">{tt("issueCartInlineHint", "Enter issue quantities for the items you want to issue. Blank or zero quantities will be ignored.")}</div>
          <div className="batch-issue-layout">
            <DataTable
              columns={columns}
              data={sortedItems}
              rowKey={(item) => item.id}
              sortState={sortState}
              onSortChange={setSortState}
            />

            <div className="batch-issue-sidebar">
              <div className="form-summary">
                <strong>{tt("issueCartSelectedItems", "Selected Items")}</strong>
                <span>{tt("selectedItemsCount", "{count} selected", { count: items.length })}</span>
              </div>
              <label className="batch-issue-field">
                <span>{tt("performedBy", "Performed By")}</span>
                <select value={performedBy} onChange={(event) => setPerformedBy(event.target.value)}>
                  <option value="">{tt("selectPersonnel", "Select Personnel")}</option>
                  {personnel.map((member) => (
                    <option key={member.id} value={member.name}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="batch-issue-field">
                <span>{tt("reason", "Reason")}</span>
                <input value={reason} onChange={(event) => setReason(event.target.value)} />
              </label>
              {personnel.length === 0 && (
                <div className="empty-state">
                  <h3>{tt("performedBy", "Performed By")}</h3>
                  <p>{tt("personnelRequiredForIssue", "No personnel configured. Add personnel in the desktop app before issuing material.")}</p>
                </div>
              )}
              <div className="action-panel__footer action-panel__footer--spread">
                <button className="button-secondary" onClick={onClose} type="button">
                  {tt("cancel", "Cancel")}
                </button>
                <button data-testid="batch-submit" disabled={busy || personnel.length === 0} onClick={() => void handleSubmit()} type="button">
                  {busy ? `${tt("save", "Save")}...` : tt("batchIssue", "Batch Issue")}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
