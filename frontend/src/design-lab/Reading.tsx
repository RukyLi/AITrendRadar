import { useEffect, useRef, useState } from "react";
import {
  BlossomCarousel,
  BlossomNext,
  BlossomPrev,
} from "@blossom-carousel/react";
import "@blossom-carousel/react/style.css";
import { demoDate, resolveStory, topicNames, type Story } from "./data";
import { useLab } from "./state";
import {
  Badge,
  Button,
  Empty,
  Icon,
  IconButton,
  SaveButton,
  SearchField,
  Segments,
  Sticker,
} from "./ui";

export function filteredStories(
  all: Story[],
  query: string,
  category: string,
  from = "",
  to = "",
) {
  return all.filter(
    (s) =>
      (!query ||
        (s.title + s.summary + s.sources.map((v) => v.name).join(""))
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (category === "全部" || s.topics.some((t) => t.name === category)) &&
      (!from || demoDate >= from) &&
      (!to || demoDate <= to),
  );
}
export function StoryCard({
  story,
  row = false,
  index = 0,
}: {
  story: Story;
  row?: boolean;
  index?: number;
}) {
  const { openStory, prefs, route } = useLab();
  const read = prefs.read.includes(story.id);
  return (
    <article
      className={
        "lab-story-card tone-" +
        story.color +
        (row ? " lab-story-row" : "") +
        (route.item === story.id ? " selected" : "") +
        (read ? " is-read" : "")
      }
      data-story={story.id}
    >
      <div className="lab-story-top">
        <Badge>{story.topics[0].name}</Badge>
        <SaveButton id={story.id} />
      </div>
      <button
        className="lab-story-open"
        onClick={() => openStory(story.id)}
        aria-label={"阅读：" + story.title}
      >
        {!row && (
          <div className="lab-story-symbol" aria-hidden="true">
            <span>{["◎", "⌘", "↗", "{}"][story.color]}</span>
            <small>{story.kicker}</small>
          </div>
        )}
        <h3>
          {!read && <i className="lab-unread" />}
          {story.title}
        </h3>
        <p>{story.summary}</p>
        <span className="lab-story-bottom">
          <span>
            {story.sources[0].name} <span className="lab-mid-dot">·</span>{" "}
            {story.source_count} 个来源
          </span>
          <span>{story.minutes}</span>
        </span>
      </button>
      {!row && route.concept === "d" && index === 1 && (
        <Sticker kind="star" className="lab-card-sticker" />
      )}
    </article>
  );
}
export function DailyCard({ big = false }: { big?: boolean }) {
  const { go } = useLab();
  return (
    <section className={"lab-daily-card " + (big ? "big" : "")}>
      <div className="lab-daily-top">
        <Icon name="book" />
        <span>DAILY DIGEST</span>
        <span>06 NOV</span>
      </div>
      <h3>
        把今天的重点，
        <br />
        留在这一页。
      </h3>
      <p>
        模型的新进展，工具的新可能。
        <br />
        一份适合慢慢读的 AI 简报。
      </p>
      <button onClick={() => go("briefs")} className="lab-text-link">
        阅读今日简报 <Icon name="arrow" size={18} />
      </button>
      <Sticker kind="arch" />
    </section>
  );
}
function Featured({ story }: { story: Story }) {
  const { openStory, route } = useLab();
  return (
    <section className={"lab-featured tone-" + story.color}>
      <div className="lab-featured-content">
        <span className="lab-eyebrow">
          <Icon name="bolt" size={16} /> 今日重点 · {story.kicker}
        </span>
        <h2>{story.title}</h2>
        <p>{story.summary}</p>
        <Button tone="primary" onClick={() => openStory(story.id)} icon="arrow">
          展开这件事
        </Button>
        <span className="lab-featured-source">
          {story.sources[0].name} 等 {story.source_count} 个来源
        </span>
      </div>
      <div className="lab-featured-art" aria-hidden="true">
        {route.concept === "d" ? (
          <>
            <Sticker kind="star" />
            <Sticker kind="flower" />
          </>
        ) : (
          <>
            <span className="lab-orbit-ring" />
            <span className="lab-orbit-ring second" />
            <span className="lab-orbit-letter">
              ai<span>on device.</span>
            </span>
          </>
        )}
      </div>
    </section>
  );
}
export function ReadingToolbar({ saved = false }: { saved?: boolean }) {
  const { route, navigate } = useLab();
  const [filters, setFilters] = useState(false);
  return (
    <>
      <div className="lab-reading-toolbar">
        {!saved && (
          <Segments
            label="AI 事件视图"
            value={
              ["all", "following", "latest"].includes(route.tab)
                ? route.tab
                : "all"
            }
            items={[
              { value: "all", label: "为你精选" },
              { value: "latest", label: "全部事件" },
              { value: "following", label: "关注主题" },
            ]}
            onChange={(tab) => navigate({ tab, item: "" })}
          />
        )}
        <div className="lab-inline-tools">
          <SearchField
            value={route.q}
            onChange={(q) => navigate({ q, item: "" }, true)}
          />
          <IconButton
            name="filter"
            label="筛选事件"
            aria-expanded={filters}
            onClick={() => setFilters((v) => !v)}
          />
        </div>
      </div>
      {filters && (
        <div className="lab-filter-panel">
          <label>
            开始日期
            <input
              type="date"
              value={route.from}
              onChange={(e) => navigate({ from: e.target.value }, true)}
            />
          </label>
          <label>
            结束日期
            <input
              type="date"
              value={route.to}
              onChange={(e) => navigate({ to: e.target.value }, true)}
            />
          </label>
          <Button
            onClick={() =>
              navigate({ from: "", to: "", q: "", category: "全部" })
            }
          >
            清除条件
          </Button>
        </div>
      )}
      <div className="lab-topic-tabs" aria-label="AI 主题筛选">
        {topicNames.map((t) => (
          <button
            className={route.category === t ? "active" : ""}
            key={t}
            aria-pressed={route.category === t}
            onClick={() => navigate({ category: t, item: "" })}
          >
            {t}
          </button>
        ))}
      </div>
    </>
  );
}
export function AIView({ saved = false }: { saved?: boolean }) {
  const { route, prefs, allStories, go, closeStory, reduced, update } =
    useLab();
  let source = saved
    ? prefs.bookmarks.map(resolveStory).filter((s): s is Story => !!s)
    : route.tab === "following"
      ? allStories.filter((s) =>
          s.topics.some((t) => prefs.followed.includes(t.name)),
        )
      : allStories;
  if (route.tab === "latest")
    source = [...source].sort((a, b) =>
      b.updated_at.localeCompare(a.updated_at),
    );
  const filtered = filteredStories(
    source,
    route.q,
    route.category,
    route.from,
    route.to,
  );
  const selected = filtered.find((s) => s.id === route.item) || filtered[0];
  const concept = route.concept;
  useEffect(() => {
    if (
      concept === "a" &&
      !saved &&
      matchMedia("(min-width: 1100px)").matches &&
      selected &&
      !prefs.read.includes(selected.id)
    ) {
      update({ read: [...prefs.read, selected.id] });
    }
    // Only a new visible selection marks it read; a manual unread action persists.
  }, [selected?.id, concept, saved]);
  if (concept === "b" && route.item && resolveStory(route.item))
    return (
      <div className="lab-full-reader">
        <Button icon="back" onClick={closeStory}>
          返回浏览
        </Button>
        <Reader story={resolveStory(route.item)!} />
      </div>
    );
  return (
    <div className={"lab-ai-view " + (saved ? "lab-saved-view" : "")}>
      <div className="lab-page-heading">
        <div>
          <span className="lab-eyebrow">
            {saved ? "YOUR COLLECTION" : "FRIDAY, NOVEMBER 06 · 演示精选"}
          </span>
          <h1>
            {saved
              ? "值得再读一次。"
              : concept === "d"
                ? "今天，有什么新鲜事？"
                : concept === "b"
                  ? "世界在变，保持好奇。"
                  : concept === "c"
                    ? "值得留意的，每一次变化。"
                    : "今天，值得你关注。"}
          </h1>
          <p>
            {saved
              ? "为有价值的想法，留一个位置。"
              : concept === "d"
                ? "新想法、新工具，还有让人眼前一亮的小发现。"
                : "从信息中找到线索，让重要的事情浮出水面。"}
          </p>
        </div>
        {concept === "d" && (
          <Sticker kind="flower" className="lab-heading-sticker" />
        )}
        <span className="lab-issue-number">
          VOL. 006
          <br />
          <strong>AI / RADAR</strong>
        </span>
      </div>
      {!saved &&
        !route.q &&
        route.category === "全部" &&
        route.tab === "all" &&
        (concept === "b" || concept === "d") && (
          <div className="lab-feature-row">
            {concept === "b" ? (
              <div className="lab-carousel-wrap">
                <BlossomCarousel
                  id="lab-feature-carousel"
                  className="lab-carousel"
                >
                  {source.slice(0, 3).map((s) => (
                    <div key={s.id} data-blossom-slide>
                      <Featured story={s} />
                    </div>
                  ))}
                </BlossomCarousel>
                <div className="lab-carousel-controls">
                  <span>三件值得留意的小事</span>
                  <BlossomPrev
                    for="lab-feature-carousel"
                    aria-label="上一条精选"
                    behavior={reduced ? "instant" : "auto"}
                  >
                    <Icon name="prev" />
                  </BlossomPrev>
                  <BlossomNext
                    for="lab-feature-carousel"
                    aria-label="下一条精选"
                    behavior={reduced ? "instant" : "auto"}
                  >
                    <Icon name="next" />
                  </BlossomNext>
                </div>
              </div>
            ) : (
              <Featured story={source[0]} />
            )}
            <DailyCard />
          </div>
        )}
      <ReadingToolbar saved={saved} />
      {concept === "a" && !saved ? (
        <div className="lab-split">
          <div className="lab-event-list" data-lab-scroll="events">
            <div className="lab-list-caption">
              <span>{filtered.length} 件值得关注的事</span>
              <Icon name="list" size={16} />
            </div>
            {filtered.map((s, i) => (
              <StoryCard key={s.id} story={s} row index={i} />
            ))}
            {!filtered.length && <Empty title="没有找到匹配内容" />}
          </div>
          <div
            className="lab-inline-reader"
            data-lab-scroll={"reader-" + selected?.id}
          >
            {selected ? (
              <Reader story={selected} />
            ) : (
              <Empty title="挑选一件值得关注的事" />
            )}
          </div>
        </div>
      ) : (
        <div
          className={
            "lab-feed-with-aside " + (concept === "b" ? "editorial" : "")
          }
        >
          <div
            className={
              "lab-events-grid " + (concept === "b" ? "lab-editorial-list" : "")
            }
          >
            {filtered.map((s, i) => (
              <StoryCard key={s.id} story={s} row={concept === "b"} index={i} />
            ))}
            {!filtered.length && (
              <Empty
                title={saved ? "收藏夹等待你的第一份灵感" : "没有找到匹配内容"}
                action={<Button onClick={() => go("ai")}>去发现新内容</Button>}
              />
            )}
          </div>
          {concept === "b" && (
            <aside className="lab-reading-aside">
              <span className="lab-eyebrow">YOUR INTERESTS</span>
              <h3>沿着兴趣，继续发现。</h3>
              <p>关注的主题会出现在你的个人信息流中。</p>
              <FollowTopics />
              <div className="lab-aside-note">
                <Icon name="rss" />
                <p>
                  每一个观点，
                  <br />
                  都应该找得到来源。
                </p>
                <Button icon="arrow" onClick={() => go("sources")}>
                  浏览来源
                </Button>
              </div>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
export function FollowTopics() {
  const { prefs, toggle } = useLab();
  return (
    <div className="lab-follow-topics">
      {topicNames.slice(1).map((t) => (
        <button
          key={t}
          aria-pressed={prefs.followed.includes(t)}
          onClick={() => toggle("followed", t)}
        >
          <span>{t}</span>
          <Icon
            name={prefs.followed.includes(t) ? "check" : "plus"}
            size={16}
          />
        </button>
      ))}
    </div>
  );
}
export function Reader({ story }: { story: Story }) {
  const { prefs, toggle, update } = useLab();
  const english = prefs.language === "original";
  const englishPoints = [
    "Start with a real use case, then compare capabilities and cost. A single demonstration is not a general result.",
    "Keep the original sources and timestamps so important conclusions can be verified.",
    "Try small, reversible steps first and document the limitations you encounter.",
  ];
  const [generated, setGenerated] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [why, setWhy] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setGenerated(false);
    setGenerating(false);
    if (timer.current) clearTimeout(timer.current);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [story.id]);
  const ready = story.ai_status === "ready" || generated;
  return (
    <article className="lab-reader" key={story.id}>
      <div className="lab-reader-tools">
        <Badge tone="good">演示解读</Badge>
        <span className="lab-reader-tool-spacer" />
        <IconButton
          name="eye"
          label={prefs.read.includes(story.id) ? "标为未读" : "标为已读"}
          aria-pressed={prefs.read.includes(story.id)}
          onClick={() => toggle("read", story.id)}
        />
        <SaveButton id={story.id} />
        <Button
          onClick={() =>
            update({ language: prefs.language === "zh" ? "original" : "zh" })
          }
        >
          {prefs.language === "zh" ? "EN" : "中文"}
        </Button>
      </div>
      <div className="lab-reader-body">
        <span className="lab-eyebrow">{story.kicker}</span>
        <h1>{prefs.language === "zh" ? story.title : story.original}</h1>
        <div className="lab-reader-meta">
          <span>{story.sources[0].name}</span>
          <span>
            {story.source_count} {english ? "demo sources" : "个演示来源"}
          </span>
          <span>{english ? "3 min read" : "约 3 分钟阅读"}</span>
        </div>
        <p className="lab-reader-lede">
          {prefs.language === "zh"
            ? story.summary
            : "This is a design preview, using a fixed editorial example. Explore the reading layout, source references and interaction states without changing your real news collection."}
        </p>
        {!ready ? (
          <div className="lab-callout">
            <Icon name="clock" />
            <div>
              <h3>
                {english
                  ? "This story is waiting for analysis"
                  : "这件事还在等待解读"}
              </h3>
              <p>
                {english
                  ? "Try the completed state with a local simulation. No model is called."
                  : "点击体验生成完成后的页面状态，不会调用模型。"}
              </p>
              <Button
                busy={generating}
                icon="bolt"
                onClick={() => {
                  setGenerating(true);
                  timer.current = setTimeout(() => {
                    setGenerated(true);
                    setGenerating(false);
                  }, 800);
                }}
              >
                {english ? "Generate demo analysis" : "生成示例解读"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <section>
              <button
                className="lab-reader-section-toggle"
                aria-expanded={why}
                onClick={() => setWhy((v) => !v)}
              >
                <h2>{english ? "Why it matters" : "为什么值得关注"}</h2>
                <Icon name={why ? "up" : "down"} size={18} />
              </button>
              {why && (
                <p>
                  {english
                    ? "Understand technical progress through actual use. Verifiable capabilities, running costs and limitations are more useful than a polished demonstration alone."
                    : story.analysis?.why_it_matters}
                </p>
              )}
            </section>
            <section>
              <h2>
                {english ? "Three things to keep in mind" : "三个关键线索"}
              </h2>
              <ol className="lab-key-points">
                {story.analysis?.points.map((point, i) => (
                  <li key={i}>
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    <p>
                      {english ? englishPoints[i] : point.text}{" "}
                      <a
                        href={"#lab-ref-" + story.id}
                        aria-label={"查看第 " + (i + 1) + " 条依据的引用"}
                      >
                        [1]
                      </a>
                    </p>
                  </li>
                ))}
              </ol>
            </section>
            <blockquote>
              {english
                ? "Turn impressive demonstrations into something that is useful to you."
                : "把“看起来很厉害”，变成“确实对我有用”。"}
              <span>
                {english
                  ? "— Design preview · Reading notes"
                  : "— 设计演示 · 阅读笔记"}
              </span>
            </blockquote>
          </>
        )}
        <section id={"lab-ref-" + story.id}>
          <h2>{english ? "Follow the sources" : "回到信息的来源"}</h2>
          <p className="lab-muted">
            {english
              ? "These links open public publisher sections to demonstrate source references."
              : "以下链接指向发布方栏目，用于演示来源引用。"}
          </p>
          {story.articles?.map((a, index) => (
            <a
              className="lab-reference"
              key={a.id}
              href={a.url}
              target="_blank"
              rel="noreferrer"
            >
              <span className="lab-reference-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>
                <strong>{a.source_name}</strong>
                <small>
                  {english
                    ? "Public publisher section · Demo link"
                    : "发布方公开栏目 · 原文入口演示"}
                </small>
              </span>
              <Icon name="external" size={18} />
            </a>
          ))}
        </section>
        <div className="lab-evidence">
          <Icon name="alert" size={17} />
          <p>
            {english
              ? "Fixed demonstration content, used to compare designs. Links point to public publisher sections; these publishers are not claimed to have published the example titles."
              : story.analysis?.limitations}
          </p>
        </div>
      </div>
    </article>
  );
}
