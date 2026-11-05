// Public diagnostics contain only fixed messages/codes, never upstream bodies, URLs or credentials.
export function sourceFailure(error: any, id: string, hasWeiboCookie = false) {
  const code = Number(error?.statusCode || error?.status || error?.response?.status || 0)
  const message = String(error?.message || "")
  const cause = error?.cause || error
  const network = String(cause?.code || error?.code || "")
  if (message === "ACCESS_CHALLENGE") return { code: "restricted", message: "源站返回人机验证页面，自动采集暂不可用" }
  if (id === "weibo" && !hasWeiboCookie && (code === 401 || code === 403)) {
    return { code: "needs_config", message: `微博拒绝匿名访问（HTTP ${code}）；可在本地配置 NEWSNOW_WEIBO_COOKIE` }
  }
  if (code === 429) return { code: "rate_limited", message: "源站 HTTP 429：请求被限流，正在退避重试" }
  if (code === 401 || code === 403) return { code: "restricted", message: `源站 HTTP ${code}：访问被拒绝或需要登录验证` }
  if (code === 404 || code === 410) return { code: "not_found", message: `源站 HTTP ${code}：订阅地址或接口已失效` }
  if (code) return { code: "http_error", message: `源站 HTTP ${code}：暂时无法获取内容` }
  if (/timeout|timed out|abort/i.test(message + " " + (cause?.name || "") + " " + network)) return { code: "timeout", message: "源站请求超时，保留上次数据并稍后重试" }
  if (network === "ENOTFOUND" || network === "EAI_AGAIN") return { code: "network", message: "源站域名解析失败，请检查网络或代理" }
  if (["ECONNREFUSED", "ECONNRESET", "ENETUNREACH", "EHOSTUNREACH"].includes(network)) return { code: "network", message: "无法连接源站，请检查网络或代理" }
  if (message === "EMPTY_SOURCE") return { code: "empty", message: "源站没有返回可解析条目，可能为空榜或页面结构已变化" }
  if (error instanceof SyntaxError || error instanceof TypeError || /rss data|热榜数据|JSON|INVALID_SOURCE/i.test(message)) return { code: "parse", message: "源站响应结构不符合适配器预期，暂时无法解析" }
  return { code: "fetch_failed", message: "源站请求未完成，当前适配器未返回更具体的失败信息" }
}
