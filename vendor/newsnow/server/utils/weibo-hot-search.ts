import type { NewsItem } from "@shared/types"

const flags: Record<string, string> = {
  新: "https://simg.s.weibo.com/moter/flags/1_0.png",
  热: "https://simg.s.weibo.com/moter/flags/2_0.png",
  爆: "https://simg.s.weibo.com/moter/flags/4_0.png",
}

export function parseWeiboHotSearch(response: unknown): NewsItem[] {
  if (typeof response === "string" && /Sina Visitor System|微博访客|__access_review|data-challenge/i.test(response)) {
    throw new Error("ACCESS_CHALLENGE")
  }
  const data = response as { ok?: number, error?: string, data?: { realtime?: unknown } } | null
  // Some deployments return an access error with HTTP 200. Never cache it as a board.
  if (data?.error === "Forbidden") throw Object.assign(new Error("WEIBO_FORBIDDEN"), { statusCode: 403 })
  if (data?.ok !== 1 || !Array.isArray(data.data?.realtime)) throw new Error("INVALID_SOURCE")

  const seen = new Set<string>()
  const items: NewsItem[] = []
  for (const row of data.data.realtime) {
    if (!row || typeof row !== "object") throw new Error("INVALID_SOURCE")
    // Advertisements may share a rank with an organic item. The separate hotgov
    // pinned section is deliberately not part of the ranked realtime array.
    if (row.is_ad || row.topic_ad) continue
    if (typeof row.word !== "string" || !row.word.trim()) throw new Error("INVALID_SOURCE")
    const title = row.word.trim()
    if (seen.has(title)) continue
    seen.add(title)
    // Retain the previous title-based ID so snapshots, saved items and read state survive.
    // Construct our own search URL; do not propagate ad redirects or tracking payloads.
    const query = typeof row.word_scheme === "string" && row.word_scheme.trim() ? row.word_scheme.trim() : title
    const url = `https://s.weibo.com/weibo?q=${encodeURIComponent(query)}&t=31`
    const flag = flags[row.icon_desc]
    items.push({ id: title, title, url, mobileUrl: url,
      extra: { icon: flag ? { url: flag, scale: 1.5 } : undefined } })
  }
  if (!items.length) throw new Error("EMPTY_SOURCE")
  return items
}
