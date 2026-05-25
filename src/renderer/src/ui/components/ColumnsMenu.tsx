import { useTT } from "../hooks/useTT";
import type { ColumnDef } from "./DataTable";
import { PopoverMenu } from "./PopoverMenu";

interface ColumnsMenuProps<TRow> {
  catalog: ColumnDef<TRow>[];
  isHidden: (key: string) => boolean;
  onToggle: (key: string) => void;
  onReset: () => void;
  hiddenCount: number;
}

/**
 * Catalog-driven column visibility menu. Splits columns into "Shown" and
 * "Available" so users discover columns that are off by default. Structural
 * columns (hideable === false) render disabled-checked with an "Always shown"
 * hint and can never be removed.
 */
export function ColumnsMenu<TRow>({ catalog, isHidden, onToggle, onReset, hiddenCount }: ColumnsMenuProps<TRow>) {
  const tt = useTT();
  const shown = catalog.filter((c) => !isHidden(c.key));
  const available = catalog.filter((c) => isHidden(c.key));

  const label = (c: ColumnDef<TRow>) => c.menuLabel ?? c.key;

  const row = (c: ColumnDef<TRow>) => {
    const locked = c.hideable === false;
    return (
      <label key={c.key} className={`columns-menu__opt${locked ? " columns-menu__opt--locked" : ""}`}>
        <input
          type="checkbox"
          checked={!isHidden(c.key)}
          disabled={locked}
          onChange={() => onToggle(c.key)}
        />
        <span className="columns-menu__opt-label">{label(c)}</span>
        {locked && <span className="columns-menu__lock">{tt("alwaysShown", "Always shown")}</span>}
      </label>
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
        {shown.map(row)}
        {available.length > 0 && (
          <>
            <div className="columns-menu__section-label">{tt("availableSection", "Available")}</div>
            {available.map(row)}
          </>
        )}
        <button type="button" className="columns-menu__reset" onClick={onReset}>
          {tt("resetColumns", "Reset to defaults")}
        </button>
      </div>
    </PopoverMenu>
  );
}
