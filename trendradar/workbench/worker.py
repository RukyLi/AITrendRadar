"""Single durable worker: collection, AI tasks, recovery and Asia/Shanghai schedule."""
import fcntl
import json
import signal
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from html import escape
from zoneinfo import ZoneInfo

from trendradar.core.loader import load_config
from trendradar.crawler.fetcher import DataFetcher
from trendradar.storage.base import RSSData, RSSItem, convert_crawl_results_to_news_data
from trendradar.storage.local import LocalStorageBackend
from .feeds import FeedError, fetch_feed, record_health
from .intelligence import Intelligence
from .store import Store
from .util import now, timestamp


class Worker:
    def __init__(self, store, config=None):
        self.store=store
        self.config=config or load_config(str(store.root/'config/config.yaml'))
        self.intelligence=Intelligence(store,self.config['AI'])
        self.stop=threading.Event()

    def recover(self):
        with self.store.connect() as db:
            db.execute("UPDATE jobs SET status='queued',stage='服务重启，等待恢复',progress=0 WHERE status='running' AND kind NOT LIKE 'monitor_%'")
            db.execute("UPDATE events SET ai_status='pending' WHERE ai_status='running'")

    def heartbeat(self):
        while not self.stop.is_set():
            self.store.set_settings({'_worker_heartbeat':now()})
            self.stop.wait(10)

    def schedule(self):
        settings=self.store.settings()
        if not settings['schedule_enabled']: return
        last=self.store.internal('_last_update_attempt') or self.store.internal('_last_update')
        if not last or (datetime.now(timezone.utc)-datetime.fromisoformat(last)).total_seconds()>=settings['interval_minutes']*60:
            self.store.enqueue('update')
        local=datetime.now(ZoneInfo('Asia/Shanghai'))
        if local.hour>=settings['brief_hour'] and self.store.internal('_brief_date')!=local.date().isoformat():
            # Queue behind collection so the daily brief includes the fresh index.
            self.store.enqueue('brief',local.date().isoformat())

    def collect_one(self, source):
        if source['kind']=='rss':
            items,metadata=fetch_feed(source)
            settings=self.store.settings()
            cutoff=(datetime.now(timezone.utc)-timedelta(days=settings['initial_days'])).isoformat()
            items=sorted(items,key=lambda i: timestamp(i.published_at),reverse=True)
            items=[i for i in items if not i.published_at or timestamp(i.published_at)>=cutoff][:settings['per_source_limit']]
            return dict(kind='rss',items=items,metadata=metadata)
        if source['kind']=='hotlist':
            metadata=json.loads(source['metadata'])
            fetcher=DataFetcher(api_url=self.config.get('PLATFORMS_API_URL') or None)
            results,names,failed=fetcher.crawl_websites([(source['id'],source['name'])],domain_rules={source['id']:metadata.get('expected_domain','')})
            if failed: raise FeedError('热榜接口返回失败或域名校验未通过')
            return dict(kind='hotlist',results=results,names=names)
        raise FeedError('该来源等待官方 API 凭证，暂不支持自动采集')

    def collect(self, jid):
        from .monitor import Monitor
        monitored={s['source_id'] for s in Monitor(self.store).sources()}
        monitor_job=self.store.enqueue('monitor_update') if self.store.settings().get('monitor_enabled',True) else None
        self.store.progress(jid,'导入历史归档',2)
        self.store.import_archives()
        sources=[self.store.source(s['id']) for s in self.store.sources() if s['enabled'] and s['kind']!='x' and s['id'] not in monitored]
        changed=set()
        results=[]
        active=[]
        for source in sources:
            if source['next_retry'] and source['next_retry']>now():
                results.append(dict(id=source['id'],name=source['name'],status='skipped',count=0,error='退避中，下次重试 '+source['next_retry']))
            else: active.append(source)
        date=datetime.now(ZoneInfo('Asia/Shanghai'))
        date_str,crawl_time=date.strftime('%Y-%m-%d'),date.strftime('%H:%M')
        archive=LocalStorageBackend(str(self.store.root/'output'),enable_txt=False)
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures={pool.submit(self.collect_one,s):s for s in active}
            for future in as_completed(futures):
                source=futures[future]
                try:
                    data=future.result()
                    if data['kind']=='rss':
                        records=[]
                        for item in data['items']:
                            eid,new=self.store.ingest(dict(source_id=source['id'],title=item.title,url=item.url,guid=item.guid,summary=item.summary,author=item.author,published_at=item.published_at))
                            if eid and new: changed.add(eid)
                            records.append(RSSItem(title=item.title,feed_id=source['id'],feed_name=source['name'],url=item.url,guid=item.guid or '',summary=item.summary or '',published_at=item.published_at or '',author=item.author or '',crawl_time=crawl_time,first_time=crawl_time,last_time=crawl_time))
                        if records and not archive.save_rss_data(RSSData(date=date_str,crawl_time=crawl_time,items={source['id']:records},id_to_name={source['id']:source['name']})):
                            raise FeedError('RSS 日归档保存失败')
                        count=len(records)
                        record_health(self.store,source['id'],count,data['metadata'])
                    else:
                        news=convert_crawl_results_to_news_data(data['results'],data['names'],[],crawl_time,date_str)
                        if not archive.save_news_data(news): raise FeedError('热榜日归档保存失败')
                        count=0
                        for sid,items in news.items.items():
                            for item in items:
                                eid,new=self.store.ingest(dict(source_id=sid,title=item.title,url=item.url,rank=item.rank))
                                if eid and new: changed.add(eid)
                                count+=1
                        record_health(self.store,source['id'],count)
                    results.append(dict(id=source['id'],name=source['name'],status='ok',count=count))
                except Exception as exc:
                    error=exc if isinstance(exc,FeedError) else FeedError('采集或归档失败')
                    record_health(self.store,source['id'],error=error)
                    results.append(dict(id=source['id'],name=source['name'],status='error',count=0,error=str(error)))
                self.store.progress(jid,f"采集来源 {len(results)}/{len(sources)}",int(5+55*len(results)/max(len(sources),1)),dict(sources=results,new_events=len(changed)))
        archive.cleanup()
        settings=self.store.settings()
        quality = {}
        if settings['ai_enabled']:
            quality = self.curate_events(jid, self.store.review_candidates(80),
                                        base=dict(sources=results,new_events=len(changed)), start=60, end=82)
        # Independent monitoring may have ingested AI candidates during this update.
        with self.store.connect() as db:
            changed.update(r[0] for r in db.execute("SELECT id FROM events WHERE relevance_status='accepted' AND ai_status='pending' AND changed_at>=? ORDER BY updated_at DESC LIMIT 100", (self.store.internal('_monitor_started_at',now()),)))
        candidates=[]
        for eid in dict.fromkeys(self.store.resolve(e) for e in changed):
            event=self.store.event(eid)
            if event and event['relevance_status']=='accepted': candidates.append(event)
        candidates.sort(key=lambda e:(sum(t['followed'] for t in e['topics']),e['source_count'],e['updated_at']),reverse=True)
        ids=[e['id'] for e in candidates[:settings['auto_analyze_limit']]]
        analyzed,ai_failed=0,0
        if settings['ai_enabled'] and ids:
            for i,eid in enumerate(ids):
                self.store.progress(jid,f'生成中文解读 {i+1}/{len(ids)}',84+int(13*i/max(len(ids),1)),dict(sources=results,new_events=len(changed),analyzed=analyzed,ai_failed=ai_failed,**quality))
                if self.intelligence.analyze(eid): analyzed+=1
                else: ai_failed+=1
                if self.stop.is_set(): break
        self.export_report()
        result=dict(sources=results,monitor_job_id=monitor_job['id'] if monitor_job else None,new_events=len(changed),analyzed=analyzed,ai_failed=ai_failed,**quality,
                    successful_sources=sum(s['status']=='ok' for s in results),failed_sources=sum(s['status']=='error' for s in results))
        self.store.set_settings({'_last_update':now()})
        partial=any(s['status']!='ok' for s in results) or ai_failed>0 or quality.get('review_failed',0)>0 or quality.get('merge_failed',0)>0 or self.stop.is_set()
        self.store.progress(jid,'更新完成，部分来源或解读待重试' if partial else '更新完成',100,result,'partial' if partial else 'completed')

    def curate_events(self, jid, ids, base=None, start=5, end=95, merge_all=False):
        base = base or {}
        totals = dict(review_total=len(ids), review_done=0, accepted=0, rejected=0, uncertain=0,
                      review_failed=0, merge_checked=0, merged=0, merge_failed=0)
        for offset in range(0,len(ids),8):
            batch = ids[offset:offset+8]
            self.store.progress(jid,f'AI 相关性审核 {offset}/{len(ids)}',start+int((end-start)*.7*offset/max(len(ids),1)),dict(**base,**totals))
            outcome = self.intelligence.curation.review(batch)
            if outcome['failed'] and not self.stop.is_set():
                # One smaller retry; valid verdicts are served from the cache.
                self.store.progress(jid,f'重试审核 {offset + 1}–{offset + len(batch)}',start+int((end-start)*.7*offset/max(len(ids),1)),dict(**base,**totals))
                outcome['failed'] = 0
                for part in (batch[:4],batch[4:]):
                    retry = self.intelligence.curation.review(part)
                    for key in ('accepted','rejected','uncertain','failed'):
                        outcome[key] += retry[key]
            for key in ('accepted','rejected','uncertain'): totals[key] += outcome[key]
            totals['review_failed'] += outcome['failed']
            totals['review_done'] += len(batch)
            if self.stop.is_set() or outcome['failed']==len(batch): break
        if merge_all:
            with self.store.connect() as db:
                ids = [r[0] for r in db.execute("SELECT id FROM events WHERE relevance_status='accepted'")]
        self.store.progress(jid,'跨语言候选核验',start+int((end-start)*.75),dict(**base,**totals))
        for _ in range(3):
            if self.stop.is_set(): break
            outcome = self.intelligence.curation.deduplicate(ids)
            for key,value in outcome.items(): totals[key] += value
            self.store.progress(jid,f"跨语言核验 {totals['merge_checked']} 对 · 合并 {totals['merged']} 个事件",end,dict(**base,**totals))
            if not outcome['merged']: break
        return totals

    def export_report(self):
        events=self.store.events(view='following',limit=100)['items']
        blocks=[]
        for event in events:
            ai=event['analysis'] or {}
            links=' · '.join(f'<a href="{escape(a["url"],quote=True)}" rel="noopener noreferrer">{escape(a["source_name"])}</a>' for a in self.store.event(event['id'])['articles'] if a['url'])
            blocks.append(f'<article><h2>{escape(ai.get("title_zh",event["title"]))}</h2><p>{escape(ai.get("summary_zh",event["summary"]))}</p><small>{links}</small></article>')
        body='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AITrendRadar 阅读存档</title><style>body{max-width:800px;margin:60px auto;padding:24px;background:#f6f6f0;color:#263c36;font:16px/1.8 sans-serif}article{border-top:1px solid #ddd;padding:24px 0}a{color:#257565}small{color:#777}</style><h1>AITrendRadar · 阅读存档</h1><p>'+escape(now())+'</p>'+''.join(blocks)+'</html>'
        folder=self.store.root/'output/html/workbench'
        folder.mkdir(parents=True,exist_ok=True)
        (folder/(datetime.now().strftime('%Y-%m-%d_%H-%M-%S')+'.html')).write_text(body)
        (folder/'latest.html').write_text(body)

    def execute(self, job):
        jid=job['id']
        try:
            if job['kind'] in {'analyze','review','curate'} and not self.store.settings()['ai_enabled']:
                self.store.progress(jid,'AI 审核与解读已暂停',100,{},'failed','请先开启 AI 审核与解读')
                return
            if job['kind']=='update':
                self.store.set_settings({'_last_update_attempt':now()})
                return self.collect(jid)
            if job['kind']=='curate':
                result=self.curate_events(jid,self.store.review_candidates(500,retry=True),merge_all=True)
                failed=result['review_failed'] or result['merge_failed'] or result['review_done'] < result['review_total']
                self.store.progress(jid,'审核与聚合完成' if not failed else '部分审核未完成，可重试',100,result,'partial' if failed else 'completed')
            elif job['kind']=='review':
                result=self.intelligence.curation.review([job['target']],force=True)
                counts=self.intelligence.curation.deduplicate([job['target']]) if not result['failed'] else {}
                status='failed' if result['failed'] else 'partial' if counts.get('merge_failed') or result['stale'] else 'completed'
                self.store.progress(jid,'相关性审核完成' if status=='completed' else '部分核验未完成，可重试',100,{**result,**counts,'review_failed':result['failed']},status)
            elif job['kind']=='analyze':
                ok=self.intelligence.analyze(job['target'])
                self.store.progress(jid,'解读完成' if ok else '解读失败，可重试',100,{'event_id':self.store.resolve(job['target'])},'completed' if ok else 'failed')
            elif job['kind']=='source_test':
                source=self.store.source(job['target'])
                self.store.progress(jid,'检查订阅格式与内容',30)
                try:
                    if source['kind']=='rss':
                        items,metadata=fetch_feed(source,conditional=False)
                        # A test does not ingest items, so it must not advance the
                        # collector's validators and cause an unearned HTTP 304.
                        record_health(self.store,source['id'],len(items),dict(etag=source['etag'],modified=source['modified']))
                        result=dict(count=len(items),message='订阅有效' if items else '订阅格式有效，当前没有条目')
                    else:
                        data=self.collect_one(source)
                        count=len(data['results'].get(source['id'],{}))
                        record_health(self.store,source['id'],count)
                        result=dict(count=count,message='热榜接口有效')
                    self.store.progress(jid,'测试完成',100,result,'completed')
                except Exception as exc:
                    error=exc if isinstance(exc,FeedError) else FeedError('来源测试失败')
                    record_health(self.store,source['id'],error=error)
                    self.store.progress(jid,'测试失败',100,{},'failed',str(error))
            elif job['kind']=='brief':
                self.store.progress(jid,'整理最近 24 小时简报',30)
                bid=self.intelligence.brief(self.store.settings()['ai_enabled'])
                self.store.set_settings({'_brief_date':datetime.now(ZoneInfo('Asia/Shanghai')).date().isoformat()})
                self.store.progress(jid,'简报已保存',100,{'brief_id':bid},'completed')
        except Exception:
            self.store.progress(jid,'任务未完成，可重试',100,{},'failed','处理失败，请检查服务日志与来源状态')
            # Do not leak third-party request exceptions (may include API keys).
            print(f'[workbench] job {jid}: {job["kind"]} failed',flush=True)

    def run(self):
        lock_path=self.store.path.with_suffix('.worker.lock')
        with open(lock_path,'w') as lock:
            try: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            except BlockingIOError: raise SystemExit('后台 Worker 已在运行')
            self.recover()
            for sig in [signal.SIGTERM,signal.SIGINT]: signal.signal(sig,lambda *_:self.stop.set())
            pulse=threading.Thread(target=self.heartbeat,daemon=True)
            pulse.start()
            print('[workbench] Worker ready',flush=True)
            while not self.stop.is_set():
                self.schedule()
                job=self.store.claim()
                if job: self.execute(job)
                else: self.stop.wait(2)
            self.store.set_settings({'_worker_heartbeat':None})
