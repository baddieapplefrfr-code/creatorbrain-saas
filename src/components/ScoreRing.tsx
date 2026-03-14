import { useEffect, useState } from 'react'

interface ScoreRingProps {
  score: number
  size?: number
  label?: string
  stroke?: number
}

export function ScoreRing({ score, size = 120, label, stroke = 8 }: ScoreRingProps) {
  const [animated, setAnimated] = useState(0)
  const color = score >= 70 ? "var(--green)" : score >= 40 ? "var(--gold)" : "var(--red)"
  const r = (size - stroke * 2) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (animated / 100) * circ

  useEffect(() => {
    const t = setTimeout(() => setAnimated(Math.min(Math.max(score, 0), 100)), 50)
    return () => clearTimeout(t)
  }, [score])

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle
          cx={size/2} cy={size/2} r={r}
          fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s ease" }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center"
      }}>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: size * 0.25, color }}>
          {Math.round(animated)}
        </span>
        {label && <span style={{ fontSize: size * 0.1, color: "var(--sub)", fontWeight: 600 }}>{label}</span>}
      </div>
    </div>
  )
}
