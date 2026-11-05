from datetime import date
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator

from .monitor import Monitor


class Input(BaseModel):
    model_config=ConfigDict(extra='forbid')


class SourcePatch(Input):
    enabled: bool | None=None
    subscribed: bool | None=None


class Order(Input):
    ids: list[str]=Field(max_length=100)


class Watch(Input):
    name: str=Field(min_length=1,max_length=80)
    keywords: list[str]=Field(min_length=1,max_length=30)
    excludes: list[str]=Field(default_factory=list,max_length=30)
    sources: list[str]=Field(default_factory=list,max_length=50)
    enabled: bool=True
    rise_threshold: int=Field(default=5,ge=1,le=29)

    @field_validator('keywords','excludes','sources')
    @classmethod
    def terms(cls, values):
        if any(not v.strip() or len(v)>100 for v in values): raise ValueError('关键词或来源不能为空，最长 100 字')
        return list(dict.fromkeys(v.strip() for v in values))


class AlertState(Input):
    is_read: bool=True


def router(store):
    monitor=Monitor(store)
    api=APIRouter(prefix='/api/v1/monitor')

    @api.get('/sources')
    def sources(): return monitor.sources()

    @api.put('/sources/order')
    def order(body:Order):
        try: monitor.reorder(body.ids)
        except ValueError as exc: raise HTTPException(422,str(exc))
        return monitor.sources()

    @api.patch('/sources/{sid}')
    def configure(sid:str,body:SourcePatch):
        if not monitor.source(sid): raise HTTPException(404,'来源不存在')
        return monitor.configure(sid,body.model_dump(exclude_none=True))

    @api.get('/boards')
    def boards(category:str='',source:str='',q:str=Query('',max_length=200),subscribed:bool=True,mode:Literal['','hottest','realtime']='hottest',include_disabled:bool=False):
        return monitor.boards(category,source,q,subscribed,mode,include_disabled)

    @api.get('/changes')
    def changes(since:int=Query(0,ge=0),source:str='',category:str='',mode:Literal['','hottest','realtime']='',q:str=Query('',max_length=200),watched:bool=False,subscribed:bool=True):
        return monitor.changes(since,source,category,mode,q,watched,subscribed)

    @api.get('/timeline')
    def timeline(q:str=Query('',max_length=200),source:str='',category:str='',page:int=Query(1,ge=1),limit:int=Query(40,ge=1,le=100),watched:bool=False):
        return monitor.timeline(q,source,category,page,limit,watched)

    @api.get('/history')
    def history(source:str='',q:str=Query('',max_length=200),category:str='',start:date|None=None,end:date|None=None,
                page:int=Query(1,ge=1),limit:int=Query(30,ge=1,le=100),item:str='',snapshot:int|None=Query(None,ge=1)):
        return monitor.history(source,q,str(start) if start else '',str(end) if end else '',page,limit,item,snapshot,category)

    @api.get('/watches')
    def watches(): return monitor.watches()

    def validate(body):
        if set(body.sources)-{s['id'] for s in monitor.sources()}: raise HTTPException(422,'关注规则包含未知来源')

    @api.post('/watches',status_code=201)
    def add_watch(body:Watch):
        validate(body)
        return monitor.save_watch(body.model_dump())

    @api.put('/watches/{wid}')
    def edit_watch(wid:str,body:Watch):
        if not any(r['id']==wid for r in monitor.watches()): raise HTTPException(404,'关注规则不存在')
        validate(body)
        return monitor.save_watch(body.model_dump(),wid)

    @api.delete('/watches/{wid}',status_code=204)
    def delete_watch(wid:str):
        with store.connect() as db: db.execute('DELETE FROM monitor_watches WHERE id=?',(wid,))

    @api.get('/alerts')
    def alerts(page:int=Query(1,ge=1),limit:int=Query(40,ge=1,le=100)): return monitor.alerts(page,limit)

    @api.patch('/alerts/{aid}')
    def read_alert(aid:int,body:AlertState):
        with store.connect() as db:
            if not db.execute('UPDATE monitor_alerts SET is_read=? WHERE id=?',(body.is_read,aid)).rowcount:
                raise HTTPException(404,'提醒不存在')
        return {'id':aid,'is_read':body.is_read}

    return api
