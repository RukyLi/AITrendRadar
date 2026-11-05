import { parseWeiboHotSearch } from "./weibo-hot-search"
import { sourceFailure } from "./source-error"

describe("Weibo public web hot search", () => {
  it("preserves organic order and legacy IDs while excluding ads, pins and duplicate modules", () => {
    const rows = parseWeiboHotSearch({ ok: 1, data: {
      hotgov: { word: "置顶" },
      realtime: [
        { word: " 第一条 ", word_scheme: "#第一条#", icon_desc: "新", rank: 0, realpos: 1 },
        { word: "广告", is_ad: 1, rank: 1 },
        { word: "另一广告", topic_ad: 1 },
        { word: "第二条 & AI", rank: 1, realpos: 2 },
        { word: "第一条", rank: 2 },
      ],
    } })
    expect(rows.map(r => r.id)).toEqual(["第一条", "第二条 & AI"])
    expect(new URL(rows[0].url).searchParams.get("q")).toBe("#第一条#")
    expect(new URL(rows[1].url).searchParams.get("q")).toBe("第二条 & AI")
    expect(rows[0].extra?.icon).toEqual({ url: "https://simg.s.weibo.com/moter/flags/1_0.png", scale: 1.5 })
    expect(rows[0].mobileUrl).toBe(rows[0].url)
  })

  it("does not copy arbitrary links, icon URLs or upstream tracking information", () => {
    const [row] = parseWeiboHotSearch({ ok: 1, data: { realtime: [
      { word: "话题", word_scheme: "A&B#C", url: "javascript:alert(1)", icon: "https://tracker.example/", monitors: { secret: "DO_NOT_COPY" } },
    ] } })
    expect(new URL(row.url).origin).toBe("https://s.weibo.com")
    expect(new URL(row.url).searchParams.get("q")).toBe("A&B#C")
    expect(row.extra?.icon).toBeUndefined()
    expect(JSON.stringify(row)).not.toMatch(/tracker|DO_NOT_COPY|javascript/)
  })

  it.each([null, "<html>changed page</html>", { ok: 0 }, { ok: 1, data: {} },
    { ok: 1, data: { realtime: {} } }, { ok: 1, data: { realtime: [null] } },
    { ok: 1, data: { realtime: [{ word: "" }] } },
  ])("rejects an invalid response rather than recording a partial or empty board: %j", (body) => {
    expect(() => parseWeiboHotSearch(body)).toThrow("INVALID_SOURCE")
  })

  it.each([{ realtime: [] }, { realtime: [{ word: "广告", is_ad: 1 }] }])("rejects an empty organic board: %j", ({ realtime }) => {
    expect(() => parseWeiboHotSearch({ ok: 1, data: { realtime } })).toThrow("EMPTY_SOURCE")
  })

  it("reports a verification page and an HTTP-200 access error as restricted, not empty", () => {
    expect(() => parseWeiboHotSearch("<title>Sina Visitor System</title>")).toThrow("ACCESS_CHALLENGE")
    try {
      parseWeiboHotSearch({ error: "Forbidden" })
      throw new Error("expected access failure")
    } catch (error) {
      expect(sourceFailure(error, "weibo").code).toBe("needs_config")
      expect(sourceFailure(error, "weibo", true).code).toBe("restricted")
    }
  })
})
