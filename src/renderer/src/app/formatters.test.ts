import { describe, expect, it } from "vitest";
import {
  formatDateTime,
  formatFileSize,
  formatNumber,
  formatPrice,
  minorToPriceInput,
  minorUnitsPerMajor,
  parsePriceToMinor,
} from "./formatters";

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

  it("derives 100 minor units per major for 2-decimal currencies", () => {
    expect(minorUnitsPerMajor("CNY")).toBe(100);
    expect(minorUnitsPerMajor("USD")).toBe(100);
  });

  it("formats minor-unit prices with the currency symbol and locale", () => {
    // 1234 fen = ¥12.34
    expect(formatPrice(1234, "CNY", "en")).toContain("12.34");
    expect(formatPrice(1234, "CNY", "en")).toMatch(/[¥CN]/);
    expect(formatPrice(99900, "USD", "en")).toContain("999.00");
  });

  it("parses major-unit price strings into integer minor units", () => {
    expect(parsePriceToMinor("12.34", "CNY")).toBe(1234);
    expect(parsePriceToMinor("0", "CNY")).toBe(0);
    expect(parsePriceToMinor("1000", "USD")).toBe(100000);
  });

  it("returns null for blank price input (= no price)", () => {
    expect(parsePriceToMinor("", "CNY")).toBeNull();
    expect(parsePriceToMinor("   ", "CNY")).toBeNull();
  });

  it("returns undefined for invalid price input", () => {
    expect(parsePriceToMinor("abc", "CNY")).toBeUndefined();
    expect(parsePriceToMinor("-5", "CNY")).toBeUndefined();
    // sub-minor-unit precision is rejected for a 2-decimal currency
    expect(parsePriceToMinor("1.234", "CNY")).toBeUndefined();
  });

  it("round-trips minor units back into a form input string", () => {
    expect(minorToPriceInput(1234, "CNY")).toBe("12.34");
    expect(minorToPriceInput(null, "CNY")).toBe("");
    expect(parsePriceToMinor(minorToPriceInput(5000, "USD"), "USD")).toBe(5000);
  });
});

