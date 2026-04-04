import { useEffect, useRef, useState } from "react";
import type { AuditMovementFilters, Language, PersonnelMember } from "../../domain/models";
import { useTranslation } from "react-i18next";

interface AuditFilterBarProps {
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
  language,
  personnel,
  filters,
  onFiltersChange,
  disabled,
}: AuditFilterBarProps) {
  const { i18n } = useTranslation(["common", "audit"]);
  const t = i18n.getFixedT(language, ["common", "audit"]);
  const [dateFrom, setDateFrom] = useState(toDateInput(filters.dateFrom));
  const [dateTo, setDateTo] = useState(toDateInput(filters.dateTo));
  const [movementType, setMovementType] = useState(filters.movementType ?? "");
  const [itemSearch, setItemSearch] = useState(filters.itemSearch ?? "");
  const [performedBy, setPerformedBy] = useState(filters.performedBy ?? "");
  const [textSearch, setTextSearch] = useState(filters.textSearch ?? "");
  const [activePreset, setActivePreset] = useState<PresetKey | null>(null);

  // Sync local state when parent filters change (e.g. preset applied, quick-filter from table)
  const prevFiltersRef = useRef(
    JSON.stringify([
      filters.dateFrom,
      filters.dateTo,
      filters.movementType,
      filters.itemSearch,
      filters.performedBy,
      filters.textSearch,
    ]),
  );
  useEffect(() => {
    const key = JSON.stringify([
      filters.dateFrom,
      filters.dateTo,
      filters.movementType,
      filters.itemSearch,
      filters.performedBy,
      filters.textSearch,
    ]);
    if (key === prevFiltersRef.current) return;
    prevFiltersRef.current = key;
    setDateFrom(toDateInput(filters.dateFrom));
    setDateTo(toDateInput(filters.dateTo));
    setMovementType(filters.movementType ?? "");
    setItemSearch(filters.itemSearch ?? "");
    setPerformedBy(filters.performedBy ?? "");
    setTextSearch(filters.textSearch ?? "");
  }, [filters]);

  const applyFilters = () => {
    let from = dateFrom;
    let to = dateTo;
    if (from && to && from > to) {
      [from, to] = [to, from];
      setDateFrom(from);
      setDateTo(to);
    }
    onFiltersChange({
      dateFrom: from ? from + " 00:00:00" : undefined,
      dateTo: to ? to + " 23:59:59" : undefined,
      movementType: (movementType as "receive" | "issue") || undefined,
      itemSearch: itemSearch || undefined,
      performedBy: performedBy || undefined,
      textSearch: textSearch || undefined,
      sortBy: filters.sortBy,
      sortDir: filters.sortDir,
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
      sortBy: filters.sortBy,
      sortDir: filters.sortDir,
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
    {
      key: "today",
      label: t("today", { ns: "audit" }),
    },
    {
      key: "thisWeek",
      label: t("thisWeek", { ns: "audit" }),
    },
    {
      key: "thisMonth",
      label: t("thisMonth", { ns: "audit" }),
    },
    {
      key: "last30Days",
      label: t("last30Days", { ns: "audit" }),
    },
  ];

  const allPersonnel = t("allPersonnel", { ns: "audit" });

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
            aria-label={t("dateFrom", { ns: "audit" })}
          />
          <span className="audit-date-range__sep">&ndash;</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => handleDateChange("to", e.target.value)}
            disabled={disabled}
            aria-label={t("dateTo", { ns: "audit" })}
          />
        </div>
      </div>

      {/* Row 2: Data filters — compact inline fields with integrated actions */}
      <div className="audit-filter-bar__filter-row">
        <select
          value={movementType}
          onChange={(e) => setMovementType(e.target.value)}
          disabled={disabled}
          aria-label={t("movementType", { ns: "audit" })}
        >
          <option value="">
            {t("allTypes", { ns: "audit" })}
          </option>
          <option value="receive">{t("receiveStock", { ns: "audit" })}</option>
          <option value="issue">{t("issueMaterial", { ns: "audit" })}</option>
        </select>
        <input
          type="text"
          value={itemSearch}
          onChange={(e) => setItemSearch(e.target.value)}
          placeholder={t("itemSearch", { ns: "audit" })}
          disabled={disabled}
          aria-label={t("itemSearch", { ns: "audit" })}
        />
        <select
          value={performedBy}
          onChange={(e) => setPerformedBy(e.target.value)}
          disabled={disabled}
          aria-label={t("performedBy", { ns: "audit" })}
        >
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
          placeholder={t("textSearchHint", { ns: "audit" })}
          disabled={disabled}
          aria-label={t("textSearch", { ns: "audit" })}
        />
        <div className="audit-filter-bar__actions">
          <button type="button" data-testid="audit-filter-apply" onClick={applyFilters} disabled={disabled}>
            {t("applyFilters", { ns: "audit" })}
          </button>
          <button type="button" className="button-secondary" data-testid="audit-filter-clear" onClick={clearFilters} disabled={disabled}>
            {t("clearFilters", { ns: "audit" })}
          </button>
        </div>
      </div>
    </div>
  );
}

export { defaultDateFrom, defaultDateTo };
