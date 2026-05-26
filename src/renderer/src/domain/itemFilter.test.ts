import { describe, it, expect } from "vitest";
import { filterInventoryItems, type FilterableInventoryItem } from "./itemFilter";

const items: FilterableInventoryItem[] = [
  { name: "Steel Bolt M8", sku: "BOLT-M8", location: "A1-03", status: "in_stock" },
  { name: "Barcode Label Roll", sku: "LABEL-ROLL", location: "E1-11", status: "low_stock" },
  { name: "Empty Bin", sku: "EMPTY-1", location: "Z9-00", status: "out_of_stock" },
];

const skus = (result: FilterableInventoryItem[]) => result.map((i) => i.sku).sort();

describe("filterInventoryItems", () => {
  it("returns everything with no search and the 'all' filter", () => {
    expect(filterInventoryItems(items, { search: "", filter: "all" })).toHaveLength(3);
  });

  it("matches by name (case-insensitive)", () => {
    expect(skus(filterInventoryItems(items, { search: "label", filter: "all" }))).toEqual(["LABEL-ROLL"]);
    expect(skus(filterInventoryItems(items, { search: "STEEL", filter: "all" }))).toEqual(["BOLT-M8"]);
  });

  it("matches by SKU", () => {
    expect(skus(filterInventoryItems(items, { search: "bolt-m8", filter: "all" }))).toEqual(["BOLT-M8"]);
  });

  it("matches by location", () => {
    expect(skus(filterInventoryItems(items, { search: "e1-11", filter: "all" }))).toEqual(["LABEL-ROLL"]);
  });

  it("filters by status", () => {
    expect(skus(filterInventoryItems(items, { search: "", filter: "low_stock" }))).toEqual(["LABEL-ROLL"]);
    expect(skus(filterInventoryItems(items, { search: "", filter: "out_of_stock" }))).toEqual(["EMPTY-1"]);
  });

  it("combines search and status filter", () => {
    // "roll" matches Barcode Label Roll (name); it is also low_stock.
    expect(skus(filterInventoryItems(items, { search: "roll", filter: "low_stock" }))).toEqual(["LABEL-ROLL"]);
    // Same search under out_of_stock yields nothing.
    expect(filterInventoryItems(items, { search: "roll", filter: "out_of_stock" })).toHaveLength(0);
  });

  it("returns nothing when search matches no item", () => {
    expect(filterInventoryItems(items, { search: "zzz-nope", filter: "all" })).toHaveLength(0);
  });
});
