import { Skeleton } from './Skeleton'

interface MetricCardProps {
  label: string
  value: string | number
  benchmark?: string
  action?: string
  color?: string
  loading?: boolean
}

export function MetricCard({ label, value, benchmark, action, color, loading }: MetricCardProps) {
  if (loading) return <Skeleton height={120} borderRadius={16} />

  return (
    <div className="card-base" style={{ padding: "20px 22px" }}>
      <div className="label-upper" style={{ marginBottom: 8 }}>{label}</div>
      <div className="metric-value" style={{ color: color || "var(--text)", marginBottom: 8 }}>
        {value}
      </div>
      {benchmark && (
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>{benchmark}</div>
      )}
      {action && (
        <div style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>→ {action}</div>
      )}
    </div>
  )
}
