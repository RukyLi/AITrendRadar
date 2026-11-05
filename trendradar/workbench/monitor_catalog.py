"""Complete pinned NewsNow catalog; canonical channels only, no redirect duplicates."""
import json
from pathlib import Path

REVISION = '0560c993b226cd2fd07d8a79875d50551f52c584'
CATEGORIES = ('国内', '国际', '科技', '财经', '体育')
LEGACY = ('weibo', 'zhihu', 'baidu', 'toutiao', 'thepaper', 'ifeng', 'douyin', 'tieba',
          'bilibili-hot-search', 'wallstreetcn-hot', 'cls-hot')
DEFAULT_FOLLOWED = LEGACY + ('wallstreetcn-quick', 'cls-telegraph', '36kr-quick', 'ithome')
CHANNELS = json.loads(Path(__file__).with_name('newsnow_catalog.json').read_text())
# Keep the original tuple contract used by compatibility callers.
CATALOG = [(s['id'], s['name'] + (' · ' + s['title'] if s['title'] else ''), s['category'],
            s['mode'], s['interval_seconds'], True, s['id'] in LEGACY) for s in CHANNELS]
CATALOG.sort(key=lambda s: DEFAULT_FOLLOWED.index(s[0]) if s[0] in DEFAULT_FOLLOWED else len(DEFAULT_FOLLOWED))
SETTINGS = {'monitor_enabled': True, 'monitor_retention_days': 30}


def seed(db):
    from .util import now
    db.execute("INSERT OR IGNORE INTO settings VALUES('_monitor_started_at',?)", (json.dumps(now()),))
    position = db.execute('SELECT COALESCE(MAX(position),-1)+1 FROM monitor_sources').fetchone()[0]
    for upstream, name, category, mode, interval, enabled, legacy in CATALOG:
        sid = upstream if legacy else 'newsnow:' + upstream
        db.execute("INSERT OR IGNORE INTO sources(id,name,kind,category,enabled,metadata) VALUES(?,?,'hotlist',?,?,?)",
                   (sid, name, category, int(enabled), json.dumps({'newsnow_id': upstream, 'monitor': True})))
        inserted = db.execute('INSERT OR IGNORE INTO monitor_sources(id,source_id,mode,category,interval_seconds,subscribed,position) VALUES(?,?,?,?,?,?,?)',
                             (upstream, sid, mode, category, interval, int(upstream in DEFAULT_FOLLOWED), position)).rowcount
        position += inserted
        # Catalog metadata can change; user preferences, identity and order must survive.
        db.execute('UPDATE monitor_sources SET mode=?,category=?,interval_seconds=? WHERE id=?', (mode,category,interval,upstream))
        db.execute('UPDATE sources SET name=?,category=? WHERE id=?', (name,category,sid))
    for key, value in SETTINGS.items():
        db.execute('INSERT OR IGNORE INTO settings VALUES(?,?)', (key, json.dumps(value)))
