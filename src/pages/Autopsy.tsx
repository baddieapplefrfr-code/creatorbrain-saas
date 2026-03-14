import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useChannel } from '../context/ChannelContext'
import type { YouTubeVideo } from '../context/ChannelContext'
import {
  getVideoId, formatViews, formatDuration, parseISO8601,
  hoursSince, engagementRate, performanceDisplay, calcAvgViews,
  velocityDisplay, safeInt,
} from '../lib/calc'
import {
  askGroq, youtubeCOMMENTS, fetchTranscript,
  sanitize, GROQ_KEY_A, GROQ_KEY_B,
} from '../lib/api'
import { Skeleton } from '../components/Skeleton'
import { ErrorCard } from '../components/ErrorCard'
import { CommandCard } from '../components/CommandCard'
import { ChevronLeft, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react'

// ─── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, children, style }: {
  title: string
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div className="card-base" style={{ padding: '24px 28px', ...style }}>
      <h2 style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 18,
        color: 'var(--text)',
        marginBottom: 20,
        letterSpacing: '-0.3px',
      }}>{title}</h2>
      {children}
    </div>
  )
}

// ─── Copy button ───────────────────────────────────────────────────────────────
function CopyBtn({ text, style }: { text: string; style?: React.CSSProperties }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }
  return (
    <button
      onClick={copy}
      title="Copy"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '4px 10px', borderRadius: 8,
        background: copied ? 'rgba(16,185,129,0.15)' : 'rgba(124,58,237,0.12)',
        border: `1px solid ${copied ? 'rgba(16,185,129,0.4)' : 'rgba(124,58,237,0.3)'}`,
        color: copied ? 'var(--green)' : 'var(--accent)',
        fontSize: 12, fontWeight: 600, flexShrink: 0,
        ...style,
      }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

// ─── Score bar ─────────────────────────────────────────────────────────────────
function ScoreBar({ label, score, isWeakest }: { label: string; score: number; isWeakest?: boolean }) {
  const color = score >= 7 ? 'var(--green)' : score >= 5 ? 'var(--gold)' : 'var(--red)'
  return (
    <div style={{
      padding: '10px 14px',
      background: isWeakest ? 'rgba(239,68,68,0.07)' : 'transparent',
      border: isWeakest ? '1px solid rgba(239,68,68,0.25)' : '1px solid transparent',
      borderRadius: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{
          fontSize: 13, fontWeight: 600,
          color: isWeakest ? 'var(--red)' : 'var(--text)',
          textTransform: 'capitalize',
        }}>
          {isWeakest ? '⚠ ' : ''}{label}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color }}>{score}/10</span>
      </div>
      <div style={{ height: 6, borderRadius: 99, background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${(score / 10) * 100}%`,
          background: color, borderRadius: 99,
          transition: 'width 0.8s ease',
        }} />
      </div>
    </div>
  )
}

// ─── Skeleton group helper ─────────────────────────────────────────────────────
function SkeletonBlock() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Skeleton height={24} width="60%" />
      <Skeleton height={16} width="90%" />
      <Skeleton height={16} width="75%" />
      <Skeleton height={80} />
      <Skeleton height={80} />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function Autopsy() {
  const navigate = useNavigate()
  const { selectedVideo, videos, niche } = useChannel()

  // ── guard ──────────────────────────────────────────────────────────────────
  if (!selectedVideo) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: '60vh', gap: 20, textAlign: 'center',
      }}>
        <div style={{ fontSize: 48 }}>🔬</div>
        <p style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>
          No video selected
        </p>
        <p style={{ color: 'var(--sub)', fontSize: 15 }}>
          ← Select a video from the Dashboard to analyze it
        </p>
        <button
          onClick={() => navigate({ to: '/dashboard' })}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 22px', borderRadius: 12,
            background: 'var(--accent)', color: '#fff',
            fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 14,
            border: 'none',
          }}
        >
          <ChevronLeft size={16} />
          Go to Dashboard
        </button>
      </div>
    )
  }

  return <AutopsyInner selectedVideo={selectedVideo} videos={videos} niche={niche} />
}

// ─── Inner component (video guaranteed non-null) ───────────────────────────────
function AutopsyInner({
  selectedVideo, videos, niche,
}: {
  selectedVideo: unknown
  videos: unknown[]
  niche: string
}) {
  const navigate = useNavigate()

  const v = selectedVideo as Record<string, unknown>
  const id = getVideoId(selectedVideo)
  const title = (v?.snippet as Record<string, unknown>)?.title as string || 'Untitled'
  const desc = (v?.snippet as Record<string, unknown>)?.description as string || ''
  const durS = parseISO8601((v?.contentDetails as Record<string, unknown>)?.duration as string)
  const views = safeInt((v?.statistics as Record<string, unknown>)?.viewCount as string)
  const avgV = calcAvgViews(videos as YouTubeVideo[])
  const perf = views / Math.max(avgV, 1)
  const eng = engagementRate(selectedVideo)
  const hoursOld = hoursSince((v?.snippet as Record<string, unknown>)?.publishedAt as string)
  const isTooNew = hoursOld < 48
  const perfDisplay = performanceDisplay(selectedVideo, avgV)

  // ── State ──────────────────────────────────────────────────────────────────
  const [playing, setPlaying] = useState(false)
  const [imgSrc, setImgSrc] = useState(`https://img.youtube.com/vi/${id}/maxresdefault.jpg`)
  const [imgFallback, setImgFallback] = useState(0)
  const imgFallbacks = [
    `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
    `https://img.youtube.com/vi/${id}/mqdefault.jpg`,
    `https://img.youtube.com/vi/${id}/default.jpg`,
  ]

  const [diagnosis, setDiagnosis] = useState<Record<string, unknown> | null>(null)
  const [diagnosisLoading, setDiagnosisLoading] = useState(true)
  const [diagnosisError, setDiagnosisError] = useState<string | null>(null)

  const [transcript, setTranscript] = useState<string | null>(null)
  const [transcriptLoading, setTranscriptLoading] = useState(true)
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const [transcriptAnalysis, setTranscriptAnalysis] = useState<unknown[] | null>(null)
  const [transcriptAnalysisLoading, setTranscriptAnalysisLoading] = useState(false)
  const [transcriptAnalysisError, setTranscriptAnalysisError] = useState<string | null>(null)

  const [commentAnalysis, setCommentAnalysis] = useState<Record<string, unknown> | null>(null)
  const [commentLoading, setCommentLoading] = useState(false)
  const [commentError, setCommentError] = useState<string | null>(null)

  const [titleAnalysis, setTitleAnalysis] = useState<Record<string, unknown> | null>(null)
  const [titleLoading, setTitleLoading] = useState(false)
  const [titleError, setTitleError] = useState<string | null>(null)

  const [thumbAnalysis, setThumbAnalysis] = useState<Record<string, unknown> | null>(null)
  const [thumbLoading, setThumbLoading] = useState(false)
  const [thumbError, setThumbError] = useState<string | null>(null)

  const diagnosisRan = useRef(false)
  const transcriptRan = useRef(false)

  // ── Section B: Diagnosis ───────────────────────────────────────────────────
  const runDiagnosis = useCallback(async () => {
    setDiagnosisLoading(true)
    setDiagnosisError(null)
    try {
      const sys = 'You are a YouTube video coach doing a post-mortem on one specific video. Every sentence must reference the actual video title, actual numbers, or actual content. Generic advice = failure.'
      const user =
        `Video: "${sanitize(title, 70)}"\n` +
        `Published: ${Math.round(hoursSince((v?.snippet as Record<string, unknown>)?.publishedAt as string)/24)} days ago\n` +
        `Views: ${views} (channel avg: ${Math.round(avgV)})\n` +
        `Performance: ${perf >= 1.2 ? 'ABOVE' : perf <= 0.8 ? 'BELOW' : 'AT'} average (${perf.toFixed(2)}x)\n` +
        `Engagement: ${eng.toFixed(2)}%\n` +
        `Duration: ${formatDuration(durS)} (${durS}s)\n` +
        (isTooNew ? 'NOTE: Video is under 48 hours old\n' : '') +
        `Niche: ${niche}\n` +
        `Return JSON only:\n` +
        `{"verdict":"HIT"|"AVERAGE"|"UNDERPERFORMER"|"TOO_NEW","verdictReason":"one sentence specific to THIS video","hookStrength":{"score":0-100,"issue":"specific problem with THIS exact title","fix":"exact rewrite of the title"},"thumbnailAdvice":{"score":0-100,"issue":"what is likely missing","fix":"exact description of thumbnail"},"durationFit":{"verdict":"TOO_SHORT"|"PERFECT"|"TOO_LONG","reason":"specific to this video duration","impact":"estimated view impact"},"viewDropoffPrediction":{"when":"estimated drop-off point","why":"specific reason for this video","fix":"what to change in the opening"},"immediateAction":"ONE specific thing to do RIGHT NOW for this video","nextVideoLesson":"ONE thing different next time specific to this","remakeTitle":"exact improved title for a remake"}`
      const res = await askGroq(sys, user, true, GROQ_KEY_A) as Record<string, unknown>
      setDiagnosis(res)
    } catch (e) {
      setDiagnosisError((e as Error).message)
    } finally {
      setDiagnosisLoading(false)
    }
  }, [title, views, avgV, perf, eng, durS, niche, isTooNew, v])

  // ── Section C: Transcript ──────────────────────────────────────────────────
  const runTranscriptAnalysis = useCallback(async (tx: string | null) => {
    setTranscriptAnalysisLoading(true)
    setTranscriptAnalysisError(null)
    try {
      let res: unknown[]
      if (tx) {
        const user =
          `Transcript of "${sanitize(title, 40)}" (${formatDuration(durS)} video):\n` +
          `${tx.slice(0, 2000)}\nFind 5 retention risks.\n` +
          `JSON:[{"timestamp":str,"finding":str,"severity":"high"|"medium","fix":str}]`
        res = await askGroq('YouTube retention analyst. JSON only.', user, true, GROQ_KEY_A) as unknown[]
      } else {
        const user =
          `Video "${sanitize(title, 60)}", ${views} views, ${eng.toFixed(2)}% engagement, ` +
          `${formatDuration(durS)} long. Niche: ${niche}. ` +
          `Identify 3 content structure issues from title and metrics. ` +
          `JSON: [{"issue":str,"impact":str,"fix":str}]`
        res = await askGroq('YouTube content strategist. JSON only.', user, true, GROQ_KEY_A) as unknown[]
      }
      setTranscriptAnalysis(res)
    } catch (e) {
      setTranscriptAnalysisError((e as Error).message)
    } finally {
      setTranscriptAnalysisLoading(false)
    }
  }, [title, durS, views, eng, niche])

  // ── Section D: Comments ────────────────────────────────────────────────────
  const runCommentAnalysis = useCallback(async () => {
    setCommentLoading(true)
    setCommentError(null)
    try {
      const data = await youtubeCOMMENTS('commentThreads', {
        part: 'snippet', videoId: id, maxResults: '100', order: 'relevance',
      }) as Record<string, unknown>

      const items = (data.items as unknown[]) || []
      if (items.length < 10) {
        setCommentLoading(false)
        return
      }
      const sample = items
        .slice(0, 80)
        .map((it, i) => {
          const c = (it as Record<string, unknown>)
          const snip = (c.snippet as Record<string, unknown>)?.topLevelComment as Record<string, unknown>
          const text = ((snip?.snippet as Record<string, unknown>)?.textDisplay as string) || ''
          return `${i + 1}. ${text.slice(0, 80)}`
        })
        .join('\n')

      const sys = 'Audience psychologist. Find what the audience feels, wants, fears.'
      const user =
        `Comments on "${sanitize(title, 40)}":\n${sample}\n` +
        `JSON:{"topPraise":str,"topCriticism":str,"mostAsked":str,"nextVideoIdea":str,"retentionSignal":str,"audienceSentiment":"positive"|"mixed"|"negative"}`
      const res = await askGroq(sys, user, true, GROQ_KEY_B) as Record<string, unknown>
      setCommentAnalysis(res)
    } catch (e) {
      setCommentError((e as Error).message)
    } finally {
      setCommentLoading(false)
    }
  }, [id, title])

  // ── Section E: Title ───────────────────────────────────────────────────────
  const runTitleAnalysis = useCallback(async () => {
    setTitleLoading(true)
    setTitleError(null)
    try {
      const sys = 'YouTube title optimizer.'
      const user =
        `Title: "${sanitize(title, 80)}", niche: ${niche}, ${views} views\n` +
        `JSON:{"scores":{"curiosity":n,"clarity":n,"urgency":n,"emotion":n,"keyword":n},"weakest":str,"fix":str,"alternatives":[str,str,str]}`
      const res = await askGroq(sys, user, true, GROQ_KEY_B) as Record<string, unknown>
      setTitleAnalysis(res)
    } catch (e) {
      setTitleError((e as Error).message)
    } finally {
      setTitleLoading(false)
    }
  }, [title, niche, views])

  // ── Section F: Thumbnail ───────────────────────────────────────────────────
  const runThumbAnalysis = useCallback(async () => {
    setThumbLoading(true)
    setThumbError(null)
    try {
      const sys = 'YouTube thumbnail strategist. Return JSON only.'
      const user =
        `Video "${sanitize(title, 60)}", ${views} views, ${eng.toFixed(2)}% engagement, niche: ${niche}\n` +
        `JSON:{"scores":{"facePresence":n,"textOverlay":n,"colorContrast":n,"emotionSignal":n,"brandConsistency":n},"topFix":str,"concepts":[str,str,str]}`
      const res = await askGroq(sys, user, true, GROQ_KEY_A) as Record<string, unknown>
      setThumbAnalysis(res)
    } catch (e) {
      setThumbError((e as Error).message)
    } finally {
      setThumbLoading(false)
    }
  }, [title, views, eng, niche])

  // ── Mount effects ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (diagnosisRan.current) return
    diagnosisRan.current = true
    runDiagnosis()
  }, [runDiagnosis])

  useEffect(() => {
    if (transcriptRan.current) return
    transcriptRan.current = true
    setTranscriptLoading(true)
    fetchTranscript(id).then(tx => {
      setTranscript(tx)
      setTranscriptLoading(false)
      runTranscriptAnalysis(tx)
    })
  }, [id, runTranscriptAnalysis])

  // Fire comment + title + thumbnail after diagnosis loads (sequential)
  useEffect(() => {
    if (!diagnosisLoading && diagnosis) {
      const runSequential = async () => {
        await runCommentAnalysis()
        await runTitleAnalysis()
        await runThumbAnalysis()
      }
      runSequential()
    }
  }, [diagnosisLoading, diagnosis]) // eslint-disable-line react-hooks/exhaustive-deps

  // Suppress desc warning
  void desc

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 900 }}>

      {/* Back button */}
      <button
        onClick={() => navigate({ to: '/dashboard' })}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          width: 'fit-content', padding: '8px 16px', borderRadius: 10,
          background: 'var(--card)', border: '1px solid var(--border)',
          color: 'var(--sub)', fontSize: 13, fontWeight: 600,
        }}
      >
        <ChevronLeft size={16} /> Dashboard
      </button>

      {/* Title */}
      <h1 style={{
        fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 24,
        color: 'var(--text)', lineHeight: 1.3, letterSpacing: '-0.5px',
      }}>
        🔬 {title}
      </h1>

      {/* ─── SECTION A: Video Player ──────────────────────────────────────── */}
      <Section title="📺 Video Player">
        <VideoPlayer id={id} playing={playing} setPlaying={setPlaying}
          imgSrc={imgSrc} setImgSrc={setImgSrc}
          imgFallback={imgFallback} setImgFallback={setImgFallback}
          imgFallbacks={imgFallbacks}
        />
        {/* Stats row */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: 12, marginTop: 20,
        }}>
          <StatChip label="Views" value={formatViews(views)} />
          <StatChip label="Duration" value={formatDuration(durS)} />
          <StatChip label="Engagement" value={`${eng.toFixed(2)}%`}
            color={eng >= 3 ? 'var(--green)' : eng >= 1 ? 'var(--gold)' : 'var(--red)'} />
          <StatChip label="Velocity" value={velocityDisplay(selectedVideo)} />
          <StatChip label="vs Channel Avg" value={perfDisplay.label} color={perfDisplay.color} />
        </div>
      </Section>

      {/* ─── SECTION B: Diagnosis ─────────────────────────────────────────── */}
      <Section title="🎯 Video Coaching Report">
        {diagnosisLoading ? <SkeletonBlock /> : diagnosisError ? (
          <ErrorCard message={diagnosisError} onRetry={runDiagnosis} />
        ) : diagnosis ? (
          <DiagnosisPanel diagnosis={diagnosis} />
        ) : null}
      </Section>

      {/* ─── SECTION C: Transcript ────────────────────────────────────────── */}
      <Section title="📜 Transcript Analysis">
        <TranscriptPanel
          transcript={transcript}
          transcriptLoading={transcriptLoading}
          transcriptOpen={transcriptOpen}
          setTranscriptOpen={setTranscriptOpen}
          transcriptAnalysis={transcriptAnalysis}
          transcriptAnalysisLoading={transcriptAnalysisLoading}
          transcriptAnalysisError={transcriptAnalysisError}
          onRetry={() => runTranscriptAnalysis(transcript)}
        />
      </Section>

      {/* ─── SECTION D: Comment Analysis ─────────────────────────────────── */}
      <Section title="💬 Comment Analysis">
        {commentLoading ? <SkeletonBlock /> : commentError ? (
          <ErrorCard message={commentError} onRetry={runCommentAnalysis} />
        ) : commentAnalysis ? (
          <CommentPanel analysis={commentAnalysis} />
        ) : (
          <SkeletonBlock />
        )}
      </Section>

      {/* ─── SECTION E: Title Analysis ───────────────────────────────────── */}
      <Section title="✍️ Title Analysis">
        {titleLoading ? <SkeletonBlock /> : titleError ? (
          <ErrorCard message={titleError} onRetry={runTitleAnalysis} />
        ) : titleAnalysis ? (
          <TitlePanel analysis={titleAnalysis} />
        ) : (
          <SkeletonBlock />
        )}
      </Section>

      {/* ─── SECTION F: Thumbnail Strategy ───────────────────────────────── */}
      <Section title="🖼️ Thumbnail Strategy">
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16, fontStyle: 'italic' }}>
          Analysis based on title and niche — visual AI cannot see images
        </p>
        {thumbLoading ? <SkeletonBlock /> : thumbError ? (
          <ErrorCard message={thumbError} onRetry={runThumbAnalysis} />
        ) : thumbAnalysis ? (
          <ThumbnailPanel analysis={thumbAnalysis} />
        ) : (
          <SkeletonBlock />
        )}
      </Section>

    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Stat chip ────────────────────────────────────────────────────────────────
function StatChip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '12px 14px', textAlign: 'center',
    }}>
      <div className="label-upper" style={{ marginBottom: 6 }}>{label}</div>
      <div style={{
        fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16,
        color: color || 'var(--text)',
      }}>{value || '—'}</div>
    </div>
  )
}

// ─── Video Player ─────────────────────────────────────────────────────────────
function VideoPlayer({ id, playing, setPlaying, imgSrc, setImgSrc, imgFallback, setImgFallback, imgFallbacks }: {
  id: string
  playing: boolean
  setPlaying: (b: boolean) => void
  imgSrc: string
  setImgSrc: (s: string) => void
  imgFallback: number
  setImgFallback: (n: number) => void
  imgFallbacks: string[]
}) {
  if (playing) {
    return (
      <div style={{
        position: 'relative', paddingBottom: '56.25%',
        borderRadius: 12, overflow: 'hidden', background: '#000',
      }}>
        <iframe
          src={`https://www.youtube.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&iv_load_policy=3&disablekb=0&fs=1&playsinline=1`}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%', border: 'none',
          }}
        />
      </div>
    )
  }

  return (
    <div
      onClick={() => setPlaying(true)}
      style={{
        position: 'relative', paddingBottom: '56.25%',
        borderRadius: 12, overflow: 'hidden',
        cursor: 'pointer', background: 'var(--card2)',
      }}
    >
      <img
        src={imgSrc}
        alt="Video thumbnail"
        onError={() => {
          if (imgFallback < imgFallbacks.length) {
            setImgSrc(imgFallbacks[imgFallback])
            setImgFallback(imgFallback + 1)
          }
        }}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />
      {/* Play overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.25)',
        transition: 'background 0.2s',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--accent), var(--pink))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 24px rgba(124,58,237,0.5)',
        }}>
          <span style={{ fontSize: 26, marginLeft: 4 }}>▶</span>
        </div>
      </div>
    </div>
  )
}

// ─── Diagnosis Panel ──────────────────────────────────────────────────────────
function DiagnosisPanel({ diagnosis }: { diagnosis: Record<string, unknown> }) {
  const verdict = diagnosis.verdict as string
  const verdictReason = diagnosis.verdictReason as string
  const hookStrength = diagnosis.hookStrength as Record<string, unknown> | undefined
  const thumbnailAdvice = diagnosis.thumbnailAdvice as Record<string, unknown> | undefined
  const durationFit = diagnosis.durationFit as Record<string, unknown> | undefined
  const dropoff = diagnosis.viewDropoffPrediction as Record<string, unknown> | undefined
  const immediateAction = diagnosis.immediateAction as string
  const nextLesson = diagnosis.nextVideoLesson as string
  const remakeTitle = diagnosis.remakeTitle as string

  const verdictConfig: Record<string, { bg: string; color: string; label: string }> = {
    HIT: { bg: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(16,185,129,0.05))', color: 'var(--green)', label: '🚀 HIT VIDEO' },
    AVERAGE: { bg: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(245,158,11,0.05))', color: 'var(--gold)', label: '→ AVERAGE PERFORMER' },
    UNDERPERFORMER: { bg: 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(239,68,68,0.05))', color: 'var(--red)', label: '📉 UNDERPERFORMER' },
    TOO_NEW: { bg: 'linear-gradient(135deg, rgba(124,58,237,0.15), rgba(124,58,237,0.03))', color: 'var(--accent)', label: '⏳ TOO EARLY TO JUDGE' },
  }
  const vc = verdictConfig[verdict] || verdictConfig.AVERAGE

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Verdict Banner */}
      <div style={{
        padding: '20px 24px', borderRadius: 14,
        background: vc.bg, border: `1px solid ${vc.color}44`,
      }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 22,
          color: vc.color, marginBottom: 8, letterSpacing: '-0.3px',
        }}>{vc.label}</div>
        <div style={{ fontSize: 15, color: 'var(--text)', lineHeight: 1.5 }}>{verdictReason}</div>
      </div>

      {/* 2x2 Coaching Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {/* Hook Strength */}
        <div style={{
          padding: '18px 20px', background: 'var(--card2)',
          border: '1px solid var(--border)', borderRadius: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: 'var(--text)' }}>
              Hook Strength
            </div>
            {hookStrength?.score !== undefined && (
              <span style={{
                fontSize: 13, fontWeight: 800,
                color: Number(hookStrength.score) >= 70 ? 'var(--green)' : Number(hookStrength.score) >= 40 ? 'var(--gold)' : 'var(--red)',
              }}>{hookStrength.score as number}/100</span>
            )}
          </div>
          {!!hookStrength?.issue && (
            <div style={{ fontSize: 13, color: 'var(--red)', marginBottom: 10 }}>⚠ {String(hookStrength.issue)}</div>
          )}
          {!!hookStrength?.fix && (
            <div style={{
              padding: '8px 12px', background: 'rgba(16,185,129,0.08)',
              border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8, fontSize: 13,
              fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--text)',
              lineHeight: 1.4,
            }}>
              ✏ {String(hookStrength.fix)}
            </div>
          )}
          {!!hookStrength?.fix && (
            <div style={{ marginTop: 8 }}>
              <CopyBtn text={hookStrength.fix as string} />
            </div>
          )}
        </div>

        {/* Thumbnail */}
        <div style={{
          padding: '18px 20px', background: 'var(--card2)',
          border: '1px solid var(--border)', borderRadius: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: 'var(--text)' }}>
              Thumbnail Strategy
            </div>
            {thumbnailAdvice?.score !== undefined && (
              <span style={{
                fontSize: 13, fontWeight: 800,
                color: Number(thumbnailAdvice.score) >= 70 ? 'var(--green)' : Number(thumbnailAdvice.score) >= 40 ? 'var(--gold)' : 'var(--red)',
              }}>{thumbnailAdvice.score as number}/100</span>
            )}
          </div>
          {!!thumbnailAdvice?.issue && (
            <div style={{ fontSize: 13, color: 'var(--gold)', marginBottom: 10 }}>⚠ {String(thumbnailAdvice.issue)}</div>
          )}
          {!!thumbnailAdvice?.fix && (
            <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
              <span style={{ fontWeight: 700, color: 'var(--green)' }}>→ </span>{String(thumbnailAdvice.fix)}
            </div>
          )}
        </div>

        {/* Duration Fit */}
        <div style={{
          padding: '18px 20px', background: 'var(--card2)',
          border: '1px solid var(--border)', borderRadius: 14,
        }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: 'var(--text)', marginBottom: 12 }}>
            Video Length Fit
          </div>
          {durationFit && (
            <>
              <div style={{
                display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 800,
                marginBottom: 10,
                background: durationFit.verdict === 'PERFECT' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.12)',
                color: durationFit.verdict === 'PERFECT' ? 'var(--green)' : 'var(--red)',
              }}>{durationFit.verdict as string}</div>
              <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, marginBottom: 8 }}>{durationFit.reason as string}</div>
              {!!durationFit.impact && (
                <div style={{ fontSize: 12, color: 'var(--sub)', fontStyle: 'italic' }}>{durationFit.impact as string}</div>
              )}
            </>
          )}
        </div>

        {/* View Drop-off */}
        <div style={{
          padding: '18px 20px', background: 'var(--card2)',
          border: '1px solid var(--border)', borderRadius: 14,
        }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: 'var(--text)', marginBottom: 12 }}>
            View Drop-off Prediction
          </div>
          {dropoff && (
            <>
              {!!dropoff.when && (
                <div style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '1px' }}>Viewers likely leave at: </span>
                  <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{dropoff.when as string}</span>
                </div>
              )}
              {!!dropoff.why && (
                <div style={{ fontSize: 13, color: 'var(--sub)', marginBottom: 8, lineHeight: 1.4 }}>{dropoff.why as string}</div>
              )}
              {!!dropoff.fix && (
                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.4 }}>
                  <span style={{ fontWeight: 700, color: 'var(--green)' }}>→ FIX: </span>{dropoff.fix as string}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Immediate Action - full width */}
      {immediateAction && (
        <div style={{
          padding: '18px 22px', background: 'rgba(244,63,142,0.08)',
          border: '2px solid rgba(244,63,142,0.35)', borderRadius: 14,
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--pink)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 8 }}>
            DO THIS NOW
          </div>
          <div style={{
            fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16,
            color: 'var(--text)', lineHeight: 1.4,
          }}>{immediateAction}</div>
        </div>
      )}

      {/* Next Video Lesson - full width */}
      {(nextLesson || remakeTitle) && (
        <div style={{
          padding: '18px 22px', background: 'rgba(6,182,212,0.08)',
          border: '1px solid rgba(6,182,212,0.3)', borderRadius: 14,
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--cyan)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 8 }}>
            NEXT VIDEO LESSON
          </div>
          {nextLesson && (
            <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.5, marginBottom: 12 }}>{nextLesson}</div>
          )}
          {remakeTitle && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px', background: 'rgba(6,182,212,0.08)',
              border: '1px solid rgba(6,182,212,0.2)', borderRadius: 10,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: 'var(--cyan)', fontWeight: 700, marginBottom: 4 }}>REMAKE TITLE</div>
                <div style={{ fontSize: 14, fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--text)' }}>{remakeTitle}</div>
              </div>
              <CopyBtn text={remakeTitle} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Transcript Panel ─────────────────────────────────────────────────────────
function TranscriptPanel({
  transcript, transcriptLoading, transcriptOpen, setTranscriptOpen,
  transcriptAnalysis, transcriptAnalysisLoading, transcriptAnalysisError, onRetry,
}: {
  transcript: string | null
  transcriptLoading: boolean
  transcriptOpen: boolean
  setTranscriptOpen: (b: boolean) => void
  transcriptAnalysis: unknown[] | null
  transcriptAnalysisLoading: boolean
  transcriptAnalysisError: string | null
  onRetry: () => void
}) {
  if (transcriptLoading) return <SkeletonBlock />

  const hasTranscript = !!transcript

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {hasTranscript ? (
        <>
          {/* Collapsible raw transcript */}
          <button
            onClick={() => setTranscriptOpen(!transcriptOpen)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '12px 16px', borderRadius: 10,
              background: 'var(--surface)', border: '1px solid var(--border)',
              color: 'var(--sub)', fontSize: 13, fontWeight: 600, textAlign: 'left',
            }}
          >
            {transcriptOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {transcriptOpen ? 'Hide' : 'Show'} Raw Transcript ({transcript.length.toLocaleString()} chars)
          </button>
          {transcriptOpen && (
            <div style={{
              maxHeight: 300, overflowY: 'auto', padding: '14px 16px',
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 10, fontSize: 12, color: 'var(--sub)',
              lineHeight: 1.7, fontFamily: 'monospace',
            }}>
              {transcript}
            </div>
          )}
        </>
      ) : (
        <div style={{
          padding: '12px 16px', borderRadius: 10,
          background: 'rgba(92,80,128,0.15)', border: '1px solid rgba(92,80,128,0.3)',
          fontSize: 13, color: 'var(--muted)',
        }}>
          📭 Transcript unavailable — analysing metadata only
        </div>
      )}

      {/* Analysis */}
      <div style={{ marginTop: 4 }}>
        <div className="label-upper" style={{ marginBottom: 12 }}>
          {hasTranscript ? '🔍 Retention Risk Analysis' : '🔍 Structure Issues (Metadata)'}
        </div>
        {transcriptAnalysisLoading ? <SkeletonBlock /> : transcriptAnalysisError ? (
          <ErrorCard message={transcriptAnalysisError} onRetry={onRetry} />
        ) : transcriptAnalysis ? (
          <TimelineItems items={transcriptAnalysis} hasTranscript={hasTranscript} />
        ) : null}
      </div>
    </div>
  )
}

// ─── Timeline items ────────────────────────────────────────────────────────────
function TimelineItems({ items, hasTranscript }: { items: unknown[]; hasTranscript: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {items.map((item, i) => {
        const it = item as Record<string, unknown>
        const severity = it.severity as string
        const isHigh = severity === 'high'
        const dotColor = isHigh ? 'var(--red)' : 'var(--gold)'

        return (
          <div key={i} style={{ display: 'flex', gap: 16, position: 'relative' }}>
            {/* Line */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20, flexShrink: 0 }}>
              <div style={{
                width: 12, height: 12, borderRadius: '50%',
                background: dotColor, flexShrink: 0, marginTop: 14,
              }} />
              {i < items.length - 1 && (
                <div style={{ flex: 1, width: 2, background: 'var(--border)', marginTop: 4 }} />
              )}
            </div>
            {/* Content */}
            <div style={{ paddingBottom: 20, flex: 1, paddingTop: 8 }}>
              {hasTranscript ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                      background: isHigh ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                      color: dotColor, fontFamily: 'monospace',
                    }}>{it.timestamp as string}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                      color: dotColor, letterSpacing: '0.5px',
                    }}>{severity}</span>
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6, lineHeight: 1.4 }}>
                    {it.finding as string}
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--sub)', lineHeight: 1.5 }}>
                    Fix: {it.fix as string}
                  </p>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6, lineHeight: 1.4 }}>
                    {it.issue as string}
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--red)', marginBottom: 4, lineHeight: 1.4 }}>
                    Impact: {it.impact as string}
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--sub)', lineHeight: 1.5 }}>
                    Fix: {it.fix as string}
                  </p>
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Comment Panel ────────────────────────────────────────────────────────────
function CommentPanel({ analysis }: { analysis: Record<string, unknown> }) {
  const topPraise = analysis.topPraise as string
  const topCriticism = analysis.topCriticism as string
  const mostAsked = analysis.mostAsked as string
  const nextVideoIdea = analysis.nextVideoIdea as string
  const retentionSignal = analysis.retentionSignal as string
  const audienceSentiment = analysis.audienceSentiment as string

  const sentimentColor = audienceSentiment === 'positive' ? 'var(--green)'
    : audienceSentiment === 'negative' ? 'var(--red)' : 'var(--gold)'
  const sentimentEmoji = audienceSentiment === 'positive' ? '😊' : audienceSentiment === 'negative' ? '😤' : '😐'

  const cards = [
    { label: '👏 Top Praise', value: topPraise, border: 'rgba(16,185,129,0.4)', bg: 'rgba(16,185,129,0.06)' },
    { label: '🔥 Top Criticism', value: topCriticism, border: 'rgba(239,68,68,0.4)', bg: 'rgba(239,68,68,0.06)' },
    { label: '❓ Most Asked', value: mostAsked, border: 'rgba(245,158,11,0.4)', bg: 'rgba(245,158,11,0.06)' },
    { label: '📡 Retention Signal', value: retentionSignal, border: 'rgba(6,182,212,0.4)', bg: 'rgba(6,182,212,0.06)' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        {cards.map(c => (
          <div key={c.label} style={{
            background: c.bg, border: `1px solid ${c.border}`,
            borderRadius: 12, padding: '14px 16px',
          }}>
            <div className="label-upper" style={{ marginBottom: 8 }}>{c.label}</div>
            <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.5 }}>{c.value}</p>
          </div>
        ))}

        {/* Next Video Idea — highlighted */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(124,58,237,0.12), rgba(244,63,142,0.08))',
          border: '1px solid rgba(124,58,237,0.45)',
          borderRadius: 12, padding: '14px 16px',
          gridColumn: 'span 1',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div className="label-upper" style={{ color: 'var(--accent)' }}>💡 Next Video Idea</div>
            {nextVideoIdea && <CopyBtn text={nextVideoIdea} />}
          </div>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', lineHeight: 1.5 }}>{nextVideoIdea}</p>
        </div>

        {/* Sentiment badge */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '14px 16px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 8, textAlign: 'center',
        }}>
          <div className="label-upper">Audience Sentiment</div>
          <div style={{ fontSize: 32 }}>{sentimentEmoji}</div>
          <div style={{
            fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16,
            color: sentimentColor, textTransform: 'uppercase', letterSpacing: '1px',
          }}>{audienceSentiment}</div>
        </div>
      </div>

      {/* Command card */}
      {nextVideoIdea && (
        <CommandCard
          command={`Make this next: ${nextVideoIdea}`}
          why="Your audience is explicitly asking for this type of content"
          impact="Higher initial view velocity + comment engagement from day one"
          priority="Do This Week"
        />
      )}
    </div>
  )
}

// ─── Title Panel ──────────────────────────────────────────────────────────────
function TitlePanel({ analysis }: { analysis: Record<string, unknown> }) {
  const scores = (analysis.scores as Record<string, number>) || {}
  const weakest = (analysis.weakest as string) || ''
  const fix = (analysis.fix as string) || ''
  const alternatives = (analysis.alternatives as string[]) || []

  const dims = ['curiosity', 'clarity', 'urgency', 'emotion', 'keyword']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Score bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {dims.map(d => (
          <ScoreBar key={d} label={d} score={scores[d] ?? 0} isWeakest={weakest.toLowerCase() === d} />
        ))}
      </div>

      {/* Fix */}
      {fix && (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
          borderLeft: '4px solid var(--red)', borderRadius: 10, padding: '14px 18px',
        }}>
          <div className="label-upper" style={{ marginBottom: 8, color: 'var(--red)' }}>🔧 How to Fix</div>
          <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.5 }}>{fix}</p>
        </div>
      )}

      {/* Alternatives */}
      {alternatives.length > 0 && (
        <div>
          <div className="label-upper" style={{ marginBottom: 12 }}>✨ Alternative Titles</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {alternatives.map((alt, i) => (
              <div key={i} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '12px 16px',
                display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
              }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginRight: 8 }}>
                    #{i + 1}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{alt}</span>
                </div>
                <CopyBtn text={alt} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Thumbnail Panel ──────────────────────────────────────────────────────────
function ThumbnailPanel({ analysis }: { analysis: Record<string, unknown> }) {
  const scores = (analysis.scores as Record<string, number>) || {}
  const topFix = (analysis.topFix as string) || ''
  const concepts = (analysis.concepts as string[]) || []

  const dims = ['facePresence', 'textOverlay', 'colorContrast', 'emotionSignal', 'brandConsistency']
  const dimLabels: Record<string, string> = {
    facePresence: 'Face Presence',
    textOverlay: 'Text Overlay',
    colorContrast: 'Color Contrast',
    emotionSignal: 'Emotion Signal',
    brandConsistency: 'Brand Consistency',
  }
  const weakest = dims.reduce((a, b) => (scores[a] ?? 0) <= (scores[b] ?? 0) ? a : b)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {dims.map(d => (
          <ScoreBar key={d} label={dimLabels[d]} score={scores[d] ?? 0} isWeakest={d === weakest} />
        ))}
      </div>

      {/* Top fix */}
      {topFix && (
        <div style={{
          background: 'rgba(244,63,142,0.08)', border: '1px solid rgba(244,63,142,0.3)',
          borderLeft: '4px solid var(--pink)', borderRadius: 10, padding: '14px 18px',
        }}>
          <div className="label-upper" style={{ marginBottom: 8, color: 'var(--pink)' }}>🎯 Top Thumbnail Fix</div>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', lineHeight: 1.5 }}>{topFix}</p>
        </div>
      )}

      {/* Concept ideas */}
      {concepts.length > 0 && (
        <div>
          <div className="label-upper" style={{ marginBottom: 12 }}>💡 Thumbnail Concepts</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {concepts.map((c, i) => (
              <div key={i} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '12px 16px',
                display: 'flex', alignItems: 'flex-start', gap: 12,
              }}>
                <span style={{
                  width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg, var(--accent), var(--pink))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800, color: '#fff',
                }}>{i + 1}</span>
                <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.5, flex: 1 }}>{c}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
