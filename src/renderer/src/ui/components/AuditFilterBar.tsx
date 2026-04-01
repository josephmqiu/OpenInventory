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

function toDateInput(iso: string | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
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
  language,
  personnel,
  filters,
  onFiltersChange,
  disabled,
}: AuditFilterBarProps) {
  const [dateFrom, setDateFrom] = useState(toDateInput(filters.dateFrom));
  const [dateTo, setDateTo] = useState(toDateInput(filters.dateTo));
  const [movementType, setMovementType] = useState(filters.movementType ?? "");
  const [itemSearch, setItemSearch] = useState(filters.itemSearch ?? "");
  const [performedBy, setPerformedBy] = useState(filters.performedBy ?? "");
  const [textSearch, setTextSearch] = useState(filters.textSearch ?? "");
  const [activePreset, setActivePreset] = useState<PresetKey | null>(null);

  const applyFilters = () => {
    onFiltersChange({
      dateFrom: dateFrom ? dateFrom + " 00:00:00" : undefined,
      dateTo: dateTo ? dateTo + " 23:59:59" : undefined,
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
    setDateFrom(toDateInput(from));
    setDateTo(toDateInput(to));
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
    setDateFrom(toDateInput(range.dateFrom));
    setDateTo(toDateInput(range.dateTo));
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

  const allPersonnel = language === "en" ? "All" : "全部";

  return (
    <div className="audit-filter-bar" role="search">
      {/* Row 1: Date range — presets are the fast path, inputs are the power path */}
      <div className="audit-filter-bar__date-row">
        <div className="audit-date-presets">
          {presets.map((p) => (
            <button
              key={p.key}
              type="button"
              className={`audit-preset${activePreset === p.key ? " audit-preset--active" : ""}`}
              onClick={() => applyPreset(p.key)}
              disabled={disabled}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="audit-date-range">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => handleDateChange("from", e.target.value)}
            disabled={disabled}
            aria-label={dictionary.dateFrom}
          />
          <span className="audit-date-range__sep">&ndash;</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => handleDateChange("to", e.target.value)}
            disabled={disabled}
            aria-label={dictionary.dateTo}
          />
        </div>
      </div>

      {/* Row 2: Data filters — compact inline fields with integrated actions */}
      <div className="audit-filter-bar__filter-row">
        <select value={movementType} onChange={(e) => setMovementType(e.target.value)} disabled={disabled} aria-label={dictionary.movementType}>
          <option value="">{dictionary.allTypes}</option>
          <option value="receive">{dictionary.receiveStock}</option>
          <option value="issue">{dictionary.issueMaterial}</option>
        </select>
        <input
          type="text"
          value={itemSearch}
          onChange={(e) => setItemSearch(e.target.value)}
          placeholder={dictionary.itemSearch}
          disabled={disabled}
          aria-label={dictionary.itemSearch}
        />
        <select value={performedBy} onChange={(e) => setPerformedBy(e.target.value)} disabled={disabled} aria-label={dictionary.performedBy}>
          <option value="">{allPersonnel}</option>
          {personnel.map((p) => (
            <option key={p.id} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={textSearch}
          onChange={(e) => setTextSearch(e.target.value)}
          placeholder={dictionary.textSearchHint}
          disabled={disabled}
          aria-label={dictionary.textSearch}
        />
        <div className="audit-filter-bar__actions">
          <button type="button" data-testid="audit-filter-apply" onClick={applyFilters} disabled={disabled}>
            {dictionary.applyFilters}
          </button>
          <button type="button" className="button-secondary" data-testid="audit-filter-clear" onClick={clearFilters} disabled={disabled}>
            {dictionary.clearFilters}
          </button>
        </div>
      </div>
    </div>
  );
}

export { defaultDateFrom, defaultDateTo };
