"""Durable sampling, independent of AI inference and browser sessions."""
import json
from datetime import datetime, timedelta, timezone

from .util import canonical_url, identity, now, plain, timestamp

ERROR_LABELS = {'needs_config':'需配置', 'restricted':'访问受限', 'rate_limited':'限流中',
                'not_found':'地址失效', 'http_error':'源站异常', 'timeout':'请求超时',
                'network':'网络异常', 'empty':'未解析到内容', 'parse':'解析失败',
                'fetch_failed':'请求失败', 'provider':'采集服务异常'}


def instant(value):
    if value is None or value == '':
        return None
    try:
        if isinstance(value, (float, int)) or str(value).isdigit():
            value = float(value)
            return datetime.fromtimestamp(value / 1000 if value > 100000000000 else value, timezone.utc).isoformat(timespec='seconds')
        return datetime.fromisoformat(str(value).replace('Z', '+00:00')).astimezone(timezone.utc).isoformat(timespec='seconds')
    except (ValueError, TypeError, OverflowError, OSError):
        return None


def later(value, seconds):
    return (datetime.fromisoformat(value) + timedelta(seconds=seconds)).isoformat(timespec='seconds')


class Monitor:
    def __init__(self, store):
        self.store = store

    def sources(self):
        with self.store.connect() as db:
            rows = [dict(r) for r in db.execute('''SELECT m.*,s.name,s.enabled,s.last_checked,s.last_success,
                s.status,s.error,s.failures,s.item_count FROM monitor_sources m JOIN sources s ON s.id=m.source_id
                ORDER BY m.position,m.id''')]
        for row in rows:
            row['availability'] = row['error_code'] or ('fetch_failed' if row['error'] else 'ok' if row['state'] in {'fresh','cache'} else 'pending')
            row['availability_label'] = ERROR_LABELS.get(row['availability'], '可用' if row['availability']=='ok' else '待检查')
        return rows

    def source(self, sid):
        return next((s for s in self.sources() if s['id'] == sid), None)

    def configure(self, sid, values):
        source = self.source(sid)
        if not source:
            raise ValueError('来源不存在')
        with self.store.connect() as db:
            for field in ('subscribed', 'position'):
                if field in values:
                    db.execute(f'UPDATE monitor_sources SET {field}=? WHERE id=?', (values[field], sid))
            if 'enabled' in values:
                db.execute('UPDATE sources SET enabled=? WHERE id=?', (values['enabled'], source['source_id']))
                db.execute('UPDATE monitor_sources SET next_due=NULL WHERE id=?', (sid,))
        return self.source(sid)

    def reorder(self, ids):
        known = [s['id'] for s in self.sources()]
        if len(ids) != len(set(ids)) or set(ids) != set(known):
            raise ValueError('请提交完整且不重复的来源顺序')
        with self.store.connect() as db:
            db.executemany('UPDATE monitor_sources SET position=? WHERE id=?', enumerate(ids))

    def record(self, sid, response=None, error='', checked_at=None, error_code=''):
        """Validate first, then atomically publish a complete sample and its alerts."""
        source = self.source(sid)
        if not source:
            raise ValueError('来源不存在')
        checked = checked_at or now()
        response = response or {}
        fetched = instant(response.get('fetchedAt', response.get('updatedTime')))
        cached = response.get('servedFromCache', response.get('status') == 'cache')
        error = error or plain(response.get('fetchError'), 300)
        error_code = error_code or response.get('fetchErrorCode', '')
        if error_code not in ERROR_LABELS: error_code = 'fetch_failed' if error else ''
        upstream_error = bool(error)
        raw = response.get('items')
        if not error and (response.get('id') != sid or response.get('status') not in {'success','cache'}):
            error = '采集服务响应格式不正确'
        items, seen = [], set()
        if not error:
            if not fetched or fetched > later(checked, 120):
                error = '采集时间缺失或无效'
            elif not isinstance(raw, list) or not raw:
                error = '未解析到有效条目，保留上次榜单'
            else:
                for row in raw[:30]:
                    if not isinstance(row, dict):
                        error = '条目结构异常'; break
                    upstream = str(row.get('id', ''))[:1000]
                    title, url = plain(row.get('title'), 600), canonical_url(row.get('url'), source['source_id'])
                    if not upstream or not title or not url or upstream in seen:
                        error = '条目缺少标题、有效链接或唯一标识'; break
                    seen.add(upstream)
                    extra = row.get('extra') if isinstance(row.get('extra'), dict) else {}
                    items.append(dict(upstream=upstream, id=identity('newsnow', sid, upstream), title=title, url=url,
                        summary=plain(extra.get('hover')), published_at=instant(row.get('pubDate') or extra.get('date')),
                        extra={'info': plain(extra.get('info'), 300)}))
        if error and not upstream_error: error_code = 'parse'
        with self.store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            current = db.execute('SELECT * FROM monitor_sources WHERE id=?', (sid,)).fetchone()
            previous = db.execute('SELECT * FROM monitor_snapshots WHERE id=?', (current['snapshot_id'],)).fetchone()
            if not error and previous and fetched < previous['fetched_at']:
                error = '采集服务返回了较旧的数据，保留上次榜单'
                error_code = 'parse'
            snapshot_id, changed, count = None, 0, len(items)
            state = 'error' if error else 'cache' if cached else 'fresh'
            if not error and previous and fetched == previous['fetched_at']:
                state = 'cache'
            # A valid warm cache can seed the first baseline, explicitly tagged as cached.
            # Subsequent cache hits/fallbacks never become observations or generate deltas/alerts.
            if not error and (state == 'fresh' or previous is None):
                signature = identity(json.dumps(items, ensure_ascii=False, sort_keys=True))
                snapshot_id = db.execute('INSERT INTO monitor_snapshots(source_id,fetched_at,checked_at,content_hash,baseline,gap,from_cache) VALUES(?,?,?,?,?,?,?)',
                    (sid, fetched, checked, signature, int(previous is None), current['gap'], int(state=='cache'))).lastrowid
                previous_items = {r['item_id']: dict(r) for r in db.execute('SELECT * FROM monitor_snapshot_items WHERE snapshot_id=? AND change!=\'left\'', (current['snapshot_id'],))}
                for index, item in enumerate(items):
                    known = db.execute('SELECT * FROM monitor_items WHERE id=?', (item['id'],)).fetchone()
                    rank = index + 1 if source['mode'] == 'hottest' else None
                    old = previous_items.get(item['id'])
                    delta = old['rank'] - rank if old and rank is not None else None
                    change = 'baseline' if previous is None else ('up' if delta and delta > 0 else 'down' if delta and delta < 0 else 'same') if old else 'returned' if known else 'new'
                    if change not in {'baseline','same'}: changed += 1
                    if known:
                        article = db.execute('SELECT * FROM articles WHERE id=?', (known['article_id'],)).fetchone()
                        guid = article['guid']
                    else:
                        article = None
                        guid = item['upstream']
                    eid, _ = self.store.ingest(dict(source_id=source['source_id'], guid=guid, title=item['title'],
                        url=item['url'], summary=item['summary'], published_at=item['published_at'], observed_at=fetched, rank=rank, _article_id=article['id'] if article else None), connection=db)
                    # Store reconciles canonical URLs with legacy articles; use the reconciled ID.
                    aid = article['id'] if article else db.execute('SELECT id FROM articles WHERE source_id=? AND event_id=? AND (guid=? OR url=?) ORDER BY rowid LIMIT 1',
                        (source['source_id'], eid, guid, item['url'])).fetchone()[0]
                    db.execute('UPDATE articles SET url=? WHERE id=?', (item['url'],aid))
                    db.execute('INSERT INTO monitor_items(id,source_id,upstream_id,article_id,first_seen,last_seen,published_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen,published_at=COALESCE(excluded.published_at,monitor_items.published_at)',
                        (item['id'], sid, item['upstream'], aid, fetched, fetched, item['published_at']))
                    db.execute('INSERT INTO monitor_snapshot_items VALUES(?,?,?,?,?,?,?,?,?,?)',
                        (snapshot_id,item['id'],item['title'],item['url'],item['summary'],item['published_at'],rank,change,delta,json.dumps(item['extra'],ensure_ascii=False)))
                    if previous and change in {'new','up'}:
                        self._alert(db, sid, item, change, delta, snapshot_id, fetched, checked)
                if source['mode'] == 'hottest':
                    current_ids = {i['id'] for i in items}
                    for iid, old in previous_items.items():
                        if iid not in current_ids:
                            db.execute('INSERT INTO monitor_snapshot_items VALUES(?,?,?,?,?,?,?,?,?,?)',
                                (snapshot_id,iid,old['title'],old['url'],old['summary'],old['published_at'],None,'left',None,old['extra']))
                            changed += 1
                db.execute('UPDATE monitor_sources SET snapshot_id=?,fetched_at=?,gap=0 WHERE id=?', (snapshot_id,fetched,sid))
            failures = source['failures'] + 1 if error else 0
            delay = max(source['interval_seconds'], min(21600, 60 * 2 ** min(failures, 8))) if error else source['interval_seconds']
            # When served a still-fresh cache, request again only after its minimum interval.
            next_due = later(checked, delay)
            if state == 'cache' and fetched:
                next_due = max(later(checked, 30), later(fetched, source['interval_seconds']))
            db.execute('UPDATE monitor_sources SET state=?,error_code=?,next_due=?,gap=CASE WHEN ? THEN 1 ELSE gap END WHERE id=?',
                       (state,error_code if error else '',next_due,bool(error),sid))
            db.execute('UPDATE sources SET last_checked=?,status=?,error=?,failures=?,next_retry=?,item_count=CASE WHEN ? THEN item_count ELSE ? END,last_success=CASE WHEN ? THEN last_success ELSE ? END WHERE id=?',
                (checked,'error' if error else 'ok',error,failures,next_due if error else None,bool(error),count,bool(error) or state=='cache',fetched,source['source_id']))
            db.execute('INSERT INTO monitor_runs(source_id,checked_at,fetched_at,state,error,snapshot_id) VALUES(?,?,?,?,?,?)',
                       (sid,checked,fetched,state,error,snapshot_id))
        return dict(id=sid,name=source['name'],status='error' if error else state,count=count if not error else 0,
                    error=error,snapshot_id=snapshot_id,changed=changed)

    def _alert(self, db, sid, item, change, delta, snapshot_id, fetched, checked):
        text = (item['title'] + ' ' + item['summary']).casefold()
        for rule in db.execute('SELECT * FROM monitor_watches WHERE enabled=1 AND created_at<=?', (fetched,)).fetchall():
            sources = json.loads(rule['sources'])
            if sources and sid not in sources: continue
            if not any(w.casefold() in text for w in json.loads(rule['keywords'])): continue
            if any(w.casefold() in text for w in json.loads(rule['excludes'])): continue
            if change == 'up' and delta < rule['rise_threshold']: continue
            recent = db.execute('SELECT 1 FROM monitor_alerts WHERE watch_id=? AND item_id=? AND kind=? AND created_at>?',
                (rule['id'],item['id'],change,later(checked,-3600))).fetchone()
            if not recent:
                db.execute('INSERT OR IGNORE INTO monitor_alerts(watch_id,item_id,kind,title,created_at,delta,snapshot_id) VALUES(?,?,?,?,?,?,?)',
                           (rule['id'],item['id'],change,item['title'],checked,delta,snapshot_id))

    def _rows(self, db, where, args=(), limit=100, offset=0):
        return [dict(r) for r in db.execute('''SELECT x.*,a.event_id,e.bookmarked,e.is_read,m.source_id,s.name source_name,
            p.fetched_at,p.checked_at,p.gap,p.baseline,p.from_cache FROM monitor_snapshot_items x
            JOIN monitor_snapshots p ON p.id=x.snapshot_id JOIN monitor_items m ON m.id=x.item_id
            JOIN articles a ON a.id=m.article_id JOIN events e ON e.id=a.event_id
            JOIN monitor_sources ms ON ms.id=m.source_id JOIN sources s ON s.id=ms.source_id
            WHERE ''' + where + ' ORDER BY p.fetched_at DESC,x.rank,x.rowid LIMIT ? OFFSET ?', (*args,limit,offset))]

    def boards(self, category='', source='', q='', subscribed=True, mode='hottest', include_disabled=False):
        sources = [s for s in self.sources() if (not mode or s['mode']==mode) and (s['enabled'] or include_disabled) and (not subscribed or s['subscribed'])
                   and (not category or s['category']==category) and (not source or s['id']==source)]
        with self.store.connect() as db:
            revision = db.execute('SELECT COALESCE(MAX(id),0) FROM monitor_snapshots').fetchone()[0]
            for s in sources:
                items = self._rows(db, "x.snapshot_id=? AND x.change!='left'", (s['snapshot_id'],))
                matches_source = q.casefold() in (s['name']+' '+s['id']).casefold()
                s['items'] = [r for r in items if not q or matches_source or q.casefold() in (r['title']+' '+r['summary']).casefold()]
                s['items'].sort(key=lambda r: r['rank'] or 0)
        if q: sources = [s for s in sources if s['items'] or q.casefold() in (s['name']+' '+s['id']).casefold()]
        return dict(items=sources, revision=revision)

    def changes(self, since, source='', category='', mode='', q='', watched=False, subscribed=True):
        with self.store.connect() as db:
            revision = db.execute('SELECT COALESCE(MAX(id),0) FROM monitor_snapshots').fetchone()[0]
            rows=[dict(r) for r in db.execute('''SELECT x.title,x.summary,p.source_id FROM monitor_snapshot_items x
                JOIN monitor_snapshots p ON p.id=x.snapshot_id JOIN monitor_sources m ON m.id=p.source_id
                JOIN sources s ON s.id=m.source_id WHERE x.snapshot_id>? AND x.change!='same' AND s.enabled=1
                AND (? OR m.subscribed=1) AND (?='' OR p.source_id=?) AND (?='' OR m.category=?)
                AND (?='' OR m.mode=?) AND (?='' OR instr(lower(x.title||' '||x.summary||' '||s.name),lower(?))>0)''',
                (since,watched or not subscribed,source,source,category,category,mode,mode,q,q))]
        if watched:
            rules=[r for r in self.watches() if r['enabled']]
            rows=[r for r in rows if any(self.matches(rule,r) for rule in rules)]
        return dict(revision=revision,count=len(rows))

    def timeline(self, q='', source='', category='', page=1, limit=40, watched=False):
        clauses=["s.enabled=1", "(? OR (ms.mode='realtime' AND ms.subscribed=1))",
                 "(?='' OR m.source_id=?)", "(?='' OR ms.category=?)"]
        args=[watched,source,source,category,category]
        text="lower(a.title||' '||a.summary)"
        if q:
            clauses.append(f'instr({text},lower(?))>0');args.append(q)
        if watched:
            rules=[]
            for rule in self.watches():
                if not rule['enabled']: continue
                parts=['('+' OR '.join(f'instr({text},lower(?))>0' for _ in rule['keywords'])+')']
                args.extend(rule['keywords'])
                if rule['excludes']:
                    parts.append('NOT ('+' OR '.join(f'instr({text},lower(?))>0' for _ in rule['excludes'])+')')
                    args.extend(rule['excludes'])
                if rule['sources']:
                    parts.append('m.source_id IN ('+','.join('?' for _ in rule['sources'])+')')
                    args.extend(rule['sources'])
                rules.append('('+' AND '.join(parts)+')')
            clauses.append('('+' OR '.join(rules)+')' if rules else '0')
        joins=''' FROM monitor_items m JOIN articles a ON a.id=m.article_id JOIN events e ON e.id=a.event_id
            JOIN monitor_sources ms ON ms.id=m.source_id JOIN sources s ON s.id=ms.source_id WHERE '''+' AND '.join(clauses)
        with self.store.connect() as db:
            total=db.execute('SELECT COUNT(*)'+joins,args).fetchone()[0]
            rows=[dict(r) for r in db.execute('''SELECT m.id item_id,m.source_id,m.first_seen,m.last_seen,a.title,a.summary,a.url,
                a.event_id,m.published_at,e.bookmarked,e.is_read,s.name source_name,ms.mode'''+joins+
                ' ORDER BY COALESCE(m.published_at,m.first_seen) DESC,m.id LIMIT ? OFFSET ?',(*args,limit,(page-1)*limit))]
            revision=db.execute('SELECT COALESCE(MAX(id),0) FROM monitor_snapshots').fetchone()[0]
        return dict(items=rows,total=total,page=page,limit=limit,revision=revision)

    @staticmethod
    def matches(rule, row):
        text = (row['title']+' '+row['summary']).casefold()
        return (not rule['sources'] or row['source_id'] in rule['sources']) and any(w.casefold() in text for w in rule['keywords']) and not any(w.casefold() in text for w in rule['excludes'])

    def history(self, source='', q='', start='', end='', page=1, limit=30, item='', snapshot=None, category=''):
        with self.store.connect() as db:
            if item:
                rows = self._rows(db, 'x.item_id=?', (item,), limit=500)
                source_row = db.execute('SELECT source_id FROM monitor_items WHERE id=?', (item,)).fetchone()
                failures = [dict(r) for r in db.execute("SELECT * FROM monitor_runs WHERE source_id=? AND state='error' ORDER BY checked_at DESC LIMIT 50", (source_row[0],))] if source_row else []
                return dict(items=rows,failures=failures)
            if snapshot:
                return dict(items=self._rows(db,'x.snapshot_id=?',(snapshot,)))
            clauses, args = ['1=1'], []
            if source: clauses.append('p.source_id=?'); args.append(source)
            if category:
                clauses.append('EXISTS(SELECT 1 FROM monitor_sources m WHERE m.id=p.source_id AND m.category=?)'); args.append(category)
            if start: clauses.append('p.fetched_at>=?'); args.append(timestamp(start+'T00:00:00+08:00'))
            if end: clauses.append('p.fetched_at<=?'); args.append(timestamp(end+'T23:59:59+08:00'))
            if q:
                clauses.append("EXISTS(SELECT 1 FROM monitor_snapshot_items i WHERE i.snapshot_id=p.id AND instr(lower(i.title),lower(?))>0)"); args.append(q)
            where=' AND '.join(clauses)
            total=db.execute('SELECT COUNT(*) FROM monitor_snapshots p WHERE '+where,args).fetchone()[0]
            rows=[dict(r) for r in db.execute('''SELECT p.*,s.name source_name,
                (SELECT COUNT(*) FROM monitor_snapshot_items WHERE snapshot_id=p.id AND change!='left') item_count
                FROM monitor_snapshots p JOIN monitor_sources m ON m.id=p.source_id JOIN sources s ON s.id=m.source_id
                WHERE '''+where+' ORDER BY p.id DESC LIMIT ? OFFSET ?',(*args,limit,(page-1)*limit))]
            revision=db.execute('SELECT COALESCE(MAX(id),0) FROM monitor_snapshots').fetchone()[0]
            return dict(items=rows,total=total,page=page,limit=limit,revision=revision)

    def watches(self):
        with self.store.connect() as db:
            rows = [dict(r) for r in db.execute('SELECT * FROM monitor_watches ORDER BY created_at,id')]
        for row in rows:
            for key in ('keywords','excludes','sources'): row[key]=json.loads(row[key])
        return rows

    def save_watch(self, values, wid=None):
        wid = wid or identity('watch',values['name'],datetime.now().isoformat())
        values = {**values, **{k:json.dumps(values.get(k,[]),ensure_ascii=False) for k in ('keywords','excludes','sources')}}
        with self.store.connect() as db:
            db.execute('''INSERT INTO monitor_watches VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
                name=excluded.name,keywords=excluded.keywords,excludes=excluded.excludes,sources=excluded.sources,
                enabled=excluded.enabled,rise_threshold=excluded.rise_threshold''',
                (wid,values['name'],values['keywords'],values['excludes'],values['sources'],values.get('enabled',True),values.get('rise_threshold',5),now()))
        return next(r for r in self.watches() if r['id']==wid)

    def alerts(self, page=1, limit=40):
        with self.store.connect() as db:
            rows=[dict(r) for r in db.execute('''SELECT z.*,w.name watch_name,m.source_id,a.event_id,s.name source_name
                FROM monitor_alerts z JOIN monitor_watches w ON w.id=z.watch_id JOIN monitor_items m ON m.id=z.item_id
                JOIN articles a ON a.id=m.article_id JOIN monitor_sources ms ON ms.id=m.source_id
                JOIN sources s ON s.id=ms.source_id ORDER BY z.id DESC LIMIT ? OFFSET ?''',(limit,(page-1)*limit))]
            total, unread=db.execute('SELECT COUNT(*),COALESCE(SUM(1-is_read),0) FROM monitor_alerts').fetchone()
            return dict(items=rows,total=total,unread=unread,page=page,limit=limit)

    def cleanup(self):
        cutoff=later(now(),-86400*self.store.settings().get('monitor_retention_days',30))
        with self.store.connect() as db:
            db.execute('DELETE FROM monitor_alerts WHERE created_at<?',(cutoff,))
            db.execute('DELETE FROM monitor_runs WHERE checked_at<?',(cutoff,))
            # Keep one last-known sample for disabled or long-unavailable sources.
            db.execute('DELETE FROM monitor_snapshots WHERE fetched_at<? AND id NOT IN (SELECT snapshot_id FROM monitor_sources WHERE snapshot_id IS NOT NULL)',(cutoff,))
