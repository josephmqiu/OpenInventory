import { useTT } from "../hooks/useTT";
import type { ColumnDef } from "./DataTable";
import { PopoverMenu } from "./PopoverMenu";

export interface ColumnsMenuProps<TRow> {
  catalog: ColumnDef<TRow>[];
  isHidden: (key: string) => boolean;
  onToggle: (key: string) => void;
  onReset: () => void;
  hiddenCount: number;
  /** Ordered keys of the non-pinned (movable) columns, in their current order.
   *  Supplied by useTableColumns so the menu can list shown columns in visible
   *  order and offer keyboard reorder. Omit to disable reorder controls. */
  movableOrder?: string[];
  /** Move a column one step among the movable columns (-1 = left, +1 = right).
   *  Enables keyboard-accessible reorder (drag-to-reorder is mouse-only). */
  onMove?: (key: string, dir: -1 | 1) => void;
}

/**
 * Catalog-driven column visibility menu. Splits columns into "Shown" and
 * "Available" so users discover columns that are off by default. Structural
 * columns (hideable === false) render disabled-checked with an "Always shown"
 * hint and can never be removed.
 *
 * Shown movable columns render in their live order with Move left/right buttons
 * — a keyboard-accessible alternative to header drag-to-reorder (mouse-only).
 */
export function ColumnsMenu<TRow>({
  catalog,
  isHidden,
  onToggle,
  onReset,
  hiddenCount,
  movableOrder,
  onMove,
}: ColumnsMenuProps<TRow>) {
  const tt = useTT();
  const byKey = new Map(catalog.map((c) => [c.key, c]));

  // Shown, in table layout order: start-pinned, then movable (live order), then end-pinned.
  const startPinned = catalog.filter((c) => c.pin === "start" && !isHidden(c.key));
  const endPinned = catalog.filter((c) => c.pin === "end" && !isHidden(c.key));
  const movableKeys = movableOrder ?? catalog.filter((c) => !c.pin).map((c) => c.key);
  const movableShown = movableKeys
    .map((k) => byKey.get(k))
    .filter((c): c is ColumnDef<TRow> => !!c && !isHidden(c.key));
  const available = catalog.filter((c) => isHidden(c.key));

  const label = (c: ColumnDef<TRow>) => c.menuLabel ?? c.key;

  const row = (c: ColumnDef<TRow>, move?: { index: number; count: number }) => {
    const locked = c.hideable === false;
    const canMove = !!move && !!onMove;
    return (
      <div key={c.key} className={`columns-menu__opt${locked ? " columns-menu__opt--locked" : ""}`}>
        <label className="columns-menu__opt-toggle">
          <input type="checkbox" checked={!isHidden(c.key)} disabled={locked} onChange={() => onToggle(c.key)} />
          <span className="columns-menu__opt-label">{label(c)}</span>
        </label>
        {locked && <span className="columns-menu__lock">{tt("alwaysShown", "Always shown")}</span>}
        {canMove && (
          <span className="columns-menu__move">
            {/* Include the column name so each Move button has a distinct
                accessible name (otherwise every row reads "Move left"). */}
            <button
              type="button"
              className="columns-menu__move-btn"
              aria-label={`${tt("moveColumnLeft", "Move left")}: ${label(c)}`}
              disabled={move!.index === 0}
              onClick={() => onMove!(c.key, -1)}
            >
              ◀
            </button>
            <button
              type="button"
              className="columns-menu__move-btn"
              aria-label={`${tt("moveColumnRight", "Move right")}: ${label(c)}`}
              disabled={move!.index === move!.count - 1}
              onClick={() => onMove!(c.key, 1)}
            >
              ▶
            </button>
          </span>
        )}
      </div>
    );
  };

  const trigger = (
    <>
      {tt("columns", "Columns")}
      {hiddenCount > 0 && <span className="columns-menu__count">{hiddenCount}</span>}
    </>
  );

  return (
    <PopoverMenu
      triggerLabel={trigger}
      triggerClassName="button-secondary columns-menu__trigger"
      ariaLabel={tt("showHideColumns", "Show or hide columns")}
    >
      <div className="columns-menu">
        <div className="columns-menu__section-label">{tt("shownSection", "Shown")}</div>
        {startPinned.map((c) => row(c))}
        {movableShown.map((c, i) => row(c, { index: i, count: movableShown.length }))}
        {endPinned.map((c) => row(c))}
        {available.length > 0 && (
          <>
            <div className="columns-menu__section-label">{tt("availableSection", "Available")}</div>
            {available.map((c) => row(c))}
          </>
        )}
        <button type="button" className="columns-menu__reset" onClick={onReset}>
          {tt("resetColumns", "Reset to defaults")}
        </button>
      </div>
    </PopoverMenu>
  );
}
