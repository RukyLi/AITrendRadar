import { MonitorView } from "./components/Monitor";
import { useCallback, useEffect, useRef, useState } from "react";
import { Hint, Modal, Empty, Skeleton } from "./components/Primitives";
import { Detail, BriefDetail } from "./components/Detail";
import { QuickOpen } from "./components/QuickOpen";
import { SourceBadge, ReviewBadge, reviewLabels } from "./components/Quality";
import {
  SourcesPanel,
  TopicsPanel,
  SettingsPanel,
  JobsPanel,
} from "./components/Managers";
import * as Tooltip from "@radix-ui/react-tooltip";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import {
  ArrowRight,
  Archive,
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Inbox,
  Layers3,
  Menu,
  Moon,
  Plus,
  Radio,
  RefreshCw,
  Rss,
  Search,
  Settings2,
  SlidersHorizontal,
  Sun,
  X,
  CalendarDays,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import {
  api,
  relative,
  type Article,
  type Brief,
  type Event,
  type Job,
  type Meta,
  type Page,
  type Settings,
  type Source,
  type Topic,
} from "./api";

type View =
  | "today"
  | "all"
  | "following"
  | "saved"
  | "articles"
  | "briefs"
  | "archive"
  | "monitor";
type Route = {
  view: View;
  q: string;
  topic: string;
  source: string;
  review: string;
  sort: string;
  start: string;
  end: string;
  selected: string;
  page: number;
};
const titles: Record<View, string> = {
  monitor: "国内实时监控",
  today: "今日精选",
  all: "全部事件",
  following: "我的关注",
  saved: "稍后再读",
  articles: "原始文章",
  archive: "综合归档",
  briefs: "每日简报",
};
function readRoute(): Route {
  const p = new URLSearchParams(location.search);
  const view = p.get("view") || "today";
  return {
    view: (view in titles ? view : "today") as View,
    q: p.get("q") || "",
    topic: p.get("topic") || "",
    source: p.get("source") || "",
    review: p.get("review") || "",
    sort: p.get("sort") || "recommended",
    start: p.get("start") || "",
    end: p.get("end") || "",
    selected: p.get("event") || "",
    page: Math.max(1, Number(p.get("page")) || 1),
  };
}
function routeKey(r: Route) {
  return JSON.stringify({ ...r, selected: "" });
}
export default function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  const [events, setEvents] = useState<Event[]>([]),
    [articles, setArticles] = useState<Article[]>([]),
    [briefs, setBriefs] = useState<Brief[]>([]);
  const [detail, setDetail] = useState<Event | null>(null),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true),
    [detailLoading, setDetailLoading] = useState(false);
  const [sources, setSources] = useState<Source[]>([]),
    [topics, setTopics] = useState<Topic[]>([]),
    [settings, setSettings] = useState<Settings | null>(null),
    [meta, setMeta] = useState<Meta | null>(null),
    [jobs, setJobs] = useState<Job[]>([]);
  const [panel, setPanel] = useState<
      "sources" | "topics" | "settings" | "jobs" | "reports" | null
    >(null),
    [mobileNav, setMobileNav] = useState(false),
    [filters, setFilters] = useState(false);
  const [search, setSearch] = useState(route.q),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [detailError, setDetailError] = useState("");
  const [newCount, setNewCount] = useState(0),
    [language, setLanguage] = useState<"zh" | "original">("zh"),
    [refresh, setRefresh] = useState(0);
  const [theme, setTheme] = useState(
    () => localStorage.getItem("radar-theme") || "light",
  );
  const [quickOpen, setQuickOpen] = useState(false);
  const [focusReader, setFocusReader] = useState(false);
  const [compact, setCompact] = useState(
    () => localStorage.getItem("radar-density") === "compact",
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("radar-sidebar") === "collapsed",
  );
  const [selectedBrief, setSelectedBrief] = useState(""),
    [reports, setReports] = useState<{ name: string; url: string }[]>([]);
  const listRef = useRef<HTMLDivElement>(null),
    searchRef = useRef<HTMLInputElement>(null),
    routeRef = useRef(route),
    snapshot = useRef("");
  const listCache = useRef(
    new Map<
      string,
      {
        events: Event[];
        articles: Article[];
        total: number;
        snapshot: string;
        scroll: number;
      }
    >(),
  );
  const requestVersion = useRef(0),
    detailVersion = useRef(0),
    lastJobStatus = useRef("");
  const refreshScrolls = useRef(new Map<string, number>());
  routeRef.current = route;
  const notify = useCallback((message: string) => {
    setNotice(message);
  }, []);
  const fail = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : "操作失败，请重试");
  }, []);
  const navigate = useCallback((patch: Partial<Route>, replace = false) => {
    const old = routeRef.current;
    const cached = listCache.current.get(routeKey(old));
    if (cached) cached.scroll = listRef.current?.scrollTop || 0;
    const next = { ...old, ...patch };
    const p = new URLSearchParams();
    Object.entries(next).forEach(([k, v]) => {
      if (v && !(k === "page" && v === 1))
        p.set(k === "selected" ? "event" : k, String(v));
    });
    history[replace ? "replaceState" : "pushState"](
      {},
      "",
      location.pathname + "?" + p.toString(),
    );
    setRoute(next);
    setMobileNav(false);
  }, []);
  const loadMeta = useCallback(async () => {
    const [s, t, m, c] = await Promise.all([
      api<Source[]>("/sources"),
      api<Topic[]>("/topics"),
      api<Meta>("/meta"),
      api<Settings>("/settings"),
    ]);
    setSources(s);
    setTopics(t);
    setMeta(m);
    setSettings(c);
  }, []);
  useEffect(() => {
    loadMeta().catch(fail);
  }, [loadMeta, fail]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("radar-theme", theme);
  }, [theme]);
  useEffect(() => {
    localStorage.setItem("radar-density", compact ? "compact" : "comfortable");
    requestAnimationFrame(() => {
      const id = routeRef.current.selected;
      if (id)
        document
          .querySelector(`[data-event="${id}"]`)
          ?.scrollIntoView({ block: "nearest" });
    });
  }, [compact]);
  useEffect(() => {
    localStorage.setItem(
      "radar-sidebar",
      sidebarCollapsed ? "collapsed" : "expanded",
    );
  }, [sidebarCollapsed]);
  useEffect(() => {
    if (!route.selected || route.view === "briefs") setFocusReader(false);
  }, [route.selected, route.view]);
  useEffect(() => {
    if (panel || quickOpen) setMobileNav(false);
  }, [panel, quickOpen]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const pop = () => {
      setRoute(readRoute());
      setSearch(readRoute().q);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== routeRef.current.q)
        navigate({ q: search, page: 1, selected: "" });
    }, 320);
    return () => clearTimeout(timer);
  }, [search, navigate]);
  const listKey = routeKey(route);
  useEffect(() => {
    if (route.view === "monitor") return;
    let cancelled = false;
    const current = ++requestVersion.current;
    const cached = listCache.current.get(listKey);
    if (cached) {
      setEvents(cached.events);
      setArticles(cached.articles);
      setTotal(cached.total);
      snapshot.current = cached.snapshot;
      setLoading(false);
      requestAnimationFrame(() => {
        if (listRef.current) listRef.current.scrollTop = cached.scroll;
      });
      return;
    }
    setLoading(true);
    setError("");
    setNewCount(0);
    const params = new URLSearchParams({
      q: route.q,
      source: route.source,
      page: String(route.page),
      limit: "40",
    });
    if (route.start) params.set("start", route.start);
    if (route.end) params.set("end", route.end);
    if (route.view === "briefs") {
      api<Brief[]>("/briefs")
        .then((data) => {
          if (!cancelled) {
            setBriefs(data);
            setTotal(data.length);
          }
        })
        .catch(fail)
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    } else {
      if (route.view !== "articles") {
        params.set("view", route.view);
        params.set("sort", route.sort);
        if (route.review) params.set("review", route.review);
        if (route.topic) params.set("topic", route.topic);
      }
      api<Page<Event | Article>>(
        "/" +
          (route.view === "articles" ? "articles" : "events") +
          "?" +
          params,
      )
        .then((data) => {
          if (cancelled || current !== requestVersion.current) return;
          const ev = route.view === "articles" ? [] : (data.items as Event[]);
          const ar = route.view === "articles" ? (data.items as Article[]) : [];
          setEvents(ev);
          setArticles(ar);
          setTotal(data.total);
          snapshot.current = data.snapshot;
          const scroll = refreshScrolls.current.get(listKey) || 0;
          refreshScrolls.current.delete(listKey);
          listCache.current.set(listKey, {
            events: ev,
            articles: ar,
            total: data.total,
            snapshot: data.snapshot,
            scroll,
          });
          requestAnimationFrame(() => {
            if (!cancelled && listRef.current)
              listRef.current.scrollTop = scroll;
          });
        })
        .catch(fail)
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }
    return () => {
      cancelled = true;
    };
    // The route fields are serialized in listKey. Selecting a detail never reloads the list.
  }, [listKey, refresh, fail]);
  const refreshList = useCallback(() => {
    refreshScrolls.current.set(
      routeKey(routeRef.current),
      listRef.current?.scrollTop || 0,
    );
    listCache.current.delete(routeKey(routeRef.current));
    setNewCount(0);
    setRefresh((n) => n + 1);
    loadMeta().catch(fail);
  }, [loadMeta, fail]);
  const patchState = useCallback(
    async (
      eid: string,
      patch: Partial<Pick<Event, "is_read" | "bookmarked">>,
    ) => {
      try {
        const result = await api<Event>(
          `/events/${eid}/state`,
          "PATCH",
          Object.fromEntries(
            Object.entries(patch).map(([k, v]) => [k, Boolean(v)]),
          ),
        );
        const apply = (ev: Event) => (ev.id === eid ? { ...ev, ...patch } : ev);
        setEvents((rows) => rows.map(apply));
        setArticles((rows) =>
          rows.map((a) => (a.event_id === eid ? { ...a, ...patch } : a)),
        );
        setDetail((old) => (old?.id === eid ? { ...old, ...patch } : old));
        listCache.current.forEach((c) => {
          c.events = c.events.map(apply);
          c.articles = c.articles.map((a) =>
            a.event_id === eid ? { ...a, ...patch } : a,
          );
        });
        if (patch.bookmarked !== undefined) {
          for (const key of listCache.current.keys()) {
            if (JSON.parse(key).view === "saved") listCache.current.delete(key);
          }
          if (routeRef.current.view === "saved") setRefresh((n) => n + 1);
          notify(patch.bookmarked ? "已加入稍后再读" : "已取消收藏");
        }
        return result;
      } catch (e) {
        fail(e);
      }
    },
    [fail, notify],
  );
  useEffect(() => {
    if (!route.selected) {
      setDetail(null);
      setDetailLoading(false);
      return;
    }
    let cancelled = false;
    const version = ++detailVersion.current;
    setDetailLoading(true);
    setDetailError("");
    api<Event>("/events/" + route.selected)
      .then(async (e) => {
        if (cancelled || version !== detailVersion.current) return;
        setDetail(e);
        if (e.id !== route.selected) navigate({ selected: e.id }, true);
        setDetailLoading(false);
        if (!e.is_read) await patchState(e.id, { is_read: 1 });
      })
      .catch((e) => {
        if (!cancelled) {
          setDetailError(e.message);
          setDetailLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [route.selected, patchState, navigate]);
  const queue = useCallback(
    async (kind: string, target = "") => {
      try {
        const job = await api<Job>("/jobs", "POST", { kind, target });
        setJobs((old) => [job, ...old.filter((j) => j.id !== job.id)]);
        notify(
          kind === "update"
            ? "更新任务已提交，阅读可以继续"
            : "任务已提交到后台",
        );
        if (["update", "source_test", "curate"].includes(kind))
          setPanel("jobs");
        return job;
      } catch (e) {
        fail(e);
      }
    },
    [fail, notify],
  );
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const [latest, m] = await Promise.all([
          api<Job[]>("/jobs"),
          api<Meta>("/meta"),
        ]);
        if (!alive) return;
        setJobs(latest);
        setMeta(m);
        const signature = latest.map((j) => j.id + ":" + j.status).join("|");
        if (lastJobStatus.current && signature !== lastJobStatus.current) {
          loadMeta().catch(() => {});
          const r = routeRef.current;
          if (r.selected) {
            const event = await api<Event>("/events/" + r.selected);
            if (alive && r.selected === routeRef.current.selected)
              setDetail(event);
          }
          if (r.view === "briefs") {
            const values = await api<Brief[]>("/briefs");
            if (alive) setBriefs(values);
          }
        }
        lastJobStatus.current = signature;
        const r = routeRef.current;
        if (
          snapshot.current &&
          r.view !== "monitor" &&
          r.view !== "briefs" &&
          r.view !== "articles"
        ) {
          const params = new URLSearchParams({
            view: r.view,
            q: r.q,
            topic: r.topic,
            source: r.source,
            review: r.review,
            since: snapshot.current,
            limit: "1",
          });
          if (r.start) params.set("start", r.start);
          if (r.end) params.set("end", r.end);
          const changed = await api<Page<Event>>("/events?" + params);
          const shown = listCache.current.get(routeKey(r))?.total;
          if (alive && routeKey(routeRef.current) === routeKey(r))
            setNewCount(
              Math.max(
                changed.total,
                shown === undefined
                  ? 0
                  : Math.abs((changed.current_total ?? shown) - shown),
              ),
            );
        }
      } catch {
        /* Keep reading cached content when a background health check fails. */
      }
    };
    poll();
    const timer = setInterval(poll, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [loadMeta]);
  const choose = useCallback(
    (eid: string) => {
      navigate({ selected: eid });
    },
    [navigate],
  );
  const readingIds =
    route.view === "articles"
      ? articles.map((a) => a.event_id)
      : events.map((e) => e.id);
  const selectedIndex = readingIds.indexOf(route.selected);
  const step = (direction: number) => {
    const id = readingIds[selectedIndex + direction];
    if (!id) return;
    choose(id);
    document
      .querySelector(`[data-event="${id}"]`)
      ?.scrollIntoView({ block: "nearest" });
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (route.view === "monitor") return;
      const target = e.target as HTMLElement;
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "k" &&
        !panel &&
        !mobileNav
      ) {
        e.preventDefault();
        setQuickOpen((open) => !open);
        return;
      }
      if (
        target.matches('input,textarea,select,[contenteditable="true"]') ||
        panel ||
        quickOpen ||
        mobileNav ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      )
        return;
      if (e.key === "/") {
        e.preventDefault();
        setFocusReader(false);
        requestAnimationFrame(() => searchRef.current?.focus());
      }
      if (e.key.toLowerCase() === "f" && detail) {
        e.preventDefault();
        setFocusReader((v) => !v);
      }
      if (e.key.toLowerCase() === "b" && detail) {
        e.preventDefault();
        patchState(detail.id, { bookmarked: detail.bookmarked ? 0 : 1 });
      }
      if (["j", "k"].includes(e.key.toLowerCase())) {
        const ids =
          route.view === "articles"
            ? articles.map((a) => a.event_id)
            : events.map((a) => a.id);
        const index = ids.indexOf(route.selected);
        const next = Math.max(
          0,
          Math.min(
            ids.length - 1,
            index + (e.key.toLowerCase() === "j" ? 1 : -1),
          ),
        );
        if (ids[next]) {
          e.preventDefault();
          choose(ids[next]);
          document
            .querySelector(`[data-event="${ids[next]}"]`)
            ?.scrollIntoView({ block: "nearest" });
        }
      }
      if (e.key === "Escape" && route.selected) {
        if (focusReader) setFocusReader(false);
        else navigate({ selected: "" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    articles,
    choose,
    detail,
    events,
    mobileNav,
    navigate,
    panel,
    quickOpen,
    focusReader,
    patchState,
    route.selected,
    route.view,
  ]);
  const active = jobs.find((j) => ["running", "queued"].includes(j.status));
  const workerOnline =
    !!meta?.worker_heartbeat &&
    Date.now() - new Date(meta.worker_heartbeat).getTime() < 45000;
  const currentBrief = briefs.find((b) => b.id === selectedBrief) || briefs[0];
  const switchView = (view: View) => {
    setSearch("");
    navigate({
      view,
      q: "",
      topic: "",
      source: "",
      review: "",
      selected: "",
      page: 1,
      start: "",
      end: "",
    });
  };
  const sidebar = (
    <>
      <button className="sidebar-search" onClick={() => setQuickOpen(true)}>
        <Search size={16} />
        <span>快速查找</span>
        <kbd>⌘ K</kbd>
      </button>
      <nav aria-label="主导航">
        {(
          [
            { id: "today", icon: CalendarDays },
            { id: "monitor", icon: Radio },
            { id: "all", icon: Layers3 },
            { id: "following", icon: Radio },
            { id: "saved", icon: Bookmark },
            { id: "briefs", icon: FileText },
          ] as const
        ).map(({ id, icon: Icon }) => (
          <button
            key={id}
            className={"nav-link " + (route.view === id ? "active" : "")}
            onClick={() => switchView(id)}
          >
            <Icon size={18} />
            <span>{titles[id]}</span>
            {id === "saved" && meta?.saved ? <small>{meta.saved}</small> : null}
            {id === "all" && meta ? <small>{meta.ai_events}</small> : null}
          </button>
        ))}
      </nav>
      <div className="sidebar-section-heading">
        <span>关注主题</span>
        <button
          className="icon-btn small"
          aria-label="管理关注主题"
          onClick={() => setPanel("topics")}
        >
          <Plus size={16} />
        </button>
      </div>
      <div className="topic-nav">
        {topics
          .filter((t) => t.followed)
          .map((t) => (
            <button
              className={route.topic === t.id ? "chosen" : ""}
              key={t.id}
              onClick={() =>
                navigate({
                  view: "following",
                  topic: route.topic === t.id ? "" : t.id,
                  review: "",
                  page: 1,
                  selected: "",
                })
              }
            >
              <i style={{ background: t.color }} />
              {t.name}
              <span>{t.event_count}</span>
            </button>
          ))}
      </div>
      <div className="sidebar-section-heading">
        <span>资料库</span>
      </div>
      <button
        className={"nav-link " + (route.view === "archive" ? "active" : "")}
        onClick={() => switchView("archive")}
      >
        <Archive size={18} />
        <span>综合归档</span>
        <small>{meta?.archive_events.toLocaleString()}</small>
      </button>
      <button
        className={"nav-link " + (route.view === "articles" ? "active" : "")}
        onClick={() => switchView("articles")}
      >
        <Inbox size={18} />
        <span>原始文章</span>
      </button>
      <button className="nav-link" onClick={() => setPanel("sources")}>
        <Rss size={18} />
        <span>订阅来源</span>
        <small>{sources.filter((s) => s.enabled).length}</small>
      </button>
      <button
        className="nav-link"
        onClick={() => {
          api<{ name: string; url: string }[]>("/reports")
            .then(setReports)
            .catch(fail);
          setPanel("reports");
        }}
      >
        <FileText size={18} />
        <span>报告存档</span>
        <ArrowUpRight size={14} />
      </button>
      <div className="sidebar-bottom">
        <button className="system-status" onClick={() => setPanel("jobs")}>
          <i className={workerOnline ? "online" : ""} />
          <span>
            {active ? "正在更新" : workerOnline ? "订阅已同步" : "同步已暂停"}
            <small>{relative(meta?.last_update)}</small>
          </span>
          <ChevronRight size={14} />
        </button>
        <button
          className="nav-link settings-link"
          onClick={() => setPanel("settings")}
        >
          <Settings2 size={17} />
          <span>偏好设置</span>
        </button>
      </div>
    </>
  );
  return (
    <Tooltip.Provider delayDuration={300}>
      <div
        className={
          "app " +
          (route.selected ? "has-selection " : "") +
          (focusReader ? "reader-focused " : "") +
          (compact ? "density-compact " : "") +
          (sidebarCollapsed ? "sidebar-collapsed" : "")
        }
      >
        <header className="topbar">
          <button
            className="mobile-menu icon-btn"
            onClick={() => setMobileNav(true)}
            aria-label="打开导航"
          >
            <Menu size={21} />
          </button>
          <button
            className="brand"
            aria-label="AITrendRadar 首页"
            onClick={() => switchView("today")}
          >
            <span className="brand-symbol">r</span>
            <span>
              radar<span className="brand-dot">.</span>
            </span>
          </button>
          <Hint label={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}>
            <button
              className="icon-btn sidebar-toggle"
              aria-label={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
              onClick={() => setSidebarCollapsed((v) => !v)}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen size={18} />
              ) : (
                <PanelLeftClose size={18} />
              )}
            </button>
          </Hint>
          <span className="topbar-section">
            {route.view === "monitor"
              ? "国内动态 · 持续监控"
              : "AI 情报 · 个人阅读空间"}
          </span>
          <div className="top-actions">
            <button
              className="quick-trigger"
              aria-label="快速查找"
              onClick={() => setQuickOpen(true)}
            >
              <Search size={15} />
              <span>查找</span>
              <kbd>⌘ K</kbd>
            </button>
            <Hint label={theme === "light" ? "切换暗色模式" : "切换浅色模式"}>
              <button
                className="icon-btn"
                aria-label="切换主题"
                onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              >
                {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
              </button>
            </Hint>
          </div>
        </header>
        <aside className="sidebar">{sidebar}</aside>
        <Modal
          open={mobileNav}
          onClose={() => setMobileNav(false)}
          title="我的工作台"
          description="导航、主题与来源"
        >
          <div className="mobile-sidebar">{sidebar}</div>
        </Modal>
        {route.view === "monitor" && <MonitorView notify={notify} />}
        <main
          className="reading-layout"
          style={route.view === "monitor" ? { display: "none" } : undefined}
        >
          <section
            className={
              "feed-panel " +
              (route.view === "briefs" ? "brief-list-panel" : "")
            }
            aria-label="新闻列表"
          >
            <div className="feed-heading">
              <div className="feed-title">
                <h1>{titles[route.view]}</h1>
                <button
                  className={"icon-btn " + (active ? "working" : "")}
                  aria-label="立即更新"
                  onClick={() => queue("update")}
                >
                  <RefreshCw size={19} />
                </button>
              </div>
              <p>
                {route.view === "today"
                  ? new Date().toLocaleDateString("zh-CN", {
                      month: "long",
                      day: "numeric",
                      weekday: "long",
                    }) + " · AI 已审核"
                  : route.view === "saved"
                    ? "你保存的文章与事件"
                    : route.view === "briefs"
                      ? "每天 09:00，梳理过去 24 小时的变化"
                      : route.view === "following"
                        ? "来自你关注的主题"
                        : route.view === "archive"
                          ? "综合热榜与未通过审核的内容"
                          : route.view === "all"
                            ? "仅显示通过 AI 相关性审核的资讯"
                            : "全部订阅 · 原始资料保留"}
              </p>
            </div>
            {route.view !== "briefs" && (
              <>
                <div className="search-box">
                  <Search size={17} />
                  <input
                    ref={searchRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="搜索当前列表"
                    aria-label="搜索新闻"
                  />
                  {search ? (
                    <button
                      className="icon-btn small"
                      aria-label="清除搜索"
                      onClick={() => setSearch("")}
                    >
                      <X size={14} />
                    </button>
                  ) : (
                    <kbd>/</kbd>
                  )}
                </div>
                <div className="feed-toolbar">
                  <span>
                    {loading
                      ? "正在整理…"
                      : `${total.toLocaleString()} ${route.view === "articles" ? "篇文章" : "个事件"}`}
                  </span>
                  <div>
                    <Dropdown.Root>
                      <Dropdown.Trigger
                        className="text-btn density-trigger"
                        aria-label="列表密度"
                      >
                        {compact ? "紧凑" : "舒适"}
                        <ChevronDown size={12} />
                      </Dropdown.Trigger>
                      <Dropdown.Portal>
                        <Dropdown.Content className="dropdown" align="end">
                          <Dropdown.Item onSelect={() => setCompact(false)}>
                            舒适 · 显示摘要
                          </Dropdown.Item>
                          <Dropdown.Item onSelect={() => setCompact(true)}>
                            紧凑 · 只看标题
                          </Dropdown.Item>
                        </Dropdown.Content>
                      </Dropdown.Portal>
                    </Dropdown.Root>
                    {route.view !== "articles" && (
                      <Dropdown.Root>
                        <Dropdown.Trigger className="text-btn">
                          {route.sort === "latest" ? "最新" : "推荐"}
                          <ChevronDown size={13} />
                        </Dropdown.Trigger>
                        <Dropdown.Portal>
                          <Dropdown.Content className="dropdown" align="end">
                            <Dropdown.Item
                              onSelect={() =>
                                navigate({ sort: "recommended", page: 1 })
                              }
                            >
                              为你精选 · 主题与来源覆盖
                            </Dropdown.Item>
                            <Dropdown.Item
                              onSelect={() =>
                                navigate({ sort: "latest", page: 1 })
                              }
                            >
                              最新发布 · 按更新时间
                            </Dropdown.Item>
                          </Dropdown.Content>
                        </Dropdown.Portal>
                      </Dropdown.Root>
                    )}
                    <button
                      aria-label="展开筛选"
                      aria-expanded={filters}
                      className={
                        "icon-btn small " + (filters ? "selected" : "")
                      }
                      onClick={() => setFilters((v) => !v)}
                    >
                      <SlidersHorizontal size={16} />
                    </button>
                  </div>
                </div>
                {filters && (
                  <div className="filters">
                    {route.view === "archive" && (
                      <label>
                        审核状态
                        <select
                          aria-label="审核状态"
                          value={route.review}
                          onChange={(e) =>
                            navigate({
                              review: e.target.value,
                              page: 1,
                              selected: "",
                            })
                          }
                        >
                          <option value="">全部归档</option>
                          {Object.entries(reviewLabels)
                            .filter(([id]) => id !== "accepted")
                            .map(([id, label]) => (
                              <option key={id} value={id}>
                                {label}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
                    <label>
                      来源
                      <select
                        value={route.source}
                        onChange={(e) =>
                          navigate({
                            source: e.target.value,
                            page: 1,
                            selected: "",
                          })
                        }
                      >
                        <option value="">全部来源</option>
                        {sources.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {route.view !== "articles" && (
                      <label>
                        主题
                        <select
                          value={route.topic}
                          onChange={(e) =>
                            navigate({
                              topic: e.target.value,
                              page: 1,
                              selected: "",
                            })
                          }
                        >
                          <option value="">全部主题</option>
                          {topics.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <div className="date-range">
                      <label>
                        开始日期
                        <input
                          type="date"
                          value={route.start}
                          onChange={(e) =>
                            navigate({
                              start: e.target.value,
                              page: 1,
                              view: route.view === "today" ? "all" : route.view,
                            })
                          }
                        />
                      </label>
                      <label>
                        结束日期
                        <input
                          type="date"
                          value={route.end}
                          onChange={(e) =>
                            navigate({
                              end: e.target.value,
                              page: 1,
                              view: route.view === "today" ? "all" : route.view,
                            })
                          }
                        />
                      </label>
                    </div>
                    <button
                      className="text-btn"
                      onClick={() =>
                        navigate({
                          source: "",
                          topic: "",
                          start: "",
                          end: "",
                          review: "",
                          page: 1,
                        })
                      }
                    >
                      重置筛选
                    </button>
                  </div>
                )}
              </>
            )}
            {route.view === "briefs" && (
              <div className="brief-generate">
                <button
                  className="button secondary"
                  onClick={() => queue("brief")}
                >
                  <FileText size={15} />
                  生成今日简报
                </button>
              </div>
            )}
            {route.view === "archive" && (
              <div className="quality-bar">
                <div>
                  <strong>原始资料完整保留</strong>
                  <span>
                    {meta?.review_pending || 0} 条待审核
                    {meta?.review_errors
                      ? ` · ${meta.review_errors} 条失败可重试`
                      : ""}
                  </span>
                </div>
                <button
                  className="text-btn"
                  onClick={() => queue("curate")}
                  disabled={jobs.some(
                    (j) =>
                      j.kind === "curate" &&
                      ["queued", "running"].includes(j.status),
                  )}
                >
                  审核与聚合
                </button>
              </div>
            )}
            {newCount > 0 && (
              <button className="new-updates" onClick={refreshList}>
                <ArrowUpRight size={15} />有 {newCount} 条内容变化，点击更新列表
              </button>
            )}
            {error && (
              <div className="error-banner" role="alert">
                {error}
                <button
                  onClick={() => {
                    setError("");
                    refreshList();
                  }}
                >
                  重试
                </button>
                <button aria-label="关闭提示" onClick={() => setError("")}>
                  <X size={14} />
                </button>
              </div>
            )}
            <div
              className="feed-scroll"
              ref={listRef}
              onScroll={() => {
                const c = listCache.current.get(listKey);
                if (c) c.scroll = listRef.current?.scrollTop || 0;
              }}
            >
              {loading ? (
                <Skeleton />
              ) : route.view === "briefs" ? (
                briefs.length ? (
                  briefs.map((b) => (
                    <button
                      className={
                        "brief-row " +
                        (currentBrief?.id === b.id ? "selected" : "")
                      }
                      key={b.id}
                      onClick={() => setSelectedBrief(b.id)}
                    >
                      <span className="eyebrow">第 {b.version} 版</span>
                      <h3>{b.date} AI 简报</h3>
                      <p>
                        {b.content.items.length} 个事件 ·{" "}
                        {b.status === "ready" ? "AI 综合解读" : "来源摘录"}
                      </p>
                      <ArrowRight size={18} />
                    </button>
                  ))
                ) : (
                  <Empty title="还没有简报" icon={<FileText size={30} />}>
                    每天自动汇总最近 24 小时的事件，也可以立即生成。
                  </Empty>
                )
              ) : total === 0 ? (
                <Empty
                  title={
                    route.view === "saved" ? "还没有收藏" : "暂时没有匹配的内容"
                  }
                >
                  {["today", "all"].includes(route.view) &&
                  !route.q &&
                  !route.topic &&
                  !route.source &&
                  !!meta?.review_pending ? (
                    <>
                      <span>资讯正在审核，通过后会出现在这里。</span>
                      <button
                        className="inline-link"
                        onClick={() => switchView("archive")}
                      >
                        查看综合归档
                      </button>
                    </>
                  ) : route.view === "today" ? (
                    <>
                      尝试更新来源，或
                      <button
                        className="inline-link"
                        onClick={() => switchView("all")}
                      >
                        浏览历史事件
                      </button>
                      。
                    </>
                  ) : route.view === "saved" ? (
                    "点击事件旁的书签，即可加入稍后再读。"
                  ) : (
                    "换个关键词，或调整主题、日期和来源筛选。"
                  )}
                </Empty>
              ) : route.view === "articles" ? (
                articles.map((a) => (
                  <div
                    className={
                      "event-row " +
                      (route.selected === a.event_id ? "selected" : "")
                    }
                    data-event={a.event_id}
                    key={a.id}
                  >
                    <button
                      className="event-open"
                      onClick={() => choose(a.event_id)}
                    >
                      <div className="row-meta">
                        <span className="row-source">
                          <span>{a.source_name}</span>
                          <SourceBadge source={a} />
                        </span>
                        <span>{relative(a.published_at)}</span>
                      </div>
                      <h2>
                        {!a.is_read && <i className="unread-dot" />}
                        {a.title}
                      </h2>
                      <p>{a.summary || "仅有标题 · 查看原文了解详情"}</p>
                      <div className="row-bottom">
                        <span>
                          {a.kind === "hotlist"
                            ? "热榜来源"
                            : a.source_id.startsWith("reddit")
                              ? "社区订阅"
                              : "RSS 订阅"}
                        </span>
                        <ArrowUpRight size={14} />
                      </div>
                    </button>
                  </div>
                ))
              ) : (
                events.map((e) => (
                  <div
                    data-event={e.id}
                    className={
                      "event-row " +
                      (route.selected === e.id ? "selected" : "") +
                      (e.is_read ? " read" : "")
                    }
                    key={e.id}
                  >
                    <button className="event-open" onClick={() => choose(e.id)}>
                      <div className="row-meta">
                        <span className="row-source">
                          <span>{e.sources[0]?.name || "订阅来源"}</span>
                          <SourceBadge source={e.sources[0]} />
                        </span>
                        <span>{relative(e.updated_at)}</span>
                      </div>
                      <h2>
                        {!e.is_read && <i className="unread-dot" />}
                        {e.analysis?.title_zh || e.title}
                      </h2>
                      <p>
                        {e.analysis?.summary_zh ||
                          e.summary ||
                          "从来源标题开始，查看事件报道与后续变化。"}
                      </p>
                      <div className="row-bottom">
                        <span className="row-category">
                          {e.topics[0]?.name || "综合"}
                          {e.source_count > 1 && ` · ${e.source_count} 个来源`}
                        </span>
                        <ReviewBadge event={e} />
                      </div>
                    </button>
                    <Hint
                      label={e.bookmarked ? "取消收藏 · B" : "稍后再读 · B"}
                    >
                      <button
                        className={
                          "row-bookmark icon-btn " +
                          (e.bookmarked ? "is-saved" : "")
                        }
                        aria-label={e.bookmarked ? "取消收藏" : "收藏事件"}
                        onClick={() =>
                          patchState(e.id, { bookmarked: e.bookmarked ? 0 : 1 })
                        }
                      >
                        <Bookmark
                          size={16}
                          fill={e.bookmarked ? "currentColor" : "none"}
                        />
                      </button>
                    </Hint>
                  </div>
                ))
              )}
              {total > 40 && route.view !== "briefs" && (
                <div className="pagination">
                  <button
                    disabled={route.page === 1}
                    onClick={() => navigate({ page: route.page - 1 })}
                  >
                    上一页
                  </button>
                  <span>
                    {route.page} / {Math.ceil(total / 40)}
                  </span>
                  <button
                    disabled={route.page * 40 >= total}
                    onClick={() => navigate({ page: route.page + 1 })}
                  >
                    下一页
                  </button>
                </div>
              )}
            </div>
            <div className="feed-footer">
              <span>
                <i />
                {sources.filter((s) => s.enabled).length} 个信息来源
              </span>
              <span>J / K 切换 · B 收藏</span>
            </div>
          </section>
          <section
            className="detail-panel"
            aria-label="事件详情"
            aria-busy={detailLoading}
          >
            {route.view === "briefs" ? (
              currentBrief ? (
                <BriefDetail
                  brief={currentBrief}
                  onChoose={(eid) => {
                    navigate({ view: "all", selected: eid });
                    setSelectedBrief("");
                  }}
                />
              ) : (
                <div className="welcome">
                  <FileText size={28} strokeWidth={1.3} />
                  <h2>每日简报</h2>
                  <p>
                    每天 09:00 汇总最近一天的新闻。
                    <br />
                    也可以从左侧立即生成。
                  </p>
                </div>
              )
            ) : detailLoading && !detail ? (
              <div className="detail-skeleton">
                <Skeleton />
              </div>
            ) : detailError ? (
              <Empty title="暂时无法打开事件">
                {detailError}
                <button
                  className="inline-link"
                  onClick={() => navigate({ selected: "" })}
                >
                  返回列表
                </button>
              </Empty>
            ) : detail ? (
              <Detail
                event={detail}
                language={language}
                setLanguage={setLanguage}
                focused={focusReader}
                onFocus={() => setFocusReader((v) => !v)}
                onPrevious={selectedIndex > 0 ? () => step(-1) : undefined}
                onNext={
                  selectedIndex >= 0 && selectedIndex < readingIds.length - 1
                    ? () => step(1)
                    : undefined
                }
                position={
                  selectedIndex >= 0
                    ? `${selectedIndex + 1} / ${readingIds.length}`
                    : ""
                }
                onBack={() => navigate({ selected: "" })}
                onState={(p) => patchState(detail.id, p)}
                onAnalyze={() => queue("analyze", detail.id)}
                onReview={() => queue("review", detail.id)}
                reviewing={jobs.some(
                  (j) =>
                    j.kind === "review" &&
                    j.target === detail.id &&
                    ["queued", "running"].includes(j.status),
                )}
                analyzing={jobs.some(
                  (j) =>
                    j.kind === "analyze" &&
                    j.target === detail.id &&
                    ["queued", "running"].includes(j.status),
                )}
              />
            ) : (
              <div className="welcome">
                <span className="reader-placeholder">
                  <FileText size={32} strokeWidth={1} />
                </span>
                <h2>从一篇好内容开始。</h2>
                <p>选择左侧的文章，安静地读一会儿。</p>
                <button
                  className="button secondary"
                  disabled={!events.length && !articles.length}
                  onClick={() => choose(readingIds[0])}
                >
                  开始阅读 <ArrowRight size={15} />
                </button>
                <div className="welcome-shortcut">
                  <span>
                    <kbd>J</kbd>
                    <kbd>K</kbd> 切换
                  </span>
                  <span>
                    <kbd>F</kbd> 专注阅读
                  </span>
                </div>
              </div>
            )}
          </section>
        </main>
        <QuickOpen
          open={quickOpen}
          onClose={() => setQuickOpen(false)}
          onChoose={(event) => {
            setSearch("");
            navigate({
              view: event.relevance_status === "accepted" ? "all" : "archive",
              q: "",
              topic: "",
              source: "",
              start: "",
              end: "",
              review: "",
              page: 1,
              selected: event.id,
            });
          }}
          commands={[
            {
              id: "archive",
              label: "综合归档",
              detail: "综合热榜与待审核资讯",
              run: () => switchView("archive"),
            },
            {
              id: "today",
              label: "今日精选",
              detail: "最近 24 小时",
              run: () => switchView("today"),
            },
            {
              id: "saved",
              label: "稍后再读",
              detail: "你的收藏",
              run: () => switchView("saved"),
            },
            {
              id: "briefs",
              label: "每日简报",
              detail: "一天的新闻概要",
              run: () => switchView("briefs"),
            },
            {
              id: "sources",
              label: "管理订阅来源",
              detail: "RSS 与社区",
              run: () => setPanel("sources"),
            },
            {
              id: "theme",
              label: theme === "light" ? "切换暗色模式" : "切换浅色模式",
              detail: "外观",
              run: () => setTheme(theme === "light" ? "dark" : "light"),
            },
          ]}
        />
        {notice && (
          <div className="toast" role="status">
            <Check size={17} />
            {notice}
          </div>
        )}
        {error && panel && (
          <div className="toast error-toast" role="alert">
            <X size={17} />
            {error}
            <button aria-label="关闭错误提示" onClick={() => setError("")}>
              关闭
            </button>
          </div>
        )}
        <Modal
          open={panel === "sources"}
          onClose={() => setPanel(null)}
          title="订阅来源"
          description="管理 RSS、社区订阅和热榜，查看更新状态。"
          wide
        >
          <SourcesPanel
            sources={sources}
            onChange={() => {
              listCache.current.clear();
              setRefresh((n) => n + 1);
              loadMeta().catch(fail);
            }}
            onTest={(id) => queue("source_test", id)}
            onError={fail}
            notify={notify}
          />
        </Modal>
        <Modal
          open={panel === "topics"}
          onClose={() => setPanel(null)}
          title="关注主题"
          description="用关键词定义你的关注方向，逗号分隔；修改后会重新匹配已有事件。"
        >
          <TopicsPanel
            topics={topics}
            onChange={() => {
              listCache.current.clear();
              loadMeta().catch(fail);
              setRefresh((n) => n + 1);
            }}
            onError={fail}
          />
        </Modal>
        <Modal
          open={panel === "settings"}
          onClose={() => setPanel(null)}
          title="工作台设置"
          description="采集频率、简报时间与自动解读。"
        >
          <SettingsPanel
            settings={settings}
            onSave={async (values) => {
              try {
                setSettings(await api<Settings>("/settings", "PATCH", values));
                notify("设置已保存");
              } catch (e) {
                fail(e);
              }
            }}
          />
        </Modal>
        <Modal
          open={panel === "jobs"}
          onClose={() => setPanel(null)}
          title="更新与后台任务"
          description={
            workerOnline
              ? "后台运行正常，关闭此面板不会中断任务。"
              : "后台未连接。请通过启动脚本同时运行 Web 与 Worker。"
          }
          wide
        >
          <JobsPanel jobs={jobs} retry={(j) => queue(j.kind, j.target)} />
        </Modal>
        <Modal
          open={panel === "reports"}
          onClose={() => setPanel(null)}
          title="报告存档"
          description="旧版报告与工作台导出均可独立打开，保留生成时的内容。"
        >
          <div className="report-list">
            {reports.length ? (
              reports.map((r) => (
                <a key={r.url} href={r.url} target="_blank" rel="noreferrer">
                  <FileText size={18} />
                  <span>{r.name}</span>
                  <ExternalLink size={15} />
                </a>
              ))
            ) : (
              <Empty title="尚无报告">
                更新任务完成后会保存工作台阅读存档。
              </Empty>
            )}
          </div>
        </Modal>
      </div>
    </Tooltip.Provider>
  );
}
