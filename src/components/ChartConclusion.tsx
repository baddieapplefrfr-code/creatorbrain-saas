interface ChartConclusionProps {
  text: string
}

export function ChartConclusion({ text }: ChartConclusionProps) {
  return (
    <div style={{
      marginTop: 10,
      padding: "10px 16px",
      background: "var(--surface)",
      borderRadius: 10,
      borderLeft: "3px solid var(--accent)",
      fontSize: 13,
      color: "var(--text)",
      lineHeight: 1.5
    }}>
      → {text}
    </div>
  )
}
