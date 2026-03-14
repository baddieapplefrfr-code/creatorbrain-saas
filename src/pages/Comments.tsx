import { useState, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useChannel } from '../context/ChannelContext'
import { youtubeCOMMENTS, askGroq, sanitize, GROQ_KEY_B } from '../lib/api'
import { safeInt } from '../lib/calc'
import { CommandCard } from '../components/CommandCard'
import { ScoreRing } from '../components/ScoreRing'
import { Skeleton } from '../components/Skeleton'
import { ErrorCard } from '../components/ErrorCard'
import { Copy, Check, RefreshCw, Star } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
interface TopEmotion {
  emotion: string
  percentage: number
  exampleQuote: string
}
interface WhatTheyLove {
  theme: string
  quote: string
  videoOpportunity: string
}
interface WhatTheyWant {
  surfaceRequest: string
  realDesire: string
  videoTitle: string
  urgency: 'high' | 'medium' | 'low'
}
interface Frustration {
  frustration: string
  quote: string
  fix: string
}
interface AudiencePersona {
  coreFear: string
  coreDesire: string
  whyTheyWatch: string
  whatWouldLoseThem: string
}
interface BestNextVideo {
  title: string
  why: string
}
interface ContentGap {
  gap: string
  demand: 'high' | 'medium' | 'low'
  title: string
}

interface PsychAnalysis {
  dominantFeeling: string
  audienceSummary: string
  topEmotions: TopEmotion[]
  whatTheyLove: WhatTheyLove[]
  whatTheyWant: WhatTheyWant[]
  whatFrustratesThem: Frustration[]
  loyaltyScore: number
  loyaltyInsight: string
  audiencePersona: AudiencePersona
  bestNextVideo: BestNextVideo
  contentGaps?: ContentGap[]
}

type Analysis = PsychAnalysis

// ─── Helpers ──────────────────────────────────────────────────────────────────
function emotionToColor(e: string): string {
  const s = (e || '').toLowerCase()
  if (/love|excit|happy|joy|amaz|enthus/.test(s)) return 'var(--green)'
  if (/angry|frustrat|annoy|mad/.test(s)) return 'var(--red)'
  if (/confus|lost|unsure|skeptic|doubt/.test(s)) return 'var(--gold)'
  if (/curious|interest|intrigu/.test(s)) return 'var(--cyan)'
  if (/inspir|surprise|shock/.test(s)) return 'var(--pink)'
  if (/gratitude|thank|appreciat/.test(s)) return 'var(--accent)'
  return 'var(--accent)'
}

const URGENCY_COLOR: Record<string, string> = {
  high: 'var(--red)',
  medium: 'var(--gold)',
  low: 'var(--muted)',
}
const URGENCY_BG: Record<string, string> = {
  high: 'rgba(239,68,68,0.12)',
  medium: 'rgba(245,158,11,0.12)',
  low: 'rgba(100,116,139,0.12)',
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        })
      }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '4px 10px', borderRadius: 6,
        background: copied ? 'rgba(16,185,129,0.1)' : 'rgba(6,182,212,0.08)',
        border: `1px solid ${copied ? 'rgba(16,185,129,0.3)' : 'rgba(6,182,212,0.2)'}`,
        color: copied ? 'var(--green)' : 'var(--cyan)',
        fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
      }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

// ─── Emotion Bar ──────────────────────────────────────────────────────────────
function EmotionBar({ emotion, percentage, exampleQuote }: TopEmotion) {
  const color = emotionToColor(emotion)
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', textTransform: 'capitalize' }}>{emotion}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color }}>{percentage}%</span>
      </div>
      <div style={{ height: 6, background: 'var(--border)', borderRadius: 4, overflow: 'hidden', marginBottom: 4 }}>
        <div style={{
          height: '100%', width: `${Math.min(percentage, 100)}%`,
          background: color, borderRadius: 4, transition: 'width 0.8s ease',
        }} />
      </div>
      {exampleQuote && (
        <div style={{ fontSize: 12, color: 'var(--sub)', fontStyle: 'italic', lineHeight: 1.4 }}>
          "{exampleQuote}"
        </div>
      )}
    </div>
  )
}

// ─── Want Card ────────────────────────────────────────────────────────────────
function WantCard({ item }: { item: WhatTheyWant }) {
  const urg = item.urgency || 'medium'
  return (
    <div style={{
      background: 'var(--card2)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '16px 18px',
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: 5 }}>
            What they ask for
          </div>
          <div style={{ fontSize: 13, color: 'var(--sub)', fontStyle: 'italic', lineHeight: 1.4 }}>
            "{item.surfaceRequest}"
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: 5 }}>
            What they actually need
          </div>
          <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 700, lineHeight: 1.4 }}>
            {item.realDesire}
          </div>
        </div>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px',
        background: 'rgba(6,182,212,0.07)', border: '1px solid rgba(6,182,212,0.2)',
        borderRadius: 8,
      }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 10, color: 'var(--cyan)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
            💡 VIDEO TITLE:{' '}
          </span>
          <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{item.videoTitle}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            padding: '2px 8px', borderRadius: 20,
            background: URGENCY_BG[urg],
            color: URGENCY_COLOR[urg],
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
          }}>{urg}</span>
          <CopyBtn text={item.videoTitle} />
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function Comments() {
  const { channel, videos } = useChannel()
  const navigate = useNavigate()
  const [analysis, setAnalysis] = useState<PsychAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [commentsCount, setCommentsCount] = useState(0)

  const run = useCallback(async () => {
    if (!channel || !videos.length) return
    setLoading(true)
    setError(null)

    try {
      const topVideos = [...videos]
        .sort((a, b) => safeInt(b.statistics?.viewCount) - safeInt(a.statistics?.viewCount))
        .slice(0, 5)

      const allComments: string[] = []
      for (const v of topVideos) {
        const videoId = typeof v.id === 'string' ? v.id : ''
        if (!videoId) continue
        try {
          const res = await youtubeCOMMENTS('commentThreads', {
            part: 'snippet',
            videoId,
            maxResults: '50',
            order: 'relevance',
          }) as { items?: Array<{ snippet?: { topLevelComment?: { snippet?: { textDisplay?: string } } } }> }
          const items = res.items ?? []
          items.forEach(item => {
            const text = item.snippet?.topLevelComment?.snippet?.textDisplay
            if (text) allComments.push(sanitize(text, 80))
          })
        } catch { /* skip disabled */ }
      }

      if (allComments.length < 10) {
        setError('Not enough comments to analyze — your videos need more engagement')
        return
      }
      setCommentsCount(allComments.length)

      const sample = allComments.slice(0, 200)
      const commentSample = sample.map((c, i) => `${i + 1}. ${c}`).join('\n').slice(0, 3000)
      const channelName = sanitize(channel.snippet.title, 35)

      const result = await askGroq(
        'You are an audience psychologist reading YouTube comments. Find emotions, desires, and fears. Be brutally specific. Reference actual comment text. Never give generic insights. Return valid JSON only.',
        `Channel: "${channelName}" (${allComments.length} total comments analyzed)\nComments:\n${commentSample}\nJSON:{"dominantEmotion":"str","dominantFeeling":"str","audienceSummary":"2 sentences who they are and why they watch","emotionBreakdown":[{"emotion":"str","pct":0,"quote":"exact quote from comments"}],"topEmotions":[{"emotion":"str","percentage":0,"exampleQuote":"exact quote"}],"deepDesires":[{"desire":"str","frequency":0,"surfaceRequest":"exact phrasing from comments","underlyingNeed":"the deeper need underneath","videoIdea":"exact video title to make about this"}],"whatTheyLove":[{"theme":"str","quote":"exact quote","videoOpportunity":"str"}],"whatTheyWant":[{"surfaceRequest":"exact phrasing","realDesire":"deeper need","videoTitle":"exact title","urgency":"high"}],"frustrations":[{"frustration":"str","frequency":0,"quote":"exact quote","fix":"specific thing creator can do"}],"whatFrustratesThem":[{"frustration":"str","quote":"exact quote","fix":"str"}],"loyaltyScore":0,"loyaltyInsight":"str","loyaltyRisk":"str","contentGaps":[{"gap":"str","demand":"high","title":"exact video title"}],"audiencePersona":{"age":"str","coreFear":"str","coreDesire":"str","whyTheyWatch":"str","whatWouldLoseThem":"str"},"bestNextVideo":{"title":"str","why":"references specific comments"}}`,
        true,
        GROQ_KEY_B
      ) as Analysis

      setAnalysis(result)
    } catch (e: unknown) {
      const msg = (e as Error).message || 'Something went wrong'
      if (msg.includes('decommissioned')) setError('AI model updated — refresh')
      else if (msg.includes('rate_limit')) setError('Too many requests — wait 30s')
      else if (msg.includes('quotaExceeded')) setError('YouTube daily limit reached')
      else setError(msg)
    } finally {
      setLoading(false)
    }
  }, [channel, videos])

  if (!channel || !videos.length) {
    return (
      <div className="page-enter" style={{ padding: 40, textAlign: 'center', color: 'var(--sub)' }}>
        <p>No channel loaded. <button onClick={() => navigate({ to: '/onboarding' })} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, textDecoration: 'underline' }}>Go back</button></p>
      </div>
    )
  }

  const emotionColor = emotionToColor(analysis?.dominantFeeling || '')

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 900, color: 'var(--text)', marginBottom: 4 }}>
            💬 Comment Intelligence
          </h1>
          <p style={{ color: 'var(--sub)', fontSize: 14 }}>What your audience feels, wants, and fears — decoded from real comments</p>
        </div>
        <button
          onClick={run}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '12px 20px', borderRadius: 10, border: 'none',
            background: loading ? 'var(--border)' : 'var(--grad)',
            color: loading ? 'var(--muted)' : 'white',
            fontWeight: 700, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-display)',
          }}
        >
          <RefreshCw size={15} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          {loading ? 'Reading comments...' : analysis ? 'Re-analyse' : '🧠 Analyse Comments'}
        </button>
      </div>

      {/* Pre-run prompt */}
      {!analysis && !loading && (
        <CommandCard
          command={`Decode what your ${videos.length} videos' audience actually wants — not what they say, what they need`}
          why="Surface comments reveal emotions. This analysis finds the real psychology underneath — the desires YouTube never tells you."
          impact="Know your audience's core fear and desire → make content that converts viewers to subscribers"
          priority="Do Today"
        />
      )}

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Skeleton height={110} borderRadius={16} />
          <Skeleton height={80} borderRadius={16} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Skeleton height={260} borderRadius={16} />
            <Skeleton height={260} borderRadius={16} />
          </div>
          <Skeleton height={200} borderRadius={16} />
          <Skeleton height={160} borderRadius={16} />
        </div>
      )}

      {error && <ErrorCard message={error} onRetry={run} />}

      {analysis && !loading && (
        <>
          {/* 1. AUDIENCE SUMMARY BANNER */}
          <div style={{
            padding: '24px 28px',
            background: `linear-gradient(135deg, ${emotionColor}1A, ${emotionColor}06)`,
            border: `1px solid ${emotionColor}44`,
            borderRadius: 16,
          }}>
            <div style={{ fontSize: 10, color: 'var(--sub)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 10 }}>
              DOMINANT FEELING IN {commentsCount} COMMENTS
            </div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '6px 18px', borderRadius: 30,
              background: emotionColor + '22',
              border: `1px solid ${emotionColor}55`,
              marginBottom: 12,
            }}>
              <Star size={14} style={{ color: emotionColor }} />
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900, color: emotionColor }}>
                {analysis.dominantFeeling}
              </span>
            </div>
            <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6, maxWidth: 680 }}>
              {analysis.audienceSummary}
            </p>
          </div>

          {/* 2. EMOTION BREAKDOWN — CSS bars, no Recharts */}
          <div className="card-base" style={{ padding: '24px 28px' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, color: 'var(--text)', marginBottom: 4 }}>
              Emotion Breakdown
            </h2>
            <p style={{ fontSize: 13, color: 'var(--sub)', marginBottom: 20 }}>How your audience actually feels — ranked by frequency</p>
            {(analysis.topEmotions || []).slice(0, 6).map((e, i) => (
              <EmotionBar key={i} {...e} />
            ))}
          </div>

          {/* 3. WHAT YOUR AUDIENCE WANTS — most important */}
          <div className="card-base" style={{ padding: '24px 28px' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, color: 'var(--text)', marginBottom: 4 }}>
              🔍 What They Actually Want
            </h2>
            <p style={{ fontSize: 13, color: 'var(--sub)', marginBottom: 20 }}>What they say vs what they actually need — and the exact video to make</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {(analysis.whatTheyWant || []).slice(0, 4).map((item, i) => (
                <WantCard key={i} item={item} />
              ))}
            </div>
          </div>

          {/* 4. WHAT THEY LOVE */}
          {(analysis.whatTheyLove || []).length > 0 && (
            <div className="card-base" style={{ padding: '24px 28px' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, color: 'var(--text)', marginBottom: 4 }}>
                ❤️ What They Love About You
              </h2>
              <p style={{ fontSize: 13, color: 'var(--sub)', marginBottom: 20 }}>Double down on these — they're why people subscribe</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {(analysis.whatTheyLove || []).slice(0, 3).map((l, i) => (
                  <div key={i} style={{
                    padding: '14px 16px',
                    background: 'var(--card2)', border: '1px solid rgba(16,185,129,0.2)',
                    borderLeft: '3px solid var(--green)',
                    borderRadius: 10,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)', marginBottom: 4 }}>{l.theme}</div>
                    <div style={{ fontSize: 12, color: 'var(--sub)', fontStyle: 'italic', marginBottom: 8 }}>"{l.quote}"</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, color: 'var(--cyan)', fontWeight: 700 }}>→ VIDEO OPPORTUNITY:</span>
                      <span style={{ fontSize: 12, color: 'var(--text)' }}>{l.videoOpportunity}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 5. FRUSTRATIONS */}
          {(analysis.whatFrustratesThem || []).length > 0 && (
            <div className="card-base" style={{ padding: '24px 28px' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, color: 'var(--text)', marginBottom: 4 }}>
                😤 Frustrations & Fixes
              </h2>
              <p style={{ fontSize: 13, color: 'var(--sub)', marginBottom: 20 }}>Fix these and your audience stays longer</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(analysis.whatFrustratesThem || []).map((f, i) => (
                  <div key={i} style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
                    padding: '12px 14px',
                    background: 'var(--card2)', border: '1px solid rgba(239,68,68,0.15)',
                    borderRadius: 10,
                  }}>
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--red)', fontWeight: 700, marginBottom: 4 }}>{f.frustration}</div>
                      {f.quote && <div style={{ fontSize: 12, color: 'var(--sub)', fontStyle: 'italic' }}>"{f.quote}"</div>}
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>→ FIX</div>
                      <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.4 }}>{f.fix}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 6. LOYALTY SCORE */}
          <div className="card-base" style={{ padding: '24px 28px' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, color: 'var(--text)', marginBottom: 20 }}>
              Audience Loyalty Score
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 28, marginBottom: 16 }}>
              <ScoreRing score={analysis.loyaltyScore} size={100} label="/ 100" stroke={8} />
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>
                  {analysis.loyaltyScore >= 70 ? '✅ Strong community'
                    : analysis.loyaltyScore >= 40 ? '⚠️ Developing loyalty'
                    : '🚨 At-risk audience'}
                </div>
                <div style={{ fontSize: 14, color: 'var(--sub)', lineHeight: 1.5, maxWidth: 380 }}>
                  {analysis.loyaltyInsight}
                </div>
              </div>
            </div>
            {analysis.loyaltyScore < 60 && (
              <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--red)', fontWeight: 700 }}>⚠️ AT RISK — </span>
                <span style={{ fontSize: 13, color: 'var(--text)' }}>Loyalty below 60 means viewers may not return. Address their frustrations immediately.</span>
              </div>
            )}
          </div>

          {/* 7. AUDIENCE PERSONA — 2x2 grid */}
          {analysis.audiencePersona && (
            <div className="card-base" style={{ padding: '24px 28px' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, color: 'var(--text)', marginBottom: 4 }}>
                🧬 Audience Persona
              </h2>
              <p style={{ fontSize: 13, color: 'var(--sub)', marginBottom: 20 }}>The psychology driving every view, subscribe, and unsubscribe</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { label: 'Core Fear', value: analysis.audiencePersona.coreFear, icon: '😨', color: 'var(--red)' },
                  { label: 'Core Desire', value: analysis.audiencePersona.coreDesire, icon: '🌟', color: 'var(--green)' },
                  { label: 'Why They Watch', value: analysis.audiencePersona.whyTheyWatch, icon: '👁️', color: 'var(--cyan)' },
                  { label: 'What Would Lose Them', value: analysis.audiencePersona.whatWouldLoseThem, icon: '⚠️', color: 'var(--gold)' },
                ].map(item => (
                  <div key={item.label} style={{
                    background: 'var(--card2)',
                    border: `1px solid ${item.color}33`,
                    borderRadius: 12, padding: '14px 16px',
                  }}>
                    <div style={{ fontSize: 10, color: item.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: 6 }}>
                      {item.icon} {item.label}
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.5 }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 8. BEST NEXT VIDEO — from content gaps */}
          {analysis.contentGaps?.[0] && (
            <div className="card-base" style={{
              padding: '24px 28px',
              border: '2px solid rgba(244,63,142,0.35)',
              borderLeft: '4px solid var(--pink)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--pink)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 12 }}>
                🎬 MAKE THIS VIDEO NEXT
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                <div style={{
                  fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 20,
                  color: 'var(--text)', flex: 1, lineHeight: 1.3,
                }}>{analysis.contentGaps[0].title}</div>
                <CopyBtn text={analysis.contentGaps[0].title} />
              </div>
              <div style={{ fontSize: 13, color: 'var(--sub)', lineHeight: 1.5 }}>
                Based on your audience's highest-demand content gap: <strong style={{ color: 'var(--text)' }}>{analysis.contentGaps[0].gap}</strong>
              </div>
              <div style={{
                marginTop: 12, padding: '6px 14px', borderRadius: 20, display: 'inline-block',
                background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                fontSize: 11, fontWeight: 800, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.5px',
              }}>Priority: Do This Week</div>
            </div>
          )}

          {/* 9. MAKE THIS VIDEO NEXT — from bestNextVideo */}
          {analysis.bestNextVideo && (
            <div style={{
              padding: '28px 32px',
              background: 'linear-gradient(135deg, rgba(244,63,142,0.08), rgba(124,58,237,0.06))',
              border: '2px solid rgba(244,63,142,0.3)',
              borderRadius: 18,
            }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--pink)', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 12 }}>
                🎬 MAKE THIS VIDEO NEXT
              </div>
              <div style={{
                display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                gap: 16, marginBottom: 14, flexWrap: 'wrap',
              }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900, color: 'var(--text)', lineHeight: 1.3, flex: 1 }}>
                  {analysis.bestNextVideo.title}
                </div>
                <CopyBtn text={analysis.bestNextVideo.title} />
              </div>
              <div style={{ fontSize: 13, color: 'var(--sub)', lineHeight: 1.6, marginBottom: 14 }}>
                <strong style={{ color: 'var(--text)' }}>Why: </strong>{analysis.bestNextVideo.why}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  padding: '4px 14px', borderRadius: 20,
                  background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                  color: 'var(--red)', fontSize: 11, fontWeight: 700,
                }}>Priority: Do This Week</span>
              </div>
            </div>
          )}

          {/* CommandCard bottom */}
          {analysis.whatTheyWant?.[0] && (
            <CommandCard
              command={`Make: "${analysis.whatTheyWant[0].videoTitle}" — your audience's most urgent need right now`}
              why={`They say "${analysis.whatTheyWant[0].surfaceRequest}" but what they actually need is: ${analysis.whatTheyWant[0].realDesire}`}
              impact="Posting content that matches your audience's real desire increases watch time and subscribe rate"
              priority={analysis.whatTheyWant[0].urgency === 'high' ? 'Do Today' : 'Do This Week'}
            />
          )}
        </>
      )}
    </div>
  )
}
