"""SQLite application index, independent of the legacy daily archives."""
import json
import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

import yaml

from .defaults import FEEDS, SETTINGS, TOPICS
from .util import canonical_url, db_path, identity, now, plain, timestamp, title_key
from .provenance import source_identity


class Store:
    def __init__(self, root, path=None):
        self.root = Path(root).resolve()
        self.path = Path(path) if path else db_path(root)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=30)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        try:
            with db:
                yield db
        finally:
            db.close()

    def initialize(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.executescript(Path(__file__).with_name("schema.sql").read_text())
            if 'changed_at' not in {r[1] for r in db.execute('PRAGMA table_info(events)')}:
                db.execute("ALTER TABLE events ADD COLUMN changed_at TEXT NOT NULL DEFAULT ''")
            columns = {r[1] for r in db.execute('PRAGMA table_info(events)')}
            for field, definition in {
                'relevance_status': "TEXT NOT NULL DEFAULT 'unreviewed'",
                'relevance': 'TEXT', 'review_hash': "TEXT NOT NULL DEFAULT ''",
                'review_error': "TEXT NOT NULL DEFAULT ''", 'review_retry_at': 'TEXT',
            }.items():
                if field not in columns:
                    db.execute(f'ALTER TABLE events ADD COLUMN {field} {definition}')
            db.execute('CREATE INDEX IF NOT EXISTS event_relevance ON events(relevance_status,updated_at DESC)')
            try:
                db.execute("CREATE VIRTUAL TABLE IF NOT EXISTS event_search USING fts5(id UNINDEXED,title,summary,tokenize='trigram')")
            except sqlite3.OperationalError:
                db.execute("CREATE VIRTUAL TABLE IF NOT EXISTS event_search USING fts5(id UNINDEXED,title,summary)")
            db.execute("BEGIN IMMEDIATE")
            if db.execute("SELECT 1 FROM settings WHERE key='_initialized'").fetchone():
                self._migrate_quality(db)
                return
            config_file = self.root / "config/config.yaml"
            config = yaml.safe_load(config_file.read_text()) if config_file.exists() else {}
            for source in config.get("platforms", {}).get("sources", []):
                db.execute("INSERT OR IGNORE INTO sources(id,name,kind,category,enabled,metadata) VALUES(?,?,'hotlist','热榜',?,?)",
                           (source['id'], source.get('name', source['id']), int(source.get('enabled', True)), json.dumps(source)))
            for source in config.get("rss", {}).get("feeds", []):
                db.execute("INSERT OR IGNORE INTO sources(id,name,url,enabled) VALUES(?,?,?,?)",
                           (source['id'], source.get('name', source['id']), source['url'], int(source.get('enabled', True))))
            for sid, name, url, category, enabled, note in FEEDS:
                db.execute("INSERT INTO sources(id,name,url,category,enabled,note) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET url=excluded.url,category=excluded.category,enabled=excluded.enabled,note=excluded.note",
                           (sid, name, url, category, int(enabled), note))
            db.execute("INSERT OR IGNORE INTO sources(id,name,kind,category,enabled,note) VALUES('x','X / Twitter','x','社区',0,'等待官方 API 凭证与预算，暂不自动采集')")
            for tid, name, words, color in TOPICS:
                db.execute("INSERT OR IGNORE INTO topics(id,name,keywords,color) VALUES(?,?,?,?)", (tid, name, words, color))
            for key, value in {**SETTINGS, '_initialized': True}.items():
                db.execute("INSERT OR IGNORE INTO settings VALUES(?,?)", (key, json.dumps(value)))
            self._migrate_quality(db)

    def _migrate_quality(self, db):
        if not db.execute("SELECT 1 FROM settings WHERE key='_quality_v1'").fetchone():
            for row in db.execute('SELECT id FROM events').fetchall():
                self._invalidate_review(db, row['id'])
                self._index(db, row['id'])
            db.execute("INSERT INTO settings VALUES('_quality_v1','true')")
        if not db.execute("SELECT 1 FROM settings WHERE key='_quality_v2'").fetchone():
            # Revisit only unaudited records after broadening multilingual recall.
            for row in db.execute("SELECT id FROM events WHERE relevance_status='unreviewed'").fetchall():
                self._invalidate_review(db, row['id'])
            db.execute("INSERT INTO settings VALUES('_quality_v2','true')")

    def _invalidate_review(self, db, eid):
        # Candidate recall is not a claim of AI relevance; only model review admits an event.
        rows = db.execute('SELECT a.title,a.summary,s.kind FROM articles a JOIN sources s ON s.id=a.source_id WHERE event_id=?', (eid,)).fetchall()
        text = ' '.join(r['title'] + ' ' + r['summary'] for r in rows)
        terms = r'人工智能|机器学习|深度学习|强化学习|神经网络|大模型|语言模型|智能体|模型|机器人|具身智能|多模态|算力|提示词|自动化|开源|智谱|通义|千问|豆包|文心|混元|腾讯元宝|可灵|英伟达|寒武纪|(?<![a-z])(?:AI|LLM|GPT|ChatGPT|Claude|Gemini|GLM|DeepSeek|Qwen|Llama|OpenAI|Anthropic|Codex|Cursor|Copilot|MCP|RAG|agent|transformer|diffusion|inference|machine learning|Kimi|MiniMax|Perplexity|Midjourney|Runway|Sora|Mistral|Ollama|vLLM|Hugging\s*Face|Nvidia|embedding)(?![a-z])'
        candidate = any(r['kind'] == 'rss' for r in rows) or bool(re.search(terms, text, re.I))
        db.execute("UPDATE events SET relevance_status=?,relevance=NULL,review_hash='',review_error='',review_retry_at=NULL WHERE id=?", ('pending' if candidate else 'unreviewed', eid))
        db.execute('DELETE FROM event_entities WHERE event_id=?', (eid,))

    def fingerprint(self, eid, connection=None):
        if connection is None:
            with self.connect() as db:
                return self.fingerprint(eid, db)
        rows = connection.execute('SELECT id,content_hash FROM articles WHERE event_id=? ORDER BY id', (eid,)).fetchall()
        return identity(*[r['id'] + ':' + r['content_hash'] for r in rows])

    def review_candidates(self, limit=300, retry=False):
        with self.connect() as db:
            return [r[0] for r in db.execute("SELECT id FROM events WHERE relevance_status='pending' OR (relevance_status='error' AND (? OR review_retry_at<=?)) ORDER BY updated_at DESC,id LIMIT ?", (retry, now(), limit))]

    def settings(self):
        with self.connect() as db:
            return {r['key']: json.loads(r['value']) for r in db.execute("SELECT * FROM settings WHERE key NOT LIKE '\\_%' ESCAPE '\\'")}

    def internal(self, key, default=None):
        with self.connect() as db:
            row = db.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
            return json.loads(row[0]) if row else default

    def set_settings(self, values):
        with self.connect() as db:
            db.executemany("INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                           [(k, json.dumps(v)) for k, v in values.items()])
        return self.settings()

    def sources(self):
        with self.connect() as db:
            rows = [dict(r) for r in db.execute("SELECT * FROM sources ORDER BY enabled DESC,category,name")]
        for row in rows:
            row.update(source_identity(row))
            row.pop('metadata', None)
            row.pop('etag', None)
            row.pop('modified', None)
        return rows

    def source(self, sid):
        with self.connect() as db:
            row = db.execute("SELECT * FROM sources WHERE id=?", (sid,)).fetchone()
            return dict(row) if row else None

    def save_source(self, values, sid=None):
        sid = sid or identity('source', values['url'])
        with self.connect() as db:
            if self._row(db, 'sources', sid):
                fields = {k: v for k, v in values.items() if k in {'name', 'url', 'enabled', 'category'}}
                if fields:
                    db.execute(f"UPDATE sources SET {','.join(k+'=?' for k in fields)} WHERE id=?", (*fields.values(), sid))
                    if 'url' in fields:
                        db.execute("UPDATE sources SET etag=NULL,modified=NULL,next_retry=NULL,failures=0,status='pending' WHERE id=?", (sid,))
            else:
                db.execute("INSERT INTO sources(id,name,url,enabled,category) VALUES(?,?,?,?,?)",
                           (sid, values['name'], values['url'], values.get('enabled', True), values.get('category', '自定义')))
        return self.source(sid)

    def topics(self):
        with self.connect() as db:
            return [dict(r) for r in db.execute("SELECT t.*,COUNT(CASE WHEN e.relevance_status='accepted' THEN 1 END) event_count FROM topics t LEFT JOIN event_topics et ON t.id=et.topic_id LEFT JOIN events e ON e.id=et.event_id GROUP BY t.id ORDER BY t.rowid")]

    def save_topic(self, values, tid=None):
        tid = tid or identity('topic', values['name'], now())
        with self.connect() as db:
            if self._row(db, 'topics', tid):
                fields = {k: v for k, v in values.items() if k in {'name', 'keywords', 'followed', 'color'}}
                if fields:
                    db.execute(f"UPDATE topics SET {','.join(k+'=?' for k in fields)} WHERE id=?", (*fields.values(), tid))
            else:
                db.execute("INSERT INTO topics(id,name,keywords,color,followed) VALUES(?,?,?,?,?)",
                           (tid, values['name'], values['keywords'], values.get('color', '#5c7d72'), values.get('followed', True)))
            for event in db.execute("SELECT id FROM events").fetchall():
                self._index(db, event['id'])
        return next(t for t in self.topics() if t['id'] == tid)

    @staticmethod
    def _row(db, table, rid):
        return db.execute(f"SELECT * FROM {table} WHERE id=?", (rid,)).fetchone()

    def _index(self, db, eid):
        event = self._row(db, 'events', eid)
        articles = db.execute("SELECT title,summary FROM articles WHERE event_id=?", (eid,)).fetchall()
        searchable = ' '.join(r['title'] + ' ' + r['summary'] for r in articles)
        analysis = json.loads(event['analysis']) if event['analysis'] else {}
        review = json.loads(event['relevance']) if event['relevance'] else {}
        interpretation = ' '.join(str(analysis.get(k, '')) for k in ('title_zh','summary_zh','why_it_matters'))
        interpretation += ' '.join(p.get('text', '') for p in analysis.get('points', []))
        db.execute("DELETE FROM event_search WHERE id=?", (eid,))
        db.execute("INSERT INTO event_search(id,title,summary) VALUES(?,?,?)", (eid, event['title'], searchable + ' ' + interpretation + ' ' + review.get('canonical_title','')))
        db.execute("DELETE FROM event_topics WHERE event_id=?", (eid,))
        for topic in db.execute("SELECT * FROM topics").fetchall():
            if event['relevance_status'] == 'accepted' and topic['id'] in review.get('topic_ids', []):
                db.execute('INSERT OR IGNORE INTO event_topics VALUES(?,?)', (eid, topic['id']))
            for word in re.split(r'[,，\n]', topic['keywords']):
                word = word.strip()
                if not word:
                    continue
                pattern = re.escape(word)
                if word.isascii():
                    pattern = r'(?<![a-zA-Z])' + pattern + r'(?![a-zA-Z])'
                if re.search(pattern, searchable, re.I):
                    db.execute("INSERT OR IGNORE INTO event_topics VALUES(?,?)", (eid, topic['id']))
                    break

    def ingest(self, article, historical=False, connection=None):
        if connection is None:
            with self.connect() as db:
                return self.ingest(article, historical, db)
        db = connection
        title = plain(article.get('title'), 600)
        if not title:
            return None, False
        sid = article['source_id']
        url = canonical_url(article.get('url'), sid)
        guid = str(article.get('guid') or '')[:1000]
        aid = identity(sid, guid or url or title_key(title))
        summary = plain(article.get('summary'))
        content_hash = identity(title, summary)
        observed = timestamp(article.get('observed_at'))
        published = timestamp(article.get('published_at'), observed)
        existing = self._row(db, 'articles', aid)
        # GUID and canonical URL can vary between importers; reconcile either identity.
        if not existing and url:
            existing = db.execute("SELECT * FROM articles WHERE source_id=? AND url=? LIMIT 1", (sid, url)).fetchone()
        if existing:
            aid, eid = existing['id'], existing['event_id']
            changed = existing['content_hash'] != content_hash
            db.execute("UPDATE articles SET last_seen=MAX(last_seen,?),rank=COALESCE(?,rank) WHERE id=?", (observed, article.get('rank'), aid))
            if changed and observed >= existing['last_seen']:
                db.execute("UPDATE articles SET title=?,summary=?,content_hash=? WHERE id=?", (title, summary, content_hash, aid))
                db.execute("UPDATE events SET updated_at=MAX(updated_at,?),changed_at=?,ai_status='pending',analysis=NULL WHERE id=?", (observed, observed, eid))
                if db.execute("SELECT COUNT(*) FROM articles WHERE event_id=?", (eid,)).fetchone()[0] == 1:
                    db.execute("UPDATE events SET title=?,title_key=?,summary=? WHERE id=?", (title, title_key(title), summary, eid))
                self._invalidate_review(db, eid)
                self._index(db, eid)
            else:
                changed = False
        else:
            match = db.execute("SELECT event_id FROM articles WHERE url=? AND url!='' LIMIT 1", (url,)).fetchone()
            if not match:
                match = db.execute("SELECT id event_id FROM events WHERE title_key=? AND ABS(julianday(updated_at)-julianday(?))<7 LIMIT 1", (title_key(title), published)).fetchone()
            eid = match['event_id'] if match else identity('event', aid)
            db.execute("INSERT OR IGNORE INTO events(id,title,title_key,summary,created_at,updated_at) VALUES(?,?,?,?,?,?)",
                       (eid, title, title_key(title), summary, published if historical else observed, published))
            db.execute("INSERT INTO articles(id,source_id,event_id,title,url,guid,summary,author,published_at,first_seen,last_seen,content_hash,rank) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                       (aid, sid, eid, title, url, guid, summary, plain(article.get('author'), 200), published, observed, observed, content_hash, article.get('rank')))
            db.execute("UPDATE events SET updated_at=MAX(updated_at,?),changed_at=?,ai_status='pending',analysis=NULL WHERE id=?", (published, observed, eid))
            self._invalidate_review(db, eid)
            self._index(db, eid)
            changed = True
        if article.get('rank') is not None:
            db.execute("INSERT OR IGNORE INTO observations VALUES(?,?,?)", (aid, observed, article['rank']))
        return eid, changed

    def import_archives(self):
        count = 0
        for kind in ['news', 'rss']:
            for path in sorted((self.root / 'output' / kind).glob('????-??-??.db')):
                stat = path.stat()
                signature = f'{stat.st_mtime_ns}:{stat.st_size}'
                with self.connect() as db:
                    prev = db.execute("SELECT signature FROM imports WHERE path=?", (str(path),)).fetchone()
                    if prev and prev[0] == signature:
                        continue
                    legacy = sqlite3.connect(f'file:{path}?mode=ro', uri=True)
                    legacy.row_factory = sqlite3.Row
                    try:
                        source_table, item_table, source_key = ('platforms', 'news_items', 'platform_id') if kind == 'news' else ('rss_feeds', 'rss_items', 'feed_id')
                        for source in legacy.execute(f'SELECT * FROM {source_table}'):
                            db.execute("INSERT OR IGNORE INTO sources(id,name,kind,category,enabled) VALUES(?,?,?,?,0)",
                                       (source['id'], source['name'], 'hotlist' if kind == 'news' else 'rss', '归档'))
                        for row in legacy.execute(f'SELECT * FROM {item_table}'):
                            item = dict(row)
                            date = path.stem
                            item['source_id'] = item[source_key]
                            last_clock = ':'.join(re.findall(r'\d{2}', item['last_crawl_time'])[:2])
                            first_clock = ':'.join(re.findall(r'\d{2}', item['first_crawl_time'])[:2])
                            item['observed_at'] = f"{date}T{last_clock}:00+08:00"
                            item['published_at'] = item.get('published_at') or f"{date}T{first_clock}:00+08:00"
                            _, changed = self.ingest(item, historical=True, connection=db)
                            count += int(changed)
                        if kind == 'news':
                            for row in legacy.execute('SELECT n.platform_id,n.url,n.title,h.rank,h.crawl_time FROM rank_history h JOIN news_items n ON n.id=h.news_item_id'):
                                item = db.execute('SELECT id FROM articles WHERE source_id=? AND (url=? AND url!=\'\' OR title=?) LIMIT 1', (row['platform_id'], canonical_url(row['url'],row['platform_id']), row['title'])).fetchone()
                                if item:
                                    clock = ':'.join(re.findall(r'\d{2}', row['crawl_time'])[:2])
                                    db.execute('INSERT OR IGNORE INTO observations VALUES(?,?,?)', (item[0], timestamp(f"{date}T{clock}:00+08:00"), row['rank']))
                    except sqlite3.OperationalError:
                        # A partially written/incompatible archive is retried on the next import.
                        continue
                    finally:
                        legacy.close()
                    db.execute('INSERT OR REPLACE INTO imports VALUES(?,?)', (str(path), signature))
        return count

    def resolve(self, eid):
        with self.connect() as db:
            row = db.execute('SELECT event_id FROM event_aliases WHERE old_id=?', (eid,)).fetchone()
            return row[0] if row else eid

    def events(self, q='', topic='', source='', view='all', sort='recommended', days=0, start='', end='', page=1, limit=40, since='', review=''):
        q = q.strip()
        clauses, args = ['1=1'], []
        if view in {'all','today','following','unread'}:
            clauses.append("e.relevance_status='accepted'")
        if view == 'archive': clauses.append("e.relevance_status!='accepted'")
        if review:
            clauses.append('e.relevance_status=?'); args.append(review)
        if q:
            if len(q.strip()) >= 3:
                clauses.append('e.id IN (SELECT id FROM event_search WHERE event_search MATCH ?)')
                args.append('"' + q.replace('"', '""') + '"')
            else:
                clauses.append("e.id IN (SELECT id FROM event_search WHERE title LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\')")
                term = '%' + q.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
                args.extend([term, term])
        if topic:
            clauses.append('EXISTS(SELECT 1 FROM event_topics WHERE event_id=e.id AND topic_id=?)'); args.append(topic)
        if source:
            clauses.append('EXISTS(SELECT 1 FROM articles WHERE event_id=e.id AND source_id=?)'); args.append(source)
        if view == 'following':
            clauses.append('EXISTS(SELECT 1 FROM event_topics et JOIN topics t ON t.id=et.topic_id WHERE et.event_id=e.id AND t.followed=1)')
        if view == 'saved': clauses.append('e.bookmarked=1')
        if view == 'unread': clauses.append('e.is_read=0')
        if view == 'today' and not days: days = 1
        if days:
            clauses.append('e.updated_at>=?'); args.append((datetime.now(timezone.utc)-timedelta(days=days)).isoformat())
        if start: clauses.append('e.updated_at>=?'); args.append(timestamp(start+'T00:00:00+08:00'))
        if end: clauses.append('e.updated_at<=?'); args.append(timestamp(end+'T23:59:59+08:00'))
        if since: clauses.append('e.changed_at>?'); args.append(since)
        where = ' AND '.join(clauses)
        order = 'follow_count DESC,source_count DESC,e.updated_at DESC,e.id' if sort == 'recommended' else 'e.updated_at DESC,e.id'
        with self.connect() as db:
            total = db.execute(f'SELECT COUNT(*) FROM events e WHERE {where}', args).fetchone()[0]
            current_total = db.execute('SELECT COUNT(*) FROM events e WHERE '+' AND '.join(clauses[:-1]), args[:-1]).fetchone()[0] if since else total
            rows = db.execute(f'''SELECT e.*,
                (SELECT COUNT(DISTINCT source_id) FROM articles WHERE event_id=e.id) source_count,
                (SELECT COUNT(*) FROM event_topics et JOIN topics t ON t.id=et.topic_id WHERE et.event_id=e.id AND t.followed=1) follow_count
                FROM events e WHERE {where} ORDER BY {order} LIMIT ? OFFSET ?''', (*args, limit, (page-1)*limit)).fetchall()
            items = [self._event_dict(db, r) for r in rows]
        return dict(items=items, total=total, current_total=current_total, page=page, limit=limit, snapshot=now())

    def _event_dict(self, db, row):
        result = dict(row)
        result['analysis'] = json.loads(result['analysis']) if result.get('analysis') else None
        result['relevance'] = json.loads(result['relevance']) if result.get('relevance') else None
        result['topics'] = [dict(r) for r in db.execute('SELECT t.id,t.name,t.color,t.followed FROM topics t JOIN event_topics et ON t.id=et.topic_id WHERE et.event_id=?', (row['id'],))]
        result['sources'] = [{**dict(r), **source_identity(dict(r))} for r in db.execute('SELECT DISTINCT s.id,s.name,s.kind,s.url FROM sources s JOIN articles a ON a.source_id=s.id WHERE a.event_id=?', (row['id'],))]
        result.pop('title_key', None)
        result.pop('analysis_hash', None)
        result.pop('review_hash', None)
        return result

    def event(self, eid):
        eid = self.resolve(eid)
        with self.connect() as db:
            row = self._row(db, 'events', eid)
            if not row: return None
            result = self._event_dict(db, row)
            result['articles'] = [dict(r) for r in db.execute('SELECT a.*,s.name source_name,s.kind FROM articles a JOIN sources s ON s.id=a.source_id WHERE a.event_id=? ORDER BY a.published_at DESC', (eid,))]
            result['timeline'] = [dict(r) for r in db.execute('SELECT o.*,s.name source_name FROM observations o JOIN articles a ON a.id=o.article_id JOIN sources s ON s.id=a.source_id WHERE a.event_id=? ORDER BY observed_at DESC LIMIT 100', (eid,))]
            result['source_count'] = len(result['sources'])
            source_types = {s['id']: s for s in result['sources']}
            for article in result['articles']:
                article.update({k: v for k, v in source_types[article['source_id']].items() if k in {'publisher_type','publisher_label','delivery_type','delivery_label'}})
            related = [eid] + [r[0] for r in db.execute('SELECT old_id FROM event_aliases WHERE event_id=?', (eid,))]
            placeholders = ','.join('?' for _ in related)
            result['review_history'] = [{**dict(r), 'result': json.loads(r['result'])} for r in db.execute(f'SELECT * FROM review_history WHERE event_id IN ({placeholders}) ORDER BY created_at DESC LIMIT 10', related)]
            result['merges'] = [{**dict(r), 'evidence': json.loads(r['evidence'])} for r in db.execute(f'SELECT id,kept_id,removed_id,reason,confidence,evidence,model,created_at FROM event_merges WHERE kept_id IN ({placeholders}) OR removed_id IN ({placeholders}) ORDER BY created_at DESC LIMIT 30', related+related)]
            return result

    def state(self, eid, values):
        eid = self.resolve(eid)
        fields = {k: int(v) for k,v in values.items() if k in {'is_read', 'bookmarked'}}
        with self.connect() as db:
            if fields:
                db.execute(f"UPDATE events SET {','.join(k+'=?' for k in fields)} WHERE id=?", (*fields.values(), eid))
        return self.event(eid)

    def articles(self, q='', source='', page=1, limit=40, start='', end=''):
        where, args = ['1=1'], []
        if q:
            where.append('(a.title LIKE ? OR a.summary LIKE ?)'); args.extend(['%'+q+'%']*2)
        if source: where.append('a.source_id=?'); args.append(source)
        if start: where.append('a.published_at>=?'); args.append(timestamp(start+'T00:00:00+08:00'))
        if end: where.append('a.published_at<=?'); args.append(timestamp(end+'T23:59:59+08:00'))
        with self.connect() as db:
            total = db.execute('SELECT COUNT(*) FROM articles a WHERE '+' AND '.join(where), args).fetchone()[0]
            rows = db.execute('SELECT a.*,s.name source_name,s.kind,e.is_read,e.bookmarked FROM articles a JOIN sources s ON s.id=a.source_id JOIN events e ON e.id=a.event_id WHERE '+' AND '.join(where)+' ORDER BY a.published_at DESC,a.id LIMIT ? OFFSET ?', (*args,limit,(page-1)*limit))
            identities = {r['id']: source_identity(dict(r)) for r in db.execute('SELECT * FROM sources')}
            return dict(items=[{**dict(r), **identities[r['source_id']]} for r in rows], total=total,page=page,limit=limit,snapshot=now())

    def enqueue(self, kind='update', target=''):
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute("SELECT * FROM jobs WHERE kind=? AND target=? AND status IN ('queued','running')", (kind,target)).fetchone()
            if not row:
                jid = identity(kind,target,datetime.now().isoformat())
                db.execute("INSERT INTO jobs(id,kind,target,status,created_at) VALUES(?,?,?,'queued',?)", (jid,kind,target,now()))
                row = self._row(db,'jobs',jid)
            return self._job(row)

    @staticmethod
    def _job(row):
        data = dict(row)
        data['result'] = json.loads(data['result'])
        return data

    def jobs(self, jid=None):
        with self.connect() as db:
            if jid:
                row = self._row(db,'jobs',jid)
                return self._job(row) if row else None
            return [self._job(r) for r in db.execute('SELECT * FROM jobs ORDER BY created_at DESC,rowid DESC LIMIT 30')]

    def progress(self, jid, stage, progress, result=None, status=None, error=''):
        with self.connect() as db:
            db.execute('UPDATE jobs SET stage=?,progress=?,error=? WHERE id=?', (stage,progress,error,jid))
            if result is not None: db.execute('UPDATE jobs SET result=? WHERE id=?', (json.dumps(result,ensure_ascii=False),jid))
            if status: db.execute('UPDATE jobs SET status=?,finished_at=? WHERE id=?', (status,now(),jid))

    def claim(self):
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute("SELECT * FROM jobs WHERE status='queued' ORDER BY created_at,rowid LIMIT 1").fetchone()
            if not row: return None
            db.execute("UPDATE jobs SET status='running',started_at=?,attempts=attempts+1 WHERE id=?", (now(),row['id']))
            return self._job(row)

    def meta(self):
        with self.connect() as db:
            totals = dict(db.execute('SELECT COUNT(*) events,COALESCE(SUM(bookmarked),0) saved,COALESCE(SUM(1-is_read),0) unread,MAX(updated_at) last_content FROM events').fetchone())
            totals['articles'] = db.execute('SELECT COUNT(*) FROM articles').fetchone()[0]
            totals['sources'] = db.execute('SELECT COUNT(*) FROM sources WHERE enabled=1').fetchone()[0]
            totals['healthy_sources'] = db.execute("SELECT COUNT(*) FROM sources WHERE enabled=1 AND status='ok'").fetchone()[0]
            totals.update(dict(db.execute("SELECT COALESCE(SUM(relevance_status='accepted'),0) ai_events,COALESCE(SUM(relevance_status!='accepted'),0) archive_events,COALESCE(SUM(relevance_status='pending'),0) review_pending,COALESCE(SUM(relevance_status='error'),0) review_errors FROM events").fetchone()))
        totals['worker_heartbeat'] = self.internal('_worker_heartbeat')
        totals['last_update'] = self.internal('_last_update')
        return totals

    def briefs(self, bid=None):
        with self.connect() as db:
            rows = db.execute('SELECT * FROM briefs '+('WHERE id=?' if bid else 'ORDER BY date DESC,version DESC LIMIT 60'), (bid,) if bid else ()).fetchall()
            values = [{**dict(r), 'content': json.loads(r['content'])} for r in rows]
            return (values[0] if values else None) if bid else values
