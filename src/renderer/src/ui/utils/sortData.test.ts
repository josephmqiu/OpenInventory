import { describe, it, expect } from "vitest";
import { sortData, sortDataByKey } from "./sortData";

describe("sortData", () => {
  const items = [
    { name: "Banana", qty: 5 },
    { name: "Apple", qty: 10 },
    { name: "Cherry", qty: 3 },
  ];

  it("returns data unchanged when sortState is null", () => {
    const result = sortData(items, null, (r, k) => r[k as keyof typeof items[0]]);
    expect(result).toBe(items);
  });

  it("sorts strings ascending", () => {
    const result = sortData(items, { key: "name", dir: "asc" }, (r, k) => r[k as keyof typeof items[0]]);
    expect(result.map((r) => r.name)).toEqual(["Apple", "Banana", "Cherry"]);
  });

  it("sorts strings descending", () => {
    const result = sortData(items, { key: "name", dir: "desc" }, (r, k) => r[k as keyof typeof items[0]]);
    expect(result.map((r) => r.name)).toEqual(["Cherry", "Banana", "Apple"]);
  });

  it("sorts numbers ascending", () => {
    const result = sortData(items, { key: "qty", dir: "asc" }, (r, k) => r[k as keyof typeof items[0]]);
    expect(result.map((r) => r.qty)).toEqual([3, 5, 10]);
  });

  it("sorts numbers descending", () => {
    const result = sortData(items, { key: "qty", dir: "desc" }, (r, k) => r[k as keyof typeof items[0]]);
    expect(result.map((r) => r.qty)).toEqual([10, 5, 3]);
  });

  it("does not mutate the original array", () => {
    const original = [...items];
    sortData(items, { key: "name", dir: "asc" }, (r, k) => r[k as keyof typeof items[0]]);
    expect(items).toEqual(original);
  });

  it("pushes null values to the end", () => {
    const data = [
      { name: "B", val: null as string | null },
      { name: "A", val: "x" },
      { name: "C", val: null as string | null },
    ];
    const result = sortData(data, { key: "val", dir: "asc" }, (r, k) => r[k as keyof typeof data[0]]);
    expect(result.map((r) => r.val)).toEqual(["x", null, null]);
  });
});

describe("sortDataByKey", () => {
  const items = [
    { name: "Banana", qty: 5 },
    { name: "Apple", qty: 10 },
    { name: "Cherry", qty: 3 },
  ];

  it("returns data unchanged when sortState is null", () => {
    const result = sortDataByKey(items, null);
    expect(result).toBe(items);
  });

  it("sorts by direct key lookup ascending", () => {
    const result = sortDataByKey(items, { key: "name", dir: "asc" });
    expect(result.map((r) => r.name)).toEqual(["Apple", "Banana", "Cherry"]);
  });

  it("sorts by direct key lookup descending", () => {
    const result = sortDataByKey(items, { key: "qty", dir: "desc" });
    expect(result.map((r) => r.qty)).toEqual([10, 5, 3]);
  });

  it("produces same results as sortData with keyof accessor", () => {
    const state = { key: "name", dir: "asc" as const };
    const withAccessor = sortData(items, state, (r, k) => r[k as keyof typeof items[0]]);
    const withByKey = sortDataByKey(items, state);
    expect(withByKey).toEqual(withAccessor);
  });

  it("handles non-existent key as no-op sort (all values undefined)", () => {
    const result = sortDataByKey(items, { key: "missing", dir: "asc" });
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.name)).toEqual(["Banana", "Apple", "Cherry"]);
  });
});
