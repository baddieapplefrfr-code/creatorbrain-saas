import type { YouTubeVideo } from '../context/ChannelContext'

export function safeInt(val: string | number | undefined | null): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : Math.floor(val)
  const n = parseInt(val ?? '0', 10)
  return isNaN(n) ? 0 : n
}

export function formatViews(n: number | string | undefined): string {
  const num = safeInt(n as string)
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
  return num.toString()
}

export function formatSubs(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M subs`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K subs`
  return `${n} subs`
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function parseISO8601(duration: string | undefined): number {
  if (!duration) return 0
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return 0
  return (safeInt(match[1]) * 3600) + (safeInt(match[2]) * 60) + safeInt(match[3])
}

export function getVideoId(video: unknown): string {
  const v = video as { id?: string | { videoId?: string }; snippet?: { resourceId?: { videoId?: string } } }
  if (typeof v?.id === 'string') return v.id
  if (typeof v?.id === 'object' && v?.id?.videoId) return v.id.videoId
  if (v?.snippet?.resourceId?.videoId) return v.snippet.resourceId.videoId
  return ''
}

export function engagementRate(video: unknown): number {
  const v = video as YouTubeVideo
  const views = safeInt(v?.statistics?.viewCount)
  const likes = safeInt(v?.statistics?.likeCount)
  const comments = safeInt(v?.statistics?.commentCount)
  if (!views) return 0
  return Math.round(((likes + comments) / views) * 1000) / 10
}

export function performanceDisplay(video: unknown, avgViews: number): { label: string; color: string } {
  const v = video as YouTubeVideo
  const views = safeInt(v?.statistics?.viewCount)
  if (!avgViews) return { label: 'N/A', color: 'var(--muted)' }
  const ratio = views / avgViews
  if (ratio >= 1.5) return { label: 'Top performer', color: 'var(--green)' }
  if (ratio >= 0.8) return { label: 'Average', color: 'var(--gold)' }
  return { label: 'Below average', color: 'var(--red)' }
}

export interface UploadMetrics {
  avgDaysBetween: number
  uploadsLast30: number
  uploadsLast90: number
  totalVideos: number
  lastUploadDaysAgo: number
  lastUpload: string | null
  avgGap: number
  consistency: number
  perWeek: number
}

export function calcUploadMetrics(videos: YouTubeVideo[]): UploadMetrics {
  if (!videos.length) {
    return { avgDaysBetween: 0, uploadsLast30: 0, uploadsLast90: 0, totalVideos: 0, lastUploadDaysAgo: 0, lastUpload: null, avgGap: 7, consistency: 0, perWeek: 0 }
  }

  const sorted = [...videos].sort(
    (a, b) => new Date(b.snippet.publishedAt).getTime() - new Date(a.snippet.publishedAt).getTime()
  )

  const now = Date.now()
  const ms30 = 30 * 86400_000
  const ms90 = 90 * 86400_000

  const uploadsLast30 = sorted.filter(v => now - new Date(v.snippet.publishedAt).getTime() < ms30).length
  const uploadsLast90 = sorted.filter(v => now - new Date(v.snippet.publishedAt).getTime() < ms90).length

  const lastUploadDaysAgo = Math.floor(
    (now - new Date(sorted[0].snippet.publishedAt).getTime()) / 86400_000
  )

  let avgDaysBetween = 7
  if (sorted.length >= 2) {
    const diffs: number[] = []
    for (let i = 0; i < Math.min(sorted.length - 1, 10); i++) {
      const d =
        (new Date(sorted[i].snippet.publishedAt).getTime() -
          new Date(sorted[i + 1].snippet.publishedAt).getTime()) /
        86400_000
      diffs.push(d)
    }
    avgDaysBetween = diffs.reduce((a, b) => a + b, 0) / diffs.length
  }

  const avgGap = avgDaysBetween
  // Consistency: how regularly they post (lower variance = higher consistency)
  const ideal = avgDaysBetween
  let consistency = 100
  if (sorted.length >= 2) {
    const diffs: number[] = []
    for (let i = 0; i < Math.min(sorted.length - 1, 10); i++) {
      const d =
        (new Date(sorted[i].snippet.publishedAt).getTime() -
          new Date(sorted[i + 1].snippet.publishedAt).getTime()) /
        86400_000
      diffs.push(d)
    }
    const variance = diffs.reduce((s, d) => s + Math.pow(d - ideal, 2), 0) / diffs.length
    const stdDev = Math.sqrt(variance)
    consistency = Math.max(0, Math.min(100, 100 - (stdDev / Math.max(ideal, 1)) * 40))
  }

  const perWeek = avgDaysBetween > 0 ? 7 / avgDaysBetween : 0

  const lastUpload = sorted[0]?.snippet?.publishedAt ?? null
  return { avgDaysBetween, uploadsLast30, uploadsLast90, totalVideos: videos.length, lastUploadDaysAgo, lastUpload, avgGap, consistency, perWeek }
}

export function calcMomentumScore(videos: YouTubeVideo[], metrics: UploadMetrics): number {
  if (!videos.length) return 0

  const recent = [...videos]
    .sort((a, b) => new Date(b.snippet.publishedAt).getTime() - new Date(a.snippet.publishedAt).getTime())
    .slice(0, 5)

  const avgViews = recent.reduce((s, v) => s + safeInt(v.statistics?.viewCount), 0) / recent.length
  const avgLikes = recent.reduce((s, v) => s + safeInt(v.statistics?.likeCount), 0) / recent.length

  const engRate = avgViews > 0 ? (avgLikes / avgViews) * 100 : 0
  const uploadFreqScore = Math.max(0, 100 - metrics.avgDaysBetween * 3)
  const freshnessScore = Math.max(0, 100 - metrics.lastUploadDaysAgo * 2)

  const viewScore = Math.min(100, (avgViews / 50_000) * 100)
  const engScore = Math.min(100, engRate * 20)

  const raw = viewScore * 0.35 + engScore * 0.25 + uploadFreqScore * 0.25 + freshnessScore * 0.15
  return Math.round(Math.min(100, Math.max(0, raw)))
}

export function calcRetentionScore(video: YouTubeVideo): number {
  const views = safeInt(video.statistics?.viewCount)
  const likes = safeInt(video.statistics?.likeCount)
  const comments = safeInt(video.statistics?.commentCount)
  if (!views) return 0
  const eng = ((likes + comments) / views) * 100
  return Math.min(100, Math.round(eng * 15))
}

export function calcViralScore(video: YouTubeVideo): number {
  const views = safeInt(video.statistics?.viewCount)
  const likes = safeInt(video.statistics?.likeCount)
  if (!views) return 0
  const likeRatio = (likes / views) * 100
  const viewScore = Math.min(50, (views / 100_000) * 50)
  const likeScore = Math.min(50, likeRatio * 10)
  return Math.round(viewScore + likeScore)
}

export function calcAvgViews(videos: YouTubeVideo[]): number {
  if (!videos.length) return 0
  const total = videos.reduce((s, v) => s + safeInt(v.statistics?.viewCount), 0)
  return total / videos.length
}

export interface DayStats {
  day: string
  avg: number
  count: number
  dayIdx: number
}

export interface BestPostingDay {
  best: DayStats
  worst: DayStats
  all: DayStats[]
  days: DayStats[]
}

export function calcBestPostingDay(videos: YouTubeVideo[]): BestPostingDay {
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const dayMap: Record<string, { total: number; count: number }> = {}
  DAYS.forEach(d => { dayMap[d] = { total: 0, count: 0 } })

  for (const v of videos) {
    const d = new Date(v.snippet.publishedAt)
    const day = DAYS[d.getDay()]
    const views = safeInt(v.statistics?.viewCount)
    dayMap[day].total += views
    dayMap[day].count += 1
  }

  const days: DayStats[] = DAYS
    .map((day, i) => ({
      day,
      dayIdx: i,
      avg: dayMap[day].count > 0 ? dayMap[day].total / dayMap[day].count : 0,
      count: dayMap[day].count
    }))
    .filter(d => d.count > 0)

  if (!days.length) {
    const fallback: DayStats = { day: 'Monday', avg: 0, count: 0, dayIdx: 1 }
    return { best: fallback, worst: fallback, all: [], days: [] }
  }

  const sorted = [...days].sort((a, b) => b.avg - a.avg)
  return { best: sorted[0], worst: sorted[sorted.length - 1], all: sorted, days }
}

export interface LengthBucket {
  label: string
  avg: number
  count: number
  minSec: number
  maxSec: number
  min: number
  max: number
}

export function calcBestLength(videos: YouTubeVideo[]): LengthBucket[] {
  const buckets: LengthBucket[] = [
    { label: 'Short (<3min)',   minSec: 0,    maxSec: 180,  min: 0,    max: 180,       avg: 0, count: 0 },
    { label: 'Medium (3-8min)',  minSec: 180,  maxSec: 480,  min: 180,  max: 480,       avg: 0, count: 0 },
    { label: 'Long (8-20min)',   minSec: 480,  maxSec: 1200, min: 480,  max: 1200,      avg: 0, count: 0 },
    { label: 'Very Long (20m+)', minSec: 1200, maxSec: Infinity, min: 1200, max: Infinity, avg: 0, count: 0 },
  ]

  const totals: number[] = [0, 0, 0, 0]

  for (const v of videos) {
    const dur = parseISO8601(v.contentDetails?.duration)
    const views = safeInt(v.statistics?.viewCount)
    for (let i = 0; i < buckets.length; i++) {
      if (dur >= buckets[i].minSec && dur < buckets[i].maxSec) {
        totals[i] += views
        buckets[i].count += 1
        break
      }
    }
  }

  for (let i = 0; i < buckets.length; i++) {
    buckets[i].avg = buckets[i].count > 0 ? totals[i] / buckets[i].count : 0
  }

  return [...buckets]
    .filter(b => b.count > 0)
    .sort((a, b) => b.avg - a.avg)
}

export interface HookType {
  type: string
  avg: number
  count: number
  videos?: YouTubeVideo[]
}

export function calcHookTypes(videos: YouTubeVideo[]): HookType[] {
  const patterns: Array<{ type: string; regex: RegExp }> = [
    { type: 'Question Hook',  regex: /\?/ },
    { type: 'Number Hook',    regex: /^\d+|^\w+ \d+/ },
    { type: 'Story Hook',     regex: /\b(how i|how we|why i|my|story|journey|tried|spent|lived)\b/i },
    { type: 'Reveal Hook',    regex: /\b(secret|truth|real|actually|finally|honest)\b/i },
    { type: 'Challenge Hook', regex: /\b(vs|versus|challenge|battle|beats|beat)\b/i },
    { type: 'Tutorial Hook',  regex: /\b(how to|guide|tutorial|step|learn|master)\b/i },
  ]

  const map: Record<string, { total: number; count: number; videos: YouTubeVideo[] }> = {}
  patterns.forEach(p => { map[p.type] = { total: 0, count: 0, videos: [] } })

  for (const v of videos) {
    const title = v.snippet.title || ''
    const views = safeInt(v.statistics?.viewCount)
    for (const p of patterns) {
      if (p.regex.test(title)) {
        map[p.type].total += views
        map[p.type].count += 1
        map[p.type].videos.push(v)
        break
      }
    }
  }

  return patterns
    .map(p => ({
      type: p.type,
      avg: map[p.type].count > 0 ? map[p.type].total / map[p.type].count : 0,
      count: map[p.type].count,
      videos: map[p.type].videos,
    }))
    .filter(h => h.count > 0)
    .sort((a, b) => b.avg - a.avg)
}

const NICHES: Array<{ niche: string; keywords: string[] }> = [
  { niche: 'Tech',       keywords: ['tech','technology','software','coding','programming','ai','phone','computer','review','gadget'] },
  { niche: 'Gaming',     keywords: ['game','gaming','play','playstation','xbox','minecraft','fortnite','fps','rpg'] },
  { niche: 'Finance',    keywords: ['money','finance','invest','stock','crypto','wealth','trading','business','budget'] },
  { niche: 'Fitness',    keywords: ['fitness','workout','gym','health','diet','nutrition','exercise','muscle','weight'] },
  { niche: 'Education',  keywords: ['learn','education','study','science','math','history','explain','tutorial','course'] },
  { niche: 'Lifestyle',  keywords: ['lifestyle','vlog','day','life','travel','food','fashion','beauty','home'] },
  { niche: 'Comedy',     keywords: ['funny','comedy','prank','reaction','challenge','meme','skit','humor'] },
  { niche: 'News',       keywords: ['news','politics','world','current','event','update','report','breaking'] },
  { niche: 'Music',      keywords: ['music','song','cover','band','artist','album','rap','pop','hip hop'] },
]

export function getNiche(channel: { snippet?: { title?: string; description?: string } }): string {
  const text = ((channel?.snippet?.title || '') + ' ' + (channel?.snippet?.description || '')).toLowerCase()
  let best = { niche: 'Content', score: 0 }
  for (const n of NICHES) {
    const score = n.keywords.filter(kw => text.includes(kw)).length
    if (score > best.score) best = { niche: n.niche, score }
  }
  return best.niche
}

/** Hours since an ISO date string */
export function hoursSince(dateStr: string | undefined | null): number {
  if (!dateStr) return 9999
  return (Date.now() - new Date(dateStr).getTime()) / 3_600_000
}

/** Views-per-hour velocity label */
export function velocityDisplay(video: unknown): string {
  const v = video as YouTubeVideo
  const views = safeInt(v?.statistics?.viewCount)
  const hours = hoursSince(v?.snippet?.publishedAt)
  if (!hours || hours > 8760) return '—'
  const vph = Math.round(views / hours)
  if (vph >= 1000) return `${(vph / 1000).toFixed(1)}K/hr`
  return `${vph}/hr`
}

/** Views-per-hour as a raw number */
export function viewVelocity(video: unknown): number {
  const v = video as YouTubeVideo
  const views = safeInt(v?.statistics?.viewCount)
  const hours = hoursSince(v?.snippet?.publishedAt)
  if (!hours || hours < 0.1 || hours > 8760) return 0
  return views / hours
}

/** Match score between a candidate channel and the creator's channel (0–100) */
export function calcMatchScore(
  candidate: { statistics?: { subscriberCount?: string; videoCount?: string; viewCount?: string } },
  creator: { statistics?: { subscriberCount?: string; videoCount?: string; viewCount?: string } }
): number {
  const candSubs = safeInt(candidate?.statistics?.subscriberCount)
  const creSubs  = safeInt(creator?.statistics?.subscriberCount)
  if (!candSubs || !creSubs) return 0

  const ratio = candSubs / Math.max(creSubs, 1)
  // Best match: 3x–5x range scores highest
  let sizeScore = 0
  if (ratio >= 3 && ratio <= 5) sizeScore = 100
  else if (ratio > 5 && ratio <= 10) sizeScore = Math.round(100 - ((ratio - 5) / 5) * 50)
  else if (ratio < 3 && ratio >= 1) sizeScore = Math.round(((ratio - 1) / 2) * 60)
  else sizeScore = 0

  const candVPC = safeInt(candidate?.statistics?.viewCount) / Math.max(safeInt(candidate?.statistics?.videoCount), 1)
  const creVPC  = safeInt(creator?.statistics?.viewCount) / Math.max(safeInt(creator?.statistics?.videoCount), 1)
  const vpcRatio = Math.min(candVPC, creVPC) / Math.max(Math.max(candVPC, creVPC), 1)
  const engScore = Math.round(vpcRatio * 100)

  return Math.round(sizeScore * 0.7 + engScore * 0.3)
}

// ── CPM table by niche ─────────────────────────────────────────────────────
const NICHE_CPM: Record<string, number> = {
  Finance: 12, Tech: 8, Education: 6, Fitness: 5,
  Gaming: 3, Lifestyle: 4, Comedy: 2.5, News: 4, Music: 2, Content: 4,
}

/** Estimate AdSense revenue from view count (number or string) and niche (industry-avg CPM) */
export function estimateRevenue(views: string | number | undefined, niche: string): number {
  const v = safeInt(views as string)
  const cpm = NICHE_CPM[niche] ?? 4
  // ~55% monetisable, RPM ≈ CPM * 0.55
  return (v / 1000) * cpm * 0.55
}

/** Estimate sponsor value for one integration */
export function estimateSponsorValue(subscribers: string | number, engRate: number): number {
  const subs = safeInt(subscribers as string)
  // Industry formula: $20–$50 per 1K subs * engagement multiplier
  const base = (subs / 1000) * 25
  const engMulti = Math.min(3, Math.max(0.5, engRate / 2))
  return Math.round(base * engMulti)
}

export interface GrowthMilestone {
  target: number
  label: string
  monthsNeeded: number
  projectedDate: string
  doubleFreqMonths: number
  doubleFreqDate: string
}

export interface GrowthForecast {
  currentSubs: number
  monthlyGrowthRate: number
  milestones: GrowthMilestone[]
}

/** Calculate subscriber growth forecast and milestone projections */
export function calcGrowthForecast(
  videos: YouTubeVideo[],
  channel: { statistics?: { subscriberCount?: string; videoCount?: string; viewCount?: string } }
): GrowthForecast {
  const currentSubs = safeInt(channel?.statistics?.subscriberCount)
  const videoCount  = Math.max(safeInt(channel?.statistics?.videoCount), 1)

  // Estimate monthly sub growth from video count and avg engagement
  const avgViews = videos.length
    ? videos.reduce((s, v) => s + safeInt(v.statistics?.viewCount), 0) / videos.length
    : 0
  const avgEng = videos.length
    ? videos.reduce((s, v) => s + engagementRate(v), 0) / videos.length
    : 2

  // Rough: 1-3% of viewers subscribe, weighted by engagement
  const convRate = Math.min(0.04, Math.max(0.005, avgEng / 200))
  const uploadsPerMonth = Math.max(1, videoCount / Math.max(
    1,
    (Date.now() - new Date(videos[videos.length - 1]?.snippet?.publishedAt || Date.now()).getTime()) / (30 * 86400_000)
  ))
  const monthlyGrowthRate = Math.max(50, Math.round(avgViews * uploadsPerMonth * convRate))

  const MILESTONES = [1_000, 10_000, 50_000, 100_000, 500_000, 1_000_000]

  const milestones: GrowthMilestone[] = MILESTONES
    .filter(t => t > currentSubs)
    .slice(0, 5)
    .map(target => {
      const subsNeeded = target - currentSubs
      const monthsNeeded = monthlyGrowthRate > 0 ? subsNeeded / monthlyGrowthRate : 999
      const doubleFreqMonths = monthlyGrowthRate > 0 ? subsNeeded / (monthlyGrowthRate * 1.8) : 999

      const projDate = new Date()
      projDate.setMonth(projDate.getMonth() + Math.ceil(monthsNeeded))

      const doubleDate = new Date()
      doubleDate.setMonth(doubleDate.getMonth() + Math.ceil(doubleFreqMonths))

      const label = target >= 1_000_000 ? `${target / 1_000_000}M` : `${target / 1_000}K`

      return {
        target,
        label,
        monthsNeeded: Math.ceil(monthsNeeded),
        projectedDate: projDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        doubleFreqMonths: Math.ceil(doubleFreqMonths),
        doubleFreqDate: doubleDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      }
    })

  return { currentSubs, monthlyGrowthRate, milestones }
}

/** Returns the next optimal upload date based on last upload, avg gap, and best day index */
export function nextOptimalDate(
  lastUpload: string | null,
  avgGap: number,
  bestDayIdx: number
): Date {
  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  const base = lastUpload
    ? new Date(new Date(lastUpload).getTime() + avgGap * 86_400_000)
    : new Date(Date.now() + avgGap * 86_400_000)
  const diff = (bestDayIdx - base.getDay() + 7) % 7
  return new Date(base.getTime() + diff * 86_400_000)
}

/** Returns the next optimal upload date as a string (simple version) */
export function nextOptimalDateStr(bestDay: string): string {
  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  const targetIdx = DAYS.indexOf(bestDay)
  if (targetIdx < 0) return new Date().toISOString()
  const now = new Date()
  const current = now.getDay()
  let daysAhead = (targetIdx - current + 7) % 7
  if (daysAhead === 0) daysAhead = 7
  const next = new Date(now)
  next.setDate(now.getDate() + daysAhead)
  return next.toISOString()
}
