import { describe, it, expect } from "vitest";
import {
  resolvePeriodBounds,
  priorPeriodOf,
  yoyPeriodOf,
  trailingPeriods,
  shiftPeriod,
  formatPeriodLabel,
  type AuditReportPeriodArgs,
} from "../../src/shared/auditPeriod";

const SHAPE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

describe("resolvePeriodBounds", () => {
  it("month bounds + label (May 2026)", () => {
    const b = resolvePeriodBounds({ granularity: "month", year: 2026, index: 5 });
    expect(b.from).toBe("2026-05-01 00:00:00");
    expect(b.to).toBe("2026-05-31 23:59:59");
    expect(b.label).toBe("May 2026");
  });

  it("quarter bounds + label (Q2 2026)", () => {
    const b = resolvePeriodBounds({ granularity: "quarter", year: 2026, index: 2 });
    expect(b.from).toBe("2026-04-01 00:00:00");
    expect(b.to).toBe("2026-06-30 23:59:59");
    expect(b.label).toBe("Q2 2026");
  });

  it("half-year bounds + label (H1 / H2 2026)", () => {
    const h1 = resolvePeriodBounds({ granularity: "half", year: 2026, index: 1 });
    expect(h1.from).toBe("2026-01-01 00:00:00");
    expect(h1.to).toBe("2026-06-30 23:59:59");
    expect(h1.label).toBe("H1 2026");
    const h2 = resolvePeriodBounds({ granularity: "half", year: 2026, index: 2 });
    expect(h2.from).toBe("2026-07-01 00:00:00");
    expect(h2.to).toBe("2026-12-31 23:59:59");
  });

  it("year bounds + label (2026)", () => {
    const b = resolvePeriodBounds({ granularity: "year", year: 2026, index: 1 });
    expect(b.from).toBe("2026-01-01 00:00:00");
    expect(b.to).toBe("2026-12-31 23:59:59");
    expect(b.label).toBe("2026");
  });

  it("emits the exact 'YYYY-MM-DD HH:MM:SS' shape for every granularity", () => {
    const cases: AuditReportPeriodArgs[] = [
      { granularity: "month", year: 2026, index: 2 },
      { granularity: "quarter", year: 2026, index: 3 },
      { granularity: "half", year: 2026, index: 2 },
      { granularity: "year", year: 2026, index: 1 },
    ];
    for (const c of cases) {
      const b = resolvePeriodBounds(c);
      expect(b.from).toMatch(SHAPE);
      expect(b.to).toMatch(SHAPE);
    }
  });

  it("uses local-date math, not UTC (DST-straddling March/Nov boundaries unshifted)", () => {
    // toISOString() would shift these across midnight in many timezones; the
    // exact local strings prove local Date construction.
    const mar = resolvePeriodBounds({ granularity: "month", year: 2026, index: 3 });
    expect(mar.from).toBe("2026-03-01 00:00:00");
    expect(mar.to).toBe("2026-03-31 23:59:59");
    const nov = resolvePeriodBounds({ granularity: "month", year: 2026, index: 11 });
    expect(nov.from).toBe("2026-11-01 00:00:00");
    expect(nov.to).toBe("2026-11-30 23:59:59");
  });
});

describe("priorPeriodOf (rollover)", () => {
  it("month: January -> previous December", () => {
    const p = priorPeriodOf({ granularity: "month", year: 2026, index: 1 });
    expect(p.args).toEqual({ granularity: "month", year: 2025, index: 12 });
    expect(p.bounds.label).toBe("December 2025");
  });
  it("quarter: Q1 -> Q4 previous year", () => {
    const p = priorPeriodOf({ granularity: "quarter", year: 2026, index: 1 });
    expect(p.args).toEqual({ granularity: "quarter", year: 2025, index: 4 });
  });
  it("half: H1 -> H2 previous year", () => {
    const p = priorPeriodOf({ granularity: "half", year: 2026, index: 1 });
    expect(p.args).toEqual({ granularity: "half", year: 2025, index: 2 });
  });
  it("year: 2026 -> 2025", () => {
    const p = priorPeriodOf({ granularity: "year", year: 2026, index: 1 });
    expect(p.args).toEqual({ granularity: "year", year: 2025, index: 1 });
  });
  it("month mid-year: April -> March (same year)", () => {
    const p = priorPeriodOf({ granularity: "month", year: 2026, index: 4 });
    expect(p.args).toEqual({ granularity: "month", year: 2026, index: 3 });
  });
});

describe("yoyPeriodOf", () => {
  it("same period one year earlier", () => {
    const y = yoyPeriodOf({ granularity: "month", year: 2026, index: 5 });
    expect(y.args).toEqual({ granularity: "month", year: 2025, index: 5 });
    expect(y.bounds.from).toBe("2025-05-01 00:00:00");
  });
});

describe("trailingPeriods", () => {
  it("returns exactly N buckets, oldest -> newest, ending at the given period", () => {
    const periods = trailingPeriods({ granularity: "month", year: 2026, index: 5 }, 6);
    expect(periods).toHaveLength(6);
    expect(periods[0].args).toEqual({ granularity: "month", year: 2025, index: 12 });
    expect(periods[5].args).toEqual({ granularity: "month", year: 2026, index: 5 });
    expect(periods.map((p) => p.bounds.label)).toEqual([
      "December 2025",
      "January 2026",
      "February 2026",
      "March 2026",
      "April 2026",
      "May 2026",
    ]);
  });

  it("works across a quarter year boundary", () => {
    const periods = trailingPeriods({ granularity: "quarter", year: 2026, index: 1 }, 6);
    expect(periods).toHaveLength(6);
    expect(periods[5].args).toEqual({ granularity: "quarter", year: 2026, index: 1 });
    expect(periods[0].args).toEqual({ granularity: "quarter", year: 2024, index: 4 });
  });
});

describe("shiftPeriod / formatPeriodLabel", () => {
  it("shiftPeriod forward and back is symmetric", () => {
    const p: AuditReportPeriodArgs = { granularity: "month", year: 2026, index: 1 };
    expect(shiftPeriod(shiftPeriod(p, -1), 1)).toEqual(p);
  });
  it("formats labels without exposing the raw index", () => {
    expect(formatPeriodLabel({ granularity: "quarter", year: 2026, index: 3 })).toBe("Q3 2026");
    expect(formatPeriodLabel({ granularity: "half", year: 2026, index: 2 })).toBe("H2 2026");
  });
});
