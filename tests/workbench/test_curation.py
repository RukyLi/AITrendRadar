import json
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from trendradar.workbench.api import create_app
from trendradar.workbench.curation import Curation
from trendradar.workbench.intelligence import Intelligence
from trendradar.workbench.store import Store
from trendradar.workbench.util import now
from trendradar.workbench.worker import Worker


@pytest.fixture
def store(tmp_path):
    value=Store(tmp_path); value.initialize()
    with value.connect() as db:
        db.execute("INSERT INTO sources(id,name,kind) VALUES('sports','综合热榜','hotlist')")
    return value


def add(store,title,url,sid='qbitai',summary='',published_at=None):
    return store.ingest(dict(source_id=sid,title=title,url='https://example.com/'+url,summary=summary,published_at=published_at or now()))[0]


class Editor:
    def __init__(self, profiles=None, verdicts=None, invalid=False, same=True, confidence=.98):
        self.calls=0; self.profiles=profiles or {}; self.verdicts=verdicts or {}
        self.invalid=invalid; self.same=same; self.confidence=confidence; self.callback=None
    def chat(self,messages,**kwargs):
        self.calls+=1
        payload=json.loads(messages[-1]['content'])
        if self.callback: self.callback(); self.callback=None
        if isinstance(payload,dict):
            values=[]
            for event in payload['events']:
                article=event['articles'][0]; title=article['title']
                verdict=self.verdicts.get(title,'relevant')
                canonical,entities=self.profiles.get(title,(title,['OpenAI']))
                values.append(dict(event_id=event['event_id'],verdict=verdict,confidence=.96,
                                   reason='标题与摘要明确涉及 AI 产品发布' if verdict=='relevant' else '这是普通生活/模型制作消息，缺少 AI 内容',
                                   source_ids=['invented'] if self.invalid else [article['id']],
                                   canonical_title=canonical,entities=entities,action='release',topic_ids=['models'] if verdict=='relevant' else []))
            return json.dumps({'results':values})
        return json.dumps({'pairs':[dict(key=p['key'],same_event=self.same,confidence=self.confidence,
                                         reason='两侧均报道同一主体、动作及版本的发布',
                                         source_ids=['invented'] if self.invalid else [p['left']['articles'][0]['id'],p['right']['articles'][0]['id']]) for p in payload]})


def test_ai_admission_archive_and_saved_are_independent(store):
    yes=add(store,'OpenAI 发布新模型','ai')
    no=add(store,'汽车模型制作教程','car')
    unsure=add(store,'一个模型的神秘更新','uncertain')
    plain=add(store,'今日天气晴朗','weather','sports')
    assert store.events()['total']==0 and store.events(view='archive')['total']==4
    editor=Editor(verdicts={'汽车模型制作教程':'irrelevant','一个模型的神秘更新':'uncertain'})
    outcome=Intelligence(store,{'MODEL':'test'},editor).curation.review([yes,no,unsure])
    assert (outcome['accepted'],outcome['rejected'],outcome['uncertain'])==(1,1,1)
    assert [e['id'] for e in store.events()['items']]==[yes]
    assert store.events(view='today')['total']==1
    assert store.events(view='archive')['total']==3
    assert store.events(view='archive',review='rejected')['items'][0]['id']==no
    assert store.event(plain)['relevance_status']=='unreviewed'
    store.state(no,{'bookmarked':True,'is_read':True})
    assert store.events(view='saved')['items'][0]['id']==no
    assert store.event(no)['is_read']==1
    assert store.events(view='library')['total']==4


def test_review_evidence_cache_and_content_invalidation(store):
    eid=add(store,'发布星图 AI 模型','one')
    editor=Editor(profiles={'发布星图 AI 模型':('Starmap AI model release',['Starmap'])})
    engine=Intelligence(store,{'MODEL':'provider/model'},editor)
    assert engine.curation.review([eid])['accepted']==1
    assert engine.curation.review([eid])['cached']==1 and editor.calls==1
    assert store.events(q='Starmap')['total']==1
    assert store.events(q='provider/model')['total']==0
    assert store.event(eid)['review_history'][0]['result']['source_ids']
    add(store,'发布星图 AI 模型','one',summary='新增版本细节')
    assert store.event(eid)['relevance_status']=='pending' and store.events()['total']==0
    assert engine.curation.review([eid])['accepted']==1 and editor.calls==2
    assert len(store.event(eid)['review_history'])==2


def test_review_errors_do_not_admit_or_cache_invalid_citations(store):
    eid=add(store,'GLM 新模型','bad')
    engine=Intelligence(store,{'MODEL':'test'},Editor(invalid=True))
    assert engine.curation.review([eid])['failed']==1
    assert store.events()['total']==0 and store.events(view='archive')['total']==1
    assert store.event(eid)['relevance_status']=='error'
    with store.connect() as db: assert db.execute('SELECT count(*) FROM ai_cache').fetchone()[0]==0
    assert store.review_candidates()==[]  # Back off failed automatic reviews.
    assert store.review_candidates(retry=True)==[eid]


def test_hotlist_recall_includes_chinese_brands_but_does_not_auto_admit(store):
    a=add(store,'智谱完成新一轮融资','brand','sports')
    b=add(store,'豆包推出新功能','doubao','sports')
    c=add(store,'普通汽车年度销售榜','cars','sports')
    assert set(store.review_candidates())=={a,b}
    assert store.event(c)['relevance_status']=='unreviewed'
    assert store.events()['total']==0


def test_polling_reports_archive_removals_without_inserting_into_current_list(store):
    eid=add(store,'AI 模型发布','poll')
    assert store.events(view='archive')['total']==1
    Intelligence(store,{'MODEL':'test'},Editor()).curation.review([eid])
    poll=store.events(view='archive',since='2000-01-01T00:00:00+00:00')
    assert poll['total']==0 and poll['current_total']==0
    assert store.events(since='2000-01-01T00:00:00+00:00')['current_total']==1


def test_stale_model_result_cannot_approve_changed_content(store):
    eid=add(store,'OpenAI 发布模型','stale')
    editor=Editor(); editor.callback=lambda:add(store,'这是普通汽车模型','stale')
    result=Intelligence(store,{'MODEL':'test'},editor).curation.review([eid])
    assert result['stale']==1 and store.events()['total']==0
    assert store.event(eid)['relevance'] is None


def reviewed_pair(store, left='安思发布新的推理模型',right='Anthropic releases a new reasoning model'):
    date=(datetime.now(timezone.utc)-timedelta(days=2)).isoformat()
    a=add(store,left,'a',published_at=date)
    b=add(store,right,'b',sid='hacker-news',published_at=date)
    editor=Editor(profiles={left:('Anthropic launches the Orion reasoning model',['Anthropic','Orion']),right:('Anthropic releases Orion reasoning model',['Anthropic','Orion'])})
    engine=Intelligence(store,{'MODEL':'test'},editor)
    engine.curation.review([a,b])
    return a,b,engine,editor


def test_cross_language_merge_ignores_unrelated_recent_hotlist_and_preserves_state(store):
    a,b,engine,editor=reviewed_pair(store)
    # These newer hotlist records used to crowd the relevant pair out of the top 200.
    with store.connect() as db:
        for i in range(220): store.ingest(dict(source_id='sports',title=f'体育赛事第{i}场',url=f'https://example.com/sport/{i}'),connection=db)
    store.state(a,{'is_read':True});store.state(b,{'bookmarked':True})
    outcome=engine.curation.deduplicate([a,b])
    assert outcome['merged']==1 and outcome['merge_checked']==1
    merged=store.event(a)
    assert merged['id']==store.event(b)['id']
    assert merged['bookmarked']==1 and merged['is_read']==0
    assert len(merged['articles'])==2 and len(merged['merges'])==1
    assert merged['relevance_status']=='accepted'
    assert len(merged['merges'][0]['evidence'])==2
    assert len(merged['review_history'])==2
    assert store.events()['total']==1 and store.events(view='archive')['total']==220
    assert engine.curation.deduplicate([a,b])['merged']==0


@pytest.mark.parametrize('same,confidence,invalid',[(True,.8,False),('true',.99,False),(True,.99,True),(False,.99,False)])
def test_uncertain_or_invalid_merge_is_kept_separate(store,same,confidence,invalid):
    a,b,engine,editor=reviewed_pair(store)
    editor.same=same;editor.confidence=confidence;editor.invalid=invalid
    result=engine.curation.deduplicate([a,b])
    assert result['merged']==0 and store.events()['total']==2
    calls=editor.calls
    if not invalid and isinstance(same,bool):
        engine.curation.deduplicate([a,b]);assert editor.calls==calls


def test_versions_and_variants_never_merge(store):
    a=add(store,'智谱发布 5.2','v52');b=add(store,'智谱发布 5.3','v53')
    editor=Editor(profiles={'智谱发布 5.2':('GLM 5.2 released',['GLM']),'智谱发布 5.3':('GLM 5.3 released',['GLM'])})
    engine=Intelligence(store,{'MODEL':'test'},editor);engine.curation.review([a,b])
    assert engine.curation.candidate_pairs([a,b])==[]
    assert not engine.compatible_versions('Claude Opus 4.5 release','Claude Sonnet 4.5 release')
    assert not engine.compatible_versions('Qwen 3.8 27B','Qwen 3.8 35B')
    assert not engine.compatible_versions('Gemini 3 Flash','Gemini 3 Pro')


def test_source_identity_is_not_a_user_editable_official_claim(store):
    types={s['id']:s for s in store.sources()}
    assert types['openai']['publisher_type']=='official'
    assert types['reddit-localllama']['publisher_type']=='community'
    assert types['reddit-localllama']['delivery_type']=='direct_rss'
    assert types['hacker-news']['delivery_type']=='third_party_rss'
    assert types['sports']['publisher_type']=='aggregator'
    store.save_source({'url':'https://evil.example/feed','category':'官方'},'openai')
    assert next(s for s in store.sources() if s['id']=='openai')['publisher_type']=='unverified'
    custom=store.save_source({'name':'Official AI','url':'https://example.com/feed','category':'官方'})
    assert next(s for s in store.sources() if s['id']==custom['id'])['publisher_type']=='unverified'


def test_quality_migration_keeps_history_state_and_repeats_safely(tmp_path):
    path=tmp_path/'output/workbench.sqlite3';path.parent.mkdir()
    with sqlite3.connect(path) as db:
        db.executescript(Path('trendradar/workbench/schema.sql').read_text())
        db.execute("INSERT INTO sources(id,name,kind) VALUES('sports','News','hotlist')")
        db.execute("INSERT INTO events(id,title,title_key,created_at,updated_at,bookmarked,is_read) VALUES('e','世界杯比赛','世界杯比赛',?,?,1,1)",(now(),now()))
        db.execute("INSERT INTO articles(id,source_id,event_id,title,published_at,first_seen,last_seen,content_hash) VALUES('a','sports','e','世界杯比赛',?,?,?,'h')",(now(),now(),now()))
        db.execute("INSERT INTO settings VALUES('_initialized','true')")
    value=Store(tmp_path);value.initialize();value.initialize()
    assert value.meta()['articles']==1 and value.meta()['events']==1
    assert value.event('e')['bookmarked']==1 and value.event('e')['is_read']==1
    assert value.events()['total']==0 and value.events(view='archive')['total']==1


def test_api_exposes_archive_reviews_and_deduplicates_jobs(store):
    eid=add(store,'人工智能新闻','pending')
    with TestClient(create_app(store.root,store)) as client:
        assert client.get('/api/v1/events').json()['total']==0
        assert client.get('/api/v1/events?view=archive&review=pending').json()['total']==1
        assert client.get('/api/v1/events?review=bogus').status_code==422
        one=client.post('/api/v1/jobs',json={'kind':'curate'}).json()
        assert one['id']==client.post('/api/v1/jobs',json={'kind':'curate'}).json()['id']
        assert client.post('/api/v1/jobs',json={'kind':'review','target':eid}).status_code==202
        assert client.post('/api/v1/jobs',json={'kind':'review','target':'missing'}).status_code==404
        store.set_settings({'ai_enabled':False})
        assert client.post('/api/v1/jobs',json={'kind':'curate'}).status_code==409


def test_worker_retries_invalid_batch_in_smaller_groups_without_repeating_valid_reviews(store):
    ids=[add(store,f'AI 项目 {i} 发布',f'batch-{i}') for i in range(8)]
    class SmallBatchEditor(Editor):
        def chat(self,messages,**kwargs):
            payload=json.loads(messages[-1]['content'])
            if isinstance(payload,dict) and len(payload['events'])>4:
                self.calls+=1
                return '{"results":[]}'
            return super().chat(messages,**kwargs)
    editor=SmallBatchEditor()
    worker=Worker(store,{'AI':{'MODEL':'test'}})
    worker.intelligence=Intelligence(store,{'MODEL':'test'},editor)
    job=store.enqueue('curate')
    result=worker.curate_events(job['id'],ids)
    assert result['accepted']==8 and result['review_failed']==0
    assert result['review_done']==8 and store.events()['total']>0
    assert store.meta()['articles']==8
    # Re-running the review itself does not spend another request.
    calls=editor.calls
    assert worker.intelligence.curation.review(ids)['failed']==0
    assert editor.calls==calls


def test_worker_model_failure_retains_pending_work_and_reports_partial(store):
    for i in range(12): add(store,f'AI 研究项目 {i}',f'failed-{i}')
    worker=Worker(store,{'AI':{'MODEL':'test'}})
    worker.intelligence=Intelligence(store,{'MODEL':'test'},Editor(invalid=True))
    job=store.enqueue('curate');worker.execute(job)
    result=store.jobs(job['id'])
    assert result['status']=='partial'
    assert result['result']['review_done']==8 and result['result']['review_total']==12
    assert store.events()['total']==0 and store.events(view='archive')['total']==12
    assert len(store.review_candidates(retry=True))==12
    store.set_settings({'ai_enabled':False})
    calls=worker.intelligence.client.calls
    worker.execute(store.enqueue('curate'))
    assert worker.intelligence.client.calls==calls


def test_merge_rechecks_content_inside_write_transaction(store):
    a,b,engine,_=reviewed_pair(store)
    hashes=[store.fingerprint(a),store.fingerprint(b)]
    add(store,'Anthropic announces a separate experiment','b',sid='hacker-news',summary='Changed article')
    assert engine.merge(a,b,expected_hashes=hashes)==0
    assert store.meta()['events']==2 and store.meta()['articles']==2


def test_collection_reviews_before_summarizing_and_preserves_raw_archives(store,monkeypatch):
    from trendradar.crawler.rss.parser import ParsedRSSItem
    with store.connect() as db:
        db.execute("UPDATE sources SET enabled=(id='qbitai')")
    titles=['新 AI 模型发布','汽车模型制作教程']
    items=[ParsedRSSItem(t,f'https://example.com/pipeline-{i}',published_at=now()) for i,t in enumerate(titles)]
    worker=Worker(store,{'AI':{'MODEL':'test'}})
    worker.intelligence=Intelligence(store,{'MODEL':'test'},Editor(verdicts={titles[1]:'irrelevant'}))
    monkeypatch.setattr(worker,'collect_one',lambda source:dict(kind='rss',items=items,metadata={}))
    analyzed=[]
    monkeypatch.setattr(worker.intelligence,'analyze',lambda eid:analyzed.append(eid) or True)
    job=store.enqueue('update');worker.execute(store.claim())
    result=store.jobs(job['id'])
    assert result['status']=='completed' and result['result']['accepted']==1
    assert len(analyzed)==1 and store.event(analyzed[0])['title']==titles[0]
    assert store.events()['total']==1 and store.events(view='archive')['total']==1
    assert list((store.root/'output/rss').glob('*.db'))
    assert list((store.root/'output/html/workbench').glob('*.html'))
    store.import_archives()
    assert store.meta()['articles']==2 and store.events()['total']==1
    raw=store.articles()['items']
    assert all(a['publisher_type']=='media' for a in raw)
