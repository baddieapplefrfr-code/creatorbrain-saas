import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer, ReferenceLine,
  ComposedChart, Line, AreaChart, Area, ScatterChart, Scatter,
} from 'recharts'

import { useChannel } from '../context/ChannelContext'
import { askGroq, sanitize, GROQ_KEY_A } from '../lib/api'
import {
  calcUploadMetrics,
  calcBestPostingDay,
  calcBestLength,
  calcHookTypes,
  calcAvgViews,
  safeInt,
  formatViews,
  engagementRate,
  parseISO8601,
} from '../lib/calc'

import { CommandCard } from '../components/CommandCard'
import { ChartConclusion } from '../components/ChartConclusion'
import { Skeleton } from '../components/Skeleton'
import { ErrorCard } from '../components/ErrorCard'
import type { YouTubeVideo } from '../context/ChannelContext'

// ── Shared tooltip style ────────────────────────────────────────────────────
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
  if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K'
  return String(Math.round(v))
}

// Section header component
function SectionHeader({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h2 style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 800, fontSize: 20, color: 'var(--text)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        {icon} {title}
      </h2>
      {sub && <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{sub}</p>}
    </div>
  )
}

// Chart container card
function ChartCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="card-base" style={{ padding: '24px 20px', marginBottom: 28 }}>
      {children}
    </div>
  )
}

// Hook-type classifier for a video title
function classifyHook(title: string): string {
  if (/\?/.test(title)) return 'Question Hook'
  if (/^\d+|\w+ \d+/.test(title)) return 'Number Hook'
  if (/\b(how i|how we|why i|my|story|journey|tried|spent|lived)\b/i.test(title)) return 'Story Hook'
  if (/\b(secret|truth|real|actually|finally|honest)\b/i.test(title)) return 'Reveal Hook'
  if (/\b(vs|versus|challenge|battle|beats|beat)\b/i.test(title)) return 'Challenge Hook'
  if (/\b(how to|guide|tutorial|step|learn|master)\b/i.test(title)) return 'Tutorial Hook'
  return 'Generic Hook'
}

function durationBucket(seconds: number): string {
  if (seconds < 180) return '<3 min'
  if (seconds < 480) return '3-8 min'
  if (seconds < 1200) return '8-20 min'
  return '20+ min'
}

// ── Empty state ──────────────────────────────────────────────────────────────
function InsufficientData() {
  const navigate = useNavigate()
  return (
    <div style={{
      minHeight: '60vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 16, textAlign: 'center',
    }}>
      <div style={{ fontSize: 56 }}>📊</div>
      <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 24, color: 'var(--text)' }}>
        Need at least 3 videos
      </h2>
      <p style={{ color: 'var(--sub)', fontSize: 15, maxWidth: 420 }}>
        The Insights Cockpit requires at least 3 uploaded videos to generate meaningful patterns and analytics.
      </p>
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

// ── Coach Says box ───────────────────────────────────────────────────────────
function CoachSays({ lines }: { lines: string[] }) {
  return (
    <div style={{
      marginTop: 16,
      padding: '14px 18px',
      background: 'rgba(244,63,142,0.07)',
      border: '1px solid rgba(244,63,142,0.25)',
      borderLeft: '3px solid var(--pink)',
      borderRadius: 10,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 800, color: 'var(--pink)',
        textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 10,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        🎯 COACH SAYS
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {lines.map((line, i) => (
          <div key={i} style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
            {line.startsWith('→') ? (
              <><span style={{ color: 'var(--green)', fontWeight: 700 }}>{line.slice(0, 1)}</span>{line.slice(1)}</>
            ) : line}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Groq insight pills ───────────────────────────────────────────────────────
interface InsightPill { pattern: string; rule: string; avoid: string }

// ── Main Component ───────────────────────────────────────────────────────────
export default function Insights() {
  const { videos } = useChannel()

  const [groqInsight, setGroqInsight] = useState<InsightPill | null>(null)
  const [groqLoading, setGroqLoading] = useState(false)
  const [groqError, setGroqError] = useState<string | null>(null)

  // All hooks MUST be before any early return (React rules)
  // Calculations are safe to compute even with empty arrays
  const uploadM_   = calcUploadMetrics(videos)
  const bestDay_   = calcBestPostingDay(videos)
  const lengths_   = calcBestLength(videos)
  const hooks_     = calcHookTypes(videos)
  const avgViews_  = calcAvgViews(videos)

  const sortedByViews_ = [...videos].sort((a, b) =>
    safeInt(b.statistics?.viewCount) - safeInt(a.statistics?.viewCount)
  )

  const loadGroq = useCallback(async () => {
    if (videos.length < 3) return
    const top5_    = sortedByViews_.slice(0, 5)
    const bottom5_ = sortedByViews_.slice(-5).reverse()
    try {
      setGroqLoading(true)
      setGroqError(null)
      const sys = 'YouTube analyst. Pattern-match best vs worst videos. JSON only.'
      const user = `Best 5: ${top5_.map(v => sanitize(v.snippet.title, 40)).join(', ')}\nWorst 5: ${bottom5_.map(v => sanitize(v.snippet.title, 40)).join(', ')}\nJSON:{"pattern":str,"rule":str,"avoid":str}`
      const data = await askGroq(sys, user, true, GROQ_KEY_A) as InsightPill
      setGroqInsight(data)
    } catch (e: unknown) {
      const msg = (e as Error).message || 'Something went wrong'
      setGroqError(msg.includes('rate_limit') ? 'Too many requests — wait 30s' : msg)
    } finally {
      setGroqLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos.length])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (videos.length >= 3) loadGroq() }, [videos.length])

  // Guard — after all hooks
  if (videos.length < 3) return <InsufficientData />

  // ── Alias pre-computed values (computed before guard above) ───────────────
  const uploadM  = uploadM_
  const bestDay  = bestDay_
  const lengths  = lengths_
  const hooks    = hooks_
  const avgViews = avgViews_

  // Sort by views
  const top5    = sortedByViews_.slice(0, 5)
  const bottom5 = sortedByViews_.slice(-5).reverse()

  // ── CHART 1: Hook performance ─────────────────────────────────────────────
  const hookData = [...hooks].sort((a, b) => b.avg - a.avg)
  const hookTop3 = Math.ceil(hookData.length / 3)
  const hookBot3 = Math.floor(hookData.length * 2 / 3)
  function hookColor(idx: number) {
    if (idx < hookTop3) return 'var(--green)'
    if (idx < hookBot3) return 'var(--gold)'
    return 'var(--red)'
  }

  // ── CHART 2: Timing heatmap ───────────────────────────────────────────────
  const timeSlots = ['6am','9am','12pm','3pm','6pm','9pm','Night']
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const heatmapData: Record<string, Record<string, {views:number;count:number}>> = {}
  DAYS.forEach(d => {
    heatmapData[d] = {}
    timeSlots.forEach(t => { heatmapData[d][t] = { views: 0, count: 0 } })
  })
  videos.forEach(v => {
    const date = new Date(v.snippet.publishedAt)
    const day  = DAYS[date.getDay()]
    const h    = date.getHours()
    const slot = h < 9 ? '6am' : h < 12 ? '9am' : h < 15 ? '12pm' : h < 18 ? '3pm' : h < 21 ? '6pm' : '9pm'
    heatmapData[day][slot].views += safeInt(v.statistics?.viewCount)
    heatmapData[day][slot].count++
  })

  let maxAvg = 0
  let bestCell = { day: '', slot: '', avg: 0 }
  DAYS.forEach(d => timeSlots.forEach(t => {
    const c = heatmapData[d][t]
    const a = c.count > 0 ? c.views / c.count : 0
    if (a > maxAvg) { maxAvg = a; bestCell = { day: d, slot: t, avg: a } }
  }))

  // ── CHART 3: Length / engagement ─────────────────────────────────────────
  const lengthData = lengths.map(b => ({
    label: b.label.replace(/\(.*\)/, '').trim(),
    views: Math.round(b.avg),
    eng: videos
      .filter(v => {
        const s = parseISO8601(v.contentDetails?.duration)
        return s >= b.minSec && s < b.maxSec
      })
      .reduce((sum, v) => sum + engagementRate(v), 0) /
      Math.max(1, videos.filter(v => {
        const s = parseISO8601(v.contentDetails?.duration)
        return s >= b.minSec && s < b.maxSec
      }).length),
  }))
  const lenTop  = Math.ceil(lengthData.length / 3)
  const lenBot  = Math.floor(lengthData.length * 2 / 3)
  function lenColor(idx: number) {
    return idx < lenTop ? 'var(--green)' : idx < lenBot ? 'var(--gold)' : 'var(--red)'
  }

  // ── CHART 4: Growth trend ─────────────────────────────────────────────────
  const chronoVideos = [...videos]
    .sort((a, b) => new Date(a.snippet.publishedAt).getTime() - new Date(b.snippet.publishedAt).getTime())
    .slice(-20)

  const trendData = chronoVideos.map((v, i) => {
    const views = safeInt(v.statistics?.viewCount)
    const d     = new Date(v.snippet.publishedAt)
    const label = `${d.getMonth()+1}/${d.getDate()}`
    // Rolling 5 avg
    const window = chronoVideos.slice(Math.max(0, i-4), i+1)
    const rolling = window.reduce((s, w) => s + safeInt(w.statistics?.viewCount), 0) / window.length
    return { label, views, rolling: Math.round(rolling), title: v.snippet.title }
  })

  const first5 = trendData.slice(0, 5).reduce((s, d) => s + d.views, 0) / 5
  const last5  = trendData.slice(-5).reduce((s, d) => s + d.views, 0) / 5
  const growthRatio = last5 / Math.max(first5, 1)
  const trend = growthRatio > 1.15 ? 'growing' : growthRatio < 0.85 ? 'declining' : 'stable'

  const trendColor  = trend === 'growing' ? 'var(--green)' : trend === 'declining' ? 'var(--red)' : 'var(--gold)'
  const trendEmoji  = trend === 'growing' ? '📈' : trend === 'declining' ? '📉' : '→'
  const trendVerdict = trend === 'growing' ? 'GROWING' : trend === 'declining' ? 'DECLINING' : 'STABLE'

  // ── CHART 5: Upload gap vs views ──────────────────────────────────────────
  const sorted4Gap = [...videos].sort(
    (a, b) => new Date(a.snippet.publishedAt).getTime() - new Date(b.snippet.publishedAt).getTime()
  )
  const gapData = sorted4Gap.slice(1).map((v, i) => {
    const prev  = sorted4Gap[i]
    const gap   = (new Date(v.snippet.publishedAt).getTime() - new Date(prev.snippet.publishedAt).getTime()) / 86400_000
    const views = safeInt(v.statistics?.viewCount)
    return { gap: Math.round(gap * 10) / 10, views, title: v.snippet.title }
  }).filter(d => d.gap > 0 && d.gap < 180)

  const avgGap = gapData.length ? gapData.reduce((s, d) => s + d.gap, 0) / gapData.length : 7

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="page-enter">
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontWeight: 900,
          fontSize: 28, color: 'var(--text)', marginBottom: 6,
        }}>
          📊 Insights Cockpit
        </h1>
        <p style={{ color: 'var(--sub)', fontSize: 14 }}>
          What actually works on your channel — {videos.length} videos analyzed
        </p>
      </div>

      {/* ── 3 CommandCards ─────────────────────────────────────────────────────── */}
      <CommandCard
        command={`Use ${hooks[0]?.type || 'Question'} hooks — they avg ${formatViews(Math.round(hooks[0]?.avg || 0))} views vs ${formatViews(Math.round(hooks[hooks.length-1]?.avg || 0))} for your worst hook type`}
        why={`Based on analysis of your ${videos.length} videos`}
        impact={`${((hooks[0]?.avg || 1) / (hooks[hooks.length-1]?.avg || 1)).toFixed(1)}x more views for free`}
        priority="Do Today"
      />
      <CommandCard
        command={`Make ${lengths[0]?.label || '5-9 min'} videos only — they avg ${formatViews(Math.round(lengths[0]?.avg || 0))} views`}
        why={`Your ${lengths.length} video length brackets show clear winner`}
        impact={`${((lengths[0]?.avg || 1) / (lengths[lengths.length-1]?.avg || 1)).toFixed(1)}x more views vs your worst length`}
        priority="Do This Week"
      />
      <CommandCard
        command={`Post on ${bestDay.best.day}, NOT ${bestDay.worst.day} — ${formatViews(Math.round(bestDay.best.avg))} vs ${formatViews(Math.round(bestDay.worst.avg))} avg views`}
        why={`Real data from ${videos.length} uploads analyzed`}
        impact={`${((bestDay.best.avg || 1) / (bestDay.worst.avg || 1)).toFixed(1)}x more views just by changing upload day`}
        priority="Do Today"
      />

      {/* ── CHART 1: Hook Performance ──────────────────────────────────────────── */}
      <ChartCard>
        <SectionHeader
          icon="🎣"
          title="What Actually Works On YOUR Channel"
          sub="Hook types ranked by average views — green = winners, red = avoid"
        />
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={hookData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <XAxis dataKey="type" tick={{ fill: 'var(--sub)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtK} tick={{ fill: 'var(--sub)', fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
            <Tooltip contentStyle={TT} formatter={(v: number) => [fmtK(v), 'Avg Views']} cursor={{ fill: 'rgba(124,58,237,0.08)' }} />
            <ReferenceLine y={avgViews} stroke="var(--accent)" strokeDasharray="4 4" strokeWidth={1.5}
              label={{ value: 'avg', fill: 'var(--accent)', fontSize: 10 }} />
            <Bar dataKey="avg" radius={[6,6,0,0]} maxBarSize={56}>
              {hookData.map((_, i) => (
                <Cell key={`hook-${i}`} fill={hookColor(i)} opacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {hookData.length >= 2 && (
          <ChartConclusion
            text={`Use ${hookData[0].type} hooks — ${((hookData[0].avg || 1)/(hookData[hookData.length-1].avg||1)).toFixed(1)}x more views than ${hookData[hookData.length-1].type}`}
          />
        )}
        {hookData.length >= 2 && (() => {
          const best = hookData[0]
          const worst = hookData[hookData.length - 1]
          const ratio = ((best.avg || 1) / (worst.avg || 1)).toFixed(1)
          const bestAvgFmt = fmtK(Math.round(best.avg))
          const worstAvgFmt = fmtK(Math.round(worst.avg))
          return (
            <CoachSays lines={[
              `Your ${best.type} videos get ${ratio}x more views than ${worst.type} videos (${bestAvgFmt} vs ${worstAvgFmt} avg).`,
              `→ Use ${best.type} format for your next 5 videos`,
              `→ Delete ${worst.type} from your strategy permanently`,
              `→ Your next title should use the ${best.type} format`,
            ]} />
          )
        })()}
      </ChartCard>

      {/* ── CHART 2: Timing Heatmap ────────────────────────────────────────────── */}
      <ChartCard>
        <SectionHeader
          icon="🕐"
          title="When Your Videos Win"
          sub="Day × Time heatmap — brighter = more avg views. Best slot highlighted."
        />
        <div style={{ overflowX: 'auto' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: `80px repeat(${timeSlots.length}, 1fr)`,
            gap: 4, minWidth: 560,
          }}>
            {/* Header row */}
            <div />
            {timeSlots.map(t => (
              <div key={t} style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', padding: '4px 0', fontWeight: 600 }}>
                {t}
              </div>
            ))}
            {/* Data rows */}
            {DAYS.map(day => (
              <>
                <div key={`label-${day}`} style={{
                  fontSize: 12, color: 'var(--sub)', fontWeight: 600,
                  display: 'flex', alignItems: 'center',
                }}>
                  {day}
                </div>
                {timeSlots.map(slot => {
                  const cell  = heatmapData[day][slot]
                  const avg   = cell.count > 0 ? cell.views / cell.count : 0
                  const ratio = maxAvg > 0 ? avg / maxAvg : 0
                  const isBest = day === bestCell.day && slot === bestCell.slot
                  return (
                    <div
                      key={`${day}-${slot}`}
                      title={cell.count > 0 ? `${fmtK(Math.round(avg))} avg views (${cell.count} videos)` : 'No data'}
                      style={{
                        height: 44, borderRadius: 8,
                        background: cell.count > 0
                          ? `rgba(124,58,237,${0.1 + ratio * 0.85})`
                          : 'transparent',
                        border: isBest
                          ? '2px solid var(--accent)'
                          : cell.count === 0
                          ? '1px dashed var(--border)'
                          : '1px solid transparent',
                        boxShadow: isBest ? '0 0 12px rgba(124,58,237,0.5)' : 'none',
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                        cursor: 'default', transition: 'all 0.2s',
                      }}
                    >
                      {isBest && (
                        <span style={{ fontSize: 8, fontWeight: 800, color: 'var(--accent)', letterSpacing: 0.5 }}>BEST</span>
                      )}
                      {cell.count > 0 ? (
                        <span style={{ fontSize: 10, color: ratio > 0.5 ? '#fff' : 'var(--sub)', fontWeight: 600 }}>
                          {fmtK(Math.round(avg))}
                        </span>
                      ) : (
                        <span style={{ fontSize: 9, color: 'var(--border2)' }}>—</span>
                      )}
                    </div>
                  )
                })}
              </>
            ))}
          </div>
        </div>
        {bestCell.day && (
          <ChartConclusion
            text={`Best time: ${bestCell.day} at ${bestCell.slot} — ${fmtK(Math.round(bestCell.avg))} avg views. Schedule your next upload there.`}
          />
        )}
        {bestCell.day && (() => {
          const bestAvgFmt = fmtK(Math.round(bestCell.avg))
          const worstDayData = bestDay.worst
          const worstAvgFmt = fmtK(Math.round(worstDayData.avg))
          const today = new Date()
          const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
          const bestDayIdx = dayNames.indexOf(bestCell.day)
          const todayIdx = today.getDay()
          const daysUntil = bestDayIdx >= 0 ? ((bestDayIdx - todayIdx + 7) % 7) || 7 : 7
          const nextDate = new Date(today)
          nextDate.setDate(today.getDate() + daysUntil)
          const nextDateStr = nextDate.toLocaleDateString('en', { month: 'short', day: 'numeric' })
          return (
            <CoachSays lines={[
              `→ Post on ${bestCell.day} at ${bestCell.slot} — ${bestAvgFmt} avg views vs ${worstAvgFmt} on ${worstDayData.day}`,
              `→ Stop posting on ${worstDayData.day} — it's your worst day`,
              `→ Your next video: post on ${bestCell.day} ${nextDateStr}`,
            ]} />
          )
        })()}
      </ChartCard>

      {/* ── CHART 3: Video Length vs Engagement ───────────────────────────────── */}
      <ChartCard>
        <SectionHeader
          icon="⏱️"
          title="How Long Should Your Videos Be"
          sub="Bars = avg views per length bracket · Line = avg engagement rate"
        />
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={lengthData} margin={{ top: 4, right: 24, left: 0, bottom: 4 }}>
            <XAxis dataKey="label" tick={{ fill: 'var(--sub)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="views" tickFormatter={fmtK} tick={{ fill: 'var(--sub)', fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
            <YAxis yAxisId="eng" orientation="right" tickFormatter={v => `${v.toFixed(1)}%`} tick={{ fill: 'var(--cyan)', fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
            <Tooltip contentStyle={TT}
              formatter={(v: number, name: string) =>
                name === 'eng' ? [`${v.toFixed(2)}%`, 'Engagement'] : [fmtK(v), 'Avg Views']
              }
              cursor={{ fill: 'rgba(124,58,237,0.08)' }}
            />
            <Bar yAxisId="views" dataKey="views" radius={[6,6,0,0]} maxBarSize={64}>
              {lengthData.map((_, i) => (
                <Cell key={`len-${i}`} fill={lenColor(i)} opacity={0.85} />
              ))}
            </Bar>
            <Line yAxisId="eng" type="monotone" dataKey="eng" stroke="var(--cyan)" strokeWidth={2.5} dot={{ r: 4, fill: 'var(--cyan)' }} />
          </ComposedChart>
        </ResponsiveContainer>
        {lengthData.length > 0 && (
          <ChartConclusion
            text={`${lengthData[0].label} videos perform best — ${fmtK(lengthData[0].views)} avg views with ${lengthData[0].eng.toFixed(1)}% engagement`}
          />
        )}
        {lengthData.length > 1 && (() => {
          const best = lengthData[0]
          const worst = lengthData[lengthData.length - 1]
          const ratio = ((best.views || 1) / (worst.views || 1)).toFixed(1)
          return (
            <CoachSays lines={[
              `Make every video ${best.label} — ${fmtK(best.views)} avg views vs ${fmtK(worst.views)} for ${worst.label}`,
              `Your ${worst.label} videos get ${ratio}x fewer views — cut them from your strategy`,
              `→ Every video from now: aim for ${best.label}`,
            ]} />
          )
        })()}
      </ChartCard>

      {/* ── CHART 4: Growth Trend ──────────────────────────────────────────────── */}
      <ChartCard>
        <SectionHeader icon="📈" title="Is Your Channel Growing or Dying Right Now" />
        {/* Verdict */}
        <div style={{
          textAlign: 'center', marginBottom: 16,
          fontFamily: 'var(--font-display)', fontWeight: 900,
          fontSize: 32, color: trendColor,
          letterSpacing: 1,
        }}>
          {trendVerdict} {trendEmoji}
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={trendData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <defs>
              <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={trendColor} stopOpacity={0.35} />
                <stop offset="95%" stopColor={trendColor} stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" tick={{ fill: 'var(--sub)', fontSize: 10 }} axisLine={false} tickLine={false}
              interval={Math.max(0, Math.floor(trendData.length / 6) - 1)} />
            <YAxis tickFormatter={fmtK} tick={{ fill: 'var(--sub)', fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
            <Tooltip contentStyle={TT}
              formatter={(v: number, name: string) => [fmtK(v), name === 'rolling' ? '5-vid rolling avg' : 'Views']}
              labelFormatter={(l: string) => `Date: ${l}`}
              cursor={{ stroke: 'var(--border2)' }}
            />
            <ReferenceLine y={avgViews} stroke="var(--accent)" strokeDasharray="4 4" strokeWidth={1.5}
              label={{ value: 'all-time avg', fill: 'var(--accent)', fontSize: 10 }} />
            <Area type="monotone" dataKey="views" stroke={trendColor} strokeWidth={2}
              fill="url(#growthGrad)" />
            <Line type="monotone" dataKey="rolling" stroke="var(--gold)" strokeWidth={2}
              dot={false} strokeDasharray="6 3" />
          </AreaChart>
        </ResponsiveContainer>
        <ChartConclusion
          text={
            trend === 'growing'
              ? `Channel is growing ${Math.round((growthRatio - 1) * 100)}% — last 5 videos avg ${fmtK(Math.round(last5))} vs earlier ${fmtK(Math.round(first5))}. Double down on current format.`
              : trend === 'declining'
              ? `Views dropped ${Math.round((1 - growthRatio) * 100)}% — last 5 avg ${fmtK(Math.round(last5))} vs earlier ${fmtK(Math.round(first5))}. Change your hook type immediately.`
              : `Channel is stable. Last 5 avg ${fmtK(Math.round(last5))} vs earlier ${fmtK(Math.round(first5))}. Test new hooks to break through.`
          }
        />
        {(() => {
          const coachLines = trend === 'declining' ? [
            `Your last 5 videos averaged ${fmtK(Math.round(last5))} views vs your all-time average of ${fmtK(Math.round(avgViews))} — you are declining ${Math.round((1 - growthRatio) * 100)}%.`,
            `→ Post more ${hooks[0]?.type || 'your best'} videos on ${bestDay.best.day} immediately`,
            `→ Do NOT change your topic — change your hook type first`,
          ] : trend === 'growing' ? [
            `Keep momentum. Last 5 avg ${fmtK(Math.round(last5))} vs earlier ${fmtK(Math.round(first5))}.`,
            `→ Post ${hooks[0]?.type || 'your best hook type'} on ${bestDay.best.day}`,
            `→ Don't change what's working — double down`,
          ] : [
            `You've plateaued at ~${fmtK(Math.round(avgViews))} avg views. Last 5: ${fmtK(Math.round(last5))}.`,
            `→ Make a ${hooks[0]?.type || 'Question Hook'} video on a trending topic this week`,
            `→ Try posting on ${bestDay.best.day} if you haven't been`,
          ]
          return <CoachSays lines={coachLines} />
        })()}
      </ChartCard>

      {/* ── CHART 5: Upload Gap Scatter ────────────────────────────────────────── */}
      <ChartCard>
        <SectionHeader
          icon="📅"
          title="How Your Upload Gap Affects Views"
          sub="Each dot = one video. X = days since previous upload. Reference = your avg gap."
        />
        <ResponsiveContainer width="100%" height={240}>
          <ScatterChart margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
            <XAxis
              dataKey="gap" type="number" name="Days gap"
              tick={{ fill: 'var(--sub)', fontSize: 11 }} axisLine={false} tickLine={false}
              label={{ value: 'Days since last upload', position: 'insideBottom', offset: -4, fill: 'var(--muted)', fontSize: 11 }}
            />
            <YAxis
              dataKey="views" type="number" name="Views"
              tickFormatter={fmtK} tick={{ fill: 'var(--sub)', fontSize: 11 }} axisLine={false} tickLine={false} width={44}
            />
            <Tooltip
              contentStyle={TT}
              cursor={{ strokeDasharray: '4 4' }}
              content={({ payload }) => {
                if (!payload?.length) return null
                const d = payload[0].payload
                return (
                  <div style={TT as React.CSSProperties}>
                    <div style={{ padding: '8px 12px' }}>
                      <div style={{ fontWeight: 700, marginBottom: 4, maxWidth: 200, fontSize: 11 }}>{d.title?.slice(0, 50)}</div>
                      <div style={{ color: 'var(--sub)', fontSize: 11 }}>Gap: {d.gap} days</div>
                      <div style={{ color: 'var(--sub)', fontSize: 11 }}>Views: {fmtK(d.views)}</div>
                    </div>
                  </div>
                )
              }}
            />
            <ReferenceLine
              x={Math.round(avgGap)} stroke="var(--accent)" strokeDasharray="4 4"
              label={{ value: `avg ${Math.round(avgGap)}d`, fill: 'var(--accent)', fontSize: 10, position: 'top' }}
            />
            <Scatter data={gapData} fill="var(--accent)" opacity={0.7} />
          </ScatterChart>
        </ResponsiveContainer>
        <ChartConclusion
          text={`Your avg gap is ${Math.round(avgGap)} days. ${avgGap > 14 ? 'Posting less than weekly — close the gap to boost algorithm visibility.' : avgGap < 4 ? 'High frequency — make sure quality stays consistent.' : 'Good upload cadence. Maintain consistency to grow faster.'}`}
        />
        {(() => {
          const optimalGap = Math.round(avgGap)
          const lastUploadDate = videos.length > 0
            ? new Date([...videos].sort((a,b) => new Date(b.snippet.publishedAt).getTime() - new Date(a.snippet.publishedAt).getTime())[0].snippet.publishedAt)
            : new Date()
          const nextDeadline = new Date(lastUploadDate)
          nextDeadline.setDate(lastUploadDate.getDate() + optimalGap)
          const nextDeadlineStr = nextDeadline.toLocaleDateString('en', { month: 'short', day: 'numeric' })
          return (
            <CoachSays lines={[
              `Your average upload gap is ${optimalGap} days — stick to this schedule`,
              `→ Your next upload deadline: ${nextDeadlineStr}`,
              `→ Gaps over ${Math.round(optimalGap * 1.5)} days hurt algorithm momentum`,
            ]} />
          )
        })()}
      </ChartCard>

      {/* ── CHART 6: Best vs Worst Videos ──────────────────────────────────────── */}
      <ChartCard>
        <SectionHeader
          icon="🏆"
          title="What Separates Your Best From Your Worst"
          sub="Top 5 vs bottom 5 by views — patterns reveal your winning formula"
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          {/* Top 5 */}
          <div>
            <div style={{
              fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: 1, color: 'var(--green)', marginBottom: 10,
            }}>🏅 Top 5</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {top5.map((v, i) => {
                const dur = parseISO8601(v.contentDetails?.duration)
                const d   = new Date(v.snippet.publishedAt)
                return (
                  <div key={i} style={{
                    background: 'rgba(16,185,129,0.08)',
                    border: '1px solid rgba(16,185,129,0.2)',
                    borderRadius: 10, padding: '10px 14px',
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6, lineHeight: 1.3 }}>
                      {v.snippet.title.slice(0, 60)}{v.snippet.title.length > 60 ? '…' : ''}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <Tag color="var(--green)">{classifyHook(v.snippet.title)}</Tag>
                      <Tag color="var(--gold)">{durationBucket(dur)}</Tag>
                      <Tag color="var(--cyan)">
                        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]}
                      </Tag>
                      <Tag color="var(--accent)">{fmtK(safeInt(v.statistics?.viewCount))} views</Tag>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          {/* Bottom 5 */}
          <div>
            <div style={{
              fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: 1, color: 'var(--red)', marginBottom: 10,
            }}>❌ Bottom 5</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {bottom5.map((v, i) => {
                const dur = parseISO8601(v.contentDetails?.duration)
                const d   = new Date(v.snippet.publishedAt)
                return (
                  <div key={i} style={{
                    background: 'rgba(239,68,68,0.06)',
                    border: '1px solid rgba(239,68,68,0.18)',
                    borderRadius: 10, padding: '10px 14px',
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6, lineHeight: 1.3 }}>
                      {v.snippet.title.slice(0, 60)}{v.snippet.title.length > 60 ? '…' : ''}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <Tag color="var(--red)">{classifyHook(v.snippet.title)}</Tag>
                      <Tag color="var(--muted)">{durationBucket(dur)}</Tag>
                      <Tag color="var(--muted)">
                        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]}
                      </Tag>
                      <Tag color="var(--muted)">{fmtK(safeInt(v.statistics?.viewCount))} views</Tag>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Groq AI insight pills */}
        {groqLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton height={48} borderRadius={10} />
            <Skeleton height={48} borderRadius={10} />
            <Skeleton height={48} borderRadius={10} />
          </div>
        )}
        {groqError && <ErrorCard message={groqError} onRetry={loadGroq} />}
        {groqInsight && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <InsightPillCard icon="🔍" label="PATTERN" text={groqInsight.pattern} color="var(--accent)" />
            <InsightPillCard icon="✅" label="RULE" text={groqInsight.rule} color="var(--green)" />
            <InsightPillCard icon="🚫" label="AVOID" text={groqInsight.avoid} color="var(--red)" />
          </div>
        )}
      </ChartCard>
    </div>
  )
}

// ── Small helper components ──────────────────────────────────────────────────
function Tag({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 7px',
      borderRadius: 20, border: `1px solid ${color}33`,
      color, background: `${color}12`,
    }}>
      {children}
    </span>
  )
}

function InsightPillCard({ icon, label, text, color }: { icon: string; label: string; text: string; color: string }) {
  return (
    <div style={{
      display: 'flex', gap: 12, alignItems: 'flex-start',
      padding: '12px 16px', borderRadius: 10,
      background: `${color}0D`, border: `1px solid ${color}30`,
    }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
      <div>
        <span style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: 1, marginRight: 8 }}>
          {label}:
        </span>
        <span style={{ fontSize: 13, color: 'var(--text)' }}>{text}</span>
      </div>
    </div>
  )
}
