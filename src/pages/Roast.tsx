import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useChannel } from '../context/ChannelContext'
import { askGroq, sanitize, GROQ_KEY_A } from '../lib/api'
import {
  calcUploadMetrics, calcBestPostingDay, calcHookTypes, calcAvgViews,
  safeInt, formatViews, engagementRate,
} from '../lib/calc'
import { Skeleton } from '../components/Skeleton'
import { ErrorCard } from '../components/ErrorCard'
import { Flame, ChevronDown, ChevronUp } from 'lucide-react'

interface Roast {
  insult: string
  realNumber: string
  fix: string
}

export default function Roast() {
  const { channel, videos, niche } = useChannel()
  const navigate = useNavigate()
  const [roasts, setRoasts] = useState<Roast[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showFixes, setShowFixes] = useState(false)
  const [fired, setFired] = useState(false)

  if (!channel || !videos.length) {
    return (
      <div className="page-enter" style={{ padding: 40, textAlign: 'center', color: 'var(--sub)' }}>
        <p>No channel loaded. <button onClick={() => navigate({ to: '/onboarding' })} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, textDecoration: 'underline' }}>Go back</button></p>
      </div>
    )
  }

  const avgV = calcAvgViews(videos)
  const uploadM = calcUploadMetrics(videos)
  const bestDay = calcBestPostingDay(videos)
  const hooks = calcHookTypes(videos)
  const topVid = [...videos].sort((a, b) => safeInt(b.statistics?.viewCount) - safeInt(a.statistics?.viewCount))[0]
  const worstVid = [...videos].sort((a, b) => safeInt(a.statistics?.viewCount) - safeInt(b.statistics?.viewCount))[0]
  const avgEng = videos.reduce((s, v) => s + engagementRate(v), 0) / Math.max(videos.length, 1)
  const subs = safeInt(channel.statistics?.subscriberCount)

  async function runRoast() {
    setLoading(true)
    setError(null)
    setFired(false)
    setRoasts([])

    try {
      const sName = sanitize(channel?.snippet?.title || 'Unknown', 40)
      const sTop = sanitize(topVid?.snippet?.title || 'Unknown', 50)
      const sWorst = sanitize(worstVid?.snippet?.title || 'Unknown', 50)
      const sHookBest = sanitize(hooks[0]?.type || 'Question', 20)
      const sHookWorst = sanitize(hooks[hooks.length - 1]?.type || 'Other', 20)

      const result = await askGroq(
        'You are a brutally funny but helpful YouTube critic. Roast this channel with 5 specific, funny insults. Each MUST use a real number from the data. After each roast, give the exact fix. Return valid JSON only.',
        `Channel: "${sName}" (${formatViews(subs)} subs, ${sanitize(niche, 30)} niche)
Avg views: ${formatViews(Math.round(avgV))}
Engagement: ${avgEng.toFixed(2)}%
Upload gap: ${Math.round(uploadM.avgGap)} days (${uploadM.consistency.toFixed(0)}% consistent)
Best day: ${bestDay.best.day} (${formatViews(Math.round(bestDay.best.avg))} avg) but posts on ${bestDay.worst?.day} (${formatViews(Math.round(bestDay.worst?.avg ?? 0))} avg) too
Best hook: ${sHookBest}, Worst hook: ${sHookWorst}
Top video: "${sTop}" (${formatViews(safeInt(topVid?.statistics?.viewCount))} views)
Worst video: "${sWorst}" (${formatViews(safeInt(worstVid?.statistics?.viewCount))} views)
Videos: ${videos.length}
JSON: [{"insult":string,"realNumber":string,"fix":string}] — exactly 5 roasts, each insult max 60 words, each must reference a real number from above`,
        true,
        GROQ_KEY_A
      ) as Roast[]

      setRoasts(Array.isArray(result) ? result : [])
      setFired(true)
    } catch (e: unknown) {
      const msg = (e as Error).message || 'Something went wrong'
      if (msg.includes('decommissioned')) setError('AI model updated — refresh')
      else if (msg.includes('rate_limit')) setError('Too many requests — wait 30s then retry')
      else setError(msg)
      console.error('Full error:', e)
    } finally {
      setLoading(false)
    }
  }

  const flameColors = ['var(--red)', 'var(--gold)', 'var(--pink)', 'var(--red)', 'var(--gold)']

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 900, color: 'var(--text)', marginBottom: 4 }}>
          🔥 Channel Roast
        </h1>
        <p style={{ color: 'var(--sub)', fontSize: 14 }}>Brutal honest feedback with real numbers. Everything has a fix.</p>
      </div>

      {/* Pre-roast section */}
      {!fired && !loading && (
        <div style={{
          padding: '48px 32px',
          background: 'linear-gradient(135deg, rgba(239,68,68,0.1), rgba(245,158,11,0.06))',
          border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 20,
          textAlign: 'center',
        }}>
          {/* Fire animation */}
          <div style={{ fontSize: 72, marginBottom: 20, animation: 'pulse-opacity 2s ease infinite' }}>
            🔥
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900, color: 'var(--text)', marginBottom: 8 }}>
            Ready to hear the truth?
          </div>
          <div style={{ fontSize: 14, color: 'var(--sub)', marginBottom: 32, maxWidth: 400, margin: '0 auto 32px' }}>
            Every roast uses a real number from your channel data. No generic insults. Every problem has an exact fix.
          </div>
          <button
            onClick={runRoast}
            style={{
              padding: '16px 40px',
              background: 'linear-gradient(135deg, var(--red), var(--gold))',
              border: 'none', borderRadius: 12,
              fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 18, color: 'white',
              cursor: 'pointer',
              boxShadow: '0 8px 32px rgba(239,68,68,0.3)',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(239,68,68,0.4)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 8px 32px rgba(239,68,68,0.3)' }}
          >
            Roast My Channel 🔥
          </button>
          <div style={{ marginTop: 16, fontSize: 12, color: 'var(--muted)' }}>
            Based on {videos.length} videos from {channel.snippet.title}
          </div>
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ textAlign: 'center', padding: 24 }}>
            <div style={{ fontSize: 48, marginBottom: 12, animation: 'pulse-opacity 0.8s ease infinite' }}>🔥</div>
            <div style={{ fontSize: 15, color: 'var(--sub)', fontWeight: 600 }}>Roasting {channel.snippet.title}...</div>
          </div>
          {[1, 2, 3].map(i => <Skeleton key={i} height={120} borderRadius={16} />)}
        </div>
      )}

      {error && <ErrorCard message={error} onRetry={runRoast} />}

      {fired && roasts.length > 0 && (
        <>
          {/* Roast header */}
          <div style={{
            padding: '20px 24px',
            background: 'linear-gradient(135deg, rgba(239,68,68,0.1), rgba(245,158,11,0.06))',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
          }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 900, color: 'var(--red)', marginBottom: 4 }}>
                🔥 {channel.snippet.title} — Roasted
              </div>
              <div style={{ fontSize: 13, color: 'var(--sub)' }}>5 brutal truths with exact fixes</div>
            </div>
            <button
              onClick={runRoast}
              style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: 'var(--red)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              Re-roast 🔥
            </button>
          </div>

          {/* Roast cards */}
          {roasts.map((roast, i) => (
            <div key={i} style={{
              padding: '22px 24px',
              background: 'var(--card)',
              border: `1px solid ${flameColors[i]}33`,
              borderLeft: `4px solid ${flameColors[i]}`,
              borderRadius: 16,
              animation: `fadeInUp 0.4s ease ${i * 0.15}s both`,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{ fontSize: 24, flexShrink: 0, marginTop: 2 }}>
                  {['💀', '🤦', '😬', '🫣', '🔥'][i] || '🔥'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', lineHeight: 1.5, marginBottom: 10 }}>
                    {roast.insult}
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: `${flameColors[i]}15`, border: `1px solid ${flameColors[i]}30`, borderRadius: 20, marginBottom: 12 }}>
                    <Flame size={12} style={{ color: flameColors[i] }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: flameColors[i] }}>{roast.realNumber}</span>
                  </div>
                  {showFixes && (
                    <div style={{
                      padding: '12px 16px', marginTop: 4,
                      background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 10,
                      animation: 'fadeInUp 0.2s ease both',
                    }}>
                      <div style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>
                        THE FIX
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text)' }}>{roast.fix}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Show fixes toggle */}
          <button
            onClick={() => setShowFixes(!showFixes)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '14px 24px', borderRadius: 12,
              border: '1px solid var(--border)',
              background: showFixes ? 'rgba(16,185,129,0.1)' : 'var(--card)',
              color: showFixes ? 'var(--green)' : 'var(--text)',
              fontWeight: 700, fontSize: 15, cursor: 'pointer',
              transition: 'all 0.2s',
              fontFamily: 'var(--font-display)',
            }}
          >
            {showFixes
              ? <><ChevronUp size={18} /> Hide Fixes</>
              : <><ChevronDown size={18} /> Show All Fixes (tap to stop crying)</>
            }
          </button>
        </>
      )}
    </div>
  )
}
