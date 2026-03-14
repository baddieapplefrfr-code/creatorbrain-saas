import { useState, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer,
  ScatterChart, Scatter, Legend,
} from 'recharts'

import { useChannel } from '../context/ChannelContext'
import { youtubeDATA, askGroq, sanitize, GROQ_KEY_B } from '../lib/api'
import {
  calcUploadMetrics,
  calcAvgViews,
  calcMatchScore,
  safeInt,
  formatViews,
  engagementRate,
  parseISO8601,
} from '../lib/calc'

import { CommandCard } from '../components/CommandCard'
import { ScoreRing } from '../components/ScoreRing'
import { VideoCard } from '../components/VideoCard'
import { ChartConclusion } from '../components/ChartConclusion'
import { Skeleton } from '../components/Skeleton'
import { ErrorCard } from '../components/ErrorCard'
import type { YouTubeVideo, YouTubeChannel } from '../context/ChannelContext'

// ── Tooltip style ────────────────────────────────────────────────────────────
const TT: React.CSSProperties = {
  background: 'var(--card2)',
  border: '1px solid var(--border2)',
  borderRadius: 12,
  fontFamily: 'var(--font-body)',
  fontSize: 12,
  color: 'var(--text)',
}

function fmtK(v: number): string {
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M'
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K'
  return String(Math.round(v))
}

// ── Groq response types ──────────────────────────────────────────────────────
interface ContentGap { gap: string; title: string; reason: string }
interface Tactic { tactic: string; example: string; howTo: string }

// ── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <h2 style={{
        fontFamily: 'var(--font-display)', fontWeight: 800,
        fontSize: 18, color: 'var(--text)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        {icon} {title}
      </h2>
      {sub && <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>{sub}</p>}
    </div>
  )
}

function ChartCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="card-base" style={{ padding: '24px 20px', marginBottom: 28 }}>
      {children}
    </div>
  )
}

// ── Fetch competitor videos ──────────────────────────────────────────────────
async function fetchCompetitorVideos(playlistId: string): Promise<YouTubeVideo[]> {
  const videos: YouTubeVideo[] = []
  let pageToken: string | undefined

  for (let page = 0; page < 3; page++) {
    const params: Record<string, string> = {
      part: 'snippet',
      playlistId,
      maxResults: '50',
    }
    if (pageToken) params.pageToken = pageToken
    const res = await youtubeDATA('playlistItems', params)
    const items = (res.items ?? []) as Array<{ snippet: { resourceId: { videoId: string }; publishedAt: string; title: string } }>
    const ids = items.map(i => i.snippet.resourceId.videoId).filter(Boolean)
    if (!ids.length) break

    const details = await youtubeDATA('videos', {
      part: 'snippet,statistics,contentDetails',
      id: ids.join(','),
    })
    videos.push(...(details.items ?? []))
    pageToken = res.nextPageToken
    if (!pageToken) break
  }
  return videos
}

// ── Empty / not-loaded state ─────────────────────────────────────────────────
function NoChannel() {
  const navigate = useNavigate()
  return (
    <div style={{
      minHeight: '60vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16, textAlign: 'center',
    }}>
      <div style={{ fontSize: 56 }}>👁️</div>
      <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 24, color: 'var(--text)' }}>
        No channel loaded
      </h2>
      <p style={{ color: 'var(--sub)', fontSize: 15 }}>Connect your channel first to spy on competitors.</p>
      <button onClick={() => navigate({ to: '/onboarding' })} style={{
        padding: '12px 28px', background: 'var(--grad)', color: '#fff',
        border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700,
        fontFamily: 'var(--font-display)', marginTop: 8,
      }}>
        Connect Channel →
      </button>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function Competitor() {
  const { channel, videos, niche, setSelectedVideo } = useChannel()
  const navigate = useNavigate()

  const [handle, setHandle]                           = useState('')
  const [competitor, setCompetitor]                   = useState<YouTubeChannel | null>(null)
  const [compVideos, setCompVideos]                   = useState<YouTubeVideo[]>([])
  const [loading, setLoading]                         = useState(false)
  const [error, setError]                             = useState<string | null>(null)
  const [activeTab, setActiveTab]                     = useState<'succeed' | 'gaps' | 'steal'>('succeed')

  const [whyText, setWhyText]                         = useState<string | null>(null)
  const [gapData, setGapData]                         = useState<ContentGap[]>([])
  const [tactics, setTactics]                         = useState<Tactic[]>([])
  const [groqLoading, setGroqLoading]                 = useState(false)
  const [groqError, setGroqError]                     = useState<string | null>(null)
  const [copiedIdx, setCopiedIdx]                     = useState<number | null>(null)

  if (!channel) return <NoChannel />

  // ── Derived: your metrics ──────────────────────────────────────────────────
  const uploadM    = calcUploadMetrics(videos)
  const avgViews   = calcAvgViews(videos)
  const engAvg     = videos.length
    ? videos.reduce((s, v) => s + engagementRate(v), 0) / videos.length
    : 0

  // ── Derived: competitor metrics ────────────────────────────────────────────
  const compUploadM   = calcUploadMetrics(compVideos)
  const compAvgViews  = calcAvgViews(compVideos)
  const compEngAvg    = compVideos.length
    ? compVideos.reduce((s, v) => s + engagementRate(v), 0) / compVideos.length
    : 0

  const matchScore = competitor
    ? calcMatchScore(channel, competitor)
    : 0

  // ── Comparison chart data ──────────────────────────────────────────────────
  const compData = [
    { metric: 'Avg Views', you: Math.round(avgViews), them: Math.round(compAvgViews) },
    { metric: 'Engagement%', you: +engAvg.toFixed(2), them: +compEngAvg.toFixed(2) },
    { metric: 'Vids/Week', you: +uploadM.perWeek.toFixed(1), them: +compUploadM.perWeek.toFixed(1) },
  ]

  // ── Competitor scatter data (duration vs views) ────────────────────────────
  const scatterData = compVideos.map(v => ({
    duration: +(parseISO8601(v.contentDetails?.duration) / 60).toFixed(1),
    views: safeInt(v.statistics?.viewCount),
    engRate: engagementRate(v),
    title: v.snippet.title,
  })).filter(d => d.duration > 0 && d.views > 0)

  // ── Monthly upload frequency comparison ───────────────────────────────────
  function monthlyUploads(vids: YouTubeVideo[]) {
    const now   = new Date()
    const months: { label: string; count: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const label = d.toLocaleDateString('en-US', { month: 'short' })
      const count = vids.filter(v => {
        const vd = new Date(v.snippet.publishedAt)
        return vd.getFullYear() === d.getFullYear() && vd.getMonth() === d.getMonth()
      }).length
      months.push({ label, count })
    }
    return months
  }

  const myMonths   = monthlyUploads(videos)
  const compMonths = monthlyUploads(compVideos)
  const freqData   = myMonths.map((m, i) => ({
    month: m.label,
    you: m.count,
    them: compMonths[i]?.count ?? 0,
  }))

  // ── Top 10 competitor videos ───────────────────────────────────────────────
  const compTop10 = [...compVideos]
    .sort((a, b) => safeInt(b.statistics?.viewCount) - safeInt(a.statistics?.viewCount))
    .slice(0, 10)

  const compName  = competitor?.snippet?.title || 'Competitor'
  const compTopTitles = compTop10.map(v => v.snippet.title)

  // ── Groq context builder ───────────────────────────────────────────────────
  const groqContext = competitor
    ? `Competitor "${sanitize(compName, 30)}" has ${formatViews(safeInt(competitor.statistics.subscriberCount))} subs, your channel "${sanitize(channel.snippet.title, 30)}" has ${formatViews(safeInt(channel.statistics.subscriberCount))} subs, same ${niche} niche. Their top videos: ${compTopTitles.slice(0, 5).map(t => sanitize(t, 50)).join(', ')}.`
    : ''

  // ── Fetch competitor ───────────────────────────────────────────────────────
  const fetchCompetitor = useCallback(async () => {
    if (!handle.trim()) return
    try {
      setLoading(true)
      setError(null)
      setCompetitor(null)
      setCompVideos([])
      setWhyText(null)
      setGapData([])
      setTactics([])

      // Parse handle
      let parsedHandle = handle.trim()
      if (parsedHandle.startsWith('https://')) {
        const match = parsedHandle.match(/@([\w.-]+)/)
        parsedHandle = match ? match[1] : parsedHandle
      }
      if (parsedHandle.startsWith('@')) parsedHandle = parsedHandle.slice(1)

      const res = await youtubeDATA('channels', {
        part: 'snippet,statistics,contentDetails',
        forHandle: parsedHandle,
      })
      if (!res.items?.length) throw new Error('Channel not found — check the handle')
      const ch: YouTubeChannel = res.items[0]
      setCompetitor(ch)

      const playlistId = ch.contentDetails?.relatedPlaylists?.uploads
      if (playlistId) {
        const vids = await fetchCompetitorVideos(playlistId)
        setCompVideos(vids)
      }
    } catch (e: unknown) {
      const msg = (e as Error).message || 'Failed to fetch competitor'
      setError(
        msg.includes('quotaExceeded') ? 'YouTube daily quota reached — try tomorrow' :
        msg.includes('not found') ? msg :
        msg
      )
    } finally {
      setLoading(false)
    }
  }, [handle])

  // ── Groq: load all tabs ────────────────────────────────────────────────────
  const loadGroq = useCallback(async (tab: 'succeed' | 'gaps' | 'steal') => {
    if (!competitor || !groqContext) return
    try {
      setGroqLoading(true)
      setGroqError(null)

      if (tab === 'succeed') {
        const sys = 'YouTube growth analyst. Analyse why this competitor is succeeding. Be specific, mention real video examples. Under 200 words. Plain text.'
        const res = await askGroq(sys, groqContext + ' Why are they succeeding? Be specific with video examples. Under 200 words.', false, GROQ_KEY_B) as string
        setWhyText(res)
      } else if (tab === 'gaps') {
        const sys = 'YouTube content strategist. Identify content gaps. JSON only.'
        const user = groqContext + " What does their audience want that they're NOT providing? List 5 content gaps with specific video titles. JSON:[{\"gap\":str,\"title\":str,\"reason\":str}]"
        const res = await askGroq(sys, user, true, GROQ_KEY_B) as ContentGap[]
        setGapData(Array.isArray(res) ? res.slice(0, 5) : [])
      } else {
        const sys = 'YouTube strategy expert. Identify tactics to steal. JSON only.'
        const user = groqContext + ' Name 3 specific tactics to steal from them. Reference real video titles. JSON:[{"tactic":str,"example":str,"howTo":str}]'
        const res = await askGroq(sys, user, true, GROQ_KEY_B) as Tactic[]
        setTactics(Array.isArray(res) ? res.slice(0, 3) : [])
      }
    } catch (e: unknown) {
      const msg = (e as Error).message || 'AI error'
      setGroqError(msg.includes('rate_limit') ? 'Too many requests — wait 30s' : msg)
    } finally {
      setGroqLoading(false)
    }
  }, [competitor, groqContext])

  const handleTabSwitch = (tab: 'succeed' | 'gaps' | 'steal') => {
    setActiveTab(tab)
    const hasData = tab === 'succeed' ? whyText : tab === 'gaps' ? gapData.length > 0 : tactics.length > 0
    if (!hasData && competitor) loadGroq(tab)
  }

  // ── Copy to clipboard helper ───────────────────────────────────────────────
  const copyTitle = (title: string, idx: number) => {
    navigator.clipboard.writeText(title).then(() => {
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx(null), 1500)
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="page-enter">
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontWeight: 900,
          fontSize: 28, color: 'var(--text)', marginBottom: 6,
        }}>
          👁️ Competitor Spy
        </h1>
        <p style={{ color: 'var(--sub)', fontSize: 14 }}>
          Reverse-engineer what's working for channels in your niche
        </p>
      </div>

      {/* ── Search Form ──────────────────────────────────────────────────────── */}
      <div className="card-base" style={{ padding: '24px 20px', marginBottom: 28 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <input
            value={handle}
            onChange={e => setHandle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && fetchCompetitor()}
            placeholder="competitor @handle or channel URL"
            style={{ flex: 1, minWidth: 220 }}
          />
          <button
            onClick={fetchCompetitor}
            disabled={loading || !handle.trim()}
            style={{
              padding: '10px 24px',
              background: 'var(--grad)',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 700,
              fontFamily: 'var(--font-display)',
              opacity: loading || !handle.trim() ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {loading ? '🔍 Analyzing…' : '🔍 Analyze Competitor'}
          </button>
        </div>
        {error && <div style={{ marginTop: 12 }}><ErrorCard message={error} /></div>}
      </div>

      {/* ── Loading skeleton ──────────────────────────────────────────────────── */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Skeleton height={120} borderRadius={16} />
          <Skeleton height={280} borderRadius={16} />
          <Skeleton height={200} borderRadius={16} />
        </div>
      )}

      {/* ── Competitor loaded ─────────────────────────────────────────────────── */}
      {competitor && !loading && (
        <>
          {/* Competitor profile + match score */}
          <div className="card-base" style={{
            padding: '20px 24px', marginBottom: 28,
            display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
          }}>
            {competitor.snippet.thumbnails?.medium?.url && (
              <img
                src={competitor.snippet.thumbnails.medium.url}
                alt={competitor.snippet.title}
                style={{ width: 72, height: 72, borderRadius: '50%', border: '2px solid var(--border2)', objectFit: 'cover' }}
              />
            )}
            <div style={{ flex: 1 }}>
              <h2 style={{
                fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 22, color: 'var(--text)', marginBottom: 4
              }}>
                {competitor.snippet.title}
              </h2>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <StatPill label="Subscribers" value={formatViews(safeInt(competitor.statistics.subscriberCount))} />
                <StatPill label="Videos" value={safeInt(competitor.statistics.videoCount).toLocaleString()} />
                <StatPill label="Total Views" value={formatViews(safeInt(competitor.statistics.viewCount))} />
                {compVideos.length > 0 && (
                  <>
                    <StatPill label="Avg Views/Video" value={formatViews(Math.round(compAvgViews))} />
                    <StatPill label="Avg Engagement" value={`${compEngAvg.toFixed(2)}%`} />
                  </>
                )}
              </div>
            </div>
            {/* Match Score */}
            <div style={{ textAlign: 'center' }}>
              <ScoreRing score={matchScore} size={100} label="Match" />
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                {matchScore >= 70 ? '🎯 Perfect benchmark' : matchScore >= 40 ? '📊 Good reference' : '⚠️ Very different scale'}
              </div>
            </div>
          </div>

          {/* ── CommandCard from gaps (once gaps loaded) ─────────────────────────── */}
          {gapData.length > 0 && (
            <CommandCard
              command={`Make a video about "${gapData[0].gap}" — ${compName} has no video on this topic and their audience is asking for it`}
              why={`Content gap identified in ${compName}'s ${compVideos.length} videos — ${gapData[0].reason}`}
              impact={`Fill the void in ${niche} niche — ${formatViews(safeInt(channel.statistics.subscriberCount))} subs of ${compName} need this content`}
              priority="Do This Week"
            />
          )}

          {/* ── CHART 1: Head-to-head comparison ─────────────────────────────────── */}
          {compVideos.length > 0 && (
            <ChartCard>
              <SectionHeader
                icon="⚡"
                title="You vs Them — Head to Head"
                sub="Your metrics vs competitor. Green bar = you're winning, red = they're ahead."
              />
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={compData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <XAxis dataKey="metric" tick={{ fill: 'var(--sub)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={fmtK} tick={{ fill: 'var(--sub)', fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip contentStyle={TT}
                    formatter={(v: number, name: string) => [
                      typeof v === 'number' && v < 100 ? v.toFixed(2) : fmtK(v),
                      name === 'you' ? 'You' : compName,
                    ]}
                    cursor={{ fill: 'rgba(124,58,237,0.08)' }}
                  />
                  <Legend formatter={(value: string) => value === 'you' ? 'You' : compName} />
                  <Bar dataKey="you" radius={[6,6,0,0]} maxBarSize={48} name="you">
                    {compData.map((entry, i) => (
                      <Cell
                        key={`you-${i}`}
                        fill={entry.you >= entry.them ? 'var(--green)' : 'var(--red)'}
                        opacity={0.85}
                      />
                    ))}
                  </Bar>
                  <Bar dataKey="them" radius={[6,6,0,0]} maxBarSize={48} name="them" fill="var(--pink)" opacity={0.65} />
                </BarChart>
              </ResponsiveContainer>
              <ChartConclusion
                text={`You beat them in ${compData.filter(d => d.you >= d.them).length}/${compData.length} metrics. ${compData.find(d => d.you < d.them)?.metric || 'Keep it up'} is your biggest gap to close.`}
              />
            </ChartCard>
          )}

          {/* ── CHART 2: Competitor scatter — duration vs views ────────────────────── */}
          {scatterData.length > 0 && (
            <ChartCard>
              <SectionHeader
                icon="📡"
                title={`${compName}'s Sweet Spot — Duration vs Views`}
                sub="Each dot = one video. Find the length where they get most views."
              />
              <ResponsiveContainer width="100%" height={260}>
                <ScatterChart margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
                  <XAxis dataKey="duration" type="number" name="Duration (min)"
                    tick={{ fill: 'var(--sub)', fontSize: 11 }} axisLine={false} tickLine={false}
                    label={{ value: 'Duration (minutes)', position: 'insideBottom', offset: -12, fill: 'var(--muted)', fontSize: 11 }}
                  />
                  <YAxis dataKey="views" type="number" name="Views"
                    tickFormatter={fmtK} tick={{ fill: 'var(--sub)', fontSize: 11 }}
                    axisLine={false} tickLine={false} width={44}
                  />
                  <Tooltip
                    contentStyle={TT}
                    content={({ payload }) => {
                      if (!payload?.length) return null
                      const d = payload[0].payload
                      return (
                        <div style={{ ...TT, padding: '10px 14px' }}>
                          <div style={{ fontWeight: 700, fontSize: 11, maxWidth: 200, marginBottom: 6, lineHeight: 1.3 }}>
                            {d.title?.slice(0, 60)}
                          </div>
                          <div style={{ color: 'var(--sub)', fontSize: 11 }}>{d.duration} min · {fmtK(d.views)} views · {d.engRate.toFixed(1)}% eng</div>
                        </div>
                      )
                    }}
                  />
                  <Scatter data={scatterData} fill="var(--pink)" opacity={0.7} />
                </ScatterChart>
              </ResponsiveContainer>
              {(() => {
                const best = scatterData.reduce((b, d) => d.views > b.views ? d : b, scatterData[0])
                return (
                  <ChartConclusion
                    text={`Their best video: ${best.duration} min, ${fmtK(best.views)} views. Make a video at that length.`}
                  />
                )
              })()}
            </ChartCard>
          )}

          {/* ── CHART 3: Upload frequency comparison ─────────────────────────────── */}
          {compVideos.length > 0 && (
            <ChartCard>
              <SectionHeader
                icon="📅"
                title="Upload Frequency — Last 6 Months"
                sub="How often you vs them upload per month"
              />
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={freqData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <XAxis dataKey="month" tick={{ fill: 'var(--sub)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--sub)', fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip contentStyle={TT}
                    formatter={(v: number, name: string) => [v, name === 'you' ? 'You' : compName]}
                    cursor={{ fill: 'rgba(124,58,237,0.08)' }}
                  />
                  <Legend formatter={(value: string) => value === 'you' ? 'You' : compName} />
                  <Bar dataKey="you" fill="var(--accent)" radius={[4,4,0,0]} maxBarSize={32} name="you" />
                  <Bar dataKey="them" fill="var(--pink)" radius={[4,4,0,0]} maxBarSize={32} name="them" opacity={0.75} />
                </BarChart>
              </ResponsiveContainer>
              <ChartConclusion
                text={`You upload ${uploadM.perWeek.toFixed(1)}x/week vs ${compName}'s ${compUploadM.perWeek.toFixed(1)}x/week. ${compUploadM.perWeek > uploadM.perWeek ? 'They post more often — increase your frequency to compete.' : 'You post more frequently — focus on quality over quantity.'}`}
              />
            </ChartCard>
          )}

          {/* ── Top 10 competitor videos ──────────────────────────────────────────── */}
          {compTop10.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <SectionHeader
                icon="🎬"
                title={`${compName}'s Top 10 Videos`}
                sub="Click any video to open it in Video Autopsy"
              />
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 16,
              }}>
                {compTop10.map((v, i) => (
                  <VideoCard
                    key={i}
                    video={v}
                    avgViews={compAvgViews}
                    onClick={() => {
                      setSelectedVideo(v)
                      navigate({ to: '/autopsy' })
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── Groq Tabs ─────────────────────────────────────────────────────────── */}
          <div className="card-base" style={{ padding: '24px 20px', marginBottom: 28 }}>
            <SectionHeader icon="🧠" title="AI Analysis" sub="Deep intelligence on your competitor" />

            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {([
                { key: 'succeed', label: '💡 Why They Succeed' },
                { key: 'gaps',    label: '🕳️ Content Gaps' },
                { key: 'steal',   label: '🎯 Steal This' },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => handleTabSwitch(tab.key)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 10,
                    border: '1px solid',
                    borderColor: activeTab === tab.key ? 'var(--accent)' : 'var(--border)',
                    background: activeTab === tab.key ? 'rgba(124,58,237,0.15)' : 'var(--card)',
                    color: activeTab === tab.key ? 'var(--accent)' : 'var(--sub)',
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: 'var(--font-body)',
                    transition: 'all 0.2s',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {groqLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Skeleton height={80} borderRadius={10} />
                <Skeleton height={80} borderRadius={10} />
                <Skeleton height={80} borderRadius={10} />
              </div>
            )}
            {groqError && <ErrorCard message={groqError} onRetry={() => loadGroq(activeTab)} />}

            {/* Tab 1: Why they succeed */}
            {!groqLoading && !groqError && activeTab === 'succeed' && (
              whyText ? (
                <div style={{
                  fontSize: 14, lineHeight: 1.7, color: 'var(--text)',
                  padding: '16px', background: 'var(--surface)', borderRadius: 12,
                  border: '1px solid var(--border)',
                }}>
                  {whyText}
                </div>
              ) : (
                <button
                  onClick={() => loadGroq('succeed')}
                  style={{
                    padding: '10px 24px', background: 'var(--grad)',
                    color: '#fff', border: 'none', borderRadius: 10,
                    fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-display)',
                  }}
                >
                  Analyze Now →
                </button>
              )
            )}

            {/* Tab 2: Content gaps */}
            {!groqLoading && !groqError && activeTab === 'gaps' && (
              gapData.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {gapData.map((gap, i) => (
                    <div key={i} style={{
                      background: 'rgba(124,58,237,0.08)',
                      border: '1px solid rgba(124,58,237,0.2)',
                      borderRadius: 12, padding: '14px 16px',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                          letterSpacing: 1, color: 'var(--accent)',
                        }}>
                          Gap #{i + 1}: {gap.gap}
                        </span>
                        <button
                          onClick={() => copyTitle(gap.title, i)}
                          style={{
                            padding: '4px 10px', borderRadius: 6,
                            background: copiedIdx === i ? 'rgba(16,185,129,0.15)' : 'rgba(124,58,237,0.15)',
                            border: `1px solid ${copiedIdx === i ? 'rgba(16,185,129,0.3)' : 'rgba(124,58,237,0.3)'}`,
                            color: copiedIdx === i ? 'var(--green)' : 'var(--accent)',
                            fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-body)',
                          }}
                        >
                          {copiedIdx === i ? '✓ Copied!' : '📋 Copy title'}
                        </button>
                      </div>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 6 }}>
                        "{gap.title}"
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--sub)' }}>{gap.reason}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <button
                  onClick={() => loadGroq('gaps')}
                  style={{
                    padding: '10px 24px', background: 'var(--grad)',
                    color: '#fff', border: 'none', borderRadius: 10,
                    fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-display)',
                  }}
                >
                  Find Content Gaps →
                </button>
              )
            )}

            {/* Tab 3: Steal this */}
            {!groqLoading && !groqError && activeTab === 'steal' && (
              tactics.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {tactics.map((t, i) => (
                    <div key={i} style={{
                      background: 'rgba(244,63,142,0.06)',
                      border: '1px solid rgba(244,63,142,0.2)',
                      borderRadius: 12, padding: '16px 18px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <span style={{
                          width: 28, height: 28, borderRadius: '50%',
                          background: 'var(--grad)', color: '#fff',
                          fontSize: 12, fontWeight: 800,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>{i + 1}</span>
                        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>
                          {t.tactic}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--sub)', marginBottom: 6 }}>
                        <span style={{ fontWeight: 600, color: 'var(--pink)' }}>Example: </span>{t.example}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text)' }}>
                        <span style={{ fontWeight: 600, color: 'var(--green)' }}>How To: </span>{t.howTo}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <button
                  onClick={() => loadGroq('steal')}
                  style={{
                    padding: '10px 24px', background: 'var(--grad)',
                    color: '#fff', border: 'none', borderRadius: 10,
                    fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-display)',
                  }}
                >
                  Steal Their Tactics →
                </button>
              )
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Stat pill ────────────────────────────────────────────────────────────────
function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      padding: '6px 12px',
      background: 'var(--surface)',
      borderRadius: 8,
      border: '1px solid var(--border)',
    }}>
      <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>
        {label}
      </span>
      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
        {value}
      </span>
    </div>
  )
}
