import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  channels,
  concepts,
  defaultStars,
  pages,
  stories,
  type Concept,
  type Page,
} from "./data";

export type Route = {
  concept: Concept;
  page: Page;
  tab: string;
  q: string;
  category: string;
  item: string;
  source: string;
  from: string;
  to: string;
};
export type Watch = {
  id: string;
  name: string;
  words: string;
  exclude: string;
  source: string;
  enabled: boolean;
};
export type Preferences = {
  dark: boolean;
  expanded: boolean;
  compact: boolean;
  reduced: boolean;
  bookmarks: string[];
  read: string[];
  stars: string[];
  order: string[];
  disabled: string[];
  followed: string[];
  interval: number;
  briefHour: string;
  schedule: boolean;
  watches: Watch[];
  language: "zh" | "original";
};
const initial: Preferences = {
  dark: false,
  expanded: false,
  compact: false,
  reduced: false,
  bookmarks: ["demo-event-2", "demo-event-4"],
  read: [],
  stars: defaultStars,
  order: channels.map((c) => c.id),
  disabled: [],
  followed: ["Agent", "AI 编程"],
  interval: 60,
  briefHour: "09:00",
  schedule: true,
  language: "zh",
  watches: [
    {
      id: "w1",
      name: "AI 产品与开源",
      words: "AI,开源,模型",
      exclude: "",
      source: "",
      enabled: true,
    },
    {
      id: "w2",
      name: "开发者工具",
      words: "开发者,工具",
      exclude: "",
      source: "",
      enabled: true,
    },
  ],
};
const storageKey = "radar-design-lab:v1:preferences";
export function parseRoute(): Route {
  const p = new URLSearchParams(location.search);
  return {
    concept:
      (p.get("concept") || "") in concepts
        ? (p.get("concept") as Concept)
        : "a",
    page: (p.get("page") || "") in pages ? (p.get("page") as Page) : "ai",
    tab: p.get("tab") || "all",
    q: p.get("q") || "",
    category: p.get("category") || "全部",
    item: p.get("item") || "",
    source: p.get("source") || "",
    from: p.get("from") || "",
    to: p.get("to") || "",
  };
}
function loadPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    const result = { ...initial };
    for (const key of Object.keys(initial) as (keyof Preferences)[]) {
      const value = saved[key];
      if (Array.isArray(initial[key])) {
        if (
          Array.isArray(value) &&
          (key === "watches"
            ? value.every(
                (w) =>
                  w &&
                  ["id", "name", "words", "exclude", "source"].every(
                    (k) => typeof w[k] === "string",
                  ) &&
                  typeof w.enabled === "boolean",
              )
            : value.every((v) => typeof v === "string"))
        )
          Object.assign(result, { [key]: value });
      } else if (typeof value === typeof initial[key])
        Object.assign(result, { [key]: value });
    }
    return result;
  } catch {
    return { ...initial };
  }
}
type Scrolls = Record<string, { top: number; left: number }>;
function scrollKey(r: Route) {
  return JSON.stringify({ ...r, item: r.concept === "b" ? r.item : "" });
}
function capture(): Scrolls {
  return Object.fromEntries(
    [
      ...document.querySelectorAll<HTMLElement>(
        ".design-lab [data-lab-scroll]",
      ),
    ].map((el) => [
      el.dataset.labScroll!,
      { top: el.scrollTop, left: el.scrollLeft },
    ]),
  );
}
export type DemoJob = {
  target: string;
  progress: number;
  stage: string;
  done: boolean;
};
function useLabState() {
  const [route, setRoute] = useState(parseRoute);
  const [prefs, setPrefs] = useState(loadPreferences);
  const [notice, setNotice] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [portal, setPortal] = useState<HTMLDivElement | null>(null);
  const [job, setJob] = useState<DemoJob | null>(null);
  const [pending, setPending] = useState(0);
  const [revision, setRevision] = useState(0);
  const [systemReduced, setSystemReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const routeRef = useRef(route);
  routeRef.current = route;
  const memory = useRef(new Map<string, Scrolls>());
  const saveScroll = (current: Route) => {
    const key = scrollKey(current);
    memory.current.set(key, { ...memory.current.get(key), ...capture() });
  };
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeJob = useRef(false);
  const [recovery, setRecovery] = useState(0);
  const focusReturn = useRef<HTMLElement | null>(null);
  const notify = (message: string) => setNotice(message);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(prefs));
    } catch {
      setNotice("浏览器存储不可用；本次演示操作仍然有效");
    }
  }, [prefs]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const listener = () => setSystemReduced(media.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);
  useEffect(() => {
    const back = () => {
      saveScroll(routeRef.current);
      setRoute(parseRoute());
      setMenuOpen(false);
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );
  const navigate = (patch: Partial<Route>, replace = false) => {
    saveScroll(routeRef.current);
    const next = { ...routeRef.current, ...patch };
    const p = new URLSearchParams({ preview: "redesign" });
    for (const [key, value] of Object.entries(next))
      if (value) p.set(key, value);
    history[replace ? "replaceState" : "pushState"]({}, "", "/?" + p);
    setRoute(next);
    setMenuOpen(false);
  };
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => {
      const stored = memory.current.get(scrollKey(route));
      for (const el of document.querySelectorAll<HTMLElement>(
        ".design-lab [data-lab-scroll]",
      )) {
        const value = stored?.[el.dataset.labScroll!];
        el.scrollTop = value?.top || 0;
        el.scrollLeft = value?.left || 0;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [
    route.concept,
    route.page,
    route.tab,
    route.q,
    route.category,
    route.source,
    route.from,
    route.to,
    route.item,
    recovery,
  ]);
  const go = (page: Page, tab = "all") =>
    navigate({
      page,
      tab,
      q: "",
      category: "全部",
      source: "",
      item: "",
      from: "",
      to: "",
    });
  const update = (patch: Partial<Preferences>) =>
    setPrefs((prev) => ({ ...prev, ...patch }));
  const toggle = (
    key: "bookmarks" | "read" | "stars" | "disabled" | "followed",
    id: string,
  ) =>
    setPrefs((prev) => ({
      ...prev,
      [key]: prev[key].includes(id)
        ? prev[key].filter((x) => x !== id)
        : [...prev[key], id],
    }));
  const openStory = (id: string) => {
    if (
      !document.querySelector(".lab-drawer") &&
      !document.activeElement?.closest('[role="dialog"]')
    )
      focusReturn.current = document.activeElement as HTMLElement;
    setPrefs((prev) => ({ ...prev, read: [...new Set([...prev.read, id])] }));
    navigate({ item: id });
  };
  const closeStory = () => {
    const closingId = routeRef.current.item;
    navigate({ item: "" });
    requestAnimationFrame(() => {
      const target = focusReturn.current?.isConnected
        ? focusReturn.current
        : document.querySelector<HTMLElement>(
            '[data-story="' + closingId + '"] .lab-story-open',
          );
      target?.focus({ preventScroll: true });
    });
  };
  const move = (id: string, target: string | number) => {
    const order = [...new Set([...prefs.order, ...channels.map((c) => c.id)])];
    const index = order.indexOf(id);
    const next =
      typeof target === "number"
        ? Math.max(0, Math.min(order.length - 1, index + target))
        : order.indexOf(target);
    if (index < 0 || next < 0 || next === index) return;
    saveScroll(route);
    order.splice(index, 1);
    order.splice(next, 0, id);
    update({ order });
    setRecovery((v) => v + 1);
    notify("频道顺序已保存到演示空间");
  };
  const refresh = (target = "全部来源") => {
    if (activeJob.current) {
      notify("已有模拟任务在进行中");
      return;
    }
    activeJob.current = true;
    let step = 0;
    const phases = [
      "检查演示来源",
      "读取示例内容",
      "去重与整理",
      "演示更新已就绪",
    ];
    setJob({ target, progress: 5, stage: phases[0], done: false });
    timer.current = setInterval(() => {
      step++;
      const done = step >= 4;
      setJob({
        target,
        progress: done ? 100 : step * 25,
        stage: phases[Math.min(step, 3)],
        done,
      });
      if (done) {
        clearInterval(timer.current!);
        timer.current = null;
        activeJob.current = false;
        setPending(3);
        notify("模拟检查完成，有 3 条演示更新");
      }
    }, 650);
  };
  const applyUpdates = () => {
    saveScroll(route);
    setRevision((v) => v + 1);
    setPending(0);
    setRecovery((v) => v + 1);
    notify("示例内容已更新");
  };
  const allStories = revision
    ? [...stories.slice(8), ...stories.slice(0, 8)]
    : stories.slice(0, 8);
  return {
    route,
    prefs,
    update,
    toggle,
    navigate,
    go,
    openStory,
    closeStory,
    move,
    notify,
    notice,
    searchOpen,
    setSearchOpen,
    menuOpen,
    setMenuOpen,
    portal,
    setPortal,
    focusReturn,
    job,
    refresh,
    pending,
    applyUpdates,
    revision,
    allStories,
    reduced: prefs.reduced || systemReduced,
  };
}
type LabState = ReturnType<typeof useLabState>;
const LabContext = createContext<LabState | null>(null);
export function LabProvider({ children }: { children: ReactNode }) {
  const value = useLabState();
  return <LabContext.Provider value={value}>{children}</LabContext.Provider>;
}
export function useLab() {
  const value = useContext(LabContext);
  if (!value) throw new Error("Design lab context required");
  return value;
}
