"""Bounded RSS/Atom/JSON Feed fetches with conditional requests and backoff."""
import ipaddress
import json
import socket
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import urljoin, urlsplit

import feedparser
import requests

from trendradar.crawler.rss.parser import RSSParser
from .util import now


class FeedError(ValueError):
    def __init__(self, message, retry_after=0):
        super().__init__(message)
        self.retry_after = retry_after


def validate_url(url, resolve=False):
    try:
        parsed = urlsplit(url)
        if parsed.scheme not in {'https', 'http'} or not parsed.hostname or parsed.username or parsed.password or parsed.port not in {None, 80, 443}:
            raise ValueError()
        host = parsed.hostname.lower()
        if host == 'localhost' or host.endswith(('.local', '.localhost', '.internal')):
            raise ValueError()
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            address = None
        if address is not None and not address.is_global:
            raise ValueError()
        if resolve:
            addresses = socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == 'https' else 80), type=socket.SOCK_STREAM)
            if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
                raise ValueError()
    except (ValueError, OSError):
        raise FeedError('请输入可公开访问的 HTTP(S) 订阅地址') from None
    return url


def parse_feed(content, url):
    stripped = content.lstrip()
    valid = False
    if stripped.startswith('{'):
        try:
            data = json.loads(content)
            valid = str(data.get('version', '')).startswith('https://jsonfeed.org/version/') and isinstance(data.get('items'), list)
        except (ValueError, AttributeError):
            pass
    else:
        parsed = feedparser.parse(content)
        valid = bool(parsed.get('version'))
    if not valid:
        raise FeedError('返回内容不是有效 RSS / Atom / JSON Feed（可能是网页）')
    return RSSParser(max_summary_length=6000).parse(content, url)


def retry_seconds(value):
    try:
        return max(0, int(value))
    except (ValueError, TypeError):
        try:
            return max(0, int((parsedate_to_datetime(value)-datetime.now(timezone.utc)).total_seconds()))
        except (ValueError, TypeError):
            return 0


def fetch_feed(source, conditional=True, session=None):
    session = session or requests.Session()
    headers = {'User-Agent': 'AITrendRadar/1.0 RSS Reader', 'Accept': 'application/rss+xml, application/atom+xml, application/feed+json, application/xml;q=0.9'}
    if conditional and source.get('etag'): headers['If-None-Match'] = source['etag']
    if conditional and source.get('modified'): headers['If-Modified-Since'] = source['modified']
    url = source['url']
    try:
        for _ in range(6):
            validate_url(url, resolve=True)
            with session.get(url, headers=headers, timeout=(6, 25), allow_redirects=False, stream=True) as response:
                if response.status_code in {301,302,303,307,308}:
                    url = urljoin(url, response.headers.get('Location',''))
                    continue
                if response.status_code == 304:
                    return [], dict(unchanged=True, etag=source.get('etag'), modified=source.get('modified'))
                if response.status_code >= 400:
                    raise FeedError(f'HTTP {response.status_code}', retry_seconds(response.headers.get('Retry-After')))
                chunks, size = [], 0
                for chunk in response.iter_content(65536):
                    size += len(chunk)
                    if size > 8*1024*1024: raise FeedError('订阅内容超过 8 MB 限制')
                    chunks.append(chunk)
                content = b''.join(chunks).decode(response.encoding if response.encoding and response.encoding.lower() != 'iso-8859-1' else 'utf-8', errors='replace')
                items = parse_feed(content, url)
                return items, dict(unchanged=False, etag=response.headers.get('ETag'), modified=response.headers.get('Last-Modified'))
        raise FeedError('订阅重定向次数过多')
    except requests.Timeout:
        raise FeedError('连接或读取超时') from None
    except requests.RequestException:
        # Request exceptions can contain proxy credentials; never persist their repr.
        raise FeedError('网络连接失败') from None


def record_health(store, sid, count=0, metadata=None, error=None):
    source = store.source(sid)
    failures = source['failures']+1 if error else 0
    wait = max(min(24*3600, 300*(2**min(failures,8))), getattr(error,'retry_after',0)) if error else 0
    with store.connect() as db:
        db.execute('UPDATE sources SET status=?,last_checked=?,error=?,failures=?,next_retry=?,item_count=? WHERE id=?',
                   ('error' if error else ('empty' if count==0 and not (metadata or {}).get('unchanged') else 'ok'), now(), str(error) if isinstance(error, FeedError) else ('采集失败' if error else ''), failures,
                    (datetime.now(timezone.utc)+timedelta(seconds=wait)).isoformat(timespec='seconds') if wait else None,
                    source['item_count'] if (metadata or {}).get('unchanged') else count, sid))
        if not error:
            db.execute('UPDATE sources SET last_success=?,etag=?,modified=? WHERE id=?', (now(), (metadata or {}).get('etag'), (metadata or {}).get('modified'), sid))
