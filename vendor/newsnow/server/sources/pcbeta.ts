import { XMLParser } from "fast-xml-parser"
import type { NewsItem } from "@shared/types"

const baseURL = "https://bbs.pcbeta.com"

// Treat verification pages as unavailable; never automate access challenges.
async function fetchRSS(url: string) {
  const text = await myFetch<string>(url, { responseType: "text" })
  if (/__access_review|data-challenge|action=environment/.test(text)) throw new Error("ACCESS_CHALLENGE")
  return text
}

function parseRSS(xmlText: string): NewsItem[] {
  const xml = new XMLParser({
    attributeNamePrefix: "",
    textNodeName: "#text",
    ignoreAttributes: false,
  })
  const result = xml.parse(xmlText)
  const items = result?.rss?.channel?.item
  const list: any[] = Array.isArray(items) ? items : items ? [items] : []
  return list.map(item => ({
    id: item.link,
    title: item.title,
    url: item.link,
    pubDate: item.pubDate,
    extra: {
      hover: item.description,
    },
  })).filter(item => item.id && item.title)
}

function pcbeta(fid: number) {
  return defineSource(async () => {
    const news = parseRSS(await fetchRSS(`${baseURL}/forum.php?mod=rss&fid=${fid}&auth=0`))
    if (!news.length) throw new Error("Cannot fetch rss data")
    return news
  })
}

export default defineSource({
  "pcbeta-windows11": pcbeta(563),
  "pcbeta-windows": pcbeta(521),
})
