interface MetricCardProps {
  label: string;
  value: string | number;
  tone?: "default" | "warning" | "danger";
}

export function MetricCard({ label, value, tone = "default" }: MetricCardProps) {
  return (
    <section className={`metric-card metric-card--${tone}`}>
      <span className="metric-card__label">{label}</span>
      <strong className="metric-card__value">{value}</strong>
    </section>
  );
}

