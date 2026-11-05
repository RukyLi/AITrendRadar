import json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from trendradar.workbench.api import create_app
from trendradar.workbench.monitor import Monitor, instant
from trendradar.workbench.monitor_worker import MonitorWorker
from trendradar.workbench.store import Store
from trendradar.workbench.worker import Worker

BASE = datetime(2026, 11, 5, tzinfo=timezone.utc)


@pytest.fixture
def monitor(tmp_path):
    store=Store(tmp_path)
    store.initialize()
    return Monitor(store)


def payload(ids, tick=0, sid='baidu', **extra):
    return dict(id=sid,status='success',fetchedAt=int((BASE+timedelta(minutes=tick)).timestamp()*1000),servedFromCache=False,
        items=[dict(id=str(i),title=f'新闻 {i}',url=f'https://example.com/{i}') for i in ids],**extra)


def record(monitor, ids, tick=0, sid='baidu', data=None):
    return monitor.record(sid,data or payload(ids,tick,sid),checked_at=(BASE+timedelta(minutes=tick)).isoformat(timespec='seconds'))


def test_catalog_migration_preserves_preferences(monitor):
    assert len(monitor.sources())==52
    assert sum(s['enabled'] for s in monitor.sources())==52
    assert monitor.source('sspai')['source_id']=='newsnow:sspai'
    assert monitor.store.source('sspai')['kind']=='rss'
    monitor.configure('baidu',{'enabled':False,'subscribed':False})
    monitor.store.initialize()
    assert not monitor.source('baidu')['enabled']
    assert not monitor.source('baidu')['subscribed']


def test_full_catalog_matches_canonical_upstream_and_keeps_order(monitor):
    from collections import Counter
    from pathlib import Path
    upstream=json.loads((Path(__file__).resolve().parents[2]/'vendor/newsnow/shared/sources.json').read_text())
    expected={k for k,v in upstream.items() if not v.get('redirect') and v.get('disable') is not True}
    sources=monitor.sources()
    assert {s['id'] for s in sources}==expected
    assert Counter(s['category'] for s in sources)=={'国内':20,'国际':5,'科技':13,'财经':12,'体育':2}
    assert Counter(s['mode'] for s in sources)=={'hottest':31,'realtime':21}
    assert sum(s['subscribed'] for s in sources)==15
    assert monitor.source('github-trending-today')['source_id']=='newsnow:github-trending-today'
    order=[s['id'] for s in sources][::-1]
    monitor.reorder(order)
    monitor.configure('v2ex-share',{'subscribed':True,'enabled':False})
    monitor.store.initialize()
    assert [s['id'] for s in monitor.sources()]==order
    assert monitor.source('v2ex-share')['subscribed'] and not monitor.source('v2ex-share')['enabled']


def test_unavailable_and_paused_channels_remain_discoverable(monitor):
    record(monitor,[1],sid='coolapk')
    monitor.record('coolapk',dict(fetchError='源站 HTTP 429：请求被限流',fetchErrorCode='rate_limited'))
    monitor.configure('coolapk',{'enabled':False,'subscribed':True})
    client=TestClient(create_app(monitor.store.root,monitor.store))
    all_channels=client.get('/api/v1/monitor/boards?mode=&subscribed=false&include_disabled=true').json()['items']
    assert len(all_channels)==52
    channel=next(s for s in all_channels if s['id']=='coolapk')
    assert channel['availability_label']=='限流中'
    assert len(channel['items'])==1 and not channel['enabled']
    assert client.get('/api/v1/monitor/boards?source=coolapk&subscribed=false').json()['items']==[]
    record(monitor,[1,2],10,sid='coolapk')
    assert monitor.source('coolapk')['availability']=='ok'
    assert monitor.source('coolapk')['error_code']==''


def test_plain_titles_keep_ampersands_while_removing_html():
    from trendradar.workbench.util import plain
    assert plain('得分&篮板均创生涯新高')=='得分&篮板均创生涯新高'
    assert plain('PV&国服全新PVP事件预告')=='PV&国服全新PVP事件预告'
    assert plain('<b>A&amp;B</b><script>secret()</script> C&D')=='A&B C&D'


def test_valid_warm_cache_seeds_only_first_baseline(monitor):
    data=payload([1,2],sid='bilibili-hot-video')
    data.update(status='cache',servedFromCache=True)
    first=record(monitor,[1,2],sid='bilibili-hot-video',data=data)
    assert first['status']=='cache' and first['snapshot_id']
    rows=monitor.history(snapshot=first['snapshot_id'])['items']
    assert all(r['from_cache']==1 and r['change']=='baseline' for r in rows)
    data['items']=data['items'][:1]
    assert record(monitor,[1],sid='bilibili-hot-video',data=data)['snapshot_id'] is None
    assert len(monitor.boards(source='bilibili-hot-video',subscribed=False)['items'][0]['items'])==2
    assert monitor.alerts()['total']==0
    result=record(monitor,[2,1],10,sid='bilibili-hot-video')
    assert all(not r['from_cache'] for r in monitor.history(snapshot=result['snapshot_id'])['items'])
    data.update(id='weibo',fetchError='源站 HTTP 403',fetchErrorCode='restricted')
    assert record(monitor,[1],sid='weibo',data=data)['snapshot_id'] is None


def test_explicit_test_retries_old_failure_but_obeys_minimum(monitor,monkeypatch):
    from trendradar.workbench.util import now
    from trendradar.workbench.monitor import later
    monitor.record('weibo',error='源站 HTTP 403',error_code='restricted',checked_at=later(now(),-130))
    with monitor.store.connect() as db:
        db.execute('UPDATE monitor_sources SET next_due=? WHERE id=?',(later(now(),3600),'weibo'))
    worker=MonitorWorker(monitor.store);calls=[]
    def collect(source):
        calls.append(source['id'])
        return monitor.record(source['id'],error='源站 HTTP 403',error_code='restricted')
    monkeypatch.setattr(worker,'collect_one',collect)
    worker.execute(monitor.store.enqueue('monitor_test','weibo'))
    worker.execute(monitor.store.enqueue('monitor_test','weibo'))
    assert calls==['weibo']


def test_baseline_delta_left_returned_and_no_duplicate_articles(monitor):
    record(monitor,[1,2,3])
    first=monitor.boards(source='baidu')['items'][0]['items']
    assert {i['change'] for i in first}=={'baseline'}
    monitor.store.state(first[0]['event_id'],{'bookmarked':True,'is_read':True})
    result=record(monitor,[3,1,4],10)
    rows=monitor.history(snapshot=result['snapshot_id'])['items']
    by_title={r['title']:r for r in rows}
    assert by_title['新闻 3']['delta']==2 and by_title['新闻 3']['change']=='up'
    assert by_title['新闻 2']['change']=='left'
    assert by_title['新闻 4']['change']=='new'
    assert by_title['新闻 1']['bookmarked']==1 and by_title['新闻 1']['is_read']==1
    result=record(monitor,[2,1,3],20)
    assert next(i for i in monitor.history(snapshot=result['snapshot_id'])['items'] if i['title']=='新闻 2')['change']=='returned'
    assert monitor.store.meta()['articles']==4
    before=monitor.history()['total']
    record(monitor,[2,1,3],20)
    assert monitor.history()['total']==before


@pytest.mark.parametrize('kind',['empty','html','malformed','cache','stale','bad_url','wrong_id','future'])
def test_invalid_and_cached_samples_never_remove_items(monitor,kind):
    record(monitor,[1,2])
    data=payload([3],10)
    if kind=='empty': data['items']=[]
    if kind=='html': data['items']='<html>not news</html>'
    if kind=='malformed': data['items']=[{'title':'missing id'}]
    if kind=='cache': data.update(status='cache',servedFromCache=True)
    if kind=='stale': data['fetchedAt']=int((BASE-timedelta(hours=1)).timestamp()*1000)
    if kind=='bad_url': data['items'][0]['url']='javascript:alert(1)'
    if kind=='wrong_id': data['id']='weibo'
    if kind=='future': data['fetchedAt']=int((BASE+timedelta(days=5)).timestamp()*1000)
    result=record(monitor,[3],10,data=data)
    assert result['snapshot_id'] is None
    assert len(monitor.boards(source='baidu')['items'][0]['items'])==2
    assert monitor.history()['total']==1


def test_error_gap_and_retained_success_time(monitor):
    record(monitor,[1,2])
    last=monitor.source('baidu')['last_success']
    monitor.record('baidu',error='HTTP 429',checked_at=(BASE+timedelta(minutes=10)).isoformat())
    source=monitor.source('baidu')
    assert source['last_success']==last and source['gap']==1 and source['failures']==1
    result=record(monitor,[2,3],20)
    assert monitor.history(snapshot=result['snapshot_id'])['items'][0]['gap']==1
    assert monitor.source('baidu')['gap']==0


def test_title_and_url_change_preserve_stable_identity(monitor):
    record(monitor,[1])
    item=monitor.boards(source='baidu')['items'][0]['items'][0]
    monitor.store.state(item['event_id'],{'bookmarked':True})
    data=payload([1],10)
    data['items'][0].update(title='<b>更新后的标题</b><script>bad()</script>',url='https://example.com/changed')
    record(monitor,[1],10,data=data)
    updated=monitor.boards(source='baidu')['items'][0]['items'][0]
    assert updated['item_id']==item['item_id'] and updated['event_id']==item['event_id']
    assert updated['bookmarked']==1 and updated['title']=='更新后的标题'
    assert monitor.store.meta()['articles']==1
    assert monitor.history(item=item['item_id'])['items'][-1]['title']=='新闻 1'


def test_realtime_has_no_rank_and_uses_publication_time(monitor):
    data=payload([1,2],sid='cls-telegraph')
    data['items'][0]['pubDate']=int((BASE-timedelta(hours=2)).timestamp())
    record(monitor,[1,2],sid='cls-telegraph',data=data)
    values=monitor.timeline()['items']
    assert len(values)==2
    assert all(v['mode']=='realtime' for v in values)
    rows=monitor.history(item=values[0]['item_id'])['items']
    assert all(v['rank'] is None and v['delta'] is None for v in rows)
    assert monitor.boards(source='cls-telegraph')['items']==[]


def test_alert_rules_cooldown_baseline_and_restart(monitor):
    rule=monitor.save_watch(dict(name='test',keywords=['新闻'],excludes=['新闻 8'],sources=['baidu'],enabled=True,rise_threshold=5))
    with monitor.store.connect() as db: db.execute("UPDATE monitor_watches SET created_at='2020-01-01T00:00:00+00:00'")
    record(monitor,list(range(1,9)))
    assert monitor.alerts()['total']==0
    record(monitor,[7,1,2,3,4,5,6,8,9],10)
    assert {(a['title'],a['kind']) for a in monitor.alerts()['items']}=={('新闻 7','up'),('新闻 9','new')}
    record(monitor,list(range(1,10)),20)
    MonitorWorker(monitor.store).recover()
    record(monitor,[7,1,2,3,4,5,6,8,9],30)
    assert monitor.alerts()['total']==2
    record(monitor,list(range(1,10)),80)
    record(monitor,[7,1,2,3,4,5,6,8,9],90)
    assert monitor.alerts()['total']==3
    monitor.save_watch({**rule,'enabled':False},rule['id'])
    assert not monitor.timeline(watched=True)['items']


def test_queue_claims_and_recovery_do_not_reset_other_worker(monitor):
    s=monitor.store
    ai=s.enqueue('update'); mon=s.enqueue('monitor_update')
    assert s.enqueue('monitor_update')['id']==mon['id']
    assert s.claim()['id']==ai['id']
    assert s.claim(monitor=True)['id']==mon['id']
    Worker(s,{'AI':{'MODEL':'test/model'}}).recover()
    assert s.jobs(mon['id'])['status']=='running'
    s.claim()
    MonitorWorker(s).recover()
    assert s.jobs(ai['id'])['status']=='running'
    assert s.jobs(mon['id'])['status']=='queued'


def test_regular_update_dispatches_monitor_without_waiting_for_ai(monitor):
    s=monitor.store
    ai=s.enqueue('analyze','busy');s.claim()
    s.enqueue('update')
    assert s.claim(monitor=True)['kind']=='monitor_update'
    assert s.jobs(ai['id'])['status']=='running'
    s.set_settings({'monitor_enabled':False})
    with s.connect() as db:db.execute("UPDATE jobs SET status='completed' WHERE kind='monitor_update'")
    s.enqueue('update')
    assert s.claim(monitor=True) is None


def test_worker_honors_interval_and_handles_partial_failures(monitor,monkeypatch):
    from requests import Timeout
    for source in monitor.sources(): monitor.configure(source['id'],{'enabled':source['id'] in {'baidu','zhihu'}})
    class Response:
        def raise_for_status(self): pass
        def json(self):
            data=payload([1]);data['fetchedAt']=int(datetime.now(timezone.utc).timestamp()*1000);return data
    calls=[]
    def get(url,params,timeout):
        calls.append(params['id'])
        if params['id']=='zhihu':raise Timeout()
        return Response()
    monkeypatch.setattr('trendradar.workbench.monitor_worker.requests.get',get)
    worker=MonitorWorker(monitor.store)
    job=monitor.store.enqueue('monitor_update');worker.execute(job)
    assert monitor.store.jobs(job['id'])['status']=='partial'
    assert monitor.source('baidu')['state']=='fresh'
    assert monitor.source('zhihu')['state']=='error'
    worker.execute(monitor.store.enqueue('monitor_update'))
    assert len(calls)==2


def test_monitor_api_validation_and_watch_lifecycle(monitor):
    client=TestClient(create_app(monitor.store.root,monitor.store))
    assert len(client.get('/api/v1/monitor/sources').json())==52
    assert client.post('/api/v1/jobs',json={'kind':'monitor_update','target':'unknown'}).status_code==404
    body=dict(name='关注模型',keywords=['AI','大模型'],sources=['baidu'])
    rule=client.post('/api/v1/monitor/watches',json=body)
    assert rule.status_code==201
    assert client.post('/api/v1/monitor/watches',json={**body,'keywords':[' ']}).status_code==422
    assert client.post('/api/v1/monitor/watches',json={**body,'sources':['missing']}).status_code==422
    assert client.put('/api/v1/monitor/sources/order',json={'ids':['baidu','baidu']}).status_code==422
    assert client.patch('/api/v1/settings',json={'monitor_retention_days':6}).status_code==422
    assert client.delete('/api/v1/monitor/watches/'+rule.json()['id']).status_code==204
    assert client.get('/api/v1/monitor/watches').json()==[]
    assert 'monitor_heartbeat' in client.get('/api/v1/health').json()


def test_retention_does_not_remove_articles_or_saved_state(monitor):
    record(monitor,[1]); record(monitor,[1,2],10)
    item=monitor.boards(source='baidu')['items'][0]['items'][0]
    monitor.store.state(item['event_id'],{'bookmarked':True})
    with monitor.store.connect() as db:
        db.execute("UPDATE monitor_snapshots SET fetched_at='2020-01-01T00:00:00+00:00' WHERE id=1")
    monitor.cleanup()
    assert monitor.history()['total']==1
    assert monitor.store.meta()['articles']==2
    assert monitor.store.event(item['event_id'])['bookmarked']==1


def test_ai_default_listing_remains_gated(monitor):
    record(monitor,[1,2])
    assert monitor.store.events(view='all')['total']==0
    assert monitor.store.events(view='archive')['total']==2


def test_native_cards_separate_following_from_hot_and_realtime(monitor):
    record(monitor,[1,2],sid='baidu')
    record(monitor,[8,3,5],sid='cls-telegraph')
    monitor.configure('baidu',{'subscribed':False})
    client=TestClient(create_app(monitor.store.root,monitor.store))
    # Unstarring only removes a source from Following, not the all-platform boards.
    hot=client.get('/api/v1/monitor/boards?mode=hottest&subscribed=false').json()['items']
    assert any(s['id']=='baidu' and len(s['items'])==2 for s in hot)
    following=client.get('/api/v1/monitor/boards?mode=&subscribed=true').json()['items']
    assert 'baidu' not in {s['id'] for s in following}
    assert 'cls-telegraph' in {s['id'] for s in following}
    realtime=client.get('/api/v1/monitor/boards?mode=realtime&subscribed=false&source=cls-telegraph').json()['items']
    assert len(realtime)==1
    assert [item['title'] for item in realtime[0]['items']]==['新闻 8','新闻 3','新闻 5']
    assert all(item['rank'] is None for item in realtime[0]['items'])
    assert client.get('/api/v1/monitor/changes?mode=hottest&subscribed=false&since=0').json()['count']==2
    assert client.get('/api/v1/monitor/changes?mode=hottest&subscribed=true&since=0').json()['count']==0
    assert client.get('/api/v1/monitor/boards?mode=invalid').status_code==422


def test_history_filters_and_scoped_updates(monitor):
    record(monitor,[1,2])
    record(monitor,[3],sid='ithome')
    assert monitor.history(category='科技')['total']==1
    assert monitor.history(start='2026-11-06')['total']==0
    assert monitor.history(q='新闻 2')['total']==1
    assert monitor.changes(0,mode='hottest')['count']==2
    assert monitor.changes(0,source='baidu',q='新闻 1')['count']==1
    monitor.configure('baidu',{'subscribed':False})
    assert monitor.changes(0,mode='hottest')['count']==0
    assert monitor.changes(0,watched=True)['count']==0
    assert monitor.timeline(source='ithome')['items'][0]['published_at'] is None
    client=TestClient(create_app(monitor.store.root,monitor.store))
    assert client.get('/api/v1/monitor/history?category=科技').json()['total']==1
