"""Same-origin API and built React application. Bind to loopback by default."""
import os
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, field_validator
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .feeds import validate_url
from .store import Store


class Input(BaseModel):
    model_config=ConfigDict(extra='forbid')


class StateInput(Input):
    is_read: bool | None=None
    bookmarked: bool | None=None


class SourceInput(Input):
    name: str=Field(min_length=1,max_length=100)
    url: str=Field(min_length=1,max_length=2000)
    enabled: bool=True
    category: str=Field(default='自定义',max_length=40)

    @field_validator('url')
    @classmethod
    def public_url(cls,value): return validate_url(value)


class SourcePatch(Input):
    name: str | None=Field(default=None,min_length=1,max_length=100)
    url: str | None=Field(default=None,min_length=1,max_length=2000)
    enabled: bool | None=None
    category: str | None=Field(default=None,max_length=40)

    @field_validator('url')
    @classmethod
    def public_url(cls,value): return validate_url(value) if value else value


class TopicInput(Input):
    name: str=Field(min_length=1,max_length=40)
    keywords: str=Field(min_length=1,max_length=2000)
    color: str=Field(default='#5c7d72',pattern=r'^#[0-9a-fA-F]{6}$')
    followed: bool=True


class SettingsInput(Input):
    monitor_enabled: bool | None=None
    monitor_retention_days: int | None=Field(default=None,ge=7,le=90)
    interval_minutes: int | None=Field(default=None,ge=10,le=1440)
    schedule_enabled: bool | None=None
    brief_hour: int | None=Field(default=None,ge=0,le=23)
    ai_enabled: bool | None=None
    auto_analyze_limit: int | None=Field(default=None,ge=0,le=20)
    initial_days: int | None=Field(default=None,ge=1,le=30)
    per_source_limit: int | None=Field(default=None,ge=1,le=50)


class JobInput(Input):
    kind: Literal['update','brief','analyze','source_test','curate','review','monitor_update','monitor_test']='update'
    target: str=Field(default='',max_length=100)


def create_app(root=None, store=None):
    root=Path(root or os.getenv('RADAR_ROOT',Path.cwd())).resolve()
    store=store or Store(root)

    @asynccontextmanager
    async def lifespan(app):
        store.initialize()
        store.import_archives()
        yield

    app=FastAPI(title='AITrendRadar Workbench',version='1.0.0',lifespan=lifespan)
    app.state.store=store
    from .monitor_api import router
    app.include_router(router(store))
    app.add_middleware(TrustedHostMiddleware,allowed_hosts=os.getenv('RADAR_ALLOWED_HOSTS','localhost,127.0.0.1,[::1],testserver').split(','))

    @app.middleware('http')
    async def same_origin(request:Request,call_next):
        origin=request.headers.get('origin')
        if request.method not in {'GET','HEAD','OPTIONS'} and origin:
            allowed={f'{request.url.scheme}://{request.headers.get("host","")}', 'http://127.0.0.1:5173','http://localhost:5173'}
            allowed.update(filter(None,os.getenv('RADAR_ALLOWED_ORIGINS','').split(',')))
            if origin not in allowed: return JSONResponse({'detail':'拒绝跨站修改请求'},status_code=403)
        response=await call_next(request)
        response.headers['X-Content-Type-Options']='nosniff'
        response.headers['Referrer-Policy']='strict-origin-when-cross-origin'
        response.headers['X-Frame-Options']='DENY'
        if request.url.path.startswith('/api/'): response.headers['Cache-Control']='no-store'
        return response

    @app.get('/api/v1/health')
    def health(): return {'status':'ok','worker_heartbeat':store.internal('_worker_heartbeat'), 'monitor_heartbeat':store.internal('_monitor_heartbeat')}

    @app.get('/api/v1/meta')
    def meta(): return store.meta()

    @app.get('/api/v1/events')
    def events(q:str=Query('',max_length=200),topic:str='',source:str='',view:Literal['all','today','following','saved','unread','archive','library']='all',sort:Literal['recommended','latest']='recommended',days:int=Query(0,ge=0,le=3650),start:date|None=None,end:date|None=None,page:int=Query(1,ge=1),limit:int=Query(40,ge=1,le=100),since:str=Query('',max_length=40),review:Literal['','pending','accepted','rejected','uncertain','error','unreviewed']=''):
        return store.events(q,topic,source,view,sort,days,str(start) if start else '',str(end) if end else '',page,limit,since,review)

    @app.get('/api/v1/events/{eid}')
    def event(eid:str):
        value=store.event(eid)
        if not value: raise HTTPException(404,'事件不存在')
        return value

    @app.patch('/api/v1/events/{eid}/state')
    def state(eid:str,body:StateInput):
        if not store.event(eid): raise HTTPException(404,'事件不存在')
        return store.state(eid,body.model_dump(exclude_none=True))

    @app.get('/api/v1/articles')
    def articles(q:str=Query('',max_length=200),source:str='',page:int=Query(1,ge=1),limit:int=Query(40,ge=1,le=100),start:date|None=None,end:date|None=None):
        return store.articles(q,source,page,limit,str(start) if start else '',str(end) if end else '')

    @app.get('/api/v1/articles/{aid}')
    def article(aid:str):
        with store.connect() as db:
            row=db.execute('SELECT event_id FROM articles WHERE id=?',(aid,)).fetchone()
        if not row: raise HTTPException(404,'文章不存在')
        return next(a for a in store.event(row[0])['articles'] if a['id']==aid)

    @app.get('/api/v1/sources')
    def sources(): return store.sources()

    @app.post('/api/v1/sources',status_code=201)
    def add_source(body:SourceInput):
        value=store.save_source(body.model_dump())
        return next(s for s in store.sources() if s['id']==value['id'])

    @app.patch('/api/v1/sources/{sid}')
    def update_source(sid:str,body:SourcePatch):
        source=store.source(sid)
        if not source: raise HTTPException(404,'来源不存在')
        if source['kind']=='x' and body.enabled: raise HTTPException(409,'X 接入等待官方 API 凭证与预算')
        if source['kind']!='rss' and body.url is not None: raise HTTPException(422,'仅 RSS 来源可编辑订阅地址')
        store.save_source(body.model_dump(exclude_none=True),sid)
        return next(s for s in store.sources() if s['id']==sid)

    @app.get('/api/v1/topics')
    def topics(): return store.topics()

    @app.post('/api/v1/topics',status_code=201)
    def add_topic(body:TopicInput): return store.save_topic(body.model_dump())

    @app.put('/api/v1/topics/{tid}')
    def update_topic(tid:str,body:TopicInput):
        if not any(t['id']==tid for t in store.topics()): raise HTTPException(404,'主题不存在')
        return store.save_topic(body.model_dump(),tid)

    @app.delete('/api/v1/topics/{tid}',status_code=204)
    def delete_topic(tid:str):
        with store.connect() as db: db.execute('DELETE FROM topics WHERE id=?',(tid,))

    @app.get('/api/v1/settings')
    def settings():
        return store.settings()

    @app.patch('/api/v1/settings')
    def update_settings(body:SettingsInput): return store.set_settings(body.model_dump(exclude_none=True))

    @app.get('/api/v1/jobs')
    def jobs(): return store.jobs()

    @app.get('/api/v1/jobs/{jid}')
    def job(jid:str):
        value=store.jobs(jid)
        if not value: raise HTTPException(404,'任务不存在')
        return value

    @app.post('/api/v1/jobs',status_code=202)
    def enqueue(body:JobInput):
        if body.kind in {'monitor_update','monitor_test'}:
            from .monitor import Monitor
            if body.target and not Monitor(store).source(body.target): raise HTTPException(404,'监控来源不存在')
            return store.enqueue(body.kind,body.target)
        if body.kind in {'analyze','review','curate'} and not store.settings()['ai_enabled']:
            raise HTTPException(409,'请先在设置中开启 AI 审核与解读')
        if body.kind in {'analyze','review'}:
            if not store.settings()['ai_enabled']: raise HTTPException(409,'请先在设置中开启 AI 解读')
            if not store.event(body.target): raise HTTPException(404,'事件不存在')
            target=store.resolve(body.target)
        elif body.kind=='source_test':
            source=store.source(body.target)
            if not source: raise HTTPException(404,'来源不存在')
            if source['kind']=='x': raise HTTPException(409,'X API 尚未接入')
            from .monitor import Monitor
            monitored=next((s for s in Monitor(store).sources() if s['source_id']==body.target),None)
            if monitored: return store.enqueue('monitor_test',monitored['id'])
            target=body.target
        elif body.kind=='brief':
            from datetime import datetime
            from zoneinfo import ZoneInfo
            target=datetime.now(ZoneInfo('Asia/Shanghai')).date().isoformat()
        else: target=''
        return store.enqueue(body.kind,target)

    @app.get('/api/v1/briefs')
    def briefs(): return store.briefs()

    @app.get('/api/v1/briefs/{bid}')
    def brief(bid:str):
        value=store.briefs(bid)
        if not value: raise HTTPException(404,'简报不存在')
        return value

    @app.get('/api/v1/reports')
    def reports():
        folder=root/'output/html'
        paths=sorted(folder.rglob('*.html'),key=lambda p:p.stat().st_mtime,reverse=True)[:50] if folder.exists() else []
        return [{'name':str(p.relative_to(folder)),'url':'/reports/'+p.relative_to(folder).as_posix()} for p in paths]

    report_dir=root/'output/html'
    report_dir.mkdir(parents=True,exist_ok=True)
    app.mount('/reports',StaticFiles(directory=report_dir),name='reports')
    dist=root/'frontend/dist'
    if (dist/'assets').exists(): app.mount('/assets',StaticFiles(directory=dist/'assets'),name='assets')

    @app.get('/{path:path}',include_in_schema=False)
    def frontend(path:str):
        if path.startswith('api/'): raise HTTPException(404,'接口不存在')
        if not (dist/'index.html').exists(): return JSONResponse({'detail':'前端尚未构建，请运行 npm --prefix frontend run build'},status_code=503)
        return FileResponse(dist/'index.html',headers={'Cache-Control':'no-cache'})
    return app
