import { useState, useCallback } from 'react'
import { useChannel } from '../context/ChannelContext'
import type { YouTubeChannel } from '../context/ChannelContext'
import { youtubeCOMMENTS, youtubeDATA, askGroq, sanitize, GROQ_KEY_B } from '../lib/api'
import { formatViews, safeInt, calcAvgViews, calcMatchScore } from '../lib/calc'
import { CommandCard } from '../components/CommandCard'
import { Skeleton } from '../components/Skeleton'
import { ErrorCard } from '../components/ErrorCard'
import { Users, TrendingUp, Clock } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
interface TwinAnalysis {
  growthStory: string
  whatTheyChanged: string[]
  breakthroughPattern: string
  copyablePlaybook: string[]
  timeToReplicate: string
  keyDifference: string
}

interface TwinChannel {
  channel: YouTubeChannel
  matchScore: number
  avgViews: number
  analysis: TwinAnalysis | null
  analysisError: string | null
}

// ─── Match score badge ─────────────────────────────────────────────────────────
function MatchBadge({ score }: { score: number }) {
  const color = score >= 70 ? 'var(--green)' : score >= 40 ? 'var(--gold)' : 'var(--red)'
  const bg = score >= 70 ? 'rgba(16,185,129,0.12)' : score >= 40 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.1)'
  const border = score >= 70 ? 'rgba(16,185,129,0.3)' : score >= 40 ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.25)'
  return (
    <span style={{
      padding: '5px 14px', borderRadius: 20,
      background: bg, border: `1px solid ${border}`,
      color, fontSize: 13, fontWeight: 800,
    }}>
      {score}% Match
    </span>
  )
}

// ─── Twin card ────────────────────────────────────────────────────────────────
function TwinCard({ twin, index, onUsePlaybook }: {
  twin: TwinChannel
  index: number
  onUsePlaybook: (twinName: string) => void
}) {
  const { channel: twinCh, matchScore, analysis } = twin
  const thumbUrl = twinCh.snippet.thumbnails?.medium?.url
    || twinCh.snippet.thumbnails?.default?.url
    || ''
  const subs = safeInt(twinCh.statistics?.subscriberCount)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card-base" style={{
        padding: '28px',
        borderLeft: `4px solid ${index === 0 ? 'var(--accent)' : index === 1 ? 'var(--cyan)' : 'var(--gold)'}`,
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Rank badge */}
        <div style={{
          position: 'absolute', top: 16, right: 16,
          width: 36, height: 36, borderRadius: '50%',
          background: 'var(--grad)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 16,
        }}>#{index + 1}</div>

        {/* Channel header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          {thumbUrl ? (
            <img
              src={thumbUrl}
              alt={twinCh.snippet.title}
              style={{ width: 56, height: 56, borderRadius: '50%', border: '2px solid var(--border2)', flexShrink: 0 }}
            />
          ) : (
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'var(--surface)', border: '2px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--muted)', fontSize: 22, flexShrink: 0,
            }}>👤</div>
          )}
          <div>
            <h3 style={{
              fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20,
              color: 'var(--text)', letterSpacing: '-0.3px', marginBottom: 4,
            }}>{twinCh.snippet.title}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 14, color: 'var(--sub)', fontWeight: 600,
              }}>
                <Users size={14} />
                {formatViews(subs)} subscribers
              </span>
              <MatchBadge score={matchScore} />
            </div>
          </div>
        </div>

        {/* Analysis loading state */}
        {!analysis && !twin.analysisError && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Skeleton height={16} width="80%" />
            <Skeleton height={16} width="65%" />
            <Skeleton height={80} borderRadius={10} />
            <Skeleton height={80} borderRadius={10} />
          </div>
        )}

        {/* Analysis error */}
        {twin.analysisError && (
          <div style={{
            padding: '12px 16px', borderRadius: 10,
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
            color: 'var(--red)', fontSize: 13,
          }}>
            Could not analyze this channel: {twin.analysisError}
          </div>
        )}

        {/* Analysis content */}
        {analysis && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Growth story */}
            <div>
              <div className="label-upper" style={{ marginBottom: 8 }}>📈 Growth Story</div>
              <p style={{ fontSize: 14, color: 'var(--sub)', lineHeight: 1.7, fontStyle: 'italic' }}>
                {analysis.growthStory}
              </p>
            </div>

            {/* What they changed */}
            <div>
              <div className="label-upper" style={{ marginBottom: 10 }}>🔄 What They Changed</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {(analysis.whatTheyChanged || []).slice(0, 3).map((change, i) => (
                  <span key={i} style={{
                    padding: '6px 14px', borderRadius: 20,
                    background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.25)',
                    color: 'var(--accent)', fontSize: 12, fontWeight: 600,
                  }}>{change}</span>
                ))}
              </div>
            </div>

            {/* Breakthrough pattern */}
            {analysis.breakthroughPattern && (
              <div style={{
                padding: '14px 18px', borderRadius: 12,
                background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.2)',
                borderLeft: '3px solid var(--accent)',
              }}>
                <div className="label-upper" style={{ marginBottom: 6, color: 'var(--accent)' }}>⚡ Breakthrough Pattern</div>
                <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>
                  {analysis.breakthroughPattern}
                </p>
              </div>
            )}

            {/* Copyable playbook */}
            <div>
              <div className="label-upper" style={{ marginBottom: 12 }}>📋 Copy Their Playbook</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(analysis.copyablePlaybook || []).slice(0, 3).map((step, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: 12, alignItems: 'flex-start',
                    padding: '12px 16px', borderRadius: 12,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                  }}>
                    <span style={{
                      width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                      background: 'var(--grad)', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 800,
                    }}>{i + 1}</span>
                    <span style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>{step}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Time to replicate */}
            {analysis.timeToReplicate && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 16px', borderRadius: 10,
                background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
                width: 'fit-content',
              }}>
                <Clock size={16} style={{ color: 'var(--gold)', flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: 'var(--gold)', fontWeight: 700 }}>
                  Time to replicate: {analysis.timeToReplicate}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CommandCard per twin */}
      {analysis && (
        <CommandCard
          command={`Follow ${twinCh.snippet.title}'s playbook — they grew to ${formatViews(subs)} by ${sanitize(analysis.keyDifference, 60)}. Start with step 1 today.`}
          why={`${twinCh.snippet.title} is ${formatViews(subs / Math.max(safeInt(analysis.keyDifference), 1))} ahead of you — but their path is copyable`}
          impact={analysis.copyablePlaybook?.[0] || 'Follow their playbook step by step'}
          priority="Do This Week"
        />
      )}
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function TwinSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {[1, 2, 3].map(i => (
        <div key={i} className="card-base" style={{ padding: 28 }}>
          <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
            <Skeleton height={56} width={56} borderRadius="50%" />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Skeleton height={22} width="40%" />
              <Skeleton height={16} width="25%" />
            </div>
          </div>
          <Skeleton height={16} width="80%" style={{ marginBottom: 8 }} />
          <Skeleton height={16} width="65%" style={{ marginBottom: 16 }} />
          <Skeleton height={80} borderRadius={12} style={{ marginBottom: 12 }} />
          <Skeleton height={80} borderRadius={12} />
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function Twin() {
  const { channel, videos, niche } = useChannel()

  const [twins, setTwins] = useState<TwinChannel[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const [expandSearch, setExpandSearch] = useState(false)

  // ─── Fetch flow ─────────────────────────────────────────────────────────────
  const fetchTwins = useCallback(async (expanded = false) => {
    try {
      setLoading(true)
      setError(null)
      setTwins([])

      // 1. Search channels in niche
      const searchData = await youtubeCOMMENTS('search', {
        type: 'channel',
        q: niche,
        maxResults: '20',
        part: 'snippet',
      }) as { items?: unknown[] }

      const searchItems = searchData.items || []
      const channelIds = searchItems
        .map((it: unknown) => {
          const item = it as { id?: { channelId?: string }; snippet?: { channelId?: string } }
          return item?.id?.channelId || item?.snippet?.channelId || ''
        })
        .filter(Boolean)

      if (!channelIds.length) throw new Error('No channels found in your niche')

      // 2. Fetch channel stats
      const chData = await youtubeDATA('channels', {
        part: 'snippet,statistics',
        id: channelIds.slice(0, 20).join(','),
      }) as { items?: YouTubeChannel[] }

      const candidateChannels = chData.items || []
      const mySubs = safeInt(channel?.statistics?.subscriberCount)

      // 3. Filter: 3x–10x subscriber range (or expand to all if no results)
      let filtered = candidateChannels.filter(ch => {
        const subs = safeInt(ch.statistics?.subscriberCount)
        if (expanded) return subs > mySubs
        return subs >= mySubs * 3 && subs <= mySubs * 10
      })

      // Sort by match score
      filtered = filtered
        .map(ch => ({ ch, score: calcMatchScore(ch, channel as YouTubeChannel) }))
        .sort((a, b) => b.score - a.score)
        .map(x => x.ch)
        .slice(0, 3)

      if (!filtered.length) {
        setSearched(true)
        setLoading(false)
        return
      }

      // Initial state without analysis
      const initialTwins: TwinChannel[] = filtered.map(ch => ({
        channel: ch,
        matchScore: calcMatchScore(ch, channel as YouTubeChannel),
        avgViews: 0,
        analysis: null,
        analysisError: null,
      }))
      setTwins(initialTwins)
      setSearched(true)

      // 4. For each twin, fetch recent videos + run Groq analysis
      for (let idx = 0; idx < filtered.length; idx++) {
        const twinCh = filtered[idx]
        try {
          // Get uploads playlist ID
          const chDetailData = await youtubeDATA('channels', {
            part: 'contentDetails',
            id: twinCh.id,
          }) as { items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }> }

          const uploadsPlaylistId = chDetailData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
          let twinAvgViews = 0
          let twinTitles: string[] = []

          if (uploadsPlaylistId) {
            // Fetch playlist items
            const plData = await youtubeDATA('playlistItems', {
              part: 'snippet',
              playlistId: uploadsPlaylistId,
              maxResults: '20',
            }) as { items?: Array<{ snippet?: { resourceId?: { videoId?: string }; title?: string } }> }

            const plItems = plData.items || []
            const videoIds = plItems
              .map(it => it.snippet?.resourceId?.videoId || '')
              .filter(Boolean)

            twinTitles = plItems.map(it => it.snippet?.title || '').filter(Boolean)

            if (videoIds.length) {
              // Fetch video stats
              const vData = await youtubeDATA('videos', {
                part: 'snippet,statistics',
                id: videoIds.slice(0, 20).join(','),
              }) as { items?: unknown[] }

              twinAvgViews = Math.round(
                calcAvgViews((vData.items || []) as Parameters<typeof calcAvgViews>[0])
              )
            }
          }

          // 5. Groq analysis per twin
          const twinSubs = safeInt(twinCh.statistics?.subscriberCount)
          const mySubs2 = safeInt(channel?.statistics?.subscriberCount)
          const user =
            `Twin channel: "${sanitize(twinCh.snippet.title, 30)}" has ${formatViews(twinSubs)} subs\n` +
            `Your channel: ${formatViews(mySubs2)} subs in ${niche}\n` +
            `Their recent videos:\n${twinTitles.slice(0, 8).map(t => sanitize(t, 50)).join('\n')}\n` +
            `Their avg views: ${Math.round(twinAvgViews)}\n` +
            `JSON:{"growthStory":str,"whatTheyChanged":[str,str,str],"breakthroughPattern":str,"copyablePlaybook":[str,str,str],"timeToReplicate":str,"keyDifference":str}`

          const analysis = await askGroq(
            'YouTube channel growth analyst. Return JSON only.',
            user,
            true,
            GROQ_KEY_B
          ) as TwinAnalysis

          setTwins(prev => prev.map((t, i) =>
            i === idx ? { ...t, avgViews: twinAvgViews, analysis } : t
          ))
        } catch (e: unknown) {
          const msg = (e as Error).message || 'Analysis failed'
          setTwins(prev => prev.map((t, i) =>
            i === idx ? { ...t, analysisError: msg } : t
          ))
        }
      }
    } catch (e: unknown) {
      const msg = (e as Error).message || 'Something went wrong'
      setError(msg)
      console.error('Full error:', e)
    } finally {
      setLoading(false)
    }
  }, [channel, niche, videos])

  const handleExpandSearch = () => {
    setExpandSearch(true)
    fetchTwins(true)
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  const mySubs = safeInt(channel?.statistics?.subscriberCount)

  return (
    <div className="page-enter" style={{ maxWidth: 860, display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 28,
          color: 'var(--text)', letterSpacing: '-0.5px', marginBottom: 6,
        }}>🪞 Channel Twin Finder</h1>
        <p style={{ color: 'var(--sub)', fontSize: 15 }}>
          Find channels 3–10x your size in <strong style={{ color: 'var(--text)' }}>{niche}</strong> — copy their exact growth playbook
        </p>
      </div>

      {/* Pre-search view */}
      {!searched && !loading && (
        <>
          {/* Explanation card */}
          <div className="card-base" style={{ padding: '28px' }}>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18,
              color: 'var(--text)', marginBottom: 16,
            }}>🎯 How Channel Twin Finding Works</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { icon: '🔍', title: 'Searches your niche', desc: 'Finds active channels in the same content category' },
                { icon: '📊', title: 'Filters by size', desc: `Shows channels with 3x–10x your ${formatViews(mySubs)} subscribers — close enough to be reachable` },
                { icon: '🧬', title: 'Analyzes their playbook', desc: 'AI identifies exactly what they did to grow and how you can copy it' },
                { icon: '📋', title: 'Gives you steps', desc: 'A numbered action plan based on their breakthrough patterns' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 22, flexShrink: 0 }}>{item.icon}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>{item.title}</div>
                    <div style={{ fontSize: 13, color: 'var(--sub)' }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <div className="card-base" style={{ padding: '20px', textAlign: 'center' }}>
              <div className="label-upper" style={{ marginBottom: 8 }}>Your Subs</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 28, color: 'var(--accent)' }}>
                {formatViews(mySubs)}
              </div>
            </div>
            <div className="card-base" style={{ padding: '20px', textAlign: 'center' }}>
              <div className="label-upper" style={{ marginBottom: 8 }}>Target Range</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 22, color: 'var(--cyan)' }}>
                {formatViews(mySubs * 3)}–{formatViews(mySubs * 10)}
              </div>
            </div>
            <div className="card-base" style={{ padding: '20px', textAlign: 'center' }}>
              <div className="label-upper" style={{ marginBottom: 8 }}>Niche</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 24, color: 'var(--gold)' }}>
                {niche}
              </div>
            </div>
          </div>

          {/* CTA */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              onClick={() => fetchTwins(false)}
              style={{
                padding: '14px 40px', borderRadius: 14,
                background: 'var(--grad)', color: '#fff',
                fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16,
                border: 'none', boxShadow: '0 4px 24px rgba(124,58,237,0.35)',
                transition: 'transform 0.15s ease',
              }}
              onMouseEnter={e => { (e.target as HTMLButtonElement).style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { (e.target as HTMLButtonElement).style.transform = '' }}
            >
              🪞 Find My Channel Twins
            </button>
          </div>
        </>
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
              Searching for channel twins in <strong style={{ color: 'var(--text)' }}>{niche}</strong>…
            </span>
          </div>
          <TwinSkeleton />
        </div>
      )}

      {/* Error */}
      {error && !loading && <ErrorCard message={error} onRetry={() => fetchTwins(expandSearch)} />}

      {/* No results */}
      {searched && !loading && !error && twins.length === 0 && (
        <div className="card-base" style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 16, padding: '60px 24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 48 }}>🔍</div>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>
            No channel twins found in this size range
          </p>
          <p style={{ color: 'var(--sub)', fontSize: 14, maxWidth: 380, lineHeight: 1.6 }}>
            No channels found with {formatViews(mySubs * 3)}–{formatViews(mySubs * 10)} subscribers in {niche}.
            Try expanding your search to all channels above your size.
          </p>
          <button
            onClick={handleExpandSearch}
            style={{
              padding: '10px 28px', borderRadius: 12,
              background: 'var(--card)', border: '1px solid var(--border2)',
              color: 'var(--text)', fontFamily: 'var(--font-body)',
              fontWeight: 700, fontSize: 14,
            }}
          >
            <TrendingUp size={16} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            Expand Search (All Channels)
          </button>
        </div>
      )}

      {/* Results */}
      {searched && !loading && twins.length > 0 && (
        <>
          {/* Result summary */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 10,
          }}>
            <p style={{ fontSize: 14, color: 'var(--sub)' }}>
              Found <strong style={{ color: 'var(--text)' }}>{twins.length} channel twin{twins.length > 1 ? 's' : ''}</strong> — analyzing their growth playbooks
            </p>
            <button
              onClick={() => fetchTwins(expandSearch)}
              style={{
                padding: '7px 16px', borderRadius: 10,
                background: 'var(--card)', border: '1px solid var(--border)',
                color: 'var(--sub)', fontSize: 13, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              🔄 Refresh
            </button>
          </div>

          {/* Twin cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            {twins.map((twin, i) => (
              <TwinCard
                key={twin.channel.id}
                twin={twin}
                index={i}
                onUsePlaybook={(name) => {
                  sessionStorage.setItem('twin_ref', name)
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
