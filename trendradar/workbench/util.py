import hashlib
import html
import os
import re
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def timestamp(value, fallback=None):
    try:
        date = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if not date.tzinfo:
            from zoneinfo import ZoneInfo
            date = date.replace(tzinfo=ZoneInfo("Asia/Shanghai"))
        return date.astimezone(timezone.utc).isoformat(timespec="seconds")
    except (ValueError, TypeError):
        return fallback or now()


def identity(*parts):
    return hashlib.sha256("\x1f".join(str(p) for p in parts).encode()).hexdigest()[:24]


class TextOnly(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts, self.hidden = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "iframe"}:
            self.hidden += 1
        if tag in {"br", "p", "div", "li"}:
            self.parts.append(" ")

    def handle_endtag(self, tag):
        if tag in {"script", "style", "iframe"} and self.hidden:
            self.hidden -= 1

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def plain(value, limit=6000):
    parser = TextOnly()
    parser.feed(str(value or ""))
    return re.sub(r"\s+", " ", html.unescape(" ".join(parser.parts))).strip()[:limit]


def canonical_url(url, source_id=''):
    try:
        from trendradar.utils.url import normalize_url
        url = normalize_url(str(url or ''), source_id)
        p = urlsplit(str(url or ""))
        if p.scheme not in {"http", "https"} or not p.hostname or p.username or p.password:
            return ""
        query = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True)
                 if not k.lower().startswith("utm_") and k.lower() not in {"fbclid", "gclid"}]
        return urlunsplit((p.scheme.lower(), p.netloc.lower(), p.path or "/", urlencode(sorted(query)), ""))
    except ValueError:
        return ""


def title_key(title):
    # Keep version punctuation and numbers: GLM 5.2 and GLM 5.3 must stay separate.
    return re.sub(r"\s+", " ", title.lower()).strip()


def db_path(root):
    return Path(os.getenv("RADAR_DB", str(Path(root) / "output/workbench.sqlite3"))).resolve()
