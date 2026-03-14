import { useState, useEffect, useCallback, useRef } from 'react'
import { useChannel } from '../context/ChannelContext'
import type { YouTubeVideo } from '../context/ChannelContext'
import { youtubeCOMMENTS, youtubeDATA, askGroq, sanitize, GROQ_KEY_A } from '../lib/api'
import {
  formatViews, safeInt, parseISO8601, formatDuration,
  calcBestPostingDay, calcAvgViews,
} from '../lib/calc'
import { CommandCard } from '../components/CommandCard'
import { ScoreRing } from '../components/ScoreRing'
import { Skeleton } from '../components/Skeleton'
import { ErrorCard } from '../components/ErrorCard'
import { Copy, Check } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
interface ViralVideo {
  id: string
  title: string
  views: number
  durationSec: number
  day: string
  publishedAt: string
}

interface ViralFormula {
  titleFormula: string
  titleKeywords: string[]
  optimalLength: string
  thumbnailPattern: string
  bestPublishDay: string
  channelSizeAdvantage: string
  yourViralGapScore: number
  yourSpecificAction: string
  formulaConfidence: 'high' | 'medium' | 'low'
}

// ─── Copy Button ──────────────────────────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) }) }}
      title="Copy title"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '3px 8px', borderRadius: 6,
        background: copied ? 'rgba(16,185,129,0.12)' : 'rgba(124,58,237,0.1)',
        border: `1px solid ${copied ? 'rgba(16,185,129,0.3)' : 'rgba(124,58,237,0.25)'}`,
        color: copied ? 'var(--green)' : 'var(--accent)',
        fontSize: 11, fontWeight: 600, flexShrink: 0,
      }}
    >
      {copied ? <Check size={10} /> : <Copy size={10} />}
      {copied ? '✓' : ''}
    </button>
  )
}

// ─── Confidence badge ─────────────────────────────────────────────────────────
function ConfidenceBadge({ level }: { level: 'high' | 'medium' | 'low' }) {
  const map = {
    high: { bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.3)', color: 'var(--green)', label: '● High Confidence' },
    medium: { bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.3)', color: 'var(--gold)', label: '◐ Medium Confidence' },
    low: { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', color: 'var(--red)', label: '○ Low Confidence' },
  }
  const s = map[level] || map.medium
  return (
    <span style={{
      padding: '4px 10px', borderRadius: 20,
      background: s.bg, border: `1px solid ${s.border}`,
      color: s.color, fontSize: 11, fontWeight: 700,
    }}>{s.label}</span>
  )
}

// ─── Comparison row ───────────────────────────────────────────────────────────
function ComparisonRow({
  label, formula, yours, matches,
}: { label: string; formula: string; yours: string; matches: boolean }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '120px 1fr 1fr', gap: 12, alignItems: 'center',
      padding: '12px 0', borderBottom: '1px solid var(--border)',
    }}>
      <span className="label-upper">{label}</span>
      <div style={{
        padding: '8px 12px', borderRadius: 8,
        background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.2)',
        fontSize: 13, color: 'var(--cyan)', fontWeight: 600,
      }}>{formula}</div>
      <div style={{
        padding: '8px 12px', borderRadius: 8,
        background: matches ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
        border: `1px solid ${matches ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
        fontSize: 13, color: matches ? 'var(--green)' : 'var(--red)', fontWeight: 600,
      }}>
        {matches ? '✓ ' : '✗ '}{yours}
      </div>
    </div>
  )
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────
function ViralSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Skeleton height={110} borderRadius={16} />
      <Skeleton height={220} borderRadius={16} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Skeleton height={180} borderRadius={16} />
        <Skeleton height={180} borderRadius={16} />
      </div>
      {[1, 2, 3, 4, 5].map(i => (
        <Skeleton key={i} height={56} borderRadius={10} />
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function Viral() {
  const { channel, videos, niche } = useChannel()

  const [viralData, setViralData] = useState<ViralFormula | null>(null)
  const [topVideos, setTopVideos] = useState<ViralVideo[]>([])
  const [creatorStats, setCreatorStats] = useState<{
    avgTitleLen: number; avgDuration: number; bestDay: string
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const ran = useRef(false)

  // ─── Fetch flow ─────────────────────────────────────────────────────────────
  const fetchViral = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // 1. Search top viral videos in niche last 30 days
      const searchData = await youtubeCOMMENTS('search', {
        q: niche,
        type: 'video',
        order: 'viewCount',
        publishedAfter: new Date(Date.now() - 30 * 86400000).toISOString(),
        maxResults: '50',
        part: 'snippet',
      }) as { items?: unknown[] }

      const searchItems = searchData.items || []
      const rawIds = searchItems
        .map((it: unknown) => {
          const item = it as { id?: { videoId?: string } }
          return item?.id?.videoId || ''
        })
        .filter(Boolean)
        .slice(0, 50)

      if (!rawIds.length) throw new Error('No videos found for your niche')

      // 2. Fetch full stats
      const videosData = await youtubeDATA('videos', {
        part: 'statistics,snippet,contentDetails',
        id: rawIds.join(','),
      }) as { items?: unknown[] }

      const rawVideos = (videosData.items || []) as Array<{
        id: string
        snippet: { title?: string; publishedAt?: string }
        statistics?: { viewCount?: string }
        contentDetails?: { duration?: string }
      }>

      // 3. Filter top 20 by viewCount
      const sorted = [...rawVideos]
        .sort((a, b) => safeInt(b.statistics?.viewCount) - safeInt(a.statistics?.viewCount))
        .slice(0, 20)

      const titles: string[] = []
      const views: number[] = []
      const durations: number[] = []
      const days: string[] = []

      const builtVideos: ViralVideo[] = sorted.map(v => {
        const dur = parseISO8601(v.contentDetails?.duration)
        const day = new Date(v.snippet.publishedAt || '').toLocaleDateString('en', { weekday: 'long' })
        const vc = safeInt(v.statistics?.viewCount)

        titles.push(v.snippet.title || '')
        views.push(vc)
        durations.push(dur)
        days.push(day)

        return {
          id: v.id,
          title: v.snippet.title || 'Untitled',
          views: vc,
          durationSec: dur,
          day,
          publishedAt: v.snippet.publishedAt || '',
        }
      })

      setTopVideos(builtVideos)

      // 4. Groq analysis
      const sys = 'YouTube virality analyst. Find patterns in what goes viral. Return JSON only.'
      const user =
        `Top viral videos in "${niche}" niche last 30 days:\n` +
        `Titles:\n${titles.slice(0, 15).map(t => sanitize(t, 60)).join('\n')}\n` +
        `Views: ${views.slice(0, 15).join(',')}\n` +
        `Durations: ${durations.slice(0, 15).join(',')} seconds\n` +
        `Published days: ${days.slice(0, 15).join(',')}\n\n` +
        `Identify the FORMULA behind virality in this niche.\n` +
        `JSON:{"titleFormula":str,"titleKeywords":[str],"optimalLength":str,"thumbnailPattern":str,"bestPublishDay":str,"channelSizeAdvantage":str,"yourViralGapScore":n,"yourSpecificAction":str,"formulaConfidence":"high"|"medium"|"low"}`

      const formula = await askGroq(sys, user, true, GROQ_KEY_A) as ViralFormula
      setViralData(formula)

      // 5. Compare creator's stats
      const creatorAvgTitleLen = videos.length
        ? Math.round(videos.reduce((s, v) => s + (v.snippet.title || '').length, 0) / videos.length)
        : 0
      const creatorAvgDuration = videos.length
        ? Math.round(videos.reduce((s, v) => s + parseISO8601(v.contentDetails?.duration), 0) / videos.length)
        : 0
      const bestDay = calcBestPostingDay(videos as YouTubeVideo[]).best?.day || 'Unknown'

      setCreatorStats({
        avgTitleLen: creatorAvgTitleLen,
        avgDuration: creatorAvgDuration,
        bestDay,
      })
    } catch (e: unknown) {
      const msg = (e as Error).message || 'Something went wrong'
      setError(msg)
      console.error('Full error:', e)
    } finally {
      setLoading(false)
    }
  }, [niche, videos])

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    fetchViral()
  }, [fetchViral])

  // ─── Derived stats ───────────────────────────────────────────────────────────
  const avgViralViews = topVideos.length
    ? Math.round(topVideos.reduce((a, b) => a + b.views, 0) / topVideos.length)
    : 0

  const gapScore = viralData ? Math.max(0, Math.min(100, viralData.yourViralGapScore)) : 0
  const ringScore = 100 - gapScore // ring shows match, not gap
  const ringColor = gapScore <= 30 ? 'var(--green)' : gapScore <= 60 ? 'var(--gold)' : 'var(--red)'

  // Comparison helpers
  const viralAvgDuration = topVideos.length
    ? Math.round(topVideos.reduce((s, v) => s + v.durationSec, 0) / topVideos.length)
    : 0

  const viralTitleLen = topVideos.length
    ? Math.round(topVideos.reduce((s, v) => s + v.title.length, 0) / topVideos.length)
    : 0

  const titleMatch = creatorStats ? Math.abs(creatorStats.avgTitleLen - viralTitleLen) <= 15 : false
  const durationMatch = creatorStats ? Math.abs(creatorStats.avgDuration - viralAvgDuration) <= 60 : false
  const dayMatch = viralData && creatorStats
    ? creatorStats.bestDay.toLowerCase() === viralData.bestPublishDay.toLowerCase()
    : false

  // Build the 3 gap changes
  const gapChanges: string[] = []
  if (!titleMatch && creatorStats) {
    gapChanges.push(
      viralTitleLen > creatorStats.avgTitleLen
        ? `Make your titles longer — viral videos avg ${viralTitleLen} chars, yours avg ${creatorStats.avgTitleLen}`
        : `Shorten your titles — viral hits avg ${viralTitleLen} chars, yours avg ${creatorStats.avgTitleLen}`
    )
  }
  if (!durationMatch && creatorStats) {
    gapChanges.push(
      `Your avg duration is ${formatDuration(creatorStats.avgDuration)} — viral formula says ${viralData?.optimalLength || formatDuration(viralAvgDuration)}`
    )
  }
  if (!dayMatch && viralData && creatorStats) {
    gapChanges.push(
      `Post on ${viralData.bestPublishDay} — your best day is ${creatorStats.bestDay} but viral formula says otherwise`
    )
  }
  if (gapChanges.length === 0) {
    gapChanges.push('Your content is well aligned with the viral formula — keep it up!')
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="page-enter" style={{ maxWidth: 860 }}>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 28,
          color: 'var(--text)', letterSpacing: '-0.5px', marginBottom: 6,
        }}>🧬 Viral Pattern Detector</h1>
        <p style={{ color: 'var(--sub)', marginBottom: 24, fontSize: 15 }}>
          Analyzing the viral formula for {niche}…
        </p>
        <ViralSkeleton />
      </div>
    )
  }

  return (
    <div className="page-enter" style={{ maxWidth: 860, display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 28,
          color: 'var(--text)', letterSpacing: '-0.5px', marginBottom: 6,
        }}>🧬 Viral Pattern Detector</h1>
        <p style={{ color: 'var(--sub)', fontSize: 15 }}>
          Decode the viral formula in <strong style={{ color: 'var(--text)' }}>{niche}</strong> — then match it
        </p>
      </div>

      {/* Error */}
      {error && <ErrorCard message={error} onRetry={fetchViral} />}

      {/* 1. Command Card */}
      {viralData && (
        <CommandCard
          command={viralData.yourSpecificAction}
          why={`Videos using the viral formula avg ${formatViews(avgViralViews)} views in ${niche}`}
          impact={`Your viral gap score: ${gapScore}/100`}
          priority={gapScore > 50 ? 'Do Today' : 'Do This Week'}
        />
      )}

      {/* 2. Viral Formula Card */}
      {viralData && (
        <div className="card-base" style={{
          padding: '28px', position: 'relative', overflow: 'hidden',
          borderLeft: '4px solid var(--cyan)',
          background: 'linear-gradient(135deg, rgba(6,182,212,0.05) 0%, var(--card) 60%)',
        }}>
          {/* Glow */}
          <div style={{
            position: 'absolute', top: -40, right: -40, width: 200, height: 200,
            background: 'radial-gradient(circle, rgba(6,182,212,0.1) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />

          <div className="label-upper" style={{ marginBottom: 12, color: 'var(--cyan)' }}>
            ⚡ THE VIRAL FORMULA FOR YOUR NICHE RIGHT NOW
          </div>

          {/* Title formula */}
          <div style={{
            fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 20,
            color: 'var(--cyan)', letterSpacing: '-0.3px', marginBottom: 16,
            padding: '12px 16px', borderRadius: 10,
            background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.2)',
          }}>
            {viralData.titleFormula}
          </div>

          {/* Keyword pills */}
          {viralData.titleKeywords?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {viralData.titleKeywords.slice(0, 8).map((kw, i) => (
                <span key={i} style={{
                  padding: '5px 12px', borderRadius: 20,
                  background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.3)',
                  color: 'var(--cyan)', fontSize: 12, fontWeight: 600,
                }}>#{kw}</span>
              ))}
            </div>
          )}

          {/* Formula stats row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <span style={{
              padding: '6px 14px', borderRadius: 20,
              background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)',
              color: 'var(--gold)', fontSize: 12, fontWeight: 700,
            }}>⏱ {viralData.optimalLength}</span>
            <span style={{
              padding: '6px 14px', borderRadius: 20,
              background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.3)',
              color: 'var(--accent)', fontSize: 12, fontWeight: 700,
            }}>📅 {viralData.bestPublishDay}</span>
            <ConfidenceBadge level={viralData.formulaConfidence} />
          </div>

          {/* Thumbnail pattern */}
          {viralData.thumbnailPattern && (
            <div style={{
              marginTop: 16, padding: '12px 14px', borderRadius: 10,
              background: 'var(--surface)', border: '1px solid var(--border)',
              fontSize: 13, color: 'var(--sub)',
            }}>
              <span style={{ fontWeight: 700, color: 'var(--text)' }}>🖼 Thumbnail Pattern: </span>
              {viralData.thumbnailPattern}
            </div>
          )}
        </div>
      )}

      {/* 3. Your Gap Card */}
      {viralData && creatorStats && (
        <div className="card-base" style={{ padding: '28px' }}>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18,
            color: 'var(--text)', marginBottom: 20,
          }}>📊 Your Viral Gap</h2>

          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {/* Score ring */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{ position: 'relative' }}>
                <ScoreRing score={ringScore} size={130} label="Match" />
                {/* Override color using inline overlay label */}
              </div>
              <div style={{
                padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                background: gapScore <= 30 ? 'rgba(16,185,129,0.15)' : gapScore <= 60 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.12)',
                border: `1px solid ${gapScore <= 30 ? 'rgba(16,185,129,0.3)' : gapScore <= 60 ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)'}`,
                color: ringColor,
              }}>
                Gap: {gapScore}/100
              </div>
            </div>

            {/* Gap changes */}
            <div style={{ flex: 1, minWidth: 240 }}>
              <div className="label-upper" style={{ marginBottom: 12 }}>3 Changes to Make</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {gapChanges.slice(0, 3).map((change, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                    padding: '10px 14px', borderRadius: 10,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                  }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                      background: 'var(--grad)', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 800,
                    }}>{i + 1}</span>
                    <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{change}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Top Viral Videos */}
      {topVideos.length > 0 && (
        <div className="card-base" style={{ padding: '28px' }}>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18,
            color: 'var(--text)', marginBottom: 6,
          }}>🏆 Top Viral Videos in {niche}</h2>
          <p style={{ fontSize: 13, color: 'var(--sub)', marginBottom: 20 }}>
            Last 30 days — sorted by view count
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {topVideos.slice(0, 10).map((v, i) => {
              const matchesKeyword = viralData?.titleKeywords?.some(kw =>
                v.title.toLowerCase().includes(kw.toLowerCase())
              )
              return (
                <div key={v.id} style={{
                  display: 'flex', gap: 14, alignItems: 'center',
                  padding: '12px 16px', borderRadius: 12,
                  background: i < 3 ? 'rgba(6,182,212,0.05)' : 'transparent',
                  border: `1px solid ${i < 3 ? 'rgba(6,182,212,0.2)' : 'var(--border)'}`,
                }}>
                  <span style={{
                    width: 26, height: 26, borderRadius: '50%',
                    background: i < 3 ? 'rgba(6,182,212,0.2)' : 'var(--surface)',
                    color: i < 3 ? 'var(--cyan)' : 'var(--muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 800, flexShrink: 0,
                  }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{
                        fontSize: 13, fontWeight: 600, color: 'var(--text)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{v.title}</span>
                      <CopyBtn text={v.title} />
                    </div>
                    {matchesKeyword && (
                      <span style={{ fontSize: 11, color: 'var(--cyan)', fontWeight: 600 }}>
                        ✓ Matches viral formula keywords
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexShrink: 0, fontSize: 12 }}>
                    <span style={{ color: 'var(--text)', fontWeight: 700 }}>{formatViews(v.views)}</span>
                    <span style={{ color: 'var(--sub)' }}>{formatDuration(v.durationSec)}</span>
                    <span style={{ color: 'var(--muted)' }}>{v.day}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 5. Formula vs Your Channel comparison table */}
      {viralData && creatorStats && (
        <div className="card-base" style={{ padding: '28px' }}>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18,
            color: 'var(--text)', marginBottom: 8,
          }}>⚔️ Formula vs Your Channel</h2>
          <p style={{ fontSize: 13, color: 'var(--sub)', marginBottom: 20 }}>
            Green = matches the formula · Red = needs adjustment
          </p>

          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr', gap: 12, marginBottom: 8 }}>
            <div />
            <div style={{
              padding: '8px 12px', borderRadius: 8,
              background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.25)',
              fontSize: 11, fontWeight: 700, color: 'var(--cyan)', textTransform: 'uppercase', letterSpacing: 1,
              textAlign: 'center',
            }}>Viral Formula Says</div>
            <div style={{
              padding: '8px 12px', borderRadius: 8,
              background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.25)',
              fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: 1,
              textAlign: 'center',
            }}>What You're Doing</div>
          </div>

          <ComparisonRow
            label="Title Pattern"
            formula={viralData.titleFormula.slice(0, 40) + (viralData.titleFormula.length > 40 ? '…' : '')}
            yours={`Avg ${creatorStats.avgTitleLen} chars`}
            matches={titleMatch}
          />
          <ComparisonRow
            label="Video Length"
            formula={viralData.optimalLength}
            yours={formatDuration(creatorStats.avgDuration) || 'Unknown'}
            matches={durationMatch}
          />
          <ComparisonRow
            label="Best Day"
            formula={viralData.bestPublishDay}
            yours={creatorStats.bestDay}
            matches={dayMatch}
          />
        </div>
      )}

      {/* Loading state inside error section placeholder */}
      {!loading && !error && !viralData && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 16, padding: '60px 24px', textAlign: 'center',
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16,
        }}>
          <div style={{ fontSize: 48 }}>🧬</div>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
            No viral data available
          </p>
          <p style={{ color: 'var(--sub)', fontSize: 14 }}>
            Could not detect viral patterns in {niche} right now
          </p>
        </div>
      )}
    </div>
  )
}
