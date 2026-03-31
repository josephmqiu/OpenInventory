import { useState } from "react";
import type { Dictionary } from "../../app/i18n";
import type { AuditMovementFilters, Language, PersonnelMember } from "../../domain/models";

interface AuditFilterBarProps {
  dictionary: Dictionary;
  language: Language;
  personnel: PersonnelMember[];
  filters: AuditMovementFilters;
  onFiltersChange: (filters: AuditMovementFilters) => void;
  disabled: boolean;
}

function toDatetimeLocal(iso: string | undefined): string {
  if (!iso) return "";
  return iso.replace(" ", "T").slice(0, 16);
}

function defaultDateFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10) + " 00:00:00";
}

function defaultDateTo(): string {
  return new Date().toISOString().slice(0, 10) + " 23:59:59";
}

type PresetKey = "today" | "thisWeek" | "thisMonth" | "last30Days";

function presetRange(key: PresetKey): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const dateTo = todayStr + " 23:59:59";

  switch (key) {
    case "today":
      return { dateFrom: todayStr + " 00:00:00", dateTo };
    case "thisWeek": {
      const dayOfWeek = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
      return { dateFrom: monday.toISOString().slice(0, 10) + " 00:00:00", dateTo };
    }
    case "thisMonth":
      return { dateFrom: todayStr.slice(0, 8) + "01 00:00:00", dateTo };
    case "last30Days": {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return { dateFrom: d.toISOString().slice(0, 10) + " 00:00:00", dateTo };
    }
  }
}

export function AuditFilterBar({
  dictionary,
  personnel,
  filters,
  onFiltersChange,
  disabled,
}: AuditFilterBarProps) {
  const [dateFrom, setDateFrom] = useState(toDatetimeLocal(filters.dateFrom));
  const [dateTo, setDateTo] = useState(toDatetimeLocal(filters.dateTo));
  const [movementType, setMovementType] = useState(filters.movementType ?? "");
  const [itemSearch, setItemSearch] = useState(filters.itemSearch ?? "");
  const [performedBy, setPerformedBy] = useState(filters.performedBy ?? "");
  const [textSearch, setTextSearch] = useState(filters.textSearch ?? "");
  const [activePreset, setActivePreset] = useState<PresetKey | null>(null);

  const applyFilters = () => {
    onFiltersChange({
      dateFrom: dateFrom ? dateFrom.replace("T", " ") + (dateFrom.length === 16 ? ":00" : "") : undefined,
      dateTo: dateTo ? dateTo.replace("T", " ") + (dateTo.length === 16 ? ":59" : "") : undefined,
      movementType: (movementType as "receive" | "issue") || undefined,
      itemSearch: itemSearch || undefined,
      performedBy: performedBy || undefined,
      textSearch: textSearch || undefined,
      page: 1,
      pageSize: filters.pageSize,
    });
  };

  const clearFilters = () => {
    const from = defaultDateFrom();
    const to = defaultDateTo();
    setDateFrom(toDatetimeLocal(from));
    setDateTo(toDatetimeLocal(to));
    setMovementType("");
    setItemSearch("");
    setPerformedBy("");
    setTextSearch("");
    setActivePreset(null);
    onFiltersChange({
      dateFrom: from,
      dateTo: to,
      page: 1,
      pageSize: filters.pageSize,
    });
  };

  const applyPreset = (key: PresetKey) => {
    const range = presetRange(key);
    setDateFrom(toDatetimeLocal(range.dateFrom));
    setDateTo(toDatetimeLocal(range.dateTo));
    setActivePreset(key);
    onFiltersChange({
      ...filters,
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      page: 1,
    });
  };

  const handleDateChange = (field: "from" | "to", value: string) => {
    if (field === "from") setDateFrom(value);
    else setDateTo(value);
    setActivePreset(null);
  };

  const presets: { key: PresetKey; label: string }[] = [
    { key: "today", label: dictionary.today },
    { key: "thisWeek", label: dictionary.thisWeek },
    { key: "thisMonth", label: dictionary.thisMonth },
    { key: "last30Days", label: dictionary.last30Days },
  ];

  return (
    <div className="audit-filter-bar" role="search">
      <div className="audit-filter-bar__row">
        <div className="audit-date-presets">
          {presets.map((p) => (
            <button
              key={p.key}
              type="button"
              className={`button-secondary button-inline${activePreset === p.key ? " audit-preset--active" : ""}`}
              onClick={() => applyPreset(p.key)}
              disabled={disabled}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="audit-filter-bar__field">
          <span>{dictionary.dateFrom}</span>
          <input
            type="datetime-local"
            value={dateFrom}
            onChange={(e) => handleDateChange("from", e.target.value)}
            disabled={disabled}
          />
        </div>
        <div className="audit-filter-bar__field">
          <span>{dictionary.dateTo}</span>
          <input
            type="datetime-local"
            value={dateTo}
            onChange={(e) => handleDateChange("to", e.target.value)}
            disabled={disabled}
          />
        </div>
      </div>
      <div className="audit-filter-bar__row">
        <div className="audit-filter-bar__field">
          <span>{dictionary.movementType}</span>
          <select value={movementType} onChange={(e) => setMovementType(e.target.value)} disabled={disabled}>
            <option value="">{dictionary.allTypes}</option>
            <option value="receive">{dictionary.receiveStock}</option>
            <option value="issue">{dictionary.issueMaterial}</option>
          </select>
        </div>
        <div className="audit-filter-bar__field">
          <span>{dictionary.itemSearch}</span>
          <input
            type="text"
            value={itemSearch}
            onChange={(e) => setItemSearch(e.target.value)}
            placeholder={dictionary.itemSearch}
            disabled={disabled}
          />
        </div>
        <div className="audit-filter-bar__field">
          <span>{dictionary.performedBy}</span>
          <select value={performedBy} onChange={(e) => setPerformedBy(e.target.value)} disabled={disabled}>
            <option value="">{dictionary.allTypes}</option>
            {personnel.map((p) => (
              <option key={p.id} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="audit-filter-bar__field">
          <span>{dictionary.textSearch}</span>
          <input
            type="text"
            value={textSearch}
            onChange={(e) => setTextSearch(e.target.value)}
            placeholder={dictionary.textSearchHint}
            disabled={disabled}
          />
        </div>
        <div className="audit-filter-bar__actions">
          <button type="button" onClick={applyFilters} disabled={disabled}>
            {dictionary.applyFilters}
          </button>
          <button type="button" className="button-secondary" onClick={clearFilters} disabled={disabled}>
            {dictionary.clearFilters}
          </button>
        </div>
      </div>
    </div>
  );
}

export { defaultDateFrom, defaultDateTo };
