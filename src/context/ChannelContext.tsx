import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

export interface YouTubeVideo {
  id: string
  snippet: {
    title: string
    publishedAt: string
    description?: string
    thumbnails?: {
      default?: { url: string }
      medium?: { url: string }
      high?: { url: string }
      maxres?: { url: string }
    }
    tags?: string[]
    categoryId?: string
    channelTitle?: string
  }
  statistics?: {
    viewCount?: string
    likeCount?: string
    commentCount?: string
    favoriteCount?: string
  }
  contentDetails?: {
    duration?: string
  }
}

export interface YouTubeChannel {
  id: string
  snippet: {
    title: string
    description?: string
    publishedAt?: string
    thumbnails?: {
      default?: { url: string }
      medium?: { url: string }
      high?: { url: string }
    }
  }
  statistics: {
    subscriberCount?: string
    viewCount?: string
    videoCount?: string
    hiddenSubscriberCount?: boolean
  }
  contentDetails?: {
    relatedPlaylists?: {
      uploads?: string
    }
  }
}

export interface ChannelState {
  channel: YouTubeChannel | null
  videos: YouTubeVideo[]
  selectedVideo: YouTubeVideo | null
  niche: string
}

interface ChannelContextType extends ChannelState {
  setChannel: (ch: YouTubeChannel | null) => void
  setVideos: (v: YouTubeVideo[]) => void
  setSelectedVideo: (v: YouTubeVideo | null) => void
  setNiche: (n: string) => void
  reset: () => void
}

const ChannelContext = createContext<ChannelContextType | null>(null)

const SS_KEY = "creatorbrain_state"

function loadFromStorage(): ChannelState {
  try {
    const raw = sessionStorage.getItem(SS_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { channel: null, videos: [], selectedVideo: null, niche: "content" }
}

export function ChannelProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ChannelState>(loadFromStorage)

  const save = useCallback((s: ChannelState) => {
    try { sessionStorage.setItem(SS_KEY, JSON.stringify(s)) } catch { /* ignore */ }
  }, [])

  useEffect(() => { save(state) }, [state, save])

  const setChannel = useCallback((channel: YouTubeChannel | null) => setState(s => ({ ...s, channel })), [])
  const setVideos = useCallback((videos: YouTubeVideo[]) => setState(s => ({ ...s, videos })), [])
  const setSelectedVideo = useCallback((selectedVideo: YouTubeVideo | null) => setState(s => ({ ...s, selectedVideo })), [])
  const setNiche = useCallback((niche: string) => setState(s => ({ ...s, niche })), [])
  const reset = useCallback(() => {
    const fresh = { channel: null, videos: [], selectedVideo: null, niche: "content" }
    setState(fresh)
    save(fresh)
  }, [save])

  return (
    <ChannelContext.Provider value={{ ...state, setChannel, setVideos, setSelectedVideo, setNiche, reset }}>
      {children}
    </ChannelContext.Provider>
  )
}

export function useChannel() {
  const ctx = useContext(ChannelContext)
  if (!ctx) throw new Error("useChannel must be used within ChannelProvider")
  return ctx
}
