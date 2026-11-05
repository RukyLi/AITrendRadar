# AITrendRadar integration

Upstream: https://github.com/newsnext/newsnow
Pinned commit: 0560c993b226cd2fd07d8a79875d50551f52c584 (0.0.43).
The original MIT LICENSE and upstream sources are retained.

Local changes:
- `build:radar` builds the pinned, already-generated source catalog without network favicon scraping or inspecting the parent repository's tags.
- `/api/s` uses actual successful fetch timestamps, explicit cache/stale/error metadata, validates nonempty samples and coalesces concurrent requests. The source minimum interval still applies to manual refreshes.
- Cache writes accept the exact fetch timestamp; `/api/s/health` is a lightweight health check.
- The hardcoded Weibo cookie is removed. Weibo now uses the public web JSON endpoint `/ajax/side/hotSearch` with its page Referer, replacing the HTML board that returns a visitor-verification page. Only organic `data.realtime` items are retained, in their original order; ads, pinned sections and duplicates are excluded. Title-based IDs remain stable. Empty, malformed and HTTP-200 access-error bodies cannot become successful samples. An optional NEWSNOW_WEIBO_COOKIE can still be set locally; it is never returned to the application.
- The main site adapts the original card structure and distributes the upstream icons and MIT notice. The complete canonical catalog is synchronized by `scripts/sync_newsnow_catalog.py`.
- Source errors have sanitized categories (HTTP, rate limit, timeout, parsing, verification) without upstream response bodies or credentials. Request retries are bounded; the two raw cookie bootstrap requests now have explicit timeouts.
- The pcbeta adapter reports human-verification pages as unavailable and does not automate access challenges.
- FastBull repeated page modules are deduplicated on fresh and cached responses, preserving first-occurrence order.
- The backend is used by AITrendRadar. Preferences, history, watches and UI are owned by the main application. No OAuth setup is required.

Install with `SKIP_INSTALL_SIMPLE_GIT_HOOKS=1 pnpm install --frozen-lockfile` (Node 24, pnpm 10.30.3), then `pnpm run build:radar`.
Do not run upstream's Git hook installer in the parent repository.
