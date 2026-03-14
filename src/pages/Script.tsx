import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useChannel } from '../context/ChannelContext'
import { askGroq, sanitize, GROQ_KEY_B } from '../lib/api'
import { calcBestLength, calcHookTypes, calcAvgViews, safeInt } from '../lib/calc'
import { CommandCard } from '../components/CommandCard'
import { Skeleton } from '../components/Skeleton'
import { ErrorCard } from '../components/ErrorCard'
import { Copy, Check, RefreshCw, Sparkles } from 'lucide-react'

interface HookOption {
  hook: string
  optimizes: 'CTR' | 'Watch Time' | 'Comments'
  reason: string
}

interface ScriptSection {
  script: string
  coachNote: string
}

interface MainPoint extends ScriptSection {
  title: string
}

interface ScriptData {
  hook: ScriptSection
  context: ScriptSection
  mainPoints: MainPoint[]
  cta: ScriptSection
  outro: ScriptSection
  seo: {
    titles: string[]
    description: string
    tags: string[]
  }
}

function CopyBtn({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }
  return (
    <button
      onClick={copy}
      style={{
        background: copied ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.05)',
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
      {copied ? 'Copied!' : label}
    </button>
  )
}

const OPTIMIZE_META: Record<string, { color: string; emoji: string; desc: string }> = {
  'CTR': { color: 'var(--pink)', emoji: '🎯', desc: 'Maximises Click-Through Rate' },
  'Watch Time': { color: 'var(--green)', emoji: '⏱', desc: 'Maximises Watch Time' },
  'Comments': { color: 'var(--cyan)', emoji: '💬', desc: 'Maximises Comments' },
}

const SECTION_META: Record<string, { emoji: string; color: string }> = {
  HOOK: { emoji: '🪝', color: 'var(--pink)' },
  CONTEXT: { emoji: '📍', color: 'var(--cyan)' },
  MAIN_POINT: { emoji: '🎯', color: 'var(--accent)' },
  CTA: { emoji: '📣', color: 'var(--gold)' },
  OUTRO: { emoji: '👋', color: 'var(--green)' },
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export default function Script() {
  const { channel, videos, niche } = useChannel()
  const navigate = useNavigate()

  const [topic, setTopic] = useState('')
  const [fromTrend, setFromTrend] = useState(false)
  const [hooks3, setHooks3] = useState<HookOption[] | null>(null)
  const [selectedHook, setSelectedHook] = useState<string | null>(null)
  const [hookLoading, setHookLoading] = useState(false)
  const [script, setScript] = useState<ScriptData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Check sessionStorage prefill
  useEffect(() => {
    const prefill = sessionStorage.getItem('script_prefill')
    if (prefill) {
      setTopic(prefill)
      setFromTrend(true)
      sessionStorage.removeItem('script_prefill')
    }
  }, [])

  const bestHook = calcHookTypes(videos)[0]?.type ?? 'Question'
  const bestLength = calcBestLength(videos)[0]?.label ?? '9-13 min'
  const avgViews = calcAvgViews(videos)

  // Debounced hook generation
  const generateHooks = useCallback(async (t: string) => {
    if (!t.trim() || t.trim().length < 5 || !channel) return
    setHookLoading(true)
    setHooks3(null)
    setSelectedHook(null)
    try {
      const res = await askGroq(
        'YouTube scriptwriter. Generate compelling opening hooks. Return JSON only.',
        `Topic: "${sanitize(t, 80)}", niche: ${sanitize(niche, 30)}. Generate 3 opening hooks (first 2 sentences each).\nJSON:[{"hook":"string","optimizes":"CTR" or "Watch Time" or "Comments","reason":"string"}]`,
        true,
        GROQ_KEY_B
      ) as HookOption[]
      setHooks3(Array.isArray(res) ? res.slice(0, 3) : null)
    } catch {
      // Silently fail — don't block the user
    } finally {
      setHookLoading(false)
    }
  }, [channel, niche])

  function handleTopicChange(val: string) {
    setTopic(val)
    setScript(null)
    setHooks3(null)
    setSelectedHook(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (val.trim().length >= 5) {
      debounceRef.current = setTimeout(() => generateHooks(val), 800)
    }
  }

  // Trigger hook gen on prefill
  useEffect(() => {
    if (fromTrend && topic.trim().length >= 5) {
      generateHooks(topic)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromTrend])

  async function generateScript() {
    if (!topic.trim() || !channel) return
    setLoading(true)
    setError(null)
    setScript(null)
    try {
      const hook = selectedHook ?? hooks3?.[0]?.hook ?? ''
      const result = await askGroq(
        'Expert YouTube script coach. Return valid JSON only. Make script sections substantive and creator-specific.',
        `Topic: "${sanitize(topic, 80)}", niche: ${sanitize(niche, 30)}, hook: "${sanitize(hook, 200)}"\nAvg views: ${Math.round(avgViews)}, best length: ${bestLength}\nJSON:{"hook":{"script":"str","coachNote":"str"},"context":{"script":"str","coachNote":"str"},"mainPoints":[{"title":"str","script":"str","coachNote":"str"},{"title":"str","script":"str","coachNote":"str"},{"title":"str","script":"str","coachNote":"str"}],"cta":{"script":"str","coachNote":"str"},"outro":{"script":"str","coachNote":"str"},"seo":{"titles":["str","str","str"],"description":"str","tags":["str","str","str","str","str"]}}`,
        true,
        GROQ_KEY_B
      ) as ScriptData
      setScript(result)
    } catch (e: unknown) {
      const msg = (e as Error).message || 'Something went wrong'
      setError(msg.includes('rate_limit') ? 'Too many requests — wait 30s then retry' : msg)
      console.error('Full error:', e)
    } finally {
      setLoading(false)
    }
  }

  if (!channel || !videos.length) {
    return (
      <div className="page-enter" style={{ padding: 40, textAlign: 'center', color: 'var(--sub)' }}>
        <p>No channel loaded. <button onClick={() => navigate({ to: '/onboarding' })} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, textDecoration: 'underline' }}>Go back</button></p>
      </div>
    )
  }

  // Build full script text for copy
  const fullScriptText = script
    ? [
        `HOOK\n${script.hook?.script ?? ''}`,
        `\nCONTEXT\n${script.context?.script ?? ''}`,
        ...(script.mainPoints ?? []).map((p, i) => `\nMAIN POINT ${i + 1}: ${p.title}\n${p.script}`),
        `\nCTA\n${script.cta?.script ?? ''}`,
        `\nOUTRO\n${script.outro?.script ?? ''}`,
      ].join('\n')
    : ''

  const totalWords = script
    ? [script.hook, script.context, ...(script.mainPoints ?? []), script.cta, script.outro]
        .reduce((s, sec) => s + wordCount((sec as ScriptSection).script ?? ''), 0)
    : 0

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 900, color: 'var(--text)', marginBottom: 4 }}>
          ✍️ Script Generator
        </h1>
        <p style={{ color: 'var(--sub)', fontSize: 14 }}>AI script tuned to your channel voice, hooks, and format</p>
      </div>

      {!script && (
        <CommandCard
          command={`Generate your next ${bestLength} script with ${bestHook} hooks — type a topic below`}
          why={`${bestHook} hooks perform best on your channel (avg ${avgViews > 0 ? Math.round(avgViews).toLocaleString() : 'N/A'} views). ${bestLength} is your sweet spot.`}
          impact="A structured script keeps viewers watching 40% longer than unstructured content"
          priority="Do Today"
        />
      )}

      {/* Topic Input */}
      <div className="card-base" style={{ padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: 'var(--text)', flex: 1 }}>
            What's your video about?
          </h2>
          {fromTrend && (
            <span style={{
              padding: '3px 10px',
              background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.3)',
              borderRadius: 20, fontSize: 11, color: 'var(--cyan)', fontWeight: 700,
            }}>
              🔥 From Trends
            </span>
          )}
        </div>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            value={topic}
            onChange={e => handleTopicChange(e.target.value)}
            placeholder={`e.g. "How to grow your ${niche} channel from 0" or "My biggest ${niche} mistakes"`}
            onKeyDown={e => e.key === 'Enter' && !loading && generateScript()}
            style={{ paddingRight: hookLoading ? 44 : 14 }}
          />
          {hookLoading && (
            <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}>
              <RefreshCw size={16} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
            </div>
          )}
        </div>

        {/* 3 Hook Options */}
        {hooks3 && hooks3.length > 0 && !loading && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--sub)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 10 }}>
              Pick your opening hook:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {hooks3.map((h, i) => {
                const meta = OPTIMIZE_META[h.optimizes] ?? OPTIMIZE_META['CTR']
                const isSelected = selectedHook === h.hook
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedHook(isSelected ? null : h.hook)}
                    style={{
                      textAlign: 'left', padding: '14px 16px', borderRadius: 10,
                      background: isSelected ? `${meta.color}12` : 'var(--card2)',
                      border: `1px solid ${isSelected ? meta.color : 'var(--border)'}`,
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 14 }}>{meta.emoji}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: meta.color, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                        {meta.desc}
                      </span>
                      {isSelected && <span style={{ marginLeft: 'auto', fontSize: 11, color: meta.color, fontWeight: 700 }}>✓ Selected</span>}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, marginBottom: 4 }}>
                      {h.hook}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{h.reason}</div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <button
          onClick={generateScript}
          disabled={loading || !topic.trim()}
          style={{
            marginTop: 16, display: 'flex', alignItems: 'center', gap: 8,
            padding: '13px 22px', borderRadius: 10, border: 'none',
            background: loading || !topic.trim() ? 'var(--border)' : 'var(--grad)',
            color: loading || !topic.trim() ? 'var(--muted)' : 'white',
            fontWeight: 700, fontSize: 14, cursor: loading || !topic.trim() ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-display)', transition: 'all 0.2s',
          }}
        >
          <Sparkles size={16} />
          {loading ? 'Writing script...' : 'Generate Full Script'}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Skeleton height={110} /><Skeleton height={160} /><Skeleton height={140} /><Skeleton height={120} />
        </div>
      )}

      {error && <ErrorCard message={error} onRetry={generateScript} />}

      {/* Script Output */}
      {script && !loading && (
        <>
          {/* Metadata strip */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
            padding: '14px 20px', background: 'var(--card2)', border: '1px solid var(--border)',
            borderRadius: 12,
          }}>
            <div style={{ fontSize: 13, color: 'var(--sub)' }}>
              <span style={{ fontWeight: 700, color: 'var(--text)' }}>{totalWords.toLocaleString()}</span> words
            </div>
            <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
            <div style={{ fontSize: 13, color: 'var(--sub)' }}>
              ~<span style={{ fontWeight: 700, color: 'var(--text)' }}>{Math.ceil(totalWords / 150)}</span> min read-time
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <CopyBtn text={fullScriptText} label="Copy Full Script" />
            </div>
          </div>

          {/* HOOK */}
          <ScriptSectionCard
            label="HOOK"
            meta={SECTION_META.HOOK}
            content={script.hook?.script ?? ''}
            coachNote={script.hook?.coachNote ?? ''}
          />

          {/* CONTEXT */}
          <ScriptSectionCard
            label="CONTEXT"
            meta={SECTION_META.CONTEXT}
            content={script.context?.script ?? ''}
            coachNote={script.context?.coachNote ?? ''}
          />

          {/* MAIN POINTS */}
          {(script.mainPoints ?? []).map((point, i) => (
            <ScriptSectionCard
              key={i}
              label={`MAIN POINT ${i + 1}: ${point.title}`}
              meta={SECTION_META.MAIN_POINT}
              content={point.script ?? ''}
              coachNote={point.coachNote ?? ''}
            />
          ))}

          {/* CTA */}
          <ScriptSectionCard
            label="CALL TO ACTION"
            meta={SECTION_META.CTA}
            content={script.cta?.script ?? ''}
            coachNote={script.cta?.coachNote ?? ''}
          />

          {/* OUTRO */}
          <ScriptSectionCard
            label="OUTRO"
            meta={SECTION_META.OUTRO}
            content={script.outro?.script ?? ''}
            coachNote={script.outro?.coachNote ?? ''}
          />

          {/* SEO Package */}
          <div className="card-base" style={{ padding: '24px 28px' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: 'var(--text)', marginBottom: 20 }}>
              🔍 SEO Package
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Alternative titles */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--sub)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 10 }}>
                  ALTERNATIVE TITLES
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(script.seo?.titles ?? []).map((t, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 12, padding: '10px 14px',
                      background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 10,
                    }}>
                      <span style={{ fontSize: 13, color: 'var(--text)', flex: 1, lineHeight: 1.5 }}>{t}</span>
                      <CopyBtn text={t} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--sub)', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
                    VIDEO DESCRIPTION
                  </div>
                  <CopyBtn text={script.seo?.description ?? ''} />
                </div>
                <textarea
                  defaultValue={script.seo?.description ?? ''}
                  rows={5}
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>

              {/* Tags */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--sub)', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
                    TAGS
                  </div>
                  <CopyBtn text={(script.seo?.tags ?? []).join(', ')} label="Copy all tags" />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {(script.seo?.tags ?? []).map((tag, i) => (
                    <span key={i} style={{
                      padding: '4px 12px',
                      background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.25)',
                      borderRadius: 20, fontSize: 12, color: 'var(--accent)', fontWeight: 600,
                    }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <CommandCard
            command={`Record this script this week: "${sanitize(topic, 60)}"`}
            why={`You selected a ${selectedHook ? (hooks3?.find(h => h.hook === selectedHook)?.optimizes ?? 'CTR') : 'CTR'}-optimised hook. This structure follows your best-performing ${bestLength} format.`}
            impact="Scripts with structured sections retain 38% more watch time than rambling format"
            priority="Do This Week"
          />
        </>
      )}
    </div>
  )
}

function ScriptSectionCard({
  label,
  meta,
  content,
  coachNote,
}: {
  label: string
  meta: { emoji: string; color: string }
  content: string
  coachNote: string
}) {
  const [val, setVal] = useState(content)

  return (
    <div className="card-base" style={{ padding: '22px 26px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 18 }}>{meta.emoji}</span>
        <h3 style={{
          fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16,
          color: 'var(--text)', flex: 1, letterSpacing: '0.3px',
        }}>
          {label}
        </h3>
        <CopyBtn text={val} />
      </div>
      <textarea
        value={val}
        onChange={e => setVal(e.target.value)}
        rows={5}
        style={{ width: '100%', resize: 'vertical', marginBottom: 12 }}
      />
      <div style={{
        padding: '10px 14px',
        background: 'rgba(124,58,237,0.07)', border: '1px solid rgba(124,58,237,0.2)',
        borderLeft: `3px solid ${meta.color}`, borderRadius: 8,
      }}>
        <span style={{ fontSize: 11, color: meta.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>COACH: </span>
        <span style={{ fontSize: 12, color: 'var(--sub)', fontStyle: 'italic', lineHeight: 1.6 }}>{coachNote}</span>
      </div>
    </div>
  )
}
