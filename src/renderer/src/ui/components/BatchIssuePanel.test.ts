import { describe, expect, it } from "vitest";
import { toPositiveQuantity, buildIssueItems } from "./BatchIssuePanel";

describe("toPositiveQuantity", () => {
  it("converts a valid integer string", () => {
    expect(toPositiveQuantity("5")).toBe(5);
  });

  it("floors decimal values", () => {
    expect(toPositiveQuantity("5.7")).toBe(5);
    expect(toPositiveQuantity("5.999")).toBe(5);
    expect(toPositiveQuantity("1.1")).toBe(1);
  });

  it("returns 0 for zero", () => {
    expect(toPositiveQuantity("0")).toBe(0);
  });

  it("returns 0 for negative numbers", () => {
    expect(toPositiveQuantity("-1")).toBe(0);
    expect(toPositiveQuantity("-0.5")).toBe(0);
  });

  it("returns 0 for empty string", () => {
    expect(toPositiveQuantity("")).toBe(0);
  });

  it("returns 0 for non-numeric strings", () => {
    expect(toPositiveQuantity("abc")).toBe(0);
    expect(toPositiveQuantity("12abc")).toBe(0);
  });

  it("returns 0 for Infinity", () => {
    expect(toPositiveQuantity("Infinity")).toBe(0);
    expect(toPositiveQuantity("-Infinity")).toBe(0);
  });

  it("returns 0 for NaN string", () => {
    expect(toPositiveQuantity("NaN")).toBe(0);
  });

  it("handles whitespace-padded numbers", () => {
    expect(toPositiveQuantity(" 5 ")).toBe(5);
  });

  it("handles very large numbers", () => {
    expect(toPositiveQuantity("999999")).toBe(999999);
  });
});

describe("buildIssueItems", () => {
  const items = [
    { id: "item-1" },
    { id: "item-2" },
    { id: "item-3" },
  ];

  it("returns items with positive quantities", () => {
    const quantities = { "item-1": "5", "item-2": "10", "item-3": "0" };
    const result = buildIssueItems(items, quantities);
    expect(result).toEqual([
      { itemId: "item-1", quantity: 5 },
      { itemId: "item-2", quantity: 10 },
    ]);
  });

  it("filters out empty string quantities", () => {
    const quantities = { "item-1": "", "item-2": "3", "item-3": "" };
    const result = buildIssueItems(items, quantities);
    expect(result).toEqual([{ itemId: "item-2", quantity: 3 }]);
  });

  it("filters out all items when quantities are all zero or empty", () => {
    const quantities = { "item-1": "0", "item-2": "", "item-3": "-1" };
    const result = buildIssueItems(items, quantities);
    expect(result).toEqual([]);
  });

  it("handles missing quantity keys (defaults to empty string)", () => {
    const quantities = { "item-1": "5" };
    const result = buildIssueItems(items, quantities);
    expect(result).toEqual([{ itemId: "item-1", quantity: 5 }]);
  });

  it("floors decimal quantities", () => {
    const quantities = { "item-1": "2.9", "item-2": "0.5", "item-3": "3" };
    const result = buildIssueItems(items, quantities);
    expect(result).toEqual([
      { itemId: "item-1", quantity: 2 },
      { itemId: "item-3", quantity: 3 },
    ]);
  });

  it("returns empty array for empty items list", () => {
    const result = buildIssueItems([], { "item-1": "5" });
    expect(result).toEqual([]);
  });
});
