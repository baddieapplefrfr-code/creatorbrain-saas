interface MiniBarProps {
  value: number
  max?: number
  color?: string
  height?: number
}

export function MiniBar({ value, max = 100, color = "var(--accent)", height = 4 }: MiniBarProps) {
  const pct = Math.min(Math.max((value / Math.max(max, 1)) * 100, 0), 100)
  return (
    <div style={{
      width: "100%", height,
      background: "var(--border)", borderRadius: height,
      overflow: "hidden", marginTop: 4
    }}>
      <div style={{
        width: `${pct}%`, height: "100%",
        background: color, borderRadius: height,
        transition: "width 0.8s ease"
      }} />
    </div>
  )
}
