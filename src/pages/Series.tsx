import { useState, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useChannel } from '../context/ChannelContext'
import { askGroq, sanitize, GROQ_KEY_B } from '../lib/api'
import {
  calcBestPostingDay, calcBestLength, calcHookTypes, calcUploadMetrics,
  nextOptimalDateStr, formatViews, safeInt,
} from '../lib/calc'
import { CommandCard } from '../components/CommandCard'
import { Skeleton } from '../components/Skeleton'
import { ErrorCard } from '../components/ErrorCard'
import { Copy, Check, Send, RefreshCw } from 'lucide-react'

interface Episode {
  number: number
  title: string
  hook: string
  cliffhanger: string
  keyMoment: string
}

interface SeriesPlan {
  seriesName: string
  premise: string
  whyItWorks: string
  episodes: Episode[]
  uploadSchedule: string
  expectedOutcome: string
}

function CopyBtn({ text, accent }: { text: string; accent?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }
  return (
    <button onClick={copy} style={{
      background: 'none', border: 'none', cursor: 'pointer',
      color: copied ? 'var(--green)' : (accent || 'var(--sub)'),
      display: 'flex', alignItems: 'center', gap: 4, fontSize: 12,
      padding: '4px 8px', borderRadius: 6, transition: 'all 0.2s',
      whiteSpace: 'nowrap',
    }}>
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

export default function Series() {
  const { channel, videos, niche } = useChannel()
  const navigate = useNavigate()
  const [topic, setTopic] = useState('')
  const [episodeCount, setEpisodeCount] = useState(6)
  const [plan, setPlan] = useState<SeriesPlan | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async () => {
    if (!channel || !topic.trim()) return
    setLoading(true)
    setError(null)

    try {
      const hooks = calcHookTypes(videos)
      const lengths = calcBestLength(videos)
      const bestDay = calcBestPostingDay(videos)
      const uploadM = calcUploadMetrics(videos)

      const result = await askGroq(
        'YouTube content strategist. Build compelling video series. Return JSON only.',
        `Creator: "${sanitize(channel.snippet.title, 30)}", niche: ${niche}
Best hook type: ${hooks[0]?.type || 'Question'}
Best video length: ${lengths[0]?.label || '8-12 min'}
Series topic: "${sanitize(topic, 80)}"
Episodes: ${episodeCount}
Upload gap: ${Math.round(uploadM.avgGap)} days
JSON:{"seriesName":str,"premise":str,"whyItWorks":str,"episodes":[{"number":n,"title":str,"hook":str,"cliffhanger":str,"keyMoment":str}],"uploadSchedule":str,"expectedOutcome":str}`,
        true,
        GROQ_KEY_B
      ) as SeriesPlan

      setPlan(result)
    } catch (e: unknown) {
      const msg = (e as Error).message || 'Something went wrong'
      if (msg.includes('decommissioned')) setError('AI model updated — refresh')
      else if (msg.includes('rate_limit')) setError('Too many requests — wait 30s')
      else setError(msg)
      console.error('Full error:', e)
    } finally {
      setLoading(false)
    }
  }, [channel, videos, niche, topic, episodeCount])

  if (!channel) {
    return (
      <div className="page-enter" style={{ padding: 40, textAlign: 'center', color: 'var(--sub)' }}>
        <p>No channel loaded. <button onClick={() => navigate({ to: '/onboarding' })} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, textDecoration: 'underline' }}>Go back</button></p>
      </div>
    )
  }

  if (videos.length < 3) {
    return (
      <div className="page-enter">
        <div className="card-base" style={{ padding: '32px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📚</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, color: 'var(--text)', marginBottom: 8 }}>Not Enough Data</h2>
          <p style={{ color: 'var(--sub)', fontSize: 14 }}>Series Planner needs at least 3 videos to optimise your content arc.</p>
        </div>
      </div>
    )
  }

  const bestDay = calcBestPostingDay(videos)
  const uploadM = calcUploadMetrics(videos)

  // Build upload dates for each episode
  const buildUploadDates = (): string[] => {
    if (!plan) return []
    const dates: string[] = []
    let base = new Date(nextOptimalDateStr(bestDay.best.day))
    for (let i = 0; i < plan.episodes.length; i++) {
      if (i === 0) {
        dates.push(base.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' }))
      } else {
        const next = new Date(base)
        next.setDate(next.getDate() + Math.round(uploadM.avgGap))
        base = next
        dates.push(base.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' }))
      }
    }
    return dates
  }

  const sendToScript = () => {
    if (!plan) return
    sessionStorage.setItem('script_prefill', plan.episodes[0]?.title || '')
    navigate({ to: '/script' })
  }

  const copyAllTitles = () => {
    if (!plan) return
    navigator.clipboard.writeText(plan.episodes.map(e => `${e.number}. ${e.title}`).join('\n'))
  }

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 900, color: 'var(--text)', marginBottom: 4 }}>
          📚 Series Planner
        </h1>
        <p style={{ color: 'var(--sub)', fontSize: 14 }}>Plan a content arc that builds loyal audiences 40% faster than standalone videos</p>
      </div>

      {!plan && (
        <CommandCard
          command={`Plan your first series this ${bestDay.best.day} — series build loyalty 40% faster than standalone videos`}
          why="Viewers who watch a series return for every episode, growing your subscriber retention automatically"
          impact="Series creators see 2-3x higher subscriber conversion than one-off video creators"
          priority="Do This Week"
        />
      )}

      {/* Form */}
      <div className="card-base" style={{ padding: '24px 28px' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: 'var(--text)', marginBottom: 20 }}>
          Design Your Series
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--sub)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 8 }}>
              Series Topic
            </label>
            <input
              type="text"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder={`e.g. "Complete React Course" or "My ${niche} Journey"`}
              onKeyDown={e => e.key === 'Enter' && !loading && topic.trim() && run()}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--sub)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 8 }}>
              Number of Episodes
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[3, 4, 5, 6, 8, 10, 12].map(n => (
                <button
                  key={n}
                  onClick={() => setEpisodeCount(n)}
                  style={{
                    padding: '8px 16px', borderRadius: 8, border: '1px solid',
                    borderColor: episodeCount === n ? 'var(--accent)' : 'var(--border)',
                    background: episodeCount === n ? 'rgba(124,58,237,0.15)' : 'var(--card2)',
                    color: episodeCount === n ? 'var(--accent)' : 'var(--sub)',
                    fontWeight: episodeCount === n ? 700 : 400,
                    fontSize: 14, cursor: 'pointer', transition: 'all 0.2s',
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={run}
            disabled={loading || !topic.trim()}
            style={{
              padding: '14px 24px', borderRadius: 10, border: 'none',
              background: loading || !topic.trim() ? 'var(--border)' : 'var(--grad)',
              color: loading || !topic.trim() ? 'var(--muted)' : 'white',
              fontWeight: 700, fontSize: 15, cursor: loading || !topic.trim() ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-display)', transition: 'all 0.2s',
              width: 'fit-content', display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            <RefreshCw size={15} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {loading ? 'Building series plan...' : '🎬 Plan My Series'}
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Skeleton height={110} borderRadius={16} />
          <Skeleton height={90} borderRadius={16} />
          {[...Array(3)].map((_, i) => <Skeleton key={i} height={140} borderRadius={16} />)}
        </div>
      )}

      {error && <ErrorCard message={error} onRetry={run} />}

      {plan && !loading && (() => {
        const uploadDates = buildUploadDates()
        return (
          <>
            {/* CommandCard */}
            <CommandCard
              command={`Start your series this ${bestDay.best.day}: Episode 1 — '${plan.episodes[0]?.title}'. Post every ${Math.round(uploadM.avgGap)} days.`}
              why={plan.whyItWorks}
              impact={plan.expectedOutcome}
              priority="Do This Week"
            />

            {/* Series Identity */}
            <div className="card-base" style={{ padding: '28px 32px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
              <div style={{
                position: 'absolute', inset: 0, opacity: 0.03,
                background: 'var(--grad)', pointerEvents: 'none',
              }} />
              <div style={{ fontSize: 11, color: 'var(--sub)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 12 }}>
                YOUR SERIES
              </div>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 900,
                background: 'var(--grad)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                backgroundClip: 'text', marginBottom: 16, lineHeight: 1.2,
              }}>
                {plan.seriesName}
              </div>
              <div style={{
                padding: '14px 18px', background: 'var(--card2)',
                border: '1px solid var(--border)', borderLeft: '3px solid var(--accent)',
                borderRadius: 10, fontSize: 15, color: 'var(--sub)', lineHeight: 1.6,
                textAlign: 'left', marginBottom: 14, maxWidth: 640, margin: '0 auto 14px',
              }}>
                {plan.premise}
              </div>
              <div style={{
                padding: '12px 16px', background: 'rgba(16,185,129,0.08)',
                border: '1px solid rgba(16,185,129,0.25)', borderLeft: '3px solid var(--green)',
                borderRadius: 10, fontSize: 14, color: 'var(--text)', lineHeight: 1.5,
                textAlign: 'left', maxWidth: 640, margin: '0 auto 16px',
              }}>
                <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: 4 }}>
                  WHY IT WORKS
                </span>
                {plan.whyItWorks}
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <span style={{ padding: '6px 14px', background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 20, fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>
                  📅 {plan.uploadSchedule}
                </span>
                <span style={{ padding: '6px 14px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 20, fontSize: 13, color: 'var(--green)', fontWeight: 600 }}>
                  🎬 {plan.episodes.length} Episodes
                </span>
              </div>
            </div>

            {/* Episode Timeline */}
            <div className="card-base" style={{ padding: '24px 28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: 'var(--text)' }}>
                  Episode Arc
                </h2>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={copyAllTitles}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 14px', borderRadius: 8,
                      border: '1px solid var(--border)', background: 'var(--card2)',
                      color: 'var(--sub)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    <Copy size={13} /> Copy All Titles
                  </button>
                  <button
                    onClick={sendToScript}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 14px', borderRadius: 8,
                      border: '1px solid rgba(124,58,237,0.4)',
                      background: 'rgba(124,58,237,0.12)',
                      color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    <Send size={13} /> Send to Script Gen
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {plan.episodes.map((ep, i) => (
                  <div key={ep.number} style={{ display: 'flex', gap: 16 }}>
                    {/* Timeline spine */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                      <div style={{
                        width: 38, height: 38, borderRadius: '50%', flexShrink: 0, zIndex: 1,
                        background: i === 0 ? 'var(--grad)' : i === plan.episodes.length - 1 ? 'linear-gradient(135deg,#10B981,#06B6D4)' : 'var(--card2)',
                        border: `2px solid ${i === 0 ? 'var(--pink)' : i === plan.episodes.length - 1 ? 'var(--green)' : 'var(--border)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 14,
                        color: (i === 0 || i === plan.episodes.length - 1) ? 'white' : 'var(--sub)',
                      }}>
                        {ep.number}
                      </div>
                      {i < plan.episodes.length - 1 && (
                        <div style={{ width: 2, flex: 1, minHeight: 16, background: 'var(--border)', margin: '4px 0' }} />
                      )}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, paddingBottom: 24 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                        <div>
                          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--text)', lineHeight: 1.3, marginBottom: 2 }}>
                            {ep.title}
                          </div>
                          {uploadDates[i] && (
                            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
                              📅 {uploadDates[i]}
                            </div>
                          )}
                        </div>
                        <CopyBtn text={ep.title} />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                        <div style={{ padding: '10px 12px', background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 8 }}>
                          <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>🪝 HOOK</div>
                          <div style={{ fontSize: 12, color: 'var(--sub)', fontStyle: 'italic', lineHeight: 1.4 }}>{ep.hook}</div>
                        </div>
                        <div style={{ padding: '10px 12px', background: 'var(--card2)', border: '1px solid rgba(244,63,142,0.2)', borderRadius: 8 }}>
                          <div style={{ fontSize: 10, color: 'var(--gold)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>🎭 CLIFFHANGER</div>
                          <div style={{ fontSize: 12, color: 'var(--gold)', lineHeight: 1.4 }}>{ep.cliffhanger}</div>
                        </div>
                      </div>

                      <div style={{ padding: '10px 12px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8 }}>
                        <span style={{ fontSize: 10, color: 'var(--cyan)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>✨ KEY MOMENT: </span>
                        <span style={{ fontSize: 12, color: 'var(--text)' }}>{ep.keyMoment}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Expected outcome */}
            <div style={{
              padding: '20px 24px',
              background: 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(6,182,212,0.06))',
              border: '1px solid rgba(16,185,129,0.3)',
              borderRadius: 16,
            }}>
              <div style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 8 }}>
                🎯 EXPECTED OUTCOME
              </div>
              <div style={{ fontSize: 15, color: 'var(--text)', fontWeight: 600 }}>{plan.expectedOutcome}</div>
            </div>
          </>
        )
      })()}
    </div>
  )
}
