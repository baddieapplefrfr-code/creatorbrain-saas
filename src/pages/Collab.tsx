import { useState, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useChannel } from '../context/ChannelContext'
import type { YouTubeChannel } from '../context/ChannelContext'
import { youtubeCOMMENTS, youtubeDATA, askGroq, sanitize, GROQ_KEY_B } from '../lib/api'
import { formatViews, safeInt, calcMatchScore, calcAvgViews } from '../lib/calc'
import { CommandCard } from '../components/CommandCard'
import { Skeleton } from '../components/Skeleton'
import { ErrorCard } from '../components/ErrorCard'
import { Copy, Check, Users, TrendingUp, Search, MessageSquare, Loader2 } from 'lucide-react'

interface CollabResult {
  channel: YouTubeChannel
  matchScore: number
  avgViews: number
  topVideoTitle: string
  outreach: { subject: string; message: string; collabIdea: string } | null
  outreachLoading: boolean
}

interface YTSearchResult {
  id?: { channelId?: string }
}

interface YTVideoRes {
  items?: Array<{ snippet?: { title?: string }; statistics?: { viewCount?: string } }>
}

interface YTPlaylistRes {
  items?: Array<{ contentDetails?: { videoId?: string } }>
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }) }}
      style={{
        background: copied ? 'rgba(16,185,129,0.1)' : 'none',
        border: `1px solid ${copied ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
        cursor: 'pointer',
        color: copied ? 'var(--green)' : 'var(--sub)',
        display: 'flex', alignItems: 'center', gap: 5,
        fontSize: 12, padding: '5px 10px', borderRadius: 7,
        fontFamily: 'var(--font-body)', fontWeight: 600,
        transition: 'all 0.15s',
      }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

export default function Collab() {
  const { channel, videos, niche } = useChannel()
  const navigate = useNavigate()

  const [query, setQuery] = useState(niche)
  const [results, setResults] = useState<CollabResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!channel) {
    navigate({ to: '/onboarding' })
    return null
  }

  const mySubs = safeInt(channel.statistics?.subscriberCount)

  const search = useCallback(async () => {
    if (!channel || !query.trim()) return
    setLoading(true)
    setError(null)
    setResults([])

    try {
      // 1. Search channels
      const searchRes = await youtubeCOMMENTS('search', {
        part: 'snippet',
        type: 'channel',
        q: sanitize(query, 50),
        maxResults: '20',
      }) as { items?: YTSearchResult[] }

      const channelIds = (searchRes.items ?? [])
        .map(i => i.id?.channelId)
        .filter((id): id is string => !!id)
        .slice(0, 15)

      if (!channelIds.length) {
        setError('No channels found. Try different keywords.')
        setLoading(false)
        return
      }

      // 2. Fetch stats
      const chRes = await youtubeDATA('channels', {
        part: 'snippet,statistics,contentDetails',
        id: channelIds.join(','),
      }) as { items?: YouTubeChannel[] }

      const candidates = (chRes.items ?? []).filter(ch => {
        const subs = safeInt(ch.statistics?.subscriberCount)
        const ratio = subs / Math.max(mySubs, 1)
        return ch.id !== channel.id && subs > 100 && ratio >= 0.05 && ratio <= 25
      })

      if (!candidates.length) {
        setError('No matching channels found. Try broadening your search.')
        setLoading(false)
        return
      }

      // 3. Calculate match scores + fetch top video for top 8
      const withScores = candidates
        .map(ch => ({ ch, score: calcMatchScore(channel, ch) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)

      const collabs: CollabResult[] = []

      for (const { ch, score } of withScores) {
        let topVideoTitle = `${ch.snippet.title}'s latest video`
        let avgViews = 0

        try {
          const playlistId = ch.contentDetails?.relatedPlaylists?.uploads
          if (playlistId) {
            const plRes = await youtubeDATA('playlistItems', {
              part: 'contentDetails',
              playlistId,
              maxResults: '10',
            }) as YTPlaylistRes
            const ids = (plRes.items ?? []).map(i => i.contentDetails?.videoId).filter(Boolean)
            if (ids.length) {
              const vRes = await youtubeDATA('videos', {
                part: 'snippet,statistics',
                id: (ids as string[]).join(','),
              }) as YTVideoRes
              const sorted = (vRes.items ?? []).sort((a, b) =>
                safeInt(b.statistics?.viewCount) - safeInt(a.statistics?.viewCount)
              )
              if (sorted[0]?.snippet?.title) {
                topVideoTitle = sanitize(sorted[0].snippet.title, 60)
              }
              avgViews = (vRes.items ?? []).reduce((s, v) => s + safeInt(v.statistics?.viewCount), 0) / Math.max((vRes.items ?? []).length, 1)
            }
          }
        } catch { /* skip */ }

        collabs.push({
          channel: ch,
          matchScore: score,
          avgViews,
          topVideoTitle,
          outreach: null,
          outreachLoading: false,
        })
      }

      setResults(collabs)
    } catch (e: unknown) {
      const msg = (e as Error).message || 'Something went wrong'
      setError(msg.includes('quotaExceeded') ? 'YouTube daily limit reached' : msg)
      console.error('Full error:', e)
    } finally {
      setLoading(false)
    }
  }, [channel, mySubs, query])

  const generateOutreach = useCallback(async (idx: number) => {
    const collab = results[idx]
    if (!collab || collab.outreachLoading || !channel) return

    setResults(prev => prev.map((r, i) => i === idx ? { ...r, outreachLoading: true } : r))

    try {
      const chSubs = safeInt(collab.channel.statistics?.subscriberCount)
      const res = await askGroq(
        'YouTube creator outreach specialist. Write natural, friendly DMs. Return JSON only.',
        `From: "${sanitize(channel.snippet.title, 30)}" (${formatViews(safeInt(channel.statistics?.subscriberCount))} subs, ${sanitize(niche, 25)})\nTo: "${sanitize(collab.channel.snippet.title, 30)}" (${formatViews(chSubs)} subs)\nTheir recent top video: "${sanitize(collab.topVideoTitle, 60)}"\nWrite a collab pitch DM under 120 words. Reference their real video. Suggest a collab idea relevant to both niches. Be specific, genuine, no cringe.\nJSON:{"subject":"str","message":"str","collabIdea":"str"}`,
        true,
        GROQ_KEY_B
      ) as { subject: string; message: string; collabIdea: string }

      setResults(prev => prev.map((r, i) => i === idx ? { ...r, outreach: res, outreachLoading: false } : r))
    } catch {
      setResults(prev => prev.map((r, i) => i === idx ? {
        ...r,
        outreach: {
          subject: `Collab idea — ${channel.snippet.title} x ${collab.channel.snippet.title}`,
          message: `Hi ${collab.channel.snippet.title}! I've been watching your content, especially "${collab.topVideoTitle}". I run ${channel.snippet.title} and think our audiences would love a collab. Would you be open to doing something together? Let me know!`,
          collabIdea: `Cross-promotion video on shared ${niche} topic`,
        },
        outreachLoading: false,
      } : r))
    }
  }, [results, channel, niche])

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 900, color: 'var(--text)', marginBottom: 4 }}>
          🤝 Collab Finder
        </h1>
        <p style={{ color: 'var(--sub)', fontSize: 14 }}>Find perfect collab partners scored by match + AI-generated outreach DMs</p>
      </div>

      {!results.length && !loading && (
        <CommandCard
          command={`Find a collab partner this week in ${niche} — channels 50%-500% your size grow 3x faster through cross-promotion`}
          why={`${channel.snippet.title} has ${formatViews(mySubs)} subs — the sweet spot is channels with ${formatViews(Math.round(mySubs * 0.5))}–${formatViews(Math.round(mySubs * 5))} subs`}
          impact="A single collab with a channel 3x your size can bring 20-40% subscriber growth in one week"
          priority="Do This Week"
        />
      )}

      {/* Search */}
      <div className="card-base" style={{ padding: '24px 28px' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: 'var(--text)', marginBottom: 16 }}>
          Find Channels
        </h2>
        <div style={{ display: 'flex', gap: 12 }}>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !loading && search()}
            placeholder={`e.g. "${niche}", "personal finance", "gaming tutorials"`}
            style={{ flex: 1 }}
          />
          <button
            onClick={search}
            disabled={loading || !query.trim()}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 22px', borderRadius: 10, border: 'none',
              background: loading || !query.trim() ? 'var(--border)' : 'var(--grad)',
              color: loading || !query.trim() ? 'var(--muted)' : 'white',
              fontWeight: 700, fontSize: 14, cursor: loading || !query.trim() ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-display)', flexShrink: 0, transition: 'all 0.2s',
            }}
          >
            <Search size={15} />
            {loading ? 'Finding...' : 'Find Partners'}
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[1, 2, 3].map(i => <Skeleton key={i} height={180} />)}
        </div>
      )}

      {error && <ErrorCard message={error} onRetry={search} />}

      {results.length > 0 && !loading && (
        <>
          <CommandCard
            command={`Send outreach to ${results[0].channel.snippet.title} today — ${results[0].matchScore}% match score for your niche`}
            why={`They posted "${results[0].topVideoTitle}" recently — reference this specific video for a 3-5x higher response rate`}
            impact="Personalised DM with specific video reference gets 3-5x higher response rate than generic pitches"
            priority="Do This Week"
          />

          {results.map((collab, i) => {
            const chSubs = safeInt(collab.channel.statistics?.subscriberCount)
            const thumb = collab.channel.snippet.thumbnails?.default?.url ?? collab.channel.snippet.thumbnails?.medium?.url
            const matchColor = collab.matchScore >= 70 ? 'var(--green)' : collab.matchScore >= 40 ? 'var(--gold)' : 'var(--red)'

            return (
              <div
                key={collab.channel.id}
                className="card-base"
                style={{ padding: '24px 28px', animation: `fadeInUp 0.3s ease ${i * 0.08}s both` }}
              >
                {/* Channel header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 18 }}>
                  {thumb ? (
                    <img src={thumb} alt={collab.channel.snippet.title} style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border2)', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--grad)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: 'white', fontWeight: 900, flexShrink: 0 }}>
                      {collab.channel.snippet.title[0]}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 900, color: 'var(--text)', marginBottom: 4 }}>
                      {collab.channel.snippet.title}
                    </div>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--sub)' }}>
                        <Users size={12} /> {formatViews(chSubs)} subs
                      </span>
                      {collab.avgViews > 0 && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--sub)' }}>
                          <TrendingUp size={12} /> {formatViews(Math.round(collab.avgViews))} avg views
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Match score badge */}
                  <div style={{
                    padding: '8px 16px', borderRadius: 20, flexShrink: 0,
                    background: `${matchColor}18`, border: `1px solid ${matchColor}40`,
                    fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 900, color: matchColor,
                    textAlign: 'center',
                  }}>
                    {collab.matchScore}%
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 1 }}>
                      match
                    </div>
                  </div>
                </div>

                {/* Top video reference */}
                <div style={{ padding: '10px 14px', background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 16 }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Reference their video: </span>
                  <span style={{ fontSize: 13, color: 'var(--text)' }}>"{collab.topVideoTitle}"</span>
                </div>

                {/* Outreach */}
                {!collab.outreach && !collab.outreachLoading && (
                  <button
                    onClick={() => generateOutreach(i)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 18px', borderRadius: 10, border: '1px solid var(--border)',
                      background: 'var(--card2)', color: 'var(--text)',
                      fontWeight: 600, fontSize: 13, cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text)' }}
                  >
                    <MessageSquare size={14} />
                    Generate Outreach DM
                  </button>
                )}

                {collab.outreachLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0', fontSize: 13, color: 'var(--sub)' }}>
                    <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                    Crafting personalised outreach...
                  </div>
                )}

                {collab.outreach && !collab.outreachLoading && (
                  <div style={{ animation: 'fadeInUp 0.25s ease both' }}>
                    {/* Collab idea badge */}
                    <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Collab idea:</span>
                      <span style={{
                        padding: '3px 12px',
                        background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.3)',
                        borderRadius: 20, fontSize: 12, color: 'var(--accent)', fontWeight: 600,
                      }}>
                        {collab.outreach.collabIdea}
                      </span>
                    </div>

                    {/* Subject */}
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                      Subject: <span style={{ fontWeight: 600, color: 'var(--sub)' }}>{collab.outreach.subject}</span>
                    </div>

                    {/* Message */}
                    <div style={{
                      padding: '16px 18px',
                      background: 'linear-gradient(135deg, rgba(124,58,237,0.07), rgba(244,63,142,0.03))',
                      border: '1px solid rgba(124,58,237,0.22)', borderRadius: 12,
                      fontSize: 13, color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap',
                      marginBottom: 10,
                    }}>
                      {collab.outreach.message}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <CopyBtn text={`Subject: ${collab.outreach.subject}\n\n${collab.outreach.message}`} />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
