import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useChannel } from '../context/ChannelContext'
import { ScoreRing } from './ScoreRing'
import { MiniBar } from './MiniBar'
import { calcMomentumScore, calcUploadMetrics, formatSubs, safeInt } from '../lib/calc'
import { Moon, Sun, LogOut } from 'lucide-react'

const NAV_ITEMS = [
  { emoji: '⚡', label: 'Dashboard',        href: '/dashboard' },
  { emoji: '📋', label: 'Weekly Brief',     href: '/brief' },
  { emoji: '🔬', label: 'Video Autopsy',    href: '/autopsy' },
  { emoji: '🔥', label: 'Trend Interceptor',href: '/trends' },
  { emoji: '🧬', label: 'Viral Patterns',   href: '/viral' },
  { emoji: '🪞', label: 'Channel Twin',     href: '/twin' },
  { emoji: '📊', label: 'Insights Cockpit', href: '/insights' },
  { emoji: '👁️', label: 'Competitor Spy',   href: '/competitor' },
  { emoji: '💰', label: 'Revenue & Growth', href: '/revenue' },
  { emoji: '💬', label: 'Comment Intel',    href: '/comments' },
  { emoji: '📚', label: 'Series Planner',   href: '/series' },
  { emoji: '✍️', label: 'Script Generator', href: '/script' },
  { emoji: '🪝', label: 'Hook Library',     href: '/hooks' },
  { emoji: '📅', label: 'Upload Calendar',  href: '/calendar' },
  { emoji: '✅', label: 'Pre-Post Checker', href: '/checker' },
  { emoji: '🤝', label: 'Collab Finder',    href: '/collab' },
  { emoji: '🔥', label: 'Channel Roast',    href: '/roast' },
  { emoji: '🧠', label: 'Max AI',           href: '/chat' },
]

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
}

function useTheme() {
  const [isDark, setIsDark] = useState(() => !document.documentElement.classList.contains('light'))

  function toggle() {
    const next = !isDark
    setIsDark(next)
    if (next) {
      document.documentElement.classList.remove('light')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.add('light')
      localStorage.setItem('theme', 'light')
    }
  }

  useEffect(() => {
    const saved = localStorage.getItem('theme')
    if (saved === 'light') {
      document.documentElement.classList.add('light')
      setIsDark(false)
    } else {
      document.documentElement.classList.remove('light')
      setIsDark(true)
    }
  }, [])

  return { isDark, toggle }
}

export function Sidebar() {
  const { channel, videos, reset } = useChannel()
  const location = useLocation()
  const navigate = useNavigate()
  const { isDark, toggle } = useTheme()

  const uploadMetrics = calcUploadMetrics(videos)
  const momentum = calcMomentumScore(videos, uploadMetrics)

  const momentumColor =
    momentum >= 70 ? 'var(--green)' :
    momentum >= 40 ? 'var(--gold)' :
    'var(--red)'

  const subsCount = safeInt(channel?.statistics?.subscriberCount)
  const thumbUrl = channel?.snippet?.thumbnails?.default?.url
  const channelName = channel?.snippet?.title ?? ''

  function handleReset() {
    reset()
    navigate({ to: '/onboarding' })
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sidebar-root">
        {/* ── Logo ── */}
        <div className="sidebar-logo">
          <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 22 }}>
            Creator
          </span>
          <span style={{ color: 'var(--pink)', fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 22 }}>
            Brain
          </span>
        </div>

        {/* ── Channel pill ── */}
        {channel && (
          <div className="sidebar-channel-pill">
            {/* Avatar */}
            <div style={{ flexShrink: 0 }}>
              {thumbUrl ? (
                <img
                  src={thumbUrl}
                  alt={channelName}
                  style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border2)' }}
                />
              ) : (
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'var(--grad)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 800, color: '#fff',
                  flexShrink: 0
                }}>
                  {getInitials(channelName)}
                </div>
              )}
            </div>
            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13, fontWeight: 700, color: 'var(--text)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
              }}>
                {channelName}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                {formatSubs(subsCount)}
              </div>
            </div>
            {/* Score badge */}
            <ScoreRing score={momentum} size={38} stroke={3} />
          </div>
        )}

        {/* ── Nav ── */}
        <nav className="sidebar-nav">
          {NAV_ITEMS.map(item => {
            const isActive = location.pathname === item.href
            return (
              <Link
                key={item.href}
                to={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: isActive ? '10px 16px 10px 13px' : '10px 16px',
                  borderRadius: 10,
                  margin: '2px 8px',
                  fontSize: 14,
                  color: isActive ? 'var(--accent)' : 'var(--sub)',
                  fontWeight: isActive ? 700 : 400,
                  transition: 'all 0.2s',
                  cursor: 'pointer',
                  textDecoration: 'none',
                  borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                  background: isActive ? 'rgba(124,58,237,0.10)' : 'transparent',
                }}
                className="sidebar-nav-link"
              >
                <span className="sidebar-nav-emoji" style={{ fontSize: 16, flexShrink: 0, lineHeight: 1 }}>
                  {item.emoji}
                </span>
                <span className="sidebar-nav-label">
                  {item.label}
                </span>
              </Link>
            )
          })}
        </nav>

        {/* ── Bottom section ── */}
        <div className="sidebar-bottom">
          {/* Momentum meter */}
          {channel && (
            <div style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '10px 12px',
              marginBottom: 10
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  Momentum
                </span>
                <span style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-display)', color: momentumColor }}>
                  {momentum}
                </span>
              </div>
              <MiniBar value={momentum} height={5} />
            </div>
          )}

          {/* Theme toggle */}
          <button
            onClick={toggle}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '9px 12px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--sub)',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s',
              marginBottom: 8,
            }}
            className="sidebar-icon-btn"
          >
            {isDark
              ? <Sun size={15} style={{ flexShrink: 0 }} />
              : <Moon size={15} style={{ flexShrink: 0 }} />
            }
            <span className="sidebar-nav-label">
              {isDark ? 'Light mode' : 'Dark mode'}
            </span>
          </button>

          {/* Change channel */}
          {channel && (
            <button
              onClick={handleReset}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '9px 12px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--muted)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              className="sidebar-icon-btn"
            >
              <LogOut size={15} style={{ flexShrink: 0 }} />
              <span className="sidebar-nav-label">Change Channel</span>
            </button>
          )}
        </div>
      </aside>

      {/* Styles injected */}
      <style>{`
        .sidebar-root {
          position: fixed;
          top: 0;
          left: 0;
          width: 230px;
          height: 100vh;
          background: var(--surface);
          border-right: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          z-index: 100;
          overflow: hidden;
        }

        .sidebar-logo {
          padding: 20px 16px 12px;
          display: flex;
          align-items: center;
          gap: 0;
          flex-shrink: 0;
          border-bottom: 1px solid var(--border);
        }

        .sidebar-channel-pill {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 14px;
          margin: 10px 8px;
          border-radius: 12px;
          background: var(--card);
          border: 1px solid var(--border);
          flex-shrink: 0;
        }

        .sidebar-nav {
          flex: 1;
          overflow-y: auto;
          padding: 6px 0;
        }

        .sidebar-nav-link:hover {
          background: rgba(124,58,237,0.05) !important;
          color: var(--text) !important;
        }

        .sidebar-icon-btn:hover {
          background: rgba(124,58,237,0.05) !important;
          color: var(--text) !important;
          border-color: var(--border2) !important;
        }

        .sidebar-bottom {
          padding: 12px;
          border-top: 1px solid var(--border);
          flex-shrink: 0;
        }

        @media (max-width: 767px) {
          .sidebar-root {
            width: 60px;
          }
          .sidebar-logo {
            justify-content: center;
            padding: 16px 8px;
          }
          .sidebar-logo span:last-child {
            display: none;
          }
          .sidebar-logo span:first-child {
            font-size: 18px;
          }
          .sidebar-channel-pill {
            justify-content: center;
            padding: 8px;
            margin: 8px 4px;
          }
          .sidebar-nav-label {
            display: none;
          }
          .sidebar-nav-link {
            justify-content: center;
            padding: 10px 8px !important;
            margin: 2px 4px !important;
            border-left: none !important;
          }
          .sidebar-nav-emoji {
            font-size: 18px !important;
          }
          .sidebar-bottom {
            padding: 8px 4px;
          }
          .sidebar-icon-btn {
            justify-content: center;
            padding: 9px 8px !important;
          }
        }
      `}</style>
    </>
  )
}
