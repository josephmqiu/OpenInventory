import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

describe("useTableColumns — prop bundles & options (PR-2)", () => {
  beforeEach(() => localStorage.clear());

  // T1 + T2: bundle shapes
  it("dataTableProps carries visibleColumns + reorder, and resize by default", () => {
    const { result } = renderHook(() => useTableColumns("test", catalog));
    const dtp = result.current.dataTableProps;
    expect(dtp.columns).toBe(result.current.visibleColumns);
    expect(typeof dtp.onColumnReorder).toBe("function");
    expect(typeof dtp.onColumnResize).toBe("function"); // resize defaults on
  });

  // T3: resize:false omits onColumnResize
  it("dataTableProps omits onColumnResize when options.resize === false", () => {
    const { result } = renderHook(() => useTableColumns("test", catalog, { resize: false }));
    expect(result.current.dataTableProps.onColumnResize).toBeUndefined();
    expect(typeof result.current.dataTableProps.onColumnReorder).toBe("function");
  });

  it("menuProps exposes the menu contract incl. movableOrder (no pins) + onMove", () => {
    const { result } = renderHook(() => useTableColumns("test", catalog));
    const mp = result.current.menuProps;
    expect(mp.catalog).toBe(catalog);
    expect(typeof mp.onToggle).toBe("function");
    expect(typeof mp.onReset).toBe("function");
    expect(typeof mp.onMove).toBe("function");
    // T9: pinned columns (name/actions) are never movable
    expect(mp.movableOrder).toEqual(["sku", "price", "supplier"]);
    expect(mp.movableOrder).not.toContain("name");
    expect(mp.movableOrder).not.toContain("actions");
  });

  // T4: client sort-clear on hiding the sorted column
  it("menuProps.onToggle clears the sort when hiding the sorted column", () => {
    const onClearSort = vi.fn();
    const { result } = renderHook(() =>
      useTableColumns("test", catalog, { sortState: { key: "sku", dir: "asc" }, onClearSort }),
    );
    act(() => result.current.menuProps.onToggle("sku"));
    expect(onClearSort).toHaveBeenCalledTimes(1);
    expect(result.current.isHidden("sku")).toBe(true);
  });

  // T6: discriminator — compares the RESOLVED sortKey, not the raw column key
  it("onToggle resolves sortKey: hiding 'price' clears a sort keyed by 'unitPriceMinor'", () => {
    const onClearSort = vi.fn();
    const { result } = renderHook(() =>
      useTableColumns("test", catalog, { sortState: { key: "unitPriceMinor", dir: "asc" }, onClearSort }),
    );
    // A buggy impl comparing the raw key ("price") to "unitPriceMinor" would NOT clear.
    act(() => result.current.menuProps.onToggle("price"));
    expect(onClearSort).toHaveBeenCalledTimes(1);
  });

  it("onToggle does NOT clear the sort when hiding a non-sorted column", () => {
    const onClearSort = vi.fn();
    const { result } = renderHook(() =>
      useTableColumns("test", catalog, { sortState: { key: "unitPriceMinor", dir: "asc" }, onClearSort }),
    );
    act(() => result.current.menuProps.onToggle("sku")); // sorted by price, hiding sku
    expect(onClearSort).not.toHaveBeenCalled();
  });

  it("onToggle does NOT clear the sort when SHOWING a column (only on hide)", () => {
    const onClearSort = vi.fn();
    const { result } = renderHook(() =>
      useTableColumns("test", catalog, { sortState: { key: "sku", dir: "asc" }, onClearSort }),
    );
    act(() => result.current.menuProps.onToggle("sku")); // hide (clears once)
    onClearSort.mockClear();
    act(() => result.current.menuProps.onToggle("sku")); // show again — must NOT clear
    expect(onClearSort).not.toHaveBeenCalled();
  });

  // T-onMove: keyboard reorder moves among visible movable columns + persists
  it("menuProps.onMove reorders among visible movable columns and persists", () => {
    const { result } = renderHook(() => useTableColumns("test", catalog));
    act(() => result.current.menuProps.onMove!("price", -1)); // price left, before sku
    expect(keysOf(result.current.visibleColumns)).toEqual(["name", "price", "sku", "actions"]);
    const stored = JSON.parse(localStorage.getItem(KEY)!);
    expect(stored.order.slice(0, 2)).toEqual(["price", "sku"]);
  });

  it("onMove is a no-op at the ends and never disturbs pins", () => {
    const { result } = renderHook(() => useTableColumns("test", catalog));
    act(() => result.current.menuProps.onMove!("sku", -1)); // already first movable
    expect(keysOf(result.current.visibleColumns)).toEqual(["name", "sku", "price", "actions"]);
  });

  // F2 guard: onMove operates on the VISIBLE movable order, skipping hidden
  // columns — must match drag-reorder so keyboard/drag can't silently diverge.
  it("onMove skips a hidden column lying between two visible ones", () => {
    const { result } = renderHook(() => useTableColumns("test", catalog));
    act(() => result.current.toggle("supplier")); // show it
    act(() => result.current.moveColumn("supplier", "sku", true)); // order: sku, supplier, price
    act(() => result.current.toggle("supplier")); // hide it again → between sku and price
    // visible movable is [sku, price]; moving sku right lands it after price, past hidden supplier
    act(() => result.current.menuProps.onMove!("sku", 1));
    expect(keysOf(result.current.visibleColumns)).toEqual(["name", "price", "sku", "actions"]);
    expect(JSON.parse(localStorage.getItem(KEY)!).order).toEqual(["supplier", "price", "sku"]);
  });

  // T10: migration on REMOUNT — a column that was hideable becomes pinned + non-hideable
  it("migrates a stored column that is now pinned + non-hideable (severity-stripe case)", () => {
    // Stored config from a release where "stripe" was an ordinary hideable column.
    localStorage.setItem(
      "oi-table-cols:mig",
      JSON.stringify({ hidden: ["stripe"], order: ["stripe", "a"], widths: {} }),
    );
    const v2: ColumnDef<Row>[] = [
      { key: "stripe", header: "", pin: "start", hideable: false, defaultVisible: true },
      { key: "a", header: "A", defaultVisible: true },
      { key: "actions", header: "Actions", pin: "end", hideable: false, defaultVisible: true },
    ];
    const { result } = renderHook(() => useTableColumns("mig", v2));
    // stripe is now structural: dropped from hidden, excluded from movableOrder, shown first.
    expect(result.current.isHidden("stripe")).toBe(false);
    expect(result.current.menuProps.movableOrder).toEqual(["a"]);
    expect(keysOf(result.current.visibleColumns)).toEqual(["stripe", "a", "actions"]);
  });
});
