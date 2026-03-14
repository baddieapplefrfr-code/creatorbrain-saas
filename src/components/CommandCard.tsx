import { Skeleton } from './Skeleton'

interface CommandCardProps {
  command: string
  why: string
  impact: string
  priority: "Do Today" | "Do This Week" | "Do This Month"
  loading?: boolean
}

const PRIORITY_STYLES: Record<string, { bg: string; color: string }> = {
  "Do Today":      { bg: "var(--red)",   color: "#fff" },
  "Do This Week":  { bg: "var(--gold)",  color: "#1a0f2e" },
  "Do This Month": { bg: "var(--green)", color: "#1a0f2e" },
}

export function CommandCard({ command, why, impact, priority, loading }: CommandCardProps) {
  if (loading) return <Skeleton height={110} borderRadius={16} />

  const ps = PRIORITY_STYLES[priority] || PRIORITY_STYLES["Do This Week"]

  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(124,58,237,0.15), rgba(244,63,142,0.08))",
      border: "1px solid rgba(124,58,237,0.4)",
      borderLeft: "4px solid var(--pink)",
      borderRadius: 16,
      padding: "20px 24px",
      animation: "glow-anim 4s ease infinite",
      marginBottom: 24
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span className="label-upper" style={{ color: "var(--sub)" }}>🎯 YOUR ACTION</span>
        <span style={{
          padding: "3px 10px",
          borderRadius: 20,
          fontSize: 11,
          fontWeight: 700,
          fontFamily: "var(--font-body)",
          background: ps.bg,
          color: ps.color
        }}>{priority}</span>
      </div>
      <div style={{
        fontFamily: "var(--font-display)",
        fontWeight: 900,
        fontSize: 18,
        lineHeight: 1.4,
        color: "var(--text)",
        marginBottom: 10
      }}>{command}</div>
      <div style={{ fontSize: 13, color: "var(--sub)", marginBottom: 6 }}>
        <span style={{ fontWeight: 600, color: "var(--sub)" }}>WHY: </span>{why}
      </div>
      <div style={{ fontSize: 13, color: "var(--green)" }}>
        <span style={{ fontWeight: 600 }}>IMPACT: </span>{impact}
      </div>
    </div>
  )
}
