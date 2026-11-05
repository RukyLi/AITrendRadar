// AITrendRadar integration: authoritative fetch time, explicit stale fallback, single-flight.
import type { SourceID, SourceResponse } from "@shared/types"
import { getters } from "#/getters"
import { getCacheTable } from "#/database/cache"
import { sourceFailure } from "#/utils/source-error"
import { normalizeSourceItems } from "#/utils/source-items"
const inflight = new Map<string, Promise<SourceResponse>>()
export default defineEventHandler(async (event): Promise<SourceResponse> => {
  const query = getQuery(event)
  let id = query.id as SourceID
  if (sources[id]?.redirect) id = sources[id].redirect!
  if (!id || !sources[id] || !getters[id]) throw createError({ statusCode: 404, message: "Unknown source" })
  const existing = inflight.get(id)
  if (existing) return existing
  const task = (async (): Promise<SourceResponse> => {
    const table = await getCacheTable()
    const cache = await table?.get(id)
    const checkedAt = Date.now()
    const cached = (fetchError = "", fetchErrorCode = ""): SourceResponse => ({
      id, status: "cache", items: normalizeSourceItems(id, cache!.items), updatedTime: cache!.updated,
      fetchedAt: cache!.updated, checkedAt, servedFromCache: true, fetchError, fetchErrorCode,
    })
    const latest = query.latest !== undefined && query.latest !== "false"
    if (cache && (checkedAt - cache.updated < sources[id].interval || (!latest && checkedAt - cache.updated < TTL))) return cached()
    try {
      const items = normalizeSourceItems(id, await getters[id]())
      if (!items.length || items.some(item => !item.title || !item.url || item.id === undefined)) throw new Error("EMPTY_SOURCE")
      const fetchedAt = Date.now()
      // cache.updated and fetchedAt use the exact same timestamp.
      if (table) await table.set(id, items, fetchedAt)
      return { id, status: "success", items, updatedTime: fetchedAt, fetchedAt,
        checkedAt: fetchedAt, servedFromCache: false, fetchError: "" }
    } catch (error: any) {
      const failure = sourceFailure(error, id, !!process.env.NEWSNOW_WEIBO_COOKIE)
      if (cache) return cached(failure.message, failure.code)
      return { id, status: "cache", items: [], updatedTime: 0, checkedAt,
        servedFromCache: true, fetchError: failure.message, fetchErrorCode: failure.code }
    }
  })()
  inflight.set(id, task)
  try { return await task } finally { inflight.delete(id) }
})
