import process from "node:process"
import { parseWeiboHotSearch } from "#/utils/weibo-hot-search"

export default defineSource(async () => {
  // Public data used by Weibo's web page, not the authenticated developer API.
  // The old s.weibo.com HTML board currently returns a visitor-verification page.
  const data = await myFetch<unknown>("https://weibo.com/ajax/side/hotSearch", {
    headers: {
      Referer: "https://weibo.com/",
      ...(process.env.NEWSNOW_WEIBO_COOKIE ? { Cookie: process.env.NEWSNOW_WEIBO_COOKIE } : {}),
    },
  })

  return parseWeiboHotSearch(data)
})
