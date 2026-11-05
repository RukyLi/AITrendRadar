import { useCallback, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowUpRight,
  Bell,
  Bookmark,
  Check,
  ChevronRight,
  Clock3,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { api, relative, time, type Event, type Job } from "../api";
import { Empty, Modal, Skeleton } from "./Primitives";
import { NewsNowCard } from "./NewsNowCard";
import { ChannelDirectory, monitorCategories } from "./ChannelDirectory";
import "./monitor.css";

type Tab = "all" | "focus" | "boards" | "timeline" | "watches" | "history";
export type Source = {
  id: string;
  source_id: string;
  name: string;
  mode: string;
  category: string;
  interval_seconds: number;
  subscribed: number;
  enabled: number;
  state: string;
  availability: string;
  availability_label: string;
  error_code: string;
  error: string;
  last_checked: string | null;
  last_success: string | null;
  next_due: string | null;
  fetched_at: string | null;
  snapshot_id: number | null;
  item_count: number;
  items?: Item[];
};
export type Item = {
  item_id: string;
  event_id: string;
  title: string;
  summary: string;
  extra?: string;
  url: string;
  source_id: string;
  source_name: string;
  rank: number | null;
  change: string;
  delta: number | null;
  published_at: string | null;
  fetched_at: string;
  first_seen?: string;
  bookmarked: number;
  is_read: number;
  snapshot_id: number;
  gap: number;
  from_cache?: number;
};
type Sample = {
  id: number;
  source_id: string;
  source_name: string;
  fetched_at: string;
  item_count: number;
  gap: number;
  baseline: number;
  from_cache: number;
};
type Watch = {
  id?: string;
  name: string;
  keywords: string[];
  excludes: string[];
  sources: string[];
  enabled: boolean;
  rise_threshold: number;
};
type Alert = {
  id: number;
  item_id: string;
  event_id: string;
  title: string;
  source_name: string;
  watch_name: string;
  kind: string;
  delta: number;
  created_at: string;
  is_read: number;
};
type Data = {
  items: (Source | Item | Sample)[];
  revision?: number;
  total?: number;
};
type Route = {
  tab: Tab;
  q: string;
  category: string;
  source: string;
  start: string;
  end: string;
  page: number;
  item: string;
  event: string;
  sample: number;
};
const tabs: Record<Tab, string> = {
  all: "全部频道",
  focus: "关注",
  boards: "热榜",
  timeline: "快讯",
  watches: "关键词",
  history: "历史",
};
const cardView = (tab: Tab) =>
  ["all", "focus", "boards", "timeline"].includes(tab);
const labels: Record<string, string> = {
  baseline: "首次记录",
  new: "新出现",
  returned: "再次出现",
  up: "上升",
  down: "下降",
  same: "持平",
  left: "离开采集前 30 条",
};
const memory = new Map<
  string,
  { data: Data; scroll: number; cards: Record<string, number> }
>();
function readRoute(): Route {
  const p = new URLSearchParams(location.search),
    tab = p.get("mtab") || "all";
  return {
    tab: (tab in tabs ? tab : "all") as Tab,
    q: p.get("mq") || "",
    category: p.get("mc") === "综合" ? "国内" : p.get("mc") || "",
    source: p.get("ms") || "",
    start: p.get("mstart") || "",
    end: p.get("mend") || "",
    page: Math.max(1, Number(p.get("mp")) || 1),
    item: p.get("mi") || "",
    event: p.get("me") || "",
    sample: Number(p.get("snapshot")) || 0,
  };
}
function key(r: Route) {
  return JSON.stringify({ ...r, item: "", event: "", sample: 0 });
}
function changePath(r: Route, revision: number) {
  const p = new URLSearchParams({
    since: String(revision),
    q: r.q,
    source: r.source,
    category: r.category,
  });
  if (r.tab === "boards") p.set("mode", "hottest");
  if (r.tab === "timeline") p.set("mode", "realtime");
  if (r.tab === "watches") p.set("watched", "true");
  if (cardView(r.tab)) p.set("subscribed", String(r.tab === "focus"));
  return "/monitor/changes?" + p;
}
const emptyWatch: Watch = {
  name: "",
  keywords: [],
  excludes: [],
  sources: [],
  enabled: true,
  rise_threshold: 5,
};
const terms = (text: string) =>
  text
    .split(/[,，\n]/)
    .map((v) => v.trim())
    .filter(Boolean);

export function MonitorView({ notify }: { notify: (s: string) => void }) {
  const [route, setRoute] = useState(readRoute),
    [sources, setSources] = useState<Source[]>([]),
    [data, setData] = useState<Data>({ items: [] });
  const [query, setQuery] = useState(route.q);
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [loadedKey, setLoadedKey] = useState("");
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [updates, setUpdates] = useState(0),
    [version, setVersion] = useState(0);
  const [manager, setManager] = useState(false),
    [watches, setWatches] = useState<Watch[]>([]),
    [edit, setEdit] = useState<Watch | null>(null),
    [alerts, setAlerts] = useState<Alert[]>([]),
    [unread, setUnread] = useState(0);
  const [detail, setDetail] = useState<Event | null>(null),
    [trail, setTrail] = useState<Item[]>([]),
    [gaps, setGaps] = useState<{ checked_at: string; error: string }[]>([]),
    [sample, setSample] = useState<Item[]>([]);
  const [job, setJob] = useState<Job | null>(null),
    [online, setOnline] = useState(false),
    [monitorEnabled, setMonitorEnabled] = useState(true),
    [retention, setRetention] = useState(30),
    [detailError, setDetailError] = useState("");
  const searchRef = useRef<HTMLInputElement>(null),
    scrollRef = useRef<HTMLDivElement>(null),
    routeRef = useRef(route),
    dataRef = useRef(data),
    readyRef = useRef(false);
  routeRef.current = route;
  dataRef.current = data;
  readyRef.current = !loading && !error && loadedKey === key(route);
  const fail = useCallback(
    (e: unknown) =>
      setError(e instanceof Error ? e.message : "操作未完成，请重试"),
    [],
  );
  const remember = useCallback(() => {
    if (!readyRef.current) return;
    const cards: Record<string, number> = {};
    document
      .querySelectorAll<HTMLElement>("[data-board-scroll]")
      .forEach((e) => (cards[e.dataset.boardScroll!] = e.scrollTop));
    const value = {
      data: dataRef.current,
      scroll: scrollRef.current?.scrollTop || 0,
      cards,
    };
    memory.set(key(routeRef.current), value);
    sessionStorage.setItem(
      "monitor-scroll:" + key(routeRef.current),
      JSON.stringify({ scroll: value.scroll, cards }),
    );
  }, []);
  const navigate = useCallback(
    (patch: Partial<Route>) => {
      remember();
      const next = { ...routeRef.current, ...patch };
      const p = new URLSearchParams(location.search);
      p.set("view", "monitor");
      Object.entries({
        mtab: next.tab,
        mq: next.q,
        mc: next.category,
        ms: next.source,
        mstart: next.start,
        mend: next.end,
        mp: next.page,
        mi: next.item,
        me: next.event,
        snapshot: next.sample,
      }).forEach(([k, v]) => (v ? p.set(k, String(v)) : p.delete(k)));
      history.pushState({}, "", location.pathname + "?" + p);
      setRoute(next);
    },
    [remember],
  );
  useEffect(() => {
    setQuery(route.q);
  }, [route.q]);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query !== routeRef.current.q)
        navigate({ q: query, page: 1, item: "", event: "", sample: 0 });
    }, 280);
    return () => clearTimeout(timer);
  }, [query, navigate]);
  useEffect(() => {
    const pop = () => {
      remember();
      setRoute(readRoute());
    };
    window.addEventListener("popstate", pop);
    return () => {
      remember();
      window.removeEventListener("popstate", pop);
    };
  }, [remember]);
  const metadata = useCallback(async () => {
    const [s, w, a, h, c] = await Promise.all([
      api<Source[]>("/monitor/sources"),
      api<Watch[]>("/monitor/watches"),
      api<{ items: Alert[]; unread: number }>("/monitor/alerts"),
      api<{ monitor_heartbeat: string | null }>("/health"),
      api<{ monitor_enabled: boolean; monitor_retention_days: number }>(
        "/settings",
      ),
    ]);
    setSources(s);
    setWatches(w);
    setAlerts(a.items);
    setUnread(a.unread);
    setOnline(
      !!h.monitor_heartbeat &&
        Date.now() - Date.parse(h.monitor_heartbeat) < 45000,
    );
    setMonitorEnabled(c.monitor_enabled);
    setRetention(c.monitor_retention_days);
  }, []);
  useEffect(() => {
    metadata().catch(fail);
  }, [metadata, fail]);
  const listKey = key(route);
  useEffect(() => {
    let live = true;
    const cached = memory.get(listKey);
    setLoading(!cached && loadedKey !== listKey);
    setError("");
    setUpdates(0);
    let saved = cached;
    try {
      saved =
        saved ||
        JSON.parse(
          sessionStorage.getItem("monitor-scroll:" + listKey) || "null",
        );
    } catch {
      /* optional scroll cache */
    }
    function restore() {
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = saved?.scroll || 0;
        document
          .querySelectorAll<HTMLElement>("[data-board-scroll]")
          .forEach(
            (e) => (e.scrollTop = saved?.cards[e.dataset.boardScroll!] || 0),
          );
      });
    }
    if (cached) {
      setData(cached.data);
      setLoadedKey(listKey);
      restore();
      return;
    }
    const p = new URLSearchParams({
      q: route.q,
      category: route.category,
      source: route.source,
      page: String(route.page),
    });
    if (route.start) p.set("start", route.start);
    if (route.end) p.set("end", route.end);
    if (route.tab === "watches") p.set("watched", "true");
    if (cardView(route.tab)) {
      p.set(
        "mode",
        route.tab === "boards"
          ? "hottest"
          : route.tab === "timeline"
            ? "realtime"
            : "",
      );
      p.set("subscribed", String(route.tab === "focus"));
      p.set("include_disabled", String(["all", "focus"].includes(route.tab)));
    }
    const endpoint = cardView(route.tab)
      ? "boards"
      : route.tab === "history"
        ? "history"
        : "timeline";
    api<Data>("/monitor/" + endpoint + "?" + p)
      .then((value) => {
        if (live) {
          setData(value);
          setLoadedKey(listKey);
          memory.set(listKey, { data: value, scroll: 0, cards: {} });
          restore();
        }
      })
      .catch((e) => {
        if (live) {
          if (loadedKey !== listKey) setData({ items: [] });
          setLoadedKey(listKey);
          fail(e);
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [listKey, version, fail]);
  const refresh = useCallback(() => {
    remember();
    memory.delete(key(routeRef.current));
    setVersion((v) => v + 1);
    setUpdates(0);
    metadata().catch(fail);
  }, [remember, metadata, fail]);
  useEffect(() => {
    let live = true;
    const poll = async () => {
      if (document.hidden) return;
      try {
        const change = await api<{ count: number; revision: number }>(
          changePath(routeRef.current, dataRef.current.revision || 0),
        );
        if (live) {
          setUpdates(change.count);
          await metadata();
        }
      } catch {
        /* Continue reading the last successful snapshot. */
      }
    };
    const timer = setInterval(poll, 30000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [metadata]);
  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.status)) return;
    const timer = setInterval(
      () =>
        api<Job>("/jobs/" + job.id)
          .then((j) => {
            setJob(j);
            if (!["queued", "running"].includes(j.status)) {
              memory.clear();
              refresh();
            }
          })
          .catch(fail),
      2000,
    );
    return () => clearInterval(timer);
  }, [job, metadata, fail, refresh]);
  const collect = async (sid = "", test = false) => {
    try {
      setJob(
        await api<Job>("/jobs", "POST", {
          kind:
            test || (sid && !sources.find((s) => s.id === sid)?.enabled)
              ? "monitor_test"
              : "monitor_update",
          target: sid,
        }),
      );
      notify("已提交监控检查，遵守来源最小间隔");
    } catch (e) {
      fail(e);
    }
  };
  const configure = async (s: Source, patch: Partial<Source>) => {
    try {
      await api("/monitor/sources/" + s.id, "PATCH", patch);
      memory.clear();
      refresh();
    } catch (e) {
      fail(e);
    }
  };
  const reorder = async (from: string, to: string) => {
    const ids = sources.map((s) => s.id),
      index = ids.indexOf(to),
      start = ids.indexOf(from);
    if (index < 0 || start < 0 || from === to) return;
    ids.splice(start, 1);
    ids.splice(index, 0, from);
    try {
      await api("/monitor/sources/order", "PUT", { ids });
      memory.clear();
      refresh();
    } catch (e) {
      fail(e);
    }
  };
  const items = cardView(route.tab)
    ? (data.items as Source[]).flatMap((s) => s.items || [])
    : route.tab === "history"
      ? sample
      : (data.items as Item[]);
  const open = (item: Pick<Item, "item_id" | "event_id">) =>
    navigate({ item: item.item_id, event: item.event_id });
  useEffect(() => {
    let live = true;
    setDetail(null);
    setTrail([]);
    setGaps([]);
    setDetailError("");
    if (!route.item || !route.event) return;
    Promise.all([
      api<Event>("/events/" + route.event),
      api<{ items: Item[]; failures: { checked_at: string; error: string }[] }>(
        "/monitor/history?item=" + route.item,
      ),
    ])
      .then(async ([e, h]) => {
        if (!live) return;
        setDetail(e);
        setTrail(h.items);
        setGaps(h.failures);
        if (!e.is_read) {
          const updated = await api<Event>(
            "/events/" + e.id + "/state",
            "PATCH",
            { is_read: true },
          );
          if (live) setDetail(updated);
        }
      })
      .catch((e) => {
        if (live) setDetailError(e.message);
      });
    return () => {
      live = false;
    };
  }, [route.item, route.event]);
  useEffect(() => {
    let live = true;
    setSample([]);
    if (route.sample)
      api<{ items: Item[] }>("/monitor/history?snapshot=" + route.sample)
        .then((r) => {
          if (live) setSample(r.items);
        })
        .catch(fail);
    return () => {
      live = false;
    };
  }, [route.sample, fail]);
  const state = async (eid: string, patch: Record<string, boolean>) => {
    try {
      const updated = await api<Event>(
        "/events/" + eid + "/state",
        "PATCH",
        patch,
      );
      if (detail?.id === eid) setDetail(updated);
      memory.clear();
      setData((old) => ({
        ...old,
        items: old.items.map((row) =>
          "items" in row
            ? {
                ...row,
                items: (row.items || []).map((i) =>
                  i.event_id === eid ? { ...i, ...updated, title: i.title } : i,
                ),
              }
            : "event_id" in row && row.event_id === eid
              ? { ...row, ...updated, title: row.title }
              : row,
        ),
      }));
    } catch (e) {
      fail(e);
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        manager ||
        edit ||
        document.querySelector('[role="menu"]') ||
        (e.target as HTMLElement).matches(
          "input,textarea,select,[contenteditable=true]",
        )
      )
        return;
      if (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key === "k")) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "b" && detail) {
        e.preventDefault();
        void state(detail.id, { bookmarked: !detail.bookmarked });
      }
      if (e.key === "j" || e.key === "k") {
        const i = items.findIndex((r) => r.item_id === route.item),
          next =
            items[
              Math.max(
                0,
                Math.min(items.length - 1, i + (e.key === "j" ? 1 : -1)),
              )
            ];
        if (next) {
          e.preventDefault();
          open(next);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const saveWatch = async (value: Watch) => {
    try {
      const { id, ...body } = value;
      await api(
        "/monitor/watches" + (id ? "/" + id : ""),
        id ? "PUT" : "POST",
        body,
      );
      setEdit(null);
      memory.clear();
      refresh();
      notify("关注规则已保存，从新采样开始提醒");
    } catch (e) {
      fail(e);
    }
  };
  const reset = (patch: Partial<Route>) =>
    navigate({ ...patch, page: 1, item: "", event: "", sample: 0 });
  const row = (item: Item) => (
    <div
      className={"monitor-row " + (item.is_read ? "read" : "")}
      key={item.item_id}
    >
      <button className="monitor-row-open" onClick={() => open(item)}>
        {item.rank != null && (
          <span className={"monitor-rank " + (item.rank <= 3 ? "leading" : "")}>
            {String(item.rank).padStart(2, "0")}
          </span>
        )}
        <span className="monitor-row-copy">
          <span className="monitor-row-title">{item.title}</span>
          {route.tab !== "boards" && (
            <small>
              {item.source_name} ·{" "}
              {item.published_at ? time(item.published_at) : "发布时间未知"}
              {item.first_seen ? " · 收录 " + relative(item.first_seen) : ""}
            </small>
          )}
          {item.change && item.change !== "same" && (
            <small className={"monitor-delta " + item.change}>
              {item.delta != null && item.delta !== 0
                ? (item.delta > 0 ? "↑ " : "↓ ") + Math.abs(item.delta)
                : labels[item.change]}
            </small>
          )}
        </span>
      </button>
      <button
        className={"icon-btn small " + (item.bookmarked ? "is-saved" : "")}
        aria-label={item.bookmarked ? "取消收藏" : "收藏条目"}
        onClick={() => state(item.event_id, { bookmarked: !item.bookmarked })}
      >
        <Bookmark size={14} fill={item.bookmarked ? "currentColor" : "none"} />
      </button>
    </div>
  );

  return (
    <main className="monitor-layout">
      <header className="monitor-heading">
        <h1>国内实时监控</h1>
        <span
          className="monitor-service-status"
          title={
            monitorEnabled
              ? online
                ? "监控服务运行中"
                : "监控服务离线"
              : "自动监控已暂停"
          }
        >
          <i className={online && monitorEnabled ? "live-dot" : "quiet-dot"} />
          {monitorEnabled ? (online ? "持续更新" : "离线") : "已暂停"}
        </span>
        <div className="monitor-actions">
          <button
            className="button secondary"
            onClick={() => {
              setDirectoryQuery("");
              setManager(true);
            }}
          >
            <Settings2 size={15} />
            <span>更多来源</span>
          </button>
          <button
            className="button secondary"
            onClick={() => collect()}
            disabled={!!job && ["queued", "running"].includes(job.status)}
          >
            <RefreshCw
              size={15}
              className={
                job && ["queued", "running"].includes(job.status)
                  ? "spinning"
                  : ""
              }
            />
            <span>刷新</span>
          </button>
        </div>
      </header>
      <div className="monitor-toolbar">
        <div className="monitor-tabs" role="tablist" aria-label="监控视图">
          {Object.entries(tabs).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={route.tab === id}
              className={route.tab === id ? "selected" : ""}
              onClick={() =>
                reset({ tab: id as Tab, q: "", source: "", category: "" })
              }
            >
              {label}
              {id === "watches" && unread > 0 && (
                <span className="monitor-count">{unread}</span>
              )}
            </button>
          ))}
        </div>
        <div className="monitor-tools">
          <label className="monitor-search">
            <Search size={15} />
            <input
              ref={searchRef}
              placeholder="搜索标题与已采集内容"
              aria-label="搜索监控内容"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd>/</kbd>
          </label>
          <div className="monitor-filters">
            {!cardView(route.tab) && (
              <select
                aria-label="筛选分类"
                value={route.category}
                onChange={(e) => reset({ category: e.target.value })}
              >
                <option value="">全部分类</option>
                {monitorCategories.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            )}
            <select
              aria-label="筛选来源"
              value={route.source}
              onChange={(e) => reset({ source: e.target.value })}
            >
              <option value="">全部来源</option>
              {sources
                .filter(
                  (s) =>
                    (!route.category || s.category === route.category) &&
                    (s.enabled || ["all", "focus"].includes(route.tab)),
                )
                .map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
            {route.tab === "history" && (
              <>
                <input
                  type="date"
                  aria-label="起始日期"
                  value={route.start}
                  onChange={(e) => reset({ start: e.target.value })}
                />
                <span>至</span>
                <input
                  type="date"
                  aria-label="截止日期"
                  value={route.end}
                  onChange={(e) => reset({ end: e.target.value })}
                />
              </>
            )}
          </div>
        </div>
      </div>
      {cardView(route.tab) && (
        <nav
          className="monitor-category-tabs monitor-category-bar"
          aria-label="频道分类"
        >
          {["", ...monitorCategories].map((category) => {
            const count = sources.filter(
              (s) =>
                (!category || s.category === category) &&
                (route.tab === "focus"
                  ? s.subscribed
                  : route.tab === "boards"
                    ? s.enabled && s.mode === "hottest"
                    : route.tab === "timeline"
                      ? s.enabled && s.mode === "realtime"
                      : true),
            ).length;
            return (
              <button
                key={category}
                className={route.category === category ? "selected" : ""}
                aria-pressed={route.category === category}
                onClick={() => reset({ category, source: "" })}
              >
                {category || "全部"}
                <small>{count}</small>
              </button>
            );
          })}
        </nav>
      )}
      {error && (
        <div role="alert" className="monitor-error">
          {error}
          <button
            onClick={() => {
              setError("");
              refresh();
            }}
          >
            重试
          </button>
        </div>
      )}
      {job && ["queued", "running"].includes(job.status) && (
        <div className="monitor-job">
          <Radio size={14} />
          <span>
            {job.stage}
            {job.result.sources?.length
              ? " · " + job.result.sources.length + " 个来源"
              : ""}
          </span>
          <button onClick={() => setJob(null)} aria-label="收起任务状态">
            <X size={14} />
          </button>
          {job.result.sources && (
            <details>
              <summary>查看来源结果</summary>
              {job.result.sources.map((s) => (
                <p key={s.id}>
                  {s.name} · {s.status} {s.error || ""}
                </p>
              ))}
            </details>
          )}
        </div>
      )}
      {updates > 0 && (
        <button className="monitor-updates" onClick={refresh}>
          <RefreshCw size={14} />有 {updates} 条更新 · 点击查看
        </button>
      )}
      <div className="monitor-content" ref={scrollRef} onScroll={remember}>
        {route.tab === "watches" && (
          <section className="monitor-watch-rules">
            <div className="monitor-section-title">
              <h2>我的关注规则</h2>
              <button
                className="button secondary"
                onClick={() => setEdit({ ...emptyWatch })}
              >
                <Plus size={14} />
                添加规则
              </button>
            </div>
            <div className="monitor-rule-list">
              {watches.map((w) => (
                <button key={w.id} onClick={() => setEdit(w)}>
                  <Bell size={15} />
                  <span>
                    {w.name}
                    <small>
                      {w.keywords.join(" · ")}
                      {!w.enabled ? " · 已暂停" : ""}
                    </small>
                  </span>
                  <ChevronRight size={15} />
                </button>
              ))}
              {!watches.length && (
                <p className="monitor-muted">
                  添加公司、人物或事件关键词。新出现和显著上升时，会在这里提醒。
                </p>
              )}
            </div>
            {alerts.length > 0 && (
              <details className="monitor-alerts" open>
                <summary>站内提醒 · {unread} 条未读</summary>
                {alerts.map((a) => (
                  <button
                    key={a.id}
                    className={a.is_read ? "read" : ""}
                    onClick={() => {
                      open(a);
                      api("/monitor/alerts/" + a.id, "PATCH", { is_read: true })
                        .then(metadata)
                        .catch(fail);
                    }}
                  >
                    <span>
                      {!a.is_read && <i className="live-dot" />}
                      {a.title}
                    </span>
                    <small>
                      {a.watch_name} · {a.source_name} ·{" "}
                      {a.kind === "up" ? "上升 " + a.delta + " 位" : "首次出现"}{" "}
                      · {time(a.created_at)}
                    </small>
                  </button>
                ))}
              </details>
            )}
          </section>
        )}
        {loading || loadedKey !== listKey ? (
          <Skeleton />
        ) : cardView(route.tab) ? (
          <div className="monitor-channel-groups">
            {(route.tab === "all" && !route.category
              ? monitorCategories
              : [""]
            ).map((category) => {
              const visible = (data.items as Source[]).filter(
                (s) => !category || s.category === category,
              );
              if (!visible.length) return null;
              return (
                <section
                  className="monitor-channel-group"
                  key={category || "cards"}
                  aria-label={category ? category + "频道卡片" : "频道卡片"}
                >
                  {category && (
                    <h2>
                      {category}
                      <small>{visible.length} 个频道</small>
                    </h2>
                  )}
                  <div className="monitor-grid">
                    {visible.map((s, index, visible) => {
                      const health = sources.find((v) => v.id === s.id) || s;
                      return (
                        <NewsNowCard
                          key={s.id}
                          source={s}
                          health={health}
                          query={route.q}
                          busy={
                            !!job &&
                            ["queued", "running"].includes(job.status) &&
                            (!job.target || job.target === s.id)
                          }
                          onRefresh={() => collect(s.id)}
                          onSubscribe={() =>
                            configure(s, {
                              subscribed: Number(!health.subscribed),
                            })
                          }
                          onMove={(direction) => {
                            const target = visible[index + direction];
                            if (target) void reorder(s.id, target.id);
                          }}
                          canUp={index > 0}
                          canDown={index < visible.length - 1}
                          onDrop={(id) => {
                            if (visible.some((source) => source.id === id))
                              void reorder(id, s.id);
                            else
                              notify(
                                "分类视图仅调整同类频道顺序；关注页可以自由排序",
                              );
                          }}
                          onScroll={remember}
                          onOpen={open}
                          onState={state}
                          onHistory={() =>
                            reset({
                              tab: "history",
                              source: s.id,
                              q: "",
                              category: "",
                            })
                          }
                          onSettings={() => {
                            setDirectoryQuery(s.id);
                            setManager(true);
                          }}
                        />
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        ) : route.tab === "history" ? (
          <div className="monitor-history">
            {(data.items as Sample[]).map((s) => (
              <button key={s.id} onClick={() => navigate({ sample: s.id })}>
                <Clock3 size={18} />
                <span>
                  {s.source_name}
                  <small>
                    {time(s.fetched_at, true)}
                    {s.baseline ? " · 首次基线" : ""}
                    {s.from_cache ? " · 来源缓存" : ""}
                    {s.gap ? " · 此前存在采集中断" : ""}
                  </small>
                </span>
                <span>{s.item_count} 条</span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        ) : (
          <div className="monitor-timeline">
            {(data.items as Item[]).map(row)}
          </div>
        )}
        {!loading && !data.items.length && (
          <Empty
            title={
              route.tab === "focus" ? "还没有关注的来源" : "这里暂时没有内容"
            }
          >
            {route.tab === "focus"
              ? "点击热榜或快讯卡片上的星标，把来源放到这里。"
              : route.tab === "watches"
                ? "调整关注规则后，新采集的匹配内容会自动出现。"
                : "可以检查来源状态、调整筛选条件，或等待下一次采样。"}
          </Empty>
        )}
        {(data.total || 0) > (route.tab === "history" ? 30 : 40) && (
          <div className="pagination">
            <button
              disabled={route.page <= 1}
              onClick={() =>
                navigate({ page: route.page - 1, item: "", event: "" })
              }
            >
              上一页
            </button>
            <span>
              {route.page} /{" "}
              {Math.ceil(
                (data.total || 0) / (route.tab === "history" ? 30 : 40),
              )}
            </span>
            <button
              disabled={
                route.page * (route.tab === "history" ? 30 : 40) >=
                (data.total || 0)
              }
              onClick={() =>
                navigate({ page: route.page + 1, item: "", event: "" })
              }
            >
              下一页
            </button>
          </div>
        )}
        <p className="monitor-footnote">
          NewsNow · 定时采样，最多收录各来源前 30 条。
        </p>
      </div>
      <Modal
        open={manager}
        onClose={() => setManager(false)}
        title={`全部频道 · ${sources.length}`}
        description="按分类浏览完整目录，星标自由关注；每个频道保留实际检查状态和失败原因。"
        wide
      >
        <div className="monitor-settings">
          <label>
            <input
              type="checkbox"
              checked={monitorEnabled}
              onChange={(e) =>
                api("/settings", "PATCH", { monitor_enabled: e.target.checked })
                  .then(metadata)
                  .catch(fail)
              }
            />
            自动监控
          </label>
          <label>
            历史保留{" "}
            <select
              value={retention}
              onChange={(e) =>
                api("/settings", "PATCH", {
                  monitor_retention_days: Number(e.target.value),
                })
                  .then(metadata)
                  .catch(fail)
              }
            >
              {[7, 30, 60, 90].map((n) => (
                <option key={n} value={n}>
                  {n} 天
                </option>
              ))}
            </select>
          </label>
        </div>
        <ChannelDirectory
          sources={sources}
          initialQuery={directoryQuery}
          job={job}
          onConfigure={configure}
          onTest={(id = "") => collect(id, true)}
        />
      </Modal>
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? "编辑关注规则" : "添加关注规则"}
        description="包含词任一命中即可；排除词优先。保存后只提醒新的采样，不回放历史。"
      >
        {error && (
          <p role="alert" className="monitor-error">
            {error}
          </p>
        )}
        {edit && (
          <WatchForm
            value={edit}
            sources={sources}
            onSave={saveWatch}
            onDelete={
              edit.id
                ? () =>
                    api("/monitor/watches/" + edit.id, "DELETE")
                      .then(() => {
                        setEdit(null);
                        memory.clear();
                        refresh();
                      })
                      .catch(fail)
                : undefined
            }
          />
        )}
      </Modal>
      <Modal
        open={!!route.sample}
        onClose={() => navigate({ sample: 0 })}
        title="历史采样"
        description={
          sample[0]
            ? time(sample[0].fetched_at, true) + " · 保留当时的标题与位次"
            : "正在读取快照"
        }
        wide
      >
        <div className="monitor-sample">{sample.map(row)}</div>
      </Modal>
      <Dialog.Root
        open={!!route.item}
        onOpenChange={(v) => {
          if (!v) navigate({ item: "", event: "" });
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="monitor-drawer-overlay" />
          <Dialog.Content className="monitor-drawer">
            <header>
              <span>来源与变化</span>
              <Dialog.Close className="icon-btn" aria-label="关闭详情">
                <X size={20} />
              </Dialog.Close>
            </header>
            <Dialog.Title className="monitor-detail-title">
              {detail?.title || "读取条目"}
            </Dialog.Title>
            <Dialog.Description className="monitor-muted">
              基于已采集标题与内容，位次仅代表该平台采样。
            </Dialog.Description>
            {detailError ? (
              <p role="alert">{detailError}</p>
            ) : !detail ? (
              <Skeleton />
            ) : (
              <>
                <div className="monitor-detail-actions">
                  <a
                    className="button"
                    href={trail[0]?.url || detail.articles?.[0]?.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    打开原文
                    <ArrowUpRight size={15} />
                  </a>
                  <button
                    className="button secondary"
                    onClick={() =>
                      state(detail.id, { bookmarked: !detail.bookmarked })
                    }
                  >
                    <Bookmark size={15} />
                    {detail.bookmarked ? "已收藏" : "收藏"}
                  </button>
                  <button
                    className="button secondary"
                    onClick={() =>
                      state(detail.id, { is_read: !detail.is_read })
                    }
                  >
                    <Check size={15} />
                    {detail.is_read ? "标为未读" : "标为已读"}
                  </button>
                </div>
                {detail.summary && (
                  <p className="monitor-detail-summary">{detail.summary}</p>
                )}
                <div className="monitor-section-title">
                  <h2>采样轨迹</h2>
                  <span>{trail[0]?.source_name}</span>
                </div>
                <p className="monitor-muted">
                  NewsNow 本地适配器 · 网页/公开端点
                </p>
                <ol className="monitor-trail">
                  {trail.map((t) => (
                    <li key={t.snapshot_id}>
                      <time>{time(t.fetched_at, true)}</time>
                      <span>
                        {t.rank != null ? "第 " + t.rank + " 位 · " : ""}
                        {labels[t.change]}
                        {t.from_cache ? " · 来源缓存" : ""}
                        {t.delta ? " " + Math.abs(t.delta) + " 位" : ""}
                        {t.gap ? " · 前次检查中断" : ""}
                      </span>
                    </li>
                  ))}
                </ol>
                {gaps.length > 0 && (
                  <details>
                    <summary>查看采集中断记录</summary>
                    {gaps.map((g) => (
                      <p key={g.checked_at}>
                        {time(g.checked_at, true)} · {g.error}
                      </p>
                    ))}
                  </details>
                )}
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  );
}

function WatchForm({
  value,
  sources,
  onSave,
  onDelete,
}: {
  value: Watch;
  sources: Source[];
  onSave: (w: Watch) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(value.name),
    [words, setWords] = useState(value.keywords.join(", ")),
    [excluded, setExcluded] = useState(value.excludes.join(", ")),
    [selected, setSelected] = useState(value.sources),
    [enabled, setEnabled] = useState(value.enabled),
    [threshold, setThreshold] = useState(value.rise_threshold);
  return (
    <form
      className="monitor-watch-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...value,
          name,
          keywords: terms(words),
          excludes: terms(excluded),
          sources: selected,
          enabled,
          rise_threshold: threshold,
        });
      }}
    >
      <label>
        规则名称
        <input
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如：关注的公司"
        />
      </label>
      <label>
        包含关键词
        <input
          required
          value={words}
          onChange={(e) => setWords(e.target.value)}
          placeholder="多个词用逗号分隔"
        />
      </label>
      <label>
        排除关键词
        <input
          value={excluded}
          onChange={(e) => setExcluded(e.target.value)}
          placeholder="可选"
        />
      </label>
      <div className="monitor-settings">
        <label>
          上升至少{" "}
          <input
            type="number"
            min={1}
            max={29}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
          />{" "}
          位时提醒
        </label>
        <label>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          启用规则
        </label>
      </div>
      <fieldset>
        <legend>来源范围 · 不勾选表示所有来源</legend>
        <div>
          {sources.map((s) => (
            <label key={s.id}>
              <input
                type="checkbox"
                checked={selected.includes(s.id)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, s.id]
                      : selected.filter((v) => v !== s.id),
                  )
                }
              />
              {s.name}
            </label>
          ))}
        </div>
      </fieldset>
      <footer>
        {onDelete && (
          <button type="button" className="button secondary" onClick={onDelete}>
            <Trash2 size={14} />
            删除规则
          </button>
        )}
        <button type="submit" className="button">
          保存规则
        </button>
      </footer>
    </form>
  );
}
