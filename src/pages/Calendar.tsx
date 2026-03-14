import { useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer } from 'recharts'
import { useChannel } from '../context/ChannelContext'
import {
  calcBestPostingDay, calcUploadMetrics, nextOptimalDate,
  calcAvgViews, formatViews, safeInt,
} from '../lib/calc'
import { CommandCard } from '../components/CommandCard'
import { ChartConclusion } from '../components/ChartConclusion'

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

const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function Calendar() {
  const { channel, videos } = useChannel()
  const navigate = useNavigate()

  if (!channel || !videos.length) {
    return (
      <div className="page-enter" style={{ padding: 40, textAlign: 'center', color: 'var(--sub)' }}>
        <p>No channel loaded. <button onClick={() => navigate({ to: '/onboarding' })} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, textDecoration: 'underline' }}>Go back</button></p>
      </div>
    )
  }

  const uploadM = calcUploadMetrics(videos)
  const bestDay = calcBestPostingDay(videos)
  const avgV = calcAvgViews(videos)
  const nextDate = nextOptimalDate(uploadM.lastUpload, uploadM.avgGap, bestDay.best.dayIdx)
  const nextDateStr = nextDate.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })

  // Views by day bar chart
  const dayData = useMemo(() => {
    const acc = DAYS_FULL.map((d, i) => ({ day: DAYS_SHORT[i], views: 0, count: 0 }))
    videos.forEach(v => {
      const d = new Date(v.snippet.publishedAt).getDay()
      acc[d].views += safeInt(v.statistics?.viewCount)
      acc[d].count++
    })
    return acc.map(d => ({ ...d, avg: d.count > 0 ? Math.round(d.views / d.count) : 0 }))
  }, [videos])

  // 4-week calendar grid
  const today = new Date()
  type CalCell = { date: Date; isToday: boolean; wasUploaded: boolean; isRecommended: boolean; isBestDay: boolean; dayKey: string }

  const weeks = useMemo(() => {
    const start = new Date(today)
    start.setDate(today.getDate() - today.getDay())

    const uploadDates = new Set(videos.map(v => {
      const d = new Date(v.snippet.publishedAt)
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    }))

    const grid: CalCell[][] = []
    for (let w = 0; w < 4; w++) {
      const week: CalCell[] = []
      for (let d = 0; d < 7; d++) {
        const date = new Date(start)
        date.setDate(start.getDate() + w * 7 + d)
        const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
        const isToday = date.toDateString() === today.toDateString()
        const wasUploaded = uploadDates.has(key)
        const isRecommended = date.toDateString() === nextDate.toDateString()
        const isBestDay = date.getDay() === bestDay.best.dayIdx
        week.push({ date, isToday, wasUploaded, isRecommended, isBestDay, dayKey: key })
      }
      grid.push(week)
    }
    return grid
  }, [videos, nextDate, bestDay.best.dayIdx, today])

  // Streak calculation
  const streak = useMemo(() => {
    const sorted = [...videos]
      .sort((a, b) => new Date(b.snippet.publishedAt).getTime() - new Date(a.snippet.publishedAt).getTime())
    let count = 0
    let lastDate = new Date()
    const gapDays = Math.round(uploadM.avgGap)
    for (const v of sorted) {
      const vDate = new Date(v.snippet.publishedAt)
      const diff = (lastDate.getTime() - vDate.getTime()) / 86_400_000
      if (diff <= gapDays * 1.5) { count++; lastDate = vDate }
      else break
    }
    return count
  }, [videos, uploadM.avgGap])

  const worstDay = bestDay.worst || { day: 'Monday', avg: 0 }

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 900, color: 'var(--text)', marginBottom: 4 }}>
          📅 Upload Calendar
        </h1>
        <p style={{ color: 'var(--sub)', fontSize: 14 }}>Your optimal posting schedule based on real channel performance data</p>
      </div>

      {/* CommandCard */}
      <CommandCard
        command={`Post your next video on ${nextDateStr} — that's your optimal ${bestDay.best.day} slot`}
        why={`${bestDay.best.day} videos avg ${formatViews(Math.round(bestDay.best.avg))} views vs ${formatViews(Math.round(worstDay.avg))} on ${worstDay.day} — that's ${(bestDay.best.avg / Math.max(worstDay.avg, 1)).toFixed(1)}x more for the same content`}
        impact={`Posting consistently every ${Math.round(uploadM.avgGap)} days on ${bestDay.best.day} could bring ${formatViews(Math.round(bestDay.best.avg - avgV))} extra views per video`}
        priority="Do Today"
      />

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
        {[
          { label: 'Best Day', value: bestDay.best.day, sub: `${formatViews(Math.round(bestDay.best.avg))} avg views`, color: 'var(--green)' },
          { label: 'Upload Streak', value: `${streak}`, sub: 'consecutive uploads', color: streak >= 5 ? 'var(--green)' : streak >= 3 ? 'var(--gold)' : 'var(--red)' },
          { label: 'Avg Gap', value: `${Math.round(uploadM.avgGap)}d`, sub: 'between uploads', color: uploadM.avgGap <= 7 ? 'var(--green)' : 'var(--gold)' },
          { label: 'Next Upload', value: nextDate.toLocaleDateString('en', { month: 'short', day: 'numeric' }), sub: nextDate.toLocaleDateString('en', { weekday: 'long' }), color: 'var(--accent)' },
          { label: 'Consistency', value: `${Math.round(uploadM.consistency)}%`, sub: 'upload regularity', color: uploadM.consistency >= 70 ? 'var(--green)' : uploadM.consistency >= 40 ? 'var(--gold)' : 'var(--red)' },
        ].map(item => (
          <div key={item.label} className="card-base" style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 6 }}>{item.label}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 900, color: item.color, marginBottom: 2 }}>{item.value}</div>
            <div style={{ fontSize: 11, color: 'var(--sub)' }}>{item.sub}</div>
          </div>
        ))}
      </div>

      {/* 4-week calendar */}
      <div className="card-base" style={{ padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: 'var(--text)' }}>
            4-Week View
          </h2>
          <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--sub)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--accent)', display: 'inline-block' }} /> Past upload
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--pink)', display: 'inline-block' }} /> Recommended
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(16,185,129,0.3)', border: '1px dashed var(--green)', display: 'inline-block' }} /> Best day
            </span>
          </div>
        </div>

        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 8 }}>
          {DAYS_SHORT.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
            {week.map((cell) => (
              <div key={cell.dayKey} style={{
                aspectRatio: '1',
                borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: cell.isToday ? 800 : 400,
                position: 'relative',
                background: cell.isRecommended
                  ? 'rgba(244,63,142,0.2)'
                  : cell.wasUploaded
                  ? 'rgba(124,58,237,0.15)'
                  : cell.isBestDay
                  ? 'rgba(16,185,129,0.06)'
                  : 'transparent',
                border: cell.isToday
                  ? '2px solid var(--pink)'
                  : cell.isRecommended
                  ? '1px solid var(--pink)'
                  : cell.isBestDay && !cell.wasUploaded
                  ? '1px dashed rgba(16,185,129,0.4)'
                  : '1px solid transparent',
                color: cell.isToday ? 'var(--pink)' : cell.isRecommended ? 'var(--pink)' : cell.wasUploaded ? 'var(--accent)' : 'var(--sub)',
              }}>
                {cell.date.getDate()}
                {cell.wasUploaded && (
                  <div style={{ position: 'absolute', bottom: 3, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)' }} />
                )}
                {cell.isRecommended && (
                  <div style={{ position: 'absolute', top: 2, right: 2, fontSize: 8 }}>⭐</div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Views by day of week */}
      <div className="card-base" style={{ padding: '24px 28px' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: 'var(--text)', marginBottom: 4 }}>
          Average Views by Day of Week
        </h2>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20 }}>Based on when your videos were published</p>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={dayData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <XAxis dataKey="day" {...axisProps} />
            <YAxis {...axisProps} tickFormatter={fmt} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [fmt(v), 'Avg Views']} />
            <Bar dataKey="avg" name="Avg Views" radius={[6, 6, 0, 0]} isAnimationActive animationDuration={1000}>
              {dayData.map((d, i) => (
                <Cell key={i} fill={
                  d.avg === Math.max(...dayData.map(x => x.avg)) ? 'var(--green)'
                  : d.avg === Math.min(...dayData.filter(x => x.count > 0).map(x => x.avg)) ? 'var(--red)'
                  : 'var(--gold)'
                } />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <ChartConclusion text={`Post every ${bestDay.best.day} — your ${bestDay.best.day} videos average ${formatViews(Math.round(bestDay.best.avg))} views vs ${formatViews(Math.round(worstDay.avg))} on ${worstDay.day}. Switch all future uploads to ${bestDay.best.day}.`} />
      </div>
    </div>
  )
}
