import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useChannel } from '../context/ChannelContext'
import { youtubeCOMMENTS, askGroq, sanitize, GROQ_KEY_B } from '../lib/api'
import {
  calcBestPostingDay, calcBestLength, calcHookTypes, calcUploadMetrics,
  parseISO8601, safeInt, formatViews,
} from '../lib/calc'
import { CommandCard } from '../components/CommandCard'
import { Skeleton } from '../components/Skeleton'
import { ErrorCard } from '../components/ErrorCard'
import { Check, X, AlertTriangle, ChevronRight, ClipboardCheck } from 'lucide-react'

interface CheckResult {
  id: string
  label: string
  status: 'pass' | 'fail' | 'warn' | 'loading'
  detail: string
  fix?: string
}

function classifyHook(title: string): string {
  const s = (title || '').toLowerCase()
  if (/\?/.test(s)) return 'Question Hook'
  if (/^\d+|\b\d+\s*(ways|things|tips|mistakes|tools|apps|steps|reasons)\b/.test(s)) return 'Number Hook'
  if (/\b(how i|how we|why i|my |story|journey|tried|spent|lived)\b/.test(s)) return 'Story Hook'
  if (/\b(secret|truth|real|actually|finally|honest)\b/.test(s)) return 'Reveal Hook'
  if (/\b(vs|versus|challenge|battle|beats|beat)\b/.test(s)) return 'Challenge Hook'
  if (/\b(how to|guide|tutorial|step|learn|master)\b/.test(s)) return 'Tutorial Hook'
  return 'Other'
}

const statusIcon = {
  pass: <Check size={15} />,
  fail: <X size={15} />,
  warn: <AlertTriangle size={13} />,
  loading: null,
}
const statusColor = {
  pass: 'var(--green)',
  fail: 'var(--red)',
  warn: 'var(--gold)',
  loading: 'var(--muted)',
}
const statusBg = {
  pass: 'rgba(16,185,129,0.07)',
  fail: 'rgba(239,68,68,0.07)',
  warn: 'rgba(245,158,11,0.07)',
  loading: 'var(--card2)',
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function Checker() {
  const { channel, videos, niche } = useChannel()
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [topic, setTopic] = useState('')
  const [plannedDate, setPlannedDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 3)
    return d.toISOString().split('T')[0]
  })
  const [lengthMins, setLengthMins] = useState(10)
  const [thumbnailDesc, setThumbnailDesc] = useState('')

  const [checks, setChecks] = useState<CheckResult[]>([])
  const [running, setRunning] = useState(false)
  const [verdict, setVerdict] = useState<'GO' | 'CAUTION' | 'NOT YET' | null>(null)
  const [passCount, setPassCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  if (!channel || !videos.length) {
    return (
      <div className="page-enter" style={{ padding: 40, textAlign: 'center', color: 'var(--sub)' }}>
        <p>No channel loaded. <button onClick={() => navigate({ to: '/onboarding' })} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, textDecoration: 'underline' }}>Go back</button></p>
      </div>
    )
  }

  const bestDay = calcBestPostingDay(videos)
  const hooks = calcHookTypes(videos)
  const lengths = calcBestLength(videos)
  const uploadM = calcUploadMetrics(videos)

  async function runChecks() {
    if (!title.trim() || !topic.trim()) return
    setRunning(true)
    setVerdict(null)
    setError(null)
    setChecks([])

    const results: CheckResult[] = []

    const plannedDayName = new Date(plannedDate + 'T12:00:00').toLocaleDateString('en', { weekday: 'long' })

    // CHECK 1 — Hook Type (instant)
    const myHook = classifyHook(title)
    const bestHookType = hooks[0]?.type
    const hookPass = !bestHookType || myHook === bestHookType || hooks.slice(0, 2).some(h => h.type === myHook)
    results.push({
      id: 'hook',
      label: 'Hook Type',
      status: hookPass ? 'pass' : 'warn',
      detail: hookPass
        ? `✓ ${myHook} hook — your best format, avg ${formatViews(Math.round(hooks[0]?.avg ?? 0))} views`
        : `✗ "${myHook}" hook performs below your best. Use "${bestHookType}" instead.`,
      fix: hookPass ? undefined : `Rewrite title using a ${bestHookType} structure`,
    })
    setChecks([...results])

    // CHECK 2 — Post Day (instant)
    const dayPass = plannedDayName === bestDay.best.day
    const diff = bestDay.best.avg > 0
      ? Math.round(((bestDay.best.avg - (bestDay.days.find(d => d.day === plannedDayName)?.avg ?? 0)) / Math.max(bestDay.best.avg, 1)) * 100)
      : 0
    results.push({
      id: 'day',
      label: 'Post Day',
      status: dayPass ? 'pass' : 'warn',
      detail: dayPass
        ? `✓ ${plannedDayName} is your best day — avg ${formatViews(Math.round(bestDay.best.avg))} views`
        : `✗ ${plannedDayName} is not your best day. Move to ${bestDay.best.day} (+${Math.abs(diff)}% views)`,
      fix: dayPass ? undefined : `Move upload to ${bestDay.best.day}`,
    })
    setChecks([...results])

    // CHECK 3 — Video Length (instant)
    const lengthSecs = lengthMins * 60
    const bestBucket = lengths[0]
    const lengthPass = !bestBucket || (lengthSecs >= bestBucket.minSec && lengthSecs < bestBucket.maxSec)
    results.push({
      id: 'length',
      label: 'Video Length',
      status: lengthPass ? 'pass' : 'warn',
      detail: lengthPass
        ? `✓ ${lengthMins} min is in your sweet spot — ${bestBucket?.label || 'your best range'}`
        : `✗ ${lengthMins} min is outside your best length range: ${bestBucket?.label}`,
      fix: lengthPass ? undefined : `Aim for ${bestBucket?.label} duration`,
    })
    setChecks([...results])

    // CHECK 4 — Title Formula (instant)
    const tLen = title.trim().length
    const hasNumber = /\d/.test(title)
    const isIdealLen = tLen >= 40 && tLen <= 70
    const formulaPass = isIdealLen && hasNumber
    let formulaDetail = ''
    if (formulaPass) formulaDetail = `✓ Title follows strong formula — number present, ${tLen} chars (ideal 40-70)`
    else if (!isIdealLen && !hasNumber) formulaDetail = `✗ ${tLen} chars (needs 40-70) and no number — add both`
    else if (!isIdealLen) formulaDetail = `✗ ${tLen} chars — ${tLen < 40 ? 'too short, add more context' : 'too long, remove filler words'}`
    else formulaDetail = `✗ No number in title — numbers boost CTR by ~36%`

    results.push({
      id: 'title_formula',
      label: 'Title Formula',
      status: formulaPass ? 'pass' : 'warn',
      detail: formulaDetail,
      fix: !formulaPass ? (tLen < 40 ? 'Add specifics: who, what, how many' : tLen > 70 ? 'Trim to under 70 chars' : 'Add a number (stat, count, year, amount)') : undefined,
    })
    setChecks([...results])

    // CHECK 5 — Topic Saturation (API)
    try {
      const after14 = new Date(Date.now() - 14 * 86_400_000).toISOString()
      const satRes = await youtubeCOMMENTS('search', {
        part: 'snippet',
        q: sanitize(topic, 50),
        type: 'video',
        publishedAfter: after14,
        maxResults: '10',
        order: 'viewCount',
      }) as { items?: unknown[] }
      const count = satRes.items?.length ?? 0
      results.push({
        id: 'saturation',
        label: 'Topic Saturation',
        status: count > 8 ? 'warn' : 'pass',
        detail: count > 8
          ? `⚠ High saturation — ${count} videos on this in 2 weeks. Add a unique angle.`
          : count <= 3
          ? `✓ Low saturation — only ${count} competing videos this week`
          : `✓ Moderate competition (${count} videos this week)`,
        fix: count > 8 ? 'Add a unique sub-angle or format twist to stand out' : undefined,
      })
    } catch {
      results.push({ id: 'saturation', label: 'Topic Saturation', status: 'warn', detail: 'Could not check saturation — quota limit', fix: 'Verify manually on YouTube search' })
    }
    setChecks([...results])

    // CHECK 6 — Competitor Conflict (API)
    try {
      const after7 = new Date(Date.now() - 7 * 86_400_000).toISOString()
      const compRes = await youtubeCOMMENTS('search', {
        part: 'snippet',
        q: sanitize(topic, 40) + ' ' + sanitize(niche, 20),
        type: 'video',
        publishedAfter: after7,
        maxResults: '5',
        order: 'viewCount',
      }) as { items?: Array<{ snippet?: { channelTitle?: string; publishedAt?: string } }> }

      const competitors = (compRes.items || [])
        .filter(i => i.snippet?.channelTitle !== channel?.snippet?.title)
        .slice(0, 2)

      if (competitors.length) {
        const ch = competitors[0].snippet?.channelTitle || 'A channel'
        const days = competitors[0].snippet?.publishedAt
          ? Math.max(0, Math.round((Date.now() - new Date(competitors[0].snippet.publishedAt).getTime()) / 86_400_000))
          : 0
        results.push({
          id: 'competitor',
          label: 'Competitor Conflict',
          status: 'warn',
          detail: `⚠ "${ch}" just posted similar content ${days}d ago. Consider a different angle.`,
          fix: 'Post within 48h or add a strong unique angle',
        })
      } else {
        results.push({ id: 'competitor', label: 'Competitor Conflict', status: 'pass', detail: '✓ No major competitor posted this topic recently — clear window' })
      }
    } catch {
      results.push({ id: 'competitor', label: 'Competitor Conflict', status: 'warn', detail: 'Could not check competitor activity', fix: 'Search YouTube manually' })
    }
    setChecks([...results])

    // CHECK 7 — Title Strength (Groq)
    const loadingIdx = results.length
    results.push({ id: 'title_score', label: 'Title Strength (AI)', status: 'loading', detail: 'Scoring your title with AI...' })
    setChecks([...results])

    try {
      const scoreRes = await askGroq(
        'YouTube title analyst. Score titles 0-10 on each dimension. Return JSON only.',
        `Title: "${sanitize(title, 100)}", niche: ${sanitize(niche, 30)}\nJSON:{"curiosity":n,"clarity":n,"urgency":n,"emotion":n,"keyword":n,"overall":n,"verdict":"STRONG" or "GOOD" or "WEAK","quickFix":"string"}`,
        true,
        GROQ_KEY_B
      ) as { curiosity: number; clarity: number; urgency: number; emotion: number; keyword: number; overall: number; verdict: string; quickFix: string }

      const overall = scoreRes.overall ?? 5
      results[loadingIdx] = {
        id: 'title_score',
        label: 'Title Strength (AI)',
        status: overall >= 7 ? 'pass' : overall >= 5 ? 'warn' : 'fail',
        detail: overall >= 7
          ? `✓ ${scoreRes.verdict} title — ${overall}/10 overall. Curiosity: ${scoreRes.curiosity}, Clarity: ${scoreRes.clarity}, Urgency: ${scoreRes.urgency}`
          : `${overall >= 5 ? '⚠' : '✗'} ${scoreRes.verdict} — ${overall}/10. ${scoreRes.quickFix}`,
        fix: overall < 7 ? scoreRes.quickFix : undefined,
      }
    } catch {
      results[loadingIdx] = { id: 'title_score', label: 'Title Strength (AI)', status: 'warn', detail: '⚠ Could not score title — AI rate limit', fix: 'Try again in 30s' }
    }
    setChecks([...results])

    // Verdict
    const passes = results.filter(r => r.status === 'pass').length
    const v: 'GO' | 'CAUTION' | 'NOT YET' = passes >= 6 ? 'GO' : passes >= 4 ? 'CAUTION' : 'NOT YET'
    setPassCount(passes)
    setVerdict(v)
    setRunning(false)
  }

  const verdictColor = verdict === 'GO' ? 'var(--green)' : verdict === 'CAUTION' ? 'var(--gold)' : 'var(--red)'
  const verdictBg = verdict === 'GO' ? 'rgba(16,185,129,0.1)' : verdict === 'CAUTION' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)'
  const verdictEmoji = verdict === 'GO' ? '✅' : verdict === 'CAUTION' ? '⚠️' : '🚫'
  const fixes = checks.filter(c => c.status !== 'pass' && c.fix)

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 900, color: 'var(--text)', marginBottom: 4 }}>
          ✅ Pre-Post Checker
        </h1>
        <p style={{ color: 'var(--sub)', fontSize: 14 }}>7-point launch checklist — run before every upload</p>
      </div>

      {!verdict && !running && (
        <CommandCard
          command={`Run the checklist before posting — your channel's best combo is ${bestDay.best.day} + ${lengths[0]?.label ?? 'medium'} + ${hooks[0]?.type ?? 'Question'} hook`}
          why={`Wrong day alone costs 30-50% of potential views. Topic saturation kills CTR within hours.`}
          impact="Passing all 7 checks increases first-48h views by an estimated 2-3x"
          priority="Do Today"
        />
      )}

      {/* Form */}
      <div className="card-base" style={{ padding: '24px 28px' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: 'var(--text)', marginBottom: 20 }}>
          Video Details
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--sub)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 6 }}>
              Video Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Your exact planned title"
            />
            {title && (
              <div style={{ marginTop: 4, fontSize: 11, color: title.length >= 40 && title.length <= 70 ? 'var(--green)' : 'var(--gold)' }}>
                {title.length} chars {title.length < 40 ? '— too short' : title.length > 70 ? '— too long' : '— ideal ✓'}
              </div>
            )}
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--sub)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 6 }}>
              Topic / Keywords *
            </label>
            <input
              type="text"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder={`e.g. "beginner ${niche} tips" or "best ${niche} tools 2025"`}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--sub)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 6 }}>
                Planned Upload Date
              </label>
              <input
                type="date"
                value={plannedDate}
                onChange={e => setPlannedDate(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--sub)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 6 }}>
                Video Length (mins)
              </label>
              <input
                type="number"
                min={1}
                max={60}
                value={lengthMins}
                onChange={e => setLengthMins(Number(e.target.value))}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--sub)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 6 }}>
                Thumbnail Desc.
              </label>
              <input
                type="text"
                value={thumbnailDesc}
                onChange={e => setThumbnailDesc(e.target.value)}
                placeholder="e.g. shocked face, bold text"
              />
            </div>
          </div>

          <button
            onClick={runChecks}
            disabled={running || !title.trim() || !topic.trim()}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center',
              padding: '14px 24px', borderRadius: 10, border: 'none',
              background: running || !title.trim() || !topic.trim() ? 'var(--border)' : 'var(--grad)',
              color: running || !title.trim() || !topic.trim() ? 'var(--muted)' : 'white',
              fontWeight: 700, fontSize: 15, cursor: running || !title.trim() || !topic.trim() ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-display)', width: 'fit-content',
              transition: 'all 0.2s',
            }}
          >
            <ClipboardCheck size={18} />
            {running ? 'Running 7 checks...' : 'Run 7-Point Check'}
          </button>
        </div>
      </div>

      {error && <ErrorCard message={error} onRetry={runChecks} />}

      {/* Progress / Results */}
      {checks.length > 0 && (
        <div className="card-base" style={{ padding: '24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: 'var(--text)' }}>
              Checklist Results
            </h2>
            {running && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--sub)' }}>
                <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid var(--border)', borderTopColor: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
                Check {checks.length} of 7...
              </div>
            )}
            {verdict && (
              <div style={{
                padding: '10px 22px', borderRadius: 12,
                background: verdictBg, border: `1px solid ${verdictColor}55`,
                display: 'flex', alignItems: 'center', gap: 14,
              }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 22, color: verdictColor }}>
                  {verdictEmoji} {verdict}
                </div>
                <div style={{ fontSize: 13, color: 'var(--sub)' }}>
                  {passCount}/7 passed
                </div>
              </div>
            )}
          </div>

          {/* Progress bar */}
          {running && (
            <div style={{ height: 4, background: 'var(--border)', borderRadius: 4, marginBottom: 20, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(checks.length / 7) * 100}%`, background: 'var(--grad)', transition: 'width 0.3s ease', borderRadius: 4 }} />
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {checks.map((check, i) => (
              <div
                key={check.id}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 14,
                  padding: '14px 16px', borderRadius: 12,
                  background: check.status === 'loading' ? 'var(--card2)' : statusBg[check.status],
                  border: `1px solid ${check.status === 'loading' ? 'var(--border)' : statusColor[check.status]}30`,
                  animation: `fadeInUp 0.25s ease ${i * 0.04}s both`,
                }}
              >
                {/* Status circle */}
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  background: check.status === 'loading' ? 'var(--card)' : `${statusColor[check.status]}18`,
                  border: `2px solid ${check.status === 'loading' ? 'var(--border)' : statusColor[check.status]}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: statusColor[check.status],
                }}>
                  {check.status === 'loading'
                    ? <div style={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid var(--muted)', borderTopColor: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
                    : statusIcon[check.status]
                  }
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{check.label}</span>
                    {check.status !== 'loading' && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: statusColor[check.status], textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {check.status.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--sub)', marginBottom: check.fix ? 6 : 0, lineHeight: 1.5 }}>
                    {check.detail}
                  </div>
                  {check.fix && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: statusColor[check.status], fontWeight: 600 }}>
                      <ChevronRight size={12} /> {check.fix}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Verdict banner */}
          {verdict && (
            <div style={{ marginTop: 20 }}>
              {/* Big verdict block */}
              <div style={{
                padding: '20px 24px', borderRadius: 14,
                background: verdictBg, border: `1px solid ${verdictColor}44`,
                display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
              }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 36, color: verdictColor }}>
                  {verdictEmoji} {verdict}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>
                    {verdict === 'GO'
                      ? `All clear — post your video on ${new Date(plannedDate + 'T12:00:00').toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' })}`
                      : verdict === 'CAUTION'
                      ? `Fix ${fixes.length} issue${fixes.length !== 1 ? 's' : ''}, then post on ${bestDay.best.day}`
                      : `Address ${fixes.length} critical issue${fixes.length !== 1 ? 's' : ''} before posting`
                    }
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--sub)' }}>
                    {passCount}/7 checks passed
                  </div>
                </div>
              </div>

              {/* Fix list */}
              {fixes.length > 0 && (
                <div style={{ marginTop: 16, padding: '16px 20px', background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '1px' }}>
                    {verdict === 'CAUTION' ? '⚠️ Fix before posting:' : '🚫 Required fixes:'}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {fixes.map((c, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13 }}>
                        <span style={{ color: c.status === 'fail' ? 'var(--red)' : 'var(--gold)', flexShrink: 0, fontWeight: 700 }}>
                          {i + 1}.
                        </span>
                        <span style={{ color: 'var(--sub)' }}>
                          <span style={{ color: 'var(--text)', fontWeight: 600 }}>{c.label}: </span>
                          {c.fix}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Loading skeletons while running checks 5-7 */}
      {running && checks.length < 4 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Skeleton height={56} />
          <Skeleton height={56} />
          <Skeleton height={56} />
        </div>
      )}

      {/* Post-verdict CommandCard */}
      {verdict && (
        <CommandCard
          command={
            verdict === 'GO'
              ? `Post your video on ${new Date(plannedDate + 'T12:00:00').toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' })} — ${passCount}/7 checks passed`
              : verdict === 'CAUTION'
              ? `Fix ${fixes.length} issue${fixes.length !== 1 ? 's' : ''} first, then post on ${bestDay.best.day} for ${formatViews(Math.round(bestDay.best.avg))} avg views`
              : `Hold this video — fix ${fixes.length} critical issue${fixes.length !== 1 ? 's' : ''} before scheduling`
          }
          why={
            verdict === 'GO'
              ? `Your ${hooks[0]?.type ?? 'hook'} + ${bestDay.best.day} + ${lengths[0]?.label ?? 'length'} combo is your proven winning formula`
              : `Each failed check reduces potential first-48h views by 20-40%`
          }
          impact={
            verdict === 'GO'
              ? `Expected ${formatViews(Math.round(bestDay.best.avg))} avg views when posting on best day with this format`
              : `Fixing these issues before posting could recover ${fixes.length * 25}%+ of potential views`
          }
          priority={verdict === 'GO' ? 'Do Today' : verdict === 'CAUTION' ? 'Do Today' : 'Do Today'}
        />
      )}
    </div>
  )
}
