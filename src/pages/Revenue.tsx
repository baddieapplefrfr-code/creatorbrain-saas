import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer,
  ComposedChart, Line, Area, AreaChart, ReferenceLine,
} from 'recharts'

import { useChannel } from '../context/ChannelContext'
import {
  calcUploadMetrics,
  calcBestPostingDay,
  calcAvgViews,
  safeInt,
  formatViews,
  engagementRate,
  estimateRevenue,
  estimateSponsorValue,
  calcGrowthForecast,
} from '../lib/calc'

import { CommandCard } from '../components/CommandCard'
import { MetricCard } from '../components/MetricCard'
import { ChartConclusion } from '../components/ChartConclusion'

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

function fmtDollar(v: number): string {
  return `$${v >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : Math.round(v)}`
}

// ── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <h2 style={{
        fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, color: 'var(--text)',
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

// ── EST. badge ───────────────────────────────────────────────────────────────
function EstBadge() {
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, padding: '2px 6px',
      borderRadius: 4, background: 'rgba(245,158,11,0.15)',
      color: 'var(--gold)', border: '1px solid rgba(245,158,11,0.3)',
      verticalAlign: 'middle', marginLeft: 6, letterSpacing: 0.5,
    }}>
      EST.
    </span>
  )
}

// ── Metric card with EST badge ────────────────────────────────────────────────
function RevenueMetricCard({
  label, value, sub, color
}: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="card-base" style={{ padding: '20px 22px' }}>
      <div className="label-upper" style={{ marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
        <span className="metric-value" style={{ color: color || 'var(--text)' }}>{value}</span>
        <EstBadge />
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{sub}</div>}
    </div>
  )
}

// ── Empty state ──────────────────────────────────────────────────────────────
function NoData() {
  const navigate = useNavigate()
  return (
    <div style={{
      minHeight: '60vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16, textAlign: 'center',
    }}>
      <div style={{ fontSize: 56 }}>💰</div>
      <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 24, color: 'var(--text)' }}>
        No channel data
      </h2>
      <p style={{ color: 'var(--sub)', fontSize: 15, maxWidth: 400 }}>
        Connect your YouTube channel to unlock revenue estimates and growth forecasts.
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

// ── Main Component ───────────────────────────────────────────────────────────
export default function Revenue() {
  const { channel, videos, niche } = useChannel()
  const [hoursPerVideo, setHoursPerVideo] = useState(8)

  if (!channel || !videos.length) return <NoData />

  // ── Calculations ─────────────────────────────────────────────────────────
  const uploadM             = calcUploadMetrics(videos)
  const bestDay             = calcBestPostingDay(videos)
  const avgViews            = calcAvgViews(videos)
  const engAvg              = videos.reduce((s, v) => s + engagementRate(v), 0) / videos.length
  const estimatedMonthlyViews   = avgViews * uploadM.perWeek * 4.33
  const estimatedMonthlyRevenue = estimateRevenue(estimatedMonthlyViews, niche)
  const sponsorValue            = estimateSponsorValue(channel.statistics.subscriberCount ?? '0', engAvg)
  const forecast                = calcGrowthForecast(videos, channel)

  const revenuePerKViews = estimatedMonthlyViews > 0
    ? estimatedMonthlyRevenue / (estimatedMonthlyViews / 1000)
    : 0

  const hourlyRate = uploadM.perWeek > 0 && hoursPerVideo > 0
    ? estimatedMonthlyRevenue / (uploadM.perWeek * 4.33 * hoursPerVideo)
    : 0

  const hrColor = hourlyRate >= 10 ? 'var(--green)' : hourlyRate >= 5 ? 'var(--gold)' : 'var(--red)'

  // ── Video revenue data ────────────────────────────────────────────────────
  const videoRevData = [...videos]
    .map(v => ({
      title: v.snippet.title.slice(0, 28) + (v.snippet.title.length > 28 ? '…' : ''),
      fullTitle: v.snippet.title,
      views: safeInt(v.statistics?.viewCount),
      revenue: Math.round(estimateRevenue(safeInt(v.statistics?.viewCount), niche)),
    }))
    .sort((a, b) => b.revenue - a.revenue)

  const revTop  = Math.ceil(videoRevData.length / 3)
  const revBot  = Math.floor(videoRevData.length * 2 / 3)
  function revColor(idx: number) {
    return idx < revTop ? 'var(--green)' : idx < revBot ? 'var(--gold)' : 'var(--red)'
  }

  // ── Growth forecast chart data ────────────────────────────────────────────
  const currentSubs   = forecast.currentSubs
  const growthPerMonth = forecast.monthlyGrowthRate
  const forecastPoints = Array.from({ length: 13 }, (_, i) => {
    const month  = i
    const subs   = Math.round(currentSubs + growthPerMonth * month)
    const label  = i === 0 ? 'Now' : `+${i}mo`
    return { label, subs }
  })

  // Double-frequency scenario
  const forecastDouble = Array.from({ length: 13 }, (_, i) => ({
    label: i === 0 ? 'Now' : `+${i}mo`,
    subsDouble: Math.round(currentSubs + growthPerMonth * 1.8 * i),
  }))

  const chartForecast = forecastPoints.map((p, i) => ({
    ...p,
    subsDouble: forecastDouble[i].subsDouble,
  }))

  // Add milestone markers
  const msMarkers = forecast.milestones.slice(0, 3).map(ms => ({
    target: ms.target,
    label: ms.label,
  }))

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="page-enter">
      {/* Page header */}
      <div style={{ marginBottom: 16 }}>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontWeight: 900,
          fontSize: 28, color: 'var(--text)', marginBottom: 6,
        }}>
          💰 Revenue & Growth
        </h1>
        <p style={{ color: 'var(--sub)', fontSize: 14 }}>
          Monetisation projections and subscriber growth forecasting for {niche} niche
        </p>
      </div>

      {/* ── Disclaimer ────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 8,
        padding: '10px 16px', borderRadius: 10,
        background: 'rgba(245,158,11,0.06)',
        border: '1px solid rgba(245,158,11,0.2)',
        marginBottom: 24,
      }}>
        <span style={{ fontSize: 14 }}>⚠️</span>
        <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--gold)' }}>Estimates only:</strong>{' '}
          Revenue figures are based on industry-average CPM for {niche} content.
          Actual AdSense earnings vary significantly by audience geography, ad formats, and seasonality.
          Use for planning only — not financial advice.
        </p>
      </div>

      {/* ── CommandCard ────────────────────────────────────────────────────────── */}
      <CommandCard
        command={`Post on ${bestDay.best.day} — your best day earns ~$${Math.round(estimateRevenue(bestDay.best.avg, niche))} per video vs $${Math.round(estimateRevenue(bestDay.worst.avg, niche))} on ${bestDay.worst.day}`}
        why={`Based on industry CPM estimates for ${niche} niche and your real upload performance data`}
        impact={`You're leaving ~$${Math.round(estimateRevenue(bestDay.best.avg, niche) - estimateRevenue(bestDay.worst.avg, niche))} per video on the table by posting on wrong days`}
        priority="Do Today"
      />

      {/* ── SECTION 1: 4 Revenue metric cards ─────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <SectionHeader icon="📊" title="Revenue Snapshot" />
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 16,
        }}>
          <RevenueMetricCard
            label="Monthly Revenue"
            value={`$${Math.round(estimatedMonthlyRevenue).toLocaleString()}`}
            sub={`~${formatViews(Math.round(estimatedMonthlyViews))} monthly views × ${niche} CPM`}
            color="var(--green)"
          />
          <RevenueMetricCard
            label="Annual Revenue"
            value={`$${Math.round(estimatedMonthlyRevenue * 12).toLocaleString()}`}
            sub="12 months at current upload pace"
            color="var(--gold)"
          />
          <RevenueMetricCard
            label="Sponsor Value / Video"
            value={`$${sponsorValue.toLocaleString()}`}
            sub={`Based on ${formatViews(safeInt(channel.statistics.subscriberCount))} subs & ${engAvg.toFixed(1)}% engagement`}
            color="var(--cyan)"
          />
          <RevenueMetricCard
            label="Revenue per 1K Views"
            value={`$${revenuePerKViews.toFixed(2)}`}
            sub={`${niche} niche RPM estimate`}
            color="var(--accent)"
          />
        </div>
      </div>

      {/* ── SECTION 2: Growth Forecast ─────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <SectionHeader
          icon="🚀"
          title="Growth Forecast Milestones"
          sub={`Growing at ~${formatViews(forecast.monthlyGrowthRate)} subs/month at current pace`}
        />

        {/* Milestone cards */}
        {forecast.milestones.length > 0 ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 14, marginBottom: 24,
          }}>
            {forecast.milestones.map((ms, i) => {
              const color = i === 0 ? 'var(--green)' : i === 1 ? 'var(--cyan)' : i === 2 ? 'var(--gold)' : i === 3 ? 'var(--pink)' : 'var(--accent)'
              return (
                <div key={i} className="card-base" style={{ padding: '18px 20px' }}>
                  <div style={{
                    fontSize: 24, fontFamily: 'var(--font-display)',
                    fontWeight: 900, color, marginBottom: 4,
                  }}>
                    {ms.label}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                    subscribers
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: 12, color: 'var(--sub)' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text)' }}>{ms.monthsNeeded} months</span> at current pace
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      Target: {ms.projectedDate}
                    </div>
                    <div style={{
                      fontSize: 11, color: 'var(--green)', marginTop: 4,
                      padding: '4px 8px', background: 'rgba(16,185,129,0.08)',
                      borderRadius: 6, border: '1px solid rgba(16,185,129,0.2)',
                    }}>
                      ⚡ 2× uploads → {ms.doubleFreqDate} ({ms.doubleFreqMonths}mo)
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ padding: '20px', color: 'var(--muted)', fontSize: 14 }}>
            Already past 1M subscribers 🎉
          </div>
        )}

        {/* Forecast chart */}
        <ChartCard>
          <div style={{ fontSize: 13, color: 'var(--sub)', marginBottom: 16 }}>
            <span style={{ display: 'inline-block', width: 12, height: 3, background: 'var(--accent)', borderRadius: 2, marginRight: 6, verticalAlign: 'middle' }} />
            Current pace
            <span style={{ display: 'inline-block', width: 12, height: 3, background: 'var(--green)', borderRadius: 2, marginRight: 6, marginLeft: 16, verticalAlign: 'middle' }} />
            2× upload frequency
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={chartForecast} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <defs>
                <linearGradient id="subsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--accent)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fill: 'var(--sub)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmtK} tick={{ fill: 'var(--sub)', fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
              <Tooltip contentStyle={TT}
                formatter={(v: number, name: string) => [
                  fmtK(v),
                  name === 'subs' ? 'Subscribers (current pace)' : 'Subscribers (2× uploads)',
                ]}
              />
              {/* Milestone reference lines */}
              {msMarkers.map((ms, i) => (
                <Line
                  key={i} type="monotone"
                  dataKey={() => ms.target}
                  stroke={i === 0 ? 'var(--green)' : i === 1 ? 'var(--gold)' : 'var(--pink)'}
                  strokeDasharray="3 3" strokeWidth={1} dot={false}
                />
              ))}
              <Area type="monotone" dataKey="subs" stroke="var(--accent)" strokeWidth={2}
                fill="url(#subsGrad)" />
              <Line type="monotone" dataKey="subsDouble" stroke="var(--green)" strokeWidth={2}
                dot={false} strokeDasharray="6 3" />
            </ComposedChart>
          </ResponsiveContainer>
          <ChartConclusion
            text={forecast.milestones.length > 0
              ? `At current pace, you'll hit ${forecast.milestones[0].label} subs in ${forecast.milestones[0].monthsNeeded} months (${forecast.milestones[0].projectedDate}). Double your upload frequency to reach it in ${forecast.milestones[0].doubleFreqMonths} months.`
              : `Congratulations! You've already passed major milestones. Focus on monetisation and audience quality.`
            }
          />
        </ChartCard>
      </div>

      {/* ── SECTION 3: Revenue by Video ────────────────────────────────────────── */}
      <ChartCard>
        <SectionHeader
          icon="🎬"
          title="Estimated Revenue by Video"
          sub="Sorted highest → lowest — green = top earners, red = underperformers"
        />
        <ResponsiveContainer width="100%" height={Math.max(220, Math.min(videoRevData.length * 28, 400))}>
          <BarChart
            data={videoRevData}
            layout="vertical"
            margin={{ top: 4, right: 64, left: 4, bottom: 4 }}
          >
            <XAxis type="number" tickFormatter={v => `$${fmtK(v)}`}
              tick={{ fill: 'var(--sub)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis dataKey="title" type="category" width={160}
              tick={{ fill: 'var(--sub)', fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={TT}
              content={({ payload }) => {
                if (!payload?.length) return null
                const d = payload[0].payload
                return (
                  <div style={{ ...TT, padding: '10px 14px' }}>
                    <div style={{ fontWeight: 700, fontSize: 11, maxWidth: 220, marginBottom: 6, lineHeight: 1.3 }}>
                      {d.fullTitle}
                    </div>
                    <div style={{ color: 'var(--sub)', fontSize: 11 }}>{fmtK(d.views)} views</div>
                    <div style={{ color: 'var(--green)', fontSize: 12, fontWeight: 700 }}>
                      ~${d.revenue.toLocaleString()} est. revenue
                    </div>
                  </div>
                )
              }}
            />
            <Bar dataKey="revenue" radius={[0,4,4,0]} maxBarSize={20}>
              {videoRevData.map((_, i) => (
                <Cell key={`rev-${i}`} fill={revColor(i)} opacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <ChartConclusion
          text={`"${videoRevData[0]?.fullTitle?.slice(0, 50)}" earns ~$${videoRevData[0]?.revenue?.toLocaleString()} — ${Math.round((videoRevData[0]?.revenue || 1) / Math.max(videoRevData[videoRevData.length-1]?.revenue || 1, 1))}x more than your worst earner. Make more like it.`}
        />
      </ChartCard>

      {/* ── SECTION 4: Weekly P&L ──────────────────────────────────────────────── */}
      <ChartCard>
        <SectionHeader
          icon="⚖️"
          title="Weekly P&L — Is This Worth Your Time?"
          sub="Enter your typical hours per video to calculate your effective hourly rate"
        />

        {/* Hours input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13, color: 'var(--sub)', fontWeight: 600 }}>
            Hours per video:
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setHoursPerVideo(h => Math.max(1, h - 1))}
              style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'var(--surface)', border: '1px solid var(--border)',
                color: 'var(--text)', fontSize: 16, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >−</button>
            <input
              type="number"
              value={hoursPerVideo}
              onChange={e => setHoursPerVideo(Math.max(1, Number(e.target.value)))}
              min={1}
              style={{ width: 64, textAlign: 'center', padding: '6px 10px' }}
            />
            <button
              onClick={() => setHoursPerVideo(h => h + 1)}
              style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'var(--surface)', border: '1px solid var(--border)',
                color: 'var(--text)', fontSize: 16, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >+</button>
          </div>
        </div>

        {/* P&L cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 14,
        }}>
          {/* Hourly rate — hero card */}
          <div className="card-base" style={{
            padding: '20px 22px',
            background: `${hrColor}0D`,
            border: `1px solid ${hrColor}30`,
            gridColumn: 'span 1',
          }}>
            <div className="label-upper" style={{ marginBottom: 8 }}>Your Hourly Rate</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
              <span style={{
                fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 900, color: hrColor,
              }}>
                ${hourlyRate.toFixed(2)}
              </span>
              <span style={{ fontSize: 14, color: 'var(--muted)' }}>/hr</span>
            </div>
            <div style={{ fontSize: 12, color: hrColor, fontWeight: 600 }}>
              {hourlyRate >= 10 ? '✅ Profitable — above $10/hr' :
               hourlyRate >= 5  ? '⚠️ Marginal — aim for $10+/hr' :
               '🔴 Below min wage — fix your views or frequency'}
            </div>
          </div>

          <PLCard
            label="Revenue / Video"
            value={fmtDollar(estimatedMonthlyRevenue / Math.max(uploadM.perWeek * 4.33, 1))}
            sub="avg per upload"
            color="var(--text)"
          />
          <PLCard
            label="Hours / Month"
            value={`${Math.round(uploadM.perWeek * 4.33 * hoursPerVideo)} hrs`}
            sub={`${uploadM.perWeek.toFixed(1)} vids/wk × ${hoursPerVideo}h`}
            color="var(--sub)"
          />
          <PLCard
            label="Revenue / Sub Added"
            value={`$${forecast.monthlyGrowthRate > 0
              ? (estimatedMonthlyRevenue / forecast.monthlyGrowthRate).toFixed(3)
              : '0.000'}`}
            sub={`+${formatViews(forecast.monthlyGrowthRate)} subs/mo`}
            color="var(--accent)"
          />
        </div>

        {/* Growth bar */}
        <div style={{ marginTop: 20 }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6,
          }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Monthly revenue potential</span>
            <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 700 }}>
              Target: ${Math.round(estimatedMonthlyRevenue * 2).toLocaleString()}/mo
              <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 4 }}>
                (2× uploads)
              </span>
            </span>
          </div>
          <div style={{ height: 8, background: 'var(--surface)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: '50%',
              background: 'var(--grad)',
              borderRadius: 4,
              transition: 'width 1s ease',
            }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            You're at 50% of 2× upload frequency revenue — increase posting to close the gap
          </div>
        </div>

        {/* Revenue breakdown bar chart (monthly vs annual) */}
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--sub)', marginBottom: 12 }}>
            Revenue breakdown by scenario
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart
              data={[
                { scenario: 'Current', revenue: Math.round(estimatedMonthlyRevenue), annual: Math.round(estimatedMonthlyRevenue * 12) },
                { scenario: '2× Uploads', revenue: Math.round(estimatedMonthlyRevenue * 1.8), annual: Math.round(estimatedMonthlyRevenue * 1.8 * 12) },
                { scenario: '+ Sponsorships', revenue: Math.round(estimatedMonthlyRevenue + sponsorValue * uploadM.perWeek * 4.33), annual: Math.round((estimatedMonthlyRevenue + sponsorValue * uploadM.perWeek * 4.33) * 12) },
              ]}
              margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
            >
              <XAxis dataKey="scenario" tick={{ fill: 'var(--sub)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => `$${fmtK(v)}`} tick={{ fill: 'var(--sub)', fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
              <Tooltip contentStyle={TT}
                formatter={(v: number, name: string) => [
                  `$${Math.round(v).toLocaleString()}`,
                  name === 'revenue' ? 'Monthly' : 'Annual',
                ]}
                cursor={{ fill: 'rgba(124,58,237,0.08)' }}
              />
              <Bar dataKey="revenue" name="revenue" fill="var(--accent)" radius={[6,6,0,0]} maxBarSize={40} opacity={0.85} />
              <Bar dataKey="annual" name="annual" fill="var(--gold)" radius={[6,6,0,0]} maxBarSize={40} opacity={0.65} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* ── Revenue trend over last 10 videos ─────────────────────────────────── */}
      <ChartCard>
        <SectionHeader
          icon="📈"
          title="Revenue Trend — Last 10 Uploads"
          sub="How much each recent video likely earned"
        />
        {(() => {
          const last10 = [...videos]
            .sort((a, b) => new Date(a.snippet.publishedAt).getTime() - new Date(b.snippet.publishedAt).getTime())
            .slice(-10)
            .map(v => {
              const views = safeInt(v.statistics?.viewCount)
              const d = new Date(v.snippet.publishedAt)
              return {
                label: `${d.getMonth()+1}/${d.getDate()}`,
                views,
                revenue: Math.round(estimateRevenue(views, niche)),
                title: v.snippet.title,
              }
            })

          const avgRev = last10.reduce((s, d) => s + d.revenue, 0) / last10.length

          return (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={last10} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--green)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="var(--green)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" tick={{ fill: 'var(--sub)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => `$${fmtK(v)}`} tick={{ fill: 'var(--sub)', fontSize: 11 }} axisLine={false} tickLine={false} width={52} />
                  <Tooltip
                    contentStyle={TT}
                    content={({ payload }) => {
                      if (!payload?.length) return null
                      const d = payload[0].payload
                      return (
                        <div style={{ ...TT, padding: '10px 14px' }}>
                          <div style={{ fontWeight: 700, fontSize: 11, maxWidth: 200, marginBottom: 4, lineHeight: 1.3 }}>
                            {d.title?.slice(0, 50)}
                          </div>
                          <div style={{ color: 'var(--sub)', fontSize: 11 }}>{fmtK(d.views)} views</div>
                          <div style={{ color: 'var(--green)', fontWeight: 700, fontSize: 12 }}>
                            ~${d.revenue.toLocaleString()} EST.
                          </div>
                        </div>
                      )
                    }}
                  />
                  <ReferenceLine y={avgRev} stroke="var(--accent)" strokeDasharray="4 4" strokeWidth={1.5} />
                  <Area type="monotone" dataKey="revenue" stroke="var(--green)" strokeWidth={2} fill="url(#revGrad)" />
                </AreaChart>
              </ResponsiveContainer>
              <ChartConclusion
                text={`Avg ~$${Math.round(avgRev)}/video for last 10 uploads. Total last 10 estimated: $${Math.round(last10.reduce((s, d) => s + d.revenue, 0)).toLocaleString()}.`}
              />
            </>
          )
        })()}
      </ChartCard>
    </div>
  )
}

// ── P&L stat card ────────────────────────────────────────────────────────────
function PLCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="card-base" style={{ padding: '18px 20px' }}>
      <div className="label-upper" style={{ marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 900, color: color || 'var(--text)', marginBottom: 4 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{sub}</div>}
    </div>
  )
}


