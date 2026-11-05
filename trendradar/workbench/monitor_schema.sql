CREATE TABLE IF NOT EXISTS monitor_sources (
 id TEXT PRIMARY KEY, source_id TEXT NOT NULL UNIQUE REFERENCES sources(id),
 mode TEXT NOT NULL, category TEXT NOT NULL, interval_seconds INTEGER NOT NULL,
 subscribed INTEGER NOT NULL DEFAULT 1, position INTEGER NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending', error_code TEXT NOT NULL DEFAULT '', next_due TEXT, fetched_at TEXT,
 snapshot_id INTEGER, gap INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS monitor_snapshots (
 id INTEGER PRIMARY KEY AUTOINCREMENT, source_id TEXT NOT NULL REFERENCES monitor_sources(id),
 fetched_at TEXT NOT NULL, checked_at TEXT NOT NULL, content_hash TEXT NOT NULL,
 baseline INTEGER NOT NULL, gap INTEGER NOT NULL DEFAULT 0, from_cache INTEGER NOT NULL DEFAULT 0,
 UNIQUE(source_id,fetched_at)
);
CREATE INDEX IF NOT EXISTS monitor_snapshot_time ON monitor_snapshots(source_id,fetched_at DESC);
CREATE TABLE IF NOT EXISTS monitor_items (
 id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES monitor_sources(id), upstream_id TEXT NOT NULL,
 article_id TEXT NOT NULL REFERENCES articles(id), first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, published_at TEXT,
 UNIQUE(source_id,upstream_id)
);
CREATE TABLE IF NOT EXISTS monitor_snapshot_items (
 snapshot_id INTEGER NOT NULL REFERENCES monitor_snapshots(id) ON DELETE CASCADE,
 item_id TEXT NOT NULL REFERENCES monitor_items(id), title TEXT NOT NULL, url TEXT NOT NULL,
 summary TEXT NOT NULL DEFAULT '', published_at TEXT, rank INTEGER,
 change TEXT NOT NULL, delta INTEGER, extra TEXT NOT NULL DEFAULT '{}',
 PRIMARY KEY(snapshot_id,item_id)
);
CREATE INDEX IF NOT EXISTS monitor_item_history ON monitor_snapshot_items(item_id,snapshot_id);
CREATE TABLE IF NOT EXISTS monitor_runs (
 id INTEGER PRIMARY KEY AUTOINCREMENT, source_id TEXT NOT NULL REFERENCES monitor_sources(id),
 checked_at TEXT NOT NULL, fetched_at TEXT, state TEXT NOT NULL, error TEXT NOT NULL DEFAULT '',
 snapshot_id INTEGER REFERENCES monitor_snapshots(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS monitor_run_time ON monitor_runs(source_id,checked_at DESC);
CREATE TABLE IF NOT EXISTS monitor_watches (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, keywords TEXT NOT NULL, excludes TEXT NOT NULL DEFAULT '[]',
 sources TEXT NOT NULL DEFAULT '[]', enabled INTEGER NOT NULL DEFAULT 1,
 rise_threshold INTEGER NOT NULL DEFAULT 5, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS monitor_alerts (
 id INTEGER PRIMARY KEY AUTOINCREMENT, watch_id TEXT NOT NULL REFERENCES monitor_watches(id) ON DELETE CASCADE,
 item_id TEXT NOT NULL REFERENCES monitor_items(id), kind TEXT NOT NULL, title TEXT NOT NULL,
 created_at TEXT NOT NULL, delta INTEGER, is_read INTEGER NOT NULL DEFAULT 0,
 snapshot_id INTEGER REFERENCES monitor_snapshots(id) ON DELETE SET NULL,
 UNIQUE(watch_id,item_id,kind,snapshot_id)
);
CREATE INDEX IF NOT EXISTS monitor_alert_cooldown ON monitor_alerts(watch_id,item_id,kind,created_at DESC);
