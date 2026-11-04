import json
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from trendradar.workbench.api import create_app
from trendradar.workbench.feeds import FeedError, fetch_feed, parse_feed, record_health, validate_url
from trendradar.workbench.intelligence import Intelligence
from trendradar.workbench.store import Store
from trendradar.workbench.util import canonical_url, plain, now
from trendradar.workbench.worker import Worker


@pytest.fixture
def store(tmp_path):
    store=Store(tmp_path)
    store.initialize()
    return store


def article(store,title='GLM 5.3 发布，支持 AI 编程',sid='qbitai',url='https://example.com/news/1',**extra):
    return store.ingest(dict(source_id=sid,title=title,url=url,summary='模型官方发布说明。',**extra))[0]


def test_stable_ids_state_and_repeat_import(store):
    eid=article(store)
    store.state(eid,{'bookmarked':True,'is_read':True})
    again=article(store,observed_at=(datetime.now(timezone.utc)+timedelta(days=1)).isoformat())
    assert eid==again
    assert store.meta()['articles']==1
    assert store.event(eid)['bookmarked']==1
    assert store.event(eid)['is_read']==1
    assert len(store.events(view='library',q='AI')['items'])==1
    assert len(store.events(view='library',q='模型官方')['items'])==1
    assert store.events(view='library',q='AI%')['total']==0


def test_exact_duplicate_groups_sources_versions_stay_separate(store):
    eid=article(store)
    second=article(store,sid='hacker-news',url='https://news.ycombinator.com/item?id=123')
    assert second==eid
    assert store.event(eid)['source_count']==2
    different=article(store,title='GLM 5.2 发布，支持 AI 编程',url='https://example.com/news/2')
    assert eid!=different
    assert not Intelligence.compatible_versions('GLM-5.2 is out','GLM 5.3 is out')
    assert not Intelligence.compatible_versions('DeepSeek V4.1 released','DeepSeek V4.2 released')
    assert not Intelligence.compatible_versions('Claude Opus 4.8','Claude Opus 4.9')


def test_urls_and_untrusted_html(store):
    assert canonical_url('javascript:alert(1)')==''
    assert canonical_url('https://example.com/a?utm_source=x&id=3#top')=='https://example.com/a?id=3'
    assert plain('<script>alert(1)</script><p>hello <b>AI</b></p>')=='hello AI'
    article(store,title='无链接 A',url='')
    article(store,title='无链接 B',url='')
    assert store.meta()['articles']==2


def test_hotlist_dynamic_urls_match_legacy_archive(store):
    with store.connect() as db:
        db.execute("INSERT INTO sources(id,name,kind) VALUES('weibo','微博','hotlist')")
    first=article(store,sid='weibo',url='https://s.weibo.com/weibo?q=AI&band_rank=3&Refer=top&t=31')
    second=article(store,sid='weibo',url='https://s.weibo.com/weibo?q=AI')
    third=article(store,sid='weibo',url='https://s.weibo.com/weibo?q=AI&band_rank=1')
    assert first==second==third
    assert store.meta()['articles']==1


def test_topic_edit_reindexes_history(store):
    eid=article(store,title='Rust language release')
    topic=store.save_topic(dict(name='Rust',keywords='rust',color='#123456'))
    assert store.events(view='library',topic=topic['id'])['total']==1
    store.save_topic(dict(keywords='notmatching'),topic['id'])
    assert store.events(view='library',topic=topic['id'])['total']==0
    assert store.event(eid)


def test_job_dedup_and_recovery(store):
    one=store.enqueue('update');two=store.enqueue('update')
    assert one['id']==two['id']
    assert store.claim()['id']==one['id']
    assert store.claim() is None
    Worker(store,{'AI':{'MODEL':'test/model'}}).recover()
    assert store.jobs(one['id'])['status']=='queued'
    assert store.claim()['id']==one['id']
    store.progress(one['id'],'done',100,status='completed')
    assert store.enqueue('update')['id']!=one['id']


@pytest.mark.parametrize('url',['http://localhost/feed','http://127.0.0.1/feed','http://169.254.169.254/latest','file:///etc/passwd','https://user:password@example.com/feed','https://example.com:8888/feed'])
def test_reject_nonpublic_feed(url):
    with pytest.raises(FeedError):validate_url(url)


def test_feed_validation_empty_and_json():
    with pytest.raises(FeedError):parse_feed('<html><body>not rss</body></html>','https://example.com')
    assert parse_feed('<?xml version="1.0"?><rss version="2.0"><channel><title>Empty</title></channel></rss>','https://example.com')==[]
    values=parse_feed(json.dumps({'version':'https://jsonfeed.org/version/1.1','title':'AI','items':[{'id':'1','url':'https://example.com/1','title':'AI news','content_text':'test'}]}),'https://example.com')
    assert values[0].title=='AI news'


def test_conditional_request_and_429(store,monkeypatch):
    monkeypatch.setattr('trendradar.workbench.feeds.validate_url',lambda u,resolve=False:u)
    class Response:
        status_code=304
        headers={}
        def __enter__(self):return self
        def __exit__(self,*args):pass
    class Session:
        def get(self,url,**kwargs):
            assert kwargs['headers']['If-None-Match']=='tag'
            return Response()
    source={**store.source('qbitai'),'etag':'tag'}
    items,metadata=fetch_feed(source,session=Session())
    assert metadata['unchanged'] and not items
    record_health(store,'qbitai',error=FeedError('HTTP 429',3600))
    result=store.source('qbitai')
    assert result['status']=='error' and result['failures']==1
    assert datetime.fromisoformat(result['next_retry'])>datetime.now(timezone.utc)+timedelta(minutes=59)


class FakeAI:
    def __init__(self,invalid=False):self.calls=0;self.invalid=invalid
    def chat(self,messages,**kwargs):
        self.calls+=1
        payload=json.loads(messages[-1]['content'])
        if isinstance(payload,dict) and 'events' in payload:
            return json.dumps({'results':[dict(event_id=e['event_id'],verdict='relevant',confidence=.95,reason='材料明确涉及大模型技术',source_ids=[e['articles'][0]['id']],canonical_title=e['articles'][0]['title'],entities=['GLM'],action='release',topic_ids=['models']) for e in payload['events']]})
        aid='invented' if self.invalid else payload[0]['id']
        return json.dumps(dict(title_zh='模型发布',summary_zh='模型发布说明',why_it_matters='有助于开发者评估。',points=[dict(text='官方已发布',source_ids=[aid])],source_ids=[aid],limitations='仅依据摘要'))


def test_ai_citations_and_cache(store):
    eid=article(store);client=FakeAI();engine=Intelligence(store,{'MODEL':'test/model'},client)
    assert engine.analyze(eid)
    assert engine.analyze(eid)
    assert client.calls==1
    assert store.event(eid)['analysis']['source_ids']
    assert store.events(view='library',q='test/model')['total']==0  # Model metadata is not news content.
    with store.connect() as db:db.execute("UPDATE events SET ai_status='pending',analysis=NULL WHERE id=?",(eid,))
    assert engine.analyze(eid) and client.calls==1


def test_invalid_citation_fails_without_poisoning_cache(store):
    eid=article(store);engine=Intelligence(store,{'MODEL':'test/model'},FakeAI(invalid=True))
    assert not engine.analyze(eid)
    assert store.event(eid)['ai_status']=='error'
    with store.connect() as db:assert db.execute('SELECT count(*) FROM ai_cache').fetchone()[0]==0
    assert store.events(view='library')['total']==1


def test_merge_preserves_bookmark_and_old_link(store):
    a=article(store)
    b=article(store,title='GLM 5.3 new release',sid='hacker-news',url='https://example.com/other')
    store.state(b,{'bookmarked':True})
    engine=Intelligence(store,{'MODEL':'test/model'},FakeAI())
    assert engine.merge(a,b)==1
    assert store.event(a)['bookmarked']==1 and store.event(b)['bookmarked']==1
    assert store.meta()['events']==1 and store.meta()['articles']==2


def test_archive_import_keeps_original_dates_and_is_idempotent(store):
    folder=store.root/'output/news';folder.mkdir(parents=True)
    db=sqlite3.connect(folder/'2025-12-21.db')
    schema=Path('trendradar/storage/schema.sql').read_text();db.executescript(schema)
    db.execute("INSERT INTO platforms(id,name) VALUES('test','Test')")
    db.execute("INSERT INTO news_items(title,platform_id,rank,url,first_crawl_time,last_crawl_time) VALUES('GLM 发布','test',1,'https://example.com/1','00-46','17-41')")
    db.commit();db.close()
    assert store.import_archives()==1
    assert store.import_archives()==0
    event=store.events(view='library')['items'][0]
    assert event['updated_at'].startswith('2025-12-20T16:46')
    assert event['ai_status']=='pending'


def test_api_state_jobs_source_validation_and_no_secrets(store):
    eid=article(store)
    Intelligence(store,{'MODEL':'test/model'},FakeAI()).curation.review([eid])
    with TestClient(create_app(store.root,store)) as client:
        assert client.get('/api/v1/health').status_code==200
        assert client.get('/api/v1/events?q=AI').json()['total']==1
        assert client.patch('/api/v1/events/'+eid+'/state',json={'bookmarked':True}).json()['bookmarked']==1
        assert client.post('/api/v1/jobs',json={'kind':'update'}).json()['id']==client.post('/api/v1/jobs',json={'kind':'update'}).json()['id']
        assert client.post('/api/v1/sources',json={'name':'bad','url':'http://127.0.0.1'}).status_code==422
        assert client.patch('/api/v1/settings',json={'api_key':'secret'}).status_code==422
        assert client.patch('/api/v1/settings',json={'interval_minutes':0}).status_code==422
        assert client.patch('/api/v1/settings',json={'ai_enabled':False},headers={'Origin':'https://evil.example'}).status_code==403
        assert client.patch('/api/v1/sources/x',json={'enabled':True}).status_code==409
        assert client.get('/api/v1/events?limit=1000').status_code==422
        assert 'api_key' not in client.get('/api/v1/settings').text.lower()
        assert client.get('/api/v1/does-not-exist').status_code==404


def test_partial_source_failure_and_archive_reuse(store,monkeypatch):
    from trendradar.crawler.rss.parser import ParsedRSSItem
    with store.connect() as db:db.execute("UPDATE sources SET enabled=(id IN ('qbitai','hacker-news'))")
    store.set_settings({'ai_enabled':False})
    worker=Worker(store,{'AI':{'MODEL':'test/model'}})
    def collect(source):
        if source['id']=='hacker-news':raise FeedError('HTTP 404')
        return {'kind':'rss','items':[ParsedRSSItem('GLM 5.3 release','https://example.com/release',published_at=now(),summary='AI model release')],'metadata':{}}
    monkeypatch.setattr(worker,'collect_one',collect)
    job=store.enqueue('update');worker.execute(store.claim())
    result=store.jobs(job['id'])
    assert result['status']=='partial'
    assert result['result']['successful_sources']==1
    assert result['result']['failed_sources']==1
    assert store.meta()['events']==1
    assert list((store.root/'output/rss').glob('*.db'))
    store.import_archives()
    assert store.meta()['events']==1
    assert list((store.root/'output/html/workbench').glob('*.html'))


def test_brief_history_without_ai(store):
    eid=article(store)
    engine=Intelligence(store,{'MODEL':'test/model'},FakeAI())
    engine.curation.review([eid])
    a=engine.brief(use_ai=False);b=engine.brief(use_ai=False)
    assert a!=b
    assert store.briefs(a)['version']==1
    assert store.briefs(b)['version']==2
    assert store.briefs(b)['content']['items'][0]['id']


def test_workbench_config_shared_with_legacy_and_mcp(store):
    import yaml
    from trendradar.workbench.compat import apply_source_overrides
    from mcp_server.services.parser_service import ParserService
    config_dir=store.root/'config';config_dir.mkdir()
    (config_dir/'config.yaml').write_text(yaml.safe_dump({'rss':{'enabled':True,'feeds':[]},'platforms':{'sources':[]}}))
    store.save_source({'enabled':False},'qbitai')
    values=apply_source_overrides({},store.root)
    assert next(s for s in values['rss']['feeds'] if s['id']=='qbitai')['enabled'] is False
    assert values['workbench']['settings']['interval_minutes']==60
    assert len(values['workbench']['topics'])==5
    parsed=ParserService(str(store.root)).parse_yaml_config()
    assert parsed['rss']['feeds']==values['rss']['feeds']


def test_source_test_does_not_advance_collection_validator(store,monkeypatch):
    from trendradar.crawler.rss.parser import ParsedRSSItem
    monkeypatch.setattr('trendradar.workbench.worker.fetch_feed',lambda *a,**k:([ParsedRSSItem('News','https://example.com/1')],{'etag':'unconsumed','modified':'today'}))
    worker=Worker(store,{'AI':{'MODEL':'test/model'}})
    job=store.enqueue('source_test','qbitai');worker.execute(store.claim())
    assert store.jobs(job['id'])['status']=='completed'
    assert store.source('qbitai')['etag'] is None
    assert store.meta()['articles']==0


def test_changed_content_invalidates_ai_and_triggers_update_indicator(store):
    eid=article(store)
    engine=Intelligence(store,{'MODEL':'test/model'},FakeAI())
    assert engine.analyze(eid)
    tomorrow=(datetime.now(timezone.utc)+timedelta(days=1)).isoformat()
    store.ingest(dict(source_id='qbitai',title='GLM 5.3 发布，支持 AI 编程',url='https://example.com/news/1',summary='新发布说明',observed_at=tomorrow))
    assert store.event(eid)['ai_status']=='pending'
    assert store.event(eid)['analysis'] is None
    assert store.events(view='library',since=now())['total']==1


def test_ai_failure_keeps_existing_events_and_brief_usable(store):
    class Down:
        def chat(self,*args,**kwargs):raise TimeoutError('sensitive-provider-debug')
    eid=article(store)
    Intelligence(store,{'MODEL':'test/model'},FakeAI()).curation.review([eid])
    engine=Intelligence(store,{'MODEL':'test/model'},Down())
    assert not engine.analyze(eid)
    bid=engine.brief()
    assert store.briefs(bid)['status']=='excerpt'
    assert 'sensitive-provider-debug' not in json.dumps(store.event(eid))
    assert store.events(view='library',q='AI')['total']==1
