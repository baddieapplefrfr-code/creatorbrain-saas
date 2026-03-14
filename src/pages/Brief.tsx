import { useState, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useChannel } from '../context/ChannelContext'
import { askGroq, sanitize, GROQ_KEY_A } from '../lib/api'
import {
  calcBestPostingDay, calcBestLength, calcHookTypes, calcUploadMetrics,
  calcAvgViews, formatViews, safeInt,
} from '../lib/calc'
import { CommandCard } from '../components/CommandCard'
import { Skeleton } from '../components/Skeleton'
import { ErrorCard } from '../components/ErrorCard'
import { Copy, Check, RefreshCw, Calendar } from 'lucide-react'

interface NextVideo {
  title: string; hook: string; thumbnail: string;
  postDay: string; postTime: string; estimatedRange: string; whyThisTopic: string
}
interface DayTask {
  day: string
  time: string
  task: string
  detail: string
  why: string
}
interface BriefData {
  nextVideo: NextVideo
  thisWeek: DayTask[]
  stopDoingThis: { what: string; proof: string; savings: string }
  doubleDownOn: { what: string; proof: string; upside: string }
  weeklyGoal: string
  warningIfYouSkip: string
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }
  return (
    <button onClick={copy} style={{
      background: 'none', border: 'none', cursor: 'pointer',
      color: copied ? 'var(--green)' : 'var(--sub)',
      display: 'flex', alignItems: 'center', gap: 4, fontSize: 12,
      padding: '4px 8px', borderRadius: 6, whiteSpace: 'nowrap',
    }}>
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function getWeekRange(): { label: string; mon: Date; sun: Date } {
  const now = new Date()
  const mon = new Date(now)
  mon.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  mon.setHours(0, 0, 0, 0)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  const label = `${mon.toLocaleDateString('en', { month: 'short', day: 'numeric' })} — ${sun.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}`
  return { label, mon, sun }
}

const DAY_COLORS = ['var(--cyan)', 'var(--accent)', 'var(--green)', 'var(--pink)', 'var(--gold)', 'var(--accent2)', 'var(--cyan)']

export default function Brief() {
  const { channel, videos, niche } = useChannel()
  const navigate = useNavigate()
  const [brief, setBrief] = useState<BriefData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async () => {
    if (!channel || videos.length < 3) return
    setLoading(true)
    setError(null)

    try {
      const uploadM = calcUploadMetrics(videos)
      const bestDay = calcBestPostingDay(videos)
      const lengths = calcBestLength(videos)
      const hooks = calcHookTypes(videos)
      const avgViews = calcAvgViews(videos)

      const sName = sanitize(channel?.snippet?.title, 30)
      const sSubs = formatViews(safeInt(channel?.statistics?.subscriberCount))
      const sBestDay = bestDay.best.day
      const sBestDayV = Math.round(bestDay.best.avg)
      const sLength = lengths[0]?.label || '8-12 min'
      const sHook = hooks[0]?.type || 'Question'
      const sGap = Math.round(uploadM.avgGap)
      const sFreq = uploadM.perWeek.toFixed(1)

      const topVid = [...videos].sort((a,b) => safeInt(b.statistics?.viewCount) - safeInt(a.statistics?.viewCount))[0]

      const result = await askGroq(
        'You are a YouTube channel manager writing a weekly operational plan. Every recommendation must name a specific day, a specific action, and a specific reason using the numbers given. This is not a strategy document. It is a to-do list for this week. Return JSON only, no markdown.',
        `${sName}, ${sSubs}subs
Best day: ${sBestDay}(${sBestDayV}v) Best hook: ${sHook}. Best length: ${sLength}
Avg views: ${Math.round(avgViews)}. Gap: ${sGap}d (${sFreq}x/wk)
Top video: "${sanitize(topVid?.snippet?.title || '', 50)}"
Return JSON only no markdown:
{"nextVideo":{"title":string,"hook":"opening line of video","thumbnail":"describe exactly what thumbnail should show","postDay":string,"postTime":"e.g. 6:00 PM","estimatedRange":string,"whyThisTopic":string},"thisWeek":[{"day":"Monday","time":"e.g. 10 AM","task":string,"detail":"specific instruction not generic advice","why":"one sentence reason with a number"},{"day":"Tuesday","time":string,"task":string,"detail":string,"why":string},{"day":"Wednesday","time":string,"task":string,"detail":string,"why":string},{"day":"Thursday","time":string,"task":string,"detail":string,"why":string},{"day":"Friday","time":string,"task":string,"detail":string,"why":string},{"day":"Saturday","time":string,"task":string,"detail":string,"why":string},{"day":"Sunday","time":string,"task":string,"detail":string,"why":string}],"stopDoingThis":{"what":string,"proof":string,"savings":string},"doubleDownOn":{"what":string,"proof":string,"upside":string},"weeklyGoal":string,"warningIfYouSkip":string}`,
        true,
        GROQ_KEY_A
      ) as BriefData

      setBrief(result)
    } catch (e: unknown) {
      const msg = (e as Error).message || 'Something went wrong'
      if (msg.includes('decommissioned')) setError('AI model updated — refresh')
      else if (msg.includes('rate_limit')) setError('Too many requests — wait 30s')
      else setError(msg)
      console.error('Full error:', e)
    } finally {
      setLoading(false)
    }
  }, [channel, videos, niche])

  if (!channel) {
    return (
      <div className="page-enter" style={{ padding: 40, textAlign: 'center', color: 'var(--sub)' }}>
        <p>No channel loaded. <button onClick={() => navigate({ to: '/onboarding' })} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, textDecoration: 'underline' }}>Go back</button></p>
      </div>
    )
  }

  if (videos.length < 3) {
    return (
      <div className="page-enter">
        <div className="card-base" style={{ padding: '32px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📋</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, color: 'var(--text)', marginBottom: 8 }}>Not Enough Data</h2>
          <p style={{ color: 'var(--sub)', fontSize: 14 }}>Weekly Brief needs at least 3 videos to generate meaningful recommendations.</p>
        </div>
      </div>
    )
  }

  const { label: weekLabel } = getWeekRange()
  const bestDay = calcBestPostingDay(videos)

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 900, color: 'var(--text)', marginBottom: 4 }}>
            📋 Weekly Brief
          </h1>
          <p style={{ color: 'var(--sub)', fontSize: 14 }}>
            <Calendar size={13} style={{ display: 'inline', marginRight: 6 }} />
            Week of {weekLabel}
          </p>
        </div>
        <button
          onClick={run}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '12px 20px', borderRadius: 10, border: 'none',
            background: loading ? 'var(--border)' : 'var(--grad)',
            color: loading ? 'var(--muted)' : 'white',
            fontWeight: 700, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-display)',
          }}
        >
          <RefreshCw size={15} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          {loading ? 'Generating...' : brief ? 'Regenerate' : "📋 Generate This Week's Brief"}
        </button>
      </div>

      {!brief && !loading && (
        <CommandCard
          command={`Generate your weekly brief now — get your exact upload schedule based on your real channel data`}
          why={`${channel.snippet.title} gets best results on ${bestDay.best.day} — your brief optimises around this`}
          impact="Know exactly what to make, when to post, and what to stop doing — all in one plan"
          priority="Do Today"
        />
      )}

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Skeleton height={110} borderRadius={16} />
          <Skeleton height={220} borderRadius={16} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <Skeleton height={100} borderRadius={16} />
            <Skeleton height={100} borderRadius={16} />
            <Skeleton height={100} borderRadius={16} />
          </div>
          <Skeleton height={300} borderRadius={16} />
        </div>
      )}

      {error && <ErrorCard message={error} onRetry={run} />}

      {brief && !loading && (
        <>
          {/* CommandCard */}
          <CommandCard
            command={`Post "${brief.nextVideo.title}" on ${brief.nextVideo.postDay} at ${brief.nextVideo.postTime}`}
            why={brief.nextVideo.whyThisTopic}
            impact={brief.nextVideo.estimatedRange}
            priority="Do Today"
          />

          {/* Next Video Card */}
          <div className="card-base" style={{ padding: '28px 32px', borderLeft: '4px solid var(--pink)' }}>
            <div style={{ fontSize: 11, color: 'var(--sub)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 16 }}>
              📹 THIS WEEK'S VIDEO
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
              <div style={{
                fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 22,
                color: 'var(--text)', flex: 1, lineHeight: 1.3,
              }}>
                {brief.nextVideo.title}
              </div>
              <CopyBtn text={brief.nextVideo.title} />
            </div>

            {/* Hook opening line */}
            <div style={{
              fontSize: 14, fontStyle: 'italic', color: 'var(--sub)', lineHeight: 1.6,
              padding: '12px 16px', background: 'rgba(124,58,237,0.06)',
              border: '1px solid rgba(124,58,237,0.15)', borderRadius: 10, marginBottom: 16,
            }}>
              "{brief.nextVideo.hook}"
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              {[
                { label: 'POST DATE', value: `${brief.nextVideo.postDay} at ${brief.nextVideo.postTime}`, color: 'var(--pink)' },
                { label: 'THUMBNAIL', value: brief.nextVideo.thumbnail, color: 'var(--cyan)' },
                { label: 'ESTIMATED RANGE', value: brief.nextVideo.estimatedRange, color: 'var(--green)' },
              ].map(item => (
                <div key={item.label} style={{ padding: '12px 14px', background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div style={{ fontSize: 10, color: item.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.4 }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 7-Day Timeline */}
          {(brief.thisWeek || (brief as any).weekSchedule)?.length > 0 && (
            <div className="card-base" style={{ padding: '24px 28px' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: 'var(--text)', marginBottom: 20 }}>
                📅 7-Day Action Plan
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(brief.thisWeek || (brief as any).weekSchedule).slice(0, 7).map((item: DayTask, i: number) => (
                  <div key={i} style={{
                    padding: '14px 18px', background: 'var(--card2)',
                    border: '1px solid var(--border)',
                    borderLeft: `3px solid ${DAY_COLORS[i % DAY_COLORS.length]}`,
                    borderRadius: 12,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                      <div style={{
                        padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 800,
                        background: `${DAY_COLORS[i % DAY_COLORS.length]}22`,
                        color: DAY_COLORS[i % DAY_COLORS.length],
                        textTransform: 'uppercase', letterSpacing: '0.5px',
                      }}>{item.day}</div>
                      {item.time && (
                        <span style={{ fontSize: 12, color: 'var(--sub)' }}>{item.time}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                      {item.task}
                    </div>
                    {item.detail && (
                      <div style={{ fontSize: 13, color: 'var(--sub)', lineHeight: 1.4, marginBottom: 6 }}>{item.detail}</div>
                    )}
                    {item.why && (
                      <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>Why: {item.why}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stop / Double Down / Goal */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <div style={{ padding: '20px 22px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--red)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10 }}>
                ✋ STOP THIS
              </div>
              <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 600, lineHeight: 1.5, marginBottom: 8 }}>{brief.stopDoingThis?.what}</div>
              {brief.stopDoingThis?.proof && (
                <div style={{ fontSize: 12, color: 'var(--sub)', fontStyle: 'italic' }}>"{brief.stopDoingThis.proof}"</div>
              )}
            </div>
            <div style={{ padding: '20px 22px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10 }}>
                ⚡ DOUBLE DOWN
              </div>
              <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 600, lineHeight: 1.5, marginBottom: 8 }}>{brief.doubleDownOn?.what}</div>
              {brief.doubleDownOn?.upside && (
                <div style={{ fontSize: 12, color: 'var(--green)' }}>Upside: {brief.doubleDownOn.upside}</div>
              )}
            </div>
            <div style={{ padding: '20px 22px', background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.25)', borderRadius: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10 }}>
                🎯 WEEKLY GOAL
              </div>
              <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.5 }}>{brief.weeklyGoal}</div>
            </div>
          </div>

          {/* Warning if you skip */}
          {brief.warningIfYouSkip && (
            <div style={{
              padding: '16px 20px',
              background: 'rgba(245,158,11,0.08)',
              border: '1px solid rgba(245,158,11,0.35)',
              borderLeft: '4px solid var(--gold)',
              borderRadius: 12,
            }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 6 }}>
                ⚠ WARNING IF YOU SKIP THIS WEEK
              </div>
              <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.5 }}>{brief.warningIfYouSkip}</div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
