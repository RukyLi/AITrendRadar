import { normalizeSourceItems } from "./source-items"

it("deduplicates repeated FastBull modules without losing first-occurrence order", () => {
  const rows = [1, 2, 1, 3, 2].map(id => ({ id, title: `Story ${id}`, url: `https://example.com/${id}` }))
  expect(normalizeSourceItems("fastbull-news", rows).map(row => row.id)).toEqual([1, 2, 3])
  expect(normalizeSourceItems("zhihu", rows)).toHaveLength(5)
})
