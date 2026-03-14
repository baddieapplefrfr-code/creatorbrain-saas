import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer, ReferenceLine } from 'recharts'

import { useChannel } from '../context/ChannelContext'
import { askGroq, sanitize, GROQ_KEY_A } from '../lib/api'
import {
  calcUploadMetrics,
  calcBestPostingDay,
  calcBestLength,
  calcHookTypes,
  calcMomentumScore,
  calcAvgViews,
  safeInt,
  formatViews,
  engagementRate,
} from '../lib/calc'

import { CommandCard } from '../components/CommandCard'
import { MetricCard } from '../components/MetricCard'
import { ScoreRing } from '../components/ScoreRing'
import { VideoCard } from '../components/VideoCard'
import { ChartConclusion } from '../components/ChartConclusion'
import { Skeleton } from '../components/Skeleton'
import { ErrorCard } from '../components/ErrorCard'
import type { YouTubeVideo, YouTubeChannel } from '../context/ChannelContext'

// ── Types ────────────────────────────────────────────────────────────────────
interface CommandData {
  command: string
  why: string
  impact: string
  priority: 'Do Today' | 'Do This Week' | 'Do This Month'
}

interface DiagnosisItem {
  id: number
  type: 'CRITICAL' | 'WARNING' | 'STRENGTH' | 'OPPORTUNITY'
  title: string
  proof: string
  plainEnglish: string
  whatToDoNow: string
  steps: string[]
  expectedResult: string
  urgency: 'Do Today' | 'Do This Week' | 'Do This Month'
}

// ── Tooltip styling ───────────────────────────────────────────────────────────
const tooltipStyle = {
  background: 'var(--card2)',
  border: '1px solid var(--border2)',
  borderRadius: 12,
  fontFamily: 'var(--font-body)',
  fontSize: 12,
  color: 'var(--text)',
}

function fmtVal(value: number): string {
  if (value >= 1e6) return (value / 1e6).toFixed(1) + 'M'
  if (value >= 1e3) return (value / 1e3).toFixed(1) + 'K'
  return String(value)
}

function yTickFmt(v: number): string {
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M'
  if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K'
  return String(v)
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState() {
  const navigate = useNavigate()
  return (
    <div style={{
      minHeight: '60vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 48 }}>📡</div>
      <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 24, color: 'var(--text)' }}>
        No channel loaded
      </h2>
      <p style={{ color: 'var(--sub)', fontSize: 15 }}>
        Connect your YouTube channel to unlock your intelligence dashboard.
      </p>
      <button
        onClick={() => navigate({ to: '/onboarding' })}
        style={{
          padding: '12px 28px',
          background: 'var(--grad)',
          color: '#fff',
          border: 'none',
          borderRadius: 12,
          fontSize: 15,
          fontWeight: 700,
          fontFamily: 'var(--font-display)',
          cursor: 'pointer',
          marginTop: 8,
        }}
      >
        Go to Onboarding →
      </button>
    </div>
  )
}

// ── CoachingCard component ────────────────────────────────────────────────────
function CoachingCard({ d, idx }: { d: DiagnosisItem; idx: number }) {
  const [expanded, setExpanded] = useState(false)
  
  const typeColors: Record<string, string> = {
    CRITICAL: 'var(--red)',
    WARNING: 'var(--gold)',
    STRENGTH: 'var(--green)',
    OPPORTUNITY: 'var(--cyan)',
  }
  const typeBg: Record<string, string> = {
    CRITICAL: 'rgba(239,68,68,0.1)',
    WARNING: 'rgba(245,158,11,0.1)',
    STRENGTH: 'rgba(16,185,129,0.1)',
    OPPORTUNITY: 'rgba(6,182,212,0.1)',
  }
  const urgencyColor = d.urgency === 'Do Today' ? 'var(--red)' : d.urgency === 'Do This Week' ? 'var(--gold)' : 'var(--muted)'
  const color = typeColors[d.type] || 'var(--accent)'
  const bg = typeBg[d.type] || 'rgba(124,58,237,0.08)'

  return (
    <div
      key={idx}
      style={{
        background: 'var(--card)',
        border: `1px solid ${color}44`,
        borderLeft: `4px solid ${color}`,
        borderRadius: 14,
        overflow: 'hidden',
      }}
    >
      {/* Collapsed header - always visible */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 18px', cursor: 'pointer',
        }}
      >
        <span style={{
          padding: '2px 10px', borderRadius: 20, fontSize: 10, fontWeight: 800,
          background: bg, color, textTransform: 'uppercase', letterSpacing: '0.5px',
          flexShrink: 0,
        }}>{d.type}</span>
        <span style={{
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14,
          color: 'var(--text)', flex: 1,
        }}>{d.title}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, color: urgencyColor,
            padding: '2px 8px', borderRadius: 10,
            background: `${urgencyColor}22`,
            textTransform: 'uppercase', letterSpacing: '0.5px',
          }}>{d.urgency}</span>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Proof line - always visible */}
      <div style={{ padding: '0 18px 10px', fontSize: 12, color: 'var(--sub)', fontStyle: 'italic' }}>
        PROOF: {d.proof}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ padding: '0 18px 18px', borderTop: `1px solid ${color}22` }}>
          <div style={{ marginTop: 14, fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>
            {d.plainEnglish}
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--pink)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 6 }}>
              WHAT TO DO NOW:
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{d.whatToDoNow}</div>
          </div>
          <div style={{ marginTop: 14 }}>
            {(d.steps || []).map((step, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
                <span style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  background: `${color}22`, border: `1px solid ${color}44`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, color,
                }}>{i + 1}</span>
                <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{step}</span>
              </div>
            ))}
          </div>
          <div style={{
            marginTop: 14, padding: '10px 14px',
            background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
            borderRadius: 10,
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '1px' }}>EXPECTED RESULT: </span>
            <span style={{ fontSize: 13, color: 'var(--text)' }}>{d.expectedResult}</span>
          </div>
        </div>
      )}
    </div>
  )
}


// ── Main component ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { channel, videos, setSelectedVideo } = useChannel()
  const navigate = useNavigate()

  const [command, setCommand] = useState<CommandData | null>(null)
  const [cmdLoading, setCmdLoading] = useState(false)
  const [cmdError, setCmdError] = useState<string | null>(null)

  const [diagnoses, setDiagnoses] = useState<DiagnosisItem[]>([])
  const [diagLoading, setDiagLoading] = useState(false)
  const [diagError, setDiagError] = useState<string | null>(null)

  // ── Guard: compute derived values (safe with empty arrays) ────────────────────
  const ch = channel as YouTubeChannel | null
  const uploadM = calcUploadMetrics(videos)
  const bestDay = calcBestPostingDay(videos)
  const lengths = calcBestLength(videos)
  const hooks = calcHookTypes(videos)
  const momentum = calcMomentumScore(videos, uploadM)
  const avgViews = calcAvgViews(videos)

  const sorted = [...videos].sort(
    (a, b) => safeInt(b.statistics?.viewCount) - safeInt(a.statistics?.viewCount)
  )
  const topVideo: YouTubeVideo | undefined = sorted[0]
  const worstVideo: YouTubeVideo | undefined = sorted[sorted.length - 1]

  const recent5 = [...videos]
    .sort((a, b) => new Date(b.snippet.publishedAt).getTime() - new Date(a.snippet.publishedAt).getTime())
    .slice(0, 5)
  const recentAvg = calcAvgViews(recent5)
  const trend: 'growing' | 'declining' | 'stable' =
    recentAvg > avgViews * 1.1 ? 'growing' :
    recentAvg < avgViews * 0.9 ? 'declining' :
    'stable'

  const totalEngRate = videos.length
    ? videos.reduce((s, v) => s + engagementRate(v), 0) / videos.length
    : 0
  const engColor = totalEngRate > 2 ? 'var(--green)' : totalEngRate > 1 ? 'var(--gold)' : 'var(--red)'

  // ── Chart data (last 20 videos by date) ──────────────────────────────────────
  const chartVideos = [...videos]
    .sort((a, b) => new Date(a.snippet.publishedAt).getTime() - new Date(b.snippet.publishedAt).getTime())
    .slice(-20)

  const chartData = chartVideos.map(v => {
    const date = new Date(v.snippet.publishedAt)
    const label = `${date.getMonth() + 1}/${date.getDate()}`
    const views = safeInt(v.statistics?.viewCount)
    return { label, views, title: v.snippet.title }
  })

  const olderVideos = videos.slice(5)
  const olderAvg = calcAvgViews(olderVideos)
  const viewTrend: 'growing' | 'declining' | 'stable' = 
    recentAvg > avgViews * 1.1 ? 'growing' :
    recentAvg < avgViews * 0.9 ? 'declining' : 'stable'
  const topHook = hooks[0]
  const worstHook = hooks[hooks.length - 1]
  const bestLength = lengths[0]
  const worstLength = lengths[lengths.length - 1]
  const totalEngRateCalc = videos.reduce((s, v) => s + engagementRate(v), 0) / Math.max(videos.length, 1)
  // Suppress unused variable warnings
  void olderVideos; void olderAvg; void viewTrend; void topHook; void worstHook; void bestLength; void worstLength; void totalEngRateCalc

    // ── Groq: CommandCard ─────────────────────────────────────────────────────────
  const loadCommand = useCallback(async () => {
    if (!ch || !topVideo) return
    try {
      setCmdLoading(true)
      setCmdError(null)

      const sys = "YouTube growth coach. One exact command. Must start with action verb (Post/Make/Cut/Stop/Fix/Use/Record/Change/Add/Upload). Must name specific day of week. Must include real number. Never say analyze/consider/review. Return valid JSON only."

      const user = `Ch: ${sanitize(ch.snippet.title, 30)}, ${formatViews(safeInt(ch.statistics.subscriberCount))}subs, ${videos.length}vids\nAvg: ${Math.round(avgViews)}v\nBest day: ${bestDay.best.day}(${Math.round(bestDay.best.avg)}v)\nWorst: ${bestDay.worst.day}(${Math.round(bestDay.worst.avg)}v)\nTop: "${sanitize(topVideo.snippet.title, 40)}"(${safeInt(topVideo.statistics?.viewCount)}v)\nBestLen: ${lengths[0]?.label}(${Math.round(lengths[0]?.avg || 0)}v)\nBestHook: ${hooks[0]?.type}(${Math.round(hooks[0]?.avg || 0)}v)\nTrend: ${trend}\nJSON: {"command":string,"why":string,"impact":string,"priority":"Do Today"|"Do This Week"|"Do This Month"}`

      const data = await askGroq(sys, user, true, GROQ_KEY_A) as CommandData
      setCommand(data)
    } catch (e: unknown) {
      const msg = (e as Error).message || 'Something went wrong'
      setCmdError(
        msg.includes('decommissioned') ? 'AI model updated — refresh' :
        msg.includes('rate_limit') ? 'Too many requests — wait 30s' :
        msg
      )
    } finally {
      setCmdLoading(false)
    }
  }, [ch, videos.length, avgViews, bestDay, lengths, hooks, trend, topVideo])

  // ── Groq: Diagnosis ───────────────────────────────────────────────────────────
  const loadDiagnosis = useCallback(async () => {
    if (!ch) return
    try {
      setDiagLoading(true)
      setDiagError(null)

      const sys = `YouTube channel coach. Every insight MUST reference the specific video titles, exact numbers, or specific days given. Generic advice = failure. Return JSON array only.`

      const engAvg = videos.reduce((s, v) => s + engagementRate(v), 0) / Math.max(videos.length, 1)
      const user = `Coach this YouTube channel:
Name: ${sanitize(ch.snippet.title, 35)}
Subs: ${safeInt(ch.statistics.subscriberCount)}
Avg views: ${Math.round(avgViews)}, recent avg: ${Math.round(recentAvg)}
Trend: ${trend}
Best posting day: ${bestDay.best.day} (${Math.round(bestDay.best.avg)}v)
Worst day: ${bestDay.worst.day} (${Math.round(bestDay.worst.avg)}v)
Best video length: ${lengths[0]?.label || 'unknown'} (${Math.round(lengths[0]?.avg || 0)}v)
Worst length: ${lengths[lengths.length-1]?.label || 'unknown'} (${Math.round(lengths[lengths.length-1]?.avg || 0)}v)
Best hook type: ${hooks[0]?.type || 'unknown'} (${Math.round(hooks[0]?.avg || 0)}v)
Worst hook type: ${hooks[hooks.length-1]?.type || 'unknown'} (${Math.round(hooks[hooks.length-1]?.avg || 0)}v)
Top video: "${sanitize(topVideo?.snippet?.title || '', 50)}"
Worst video: "${sanitize(worstVideo?.snippet?.title || '', 50)}"
Upload gap: ${Math.round(uploadM.avgGap)}d, consistency: ${Math.round(uploadM.consistency)}%
Engagement avg: ${engAvg.toFixed(2)}%

Give 5 coaching insights. Each MUST reference real numbers or video titles above.
Return JSON array of 5:
[{"id":1,"type":"CRITICAL"|"WARNING"|"STRENGTH"|"OPPORTUNITY","title":"short name (max 6 words)","proof":"exact metric proving this","plainEnglish":"2 sentences: what this means and why it matters","whatToDoNow":"single most important action (action verb, specific)","steps":["step 1","step 2","step 3"],"expectedResult":"what will change and estimated improvement","urgency":"Do Today"|"Do This Week"|"Do This Month"}]`

      const data = await askGroq(sys, user, true, GROQ_KEY_A) as DiagnosisItem[]
      setDiagnoses(Array.isArray(data) ? data.slice(0, 5) : [])
    } catch (e: unknown) {
      const msg = (e as Error).message || 'Something went wrong'
      setDiagError(
        msg.includes('decommissioned') ? 'AI model updated — refresh' :
        msg.includes('rate_limit') ? 'Too many requests — wait 30s' :
        msg
      )
    } finally {
      setDiagLoading(false)
    }
  }, [ch, avgViews, recentAvg, trend, uploadM, totalEngRate, bestDay, lengths, hooks, topVideo, worstVideo, videos]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Effects ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (ch && videos.length) {
      loadCommand()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!cmdLoading && (command !== null || cmdError !== null) && ch && videos.length) {
      loadDiagnosis()
    }
  }, [cmdLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Guard render ──────────────────────────────────────────────────────────────
  if (!videos.length || !ch) return <EmptyState />

  // ── Chart conclusion text ─────────────────────────────────────────────────────
  const peakItem = chartData.length
    ? chartData.reduce((best, item) => item.views > best.views ? item : best, chartData[0])
    : null
  const chartConclusion = peakItem
    ? `Best on ${peakItem.label}: ${fmtVal(peakItem.views)} views. ${trend === 'growing' ? 'Channel trending up — double down on recent formats.' : trend === 'declining' ? 'Views dropping — time to change content strategy.' : 'Views stable — test new hooks to break through.'}`
    : 'Not enough data to draw a conclusion.'

  // ── Avg views ratio ───────────────────────────────────────────────────────────
  const topRatio = topVideo ? safeInt(topVideo.statistics?.viewCount) / Math.max(avgViews, 1) : 1
  const avgViewsAction = topRatio > 5
    ? 'Massive outlier — reverse-engineer your top video'
    : topRatio > 2
    ? 'Top video 2x avg — replicate that formula'
    : 'Consistent performance — try new hooks to spike'

  return (
    <div className="page-enter">
      {/* ── Page title ─────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 900,
          fontSize: 28,
          color: 'var(--text)',
          marginBottom: 6,
          lineHeight: 1.2,
        }}>
          {ch.snippet.title}{' '}
          <span style={{ color: 'var(--sub)', fontWeight: 400, fontSize: 20 }}>
            Intelligence Dashboard
          </span>
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 12,
            color: trend === 'growing' ? 'var(--green)' : trend === 'declining' ? 'var(--red)' : 'var(--gold)',
            fontWeight: 700,
            background: trend === 'growing'
              ? 'rgba(16,185,129,0.1)'
              : trend === 'declining'
              ? 'rgba(239,68,68,0.1)'
              : 'rgba(245,158,11,0.1)',
            padding: '3px 10px',
            borderRadius: 20,
          }}>
            {trend === 'growing' ? '↑ Growing' : trend === 'declining' ? '↓ Declining' : '→ Stable'}
          </span>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            {videos.length} videos analyzed
          </span>
        </div>
      </div>

      {/* ── CommandCard ─────────────────────────────────────────────────────────── */}
      {cmdLoading ? (
        <Skeleton height={110} borderRadius={16} style={{ marginBottom: 24 }} />
      ) : cmdError ? (
        <div style={{ marginBottom: 24 }}>
          <ErrorCard message={cmdError} onRetry={loadCommand} />
        </div>
      ) : command ? (
        <CommandCard
          command={command.command}
          why={command.why}
          impact={command.impact}
          priority={command.priority}
        />
      ) : null}

      {/* ── Score ring + Metric cards ─────────────────────────────────────────── */}
      <div className="dash-metrics-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        gap: 20,
        marginBottom: 28,
        alignItems: 'start',
      }}>
        {/* ScoreRing card */}
        <div className="card-base" style={{
          padding: '24px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          minWidth: 170,
        }}>
          <ScoreRing score={momentum} size={140} label="Momentum" />
          <div style={{
            fontSize: 11,
            color: 'var(--muted)',
            textAlign: 'center',
            marginTop: 4,
            maxWidth: 130,
            lineHeight: 1.4,
          }}>
            Views, engagement &amp; upload frequency
          </div>
        </div>

        {/* 4 metric cards */}
        <div className="dash-metric-cards" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 14,
        }}>
          <MetricCard
            label="Total Views"
            value={formatViews(safeInt(ch.statistics.viewCount))}
            benchmark={`Channel has ${safeInt(ch.statistics.videoCount)} total videos`}
            action="Focus on top format"
          />
          <MetricCard
            label="Avg Views / Video"
            value={formatViews(Math.round(avgViews))}
            benchmark={topVideo ? `Top video: ${Math.round(topRatio)}x channel avg` : 'No videos yet'}
            action={avgViewsAction}
          />
          <MetricCard
            label="Avg Engagement"
            value={`${totalEngRate.toFixed(2)}%`}
            benchmark={totalEngRate > 2 ? 'Above average ✓' : totalEngRate > 1 ? 'Below industry avg' : 'Needs improvement'}
            action={totalEngRate > 2 ? 'Engagement strong — keep CTAs' : 'Add a clear CTA every video'}
            color={engColor}
          />
          <MetricCard
            label="Consistency"
            value={`${Math.round(uploadM.consistency)}%`}
            benchmark={`Last upload: ${uploadM.lastUploadDaysAgo}d ago`}
            action={`Post every ${Math.round(uploadM.avgGap)} days`}
            color={uploadM.consistency > 70 ? 'var(--green)' : uploadM.consistency > 40 ? 'var(--gold)' : 'var(--red)'}
          />
        </div>
      </div>

      {/* ── Channel Coach Report ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800, fontSize: 18, color: 'var(--text)', marginBottom: 4,
          }}>
            🎯 Your Channel Coach Report
          </h2>
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>
            What's actually holding you back — with specific proof and exact steps
          </p>
        </div>

        {diagLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Skeleton height={56} borderRadius={12} />
            <Skeleton height={56} borderRadius={12} />
            <Skeleton height={56} borderRadius={12} />
            <Skeleton height={56} borderRadius={12} />
            <Skeleton height={56} borderRadius={12} />
          </div>
        )}

        {diagError && (
          <ErrorCard message={diagError} onRetry={loadDiagnosis} />
        )}

        {!diagLoading && !diagError && diagnoses.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {diagnoses.map((d, i) => (
              <CoachingCard key={i} d={d} idx={i} />
            ))}
          </div>
        )}
      </div>

      {/* ── Views bar chart ───────────────────────────────────────────────────── */}
      <div className="card-base" style={{ padding: '24px 20px', marginBottom: 28 }}>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: 18,
          color: 'var(--text)',
          marginBottom: 4,
        }}>
          📈 Recent Performance
        </h2>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20 }}>
          Last {chartData.length} videos — green = above avg, gold = near avg, red = below avg
        </p>

        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--sub)', fontSize: 11, fontFamily: 'var(--font-body)' }}
              axisLine={false}
              tickLine={false}
              interval={Math.max(0, Math.floor(chartData.length / 8) - 1)}
            />
            <YAxis
              tickFormatter={yTickFmt}
              tick={{ fill: 'var(--sub)', fontSize: 11, fontFamily: 'var(--font-body)' }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value: number) => [fmtVal(value), 'Views']}
              labelFormatter={(label: string) => `Date: ${label}`}
              cursor={{ fill: 'rgba(124,58,237,0.08)' }}
            />
            <ReferenceLine
              y={avgViews}
              stroke="var(--accent)"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{ value: 'avg', fill: 'var(--accent)', fontSize: 10 }}
            />
            <Bar dataKey="views" radius={[4, 4, 0, 0]} maxBarSize={40}>
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={
                    entry.views > avgViews * 1.2 ? 'var(--green)' :
                    entry.views > avgViews * 0.8 ? 'var(--gold)' :
                    'var(--red)'
                  }
                  opacity={0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        <ChartConclusion text={chartConclusion} />
      </div>

      {/* ── Best vs Worst ─────────────────────────────────────────────────────── */}
      {topVideo && worstVideo && (
        <div style={{ marginBottom: 28 }}>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 18,
            color: 'var(--text)',
            marginBottom: 14,
          }}>
            🏆 Best vs Worst
          </h2>

          <div className="best-worst-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Top video */}
            <div style={{ position: 'relative' }}>
              <div style={{
                position: 'absolute',
                top: -10,
                left: 12,
                zIndex: 10,
                padding: '4px 12px',
                background: 'var(--green)',
                color: '#fff',
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.5px',
                boxShadow: '0 2px 8px rgba(16,185,129,0.4)',
              }}>
                ✨ REMAKE THIS
              </div>
              <VideoCard
                video={topVideo}
                avgViews={avgViews}
                onClick={() => {
                  setSelectedVideo(topVideo)
                  navigate({ to: '/autopsy' })
                }}
              />
            </div>

            {/* Worst video */}
            <div style={{ position: 'relative' }}>
              <div style={{
                position: 'absolute',
                top: -10,
                left: 12,
                zIndex: 10,
                padding: '4px 12px',
                background: 'var(--red)',
                color: '#fff',
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.5px',
                boxShadow: '0 2px 8px rgba(239,68,68,0.4)',
              }}>
                ⚠️ AVOID THIS FORMAT
              </div>
              <VideoCard
                video={worstVideo}
                avgViews={avgViews}
                onClick={() => {
                  setSelectedVideo(worstVideo)
                  navigate({ to: '/autopsy' })
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── All Videos ────────────────────────────────────────────────────────── */}
      <div>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: 18,
          color: 'var(--text)',
          marginBottom: 14,
        }}>
          🎬 All Videos
          <span style={{
            marginLeft: 10,
            fontSize: 13,
            fontFamily: 'var(--font-body)',
            fontWeight: 400,
            color: 'var(--muted)',
          }}>
            {videos.length} total — click to autopsy
          </span>
        </h2>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 14,
        }}>
          {videos.map(video => (
            <VideoCard
              key={video.id}
              video={video}
              avgViews={avgViews}
              onClick={() => {
                setSelectedVideo(video)
                navigate({ to: '/autopsy' })
              }}
            />
          ))}
        </div>
      </div>

      {/* ── Responsive styles ─────────────────────────────────────────────────── */}
      <style>{`
        @media (max-width: 960px) {
          .dash-metrics-grid {
            grid-template-columns: 1fr !important;
          }
        }
        @media (max-width: 600px) {
          .dash-metric-cards {
            grid-template-columns: 1fr !important;
          }
          .best-worst-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}
