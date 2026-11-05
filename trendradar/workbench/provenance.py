"""Publisher identity and delivery channel are separate from editable labels."""
from urllib.parse import urlsplit
from .defaults import FEEDS

LABELS = {'official': '机构官方', 'media': '媒体报道', 'personal': '个人博客',
          'community': '社区讨论', 'academic': '学术论文', 'aggregator': '热榜聚合',
          'unverified': '自定义来源'}
KNOWN = {'openai': 'official', 'huggingface': 'official', 'deepmind': 'official',
         'google-research': 'official', 'qbitai': 'media', 'infoq': 'media',
         'techcrunch-ai': 'media', 'ruanyifeng': 'personal', 'hacker-news': 'community',
         'reddit-localllama': 'community', 'reddit-ml': 'community',
         'reddit-artificial': 'community', 'arxiv-ai': 'academic', 'sspai': 'media',
         'yahoo-finance': 'media', 'jiqizhixin': 'media', '36kr': 'media'}
FEED_URLS = {item[0]: item[2] for item in FEEDS}


def source_identity(source):
    sid, kind = source['id'], source['kind']
    publisher, delivery, channel = 'unverified', 'custom_rss', '自定义 RSS · 身份未核验'
    if kind == 'hotlist':
        publisher, delivery, channel = 'aggregator', 'aggregator_api', 'NewsNow 第三方聚合'
        from .monitor_catalog import CATALOG
        if sid in {r[0] if r[6] else 'newsnow:'+r[0] for r in CATALOG}:
            publisher,delivery,channel='aggregator','local_newsnow','NewsNow 本地适配器 · 网页/公开端点'
            upstream=sid.removeprefix('newsnow:')
            if upstream in {'thepaper','ifeng','wallstreetcn-hot','wallstreetcn-quick','cls-hot','cls-telegraph','36kr-quick','ithome','sspai','jin10','gelonghui','tencent-hot'}:
                publisher='media'
            elif upstream in {'weibo','zhihu','tieba','v2ex-share','coolapk','juejin','nowcoder','hupu'}:
                publisher='community'
    elif kind == 'x':
        publisher, delivery, channel = 'community', 'unconfigured', '尚未接入'
    elif sid in KNOWN:
        actual, expected = urlsplit(source.get('url', '')), urlsplit(FEED_URLS[sid])
        # A changed feed address cannot inherit an official publisher badge.
        if actual.scheme == 'https' and actual.hostname == expected.hostname and actual.path == expected.path:
            publisher, delivery, channel = KNOWN[sid], 'direct_rss', '网站直连 RSS'
            if sid == 'hacker-news':
                delivery, channel = 'third_party_rss', 'hnrss 第三方 RSS'
    return dict(publisher_type=publisher, publisher_label=LABELS[publisher],
                delivery_type=delivery, delivery_label=channel)
