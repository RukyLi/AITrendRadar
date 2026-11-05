// Adapted from NewsNow's column/card.tsx (0560c993). Copyright (c) 2024 ourongxing.
// MIT license is distributed at /assets/newsnow/LICENSE.txt.
import { useState, type CSSProperties } from "react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  Clock3,
  ExternalLink,
  GripVertical,
  MoreHorizontal,
  RefreshCw,
  Star,
} from "lucide-react";
import { relative, time } from "../api";
import type { Source, Item } from "./Monitor";
import { newsnowSources } from "./newsnowSources";

const colors: Record<string, string> = {
  blue: "#3b82f6",
  red: "#ef4444",
  gray: "#6b7280",
  slate: "#64748b",
  green: "#22c55e",
  emerald: "#10b981",
  indigo: "#6366f1",
  orange: "#f97316",
  teal: "#14b8a6",
};

export function NewsNowCard({
  source,
  health,
  busy,
  query,
  onRefresh,
  onSubscribe,
  onMove,
  onDrop,
  onScroll,
  onOpen,
  onState,
  onHistory,
  onSettings,
  canUp,
  canDown,
}: {
  source: Source;
  health: Source;
  busy: boolean;
  query: string;
  onRefresh: () => void;
  onSubscribe: () => void;
  onMove: (direction: number) => void;
  onDrop: (id: string) => void;
  onScroll: () => void;
  onOpen: (item: Item) => void;
  onState: (id: string, patch: Record<string, boolean>) => void;
  onHistory: () => void;
  onSettings: () => void;
  canUp: boolean;
  canDown: boolean;
}) {
  const [dragging, setDragging] = useState(false),
    [over, setOver] = useState(false),
    [sortMenu, setSortMenu] = useState(false);
  const meta = newsnowSources[source.id];
  const realtime = source.mode === "realtime";
  const freshness = !health.enabled
    ? "自动采集已暂停"
    : health.state === "error"
      ? source.snapshot_id
        ? health.availability_label + " · 保留上次内容"
        : health.availability_label
      : source.fetched_at
        ? relative(source.fetched_at) + "更新"
        : "等待首次采集";
  return (
    <section
      className={
        "newsnow-card" +
        (dragging ? " dragging" : "") +
        (over ? " drag-over" : "")
      }
      style={
        {
          "--source-color": colors[meta?.color] || colors.blue,
        } as CSSProperties
      }
      aria-label={source.name + (realtime ? "快讯卡片" : "榜单卡片")}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/x-radar-source")) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData("application/x-radar-source");
        if (id) onDrop(id);
      }}
    >
      <header className="newsnow-card-header">
        <a
          href={meta?.home}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={"访问 " + source.name}
          className="newsnow-logo"
        >
          <img
            src={"/assets/newsnow/" + source.id.split("-")[0] + ".png"}
            alt=""
            width="32"
            height="32"
          />
        </a>
        <div className="newsnow-source-title">
          <div>
            <h2>{meta?.name || source.name}</h2>
            {meta?.title && (
              <span className="newsnow-source-tag">{meta.title}</span>
            )}
          </div>
          <small
            className={health.state === "error" ? "warning" : ""}
            title={
              "最近检查：" +
              time(health.last_checked, true) +
              "\n最近成功：" +
              time(health.last_success, true) +
              (health.error ? "\n" + health.error : "")
            }
          >
            {busy ? "正在检查…" : freshness}
            {!busy && health.state === "cache" ? " · 缓存" : ""}
          </small>
        </div>
        <div className="newsnow-card-actions">
          <button
            className="newsnow-icon"
            aria-label={"刷新 " + source.name}
            title="刷新"
            disabled={busy}
            onClick={onRefresh}
          >
            <RefreshCw size={17} className={busy ? "spinning" : ""} />
          </button>
          <button
            className="newsnow-icon"
            aria-label={
              (health.subscribed ? "取消关注 " : "关注 ") + source.name
            }
            aria-pressed={!!health.subscribed}
            title={health.subscribed ? "取消关注" : "关注来源"}
            onClick={onSubscribe}
          >
            <Star
              size={18}
              fill={health.subscribed ? "currentColor" : "none"}
            />
          </button>
          <Dropdown.Root open={sortMenu} onOpenChange={setSortMenu}>
            <Dropdown.Trigger asChild>
              <button
                className="newsnow-icon newsnow-drag"
                aria-label={"排序与更多操作 " + source.name}
                title="拖动排序，点击查看更多"
                draggable
                // Radix opens on pointerdown; defer that until click so a drag can start.
                onPointerDownCapture={(e) => e.stopPropagation()}
                onClick={() => setSortMenu((value) => !value)}
                onDragStart={(e) => {
                  e.dataTransfer.setData(
                    "application/x-radar-source",
                    source.id,
                  );
                  e.dataTransfer.effectAllowed = "move";
                  setDragging(true);
                }}
                onDragEnd={() => {
                  setDragging(false);
                  setOver(false);
                }}
              >
                <GripVertical size={17} />
              </button>
            </Dropdown.Trigger>
            <Dropdown.Portal>
              <Dropdown.Content
                className="dropdown newsnow-menu"
                align="end"
                sideOffset={6}
              >
                <Dropdown.Item disabled={!canUp} onSelect={() => onMove(-1)}>
                  <ArrowUp size={14} />
                  向前移动
                </Dropdown.Item>
                <Dropdown.Item disabled={!canDown} onSelect={() => onMove(1)}>
                  <ArrowDown size={14} />
                  向后移动
                </Dropdown.Item>
                <Dropdown.Separator />
                <Dropdown.Item onSelect={onHistory}>
                  <Clock3 size={14} />
                  查看来源历史
                </Dropdown.Item>
                <Dropdown.Item onSelect={onSettings}>
                  来源状态与设置
                </Dropdown.Item>
              </Dropdown.Content>
            </Dropdown.Portal>
          </Dropdown.Root>
        </div>
      </header>
      <div
        className={"newsnow-card-body" + (busy ? " refreshing" : "")}
        data-board-scroll={source.id}
        onScroll={onScroll}
        aria-busy={busy}
        tabIndex={0}
        aria-label={source.name + "内容"}
      >
        {health.error && !!source.items?.length && (
          <p className="newsnow-source-error">{health.error}</p>
        )}
        {source.items?.length ? (
          <ol className={realtime ? "newsnow-time-list" : "newsnow-hot-list"}>
            {source.items.map((item) => (
              <NewsNowItem
                key={item.item_id}
                item={item}
                realtime={realtime}
                onOpen={onOpen}
                onState={onState}
              />
            ))}
          </ol>
        ) : (
          <div className="newsnow-empty">
            <Clock3 size={25} strokeWidth={1.3} />
            <p>
              {query
                ? "没有匹配内容"
                : health.error
                  ? health.availability_label
                  : "等待首次更新"}
            </p>
            {health.error && (
              <small className="newsnow-empty-reason">{health.error}</small>
            )}
            {health.last_checked && (
              <small>检查于 {time(health.last_checked, true)}</small>
            )}
            <button onClick={health.error ? onSettings : onRefresh}>
              {health.error ? "查看来源状态" : "刷新试试"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function NewsNowItem({
  item,
  realtime,
  onOpen,
  onState,
}: {
  item: Item;
  realtime: boolean;
  onOpen: (item: Item) => void;
  onState: (id: string, patch: Record<string, boolean>) => void;
}) {
  const change =
    item.change === "new"
      ? "新"
      : item.change === "returned"
        ? "回榜"
        : item.delta
          ? (item.delta > 0 ? "↑" : "↓") + Math.abs(item.delta)
          : "";
  let info = "";
  try {
    info = JSON.parse(item.extra || "{}").info || "";
  } catch {
    /* Older samples may have no extra fields. */
  }
  return (
    <li className={"newsnow-item" + (item.is_read ? " read" : "")}>
      {realtime && (
        <time
          className="newsnow-pubtime"
          dateTime={item.published_at || undefined}
          title={
            item.published_at
              ? time(item.published_at, true)
              : "来源未提供发布时间"
          }
        >
          {item.published_at ? relative(item.published_at) : "发布时间未知"}
        </time>
      )}
      <div className="newsnow-item-line">
        <a
          className="newsnow-story"
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            if (!item.is_read) onState(item.event_id, { is_read: true });
          }}
        >
          {!realtime && <span className="newsnow-rank">{item.rank}</span>}
          <span className="newsnow-story-copy">
            {item.title}
            {info && <small className="newsnow-extra">{info}</small>}
            {!realtime && change && (
              <small className={"newsnow-change " + item.change}>
                {change}
              </small>
            )}
          </span>
        </a>
        <Dropdown.Root>
          <Dropdown.Trigger
            className={
              "newsnow-item-menu newsnow-icon" +
              (item.bookmarked ? " saved" : "")
            }
            aria-label={"条目操作：" + item.title}
          >
            {item.bookmarked ? (
              <Bookmark size={14} fill="currentColor" />
            ) : (
              <MoreHorizontal size={15} />
            )}
          </Dropdown.Trigger>
          <Dropdown.Portal>
            <Dropdown.Content
              className="dropdown newsnow-menu"
              align="end"
              sideOffset={4}
            >
              <Dropdown.Item onSelect={() => onOpen(item)}>
                <Clock3 size={14} />
                详情与采样历史
              </Dropdown.Item>
              <Dropdown.Item
                onSelect={() =>
                  onState(item.event_id, { bookmarked: !item.bookmarked })
                }
              >
                <Bookmark size={14} />
                {item.bookmarked ? "取消收藏" : "收藏"}
              </Dropdown.Item>
              <Dropdown.Item
                onSelect={() =>
                  onState(item.event_id, { is_read: !item.is_read })
                }
              >
                {item.is_read ? "标为未读" : "标为已读"}
              </Dropdown.Item>
              <Dropdown.Item asChild>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => onState(item.event_id, { is_read: true })}
                >
                  <ExternalLink size={14} />
                  打开原文
                </a>
              </Dropdown.Item>
            </Dropdown.Content>
          </Dropdown.Portal>
        </Dropdown.Root>
      </div>
    </li>
  );
}
