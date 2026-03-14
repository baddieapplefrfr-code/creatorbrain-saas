import { useState, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useChannel } from '../context/ChannelContext'
import { youtubeCOMMENTS, youtubeDATA, askGroq, sanitize, GROQ_KEY_A } from '../lib/api'
import { viewVelocity, formatViews, safeInt, calcBestPostingDay, calcHookTypes, calcBestLength } from '../lib/calc'
import { CommandCard } from '../components/CommandCard'
import { Skeleton } from '../components/Skeleton'
import { ErrorCard } from '../components/ErrorCard'
import { Copy, Check, RefreshCw, Flame, TrendingUp, ExternalLink } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
interface TrendVideo {
  id: string
  title: string
  views: number
  velocity: number
  outlierScore: number
  channelTitle: string
  publishedAt: string
}

interface TrendCluster {
  topic: string
  titles: string[]
  angle: string
  suggestedTitle: string
  videos: TrendVideo[]
  avgOutlier: number
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
        padding: '4px 10px', borderRadius: 8,
        background: copied ? 'rgba(16,185,129,0.15)' : 'rgba(124,58,237,0.12)',
        border: `1px solid ${copied ? 'rgba(16,185,129,0.4)' : 'rgba(124,58,237,0.3)'}`,
        color: copied ? 'var(--green)' : 'var(--accent)',
        fontSize: 12, fontWeight: 600, flexShrink: 0,
      }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

// ─── Trend Cluster Card ────────────────────────────────────────────────────────
interface ClusterCardProps {
  cluster: TrendCluster
  onUseInScript: (title: string) => void
  bestHookType: string
  bestDay: string
  bestLength: string
}
function ClusterCard({ cluster, onUseInScript, bestHookType, bestDay, bestLength }: ClusterCardProps) {
  const isFire = cluster.avgOutlier > 3
  const momentumColor = isFire ? 'var(--cyan)' : 'var(--gold)'

  return (
    <div className="card-base" style={{
      padding: '24px',
      borderLeft: `4px solid ${isFire ? 'var(--cyan)' : 'var(--gold)'}`,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Glow accent */}
      <div style={{
        position: 'absolute', top: 0, right: 0, width: 120, height: 120,
        background: isFire
          ? 'radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 70%)'
          : 'radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{
          fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18,
          color: 'var(--text)', letterSpacing: '-0.3px',
        }}>{cluster.topic}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            padding: '4px 12px', borderRadius: 20,
            background: isFire ? 'rgba(6,182,212,0.15)' : 'rgba(245,158,11,0.15)',
            border: `1px solid ${isFire ? 'rgba(6,182,212,0.35)' : 'rgba(245,158,11,0.35)'}`,
            color: momentumColor, fontSize: 12, fontWeight: 700,
          }}>
            {isFire ? '🔥 ' : '📈 '}Momentum {cluster.avgOutlier.toFixed(1)}x
          </span>
          <span style={{
            padding: '4px 10px', borderRadius: 20,
            background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.25)',
            color: 'var(--sub)', fontSize: 12,
          }}>{cluster.videos.length} videos</span>
        </div>
      </div>

      {/* Angle */}
      {cluster.angle && (
        <p style={{ fontSize: 13, color: 'var(--sub)', marginBottom: 16, fontStyle: 'italic' }}>
          {cluster.angle}
        </p>
      )}

      {/* Suggested title */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '16px 18px', marginBottom: 16,
      }}>
        <div className="label-upper" style={{ marginBottom: 8 }}>💡 Suggested Title for You</div>
        <div style={{
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17,
          color: 'var(--text)', lineHeight: 1.4, marginBottom: 12,
        }}>{cluster.suggestedTitle}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <CopyBtn text={cluster.suggestedTitle} />
          <button
            onClick={() => onUseInScript(cluster.suggestedTitle)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 12px', borderRadius: 8,
              background: 'var(--grad)', color: '#fff',
              fontSize: 12, fontWeight: 700, border: 'none',
            }}
          >
            <ExternalLink size={12} />
            Use in Script Gen
          </button>
        </div>
      </div>

      {/* Video list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {cluster.videos.slice(0, 4).map((v) => (
          <div key={v.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 14px', borderRadius: 10,
            background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)',
          }}>
            <TrendingUp size={14} style={{ color: 'var(--sub)', flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, color: 'var(--text)', lineHeight: 1.4 }}>
              {v.title.slice(0, 65)}{v.title.length > 65 ? '…' : ''}
            </span>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 12, color: 'var(--sub)' }}>{formatViews(v.views)} views</span>
              <span style={{
                fontSize: 12, fontWeight: 700,
                color: v.outlierScore > 3 ? 'var(--cyan)' : 'var(--gold)',
              }}>{v.outlierScore.toFixed(1)}x</span>
            </div>
          </div>
        ))}
      </div>

      {/* Coaching Section */}
      <div style={{
        marginTop: 16,
        padding: '14px 18px',
        background: 'rgba(244,63,142,0.07)',
        border: '1px solid rgba(244,63,142,0.25)',
        borderLeft: '3px solid var(--pink)',
        borderRadius: 10,
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--pink)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 10 }}>
          🎯 YOUR OPPORTUNITY
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
            Your <strong>{bestHookType}</strong> format + <strong>{cluster.topic}</strong> = your unfair advantage right now.
          </div>
          <div style={{ fontSize: 13, color: 'var(--sub)' }}>
            Window: ~3-5 days before this oversaturates.
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', marginTop: 4 }}>YOUR EXACT NEXT STEPS:</div>
          <div style={{ fontSize: 13, color: 'var(--text)' }}>→ Step 1: Use your {bestHookType} format with "{cluster.topic}" as the topic</div>
          <div style={{ fontSize: 13, color: 'var(--text)' }}>→ Step 2: Post on {bestDay} — your best-performing day</div>
          <div style={{ fontSize: 13, color: 'var(--text)' }}>→ Step 3: Make it {bestLength} — this is your optimal length</div>
          {cluster.suggestedTitle && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              marginTop: 8, padding: '10px 14px',
              background: 'rgba(244,63,142,0.08)', border: '1px solid rgba(244,63,142,0.2)',
              borderRadius: 8,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: 'var(--pink)', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>USE THIS TITLE</div>
                <div style={{ fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--text)' }}>
                  {cluster.suggestedTitle}
                </div>
              </div>
              <CopyBtn text={cluster.suggestedTitle} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────
function TrendSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {[1, 2, 3].map(i => (
        <div key={i} className="card-base" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <Skeleton height={22} width="35%" />
            <Skeleton height={22} width="20%" />
          </div>
          <Skeleton height={14} width="70%" style={{ marginBottom: 16 }} />
          <Skeleton height={90} borderRadius={12} style={{ marginBottom: 16 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton height={42} borderRadius={10} />
            <Skeleton height={42} borderRadius={10} />
            <Skeleton height={42} borderRadius={10} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function Trends() {
  const navigate = useNavigate()
  const { channel, videos, niche } = useChannel()

  const [clusters, setClusters] = useState<TrendCluster[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const [lastSearched, setLastSearched] = useState<Date | null>(null)

  // ─── Fetch flow ─────────────────────────────────────────────────────────────
  const fetchTrends = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // 1. Extract keywords from channel videos
      const stopWords = new Set([
        'the','a','is','in','on','and','or','to','for','how','what',
        'why','with','your','this','that','you','was','are','have',
        'has','will','from','but','not','been','they','their','more',
      ])
      const titleWords = videos.slice(0, 20).flatMap(v =>
        (v.snippet.title || '').toLowerCase().match(/\b\w{4,}\b/g) || []
      ).filter(w => !stopWords.has(w))
      const freq: Record<string, number> = {}
      titleWords.forEach(w => { freq[w] = (freq[w] || 0) + 1 })
      const keywords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k)
      const query = keywords.join(' ') || niche

      // 2. Search trending videos in niche
      const searchData = await youtubeCOMMENTS('search', {
        q: query,
        type: 'video',
        order: 'viewCount',
        publishedAfter: new Date(Date.now() - 7 * 86400000).toISOString(),
        maxResults: '50',
        part: 'snippet',
      }) as { items?: unknown[] }

      const searchItems = searchData.items || []
      if (!searchItems.length) {
        setClusters([])
        setSearched(true)
        setLastSearched(new Date())
        return
      }

      // Extract video IDs
      const rawIds = searchItems
        .map((it: unknown) => {
          const item = it as { id?: { videoId?: string } }
          return item?.id?.videoId || ''
        })
        .filter(Boolean)
        .slice(0, 30)

      if (!rawIds.length) {
        setClusters([])
        setSearched(true)
        setLastSearched(new Date())
        return
      }

      // 3. Fetch full stats
      const videosData = await youtubeDATA('videos', {
        part: 'statistics,snippet,contentDetails',
        id: rawIds.join(','),
      }) as { items?: unknown[] }

      const rawVideos = (videosData.items || []) as Array<{
        id: string
        snippet: { title?: string; channelId?: string; channelTitle?: string; publishedAt?: string }
        statistics?: { viewCount?: string }
        contentDetails?: { duration?: string }
      }>

      // 4. Calculate velocity for top 15
      const top15 = rawVideos.slice(0, 15)

      // Collect unique channelIds for baseline
      const uniqueChannelIds = [...new Set(top15.map(v => v.snippet.channelId || '').filter(Boolean))]
      let channelAvgMap: Record<string, number> = {}
      if (uniqueChannelIds.length) {
        try {
          const chData = await youtubeDATA('channels', {
            part: 'statistics',
            id: uniqueChannelIds.slice(0, 20).join(','),
          }) as { items?: Array<{ id: string; statistics?: { viewCount?: string; videoCount?: string } }> }
          for (const ch of chData.items || []) {
            const vc = safeInt(ch.statistics?.viewCount)
            const cnt = safeInt(ch.statistics?.videoCount) || 1
            channelAvgMap[ch.id] = vc / cnt
          }
        } catch { /* fallback: no baseline */ }
      }

      // Build trend video objects with outlier scores
      const trendVideos: TrendVideo[] = top15.map(v => {
        const vel = viewVelocity(v)
        const channelAvg = channelAvgMap[v.snippet.channelId || ''] || 0
        const channelAvgPerHour = channelAvg / (7 * 24)
        const outlierScore = channelAvgPerHour > 0 ? vel / channelAvgPerHour : (vel > 100 ? 2 : 1)
        return {
          id: v.id,
          title: v.snippet.title || 'Untitled',
          views: safeInt(v.statistics?.viewCount),
          velocity: vel,
          outlierScore: Math.round(outlierScore * 10) / 10,
          channelTitle: v.snippet.channelTitle || '',
          publishedAt: v.snippet.publishedAt || '',
        }
      })

      // Filter by outlierScore > 1.5, fallback to top 5 by velocity
      let filtered = trendVideos.filter(v => v.outlierScore > 1.5)
      if (filtered.length < 3) {
        filtered = [...trendVideos].sort((a, b) => b.velocity - a.velocity).slice(0, 5)
      }

      // 5. Cluster with Groq
      const titles = filtered.map(v => v.title)
      const clusterPrompt =
        `Cluster these ${titles.length} video titles into 3-5 topics:\n` +
        titles.map(t => sanitize(t, 50)).join('\n') +
        `\nJSON:[{"topic":str,"titles":[str],"angle":str,"suggestedTitle":str}]`

      let rawClusters: Array<{ topic: string; titles: string[]; angle: string; suggestedTitle: string }> = []
      try {
        rawClusters = await askGroq(
          'YouTube topic analyst. Cluster titles into clear topics. Return JSON only.',
          clusterPrompt,
          true,
          GROQ_KEY_A
        ) as typeof rawClusters
      } catch {
        // Fallback: single cluster with all videos
        rawClusters = [{ topic: niche, titles, angle: 'Trending content this week', suggestedTitle: titles[0] || '' }]
      }

      // 6. Build final cluster objects with video references + avg outlier
      const finalClusters: TrendCluster[] = rawClusters.slice(0, 5).map(c => {
        const clusterVids = filtered.filter(v =>
          c.titles.some(t => v.title.toLowerCase().includes(sanitize(t, 40).toLowerCase().slice(0, 20)))
        )
        const usedVids = clusterVids.length > 0 ? clusterVids : filtered.slice(0, 3)
        const avgOutlier = usedVids.reduce((s, v) => s + v.outlierScore, 0) / Math.max(usedVids.length, 1)
        return {
          topic: c.topic,
          titles: c.titles,
          angle: c.angle,
          suggestedTitle: c.suggestedTitle,
          videos: usedVids,
          avgOutlier: Math.round(avgOutlier * 10) / 10,
        }
      })

      setClusters(finalClusters)
      setSearched(true)
      setLastSearched(new Date())
    } catch (e: unknown) {
      const msg = (e as Error).message || 'Something went wrong'
      setError(msg)
      console.error('Full error:', e)
    } finally {
      setLoading(false)
    }
  }, [videos, niche])

  // ─── Use in Script Gen ───────────────────────────────────────────────────────
  const handleUseInScript = (title: string) => {
    sessionStorage.setItem('script_prefill', title)
    navigate({ to: '/script' })
  }

  // ─── Channel coaching data ──────────────────────────────────────────────────
  const bestDay_ = calcBestPostingDay(videos)
  const hooks_ = calcHookTypes(videos)
  const lengths_ = calcBestLength(videos)
  const bestHookType = hooks_[0]?.type || 'Question Hook'
  const bestDayName = bestDay_.best.day
  const bestLength = lengths_[0]?.label || '8-20 min'

  // ─── Derived ─────────────────────────────────────────────────────────────────
  const hasFireCluster = clusters.some(c => c.avgOutlier > 3)
  const topCluster = clusters[0]
  const outlierMultiplier = topCluster ? topCluster.avgOutlier.toFixed(1) : '0'

  // ─── Format last searched ────────────────────────────────────────────────────
  const formatTime = (d: Date) => d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="page-enter" style={{ maxWidth: 860, display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Page header */}
      <div>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 28,
          color: 'var(--text)', letterSpacing: '-0.5px', marginBottom: 6,
        }}>🔥 Trend Interceptor</h1>
        <p style={{ color: 'var(--sub)', fontSize: 15 }}>
          Post on trending topics before your competitors — real-time niche signals
        </p>
      </div>

      {/* Pre-search or Post-search CommandCard */}
      {!searched ? (
        <CommandCard
          command="Find what's trending in your niche before your next upload"
          why="Posting without trend data means guessing. Real-time search shows what's working RIGHT NOW."
          impact="Channels that post on trending topics get 3-5x more initial views"
          priority="Do Today"
        />
      ) : topCluster ? (
        <CommandCard
          command={`Make a video about "${topCluster.topic}" — ${topCluster.titles.length} videos on this topic are getting ${outlierMultiplier}x normal views this week`}
          why={`Your niche (${niche}) has active trend momentum right now. Ride the wave before it peaks.`}
          impact={`Trending topics in your niche show ${outlierMultiplier}x velocity vs channel baseline`}
          priority="Do Today"
        />
      ) : null}

      {/* Pre-search CTA */}
      {!searched && !loading && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 20, padding: '48px 24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 64 }}>🔥</div>
          <p style={{ color: 'var(--sub)', fontSize: 16, maxWidth: 420, lineHeight: 1.6 }}>
            You have <strong style={{ color: 'var(--text)' }}>{videos.length} videos</strong> — let's find what to make next.
          </p>
          <button
            onClick={fetchTrends}
            style={{
              padding: '14px 36px', borderRadius: 14,
              background: 'var(--grad)', color: '#fff',
              fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16,
              border: 'none', boxShadow: '0 4px 24px rgba(244,63,142,0.35)',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            }}
            onMouseEnter={e => { (e.target as HTMLButtonElement).style.transform = 'translateY(-2px)' }}
            onMouseLeave={e => { (e.target as HTMLButtonElement).style.transform = '' }}
          >
            🔥 Find Trends in My Niche
          </button>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>
            Searches last 7 days · Analyzes {niche} niche
          </p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '14px 18px', borderRadius: 12,
            background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)',
            marginBottom: 20,
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: 'var(--accent)', animation: 'pulse-opacity 1.2s ease infinite',
            }} />
            <span style={{ fontSize: 13, color: 'var(--sub)' }}>
              Scanning trending videos in <strong style={{ color: 'var(--text)' }}>{niche}</strong> niche…
            </span>
          </div>
          <TrendSkeleton />
        </div>
      )}

      {/* Error */}
      {error && !loading && <ErrorCard message={error} onRetry={fetchTrends} />}

      {/* Results */}
      {searched && !loading && !error && (
        <>
          {/* Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              {lastSearched && <>Last checked: <strong style={{ color: 'var(--sub)' }}>{formatTime(lastSearched)}</strong></>}
              {' · '}<span style={{ color: 'var(--sub)' }}>{clusters.length} trend clusters found</span>
            </div>
            <button
              onClick={fetchTrends}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 16px', borderRadius: 10,
                background: 'var(--card)', border: '1px solid var(--border)',
                color: 'var(--sub)', fontSize: 13, fontWeight: 600,
              }}
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>

          {/* Fire alert banner */}
          {hasFireCluster && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '14px 20px', borderRadius: 12,
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)',
              borderLeft: '4px solid var(--red)',
            }}>
              <Flame size={18} style={{ color: 'var(--red)', flexShrink: 0 }} />
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--red)' }}>
                🔥 Act Today — Something is blowing up in your niche
              </span>
            </div>
          )}

          {/* Cluster cards or empty state */}
          {clusters.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 16, padding: '60px 24px', textAlign: 'center',
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 16,
            }}>
              <div style={{ fontSize: 48 }}>🔍</div>
              <p style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
                No unusual trends this week
              </p>
              <p style={{ color: 'var(--sub)', fontSize: 14 }}>
                Check back tomorrow — trends can spike quickly in {niche}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {clusters.map((cluster, i) => (
                <ClusterCard
                  key={i}
                  cluster={cluster}
                  onUseInScript={handleUseInScript}
                  bestHookType={bestHookType}
                  bestDay={bestDayName}
                  bestLength={bestLength}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
