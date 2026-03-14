interface SkeletonProps {
  height?: number | string
  width?: number | string
  borderRadius?: number | string
  style?: React.CSSProperties
}

export function Skeleton({ height = 20, width = '100%', borderRadius = 8, style }: SkeletonProps) {
  return (
    <div
      style={{
        height,
        width,
        borderRadius,
        background: 'linear-gradient(90deg, var(--card) 25%, var(--card2) 50%, var(--card) 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite linear',
        ...style,
      }}
    />
  )
}
