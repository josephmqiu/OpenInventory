interface MetricCardProps {
  label: string;
  value: string | number;
  tone?: "default" | "warning" | "danger";
  onClick?: () => void;
}

export function MetricCard({ label, value, tone = "default", onClick }: MetricCardProps) {
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
    </section>
  );
}

