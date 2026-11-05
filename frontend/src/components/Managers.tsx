import { useState, useEffect, type FormEvent } from "react";
import { Plus, Trash2, RefreshCw } from "lucide-react";
import {
  api,
  time,
  relative,
  type Source,
  type Topic,
  type Settings,
  type Job,
} from "../api";
import { Empty, Skeleton } from "./Primitives";
import { SourceBadge } from "./Quality";
export function SourcesPanel({
  sources,
  onChange,
  onTest,
  onError,
  notify,
}: {
  sources: Source[];
  onChange: () => void;
  onTest: (id: string) => void;
  onError: (e: unknown) => void;
  notify: (s: string) => void;
}) {
  const [tab, setTab] = useState("all"),
    [adding, setAdding] = useState(false),
    [editing, setEditing] = useState(""),
    [name, setName] = useState(""),
    [url, setUrl] = useState(""),
    [saving, setSaving] = useState(false),
    [localError, setLocalError] = useState("");
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setLocalError("");
    try {
      await api(
        "/sources" + (editing ? "/" + editing : ""),
        editing ? "PATCH" : "POST",
        { name, url, enabled: true },
      );
      setAdding(false);
      setEditing("");
      setName("");
      setUrl("");
      onChange();
      notify("订阅来源已保存");
    } catch (e) {
      setLocalError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="manager">
      <div className="manager-toolbar">
        <div className="segmented">
          {[
            ["all", "全部"],
            ["rss", "RSS"],
            ["hotlist", "热榜"],
            ["community", "社区"],
          ].map(([id, label]) => (
            <button
              className={tab === id ? "active" : ""}
              key={id}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          className="button"
          onClick={() => {
            setAdding(!adding);
            setEditing("");
            setName("");
            setUrl("");
          }}
        >
          <Plus size={15} />
          新增订阅
        </button>
      </div>
      {adding && (
        <form className="editor-form source-form" onSubmit={save}>
          <label>
            来源名称
            <input
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：开发者博客"
            />
          </label>
          <label>
            RSS / Atom / JSON Feed 地址
            <input
              required
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/feed.xml"
            />
          </label>
          {localError && (
            <p role="alert" className="form-error">
              {localError}
            </p>
          )}
          <button className="button" disabled={saving}>
            {saving ? "正在保存…" : editing ? "保存修改" : "添加来源"}
          </button>
        </form>
      )}
      <div className="source-manager-list">
        {sources
          .filter(
            (s) =>
              tab === "all" ||
              (tab === "community"
                ? s.publisher_type === "community"
                : s.kind === tab),
          )
          .map((s) => (
            <div className="source-manager-row" key={s.id}>
              <div className={"source-status-dot " + s.status} />
              <div className="source-manager-main">
                <div>
                  <strong>{s.name}</strong>
                  <SourceBadge source={s} />
                </div>
                <p title={s.url}>{s.url || "官方 API 接入预留"}</p>
                <small className="delivery-label">{s.delivery_label}</small>
                <small className={s.error ? "form-error" : ""}>
                  {s.error ||
                    s.note ||
                    (s.status === "ok"
                      ? `${s.item_count} 条 · ${relative(s.last_success)}更新`
                      : s.status === "empty"
                        ? "格式有效，当前没有条目"
                        : "尚未检查")}
                  {s.failures > 1 ? ` · 连续失败 ${s.failures} 次` : ""}
                </small>
              </div>
              <div className="source-manager-actions">
                {s.kind === "rss" && (
                  <button
                    className="text-btn"
                    onClick={() => {
                      setAdding(true);
                      setEditing(s.id);
                      setName(s.name);
                      setUrl(s.url);
                    }}
                  >
                    编辑
                  </button>
                )}
                <button
                  className="text-btn"
                  disabled={s.kind === "x"}
                  onClick={() => onTest(s.id)}
                >
                  测试
                </button>
                <button
                  role="switch"
                  aria-checked={!!s.enabled}
                  aria-label={"启用 " + s.name}
                  className={"switch " + (s.enabled ? "on" : "")}
                  disabled={s.kind === "x"}
                  onClick={async () => {
                    try {
                      await api("/sources/" + s.id, "PATCH", {
                        enabled: !s.enabled,
                      });
                      onChange();
                    } catch (e) {
                      onError(e);
                    }
                  }}
                >
                  <i />
                </button>
              </div>
            </div>
          ))}
      </div>
      <p className="manager-footnote">
        标识区分发布者与采集渠道：“机构官方”表示机构自己的发布，不代表独立评测。社区
        RSS 不包含完整互动指标；热榜由第三方聚合服务提供。
      </p>
    </div>
  );
}
export function TopicsPanel({
  topics,
  onChange,
  onError,
}: {
  topics: Topic[];
  onChange: () => void;
  onError: (e: unknown) => void;
}) {
  const [editing, setEditing] = useState<Topic | null>(null),
    [adding, setAdding] = useState(false),
    [busy, setBusy] = useState(false);
  const blank = {
    id: "",
    name: "",
    keywords: "",
    color: "#5c7d72",
    followed: 1,
    event_count: 0,
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      const { name, keywords, color, followed } = editing;
      await api(
        "/topics" + (editing.id ? "/" + editing.id : ""),
        editing.id ? "PUT" : "POST",
        { name, keywords, color, followed: !!followed },
      );
      setEditing(null);
      setAdding(false);
      onChange();
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="manager">
      <div className="manager-toolbar">
        <span className="subtle">
          {topics.filter((t) => t.followed).length} 个关注主题
        </span>
        <button
          className="button secondary"
          onClick={() => {
            setAdding(true);
            setEditing(blank);
          }}
        >
          <Plus size={15} />
          新增主题
        </button>
      </div>
      {editing ? (
        <form onSubmit={save} className="editor-form">
          <label>
            主题名称
            <input
              required
              maxLength={40}
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </label>
          <label>
            匹配关键词
            <textarea
              required
              rows={5}
              value={editing.keywords}
              onChange={(e) =>
                setEditing({ ...editing, keywords: e.target.value })
              }
            />
            <small>中文、英文均可，用逗号分隔。英文短词按词边界匹配。</small>
          </label>
          <label>
            主题颜色
            <input
              type="color"
              value={editing.color}
              onChange={(e) =>
                setEditing({ ...editing, color: e.target.value })
              }
            />
          </label>
          <div className="form-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setEditing(null);
                setAdding(false);
              }}
            >
              取消
            </button>
            <button disabled={busy} className="button">
              {busy ? "重新匹配中…" : adding ? "创建主题" : "保存主题"}
            </button>
          </div>
        </form>
      ) : (
        <div className="topics-manager">
          {topics.map((t) => (
            <div key={t.id}>
              <i style={{ background: t.color }} />
              <button className="topic-edit" onClick={() => setEditing(t)}>
                <strong>{t.name}</strong>
                <p>{t.keywords}</p>
              </button>
              <button
                className={"text-btn " + (t.followed ? "teal" : "")}
                onClick={async () => {
                  try {
                    await api("/topics/" + t.id, "PUT", {
                      name: t.name,
                      keywords: t.keywords,
                      color: t.color,
                      followed: !t.followed,
                    });
                    onChange();
                  } catch (e) {
                    onError(e);
                  }
                }}
              >
                {t.followed ? "已关注" : "关注"}
              </button>
              <button
                className="icon-btn small"
                aria-label={"删除主题 " + t.name}
                onClick={async () => {
                  try {
                    await api("/topics/" + t.id, "DELETE");
                    onChange();
                  } catch (e) {
                    onError(e);
                  }
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
export function SettingsPanel({
  settings,
  onSave,
}: {
  settings: Settings | null;
  onSave: (s: Settings) => Promise<void>;
}) {
  const [value, setValue] = useState(settings),
    [busy, setBusy] = useState(false);
  useEffect(() => setValue(settings), [settings]);
  if (!value) return <Skeleton />;
  return (
    <form
      className="editor-form settings-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSave(value);
        setBusy(false);
      }}
    >
      <label className="check-label">
        <span>
          <strong>自动更新来源</strong>
          <small>后台运行期间按间隔执行</small>
        </span>
        <input
          type="checkbox"
          checked={value.schedule_enabled}
          onChange={(e) =>
            setValue({ ...value, schedule_enabled: e.target.checked })
          }
        />
      </label>
      <div className="form-columns">
        <label>
          采集间隔（分钟）
          <input
            type="number"
            min={10}
            max={1440}
            required
            value={value.interval_minutes}
            onChange={(e) =>
              setValue({ ...value, interval_minutes: Number(e.target.value) })
            }
          />
        </label>
        <label>
          简报时间（北京时间）
          <select
            value={value.brief_hour}
            onChange={(e) =>
              setValue({ ...value, brief_hour: Number(e.target.value) })
            }
          >
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i} value={i}>
                {String(i).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="check-label">
        <span>
          <strong>AI 审核与解读</strong>
          <small>
            关闭后新资讯先进入综合归档；已审核内容仍可阅读、搜索和收藏
          </small>
        </span>
        <input
          type="checkbox"
          checked={value.ai_enabled}
          onChange={(e) => setValue({ ...value, ai_enabled: e.target.checked })}
        />
      </label>
      <label>
        每轮自动解读的事件上限
        <input
          type="number"
          required
          min={0}
          max={20}
          value={value.auto_analyze_limit}
          onChange={(e) =>
            setValue({ ...value, auto_analyze_limit: Number(e.target.value) })
          }
        />
      </label>
      <div className="form-columns">
        <label>
          来源回溯天数
          <input
            type="number"
            required
            min={1}
            max={30}
            value={value.initial_days}
            onChange={(e) =>
              setValue({ ...value, initial_days: Number(e.target.value) })
            }
          />
        </label>
        <label>
          每源最多导入条数
          <input
            type="number"
            required
            min={1}
            max={50}
            value={value.per_source_limit}
            onChange={(e) =>
              setValue({ ...value, per_source_limit: Number(e.target.value) })
            }
          />
        </label>
      </div>
      <button className="button" disabled={busy}>
        {busy ? "保存中…" : "保存设置"}
      </button>
    </form>
  );
}
export function JobsPanel({
  jobs,
  retry,
}: {
  jobs: Job[];
  retry: (j: Job) => void;
}) {
  return (
    <div className="jobs-list">
      {!jobs.length ? (
        <Empty title="后台已就绪">
          点击“立即更新”开始采集，处理阶段和各来源结果会显示在这里。
        </Empty>
      ) : (
        jobs.map((j) => (
          <div className="job-card" key={j.id}>
            <div className="job-top">
              <div>
                <span className={"job-status " + j.status}>
                  {
                    (
                      {
                        queued: "等待中",
                        running: "进行中",
                        completed: "已完成",
                        partial: "部分完成",
                        failed: "失败",
                      } as Record<string, string>
                    )[j.status]
                  }
                </span>
                <strong>
                  {
                    (
                      {
                        update: "更新情报",
                        analyze: "事件解读",
                        brief: "每日简报",
                        source_test: "来源测试",
                        monitor_update: "国内监控",
                        monitor_test: "监控来源测试",
                        curate: "相关性审核与事件聚合",
                        review: "单条相关性审核",
                      } as Record<string, string>
                    )[j.kind]
                  }
                </strong>
              </div>
              <small>{time(j.created_at)}</small>
            </div>
            <p>{j.stage}</p>
            <div className="progress-track">
              <i style={{ width: j.progress + "%" }} />
            </div>
            {j.error && <p className="form-error">{j.error}</p>}
            <div className="job-summary">
              {j.result.review_done !== undefined && (
                <span>
                  已审核 {j.result.review_done} / {j.result.review_total}
                </span>
              )}
              {j.result.accepted !== undefined && (
                <span>
                  {j.result.accepted} 条通过 · {j.result.rejected} 条无关 ·{" "}
                  {j.result.uncertain} 条信息不足
                </span>
              )}
              {!!j.result.review_failed && (
                <span className="form-error">
                  {j.result.review_failed} 条审核失败，保留原资料
                </span>
              )}
              {j.result.merge_checked !== undefined && (
                <span>
                  核验 {j.result.merge_checked} 对候选 · 合并 {j.result.merged}{" "}
                  次
                </span>
              )}
              {!!j.result.merge_failed && (
                <span className="form-error">
                  {j.result.merge_failed} 对聚合核验失败
                </span>
              )}
              {j.result.new_events !== undefined && (
                <span>{j.result.new_events} 个新增或变化事件</span>
              )}
              {j.result.successful_sources !== undefined && (
                <span>
                  {j.result.successful_sources} 个来源成功 /{" "}
                  {j.result.failed_sources} 个失败
                </span>
              )}
              {j.result.analyzed !== undefined && (
                <span>{j.result.analyzed} 个解读完成</span>
              )}
              {j.result.message && (
                <span>
                  {j.result.message} · {j.result.count} 条
                </span>
              )}
            </div>
            {j.result.sources && (
              <details>
                <summary>查看 {j.result.sources.length} 个来源结果</summary>
                <div className="job-sources">
                  {j.result.sources.map((s) => (
                    <div key={s.id}>
                      <span>{s.name}</span>
                      <span
                        className={s.status === "error" ? "form-error" : ""}
                      >
                        {s.status === "ok" ? `${s.count} 条` : s.error}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            )}
            {["failed", "partial"].includes(j.status) && (
              <button className="text-btn" onClick={() => retry(j)}>
                <RefreshCw size={13} />
                重新尝试
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}
