import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer,
  ScatterChart, Scatter, ReferenceLine,
} from 'recharts'
import { useChannel } from '../context/ChannelContext'
import { askGroq, sanitize, GROQ_KEY_B } from '../lib/api'
import {
  calcHookTypes, calcAvgViews, formatViews, safeInt, engagementRate, parseISO8601,
} from '../lib/calc'
import { CommandCard } from '../components/CommandCard'
import { ChartConclusion } from '../components/ChartConclusion'
import { VideoCard } from '../components/VideoCard'
import { MiniBar } from '../components/MiniBar'
import { Skeleton } from '../components/Skeleton'
import { ErrorCard } from '../components/ErrorCard'
import type { YouTubeVideo } from '../context/ChannelContext'

const tooltipStyle = {
  background: 'var(--card2)',
  border: '1px solid var(--border2)',
  borderRadius: 12,
  fontFamily: 'Plus Jakarta Sans',
  fontSize: 12,
  color: 'var(--text)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
}
const axisProps = {
  tick: { fill: 'var(--sub)', fontSize: 11, fontFamily: 'Plus Jakarta Sans' },
  axisLine: false as const,
  tickLine: false as const,
}
function fmt(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M'
  if (v >= 1_000) return (v / 1_000).toFixed(0) + 'K'
  return String(Math.round(v))
}

interface HookInsight { insight: string; action: string; impact: string }

// Classify hook type from title
function calcHookType(t: string): string {
  const s = (t || '').toLowerCase()
  if (/\b(i |my |how i |when i )/.test(s)) return 'Story Hook'
  if (/\d+\s*(ways|things|tips|mistakes|tools|apps|steps|reasons)/.test(s)) return 'Number Hook'
  if (/\?$/.test(s.trim())) return 'Question Hook'
  if (/\b(why|wrong|stop|never|mistake|truth|honest|quit)/.test(s)) return 'Reveal Hook'
  if (/\b(vs|versus|challenge|battle|beats|beat)/.test(s)) return 'Challenge Hook'
  if (/\b(secret|nobody|hidden|they don|what they)/.test(s)) return 'Reveal Hook'
  if (/^how to\b/i.test(s)) return 'Tutorial Hook'
  return 'Other'
}

const HOOK_COLORS = [
  'var(--green)', 'var(--cyan)', 'var(--accent)',
  'var(--gold)', 'var(--pink)', 'var(--red)',
]

export default function Hooks() {
  const { channel, videos } = useChannel()
  const navigate = useNavigate()
  const [insights, setInsights] = useState<HookInsight[]>([])
  const [loadingInsights, setLoadingInsights] = useState(false)
  const [insightError, setInsightError] = useState<string | null>(null)

  useEffect(() => {
    if (!channel) navigate({ to: '/onboarding' })
  }, [channel, navigate])

  useEffect(() => {
    if (!channel || !videos.length) return
    const hooks = calcHookTypes(videos)
    if (hooks.length < 2) return

    setLoadingInsights(true)
    setInsightError(null)

    const hookSummary = hooks.slice(0, 6).map(h =>
      `${sanitize(h.type, 30)}: avg ${Math.round(h.avg || 0)} views (${h.count} videos)`
    ).join(', ')

    askGroq(
      'YouTube strategy expert. Give 3 strategic insights about hook performance. Be specific with exact numbers and actionable next steps. Return JSON only.',
      `Hook performance for "${sanitize(channel.snippet.title, 30)}": ${hookSummary}. Give 3 strategic insights and specific next steps. JSON:[{"insight":str,"action":str,"impact":str}]`,
      true,
      GROQ_KEY_B
    )
      .then(r => setInsights(r as HookInsight[]))
      .catch(e => {
        const msg = (e as Error).message || 'Could not load insights'
        if (msg.includes('decommissioned')) setInsightError('AI model updated — refresh')
        else if (msg.includes('rate_limit')) setInsightError('Too many requests — wait 30s')
        else setInsightError(msg)
      })
      .finally(() => setLoadingInsights(false))
  }, [channel, videos])

  if (!channel || !videos.length) {
    return (
      <div className="page-enter" style={{ padding: 40, textAlign: 'center', color: 'var(--sub)' }}>
        <p>No channel loaded. <button onClick={() => navigate({ to: '/onboarding' })} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, textDecoration: 'underline' }}>Go back</button></p>
      </div>
    )
  }

  const hooks = calcHookTypes(videos)
  const avgV = calcAvgViews(videos)
  const best = hooks[0]
  const worst = hooks[hooks.length - 1]
  const ratio = best && worst && worst.avg > 0 ? (best.avg / worst.avg).toFixed(1) : '1'

  const barData = [...hooks].sort((a, b) => b.avg - a.avg)
  const maxAvg = Math.max(...barData.map(h => h.avg), 1)

  // Scatter: each video → hook index vs views
  const hookTypeList = barData.map(h => h.type)
  const scatterData = videos.map(v => ({
    hookIdx: hookTypeList.indexOf(calcHookType(v.snippet?.title || '')),
    hookType: calcHookType(v.snippet?.title || ''),
    views: safeInt(v.statistics?.viewCount),
    eng: engagementRate(v),
    dur: parseISO8601(v.contentDetails?.duration) / 60,
    title: (v.snippet?.title || '').slice(0, 40),
  })).filter(d => d.views > 0 && d.hookIdx >= 0)

  // Best video per hook type
  const bestVideoPerHook: Record<string, YouTubeVideo> = {}
  for (const h of barData) {
    const vids = videos
      .filter(v => calcHookType(v.snippet?.title || '') === h.type)
      .sort((a, b) => safeInt(b.statistics?.viewCount) - safeInt(a.statistics?.viewCount))
    if (vids[0]) bestVideoPerHook[h.type] = vids[0]
  }

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 900, color: 'var(--text)', marginBottom: 4 }}>
          🪝 Hook Library
        </h1>
        <p style={{ color: 'var(--sub)', fontSize: 14 }}>Which opening styles get you the most views on your channel</p>
      </div>

      {/* CommandCard */}
      {best && (
        <CommandCard
          command={`Use ${best.type} hooks in your next video — they avg ${formatViews(Math.round(best.avg || 0))} views`}
          why={`Based on real analysis of ${videos.length} videos across ${hooks.length} hook types`}
          impact={`${((best.avg || 1) / (worst?.avg || 1)).toFixed(1)}x more views than your worst hook type`}
          priority="Do Today"
        />
      )}

      {/* Bar Chart */}
      <div className="card-base" style={{ padding: '24px 28px' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: 'var(--text)', marginBottom: 4 }}>
          Hook Performance
        </h2>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20 }}>Average views per hook type — sorted best to worst</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={barData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <XAxis dataKey="type" {...axisProps} />
            <YAxis {...axisProps} tickFormatter={fmt} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v: number) => [fmt(v), 'Avg Views']}
              labelFormatter={(l: string) => `Hook: ${l}`}
            />
            <ReferenceLine y={avgV} stroke="var(--border2)" strokeDasharray="4 4" label={{ value: 'Your avg', fill: 'var(--sub)', fontSize: 11 }} />
            <Bar dataKey="avg" name="Avg Views" radius={[6, 6, 0, 0]} isAnimationActive animationDuration={1000}>
              {barData.map((_, i) => {
                const pct = i / Math.max(barData.length - 1, 1)
                return <Cell key={i} fill={pct < 0.33 ? 'var(--green)' : pct < 0.66 ? 'var(--gold)' : 'var(--red)'} />
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {best && worst && (
          <ChartConclusion text={`Use ${best.type} hooks exclusively — they average ${formatViews(Math.round(best.avg))} views vs ${formatViews(Math.round(worst.avg))} for ${worst.type}. That's ${ratio}x more views for just changing your title formula.`} />
        )}
      </div>

      {/* Hook Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {barData.map((h, i) => {
          const isTop = i === 0
          const isBottom = i === barData.length - 1
          const hookColor = HOOK_COLORS[i % HOOK_COLORS.length]
          const bestVid = bestVideoPerHook[h.type]
          return (
            <div key={h.type} style={{
              background: 'var(--card)',
              border: `1px solid ${isTop ? 'rgba(16,185,129,0.4)' : isBottom ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
              borderRadius: 14,
              padding: '18px 18px',
              transition: 'all 0.2s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: 'var(--text)' }}>{h.type}</span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {isTop && <span style={{ padding: '2px 8px', background: 'rgba(16,185,129,0.15)', color: 'var(--green)', borderRadius: 20, fontSize: 10, fontWeight: 700 }}>BEST</span>}
                  {isBottom && <span style={{ padding: '2px 8px', background: 'rgba(239,68,68,0.15)', color: 'var(--red)', borderRadius: 20, fontSize: 10, fontWeight: 700 }}>WORST</span>}
                  <span style={{ padding: '2px 8px', background: `${hookColor}18`, color: hookColor, borderRadius: 20, fontSize: 10, fontWeight: 600 }}>
                    {h.count} video{h.count !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 900, color: isTop ? 'var(--green)' : isBottom ? 'var(--red)' : 'var(--text)', marginBottom: 2 }}>
                {formatViews(Math.round(h.avg))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 12 }}>avg views</div>

              <MiniBar value={h.avg} max={maxAvg} color={isTop ? 'var(--green)' : isBottom ? 'var(--red)' : 'var(--gold)'} height={5} />

              {bestVid && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>
                    Best example
                  </div>
                  <VideoCard video={bestVid} avgViews={avgV} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Scatter Chart */}
      <div className="card-base" style={{ padding: '24px 28px' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: 'var(--text)', marginBottom: 4 }}>
          Video Length vs Views by Hook Type
        </h2>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20 }}>Each dot = one video. Hover for details.</p>
        <ResponsiveContainer width="100%" height={260}>
          <ScatterChart margin={{ top: 4, right: 16, left: 0, bottom: 24 }}>
            <XAxis
              dataKey="dur"
              name="Duration (min)"
              {...axisProps}
              tickFormatter={v => `${(v as number).toFixed(0)}m`}
              label={{ value: 'Duration (min)', position: 'insideBottom', offset: -12, fill: 'var(--muted)', fontSize: 11 }}
            />
            <YAxis dataKey="views" name="Views" {...axisProps} tickFormatter={fmt} />
            <Tooltip
              contentStyle={tooltipStyle}
              cursor={{ strokeDasharray: '2 4', stroke: 'var(--border2)' }}
              content={({ payload }) => {
                if (!payload?.length) return null
                const d = payload[0]?.payload as typeof scatterData[0]
                return (
                  <div style={{ ...tooltipStyle, padding: '10px 14px' } as React.CSSProperties}>
                    <div style={{ fontWeight: 700, marginBottom: 4, color: 'var(--text)' }}>{d.title}</div>
                    <div style={{ color: 'var(--sub)' }}>Views: {fmt(d.views)}</div>
                    <div style={{ color: 'var(--sub)' }}>Duration: {d.dur.toFixed(1)}m</div>
                    <div style={{ color: 'var(--cyan)' }}>Hook: {d.hookType}</div>
                  </div>
                )
              }}
            />
            {hookTypeList.map((ht, i) => (
              <Scatter
                key={ht}
                name={ht}
                data={scatterData.filter(d => d.hookType === ht)}
                fill={HOOK_COLORS[i % HOOK_COLORS.length]}
                fillOpacity={0.75}
                isAnimationActive
                animationDuration={1000}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
        {best && (
          <ChartConclusion text={`${best.type} hooks perform best on your channel — align your next video title to this formula.`} />
        )}
      </div>

      {/* AI Insights */}
      <div className="card-base" style={{ padding: '24px 28px' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: 'var(--text)', marginBottom: 16 }}>
          🧠 3 Strategic Insights
        </h2>
        {loadingInsights ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Skeleton height={80} borderRadius={12} />
            <Skeleton height={80} borderRadius={12} />
            <Skeleton height={80} borderRadius={12} />
          </div>
        ) : insightError ? (
          <ErrorCard message={insightError} onRetry={() => setInsightError(null)} />
        ) : insights.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {insights.slice(0, 3).map((ins, i) => (
              <div key={i} style={{
                padding: '16px 18px',
                background: 'var(--card2)',
                border: `1px solid ${i === 0 ? 'rgba(124,58,237,0.3)' : 'var(--border)'}`,
                borderLeft: `3px solid ${HOOK_COLORS[i % HOOK_COLORS.length]}`,
                borderRadius: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                    background: `${HOOK_COLORS[i % HOOK_COLORS.length]}22`,
                    border: `1px solid ${HOOK_COLORS[i % HOOK_COLORS.length]}44`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 12,
                    color: HOOK_COLORS[i % HOOK_COLORS.length],
                  }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6, lineHeight: 1.5 }}>
                      {ins.insight}
                    </div>
                    {ins.action && (
                      <div style={{ fontSize: 12, color: 'var(--cyan)', marginBottom: 4 }}>
                        <span style={{ fontWeight: 600 }}>ACTION: </span>{ins.action}
                      </div>
                    )}
                    {ins.impact && (
                      <div style={{ fontSize: 12, color: 'var(--green)' }}>
                        <span style={{ fontWeight: 600 }}>IMPACT: </span>{ins.impact}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 14, color: 'var(--muted)', textAlign: 'center', padding: 20 }}>
            Add more videos with different hook types to get strategic insights.
          </div>
        )}
      </div>
    </div>
  )
}
