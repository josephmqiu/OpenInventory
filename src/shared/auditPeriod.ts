// Period math for the Reports / Period Summary tab.
//
// Pure and testable. Shared by the main process (to build SQL date bounds) and
// the renderer (to label periods). Two hard rules:
//
//   1. Boundary strings are LOCAL time in the exact shape "YYYY-MM-DD HH:MM:SS",
//      matching `inventory_movements.performed_at` (written via
//      datetime('now','localtime')). They are already normalized, so they pass
//      straight into the `m.performed_at >= ? / <= ?` filter without the inline
//      T->space / seconds conversion used elsewhere.
//   2. Boundaries are built with local `new Date(y, monthIndex, day, ...)` math,
//      NEVER `toISOString()` — UTC conversion would shift the boundary across
//      midnight and silently include/exclude movements near period edges.

export type AuditPeriodGranularity = "month" | "quarter" | "half" | "year";

export interface AuditReportPeriodArgs {
  granularity: AuditPeriodGranularity;
  year: number;
  /** month 1-12 | quarter 1-4 | half 1-2 | year (ignored, treated as 1) */
  index: number;
}

export interface PeriodBounds {
  label: string;
  /** inclusive local-time lower bound, "YYYY-MM-DD 00:00:00" */
  from: string;
  /** inclusive local-time upper bound, "YYYY-MM-DD 23:59:59" */
  to: string;
}

/** How many discrete buckets a year holds for each granularity. */
const UNITS_PER_YEAR: Record<AuditPeriodGranularity, number> = {
  month: 12,
  quarter: 4,
  half: 2,
  year: 1,
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Format a Date as a local-time "YYYY-MM-DD HH:MM:SS" string (no UTC shift). */
function fmtLocal(d: Date): string {
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  );
}

/** Inclusive [startMonthIndex, endMonthIndex] (0-based) for a period. */
function monthSpan(args: AuditReportPeriodArgs): { start: number; end: number } {
  switch (args.granularity) {
    case "month": {
      const m = args.index - 1;
      return { start: m, end: m };
    }
    case "quarter": {
      const start = (args.index - 1) * 3;
      return { start, end: start + 2 };
    }
    case "half": {
      const start = (args.index - 1) * 6;
      return { start, end: start + 5 };
    }
    case "year":
      return { start: 0, end: 11 };
  }
}

const MONTH_FALLBACK = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function monthName(year: number, monthIndex0: number, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { month: "long" }).format(
      new Date(year, monthIndex0, 1),
    );
  } catch {
    return MONTH_FALLBACK[monthIndex0] ?? String(monthIndex0 + 1);
  }
}

/** Human-readable label, e.g. "May 2026", "Q2 2026", "H1 2026", "2026". */
export function formatPeriodLabel(
  args: AuditReportPeriodArgs,
  locale = "en",
): string {
  switch (args.granularity) {
    case "month":
      return `${monthName(args.year, args.index - 1, locale)} ${args.year}`;
    case "quarter":
      return `Q${args.index} ${args.year}`;
    case "half":
      return `H${args.index} ${args.year}`;
    case "year":
      return String(args.year);
  }
}

/** Resolve a period to its label + inclusive local-time SQL bounds. */
export function resolvePeriodBounds(
  args: AuditReportPeriodArgs,
  locale = "en",
): PeriodBounds {
  const { start, end } = monthSpan(args);
  const from = new Date(args.year, start, 1, 0, 0, 0);
  // Day 0 of (end + 1) is the last day of `end`; 23:59:59 is its last second.
  const to = new Date(args.year, end + 1, 0, 23, 59, 59);
  return { label: formatPeriodLabel(args, locale), from: fmtLocal(from), to: fmtLocal(to) };
}

/**
 * Shift a period by `delta` whole units (negative = earlier), normalizing across
 * year boundaries. Year granularity shifts by whole years.
 */
export function shiftPeriod(
  args: AuditReportPeriodArgs,
  delta: number,
): AuditReportPeriodArgs {
  if (args.granularity === "year") {
    return { granularity: "year", year: args.year + delta, index: 1 };
  }
  const per = UNITS_PER_YEAR[args.granularity];
  // 0-based absolute unit index across years.
  const absolute = args.year * per + (args.index - 1) + delta;
  const year = Math.floor(absolute / per);
  const index = (((absolute % per) + per) % per) + 1;
  return { granularity: args.granularity, year, index };
}

/** The period immediately before `args` (Jan->Dec-1yr, Q1->Q4-1yr, H1->H2-1yr, year->-1yr). */
export function priorPeriodOf(
  args: AuditReportPeriodArgs,
  locale = "en",
): { args: AuditReportPeriodArgs; bounds: PeriodBounds } {
  const prior = shiftPeriod(args, -1);
  return { args: prior, bounds: resolvePeriodBounds(prior, locale) };
}

/** The same period one year earlier (year-over-year comparison). */
export function yoyPeriodOf(
  args: AuditReportPeriodArgs,
  locale = "en",
): { args: AuditReportPeriodArgs; bounds: PeriodBounds } {
  const yoy: AuditReportPeriodArgs = { ...args, year: args.year - 1 };
  return { args: yoy, bounds: resolvePeriodBounds(yoy, locale) };
}

/**
 * The last `count` period windows ending at `args` (inclusive), oldest first.
 * Used to render a gap-free trend strip — the caller maps query rows onto these
 * buckets so a zero-movement period still appears (it does not silently vanish).
 */
export function trailingPeriods(
  args: AuditReportPeriodArgs,
  count: number,
  locale = "en",
): Array<{ args: AuditReportPeriodArgs; bounds: PeriodBounds }> {
  const out: Array<{ args: AuditReportPeriodArgs; bounds: PeriodBounds }> = [];
  for (let k = count - 1; k >= 0; k--) {
    const shifted = shiftPeriod(args, -k);
    out.push({ args: shifted, bounds: resolvePeriodBounds(shifted, locale) });
  }
  return out;
}
