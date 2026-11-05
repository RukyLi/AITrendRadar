import type { NewsItem } from "@shared/types"

export function normalizeSourceItems(id: string, items: NewsItem[]): NewsItem[] {
  // FastBull repeats the same story in several page modules. Keep the first occurrence.
  if (id !== "fastbull-news") return items.slice(0, 30)
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = String(item.id)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 30)
}
