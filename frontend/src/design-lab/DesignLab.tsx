import { useEffect, useRef, useState } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/800.css";
import "@fontsource/noto-serif-sc/600.css";
import {
  channels,
  concepts,
  pages,
  resolveStory,
  type Concept,
  type Page,
} from "./data";
import { LabProvider, useLab } from "./state";
import {
  Badge,
  Brand,
  Button,
  Icon,
  IconButton,
  Menu,
  Modal,
  SearchField,
  Segments,
  type IconName,
} from "./ui";
import { AIView, Reader, filteredStories } from "./Reading";
import { MonitorView } from "./Monitoring";
import {
  ArchiveView,
  BriefsView,
  JobsView,
  SettingsView,
  SourcesView,
} from "./Management";
import { Showcase, SpecsView } from "./Showcase";
import "./lab.css";

const navigation: { page: Page; icon: IconName; label: string }[] = [
  { page: "ai", icon: "layers", label: "AI 情报" },
  { page: "monitor", icon: "world", label: "实时热点" },
  { page: "saved", icon: "bookmark", label: "我的收藏" },
  { page: "briefs", icon: "book", label: "每日简报" },
  { page: "sources", icon: "rss", label: "来源管理" },
  { page: "jobs", icon: "activity", label: "任务状态" },
  { page: "settings", icon: "settings", label: "偏好设置" },
];
const extras: { page: Page; icon: IconName; label: string }[] = [
  { page: "archive", icon: "archive", label: "综合归档" },
  { page: "articles", icon: "file", label: "原始文章" },
  { page: "reports", icon: "book", label: "报告存档" },
  { page: "components", icon: "palette", label: "组件与动效" },
  { page: "specs", icon: "ruler", label: "设计规范" },
];
function LabApp() {
  const lab = useLab();
  const {
    route,
    prefs,
    update,
    navigate,
    go,
    portal,
    setPortal,
    notice,
    searchOpen,
    setSearchOpen,
    menuOpen,
    setMenuOpen,
    pending,
    applyUpdates,
    reduced,
    allStories,
    job,
  } = lab;
  const [wide, setWide] = useState(
    () => matchMedia("(min-width: 1100px)").matches,
  );
  const [search, setSearch] = useState("");
  const pageRef = useRef<HTMLDivElement>(null);
  const selected = resolveStory(route.item);
  const inlineReader = route.concept === "a" && route.page === "ai" && wide;
  const fullReader =
    route.concept === "b" && ["ai", "saved"].includes(route.page);
  const showDrawer = !!selected && !inlineReader && !fullReader;
  const primary = route.page === "monitor" ? "monitor" : "ai";
  const hasSearchResults =
    !search ||
    allStories.some((s) =>
      (s.title + s.summary).toLowerCase().includes(search.toLowerCase()),
    ) ||
    channels.some((c) =>
      (c.name + c.title).toLowerCase().includes(search.toLowerCase()),
    ) ||
    Object.values(pages).some((name) => name.includes(search));
  useEffect(() => {
    if (selected && !prefs.read.includes(selected.id))
      update({ read: [...prefs.read, selected.id] });
    // Mark only when opening another event; manually setting it unread must stick.
  }, [selected?.id]);
  useEffect(() => {
    document.title = concepts[route.concept].name + " · Radar 设计样稿";
    const mq = matchMedia("(min-width: 1100px)");
    const resize = () => setWide(mq.matches);
    mq.addEventListener("change", resize);
    return () => mq.removeEventListener("change", resize);
  }, [route.concept]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      const dialog = target?.closest('[role="dialog"]');
      const input =
        target &&
        (target.matches("input,textarea,select,[contenteditable=true]") ||
          target.closest('[role="menu"]') ||
          (dialog && !dialog.querySelector(".lab-reader")));
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (
          !document.querySelector('.design-lab [role="dialog"]') ||
          searchOpen
        )
          setSearchOpen(!searchOpen);
        return;
      }
      if (input || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        pageRef.current
          ?.querySelector<HTMLInputElement>("[data-lab-search]")
          ?.focus();
      }
      if (e.key === "Escape" && selected && !dialog) lab.closeStory();
      if (e.key.toLowerCase() === "b" && selected) {
        e.preventDefault();
        lab.toggle("bookmarks", selected.id);
      }
      if (
        ["j", "k"].includes(e.key.toLowerCase()) &&
        ["ai", "saved"].includes(route.page)
      ) {
        let ids = [
          ...document.querySelectorAll<HTMLElement>(".design-lab [data-story]"),
        ].map((el) => el.dataset.story!);
        if (!ids.length && fullReader) {
          const source =
            route.page === "saved"
              ? prefs.bookmarks.map(resolveStory).filter((s) => !!s)
              : route.tab === "following"
                ? allStories.filter((s) =>
                    s.topics.some((t) => prefs.followed.includes(t.name)),
                  )
                : allStories;
          ids = filteredStories(
            source,
            route.q,
            route.category,
            route.from,
            route.to,
          ).map((s) => s.id);
        }
        const index = Math.max(
          0,
          Math.min(
            ids.length - 1,
            ids.indexOf(route.item) + (e.key.toLowerCase() === "j" ? 1 : -1),
          ),
        );
        if (ids[index]) {
          e.preventDefault();
          lab.openStory(ids[index]);
          document
            .querySelector('[data-story="' + ids[index] + '"]')
            ?.scrollIntoView({ block: "nearest" });
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [lab, selected, searchOpen, route.page, route.item, setSearchOpen]);
  function switchConcept(concept: Concept) {
    navigate({ concept, item: "" });
  }
  const page =
    route.page === "ai" ? (
      <AIView />
    ) : route.page === "monitor" ? (
      <MonitorView />
    ) : route.page === "saved" ? (
      <AIView saved />
    ) : route.page === "briefs" ? (
      <BriefsView />
    ) : route.page === "sources" ? (
      <SourcesView />
    ) : route.page === "settings" ? (
      <SettingsView />
    ) : route.page === "jobs" ? (
      <JobsView />
    ) : route.page === "components" ? (
      <Showcase />
    ) : route.page === "specs" ? (
      <SpecsView />
    ) : (
      <ArchiveView />
    );
  return (
    <Tooltip.Provider delayDuration={350}>
      <div
        className="design-lab"
        data-concept={route.concept}
        data-dark={prefs.dark ? "true" : "false"}
        data-reduced={reduced ? "true" : "false"}
        data-compact={prefs.compact ? "true" : "false"}
        data-expanded={prefs.expanded ? "true" : "false"}
      >
        <a className="lab-skip-link" href="#lab-main">
          跳到内容
        </a>
        <div className="lab-preview-bar">
          <div className="lab-preview-label">
            <span className="lab-preview-dot" />
            <strong>DESIGN LAB</strong>
            <span>交互样稿 · 演示数据</span>
          </div>
          <div className="lab-concept-picker" aria-label="选择设计方案">
            {Object.entries(concepts).map(([key, c]) => (
              <button
                key={key}
                onClick={() => switchConcept(key as Concept)}
                aria-pressed={route.concept === key}
              >
                <b>{key.toUpperCase()}</b>
                <span>{c.name}</span>
                <i style={{ background: c.colors[2] }} />
              </button>
            ))}
          </div>
          <div className="lab-preview-actions">
            <button
              className={route.page === "components" ? "active" : ""}
              onClick={() => go("components")}
            >
              <Icon name="palette" size={16} />
              <span>组件</span>
            </button>
            <button
              className={route.page === "specs" ? "active" : ""}
              onClick={() => go("specs")}
            >
              <Icon name="ruler" size={16} />
              <span>规范</span>
            </button>
            <a href="/" title="返回正式工作台">
              <Icon name="external" size={16} />
              <span>正式站</span>
            </a>
          </div>
        </div>
        <div className="lab-shell">
          <header className="lab-header">
            <div className="lab-header-brand">
              <button onClick={() => go("ai")} aria-label="Radar 预览首页">
                <Brand />
              </button>
              <span className="lab-edition">
                {concepts[route.concept].code} / 01
              </span>
            </div>
            <Segments
              label="主入口"
              value={primary}
              items={[
                {
                  value: "ai",
                  label: route.concept === "d" ? "AI 新鲜事" : "AI 情报",
                  icon: "layers",
                },
                { value: "monitor", label: "实时热点", icon: "world" },
              ]}
              onChange={(v) => go(v as Page)}
            />
            <div className="lab-header-actions">
              <button
                className="lab-global-search"
                aria-label="打开全局搜索"
                onClick={() => {
                  setSearch("");
                  setSearchOpen(true);
                }}
              >
                <Icon name="search" size={18} />
                <span>搜索你关心的</span>
                <kbd>⌘ K</kbd>
              </button>
              <IconButton
                name={prefs.dark ? "sun" : "moon"}
                label={prefs.dark ? "切换浅色模式" : "切换暗色模式"}
                onClick={() => update({ dark: !prefs.dark })}
              />
              <IconButton
                name="menu"
                label="打开页面目录"
                onClick={() => setMenuOpen(true)}
                className="lab-mobile-menu"
              />
              <span className="lab-avatar" aria-label="个人演示空间">
                R
              </span>
            </div>
          </header>
          {(route.concept === "a" || route.concept === "c") && (
            <aside className="lab-rail">
              <nav aria-label="预览页面导航">
                {navigation.map((n) => (
                  <button
                    key={n.page}
                    title={n.label}
                    aria-label={n.label}
                    aria-current={route.page === n.page ? "page" : undefined}
                    className={route.page === n.page ? "active" : ""}
                    onClick={() => go(n.page)}
                  >
                    <Icon name={n.icon} />
                    <span>{n.label}</span>
                    {n.page === "saved" && (
                      <small>{prefs.bookmarks.length}</small>
                    )}
                  </button>
                ))}
              </nav>
              <div className="lab-rail-bottom">
                <button onClick={() => setMenuOpen(true)} title="更多页面">
                  <Icon name="more" />
                  <span>更多页面</span>
                </button>
                {route.concept === "a" && (
                  <button
                    onClick={() => update({ expanded: !prefs.expanded })}
                    title={prefs.expanded ? "收起导航" : "展开导航"}
                    aria-label={prefs.expanded ? "收起导航" : "展开导航"}
                  >
                    <Icon name={prefs.expanded ? "collapse" : "menu"} />
                    <span>收起导航</span>
                  </button>
                )}
                <span className="lab-rail-indicator">
                  <i />
                  演示空间
                </span>
              </div>
            </aside>
          )}
          {(route.concept === "b" || route.concept === "d") && (
            <nav className="lab-horizontal-nav" aria-label="预览页面导航">
              <span>YOUR DAILY PERSPECTIVE</span>
              {navigation.slice(2).map((n) => (
                <button
                  className={route.page === n.page ? "active" : ""}
                  key={n.page}
                  aria-current={route.page === n.page ? "page" : undefined}
                  onClick={() => go(n.page)}
                >
                  <Icon name={n.icon} size={17} />
                  {n.label}
                </button>
              ))}
              <Menu
                label="资料库与更多页面"
                items={extras.map((n) => ({
                  label: n.label,
                  icon: n.icon,
                  action: () => go(n.page),
                }))}
              />
            </nav>
          )}
          <main
            id="lab-main"
            className={"lab-main page-" + route.page}
            data-lab-scroll="main"
            tabIndex={-1}
            ref={pageRef}
          >
            <div className="lab-page-container">
              {pending > 0 && (
                <div className="lab-update-banner">
                  <Icon name="bolt" size={17} />
                  <span>有 {pending} 条演示更新，等你准备好再看。</span>
                  <Button onClick={applyUpdates}>
                    查看更新 <Icon name="right" size={15} />
                  </Button>
                </div>
              )}
              {page}
            </div>
          </main>
          <nav className="lab-bottom-nav" aria-label="手机导航">
            {navigation.slice(0, 4).map((n) => (
              <button
                key={n.page}
                aria-current={route.page === n.page ? "page" : undefined}
                className={route.page === n.page ? "active" : ""}
                onClick={() => go(n.page)}
              >
                <Icon name={n.icon} />
                <span>{n.label}</span>
              </button>
            ))}
            <button onClick={() => setMenuOpen(true)}>
              <Icon name="menu" />
              <span>更多</span>
            </button>
          </nav>
        </div>
        {job && !job.done && route.page !== "jobs" && (
          <button className="lab-task-float" onClick={() => go("jobs")}>
            <Icon name="refresh" className="lab-spin" size={16} />
            <span>{job.stage}</span>
            <strong>{job.progress}%</strong>
          </button>
        )}
        {notice && (
          <div className="lab-toast" role="status" aria-live="polite">
            <Icon name="check" size={18} />
            {notice}
          </div>
        )}
        <div ref={setPortal} className="lab-portal" />
        {portal && (
          <>
            <Modal
              open={showDrawer}
              onClose={lab.closeStory}
              title="事件详情"
              scrollId={"reader-" + selected?.id}
              description="示例内容 · 保留当前浏览位置"
              drawer
            >
              {selected && <Reader story={selected} />}
            </Modal>
            <Modal
              open={menuOpen}
              onClose={() => setMenuOpen(false)}
              title="去哪里发现新线索？"
            >
              <nav className="lab-page-directory">
                {[...navigation, ...extras].map((n) => (
                  <button key={n.page} onClick={() => go(n.page)}>
                    <Icon name={n.icon} />
                    <span>{n.label}</span>
                    <Icon name="arrow" size={16} />
                  </button>
                ))}
              </nav>
            </Modal>
            <Modal
              open={searchOpen}
              onClose={() => setSearchOpen(false)}
              title="搜索你的下一份好奇"
              description="搜索演示事件、频道与页面；⌘/Ctrl K 打开，Escape 关闭。"
            >
              <SearchField
                label="全局搜索"
                value={search}
                onChange={setSearch}
                placeholder="试试 Agent、微博、组件…"
              />
              <div
                className="lab-command-results"
                onKeyDown={(e) => {
                  if (!["ArrowDown", "ArrowUp"].includes(e.key)) return;
                  const buttons = [
                    ...e.currentTarget.querySelectorAll<HTMLButtonElement>(
                      "button",
                    ),
                  ];
                  const index = buttons.indexOf(
                    document.activeElement as HTMLButtonElement,
                  );
                  e.preventDefault();
                  buttons[
                    (index +
                      (e.key === "ArrowDown" ? 1 : -1) +
                      buttons.length) %
                      buttons.length
                  ]?.focus();
                }}
              >
                {!hasSearchResults && (
                  <p className="lab-search-empty" role="status">
                    没有找到结果，试试其他关键词。
                  </p>
                )}
                {allStories
                  .filter(
                    (s) =>
                      !search ||
                      (s.title + s.summary)
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                  )
                  .slice(0, 4)
                  .map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setSearchOpen(false);
                        navigate({
                          page: "ai",
                          item: s.id,
                          q: "",
                          category: "全部",
                          tab: "all",
                        });
                      }}
                    >
                      <Icon name="file" />
                      <span>
                        {s.title}
                        <small>AI 事件</small>
                      </span>
                      <Icon name="arrow" size={16} />
                    </button>
                  ))}
                {channels
                  .filter(
                    (c) =>
                      search &&
                      (c.name + c.title)
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                  )
                  .slice(0, 4)
                  .map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSearchOpen(false);
                        navigate({
                          page: "monitor",
                          source: c.id,
                          category: "全部",
                          q: "",
                          tab: "all",
                          item: "",
                        });
                      }}
                    >
                      <Icon name="world" />
                      <span>
                        {c.name} {c.title}
                        <small>频道</small>
                      </span>
                    </button>
                  ))}
                {Object.entries(pages)
                  .filter(([, name]) => !search || name.includes(search))
                  .slice(0, 4)
                  .map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => {
                        setSearchOpen(false);
                        go(key as Page);
                      }}
                    >
                      <Icon name="grid" />
                      <span>
                        {label}
                        <small>页面</small>
                      </span>
                    </button>
                  ))}
              </div>
              <p className="lab-footnote">所有搜索结果来自固定演示数据。</p>
            </Modal>
          </>
        )}
      </div>
    </Tooltip.Provider>
  );
}
export default function DesignLab() {
  return (
    <LabProvider>
      <LabApp />
    </LabProvider>
  );
}
