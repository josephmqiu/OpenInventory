import { useRef, useState, type ReactNode } from "react";

export interface SortState {
  key: string;
  dir: "asc" | "desc";
}

export interface ColumnDef<TRow> {
  /** Unique column identifier */
  key: string;
  /** Content rendered inside <th> */
  header: ReactNode;
  /** CSS width for <col> (e.g. "20%" or "240px") */
  width?: string;
  /** CSS class applied to every <td> in this column */
  className?: string;
  /** CSS class applied to the <th> */
  headerClassName?: string;
  /** Custom cell renderer. If omitted, the cell is left empty (use for simple columns where header-only is enough). */
  render?: (row: TRow) => ReactNode;
  /** Whether this column supports sorting */
  sortable?: boolean;
  /** Data field key used for sorting. Required when sortable is true. */
  sortKey?: string;
  // ---- Configurable-columns metadata (consumed by useTableColumns / the menu) ----
  /** false = structural, can never be hidden (default: true). */
  hideable?: boolean;
  /** Pinned position; excluded from reorder. */
  pin?: "start" | "end";
  /** Shown out of the box (= today's layout). Absent/false ⇒ off by default. */
  defaultVisible?: boolean;
  /** Baseline px width before any user resize. */
  defaultWidth?: number;
  /** Plain-text label for the visibility menu (header is ReactNode, unsafe as a label). */
  menuLabel?: string;
  /** Server-side sort key (reserved for tables that sort via the backend). */
  backendSortKey?: string;
}

/** Minimum column width (px) a resize drag can produce. */
export const MIN_COLUMN_WIDTH = 64;

/** Floor widths used to size a fluid table so its body controls never clip.
 *  See `fluidMinWidth` below. */
const MIN_SELECTION_COLUMN_WIDTH = 48;
const MIN_FLUID_UNSIZED_COLUMN_WIDTH = 144;

function pxWidthValue(width: string | undefined): number | null {
  const match = width?.trim().match(/^(\d+(?:\.\d+)?)px$/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export interface DataTableProps<TRow> {
  columns: ColumnDef<TRow>[];
  data: TRow[];
  /** Function to extract a unique React key from each row */
  rowKey: (row: TRow) => string;
  /** Message shown when data is empty */
  emptyTitle?: string;
  /** Hint text below the empty title */
  emptyHint?: string;
  /** Show loading state instead of table */
  loading?: boolean;
  /** Loading message */
  loadingMessage?: string;
  /** Called when a row is clicked */
  onRowClick?: (row: TRow) => void;
  /** Dynamic className for each <tr> */
  rowClassName?: (row: TRow) => string;
  /** Additional className on <table> */
  className?: string;
  /** data-testid passed through to <table> */
  testId?: string;
  /** Stretch the table to 100% width so the last (unsized) column flexes.
   *  Opt-in per table — the shared base rule stays `width: max-content`. */
  fluid?: boolean;
  /** Checkbox selection support */
  selection?: {
    selectedIds: string[];
    onToggle: (id: string) => void;
    onToggleAll: () => void;
    getId: (row: TRow) => string;
    allSelected: boolean;
  };
  /** Current sort state (controlled) */
  sortState?: SortState | null;
  /** Called when a sortable column header is clicked with the new sort state */
  onSortChange?: (newState: SortState | null) => void;
  /** Enables pointer column resizing. Called on drag with the new width in px. */
  onColumnResize?: (key: string, widthPx: number) => void;
  /** Enables header drag-to-reorder. Called on drop. Pinned columns never move. */
  onColumnReorder?: (srcKey: string, targetKey: string, after: boolean) => void;
}

function nextSortState(current: SortState | null | undefined, sortKey: string): SortState | null {
  if (!current || current.key !== sortKey) return { key: sortKey, dir: "asc" };
  if (current.dir === "asc") return { key: sortKey, dir: "desc" };
  return null;
}

function sortAriaSort(sortState: SortState | null | undefined, sortKey: string): "ascending" | "descending" | "none" {
  if (!sortState || sortState.key !== sortKey) return "none";
  return sortState.dir === "asc" ? "ascending" : "descending";
}

function SortIndicator({ sortState, sortKey }: { sortState: SortState | null | undefined; sortKey: string }) {
  if (!sortState || sortState.key !== sortKey) return <span className="sort-indicator" aria-hidden="true">⇅</span>;
  return <span className="sort-indicator sort-indicator--active" aria-hidden="true">{sortState.dir === "asc" ? "▲" : "▼"}</span>;
}

export function DataTable<TRow>({
  columns,
  data,
  rowKey,
  emptyTitle,
  emptyHint,
  loading,
  loadingMessage,
  onRowClick,
  rowClassName,
  className,
  testId,
  fluid,
  selection,
  sortState,
  onSortChange,
  onColumnResize,
  onColumnReorder,
}: DataTableProps<TRow>) {
  // Resize/reorder transient state. resizingRef guards reorder from firing mid-resize.
  const resizingRef = useRef(false);
  const dragKeyRef = useRef<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ key: string; after: boolean } | null>(null);

  if (loading) {
    return (
      <div className="empty-state">
        <h3>{loadingMessage || "Loading..."}</h3>
      </div>
    );
  }

  if (data.length === 0 && emptyTitle) {
    return (
      <div className="empty-state">
        <h3>{emptyTitle}</h3>
        {emptyHint && <p>{emptyHint}</p>}
      </div>
    );
  }

  const hasWidths = columns.some((c) => c.width) || !!selection;
  const tableClass = [className, fluid ? "table--fluid" : ""].filter(Boolean).join(" ") || undefined;

  // A fluid table stretches to width:100%. With px column widths that exceed a
  // narrow viewport (e.g. Windows CI), fixed layout would squeeze columns below
  // their px size and the body cells (overflow:hidden) clip their controls —
  // making row checkboxes/buttons unhittable. Force a minWidth from the px
  // columns so the table scrolls horizontally instead of clipping; on wide
  // screens width:100% still wins, so the last unsized column keeps flexing.
  const pxWidths = columns.map((col) => pxWidthValue(col.width));
  const fluidMinWidth =
    fluid && pxWidths.some((width) => width !== null)
      ? Math.ceil(
          pxWidths.reduce(
            (sum, width) => sum + (width ?? MIN_FLUID_UNSIZED_COLUMN_WIDTH),
            selection ? MIN_SELECTION_COLUMN_WIDTH : 0,
          ),
        )
      : undefined;
  const tableStyle = fluidMinWidth ? { minWidth: `${fluidMinWidth}px` } : undefined;

  const startResize = (e: React.PointerEvent<HTMLSpanElement>, key: string) => {
    if (!onColumnResize) return;
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = true;
    const th = e.currentTarget.closest("th");
    const startX = e.clientX;
    const startW = th ? th.getBoundingClientRect().width : 0;
    const onMove = (ev: PointerEvent) => {
      onColumnResize(key, Math.max(MIN_COLUMN_WIDTH, Math.round(startW + ev.clientX - startX)));
    };
    const onUp = () => {
      resizingRef.current = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div className="table-wrap">
      <table className={tableClass} data-testid={testId} style={tableStyle}>
        {hasWidths && (
          <colgroup>
            {selection && <col style={{ width: "4%" }} />}
            {columns.map((col) => (
              <col key={col.key} style={col.width ? { width: col.width } : undefined} />
            ))}
          </colgroup>
        )}
        <thead>
          <tr>
            {selection && (
              <th className="col-checkbox">
                <label className="checkbox-cell">
                  <input
                    aria-label="Select all rows"
                    checked={selection.allSelected}
                    onChange={selection.onToggleAll}
                    type="checkbox"
                  />
                </label>
              </th>
            )}
            {columns.map((col, i) => {
              const sk = col.sortKey ?? col.key;
              const reorderable = !!onColumnReorder && !col.pin;
              const resizable = !!onColumnResize && i < columns.length - 1;
              const dropClass =
                dropTarget && dropTarget.key === col.key
                  ? dropTarget.after
                    ? " drop-after"
                    : " drop-before"
                  : "";

              const headerContent = col.sortable && onSortChange ? (
                <button
                  type="button"
                  className="th-sortable__button"
                  onClick={() => onSortChange(nextSortState(sortState, sk))}
                >
                  {col.header}
                  <SortIndicator sortState={sortState} sortKey={sk} />
                </button>
              ) : (
                <span className="th-static">{col.header}</span>
              );

              const thProps: React.ThHTMLAttributes<HTMLTableCellElement> & { "aria-sort"?: "ascending" | "descending" | "none" } = {};
              if (col.sortable && onSortChange) thProps["aria-sort"] = sortAriaSort(sortState, sk);
              if (reorderable) {
                thProps.draggable = true;
                thProps.onDragStart = (e) => {
                  if (resizingRef.current) {
                    e.preventDefault();
                    return;
                  }
                  dragKeyRef.current = col.key;
                  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
                };
                thProps.onDragOver = (e) => {
                  if (!dragKeyRef.current || dragKeyRef.current === col.key) return;
                  e.preventDefault();
                  const r = e.currentTarget.getBoundingClientRect();
                  setDropTarget({ key: col.key, after: e.clientX > r.left + r.width / 2 });
                };
                thProps.onDrop = (e) => {
                  const src = dragKeyRef.current;
                  if (!src || src === col.key) return;
                  e.preventDefault();
                  const r = e.currentTarget.getBoundingClientRect();
                  onColumnReorder!(src, col.key, e.clientX > r.left + r.width / 2);
                  dragKeyRef.current = null;
                  setDropTarget(null);
                };
                thProps.onDragEnd = () => {
                  dragKeyRef.current = null;
                  setDropTarget(null);
                };
              }

              const headerClassName =
                (col.sortable && onSortChange ? "th-sortable" : "") +
                (col.headerClassName ? ` ${col.headerClassName}` : "") +
                (reorderable ? " th-reorderable" : "") +
                dropClass;

              return (
                <th key={col.key} className={headerClassName.trim() || undefined} {...thProps}>
                  {headerContent}
                  {resizable && (
                    <span
                      className="col-resize-handle"
                      aria-hidden="true"
                      draggable={false}
                      onPointerDown={(e) => startResize(e, col.key)}
                    />
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => {
            const key = rowKey(row);
            return (
              <tr
                key={key}
                className={[
                  onRowClick ? "row-clickable" : "",
                  rowClassName?.(row) || "",
                ].filter(Boolean).join(" ") || undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {selection && (
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      aria-label="Select row"
                      checked={selection.selectedIds.includes(selection.getId(row))}
                      onChange={() => selection.onToggle(selection.getId(row))}
                      type="checkbox"
                    />
                  </td>
                )}
                {columns.map((col) => (
                  <td key={col.key} className={col.className}>
                    {col.render ? col.render(row) : null}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
