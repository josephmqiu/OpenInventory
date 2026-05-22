import { useTT } from "../hooks/useTT";

interface UpdateChipProps {
  onRestart: () => void;
  onDismiss: () => void;
}

/**
 * Ambient "update ready" chip for the topbar control cluster. Rendered by the
 * parent only when an update has finished downloading and the chip hasn't been
 * dismissed this session. Amber = "something to act on" (DESIGN.md).
 */
export function UpdateChip({ onRestart, onDismiss }: UpdateChipProps) {
  const tt = useTT();
  return (
    <span className="update-chip" data-testid="update-chip">
      <span className="update-chip__dot" aria-hidden="true" />
      <span>{tt("updateChipReady", "Update ready")}</span>
      <button className="update-chip__action" onClick={onRestart} type="button">
        {tt("updateChipRestart", "Restart")}
      </button>
      <button
        className="update-chip__dismiss"
        onClick={onDismiss}
        type="button"
        aria-label={tt("updateChipDismiss", "Dismiss until next launch")}
        title={tt("updateChipDismiss", "Dismiss until next launch")}
      >
        &times;
      </button>
    </span>
  );
}
