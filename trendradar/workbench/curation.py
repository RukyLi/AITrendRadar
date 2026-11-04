"""Evidence-backed AI admission and cross-language candidate retrieval."""
import json
import re
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
from typing import Literal

from pydantic import BaseModel, Field, StrictBool, ValidationError, field_validator
from .util import identity, now

REVIEW_INSTRUCTION = '''逐条审核是否实质涉及人工智能技术、模型、AI 编程、Agent、AI 产品、研究、产业或治理。
不能因出现“模型/开源/自动化/机器人”等泛词就判相关：数学/汽车模型、普通软件开源、无 AI 内容的机械装置和普通财经新闻不相关。
厂商来源不是通行证。资料不足或含义模糊为 uncertain；新闻仅有标题时，只能依据标题判断主题，不补造事实。
输出 {results:[{event_id,verdict:"relevant"|"irrelevant"|"uncertain",confidence:0到1,reason:中文简短理由,
source_ids:[本事件已提供的文章id],canonical_title:忠实英文事件标题,entities:[主要公司/模型/项目的规范英文名],
action:"release"|"update"|"research"|"funding"|"acquisition"|"partnership"|"security"|"policy"|"tutorial"|"discussion"|"other",topic_ids:[给定主题id]}]}。
canonical_title 必须保留具体主体、动作、模型版本与变体，不能把“研究/提问/教程/性能测试”改成“发布”。entities 不要填 AI/LLM 等泛词。
每个输入 event_id 恰好一个结果，来源引用只能用对应事件的文章id。reason 最多80字，canonical_title 最多35个英文词，entities最多5个。'''
MERGE_INSTRUCTION = '''核验每对中英文新闻是否描述同一件具体事情，而非仅有关联。只能依据原始标题和摘要；normalized_title 是辅助翻译，不是新增事实。
主体、动作、对象/版本、时间必须相容。不同模型版本/变体、不同实验/作者、教程与产品发布、同公司不同消息均不能合并。
两篇独立社区提问/体验即便讨论同模型也不是同一事件。仅报道角度不同或跨语言转载可以合并。缺少具体依据则 false。
输出 {pairs:[{key,same_event:true|false,confidence:0到1,reason:中文具体理由,source_ids:[支持判断的文章id]}]}。
只有明确属于同一事件且置信度至少0.93才给true；true必须引用左右两侧各至少一篇已给定文章，不能编造id。每个key恰好一个结果。'''


class Review(BaseModel):
    event_id: str
    verdict: Literal['relevant', 'irrelevant', 'uncertain']
    confidence: float = Field(ge=0, le=1)
    reason: str = Field(min_length=1, max_length=600)
    source_ids: list[str] = Field(min_length=1, max_length=12)
    canonical_title: str = Field(max_length=600)
    entities: list[str] = Field(max_length=8)
    action: Literal['release','update','research','funding','acquisition','partnership','security','policy','tutorial','discussion','other']
    topic_ids: list[str] = Field(max_length=10)

    @field_validator('action', mode='before')
    @classmethod
    def normalize_action(cls, value):
        # This is candidate retrieval metadata, never an admission verdict.
        # Unsupported labels such as "award" fall back to conservative verification.
        known={'release','update','research','funding','acquisition','partnership','security','policy','tutorial','discussion','other'}
        return value if not isinstance(value,str) or value in known else 'other'


class MergeDecision(BaseModel):
    key: str
    same_event: StrictBool
    confidence: float = Field(ge=0, le=1)
    reason: str = Field(min_length=1, max_length=1000)
    source_ids: list[str] = Field(max_length=24)


def entity_keys(names):
    aliases = {'智谱': 'zhipu', '智谱ai': 'zhipu', '阿里': 'alibaba', '谷歌': 'google',
               '通义千问': 'qwen', '千问': 'qwen', '字节跳动': 'bytedance', '深度求索': 'deepseek'}
    values = set()
    for name in names:
        normalized = re.sub(r'[^\w.]', '', str(name).casefold())[:100]
        normalized = aliases.get(normalized, normalized)
        if normalized and normalized not in {'ai','llm','model','模型','人工智能','agent','agents','research','open source','opensource'}:
            values.add(normalized)
            family = re.match(r'(gpt|glm|qwen|llama|gemma|gemini|claude|deepseek)', normalized)
            if family:
                values.add(family[1])
    return values


class Curation:
    def __init__(self, engine):
        self.engine, self.store = engine, engine.store

    def review(self, event_ids, force=False):
        events, hashes = {}, {}
        result = dict(accepted=0, rejected=0, uncertain=0, failed=0, cached=0, stale=0)
        for eid in dict.fromkeys(self.store.resolve(e) for e in event_ids):
            event = self.store.event(eid)
            if not event:
                continue
            fingerprint = self.store.fingerprint(eid)
            previous = event.get('relevance') or {}
            if not force and previous.get('content_hash') == fingerprint and previous.get('model') == self.engine.config.get('MODEL'):
                result['cached'] += 1
                continue
            events[eid], hashes[eid] = event, fingerprint
        if not events:
            return result
        topics = {t['id']: t['name'] for t in self.store.topics()}
        # Short local references avoid asking the model to copy opaque hashes.
        # Stored citations always map back to real, collected article identities.
        event_refs, article_refs, entries = {}, {}, []
        for i,(eid,event) in enumerate(events.items(),1):
            ref=f'E{i}';event_refs[ref]=eid;articles=[]
            for j,a in enumerate(event['articles'][:6],1):
                aid=f'{ref}A{j}';article_refs[aid]=a['id']
                articles.append(dict(id=aid,title=a['title'],summary=a['summary'][:1800],source=a['source_name'],
                                     source_type=a['publisher_label'],published_at=a['published_at']))
            entries.append(dict(event_id=ref,articles=articles))
        payload = {'topics':topics,'events':entries}
        valid = {item['event_id']: {a['id'] for a in item['articles']} for item in payload['events']}
        processed = set()
        try:
            data, cache_key = self.engine.json_call('relevance-v1', payload, REVIEW_INSTRUCTION, use_cache=not force)
            raw = data.get('results')
            if not isinstance(raw, list):
                raise ValueError('Invalid review batch')
            decisions = [Review.model_validate(item) for item in raw]
            if len({d.event_id for d in decisions}) != len(decisions) or any(d.event_id not in event_refs for d in decisions):
                raise ValueError('Mismatched review identities')
            # Validate the entire response before persisting or caching any judgment.
            for d in decisions:
                if not set(d.source_ids) <= valid[d.event_id] or not set(d.topic_ids) <= topics.keys():
                    raise ValueError('Invalid review references')
                if d.verdict == 'relevant' and not d.canonical_title.strip():
                    raise ValueError('Missing semantic title')
            by_id = {event_refs[d.event_id]: d.model_copy(update={'event_id':event_refs[d.event_id],
                      'source_ids':[article_refs[aid] for aid in d.source_ids]}) for d in decisions}
            if len(by_id) == len(events):
                self.engine.cache(cache_key, data)
            for eid in events:
                if eid not in by_id:
                    self._failed(eid, hashes[eid], '模型未返回该条资讯的判断，可重试'); result['failed'] += 1
                    processed.add(eid)
                    continue
                decision = by_id[eid]
                status = 'accepted' if decision.verdict == 'relevant' and decision.confidence >= .8 else 'rejected' if decision.verdict == 'irrelevant' and decision.confidence >= .8 else 'uncertain'
                value = decision.model_dump()
                value.update(model=self.engine.config.get('MODEL',''), reviewed_at=now(), content_hash=hashes[eid], method='model')
                with self.store.connect() as db:
                    db.execute('BEGIN IMMEDIATE')
                    if not self.store._row(db, 'events', eid) or self.store.fingerprint(eid, db) != hashes[eid]:
                        result['stale'] += 1
                        processed.add(eid)
                        continue
                    db.execute("UPDATE events SET relevance_status=?,relevance=?,review_hash=?,review_error='',review_retry_at=NULL,changed_at=? WHERE id=?",
                               (status, json.dumps(value,ensure_ascii=False), cache_key, now(), eid))
                    db.execute('DELETE FROM event_entities WHERE event_id=?', (eid,))
                    if status == 'accepted':
                        db.executemany('INSERT OR IGNORE INTO event_entities VALUES(?,?)', [(eid,key) for key in entity_keys(decision.entities)])
                    db.execute('INSERT OR REPLACE INTO review_history VALUES(?,?,?,?,?,?,?)',
                               (identity('review',eid,cache_key,datetime.now(timezone.utc).isoformat()),eid,hashes[eid],status,value['model'],json.dumps(value,ensure_ascii=False),now()))
                    self.store._index(db, eid)
                result[status] += 1
                processed.add(eid)
        except Exception as exc:
            # Never expose provider exception text, headers or credentials.
            reason = '模型返回字段不完整或格式不正确，可重试' if isinstance(exc,ValidationError) else '模型返回结构、事件标识或引用校验未通过，可重试' if isinstance(exc,ValueError) else '模型请求或审核保存未成功，可稍后重试'
            for eid in events.keys() - processed:
                self._failed(eid, hashes[eid], reason)
                result['failed'] += 1
        return result

    def _failed(self, eid, fingerprint, reason):
        with self.store.connect() as db:
            if not self.store._row(db, 'events', eid) or self.store.fingerprint(eid, db) != fingerprint:
                return
            retry = (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat()
            # A failed voluntary recheck must not erase an already-valid verdict.
            previous = self.store._row(db, 'events', eid)
            status = previous['relevance_status'] if previous['relevance'] else 'error'
            db.execute('UPDATE events SET relevance_status=?,review_error=?,review_retry_at=?,changed_at=? WHERE id=?',
                       (status,reason,retry,now(),eid))

    def candidate_pairs(self, event_ids, limit=80):
        pairs = {}
        for eid in dict.fromkeys(self.store.resolve(e) for e in event_ids):
            event = self.store.event(eid)
            if not event or event['relevance_status'] != 'accepted' or not event['relevance']:
                continue
            profile = event['relevance']
            entities = entity_keys(profile.get('entities', []))
            if not entities:
                continue
            with self.store.connect() as db:
                marks = ','.join('?' for _ in entities)
                candidates = db.execute(f"SELECT DISTINCT e.id FROM events e JOIN event_entities ee ON ee.event_id=e.id WHERE ee.entity IN ({marks}) AND e.relevance_status='accepted' AND e.id!=? AND ABS(julianday(e.updated_at)-julianday(?))<=7 ORDER BY e.updated_at DESC LIMIT 150", (*sorted(entities),eid,event['updated_at'])).fetchall()
            title = profile['canonical_title'].casefold()
            words = set(re.findall(r'[a-z0-9.]{3,}', title)) - {'the','and','with','for','new','from','its','model','models'}
            for candidate in candidates:
                other = self.store.event(candidate['id'])
                other_profile = other['relevance'] or {}
                other_title = other_profile.get('canonical_title', other['title']).casefold()
                if not self.engine.compatible_versions(event['title']+' '+title, other['title']+' '+other_title):
                    continue
                action, other_action = profile.get('action'), other_profile.get('action')
                if action != other_action and 'other' not in {action, other_action}:
                    continue
                other_words = set(re.findall(r'[a-z0-9.]{3,}', other_title)) - {'the','and','with','for','new','from','its','model','models'}
                similarity = SequenceMatcher(None,title,other_title).ratio()
                overlap = len(words & other_words) / max(1, min(len(words),len(other_words)))
                if similarity < .42 and overlap < .35:
                    continue
                sides = sorted([event, other],key=lambda item:item['id'])
                hashes = [self.store.fingerprint(side['id']) for side in sides]
                key = identity('merge-v2',MERGE_INSTRUCTION,self.engine.config.get('MODEL'),*hashes)
                with self.store.connect() as db:
                    if db.execute('SELECT 1 FROM merge_checks WHERE key=?',(key,)).fetchone():
                        continue
                if key not in pairs:
                    pairs[key] = dict(key=key,a=sides[0]['id'],b=sides[1]['id'],hashes=hashes,score=similarity+overlap,
                                      left=self._evidence(sides[0]),right=self._evidence(sides[1]))
        return sorted(pairs.values(),key=lambda p:p['score'],reverse=True)[:limit]

    @staticmethod
    def _evidence(event):
        return dict(normalized_title=event['relevance']['canonical_title'],articles=[
            dict(id=a['id'],title=a['title'],summary=a['summary'][:1800],published_at=a['published_at']) for a in event['articles'][:6]])

    def deduplicate(self, event_ids, limit=80):
        pairs = self.candidate_pairs(event_ids,limit)
        result = dict(merge_checked=0,merged=0,merge_failed=0)
        for offset in range(0,len(pairs),6):
            batch = pairs[offset:offset+6]
            payload, pair_refs, article_refs = [], {}, {}
            for i,pair in enumerate(batch,1):
                ref=f'P{i}';pair_refs[ref]=pair['key'];entry={'key':ref}
                for side in ('left','right'):
                    evidence=pair[side];articles=[]
                    for j,a in enumerate(evidence['articles'],1):
                        aid=f'{ref}{side[0].upper()}{j}';article_refs[aid]=a['id']
                        articles.append({**a,'id':aid})
                    entry[side]={**evidence,'articles':articles}
                payload.append(entry)
            try:
                data, cache_key = self.engine.json_call('merge-v2',payload,MERGE_INSTRUCTION)
                decisions = [MergeDecision.model_validate(d) for d in data['pairs']]
                if len(decisions)!=len(batch) or {d.key for d in decisions}!=set(pair_refs):
                    raise ValueError('Invalid merge batch')
                mapped = {pair_refs[d.key]:d.model_copy(update={'key':pair_refs[d.key],
                          'source_ids':[article_refs[aid] for aid in d.source_ids]}) for d in decisions}
                for pair in batch:
                    d = mapped[pair['key']]
                    left = {a['id'] for a in pair['left']['articles']}
                    right = {a['id'] for a in pair['right']['articles']}
                    ids = set(d.source_ids)
                    if not ids <= left | right or (d.same_event and (not ids & left or not ids & right)):
                        raise ValueError('Invalid merge evidence')
                self.engine.cache(cache_key,data)
                for pair in batch:
                    d = mapped[pair['key']]
                    a,b = self.store.resolve(pair['a']),self.store.resolve(pair['b'])
                    if a==b:
                        continue
                    # Recheck changed content and transitive merges; never apply a stale pair.
                    if [self.store.fingerprint(a),self.store.fingerprint(b)] != pair['hashes']:
                        continue
                    same = d.same_event and d.confidence >= .93
                    if same:
                        result['merged'] += self.engine.merge(a,b,d.model_dump(),expected_hashes=pair['hashes'])
                    with self.store.connect() as db:
                        db.execute('INSERT OR IGNORE INTO merge_checks VALUES(?,?)',(pair['key'],int(same)))
                    result['merge_checked'] += 1
            except Exception:
                result['merge_failed'] += len(batch)
        return result
