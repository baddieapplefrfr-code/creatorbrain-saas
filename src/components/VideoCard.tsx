import { useState } from 'react'
import { getVideoId, formatViews, engagementRate, performanceDisplay, formatDuration, parseISO8601, safeInt } from '../lib/calc'
import type { YouTubeVideo } from '../context/ChannelContext'

interface VideoCardProps {
  video: YouTubeVideo | unknown
  avgViews?: number
  onClick?: () => void
}

export function VideoCard({ video, avgViews = 0, onClick }: VideoCardProps) {
  const v = video as YouTubeVideo
  const id = getVideoId(video)
  const [imgSrc, setImgSrc] = useState(`https://img.youtube.com/vi/${id}/mqdefault.jpg`)
  const fallbacks = [
    `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
    `https://img.youtube.com/vi/${id}/default.jpg`,
  ]
  const [fallbackIdx, setFallbackIdx] = useState(0)

  const views = safeInt(v?.statistics?.viewCount)
  const eng = engagementRate(video)
  const perf = performanceDisplay(video, avgViews)
  const dur = parseISO8601(v?.contentDetails?.duration)
  const title = v?.snippet?.title || "Untitled"

  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        overflow: "hidden",
        cursor: onClick ? "pointer" : "default",
        transition: "all 0.2s ease"
      }}
      onMouseEnter={e => {
        if (!onClick) return
        const el = e.currentTarget
        el.style.transform = "translateY(-4px)"
        el.style.borderColor = "var(--accent)"
      }}
      onMouseLeave={e => {
        const el = e.currentTarget
        el.style.transform = ""
        el.style.borderColor = "var(--border)"
      }}
    >
      <div style={{ position: "relative", paddingBottom: "56.25%", background: "var(--card2)" }}>
        <img
          src={imgSrc}
          alt={title}
          onError={() => {
            if (fallbackIdx < fallbacks.length) {
              setImgSrc(fallbacks[fallbackIdx])
              setFallbackIdx(i => i + 1)
            }
          }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
        <div style={{
          position: "absolute", top: 8, left: 8,
          width: 8, height: 8, borderRadius: "50%",
          background: perf.color
        }} />
        {dur > 0 && (
          <div style={{
            position: "absolute", bottom: 6, right: 6,
            background: "rgba(0,0,0,0.8)", color: "#fff",
            padding: "2px 6px", borderRadius: 4, fontSize: 11, fontWeight: 600
          }}>{formatDuration(dur)}</div>
        )}
      </div>
      <div style={{ padding: "12px 14px" }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: "var(--text)",
          display: "-webkit-box", WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical", overflow: "hidden",
          marginBottom: 8, lineHeight: 1.4
        }}>{title}</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--sub)" }}>
          <span>{formatViews(views)} views</span>
          <span style={{ color: eng > 2 ? "var(--green)" : "var(--muted)" }}>{eng.toFixed(1)}% eng</span>
        </div>
      </div>
    </div>
  )
}
