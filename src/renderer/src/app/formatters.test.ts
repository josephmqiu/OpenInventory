import { describe, expect, it } from "vitest";
import { formatDateTime, formatFileSize, formatNumber } from "./formatters";

describe("formatters", () => {
  it("formats numbers with the selected locale", () => {
    expect(formatNumber(12345.6, "en")).toBe("12,345.6");
    expect(formatNumber(12345.6, "zh-CN")).toBe("12,345.6");
  });

  it("formats file sizes with locale-aware decimals", () => {
    expect(formatFileSize(13_000_000, "en")).toContain("MB");
    expect(formatFileSize(13_000_000, "zh-CN")).toContain("MB");
  });

  it("formats date-time values for the selected locale", () => {
    expect(formatDateTime("2026-04-01T16:00:00Z", "en")).toContain("2026");
    expect(formatDateTime("2026-04-01T16:00:00Z", "zh-CN")).toContain("2026");
  });
});

