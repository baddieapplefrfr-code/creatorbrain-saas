import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useChannel } from '../context/ChannelContext'
import { askGroqChat, askGroq, sanitize, GROQ_KEY_A } from '../lib/api'
import {
  calcUploadMetrics, calcBestPostingDay, calcHookTypes, calcBestLength,
  calcAvgViews, calcMomentumScore, safeInt, formatViews,
} from '../lib/calc'
import { Skeleton } from '../components/Skeleton'
import { ErrorCard } from '../components/ErrorCard'
import { Send, RefreshCw } from 'lucide-react'

interface Message { role: 'user' | 'ai'; text: string; ts: number }

function buildSystemPrompt(
  channel: { snippet: { title: string; description?: string }; statistics: { subscriberCount?: string; videoCount?: string } } | null,
  _videos: { snippet: { title: string; publishedAt: string }; statistics?: { viewCount?: string; likeCount?: string; commentCount?: string }; contentDetails?: { duration?: string } }[],
  _niche: string,
  momentum: number,
  bestDay: { day: string; avg: number },
  uploadM: { avgGap: number; consistency: number },
  avgV: number,
  topVid: { snippet: { title: string }; statistics?: { viewCount?: string } } | undefined,
  worstVid: { snippet: { title: string }; statistics?: { viewCount?: string } } | undefined,
  bestHook: string,
  bestLen: string,
  hooks0Avg: number,
): string {
  const sName = sanitize(channel?.snippet?.title || 'Unknown', 40)
  const sSubs = formatViews(safeInt(channel?.statistics?.subscriberCount))
  const sTop = sanitize(topVid?.snippet?.title || 'No videos', 60)
  const sWorst = sanitize(worstVid?.snippet?.title || 'No videos', 60)

  return `You are Max, a YouTube channel coach for ${sName}.

CHANNEL DATA YOU KNOW:
Subscribers: ${sSubs}
Avg views per video: ${formatViews(Math.round(avgV))}
Best posting day: ${bestDay.day} (avg ${formatViews(Math.round(bestDay.avg))} views)
Best video type: ${bestHook} hooks (avg ${formatViews(Math.round(hooks0Avg))} views)
Best video length: ${bestLen}
Upload gap: ${Math.round(uploadM.avgGap)} days average, ${Math.round(uploadM.consistency)}% consistent
Momentum: ${momentum}/100
Top video: "${sTop}" (${formatViews(safeInt(topVid?.statistics?.viewCount))} views)
Worst video: "${sWorst}" (${formatViews(safeInt(worstVid?.statistics?.viewCount))} views)

RULES YOU MUST FOLLOW:
1. MAX 3 SENTENCES per response. Hard limit. Never more.
2. Always include one specific number from the channel data above.
3. Always end with exactly: → [one action with day/title/number]
4. Never say: "certainly", "great question", "of course", "I understand", "absolutely"
5. Never give advice not backed by their real data above.
6. If asked about something not in your data, say what you DO know that is related.
7. Be direct. Be specific. Be a coach not a chatbot.

BAD response: "You should consider posting more consistently as this can help with the YouTube algorithm."
GOOD response: "Your last 3 uploads had a ${Math.round(uploadM.avgGap)}-day gap — that kills algorithm momentum. Post every 7 days. → Upload your next video this ${bestDay.day}."`
}

function buildSuggestedQuestions(
  bestDay: { day: string; avg: number },
  _bestHook: string,
  _bestLen: string,
  _momentum: number,
  _worstTitle: string,
  uploadGap: number,
  consistency: number,
  hooks: Array<{ type: string; avg: number }>,
  viewTrend: 'growing' | 'declining' | 'stable',
): string[] {
  const questions: string[] = []
  if (viewTrend === 'declining')
    questions.push(`Why are my recent videos getting fewer views?`)
  if (consistency < 60)
    questions.push(`How much is my ${Math.round(uploadGap)}-day upload gap hurting me?`)
  if (hooks.length >= 2 && (hooks[0]?.avg || 0) > (hooks[hooks.length-1]?.avg || 1) * 2)
    questions.push(`Why do my ${hooks[0]?.type} videos get so many more views?`)
  if (bestDay.avg > 0)
    questions.push(`Should I only post on ${bestDay.day}?`)
  questions.push(`What should my next video be about?`)
  questions.push(`What's the single thing holding my channel back?`)
  return questions.slice(0, 4)
}

export default function Chat() {
  const { channel, videos, niche } = useChannel()
  const navigate = useNavigate()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [initLoading, setInitLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const uploadM = calcUploadMetrics(videos)
  const bestDay = calcBestPostingDay(videos)
  const hooks = calcHookTypes(videos)
  const lengths = calcBestLength(videos)
  const avgV = calcAvgViews(videos)
  const momentum = calcMomentumScore(videos, uploadM)

  const topVid = [...videos].sort((a, b) => safeInt(b.statistics?.viewCount) - safeInt(a.statistics?.viewCount))[0]
  const worstVid = [...videos].sort((a, b) => safeInt(a.statistics?.viewCount) - safeInt(b.statistics?.viewCount))[0]

  const bestHook = hooks[0]?.type || 'Question'
  const bestLen = lengths[0]?.label || '9-13 min'

  const systemPrompt = channel ? buildSystemPrompt(
    channel, videos, niche, momentum, bestDay.best,
    uploadM, avgV, topVid, worstVid, bestHook, bestLen,
    hooks[0]?.avg || 0
  ) : ''

  const recent5 = [...videos].sort((a,b) => new Date(b.snippet.publishedAt).getTime() - new Date(a.snippet.publishedAt).getTime()).slice(0,5)
  const recentAvgCalc = recent5.reduce((s,v) => s + safeInt(v.statistics?.viewCount), 0) / Math.max(recent5.length, 1)
  const viewTrendCalc: 'growing' | 'declining' | 'stable' = recentAvgCalc > avgV * 1.1 ? 'growing' : recentAvgCalc < avgV * 0.9 ? 'declining' : 'stable'

  const suggestedQs = channel ? buildSuggestedQuestions(
    bestDay.best, bestHook, bestLen, momentum,
    worstVid?.snippet?.title || '',
    uploadM.avgGap, uploadM.consistency,
    hooks, viewTrendCalc,
  ) : []

  // Generate opening message
  useEffect(() => {
    if (!channel || !videos.length) { setInitLoading(false); return }

    const sorted = [...videos].sort((a,b) => new Date(b.snippet.publishedAt).getTime() - new Date(a.snippet.publishedAt).getTime())
    const recentAvg = sorted.slice(0,5).reduce((s,v) => s + safeInt(v.statistics?.viewCount), 0) / Math.min(5, sorted.length || 1)

    const viewTrend = recentAvg > avgV * 1.1 ? 'declining' :
      recentAvg < avgV * 0.9 ? 'declining' : 'stable'

    const urgentProblem = momentum < 40 ? 'channel momentum is critically low' :
      uploadM.consistency < 50 ? `upload consistency is only ${Math.round(uploadM.consistency)}%` :
      viewTrend === 'declining' ? 'channel views are declining' :
      hooks.length >= 2 && (hooks[0]?.avg || 0) > (hooks[hooks.length-1]?.avg || 1) * 2 ? 'wrong video types being made' :
      'needs a posting schedule improvement'

    askGroq(
      systemPrompt,
      `Write ONE opening message for ${sanitize(channel.snippet.title, 40)}. Lead with their single biggest problem: ${urgentProblem}. Reference one real number from: momentum ${momentum}/100, avg views ${formatViews(Math.round(avgV))}, best day ${bestDay.best.day} (${formatViews(Math.round(bestDay.best.avg))} views). End with → command. Max 3 sentences. No greeting words like "hey" or "hi".`,
      false,
      GROQ_KEY_A
    ).then((text) => {
      setMessages([{ role: 'ai', text: text as string, ts: Date.now() }])
    }).catch(() => {
      setMessages([{
        role: 'ai',
        text: `Your momentum is ${momentum}/100 — your ${bestDay.best.day} posts average ${formatViews(Math.round(bestDay.best.avg))} views vs your overall ${formatViews(Math.round(avgV))} average. → Post your next video on ${bestDay.best.day}.`,
        ts: Date.now(),
      }])
    }).finally(() => setInitLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.id])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typing])

  const send = useCallback(async (text: string) => {
    if (!text.trim() || typing || !channel) return
    setInput('')
    setError(null)

    const userMsg: Message = { role: 'user', text, ts: Date.now() }
    setMessages(prev => [...prev, userMsg])
    setTyping(true)

    try {
      const history = messages.map(m => ({ role: m.role, text: m.text }))
      const reply = await askGroqChat(systemPrompt, history, text)
      setMessages(prev => [...prev, { role: 'ai', text: reply, ts: Date.now() }])
    } catch (e: unknown) {
      const msg = (e as Error).message || 'Something went wrong'
      if (msg.includes('rate_limit')) setError('Too many messages — wait 30s')
      else setError('Max is thinking... try again')
    } finally {
      setTyping(false)
    }
  }, [messages, typing, channel, systemPrompt])

  if (!channel || !videos.length) {
    return (
      <div className="page-enter" style={{ padding: 40, textAlign: 'center', color: 'var(--sub)' }}>
        <p>No channel loaded. <button onClick={() => navigate({ to: '/onboarding' })} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, textDecoration: 'underline' }}>Go back</button></p>
      </div>
    )
  }

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', gap: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexShrink: 0 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: 'var(--grad)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 18, color: 'white',
        }}>
          M
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 900, color: 'var(--text)' }}>
            Max AI
          </div>
          <div style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>
            ● Online — knows your channel data
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <div style={{ padding: '4px 12px', background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.25)', borderRadius: 20, fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>
            {formatViews(safeInt(channel.statistics?.subscriberCount))} subs
          </div>
          <div style={{ padding: '4px 12px', background: momentum >= 70 ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', border: `1px solid ${momentum >= 70 ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`, borderRadius: 20, fontSize: 12, color: momentum >= 70 ? 'var(--green)' : 'var(--gold)', fontWeight: 600 }}>
            {momentum}/100 momentum
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12,
        paddingRight: 4, paddingBottom: 12,
      }}>
        {initLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Skeleton height={60} width="70%" />
            <Skeleton height={80} width="85%" />
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={msg.ts} style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              animation: `fadeInUp 0.2s ease ${i === messages.length - 1 ? '0s' : '0s'} both`,
            }}>
              {msg.role === 'ai' && (
                <div style={{
                  width: 30, height: 30, borderRadius: '50%', background: 'var(--grad)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 900, color: 'white', flexShrink: 0, marginRight: 10, marginTop: 4,
                }}>
                  M
                </div>
              )}
              <div style={{
                maxWidth: '72%',
                padding: '12px 16px',
                borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                background: msg.role === 'user' ? 'rgba(124,58,237,0.2)' : 'var(--card)',
                border: msg.role === 'user' ? '1px solid rgba(124,58,237,0.35)' : '1px solid var(--border)',
                fontSize: 14,
                color: 'var(--text)',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
              }}>
                {msg.text}
              </div>
            </div>
          ))
        )}

        {/* Typing indicator */}
        {typing && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%', background: 'var(--grad)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 900, color: 'white',
            }}>M</div>
            <div style={{ padding: '14px 18px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px 16px 16px 4px', display: 'flex', gap: 5 }}>
              {[0, 1, 2].map(j => (
                <div key={j} style={{
                  width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)',
                  animation: `typingBounce 1.2s ease infinite ${j * 0.2}s`,
                }} />
              ))}
            </div>
          </div>
        )}

        {error && (
          <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, fontSize: 13, color: 'var(--red)' }}>
            {error}
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Suggested questions */}
      {messages.length <= 2 && !initLoading && (
        <div style={{ flexShrink: 0, marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>
            Ask Max:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {suggestedQs.map((q, i) => (
              <button
                key={i}
                onClick={() => send(q)}
                style={{
                  padding: '7px 14px', borderRadius: 20,
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                  color: 'var(--sub)',
                  fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  transition: 'all 0.15s',
                  textAlign: 'left',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--text)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--sub)' }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input area */}
      <div style={{
        flexShrink: 0,
        display: 'flex', gap: 10, alignItems: 'flex-end',
        padding: '12px 16px',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 16,
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send(input)
            }
          }}
          placeholder="Ask Max anything about your channel..."
          rows={1}
          style={{
            flex: 1, resize: 'none', border: 'none', background: 'transparent',
            color: 'var(--text)', fontSize: 14, outline: 'none', padding: '2px 0',
            fontFamily: 'var(--font-body)', lineHeight: 1.5, maxHeight: 100, overflowY: 'auto',
          }}
          disabled={typing}
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || typing}
          style={{
            width: 38, height: 38, borderRadius: 10, border: 'none', flexShrink: 0,
            background: !input.trim() || typing ? 'var(--border)' : 'var(--grad)',
            color: !input.trim() || typing ? 'var(--muted)' : 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: !input.trim() || typing ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {typing ? <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={15} />}
        </button>
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
        Max gives 3-sentence answers with real channel numbers. Enter to send, Shift+Enter for new line.
      </div>
    </div>
  )
}
