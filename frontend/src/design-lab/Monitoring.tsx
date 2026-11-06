import { useState, type CSSProperties, type FormEvent } from "react";
import {
  categories,
  channels,
  channelItems,
  demoDate,
  type Channel,
} from "./data";
import { useLab, type Watch } from "./state";
import {
  Badge,
  Button,
  Empty,
  Icon,
  IconButton,
  Menu,
  Modal,
  SaveButton,
  SearchField,
  SectionTitle,
  Segments,
  Toggle,
} from "./ui";

export const statusLabels = {
  ok: "可用",
  cache: "缓存",
  limited: "请求限流",
  restricted: "访问受限",
  empty: "暂无内容",
};
export function ChannelLogo({ channel }: { channel: Channel }) {
  return (
    <span
      className="lab-channel-logo"
      style={{ "--source-color": channel.color } as CSSProperties}
    >
      {channel.mode === "rss" ? (
        <Icon name="rss" />
      ) : (
        <img
          src={"/assets/newsnow/" + channel.icon + ".png"}
          alt=""
          loading="lazy"
        />
      )}
    </span>
  );
}
function ChannelCard({
  channel,
  previous,
  next,
}: {
  channel: Channel;
  previous?: string;
  next?: string;
}) {
  const {
    route,
    prefs,
    toggle,
    refresh,
    job,
    revision,
    move,
    openStory,
    notify,
    navigate,
  } = useLab();
  const [over, setOver] = useState(false),
    [dragging, setDragging] = useState(false);
  const rows = channelItems(channel, revision).filter(
    (a) =>
      !route.q ||
      (a.title + channel.name).toLowerCase().includes(route.q.toLowerCase()),
  );
  const busy =
    !!job &&
    !job.done &&
    (job.target === channel.name || job.target === "全部来源");
  return (
    <section
      className={
        "lab-channel-card " +
        (over ? "drag-over " : "") +
        (dragging ? "dragging" : "")
      }
      aria-label={channel.name + "频道卡片"}
      data-channel={channel.id}
      style={{ "--source-color": channel.color } as CSSProperties}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData("text/plain");
        if (channels.some((c) => c.id === id)) move(id, channel.id);
      }}
    >
      <header className="lab-channel-header">
        <ChannelLogo channel={channel} />
        <div className="lab-channel-title">
          <a href={channel.home} target="_blank" rel="noreferrer">
            {channel.name}
            <Icon name="arrow" size={13} />
          </a>
          <span>
            {channel.title || channel.category} <i />{" "}
            {channel.status === "ok"
              ? "3 分钟前"
              : statusLabels[channel.status]}
          </span>
        </div>
        <IconButton
          name={
            job?.done &&
            (job.target === channel.name || job.target === "全部来源")
              ? "check"
              : "refresh"
          }
          label={"模拟刷新 " + channel.name}
          className={busy ? "lab-spin" : ""}
          disabled={busy}
          onClick={() => refresh(channel.name)}
        />
        <SaveButton id={channel.id} channel />
        <button
          className="lab-drag-handle"
          aria-label={"拖动 " + channel.name}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("text/plain", channel.id);
            e.dataTransfer.effectAllowed = "move";
            setDragging(true);
          }}
          onDragEnd={() => {
            setDragging(false);
            setOver(false);
          }}
        >
          <Icon name="grip" size={17} />
        </button>
        <Menu
          label={channel.name + "频道操作"}
          items={[
            {
              label: "向前移动",
              icon: "up",
              disabled: !previous,
              action: () => previous && move(channel.id, previous),
            },
            {
              label: "向后移动",
              icon: "down",
              disabled: !next,
              action: () => next && move(channel.id, next),
            },
            {
              label: "查看采样历史",
              icon: "clock",
              action: () =>
                navigate({
                  page: "monitor",
                  tab: "history",
                  source: channel.id,
                  q: "",
                  item: "",
                }),
            },
          ]}
        />
      </header>
      {!!channel.reason && (
        <div className={"lab-channel-warning " + channel.status}>
          <Icon
            name={channel.status === "restricted" ? "off" : "alert"}
            size={15}
          />
          <span>{channel.reason}</span>
        </div>
      )}
      <div
        className="lab-channel-items"
        data-lab-scroll={"channel-" + channel.id}
        tabIndex={0}
        aria-label={channel.name + "榜单内容"}
      >
        {rows.length ? (
          rows.map((a, i) => (
            <div
              key={a.id}
              className={
                "lab-channel-row " +
                (prefs.read.includes(a.id) ? "is-read" : "")
              }
            >
              <span className={"lab-rank " + (i < 3 ? "top-rank" : "")}>
                {channel.mode === "hottest" ? (
                  String(i + 1).padStart(2, "0")
                ) : (
                  <Icon name="point" size={12} />
                )}
              </span>
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                onClick={() => {
                  if (!prefs.read.includes(a.id)) toggle("read", a.id);
                }}
              >
                {a.title}
                {channel.mode === "realtime" && (
                  <small>{a.published_at.slice(11, 16)}</small>
                )}
              </a>
              {channel.mode === "hottest" && i % 4 === 0 && (
                <span className={"lab-rank-delta " + (i % 8 ? "down" : "up")}>
                  {i === 0 ? "新" : i % 8 ? "↓2" : "↑3"}
                </span>
              )}
              <Menu
                label={channel.name + "第" + (i + 1) + "条操作"}
                items={[
                  {
                    label: "查看详情",
                    icon: "eye",
                    action: () => openStory(a.id),
                  },
                  {
                    label: prefs.bookmarks.includes(a.id)
                      ? "取消收藏资讯"
                      : "收藏资讯",
                    icon: "bookmark",
                    action: () => {
                      toggle("bookmarks", a.id);
                      notify("演示收藏已更新");
                    },
                  },
                  {
                    label: prefs.read.includes(a.id) ? "标为未读" : "标为已读",
                    icon: "check",
                    action: () => toggle("read", a.id),
                  },
                ]}
              />
            </div>
          ))
        ) : (
          <Empty
            title={
              channel.status === "restricted"
                ? "这个频道暂时休息一下"
                : "还没有可显示的内容"
            }
            description={channel.reason || "调整搜索条件后再看看。"}
            action={
              <Button
                icon="external"
                onClick={() =>
                  window.open(channel.home, "_blank", "noopener,noreferrer")
                }
              >
                访问来源
              </Button>
            }
          />
        )}
      </div>
      <footer className="lab-channel-footer">
        <span>
          <i className={"lab-status-dot " + channel.status} />
          {statusLabels[channel.status]} · 演示状态
        </span>
        <span>
          {rows.length} 条 <Icon name="arrow" size={12} />
        </span>
      </footer>
    </section>
  );
}
export function MonitorView() {
  const { route, prefs, navigate, refresh, job } = useLab();
  const mode = ["all", "starred", "hot", "live", "watches", "history"].includes(
    route.tab,
  )
    ? route.tab
    : "all";
  const order = [...new Set([...prefs.order, ...channels.map((c) => c.id)])];
  const visible = order
    .map((id) => channels.find((c) => c.id === id))
    .filter((c): c is Channel => !!c)
    .filter(
      (c) =>
        !prefs.disabled.includes(c.id) &&
        (route.category === "全部" || c.category === route.category) &&
        (!route.source || c.id === route.source) &&
        (mode !== "starred" || prefs.stars.includes(c.id)) &&
        (mode !== "hot" || c.mode === "hottest") &&
        (!route.q ||
          (
            c.name +
            channelItems(c)
              .map((a) => a.title)
              .join("")
          )
            .toLowerCase()
            .includes(route.q.toLowerCase())),
    );
  return (
    <div className="lab-monitor-view">
      <div className="lab-page-heading">
        <div>
          <span className="lab-eyebrow">THE WORLD, IN VIEW · 演示频道</span>
          <h1>
            {route.concept === "d"
              ? "世界很热闹，来逛逛。"
              : route.concept === "b"
                ? "看看世界，此刻在聊什么。"
                : "每一个频道，都有新发现。"}
          </h1>
          <p>把关心的来源放在一起，按自己的节奏浏览。</p>
        </div>
        <Button
          icon={job?.done ? "check" : "refresh"}
          busy={!!job && !job.done}
          onClick={() => refresh()}
        >
          模拟更新
        </Button>
      </div>
      <div className="lab-monitor-toolbar">
        <Segments
          label="监控视图"
          value={mode}
          items={[
            { value: "all", label: "全部频道" },
            { value: "starred", label: "星标", icon: "star" },
            { value: "hot", label: "热榜" },
            { value: "live", label: "快讯" },
            { value: "watches", label: "关键词" },
            { value: "history", label: "历史" },
          ]}
          onChange={(tab) => navigate({ tab, item: "", q: "", source: "" })}
        />
        <SearchField
          value={route.q}
          onChange={(q) => navigate({ q }, true)}
          placeholder={
            mode === "watches" ? "搜索规则名称或关键词" : "搜索频道或资讯"
          }
        />
      </div>
      {!["watches", "history"].includes(mode) && (
        <div className="lab-channel-filters">
          <div className="lab-topic-tabs">
            {categories.map((c) => (
              <button
                aria-pressed={route.category === c}
                key={c}
                className={route.category === c ? "active" : ""}
                onClick={() => navigate({ category: c })}
              >
                {c}
                <small>
                  {
                    channels.filter((ch) => c === "全部" || ch.category === c)
                      .length
                  }
                </small>
              </button>
            ))}
          </div>
          <label className="lab-source-select">
            <Icon name="rss" size={16} />
            <select
              aria-label="筛选频道"
              value={route.source}
              onChange={(e) => navigate({ source: e.target.value })}
            >
              <option value="">所有来源</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.title}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {mode === "watches" ? (
        <Watches />
      ) : mode === "history" ? (
        <History />
      ) : mode === "live" ? (
        <Timeline channelList={visible.filter((c) => c.mode === "realtime")} />
      ) : (
        <>
          <div className="lab-channel-grid">
            {visible.map((c, i) => (
              <ChannelCard
                key={c.id}
                channel={c}
                previous={visible[i - 1]?.id}
                next={visible[i + 1]?.id}
              />
            ))}
          </div>
          {!visible.length && (
            <Empty
              title={
                mode === "starred"
                  ? "点亮星标，留住喜欢的频道"
                  : "没有找到匹配频道"
              }
              action={
                <Button
                  onClick={() =>
                    navigate({
                      tab: "all",
                      q: "",
                      category: "全部",
                      source: "",
                    })
                  }
                >
                  浏览全部频道
                </Button>
              }
            />
          )}
        </>
      )}
      <p className="lab-footnote">
        频道名称来自现有 NewsNow 目录。内容、排名和可用性均为固定演示数据。
      </p>
    </div>
  );
}
function Timeline({ channelList }: { channelList: Channel[] }) {
  const { openStory, route } = useLab();
  const [count, setCount] = useState(20);
  const items = channelList
    .flatMap((c) => channelItems(c).slice(0, 4))
    .filter((a) => !route.q || (a.title + a.source_name).includes(route.q))
    .sort((a, b) => b.published_at.localeCompare(a.published_at));
  return (
    <section className="lab-timeline">
      <div className="lab-timeline-date">
        <Icon name="clock" />
        11 月 06 日 <Badge>演示时间线</Badge>
      </div>
      {items.slice(0, count).map((a) => (
        <article key={a.id}>
          <time>{a.published_at.slice(11, 16)}</time>
          <div>
            <Badge>{a.source_name}</Badge>
            <button className="lab-plain-story" onClick={() => openStory(a.id)}>
              <h3>{a.title}</h3>
            </button>
            <p>{a.summary}</p>
          </div>
          <SaveButton id={a.id} />
        </article>
      ))}
      {!items.length && <Empty title="暂无匹配快讯" />}
      {count < items.length && (
        <Button onClick={() => setCount((v) => v + 20)}>再看一些</Button>
      )}
    </section>
  );
}
export function Watches() {
  const { prefs, update, route, notify, openStory } = useLab();
  const [editing, setEditing] = useState<Watch | null>(null);
  const [remove, setRemove] = useState<Watch | null>(null);
  const [matches, setMatches] = useState<Watch | null>(null);
  const [error, setError] = useState("");
  const matched = (watch: Watch) =>
    channels
      .filter((c) => !watch.source || c.id === watch.source)
      .flatMap((c) => channelItems(c).slice(0, 3))
      .filter((a) => {
        const text = (a.title + a.summary).toLowerCase();
        return (
          watch.words
            .split(/[,，\s]+/)
            .filter(Boolean)
            .some((w) => text.includes(w.toLowerCase())) &&
          !watch.exclude
            .split(/[,，\s]+/)
            .filter(Boolean)
            .some((w) => text.includes(w.toLowerCase()))
        );
      });
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    if (!editing.name.trim() || !editing.words.trim()) {
      setError("请填写规则名称和至少一个关键词。");
      return;
    }
    update({
      watches: prefs.watches.some((w) => w.id === editing.id)
        ? prefs.watches.map((w) => (w.id === editing.id ? editing : w))
        : [...prefs.watches, editing],
    });
    setEditing(null);
    notify("关注规则已保存，仅用于演示");
  }
  return (
    <>
      <SectionTitle eyebrow="FOLLOW YOUR CURIOSITY" title="让重要的信息找到你">
        <Button
          tone="primary"
          icon="plus"
          onClick={() => {
            setError("");
            setEditing({
              id: "watch-" + Date.now(),
              name: "",
              words: "",
              exclude: "",
              source: "",
              enabled: true,
            });
          }}
        >
          新建关注
        </Button>
      </SectionTitle>
      <div className="lab-watch-grid">
        {prefs.watches
          .filter((w) => !route.q || (w.name + w.words).includes(route.q))
          .map((w) => (
            <section className="lab-panel lab-watch" key={w.id}>
              <div className="lab-row">
                <span className="lab-watch-icon">
                  <Icon name="bell" />
                </span>
                <Toggle
                  label={"启用规则 " + w.name}
                  checked={w.enabled}
                  onChange={(enabled) =>
                    update({
                      watches: prefs.watches.map((v) =>
                        v.id === w.id ? { ...v, enabled } : v,
                      ),
                    })
                  }
                />
              </div>
              <h3>{w.name}</h3>
              <div className="lab-tag-row">
                {w.words
                  .split(/[,，\s]+/)
                  .filter(Boolean)
                  .map((word) => (
                    <Badge key={word}>{word}</Badge>
                  ))}
              </div>
              <p>
                {w.source
                  ? channels.find((c) => c.id === w.source)?.name
                  : "全部来源"}{" "}
                · {w.exclude ? "排除 " + w.exclude : "不限排除词"}
              </p>
              <div className="lab-row">
                <button className="lab-text-link" onClick={() => setMatches(w)}>
                  {matched(w).length} 条示例命中 <Icon name="right" size={16} />
                </button>
                <div>
                  <IconButton
                    name="edit"
                    label={"编辑 " + w.name}
                    onClick={() => {
                      setError("");
                      setEditing({ ...w });
                    }}
                  />
                  <IconButton
                    name="trash"
                    label={"删除 " + w.name}
                    onClick={() => setRemove(w)}
                  />
                </div>
              </div>
            </section>
          ))}
      </div>
      {!prefs.watches.length && <Empty title="写下你想关注的关键词" />}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="编辑关注规则"
      >
        {editing && (
          <form className="lab-form" onSubmit={submit}>
            <label>
              规则名称
              <input
                autoFocus
                value={editing.name}
                maxLength={80}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
              />
            </label>
            <label>
              包含关键词
              <input
                value={editing.words}
                placeholder="AI，开源，模型"
                onChange={(e) =>
                  setEditing({ ...editing, words: e.target.value })
                }
              />
              <small>用逗号分隔，任意一个词命中即可。</small>
            </label>
            <label>
              排除词
              <input
                value={editing.exclude}
                onChange={(e) =>
                  setEditing({ ...editing, exclude: e.target.value })
                }
              />
            </label>
            <label>
              来源范围
              <select
                value={editing.source}
                onChange={(e) =>
                  setEditing({ ...editing, source: e.target.value })
                }
              >
                <option value="">全部来源</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.title}
                  </option>
                ))}
              </select>
            </label>
            {error && (
              <p className="lab-error" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" tone="primary" icon="check">
              保存规则
            </Button>
          </form>
        )}
      </Modal>
      <Modal
        open={!!remove}
        onClose={() => setRemove(null)}
        title="删除这条关注规则？"
      >
        <p>删除“{remove?.name}”只影响本地演示空间。</p>
        <div className="lab-form-actions">
          <Button onClick={() => setRemove(null)}>保留规则</Button>
          <Button
            tone="danger"
            onClick={() => {
              update({
                watches: prefs.watches.filter((w) => w.id !== remove?.id),
              });
              setRemove(null);
            }}
          >
            删除规则
          </Button>
        </div>
      </Modal>
      <Modal
        open={!!matches}
        onClose={() => setMatches(null)}
        title={matches?.name || "关键词命中"}
        drawer
      >
        {matches && (
          <div className="lab-match-list">
            {matched(matches)
              .slice(0, 30)
              .map((a) => (
                <button
                  key={a.id}
                  onClick={() => {
                    setMatches(null);
                    openStory(a.id);
                  }}
                >
                  <Badge>{a.source_name}</Badge>
                  <h3>{a.title}</h3>
                  <Icon name="arrow" size={18} />
                </button>
              ))}
            {!matched(matches).length && (
              <Empty title="还没有匹配这条规则的内容" />
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
export function History() {
  const { route, navigate, openStory } = useLab();
  const [sample, setSample] = useState("15:30");
  const channel = channels.find((c) => c.id === route.source) || channels[0];
  const records = channelItems(channel).filter(
    (a) => !route.q || a.title.includes(route.q),
  );
  const inDate =
    (!route.from || route.from <= demoDate) &&
    (!route.to || route.to >= demoDate);
  return (
    <div className="lab-history">
      <div className="lab-filter-panel">
        <label>
          来源
          <select
            value={channel.id}
            onChange={(e) => navigate({ source: e.target.value })}
          >
            {channels.map((c) => (
              <option value={c.id} key={c.id}>
                {c.name} {c.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          开始日期
          <input
            type="date"
            value={route.from}
            onChange={(e) => navigate({ from: e.target.value })}
          />
        </label>
        <label>
          结束日期
          <input
            type="date"
            value={route.to}
            onChange={(e) => navigate({ to: e.target.value })}
          />
        </label>
        <Button onClick={() => navigate({ from: "", to: "", q: "" })}>
          重置
        </Button>
      </div>
      <SectionTitle title="回看当时的榜单" eyebrow="NOV 06 · SAMPLE HISTORY">
        <Badge>固定演示采样</Badge>
      </SectionTitle>
      <div className="lab-history-samples">
        {["14:30", "15:00", "15:30"].map((s) => (
          <button
            className={s === sample ? "active" : ""}
            onClick={() => setSample(s)}
            key={s}
          >
            <Icon name="clock" />
            <strong>{s}</strong>
            <span>{s === "15:00" ? "采样中断" : "有效采样"}</span>
          </button>
        ))}
      </div>
      {!inDate ? (
        <Empty
          title="这个日期没有演示采样"
          description="演示数据固定在 2026 年 11 月 6 日。"
        />
      ) : sample === "15:00" ? (
        <div className="lab-callout">
          <Icon name="alert" />
          <div>
            <h3>这一段采样中断了</h3>
            <p>没有用旧数据补造快照，也不推断这段时间内的排名变化。</p>
          </div>
        </div>
      ) : !records.length ? (
        <Empty title="没有可用的演示快照" description={channel.reason} />
      ) : (
        <div className="lab-table-wrap">
          <table className="lab-table">
            <thead>
              <tr>
                <th>当时位次</th>
                <th>内容</th>
                <th>变化</th>
                <th>采样时间</th>
              </tr>
            </thead>
            <tbody>
              {records.slice(0, 10).map((a, i) => (
                <tr key={a.id}>
                  <td>{channel.mode === "hottest" ? i + 1 : "—"}</td>
                  <td>
                    <button onClick={() => openStory(a.id)}>{a.title}</button>
                  </td>
                  <td>
                    {channel.mode === "hottest" ? (
                      sample === "14:30" ? (
                        "首次基线"
                      ) : (
                        <span className="lab-trend-line">
                          <svg viewBox="0 0 70 24" aria-label="示例排名轨迹">
                            <path
                              d="M2 20 24 14 46 17 68 4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            />
                          </svg>
                          ↑3
                        </span>
                      )
                    ) : (
                      "新增快讯"
                    )}
                  </td>
                  <td>
                    {demoDate} {sample}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
