import { useState } from 'react'
import { ChevronDown, ChevronUp, CheckCircle } from 'lucide-react'

interface DiagnosisCardProps {
  title: string
  severity: "critical" | "warning"
  proof: string
  whyItHurts: string
  fixSteps: string[]
  expectedResult: string
}

export function DiagnosisCard({ title, severity, proof, whyItHurts, fixSteps, expectedResult }: DiagnosisCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [fixed, setFixed] = useState(false)
  const color = severity === "critical" ? "var(--red)" : "var(--gold)"

  if (fixed) return (
    <div style={{
      background: "rgba(16,185,129,0.08)",
      border: "1px solid rgba(16,185,129,0.3)",
      borderRadius: 12, padding: "12px 16px",
      display: "flex", alignItems: "center", gap: 10
    }}>
      <CheckCircle size={18} style={{ color: "var(--green)" }} />
      <span style={{ color: "var(--green)", fontSize: 14, fontWeight: 600 }}>{title} — Marked as Fixed</span>
    </div>
  )

  return (
    <div style={{
      background: "var(--card)",
      border: `1px solid ${severity === "critical" ? "rgba(239,68,68,0.4)" : "rgba(245,158,11,0.4)"}`,
      borderRadius: 12, overflow: "hidden",
      transition: "all 0.2s ease"
    }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          padding: "14px 18px", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 12
        }}
      >
        <span style={{
          padding: "2px 10px", borderRadius: 20,
          background: severity === "critical" ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)",
          color, fontSize: 11, fontWeight: 700, textTransform: "uppercase", flexShrink: 0
        }}>{severity}</span>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{title}</span>
        <span style={{ fontSize: 12, color: "var(--sub)", marginRight: 8 }}>{proof}</span>
        {expanded ? <ChevronUp size={16} style={{ color: "var(--sub)" }} /> : <ChevronDown size={16} style={{ color: "var(--sub)" }} />}
      </div>

      {expanded && (
        <div style={{ padding: "0 18px 16px", borderTop: "1px solid var(--border)" }}>
          <p style={{ fontSize: 13, color: "var(--sub)", margin: "12px 0 10px" }}>{whyItHurts}</p>
          <div style={{ marginBottom: 12 }}>
            {fixSteps.map((step, i) => (
              <div key={i} style={{ display: "flex", gap: 10, marginBottom: 6 }}>
                <span style={{
                  width: 22, height: 22, borderRadius: "50%",
                  background: "rgba(124,58,237,0.2)", color: "var(--accent)",
                  fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                }}>{i+1}</span>
                <span style={{ fontSize: 13, color: "var(--text)", paddingTop: 2 }}>{step}</span>
              </div>
            ))}
          </div>
          <div style={{
            padding: "8px 14px",
            background: "rgba(16,185,129,0.08)",
            borderRadius: 8, fontSize: 12,
            color: "var(--green)", marginBottom: 10
          }}>Expected: {expectedResult}</div>
          <button
            onClick={() => setFixed(true)}
            style={{
              padding: "6px 16px", borderRadius: 8,
              background: "rgba(16,185,129,0.15)",
              border: "1px solid rgba(16,185,129,0.4)",
              color: "var(--green)", fontSize: 12, fontWeight: 600
            }}
          >Mark as Fixed</button>
        </div>
      )}
    </div>
  )
}
