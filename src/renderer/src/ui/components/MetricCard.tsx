export type MetricDeltaTone = "neutral" | "success" | "danger" | "warning";

export interface MetricDelta {
  /** Pre-formatted delta text, e.g. "+12%" or "+¥4,200". */
  text: string;
  direction: "up" | "down" | "flat";
  /**
   * Color valence. Default "neutral" — for inventory movement/value, up is not
   * inherently good, so deltas stay muted (per DESIGN.md "color is rare"). Use
   * success/danger only for valence-clear metrics (e.g. alerts).
   */
  tone?: MetricDeltaTone;
}

interface MetricCardProps {
  label: string;
  value: string | number;
  tone?: "default" | "warning" | "danger";
  onClick?: () => void;
  /** Primary delta, rendered inside the card as part of the instrument band. */
  delta?: MetricDelta;
  /** Smaller secondary line beneath the delta (e.g. the YoY comparison). */
  subline?: string;
}

const ARROW: Record<"up" | "down" | "flat", string> = {
  up: "▲",
  down: "▼",
  flat: "–",
};

export function MetricCard({ label, value, tone = "default", onClick, delta, subline }: MetricCardProps) {
  return (
    <section
      className={`metric-card metric-card--${tone}${onClick ? " metric-card--clickable" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      aria-label={onClick ? label : undefined}
    >
      <span className="metric-card__label">{label}</span>
      <strong className="metric-card__value">{value}</strong>
      {delta && (
        <span className={`metric-card__delta metric-card__delta--${delta.tone ?? "neutral"}`}>
          <span aria-hidden="true">{ARROW[delta.direction]}</span> {delta.text}
        </span>
      )}
      {subline && <span className="metric-card__subline">{subline}</span>}
    </section>
  );
}
