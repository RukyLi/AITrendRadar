PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS sources (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'rss', url TEXT NOT NULL DEFAULT '',
 category TEXT NOT NULL DEFAULT '自定义', enabled INTEGER NOT NULL DEFAULT 1, note TEXT NOT NULL DEFAULT '',
 metadata TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'pending', last_checked TEXT,
 last_success TEXT, error TEXT NOT NULL DEFAULT '', failures INTEGER NOT NULL DEFAULT 0,
 next_retry TEXT, etag TEXT, modified TEXT, item_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS topics (id TEXT PRIMARY KEY, name TEXT NOT NULL, keywords TEXT NOT NULL,
 color TEXT NOT NULL, followed INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, title_key TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, changed_at TEXT NOT NULL DEFAULT '', ai_status TEXT NOT NULL DEFAULT 'pending',
 analysis TEXT, analysis_hash TEXT, analysis_error TEXT NOT NULL DEFAULT '',
 is_read INTEGER NOT NULL DEFAULT 0, bookmarked INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS event_title_key ON events(title_key);
CREATE INDEX IF NOT EXISTS event_updated ON events(updated_at DESC);
CREATE TABLE IF NOT EXISTS articles (
 id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id), event_id TEXT NOT NULL REFERENCES events(id),
 title TEXT NOT NULL, url TEXT NOT NULL DEFAULT '', guid TEXT NOT NULL DEFAULT '',
 summary TEXT NOT NULL DEFAULT '', author TEXT NOT NULL DEFAULT '', published_at TEXT NOT NULL,
 first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, content_hash TEXT NOT NULL, rank INTEGER
);
CREATE INDEX IF NOT EXISTS article_event ON articles(event_id);
CREATE INDEX IF NOT EXISTS article_url ON articles(url);
CREATE INDEX IF NOT EXISTS article_date ON articles(published_at DESC);
CREATE TABLE IF NOT EXISTS event_topics (
 event_id TEXT REFERENCES events(id) ON DELETE CASCADE, topic_id TEXT REFERENCES topics(id) ON DELETE CASCADE,
 PRIMARY KEY(event_id, topic_id)
);
CREATE TABLE IF NOT EXISTS observations (
 article_id TEXT REFERENCES articles(id), observed_at TEXT NOT NULL, rank INTEGER,
 PRIMARY KEY(article_id, observed_at)
);
CREATE TABLE IF NOT EXISTS imports (path TEXT PRIMARY KEY, signature TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS jobs (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, target TEXT NOT NULL DEFAULT '', status TEXT NOT NULL,
 stage TEXT NOT NULL DEFAULT '等待后台处理', progress INTEGER NOT NULL DEFAULT 0,
 result TEXT NOT NULL DEFAULT '{}', error TEXT NOT NULL DEFAULT '', attempts INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL, started_at TEXT, finished_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_job ON jobs(kind, target) WHERE status IN ('queued','running');
CREATE TABLE IF NOT EXISTS ai_cache (key TEXT PRIMARY KEY, content TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS merge_checks (key TEXT PRIMARY KEY, same_event INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS briefs (
 id TEXT PRIMARY KEY, date TEXT NOT NULL, version INTEGER NOT NULL, content TEXT NOT NULL,
 created_at TEXT NOT NULL, status TEXT NOT NULL, UNIQUE(date,version)
);
CREATE TABLE IF NOT EXISTS event_aliases (old_id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id));
CREATE TABLE IF NOT EXISTS event_entities (
 event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE, entity TEXT NOT NULL,
 PRIMARY KEY(event_id,entity)
);
CREATE INDEX IF NOT EXISTS entity_events ON event_entities(entity,event_id);
CREATE TABLE IF NOT EXISTS review_history (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL, content_hash TEXT NOT NULL,
 status TEXT NOT NULL, model TEXT NOT NULL, result TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS review_event ON review_history(event_id,created_at);
CREATE TABLE IF NOT EXISTS event_merges (
 id TEXT PRIMARY KEY, kept_id TEXT NOT NULL, removed_id TEXT NOT NULL,
 reason TEXT NOT NULL, confidence REAL NOT NULL, evidence TEXT NOT NULL,
 model TEXT NOT NULL, snapshots TEXT NOT NULL, created_at TEXT NOT NULL
);
