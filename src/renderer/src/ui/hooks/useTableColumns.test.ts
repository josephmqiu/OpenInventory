import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ColumnDef } from "../components/DataTable";
import { useTableColumns } from "./useTableColumns";

// vitest's jsdom uses an opaque origin, so localStorage is unavailable there
// (it exists in the real Chromium renderer). Provide a minimal in-memory shim.
class MemStorage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
}
(globalThis as unknown as { localStorage: Storage }).localStorage = new MemStorage() as unknown as Storage;

type Row = { id: string };

const catalog: ColumnDef<Row>[] = [
  { key: "name", header: "Name", pin: "start", hideable: false, defaultVisible: true, defaultWidth: 200 },
  { key: "sku", header: "SKU", sortKey: "sku", defaultVisible: true, defaultWidth: 100 },
  { key: "price", header: "Price", sortKey: "unitPriceMinor", defaultVisible: true, defaultWidth: 80 },
  { key: "supplier", header: "Supplier", defaultWidth: 120 }, // off by default
  { key: "actions", header: "Actions", pin: "end", hideable: false, defaultVisible: true },
];

const KEY = "oi-table-cols:test";
const keysOf = (cols: ColumnDef<Row>[]) => cols.map((c) => c.key);

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("useTableColumns", () => {
  beforeEach(() => localStorage.clear());

  it("defaults: shows defaultVisible columns in order, hides the rest, pins respected", () => {
    const { result } = renderHook(() => useTableColumns("test", catalog));
    expect(keysOf(result.current.visibleColumns)).toEqual(["name", "sku", "price", "actions"]);
    expect(result.current.hiddenCount).toBe(1);
    expect(result.current.isHidden("supplier")).toBe(true);
  });

  it("toggle adds an available column at its order position", () => {
    const { result } = renderHook(() => useTableColumns("test", catalog));
    act(() => result.current.toggle("supplier"));
    expect(keysOf(result.current.visibleColumns)).toEqual(["name", "sku", "price", "supplier", "actions"]);
    expect(result.current.hiddenCount).toBe(0);
  });

  it("toggle is a no-op for non-hideable (locked) columns", () => {
    const { result } = renderHook(() => useTableColumns("test", catalog));
    act(() => result.current.toggle("name"));
    expect(result.current.isHidden("name")).toBe(false);
    expect(keysOf(result.current.visibleColumns)).toContain("name");
  });

  it("setWidth clamps to the minimum and applies px width", () => {
    const { result } = renderHook(() => useTableColumns("test", catalog));
    act(() => result.current.setWidth("sku", 10));
    const sku = result.current.visibleColumns.find((c) => c.key === "sku");
    expect(sku?.width).toBe("64px"); // MIN_COLUMN_WIDTH
  });

  it("moveColumn reorders the middle while pins stay fixed", () => {
    const { result } = renderHook(() => useTableColumns("test", catalog));
    act(() => result.current.toggle("supplier")); // make it visible
    act(() => result.current.moveColumn("price", "sku", false)); // price before sku
    expect(keysOf(result.current.visibleColumns)).toEqual(["name", "price", "sku", "supplier", "actions"]);
  });

  it("persists across mounts", () => {
    const first = renderHook(() => useTableColumns("test", catalog));
    act(() => first.result.current.toggle("price")); // hide price
    first.unmount();
    const second = renderHook(() => useTableColumns("test", catalog));
    expect(second.result.current.isHidden("price")).toBe(true);
    expect(keysOf(second.result.current.visibleColumns)).toEqual(["name", "sku", "actions"]);
  });

  it("sanitizes stale/unknown keys from stored config", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ hidden: ["ghost", "sku"], order: ["ghost", "sku", "price", "supplier"], widths: { ghost: 50, sku: 90 } }),
    );
    const { result } = renderHook(() => useTableColumns("test", catalog));
    // ghost dropped; sku hidden honored; supplier shown (explicitly known + not hidden)
    expect(result.current.isHidden("sku")).toBe(true);
    expect(keysOf(result.current.visibleColumns)).toEqual(["name", "price", "supplier", "actions"]);
    const supplier = result.current.visibleColumns.find((c) => c.key === "supplier");
    expect(supplier?.width).toBe("120px"); // default (ghost width ignored)
  });

  it("new columns added in a later release follow their shipped default", () => {
    // Stored config predates the "supplier" column (not in order, not in hidden).
    localStorage.setItem(KEY, JSON.stringify({ hidden: [], order: ["sku", "price"], widths: {} }));
    const { result } = renderHook(() => useTableColumns("test", catalog));
    // supplier is off-by-default → must be hidden, not silently shown.
    expect(result.current.isHidden("supplier")).toBe(true);
    expect(keysOf(result.current.visibleColumns)).toEqual(["name", "sku", "price", "actions"]);
  });

  it("reset clears persisted config and returns to defaults", () => {
    const { result } = renderHook(() => useTableColumns("test", catalog));
    act(() => result.current.toggle("supplier"));
    act(() => result.current.setWidth("sku", 300));
    act(() => result.current.reset());
    expect(keysOf(result.current.visibleColumns)).toEqual(["name", "sku", "price", "actions"]);
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
