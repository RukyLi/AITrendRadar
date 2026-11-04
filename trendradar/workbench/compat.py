"""Read-only bridge for CLI/MCP configuration; never creates a database."""
import json
import sqlite3

from .util import db_path


def apply_source_overrides(config, root):
    path = db_path(root)
    if not path.exists():
        return config
    connection = sqlite3.connect(f'file:{path}?mode=ro', uri=True, timeout=10)
    connection.row_factory = sqlite3.Row
    try:
        rows = connection.execute('SELECT * FROM sources').fetchall()
        config.setdefault('rss', {})['feeds'] = [dict(id=r['id'], name=r['name'], url=r['url'], enabled=bool(r['enabled'])) for r in rows if r['kind'] == 'rss']
        config.setdefault('platforms', {})['sources'] = [{**json.loads(r['metadata']), 'id':r['id'], 'name':r['name'], 'enabled':bool(r['enabled'])} for r in rows if r['kind'] == 'hotlist']
        config['workbench'] = {
            'topics': [dict(r) for r in connection.execute('SELECT * FROM topics')],
            'settings': {r['key']: json.loads(r['value']) for r in connection.execute("SELECT * FROM settings WHERE key NOT LIKE '\\_%' ESCAPE '\\'")},
        }
    except sqlite3.OperationalError:
        pass  # Migration may not yet have run; existing commands remain usable.
    finally:
        connection.close()
    return config
