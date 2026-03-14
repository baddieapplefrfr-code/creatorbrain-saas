import { AlertTriangle, RefreshCw } from 'lucide-react'

interface ErrorCardProps {
  message: string
  onRetry?: () => void
}

export function ErrorCard({ message, onRetry }: ErrorCardProps) {
  const msg = message.includes('decommissioned')
    ? 'AI model updated — refresh'
    : message.includes('rate_limit')
    ? 'Too many requests — wait 30s'
    : message.includes('quotaExceeded')
    ? 'YouTube daily limit reached'
    : message

  return (
    <div style={{
      background: 'rgba(239,68,68,0.07)',
      border: '1px solid rgba(239,68,68,0.25)',
      borderRadius: 10,
      padding: '8px 14px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      minHeight: 44,
    }}>
      <AlertTriangle size={15} style={{ color: 'var(--red)', flexShrink: 0 }} />
      <span style={{ color: 'var(--red)', fontSize: 13, flex: 1, lineHeight: 1.3 }}>{msg}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 12px',
            background: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 6,
            color: 'var(--red)',
            fontSize: 12,
            fontFamily: 'var(--font-body)',
            fontWeight: 600,
            flexShrink: 0,
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={12} />
          Retry
        </button>
      )}
    </div>
  )
}
