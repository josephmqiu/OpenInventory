import { useCallback, useMemo, useState } from "react";
import { MIN_COLUMN_WIDTH, type ColumnDef, type DataTableProps, type SortState } from "../components/DataTable";
import type { ColumnsMenuProps } from "../components/ColumnsMenu";

/**
 * Per-table column configuration: which columns are shown, their order, and
 * their widths — persisted per machine to localStorage (mirrors useTheme's
 * guarded read/write). The `catalog` is the curated superset of business
 * columns a table can show; `defaultVisible`/`pin`/`defaultWidth`/`hideable`
 * on each ColumnDef encode the shipped layout.
 *
 * State is kept presentational-friendly: the hook resolves `visibleColumns`
 * (ordered, filtered, sized) ready to hand straight to <DataTable>.
 */

interface StoredConfig {
  hidden: string[];
  widths: Record<string, number>;
  order: string[];
}

const KEY_PREFIX = "oi-table-cols:";

function storageKey(persistKey: string): string {
  return KEY_PREFIX + persistKey;
}

function readStored(persistKey: string): Partial<StoredConfig> | null {
  try {
    const raw = localStorage.getItem(storageKey(persistKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    const obj = parsed as Record<string, unknown>;
    const hidden = Array.isArray(obj.hidden) ? obj.hidden.filter((k): k is string => typeof k === "string") : undefined;
    const order = Array.isArray(obj.order) ? obj.order.filter((k): k is string => typeof k === "string") : undefined;
    const widths: Record<string, number> = {};
    if (obj.widths && typeof obj.widths === "object") {
      for (const [k, v] of Object.entries(obj.widths as Record<string, unknown>)) {
        if (typeof v === "number" && Number.isFinite(v)) widths[k] = v;
      }
    }
    return { hidden, order, widths };
  } catch {
    return null;
  }
}

function writeStored(persistKey: string, config: StoredConfig): void {
  try {
    localStorage.setItem(storageKey(persistKey), JSON.stringify(config));
  } catch {
    /* ignore — quota, private mode, disabled storage; state stays in-memory */
  }
}

/** Resolve the persisted (or absent) config against the live catalog, dropping
 *  stale/illegal keys and applying shipped defaults to new columns. */
function resolveConfig<TRow>(catalog: ColumnDef<TRow>[], stored: Partial<StoredConfig> | null): StoredConfig {
  const byKey = new Map(catalog.map((c) => [c.key, c]));
  const nonPinnedKeys = catalog.filter((c) => !c.pin).map((c) => c.key);
  const hideable = new Set(catalog.filter((c) => c.hideable !== false && !c.pin).map((c) => c.key));

  // Order: keep persisted order (valid non-pinned keys only), then append any
  // catalog columns it didn't know about, in catalog order.
  let order: string[];
  if (stored?.order) {
    const known = stored.order.filter((k) => nonPinnedKeys.includes(k));
    const knownSet = new Set(known);
    order = [...known, ...nonPinnedKeys.filter((k) => !knownSet.has(k))];
  } else {
    order = [...nonPinnedKeys];
  }

  // Hidden: persisted hidden (hideable only) + new columns whose shipped
  // default is off. A column the persisted state already knew about keeps the
  // user's choice; only genuinely-new columns follow defaultVisible.
  let hidden: string[];
  if (stored?.hidden) {
    const persistedHidden = stored.hidden.filter((k) => hideable.has(k));
    const knownBefore = new Set(stored.order ?? []);
    const newlyHidden = nonPinnedKeys.filter(
      (k) => !knownBefore.has(k) && hideable.has(k) && byKey.get(k)?.defaultVisible !== true,
    );
    hidden = [...new Set([...persistedHidden, ...newlyHidden])];
  } else {
    hidden = catalog
      .filter((c) => c.hideable !== false && !c.pin && c.defaultVisible !== true)
      .map((c) => c.key);
  }

  // Widths: keep valid persisted overrides for live columns, clamped to min.
  const widths: Record<string, number> = {};
  if (stored?.widths) {
    for (const [k, v] of Object.entries(stored.widths)) {
      if (byKey.has(k) && v >= MIN_COLUMN_WIDTH) widths[k] = v;
    }
  }

  return { hidden, widths, order };
}

/** Per-table options. Omit entirely for an unsortable, resizable table. */
export interface UseTableColumnsOptions {
  /** Current sort (compared by sortKey) — needed to clear sort when its column is hidden. */
  sortState?: SortState | null;
  /** Clear the active sort. Client tables: `() => setSort(null)`.
   *  Server tables (e.g. Activity Log): `() => onQuickFilter({ sortBy: undefined, ... })`. */
  onClearSort?: () => void;
  /** false ⇒ no resize handles wired (onColumnResize omitted from dataTableProps). Default: true. */
  resize?: boolean;
}

export interface UseTableColumns<TRow> {
  /** Ordered, filtered, sized columns — pass straight to <DataTable columns>. */
  visibleColumns: ColumnDef<TRow>[];
  /** The full catalog (for rendering the menu). */
  catalog: ColumnDef<TRow>[];
  isHidden: (key: string) => boolean;
  /** Toggle a hideable column. No-op for pinned/non-hideable columns. */
  toggle: (key: string) => void;
  setWidth: (key: string, widthPx: number) => void;
  moveColumn: (srcKey: string, targetKey: string, after: boolean) => void;
  reset: () => void;
  /** Count of currently-hidden hideable columns (for the trigger badge). */
  hiddenCount: number;
  /** Ready-made <DataTable> props — spread directly. onColumnResize omitted when options.resize === false. */
  dataTableProps: Pick<DataTableProps<TRow>, "columns" | "onColumnReorder" | "onColumnResize">;
  /** Ready-made <ColumnsMenu> props — spread directly. onToggle clears a stranded sort; onMove enables keyboard reorder. */
  menuProps: ColumnsMenuProps<TRow>;
}

export function useTableColumns<TRow>(
  persistKey: string,
  catalog: ColumnDef<TRow>[],
  options?: UseTableColumnsOptions,
): UseTableColumns<TRow> {
  const [config, setConfig] = useState<StoredConfig>(() => resolveConfig(catalog, readStored(persistKey)));

  const byKey = useMemo(() => new Map(catalog.map((c) => [c.key, c])), [catalog]);
  const hideable = useMemo(
    () => new Set(catalog.filter((c) => c.hideable !== false && !c.pin).map((c) => c.key)),
    [catalog],
  );

  const persist = useCallback(
    (next: StoredConfig) => {
      writeStored(persistKey, next);
      return next;
    },
    [persistKey],
  );

  const isHidden = useCallback((key: string) => config.hidden.includes(key), [config.hidden]);

  const toggle = useCallback(
    (key: string) => {
      if (!hideable.has(key)) return;
      setConfig((prev) => {
        const hidden = prev.hidden.includes(key)
          ? prev.hidden.filter((k) => k !== key)
          : [...prev.hidden, key];
        return persist({ ...prev, hidden });
      });
    },
    [hideable, persist],
  );

  const setWidth = useCallback(
    (key: string, widthPx: number) => {
      if (!byKey.has(key)) return;
      setConfig((prev) => persist({ ...prev, widths: { ...prev.widths, [key]: Math.max(MIN_COLUMN_WIDTH, Math.round(widthPx)) } }));
    },
    [byKey, persist],
  );

  const moveColumn = useCallback(
    (srcKey: string, targetKey: string, after: boolean) => {
      if (srcKey === targetKey) return;
      setConfig((prev) => {
        if (!prev.order.includes(srcKey) || !prev.order.includes(targetKey)) return prev;
        const without = prev.order.filter((k) => k !== srcKey);
        let idx = without.indexOf(targetKey);
        if (after) idx += 1;
        without.splice(idx, 0, srcKey);
        return persist({ ...prev, order: without });
      });
    },
    [persist],
  );

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(storageKey(persistKey));
    } catch {
      /* ignore */
    }
    setConfig(resolveConfig(catalog, null));
  }, [persistKey, catalog]);

  const visibleColumns = useMemo(() => {
    const startPins = catalog.filter((c) => c.pin === "start");
    const endPins = catalog.filter((c) => c.pin === "end");
    const hiddenSet = new Set(config.hidden);
    const middle = config.order
      .map((k) => byKey.get(k))
      .filter((c): c is ColumnDef<TRow> => !!c && !hiddenSet.has(c.key));
    const ordered = [...startPins, ...middle, ...endPins];
    return ordered.map((c) => {
      const w = config.widths[c.key] ?? c.defaultWidth;
      return w != null ? { ...c, width: `${w}px` } : c;
    });
  }, [catalog, byKey, config]);

  const hiddenCount = useMemo(
    () => config.hidden.filter((k) => hideable.has(k)).length,
    [config.hidden, hideable],
  );

  // Move a column one step among the currently-visible movable columns (skips
  // hidden ones). Powers the keyboard reorder buttons in the menu.
  const onMove = useCallback(
    (key: string, dir: -1 | 1) => {
      setConfig((prev) => {
        const visible = prev.order.filter((k) => !prev.hidden.includes(k));
        const i = visible.indexOf(key);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= visible.length) return prev;
        const target = visible[j];
        const without = prev.order.filter((k) => k !== key);
        let idx = without.indexOf(target);
        if (dir > 0) idx += 1;
        without.splice(idx, 0, key);
        return persist({ ...prev, order: without });
      });
    },
    [persist],
  );

  // Toggle that clears a stranded sort: hiding the sorted column would leave an
  // invisible, un-clearable sort. Compare the resolved sortKey (a column's key
  // may differ from its sortKey, e.g. "price" → "unitPriceMinor").
  // NOTE: callers pass a fresh `options` literal each render, so this callback
  // (and `menuProps`) re-create per render. That's harmless — ColumnsMenu isn't
  // memoized, so identity never gates a render. Do NOT wrap `options` in useMemo
  // to "fix" it: it wouldn't help and would risk staling the onClearSort closure.
  const onToggle = useCallback(
    (key: string) => {
      const { sortState, onClearSort } = options ?? {};
      if (sortState && onClearSort && !isHidden(key)) {
        const sk = catalog.find((c) => c.key === key)?.sortKey ?? key;
        if (sk === sortState.key) onClearSort();
      }
      toggle(key);
    },
    [options, isHidden, catalog, toggle],
  );

  const dataTableProps = useMemo<Pick<DataTableProps<TRow>, "columns" | "onColumnReorder" | "onColumnResize">>(
    () => ({
      columns: visibleColumns,
      onColumnReorder: moveColumn,
      ...(options?.resize === false ? {} : { onColumnResize: setWidth }),
    }),
    [visibleColumns, moveColumn, setWidth, options?.resize],
  );

  const menuProps = useMemo<ColumnsMenuProps<TRow>>(
    () => ({ catalog, isHidden, onToggle, onReset: reset, hiddenCount, movableOrder: config.order, onMove }),
    [catalog, isHidden, onToggle, reset, hiddenCount, config.order, onMove],
  );

  return {
    visibleColumns,
    catalog,
    isHidden,
    toggle,
    setWidth,
    moveColumn,
    reset,
    hiddenCount,
    dataTableProps,
    menuProps,
  };
}
