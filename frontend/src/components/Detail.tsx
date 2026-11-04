import { useState, type CSSProperties } from "react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import {
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  FileText,
  Globe2,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Type,
  Check,
} from "lucide-react";
import { time, type Event, type Article, type Brief } from "../api";
import { Hint, Empty } from "./Primitives";
import { SourceBadge, ReviewDetails } from "./Quality";

export function Detail({
  event: e,
  language,
  setLanguage,
  onBack,
  onState,
  onAnalyze,
  analyzing,
  onReview,
  reviewing,
  focused,
  onFocus,
  onPrevious,
  onNext,
  position,
}: {
  event: Event;
  language: "zh" | "original";
  setLanguage: (v: "zh" | "original") => void;
  onBack: () => void;
  onState: (p: Partial<Pick<Event, "bookmarked" | "is_read">>) => void;
  onAnalyze: () => void;
  analyzing: boolean;
  onReview: () => void;
  reviewing: boolean;
  focused: boolean;
  onFocus: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  position: string;
}) {
  const [fontSize, setFontSize] = useState(() => {
    const value = Number(localStorage.getItem("radar-reader-size"));
    return [16, 18, 20].includes(value) ? value : 18;
  });
  const ai = e.analysis,
    zh = language === "zh";
  const citations = (ids: string[]) =>
    ids
      .map((id) => (e.articles || []).find((a) => a.id === id))
      .filter((a): a is Article => !!a);
  return (
    <>
      <div className="detail-toolbar">
        <button
          className="back-btn icon-btn"
          onClick={onBack}
          aria-label="返回列表"
        >
          <ArrowLeft size={19} />
        </button>
        <div className="reader-navigation">
          <Hint label="上一篇 · K">
            <button
              className="icon-btn"
              aria-label="上一篇"
              disabled={!onPrevious}
              onClick={onPrevious}
            >
              <ChevronLeft size={18} />
            </button>
          </Hint>
          <span>{position}</span>
          <Hint label="下一篇 · J">
            <button
              className="icon-btn"
              aria-label="下一篇"
              disabled={!onNext}
              onClick={onNext}
            >
              <ChevronRight size={18} />
            </button>
          </Hint>
        </div>
        <div className="detail-actions">
          <div className="language-switch" aria-label="阅读语言">
            <button
              aria-pressed={zh}
              className={zh ? "active" : ""}
              onClick={() => setLanguage("zh")}
            >
              中文
            </button>
            <button
              aria-pressed={!zh}
              className={!zh ? "active" : ""}
              onClick={() => setLanguage("original")}
            >
              原文
            </button>
          </div>
          <span className="toolbar-divider" />
          <Dropdown.Root>
            <Dropdown.Trigger className="icon-btn" aria-label="阅读字号">
              <Type size={18} />
            </Dropdown.Trigger>
            <Dropdown.Portal>
              <Dropdown.Content className="dropdown type-menu" align="end">
                <Dropdown.Label>阅读字号</Dropdown.Label>
                {[
                  [16, "标准"],
                  [18, "舒适"],
                  [20, "大字"],
                ].map(([size, label]) => (
                  <Dropdown.Item
                    key={size}
                    onSelect={() => {
                      setFontSize(Number(size));
                      localStorage.setItem("radar-reader-size", String(size));
                    }}
                  >
                    <span>{label}</span>
                    {fontSize === size && <Check size={14} />}
                  </Dropdown.Item>
                ))}
              </Dropdown.Content>
            </Dropdown.Portal>
          </Dropdown.Root>
          <Hint label={e.is_read ? "标记未读" : "标记已读"}>
            <button
              className="icon-btn read-state-button"
              aria-label={e.is_read ? "标记未读" : "标记已读"}
              onClick={() => onState({ is_read: e.is_read ? 0 : 1 })}
            >
              <CheckCheck size={18} />
            </button>
          </Hint>
          <Hint label={e.bookmarked ? "取消收藏 · B" : "稍后再读 · B"}>
            <button
              className={"icon-btn " + (e.bookmarked ? "is-saved" : "")}
              aria-label={e.bookmarked ? "取消收藏详情" : "收藏此事件"}
              aria-pressed={!!e.bookmarked}
              onClick={() => onState({ bookmarked: e.bookmarked ? 0 : 1 })}
            >
              <Bookmark
                size={18}
                fill={e.bookmarked ? "currentColor" : "none"}
              />
            </button>
          </Hint>
          <Hint label={focused ? "退出专注 · F" : "专注阅读 · F"}>
            <button
              className="icon-btn focus-button"
              aria-label={focused ? "退出专注阅读" : "专注阅读"}
              aria-pressed={focused}
              onClick={onFocus}
            >
              {focused ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            </button>
          </Hint>
        </div>
      </div>
      <div className="detail-scroll" key={e.id}>
        <article
          className="story"
          style={{ "--reader-size": `${fontSize}px` } as CSSProperties}
        >
          <div className="story-kicker">
            <span className="publication-mark">
              {e.sources[0]?.name.replace("r/", "").slice(0, 1) || "R"}
            </span>
            <span>{e.sources[0]?.name || "订阅来源"}</span>
            <SourceBadge source={e.sources[0]} />
            {e.source_count > 1 && (
              <span>与另外 {e.source_count - 1} 个来源</span>
            )}
            <span className="story-topic">{e.topics[0]?.name || "综合"}</span>
          </div>
          <h1>{zh && ai ? ai.title_zh : e.title}</h1>
          <div className="story-meta">
            <span>{time(e.updated_at, true)}</span>
            <span className="meta-dot">·</span>
            <span>{zh && ai ? "中文摘要" : "原始资料"}</span>
            {e.articles?.[0]?.url && (
              <a href={e.articles[0].url} target="_blank" rel="noreferrer">
                阅读原文 <ArrowUpRight size={13} />
              </a>
            )}
          </div>
          <ReviewDetails event={e} onReview={onReview} busy={reviewing} />
          {zh && ai ? (
            <>
              <p className="story-lead">{ai.summary_zh}</p>
              <section className="story-section">
                <h2>要点</h2>
                <div className="key-points">
                  {ai.points.map((p, i) => (
                    <div className="key-point" key={i}>
                      <span className="point-bullet" />
                      <div>
                        <p>{p.text}</p>
                        <div className="point-citations">
                          {citations(p.source_ids).map((a) => (
                            <a
                              key={a.id}
                              href={a.url || undefined}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {a.source_name}
                              <ArrowUpRight size={11} />
                            </a>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              {ai.why_it_matters && (
                <section className="story-section perspective">
                  <h2>背景与影响</h2>
                  <p>{ai.why_it_matters}</p>
                </section>
              )}
            </>
          ) : (
            <>
              <p className="story-lead">
                {e.summary || "目前只收录了标题，完整内容可在原始来源阅读。"}
              </p>
              {zh && (
                <div className="analysis-pending">
                  <div>
                    <strong>
                      {e.ai_status === "error"
                        ? "摘要暂未生成"
                        : "需要中文摘要？"}
                    </strong>
                    <p>
                      {e.ai_status === "error"
                        ? e.analysis_error
                        : "根据当前收录的资料整理要点。"}
                    </p>
                  </div>
                  <button
                    className="button secondary"
                    disabled={analyzing || e.ai_status === "running"}
                    onClick={onAnalyze}
                  >
                    {analyzing || e.ai_status === "running" ? (
                      <>
                        <LoaderCircle className="spin" size={14} />
                        生成中
                      </>
                    ) : (
                      "生成摘要"
                    )}
                  </button>
                </div>
              )}
            </>
          )}
          <section className="story-section sources-section">
            <div className="section-heading">
              <h2>来源</h2>
              <span>{e.articles?.length} 篇报道</span>
            </div>
            <div className="source-articles">
              {e.articles?.map((a) => (
                <div className="source-article" key={a.id}>
                  <span className="source-monogram">
                    {a.source_name.replace("r/", "").slice(0, 1)}
                  </span>
                  <div>
                    <div className="source-topline">
                      <strong>{a.source_name}</strong>
                      <span>{time(a.published_at)}</span>
                    </div>
                    <SourceBadge source={a} channel />
                    <a
                      href={a.url || undefined}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {a.title}
                      <ArrowUpRight size={14} />
                    </a>
                    {!zh && a.summary && (
                      <p className="original-excerpt">{a.summary}</p>
                    )}
                    <small>
                      {a.summary ? "RSS 摘要" : "仅标题"}
                      {a.rank ? ` · 平台排名 #${a.rank}` : ""}
                      {a.source_id.startsWith("reddit") ? " · 社区订阅" : ""}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          </section>
          {!!e.merges?.length && (
            <details className="reading-disclosure merge-history">
              <summary>
                事件聚合依据<span>{e.merges.length} 次合并</span>
              </summary>
              {e.merges.map((merge) => (
                <div key={merge.id}>
                  <p>{merge.reason}</p>
                  <div className="point-citations">
                    {citations(merge.evidence).map((a) => (
                      <a
                        key={a.id}
                        href={a.url || undefined}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {a.source_name} ↗
                      </a>
                    ))}
                  </div>
                  <small>
                    {merge.model.replace("openai/", "")} ·{" "}
                    {time(merge.created_at)}
                  </small>
                </div>
              ))}
            </details>
          )}
          {!!e.timeline?.length && (
            <details className="reading-disclosure">
              <summary>
                热榜记录 <span>{e.timeline.length}</span>
              </summary>
              <div className="timeline">
                {e.timeline.slice(0, 8).map((t, i) => (
                  <div key={i}>
                    <span>{time(t.observed_at)}</span>
                    <strong>{t.source_name}</strong>
                    <small>#{t.rank}</small>
                  </div>
                ))}
              </div>
            </details>
          )}
          <details className="reading-disclosure evidence-note">
            <summary>
              关于这份资料<span>{ai ? "AI 辅助整理" : "订阅摘录"}</span>
            </summary>
            <p>
              {ai?.limitations ||
                "当前依据为已采集标题与订阅摘要，未读取所有网站全文。请对照原始来源判断。"}
            </p>
            {ai && (
              <small>
                {ai.evidence} · {ai.model.replace("openai/", "")} ·{" "}
                {time(ai.generated_at)}
              </small>
            )}
          </details>
          <div className="reading-end">
            <span>已读至文末</span>
            {onNext && (
              <button className="text-btn" onClick={onNext}>
                下一篇 <ChevronRight size={15} />
              </button>
            )}
          </div>
        </article>
      </div>
    </>
  );
}

export function BriefDetail({
  brief: b,
  onChoose,
}: {
  brief: Brief;
  onChoose: (id: string) => void;
}) {
  return (
    <>
      <div className="detail-toolbar">
        <span className="detail-context">
          <FileText size={16} />
          每日简报
        </span>
        <span className="subtle">
          {time(b.created_at)} · 版本 {b.version}
        </span>
      </div>
      <div className="detail-scroll">
        <article className="story brief-story">
          <div className="eyebrow">每日简报 · {b.date}</div>
          <h1>{b.content.title}</h1>
          <p className="brief-intro">{b.content.intro}</p>
          {b.content.highlights?.map((p, i) => (
            <div className="brief-highlight" key={i}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              <div>
                <p>{p.text}</p>
                {p.event_ids.map((id) => (
                  <button
                    key={id}
                    className="inline-link"
                    onClick={() => onChoose(id)}
                  >
                    查看依据事件
                    <ArrowUpRight size={12} />
                  </button>
                ))}
              </div>
            </div>
          ))}
          <section className="story-section">
            <h2>值得跟进的事件</h2>
            {b.content.items.map((item, i) => (
              <button
                className="brief-event"
                key={item.id}
                onClick={() => onChoose(item.id)}
              >
                <span>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{item.title}</h3>
                  <p>
                    {item.summary ||
                      `${item.source_count} 个来源，点击阅读详情。`}
                  </p>
                </div>
                <ArrowUpRight size={17} />
              </button>
            ))}
            {!b.content.items.length && (
              <Empty title="最近 24 小时暂无匹配事件">
                更新来源后可以生成新版本简报。
              </Empty>
            )}
          </section>
          <div className="evidence-note">
            <Globe2 size={16} />
            <p>{b.content.limitations}</p>
          </div>
        </article>
      </div>
    </>
  );
}
