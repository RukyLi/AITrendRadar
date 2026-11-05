"""A dedicated queue/process for bounded NewsNow requests and durable samples."""
import fcntl
import os
import signal
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from zoneinfo import ZoneInfo

import requests

from .monitor import Monitor, later
from .util import now


def provider_url():
    return os.getenv('NEWSNOW_URL', 'http://127.0.0.1:'+os.getenv('NEWSNOW_PORT','8788')).rstrip('/')


class MonitorWorker:
    def __init__(self, store):
        self.store, self.monitor, self.stop = store, Monitor(store), threading.Event()

    def recover(self):
        with self.store.connect() as db:
            db.execute("UPDATE jobs SET status='queued',stage='监控服务重启，等待恢复',progress=0 WHERE status='running' AND kind LIKE 'monitor_%'")

    def schedule(self):
        if not self.store.settings().get('monitor_enabled', True): return
        if any(s['enabled'] and (not s['next_due'] or s['next_due'] <= now()) for s in self.monitor.sources()):
            self.store.enqueue('monitor_update')

    def collect_one(self, source):
        # Public API fallback would disguise freshness/provider failures; use only the configured service.
        try:
            response = requests.get(provider_url()+'/api/s', params={'id':source['id'],'latest':'true'}, timeout=(3,50))
            response.raise_for_status()
            result = self.monitor.record(source['id'], response.json())
        except requests.Timeout:
            result = self.monitor.record(source['id'],error='采集超时，保留上次数据',error_code='timeout')
        except requests.HTTPError as exc:
            code = exc.response.status_code if exc.response is not None else 502
            result = self.monitor.record(source['id'],error=f'采集服务 HTTP {code}',error_code='provider')
        except (requests.RequestException, ValueError):
            result = self.monitor.record(source['id'],error='本地采集服务不可用或响应无效',error_code='provider')
        # Keep the existing 11 platforms' daily archives available to CLI/MCP/report users.
        if result['status']=='fresh' and result['snapshot_id'] and not source['source_id'].startswith('newsnow:'):
            from trendradar.storage.base import convert_crawl_results_to_news_data
            from trendradar.storage.local import LocalStorageBackend
            values=self.monitor.history(snapshot=result['snapshot_id'])['items']
            items={v['title']: {'url':v['url'],'ranks':[v['rank']]} for v in values if v['rank'] is not None}
            date=datetime.now(ZoneInfo('Asia/Shanghai'))
            data=convert_crawl_results_to_news_data({source['source_id']:items},{source['source_id']:source['name']},[],date.strftime('%H:%M'),date.strftime('%Y-%m-%d'))
            if not LocalStorageBackend(str(self.store.root/'output'),enable_txt=False).save_news_data(data):
                result['archive_error']='日归档保存失败；监控快照已保存'
        return result

    def execute(self, job):
        jid=job['id']
        try:
            sources=[s for s in self.monitor.sources() if (s['enabled'] or job['kind']=='monitor_test') and (not job['target'] or job['target']==s['id'])]
            results=[]
            due=[]
            for source in sources:
                # Explicit diagnostics may retry an old failure, but never violate the source's
                # minimum request interval. Automatic polling keeps its exponential backoff.
                due_at = source['next_due']
                if job['kind']=='monitor_test' and source['state']=='error' and source['last_checked']:
                    due_at = later(source['last_checked'],source['interval_seconds'])
                if due_at and due_at>now():
                    results.append(dict(id=source['id'],name=source['name'],status='waiting',count=source['item_count'],error='下次检查 '+due_at))
                else: due.append(source)
            with ThreadPoolExecutor(max_workers=4) as pool:
                futures={pool.submit(self.collect_one,s):s for s in due}
                for future in as_completed(futures):
                    source=futures[future]
                    try: results.append(future.result())
                    except Exception:
                        results.append(dict(id=source['id'],name=source['name'],status='error',count=0,error='快照保存失败，下次重试'))
                    self.store.progress(jid,f'监控采样 {len(results)}/{len(sources)}',int(95*len(results)/max(1,len(sources))),{'sources':results})
            self.monitor.cleanup()
            errors=sum(r['status']=='error' or bool(r.get('archive_error')) for r in results)
            result=dict(sources=results,successful_sources=sum(r['status'] in {'fresh','cache'} for r in results),failed_sources=errors)
            self.store.progress(jid,'监控检查完成' if not errors else '监控完成，部分来源待重试',100,result,'partial' if errors else 'completed')
        except Exception:
            self.store.progress(jid,'监控任务失败',100,status='failed',error='监控处理失败，请查看来源状态')

    def heartbeat(self):
        while not self.stop.is_set():
            self.store.set_settings({'_monitor_heartbeat':now()})
            self.stop.wait(10)

    def run(self):
        with open(self.store.path.with_suffix('.monitor.lock'),'w') as lock:
            try: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            except BlockingIOError: raise SystemExit('Monitor Worker 已在运行')
            self.recover()
            for sig in (signal.SIGTERM,signal.SIGINT): signal.signal(sig,lambda *_: self.stop.set())
            threading.Thread(target=self.heartbeat,daemon=True).start()
            print('[monitor] ready',flush=True)
            while not self.stop.is_set():
                self.schedule()
                job=self.store.claim(monitor=True)
                if job: self.execute(job)
                else: self.stop.wait(2)
            self.store.set_settings({'_monitor_heartbeat':None})
