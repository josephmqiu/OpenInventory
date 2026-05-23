import { useEffect, useRef, useState, type ReactNode } from "react";

interface PopoverMenuProps {
  /** Visible trigger content (e.g. a label + optional badge). */
  triggerLabel: ReactNode;
  /** className for the trigger button. */
  triggerClassName?: string;
  /** Accessible label for the popover panel. */
  ariaLabel: string;
  children: ReactNode;
}

/**
 * Button + dismissible popover panel. Closes on outside click and Escape
 * (returning focus to the trigger). Generic so other toolbar menus can reuse it.
 */
export function PopoverMenu({ triggerLabel, triggerClassName, ariaLabel, children }: PopoverMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocPointer = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="popover-menu" ref={rootRef}>
      <button
        ref={btnRef}
        type="button"
        className={triggerClassName}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {triggerLabel}
      </button>
      {open && (
        <div className="popover-menu__panel" role="group" aria-label={ariaLabel}>
          {children}
        </div>
      )}
    </div>
  );
}
