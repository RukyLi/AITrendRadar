import { sourceFailure } from "./source-error"

describe("sanitized source diagnostics", () => {
  it.each([[429, "rate_limited"], [403, "restricted"], [401, "restricted"], [404, "not_found"], [503, "http_error"]])("classifies HTTP %s", (status, expected) => {
    const failure = sourceFailure({ statusCode: status, message: "https://secret.example/?token=DO_NOT_LEAK" }, "zhihu")
    expect(failure.code).toBe(expected)
    expect(failure.message).not.toContain("DO_NOT_LEAK")
  })
  it("separates empty, changed structure, network and human verification", () => {
    expect(sourceFailure(new Error("EMPTY_SOURCE"), "test").code).toBe("empty")
    expect(sourceFailure(new SyntaxError("bad response"), "test").code).toBe("parse")
    expect(sourceFailure({ cause: { code: "EAI_AGAIN" } }, "test").code).toBe("network")
    expect(sourceFailure(new Error("Request timed out"), "test").code).toBe("timeout")
    expect(sourceFailure(new Error("ACCESS_CHALLENGE"), "test").code).toBe("restricted")
  })
  it("does not call a network timeout a missing credential", () => {
    expect(sourceFailure({ statusCode: 403 }, "weibo").code).toBe("needs_config")
    expect(sourceFailure({ statusCode: 403 }, "weibo", true).code).toBe("restricted")
    expect(sourceFailure(new Error("timeout"), "weibo").code).toBe("timeout")
  })
})
