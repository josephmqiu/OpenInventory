import { useMemo, useState } from "react";
import type { PersonnelMember } from "../../domain/models";
import { useTT } from "../hooks/useTT";
import { sortDataByKey } from "../utils/sortData";
import { DataTable, type ColumnDef, type SortState } from "./DataTable";

interface PersonnelPanelProps {
  busy: boolean;
  personnel: PersonnelMember[];
  onAddPersonnel: (name: string) => Promise<void>;
  onRemovePersonnel: (personnelId: string) => Promise<void>;
}

export function PersonnelPanel({ busy, personnel, onAddPersonnel, onRemovePersonnel }: PersonnelPanelProps) {
  const tt = useTT();
  const [name, setName] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [sortState, setSortState] = useState<SortState | null>(null);

  const canAdd = name.trim().length > 0 && !busy;

  const handleAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await onAddPersonnel(trimmed);
    setName("");
  };

  const handleRemove = async (id: string) => {
    setConfirmId(null);
    await onRemovePersonnel(id);
  };

  const sortedPersonnel = useMemo(
    () => sortDataByKey(personnel, sortState),
    [personnel, sortState],
  );

  const columns: ColumnDef<PersonnelMember>[] = [
    { key: "name", header: tt("personnelName", "Personnel Name"), width: "80%", className: "cell-title", sortable: true, sortKey: "name", render: (m) => m.name },
    {
      key: "actions",
      header: "",
      width: "20%",
      className: "cell-actions",
      render: (member) =>
        confirmId === member.id ? (
          <span className="confirm-remove">
            <button
              className="button-danger button-inline"
              data-testid={`personnel-confirm-${member.name}`}
              disabled={busy}
              onClick={() => void handleRemove(member.id)}
              type="button"
            >
              {tt("confirmRemove", "Confirm")}
            </button>
            <button
              className="button-secondary button-inline"
              onClick={() => setConfirmId(null)}
              type="button"
            >
              {tt("cancel", "Cancel")}
            </button>
          </span>
        ) : (
          <button
            className="button-danger-ghost button-inline"
            data-testid={`personnel-remove-${member.name}`}
            disabled={busy}
            onClick={() => setConfirmId(member.id)}
            type="button"
          >
            {tt("removePersonnel", "Remove")}
          </button>
        ),
    },
  ];

  return (
    <section className="panel">
      <div className="panel__header">
        <div className="personnel-add-bar">
          <label className="personnel-add-bar__label" htmlFor="personnel-name-input">
            {tt("personnelName", "Personnel Name")}
          </label>
          <input
            id="personnel-name-input"
            className="personnel-add-bar__input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && canAdd) void handleAdd(); }}
            placeholder={tt("personnelNamePlaceholder", "Enter name…")}
          />
          <button disabled={!canAdd} onClick={() => void handleAdd()} type="button">
            {tt("addPersonnel", "Add Personnel")}
          </button>
        </div>
      </div>
      <DataTable
        className="table--fixed"
        columns={columns}
        data={sortedPersonnel}
        rowKey={(m) => m.id}
        sortState={sortState}
        onSortChange={setSortState}
        emptyTitle={tt("noPersonnel", "No personnel records yet.")}
        emptyHint={tt("noPersonnelHint", "Add personnel before recording stock movements so Performed By can be selected from a list.")}
      />
    </section>
  );
}
