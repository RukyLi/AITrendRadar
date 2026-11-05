import { useState } from "react";
import { RefreshCw, Search, Star } from "lucide-react";
import { time, type Job } from "../api";
import type { Source } from "./Monitor";
import { newsnowSources } from "./newsnowSources";

export const monitorCategories = ["国内", "国际", "科技", "财经", "体育"];

export function ChannelDirectory({
  sources,
  initialQuery,
  job,
  onConfigure,
  onTest,
}: {
  sources: Source[];
  initialQuery: string;
  job: Job | null;
  onConfigure: (source: Source, patch: Partial<Source>) => void;
  onTest: (id?: string) => void;
}) {
  const [query, setQuery] = useState(initialQuery),
    [category, setCategory] = useState(""),
    [status, setStatus] = useState("");
  const busy = !!job && ["queued", "running"].includes(job.status);
  const filtered = sources.filter(
    (s) =>
      (!category || s.category === category) &&
      (!query ||
        (s.name + " " + s.id)
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase())) &&
      (!status ||
        (status === "error" ? s.state === "error" : s.availability === status)),
  );
  return (
    <section className="channel-directory" aria-label="完整频道目录">
      <div className="channel-directory-tools">
        <label className="monitor-search">
          <Search size={15} />
          <input
            aria-label="搜索频道"
            placeholder="搜索频道名称"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="筛选频道状态"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">全部状态</option>
          <option value="ok">可用</option>
          <option value="error">暂不可用</option>
          <option value="pending">待检查</option>
        </select>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => onTest()}
        >
          <RefreshCw size={14} className={busy ? "spinning" : ""} />
          检查全部 {sources.length} 个
        </button>
      </div>
      <nav className="monitor-category-tabs" aria-label="目录分类">
        {["", ...monitorCategories].map((c) => (
          <button
            key={c}
            aria-pressed={category === c}
            className={category === c ? "selected" : ""}
            onClick={() => setCategory(c)}
          >
            {c || "全部"}
            <small>
              {sources.filter((s) => !c || s.category === c).length}
            </small>
          </button>
        ))}
      </nav>
      {job && (
        <p className="channel-check-progress" role="status">
          {job.stage}
          {job.result.successful_sources != null
            ? ` · 本轮成功 ${job.result.successful_sources}，失败 ${job.result.failed_sources || 0}`
            : ""}
        </p>
      )}
      <div className="channel-directory-scroll">
        {monitorCategories.map((c) => {
          const entries = filtered.filter((s) => s.category === c);
          return (
            !!entries.length && (
              <section
                className="channel-directory-group"
                key={c}
                aria-label={c + "频道"}
              >
                <h3>
                  {c}
                  <small>{entries.length} 个频道</small>
                </h3>
                <div>
                  {entries.map((s) => {
                    const meta = newsnowSources[s.id];
                    const checking =
                      busy && (!job.target || job.target === s.id);
                    return (
                      <article className="channel-directory-entry" key={s.id}>
                        <div className="channel-entry-header">
                          <img
                            src={
                              "/assets/newsnow/" + s.id.split("-")[0] + ".png"
                            }
                            width="28"
                            height="28"
                            alt=""
                          />
                          <div>
                            <strong>{meta?.name || s.name}</strong>
                            {meta?.title && <span>{meta.title}</span>}
                          </div>
                          <button
                            className={
                              "newsnow-icon channel-star" +
                              (s.subscribed ? " selected" : "")
                            }
                            aria-label={
                              (s.subscribed ? "取消关注频道 " : "关注频道 ") +
                              s.name
                            }
                            aria-pressed={!!s.subscribed}
                            onClick={() =>
                              onConfigure(s, {
                                subscribed: Number(!s.subscribed),
                              })
                            }
                          >
                            <Star
                              size={18}
                              fill={s.subscribed ? "currentColor" : "none"}
                            />
                          </button>
                        </div>
                        <div className="channel-entry-status">
                          <span
                            className={
                              "channel-status " +
                              (s.state === "error" ? "error" : s.availability)
                            }
                          >
                            {checking ? "检查中" : s.availability_label}
                          </span>
                          <small>
                            {s.mode === "hottest" ? "热榜" : "快讯"} ·{" "}
                            {s.interval_seconds / 60} 分钟
                          </small>
                          {!s.enabled && <small>采集已暂停</small>}
                        </div>
                        {s.error && (
                          <p className="channel-error-reason">{s.error}</p>
                        )}
                        <small className="channel-check-time">
                          最近检查 {time(s.last_checked, true)}
                          {s.last_success
                            ? " · 成功 " + time(s.last_success, true)
                            : ""}
                        </small>
                        <footer>
                          <label>
                            <input
                              type="checkbox"
                              checked={!!s.enabled}
                              onChange={(e) =>
                                onConfigure(s, {
                                  enabled: Number(e.target.checked),
                                })
                              }
                            />
                            自动采集
                          </label>
                          <button
                            disabled={checking}
                            onClick={() => onTest(s.id)}
                            aria-label={"检查频道 " + s.name}
                          >
                            <RefreshCw
                              size={12}
                              className={checking ? "spinning" : ""}
                            />
                            {checking ? "检查中" : "检查"}
                          </button>
                        </footer>
                      </article>
                    );
                  })}
                </div>
              </section>
            )
          );
        })}
        {!filtered.length && (
          <p className="channel-directory-empty">
            没有匹配的频道，试试其他名称或分类。
          </p>
        )}
      </div>
      <p className="channel-directory-note">
        星标决定「关注」内容。状态来自最近一次实际检查；失败频道会保留，手动检查遵守来源最小间隔，自动采集在失败后退避。
      </p>
    </section>
  );
}
