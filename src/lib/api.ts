const K_DATA     = "AIzaSyDy3LNCFTUSqrpmfA-TvkyRqCIryORegkA"
const K_COMMENTS = "AIzaSyAz-3Zhkq7DaeodW4s_2zTXW_zHvtzqXzc"
const GROQ_KEY_A = "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"
const GROQ_KEY_B = "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"
const YT         = "https://www.googleapis.com/youtube/v3/"
const GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions"

export { GROQ_KEY_A, GROQ_KEY_B }

export function sanitize(str: unknown, max = 150): string {
  return (str ?? "")
    .toString()
    .replace(/`/g, "'")
    .replace(/\\/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max)
}

export async function youtubeDATA(endpoint: string, params: Record<string,string>) {
  const url = YT + endpoint + "?" + new URLSearchParams({...params, key: K_DATA})
  const res = await fetch(url)
  if (!res.ok) throw new Error("YouTube " + res.status)
  const d = await res.json()
  if (d.error) throw new Error(d.error.message)
  return d
}

export async function youtubeCOMMENTS(endpoint: string, params: Record<string,string>) {
  const url = YT + endpoint + "?" + new URLSearchParams({...params, key: K_COMMENTS})
  const res = await fetch(url)
  if (!res.ok) throw new Error("YouTube search " + res.status)
  const d = await res.json()
  if (d.error) throw new Error(d.error.message)
  return d
}

export async function askGroq(
  sys: string,
  user: string,
  json = false,
  key: string = GROQ_KEY_A
): Promise<unknown> {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + key,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: sys.replace(/[\u0000-\u001F]/g,"").trim() },
        { role: "user",   content: user.replace(/[\u0000-\u001F]/g,"").trim() }
      ],
      max_tokens: 1200,
      temperature: 0.7
    })
  })
  if (!res.ok) {
    const b = await res.text()
    throw new Error("Groq " + res.status + ": " + b.slice(0,80))
  }
  const data = await res.json()
  const text = (data as { choices: Array<{ message: { content: string } }> }).choices[0].message.content
  if (!json) return text
  // Strip ALL possible wrappers
  let clean = text
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .replace(/^\s*json\s*/i, '')
    .trim()
  // Find the actual JSON object or array
  const objStart = clean.indexOf('{')
  const arrStart = clean.indexOf('[')
  const s = objStart === -1 ? arrStart
          : arrStart === -1 ? objStart
          : Math.min(objStart, arrStart)
  const objEnd = clean.lastIndexOf('}')
  const arrEnd = clean.lastIndexOf(']')
  const e = Math.max(objEnd, arrEnd) + 1
  if (s < 0 || e <= 0) {
    console.error('No JSON found. Raw response:', clean.slice(0, 200))
    throw new Error('AI returned no JSON — retry')
  }
  try {
    return JSON.parse(clean.slice(s, e))
  } catch (err) {
    console.error('JSON parse failed. Slice:', clean.slice(s, e).slice(0, 200))
    throw new Error('Malformed JSON from AI — retry')
  }
}

export async function askGroqChat(
  sys: string,
  history: Array<{role:string; text:string}>,
  msg: string
): Promise<string> {
  const messages = [
    { role: "system", content: sys.replace(/[\u0000-\u001F]/g,"").trim() },
    ...history.map(m => ({
      role: m.role === "ai" ? "assistant" : "user",
      content: sanitize(m.text, 500)
    })),
    { role: "user", content: sanitize(msg, 500) }
  ]
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + GROQ_KEY_B,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages,
      max_tokens: 600,
      temperature: 0.8
    })
  })
  if (!res.ok) throw new Error("Groq chat " + res.status)
  const d = await res.json()
  return (d as { choices: Array<{ message: { content: string } }> }).choices[0].message.content
}

export async function fetchTranscript(videoId: string): Promise<string|null> {
  try {
    const res = await fetch(
      `https://yt-transcript-api.vercel.app/api/transcript?videoId=${videoId}`
    )
    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data) || !data.length) return null
    return (data as Array<{ text: string }>).map(i => i.text).join(" ")
  } catch { return null }
}
