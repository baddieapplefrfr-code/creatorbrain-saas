import { useState, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useChannel } from '../context/ChannelContext'
import { youtubeDATA, youtubeCOMMENTS } from '../lib/api'
import { getNiche } from '../lib/calc'
import { Skeleton } from '../components/Skeleton'
import { ErrorCard } from '../components/ErrorCard'
import type { YouTubeVideo, YouTubeChannel } from '../context/ChannelContext'

// ── Types ────────────────────────────────────────────────────────────────────
interface YTChannelResponse {
  items?: YouTubeChannel[]
}

interface YTPlaylistResponse {
  items?: Array<{
    snippet?: { resourceId?: { videoId?: string } }
    contentDetails?: { videoId?: string }
  }>
  nextPageToken?: string
}

interface YTVideoResponse {
  items?: YouTubeVideo[]
}

interface YTSearchResponse {
  items?: Array<{ id?: { channelId?: string } }>
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function parseInput(raw: string): { type: 'id' | 'handle' | 'username'; value: string } {
  const s = raw.trim()

  // Direct channel ID
  if (/^UC[a-zA-Z0-9_-]{22}$/.test(s)) {
    return { type: 'id', value: s }
  }

  // youtube.com/channel/UC...
  const channelMatch = s.match(/\/channel\/(UC[a-zA-Z0-9_-]+)/)
  if (channelMatch) return { type: 'id', value: channelMatch[1] }

  // youtube.com/@handle or @handle
  const handleMatch = s.match(/\/@?([^/?&\s]+)/) || s.match(/^@([^/?&\s]+)/)
  if (handleMatch) return { type: 'handle', value: handleMatch[1] }

  // Plain text — treat as handle
  const clean = s.replace(/^@/, '').trim()
  return { type: 'handle', value: clean }
}

async function fetchChannelByHandle(handle: string): Promise<YouTubeChannel | null> {
  // Try forHandle
  const res1 = await youtubeDATA('channels', {
    part: 'snippet,statistics,contentDetails',
    forHandle: handle,
  }) as YTChannelResponse
  if (res1.items?.length) return res1.items[0]

  // Fallback: forUsername
  const res2 = await youtubeDATA('channels', {
    part: 'snippet,statistics,contentDetails',
    forUsername: handle,
  }) as YTChannelResponse
  if (res2.items?.length) return res2.items[0]

  // Fallback: search
  const search = await youtubeCOMMENTS('search', {
    part: 'snippet',
    type: 'channel',
    q: handle,
    maxResults: '3',
  }) as YTSearchResponse
  const channelId = search.items?.[0]?.id?.channelId
  if (!channelId) return null

  const res3 = await youtubeDATA('channels', {
    part: 'snippet,statistics,contentDetails',
    id: channelId,
  }) as YTChannelResponse
  return res3.items?.[0] ?? null
}

async function fetchChannelById(id: string): Promise<YouTubeChannel | null> {
  const res = await youtubeDATA('channels', {
    part: 'snippet,statistics,contentDetails',
    id,
  }) as YTChannelResponse
  return res.items?.[0] ?? null
}

async function fetchVideos(playlistId: string): Promise<YouTubeVideo[]> {
  const playlistRes = await youtubeDATA('playlistItems', {
    part: 'snippet,contentDetails',
    playlistId,
    maxResults: '50',
  }) as YTPlaylistResponse

  const items = playlistRes.items ?? []
  const videoIds = items
    .map(item => item.contentDetails?.videoId || item.snippet?.resourceId?.videoId)
    .filter((id): id is string => !!id)

  if (!videoIds.length) return []

  const BATCH = 50
  let allVideos: YouTubeVideo[] = []
  for (let i = 0; i < videoIds.length; i += BATCH) {
    const batch = videoIds.slice(i, i + BATCH)
    const vRes = await youtubeDATA('videos', {
      part: 'snippet,statistics,contentDetails',
      id: batch.join(','),
    }) as YTVideoResponse
    allVideos = allVideos.concat(vRes.items ?? [])
  }

  return allVideos.filter(v => v.statistics !== undefined)
}

// ── Component ────────────────────────────────────────────────────────────────
export default function Onboarding() {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const { setChannel, setVideos, setNiche } = useChannel()
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim()) return

    try {
      setLoading(true)
      setError(null)
      setSuccessMsg(null)

      const parsed = parseInput(input.trim())
      let channel: YouTubeChannel | null = null

      if (parsed.type === 'id') {
        channel = await fetchChannelById(parsed.value)
      } else {
        channel = await fetchChannelByHandle(parsed.value)
      }

      if (!channel) throw new Error('Channel not found. Try @handle or paste the full YouTube URL.')

      const playlistId = channel.contentDetails?.relatedPlaylists?.uploads
      if (!playlistId) throw new Error('Could not find uploads playlist for this channel.')

      const videos = await fetchVideos(playlistId)
      if (!videos.length) throw new Error('No public videos found for this channel.')

      const niche = getNiche(channel)

      setSuccessMsg(`Loaded ${videos.length} videos from ${channel.snippet.title}`)
      setChannel(channel)
      setVideos(videos)
      setNiche(niche)

      setTimeout(() => {
        navigate({ to: '/dashboard' })
      }, 800)
    } catch (e: unknown) {
      const msg = (e as Error).message || 'Something went wrong'
      setError(
        msg.includes('decommissioned') ? 'AI model updated — refresh' :
        msg.includes('rate_limit') ? 'Too many requests — wait 30s' :
        msg
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Purple radial glow */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(124,58,237,0.15) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Floating particles effect */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{
            position: 'absolute',
            width: i % 2 === 0 ? 300 : 200,
            height: i % 2 === 0 ? 300 : 200,
            borderRadius: '50%',
            background: i % 3 === 0
              ? 'radial-gradient(circle, rgba(124,58,237,0.06) 0%, transparent 70%)'
              : i % 3 === 1
              ? 'radial-gradient(circle, rgba(244,63,142,0.04) 0%, transparent 70%)'
              : 'radial-gradient(circle, rgba(6,182,212,0.04) 0%, transparent 70%)',
            left: `${[10, 80, 20, 70, 40, 90][i]}%`,
            top: `${[20, 10, 70, 80, 40, 50][i]}%`,
            transform: 'translate(-50%, -50%)',
            animation: `float-orb-${i % 3} ${8 + i * 2}s ease-in-out infinite`,
          }} />
        ))}
      </div>

      {/* Center card */}
      <div className="page-enter" style={{
        position: 'relative',
        zIndex: 1,
        maxWidth: 480,
        width: '100%',
        padding: '48px 40px',
        margin: '0 20px',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <span style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 900,
            fontSize: 44,
            color: 'var(--accent)',
          }}>Creator</span>
          <span style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 900,
            fontSize: 44,
            color: 'var(--pink)',
          }}>Brain</span>
        </div>

        {/* Tagline */}
        <p style={{
          fontSize: 16,
          color: 'var(--sub)',
          textAlign: 'center',
          marginBottom: 40,
          lineHeight: 1.6,
        }}>
          Know exactly what to do. Every single day.
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="@handle or channel URL or youtube.com/@channel"
              disabled={loading}
              style={{
                fontSize: 16,
                padding: '16px 20px',
                borderRadius: 12,
                width: '100%',
                background: 'var(--card)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                transition: 'border-color 0.2s, box-shadow 0.2s',
                outline: 'none',
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = 'var(--accent)'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.15)'
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !input.trim()}
            style={{
              width: '100%',
              padding: '16px',
              background: loading ? 'var(--border)' : 'var(--grad)',
              color: loading ? 'var(--muted)' : 'white',
              border: 'none',
              borderRadius: 12,
              fontSize: 16,
              fontWeight: 700,
              fontFamily: 'var(--font-display)',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              marginBottom: 16,
              letterSpacing: '0.3px',
            }}
            onMouseEnter={e => {
              if (!loading && input.trim()) {
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(124,58,237,0.4)'
              }
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = ''
              e.currentTarget.style.boxShadow = ''
            }}
          >
            {loading ? 'Analyzing...' : 'Analyze Channel →'}
          </button>

          {/* Hint */}
          <p style={{
            textAlign: 'center',
            fontSize: 12,
            color: 'var(--muted)',
            letterSpacing: '0.2px',
          }}>
            Try:{' '}
            {['@mkbhd', '@mrbeast', '@veritasium'].map((handle, i) => (
              <span key={handle}>
                <button
                  type="button"
                  onClick={() => setInput(handle)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--sub)',
                    fontSize: 12,
                    cursor: 'pointer',
                    padding: 0,
                    fontFamily: 'var(--font-body)',
                    textDecoration: 'underline',
                    textDecorationStyle: 'dotted',
                    textUnderlineOffset: '3px',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--sub)' }}
                >
                  {handle}
                </button>
                {i < 2 && <span style={{ margin: '0 4px' }}>,</span>}
              </span>
            ))}
          </p>
        </form>

        {/* Loading state */}
        {loading && (
          <div style={{ marginTop: 32 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 20,
              justifyContent: 'center',
            }}>
              <div style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--accent)',
                animation: 'pulse-opacity 1s ease infinite',
              }} />
              <span style={{ fontSize: 14, color: 'var(--sub)', fontWeight: 500 }}>
                Analyzing your channel...
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Skeleton height={20} width="60%" style={{ margin: '0 auto' }} />
              <Skeleton height={14} width="80%" style={{ margin: '0 auto' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                <Skeleton height={80} borderRadius={12} />
                <Skeleton height={80} borderRadius={12} />
              </div>
              <Skeleton height={60} borderRadius={12} />
            </div>
          </div>
        )}

        {/* Success message */}
        {successMsg && !loading && (
          <div style={{
            marginTop: 20,
            padding: '12px 16px',
            background: 'rgba(16,185,129,0.1)',
            border: '1px solid rgba(16,185,129,0.3)',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            animation: 'fadeInUp 0.3s ease both',
          }}>
            <span style={{ fontSize: 16 }}>✅</span>
            <span style={{ color: 'var(--green)', fontSize: 14, fontWeight: 600 }}>{successMsg}</span>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div style={{ marginTop: 20 }}>
            <ErrorCard message={error} onRetry={() => { setError(null); inputRef.current?.focus() }} />
          </div>
        )}

        {/* Features hint */}
        <div style={{
          marginTop: 48,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 12,
        }}>
          {[
            { emoji: '⚡', label: 'AI Commands' },
            { emoji: '📊', label: 'Deep Analytics' },
            { emoji: '🎯', label: 'Growth Tactics' },
          ].map(f => (
            <div key={f.label} style={{
              textAlign: 'center',
              padding: '14px 8px',
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              opacity: 0.7,
            }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{f.emoji}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{f.label}</div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes float-orb-0 {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -60%) scale(1.1); }
        }
        @keyframes float-orb-1 {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-40%, -50%) scale(0.9); }
        }
        @keyframes float-orb-2 {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-60%, -40%) scale(1.05); }
        }
      `}</style>
    </div>
  )
}
