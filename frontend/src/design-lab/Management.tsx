import { useState, type FormEvent } from "react";
import { categories, channels, demoDate, stories, rssSources } from "./data";
import { useLab } from "./state";
import {
  Badge,
  Button,
  Empty,
  Icon,
  Modal,
  SaveButton,
  SearchField,
  SectionTitle,
  Segments,
  Toggle,
} from "./ui";
import { ChannelLogo, statusLabels } from "./Monitoring";
import { FollowTopics } from "./Reading";

export function downloadText(name: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function SourcesView() {
  const { route, prefs, toggle, navigate, refresh, job } = useLab();
  const [detail, setDetail] = useState("");
  const directory = [...rssSources, ...channels];
  const rows = directory.filter(
    (c) =>
      (!route.source ||
        (route.source === "rss" ? c.mode === "rss" : c.mode !== "rss")) &&
      (!route.q ||
        (c.name + c.title + c.id)
          .toLowerCase()
          .includes(route.q.toLowerCase())) &&
      (route.category === "全部" || c.category === route.category) &&
      (route.tab === "all" ||
        (route.tab === "ok" && ["ok", "cache"].includes(c.status)) ||
        (route.tab === "bad" && !["ok", "cache"].includes(c.status)) ||
        (route.tab === "disabled" && prefs.disabled.includes(c.id))),
  );
  const channel = directory.find((c) => c.id === detail);
  return (
    <div>
      <SectionTitle
        level={1}
        eyebrow="YOUR WINDOW TO THE WORLD"
        title="好内容，从好来源开始。"
      >
        <Badge>
          {rssSources.length} 个 RSS · {channels.length} 个频道
        </Badge>
      </SectionTitle>
      <p className="lab-page-description">
        把来源目录整理成你喜欢的样子。这里的健康状态与检查均为演示。
      </p>
      <div className="lab-management-toolbar">
        <SearchField
          value={route.q}
          onChange={(q) => navigate({ q }, true)}
          placeholder="搜索来源名称或标识"
        />
        <select
          aria-label="采集渠道"
          value={route.source}
          onChange={(e) => navigate({ source: e.target.value })}
        >
          <option value="">全部渠道</option>
          <option value="rss">RSS 订阅</option>
          <option value="newsnow">NewsNow 频道</option>
        </select>
        <select
          aria-label="来源分类"
          value={route.category}
          onChange={(e) => navigate({ category: e.target.value })}
        >
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <Button
          icon="refresh"
          busy={!!job && !job.done}
          onClick={() => refresh()}
        >
          模拟检查全部
        </Button>
      </div>
      <Segments
        label="来源可用性筛选"
        value={
          ["all", "ok", "bad", "disabled"].includes(route.tab)
            ? route.tab
            : "all"
        }
        items={[
          { value: "all", label: "全部来源" },
          { value: "ok", label: "可用" },
          { value: "bad", label: "需要留意" },
          { value: "disabled", label: "已停用" },
        ]}
        onChange={(tab) => navigate({ tab })}
      />
      <div className="lab-table-wrap">
        <table className="lab-table lab-source-table">
          <thead>
            <tr>
              <th>来源</th>
              <th>类别与渠道</th>
              <th>演示健康状态</th>
              <th>星标</th>
              <th>自动采集</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>
                  <div className="lab-source-name">
                    <ChannelLogo channel={c} />
                    <span>
                      <strong>{c.name}</strong>
                      <small>{c.title || c.id}</small>
                    </span>
                  </div>
                </td>
                <td>
                  {c.category}
                  <small>
                    {c.mode === "rss" ? "RSS 订阅" : "NewsNow 本地适配器"}
                  </small>
                </td>
                <td>
                  <Badge
                    tone={["ok", "cache"].includes(c.status) ? "good" : "warn"}
                  >
                    {statusLabels[c.status]}
                  </Badge>
                  <small>{c.reason || "最近检查 15:30 · 固定示例"}</small>
                </td>
                <td>
                  {c.mode !== "rss" ? (
                    <SaveButton id={c.id} channel />
                  ) : (
                    <span aria-label="RSS 通过自动采集开关管理">—</span>
                  )}
                </td>
                <td>
                  <Toggle
                    checked={!prefs.disabled.includes(c.id)}
                    label={"自动采集 " + c.name + " " + c.title}
                    onChange={() => toggle("disabled", c.id)}
                  />
                </td>
                <td>
                  <Button onClick={() => setDetail(c.id)}>查看</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <Empty title="没有找到这样的来源" />}
      <Modal
        open={!!channel}
        onClose={() => setDetail("")}
        title={channel ? channel.name + " · 来源说明" : "来源说明"}
      >
        {channel && (
          <div className="lab-source-detail">
            <ChannelLogo channel={channel} />
            <Badge>{statusLabels[channel.status]} · 演示状态</Badge>
            <p>
              {channel.reason ||
                "示例内容可以正常展示。正式采集的可用性以实际检查结果为准。"}
            </p>
            <dl>
              <dt>发布平台</dt>
              <dd>{channel.name}</dd>
              <dt>采集渠道</dt>
              <dd>
                {channel.mode === "rss" ? "RSS 订阅" : "NewsNow 本地适配器"}
              </dd>
              <dt>采集方式</dt>
              <dd>
                {channel.mode === "rss"
                  ? "发布方提供的订阅源，演示不会实际请求 Feed"
                  : "网页、RSS 或公开端点适配，非官方授权 API"}
              </dd>
              <dt>频道标识</dt>
              <dd>{channel.id}</dd>
            </dl>
            <a
              className="lab-text-link"
              href={channel.home}
              target="_blank"
              rel="noreferrer"
            >
              打开来源网站 <Icon name="external" size={16} />
            </a>
            <Button
              icon="refresh"
              busy={!!job && !job.done}
              onClick={() => refresh(channel.name)}
            >
              模拟检查
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
export function SettingsView() {
  const { prefs, update, notify } = useLab();
  const [interval, setInterval] = useState(String(prefs.interval));
  const [hour, setHour] = useState(prefs.briefHour);
  const [error, setError] = useState("");
  function save(e: FormEvent) {
    e.preventDefault();
    const value = Number(interval);
    if (!Number.isInteger(value) || value < 5 || value > 240 || !hour) {
      setError("采集间隔需为 5–240 分钟，并选择简报时间。");
      return;
    }
    update({ interval: value, briefHour: hour });
    setError("");
    notify("演示偏好已保存");
  }
  return (
    <div className="lab-settings">
      <SectionTitle
        level={1}
        eyebrow="MAKE IT YOURS"
        title="按你的习惯，调整一点。"
      />
      <p className="lab-page-description">
        四套设计共享演示偏好，切换方案后可以继续比较。
      </p>
      <section className="lab-panel">
        <h3>
          <Icon name="palette" />
          阅读与外观
        </h3>
        <div className="lab-setting-row">
          <div>
            <strong>暗色模式</strong>
            <p>为晚一点的阅读留一盏柔和的灯。</p>
          </div>
          <Toggle
            label="暗色模式"
            checked={prefs.dark}
            onChange={(dark) => update({ dark })}
          />
        </div>
        <div className="lab-setting-row">
          <div>
            <strong>紧凑阅读</strong>
            <p>缩小列表间距，在同一屏展示更多内容。</p>
          </div>
          <Toggle
            label="紧凑阅读"
            checked={prefs.compact}
            onChange={(compact) => update({ compact })}
          />
        </div>
        <div className="lab-setting-row">
          <div>
            <strong>减少动态效果</strong>
            <p>保留即时反馈，关闭弹性、位移与庆祝动画；也尊重系统设置。</p>
          </div>
          <Toggle
            label="减少动态效果"
            checked={prefs.reduced}
            onChange={(reduced) => update({ reduced })}
          />
        </div>
      </section>
      <form className="lab-panel lab-form" onSubmit={save}>
        <h3>
          <Icon name="clock" />
          更新与简报
        </h3>
        <div className="lab-setting-row">
          <div>
            <strong>模拟定时更新</strong>
            <p>只保存演示偏好，不会创建实际后台任务。</p>
          </div>
          <Toggle
            label="模拟定时更新"
            checked={prefs.schedule}
            onChange={(schedule) => update({ schedule })}
          />
        </div>
        <div className="lab-form-columns">
          <label>
            采集间隔（分钟）
            <input
              type="number"
              min="5"
              max="240"
              step="1"
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
            />
          </label>
          <label>
            每日简报时间（北京时间）
            <input
              type="time"
              value={hour}
              onChange={(e) => setHour(e.target.value)}
            />
          </label>
        </div>
        {error && (
          <p role="alert" className="lab-error">
            {error}
          </p>
        )}
        <div>
          <Button type="submit" tone="primary" icon="check">
            保存演示偏好
          </Button>
        </div>
      </form>
      <section className="lab-panel">
        <h3>
          <Icon name="layers" />
          关注的 AI 主题
        </h3>
        <FollowTopics />
      </section>
      <section className="lab-panel">
        <h3>
          <Icon name="keyboard" />
          让操作更顺手
        </h3>
        <dl className="lab-shortcuts">
          <dt>全局搜索</dt>
          <dd>
            <kbd>⌘ / Ctrl K</kbd>
          </dd>
          <dt>当前页面搜索</dt>
          <dd>
            <kbd>/</kbd>
          </dd>
          <dt>上 / 下一件事</dt>
          <dd>
            <kbd>K</kbd>
            <kbd>J</kbd>
          </dd>
          <dt>收藏当前详情</dt>
          <dd>
            <kbd>B</kbd>
          </dd>
          <dt>关闭详情或弹窗</dt>
          <dd>
            <kbd>Esc</kbd>
          </dd>
        </dl>
      </section>
    </div>
  );
}
export function JobsView() {
  const { job, refresh, pending, applyUpdates } = useLab();
  return (
    <div className="lab-jobs">
      <SectionTitle
        level={1}
        eyebrow="A LITTLE WORK, BEHIND THE SCENES"
        title="看得见的更新过程。"
      >
        <Button
          tone="primary"
          icon="refresh"
          busy={!!job && !job.done}
          onClick={() => refresh()}
        >
          开始模拟更新
        </Button>
      </SectionTitle>
      <p className="lab-page-description">
        体验采集、整理与完成反馈。这些步骤不会访问真实来源或调用模型。
      </p>
      <section className="lab-panel lab-job-card">
        <div className="lab-row">
          <div>
            <Badge>
              {job ? (job.done ? "已完成" : "模拟进行中") : "准备就绪"}
            </Badge>
            <h3>{job?.stage || "下一次发现，随时开始。"}</h3>
            <p>
              {job
                ? "检查范围：" + job.target
                : "点击上方按钮，查看完整任务进度。"}
            </p>
          </div>
          <strong className="lab-job-percent">
            {job?.progress || 0}
            <small>%</small>
          </strong>
        </div>
        <progress
          aria-label="模拟任务进度"
          max="100"
          value={job?.progress || 0}
        />
        <ol className="lab-job-steps">
          {["检查来源", "读取内容", "去重整理", "等待应用"].map((s, i) => (
            <li
              className={(job?.progress || 0) >= (i + 1) * 25 ? "complete" : ""}
              key={s}
            >
              <Icon
                name={(job?.progress || 0) >= (i + 1) * 25 ? "check" : "circle"}
                size={18}
              />
              {s}
            </li>
          ))}
        </ol>
        {pending > 0 && (
          <Button icon="check" tone="primary" onClick={applyUpdates}>
            应用 {pending} 条演示更新
          </Button>
        )}
      </section>
      <section className="lab-panel">
        <SectionTitle title="示例检查记录" />
        <div className="lab-task-log">
          <span>15:30:02</span>
          <Icon name="success" />
          <p>微博 · 实时热搜：读取示例条目</p>
          <Badge tone="good">可用</Badge>
        </div>
        <div className="lab-task-log">
          <span>15:30:03</span>
          <Icon name="clock" />
          <p>百度热搜：继续展示有效缓存</p>
          <Badge>缓存</Badge>
        </div>
        <div className="lab-task-log">
          <span>15:30:04</span>
          <Icon name="alert" />
          <p>远景论坛：人机验证页面</p>
          <Badge tone="warn">访问受限</Badge>
        </div>
        <p className="lab-footnote">单源失败不会清空其他频道的内容。</p>
      </section>
    </div>
  );
}
export function BriefsView() {
  const { openStory, notify } = useLab();
  const [date, setDate] = useState(demoDate),
    [version, setVersion] = useState("2");
  const text =
    "# AI 每日简报 · " +
    date +
    "\n\n" +
    stories
      .slice(0, 5)
      .map((s, i) => i + 1 + ". " + s.title + "\n" + s.summary)
      .join("\n\n") +
    "\n\n固定演示内容，不代表真实新闻报道。";
  return (
    <div className="lab-briefs">
      <div className="lab-management-toolbar">
        <label>
          简报日期{" "}
          <input
            aria-label="简报日期"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <select
          aria-label="简报版本"
          value={version}
          onChange={(e) => setVersion(e.target.value)}
        >
          <option value="2">上午版 · v2</option>
          <option value="1">早间版 · v1</option>
        </select>
        <Button
          icon="copy"
          onClick={() =>
            navigator.clipboard
              .writeText(text)
              .then(() => notify("演示简报已复制"))
              .catch(() => notify("复制不可用，请使用导出"))
          }
        >
          复制
        </Button>
        <Button
          icon="file"
          onClick={() =>
            downloadText(
              "radar-demo-brief-" + date + ".md",
              text,
              "text/markdown",
            )
          }
        >
          导出简报
        </Button>
      </div>
      {![demoDate, "2026-11-05"].includes(date) ? (
        <Empty
          title="这一天还没有演示简报"
          description="可以选择 2026 年 11 月 5 日或 6 日查看样稿。"
        />
      ) : (
        <article className="lab-brief-paper">
          <header>
            <span className="lab-eyebrow">RADAR / DAILY DIGEST</span>
            <span>
              {date} · VOL. 006 · v{version}
            </span>
          </header>
          <h1>
            在变化里，
            <br />
            找到值得关注的事。
          </h1>
          <p className="lab-brief-intro">
            今天的线索从端侧模型延伸到 Agent
            工作流。工具在变化，好的问题始终重要。
          </p>
          <div className="lab-brief-divider" />
          {stories.slice(0, version === "2" ? 5 : 3).map((s, i) => (
            <section key={s.id}>
              <span className="lab-brief-number">0{i + 1}</span>
              <div>
                <Badge>{s.topics[0].name}</Badge>
                <button
                  className="lab-plain-story"
                  onClick={() => openStory(s.id)}
                >
                  <h2>{s.title}</h2>
                </button>
                <p>{s.summary}</p>
                <button
                  className="lab-text-link"
                  onClick={() => openStory(s.id)}
                >
                  展开事件与来源 <Icon name="arrow" size={16} />
                </button>
              </div>
            </section>
          ))}
          <footer>
            读到这里，愿你带走一个新想法。
            <br />
            <small>设计演示 · 本页内容不会触发真实简报生成。</small>
          </footer>
        </article>
      )}
    </div>
  );
}
export function ArchiveView() {
  const { route, navigate, openStory } = useLab();
  const reports = route.page === "reports";
  const [date, setDate] = useState("");
  const rows = stories
    .slice(0, 8)
    .filter(
      (s) =>
        (!route.q || (s.title + s.sources[0].name).includes(route.q)) &&
        (!date || date === demoDate),
    );
  return (
    <div>
      <SectionTitle
        level={1}
        eyebrow="KEEP THE THREAD"
        title={
          reports
            ? "把每一天，妥善收藏。"
            : route.page === "articles"
              ? "从原始信息开始。"
              : "所有线索，都有来处。"
        }
      />
      <p className="lab-page-description">
        {reports
          ? "历史报告与导出样稿。"
          : "按日期和关键词回看演示内容，保留来源与时间信息。"}
      </p>
      <div className="lab-management-toolbar">
        <SearchField value={route.q} onChange={(q) => navigate({ q }, true)} />
        <input
          type="date"
          aria-label="归档日期"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <Button
          onClick={() => {
            setDate("");
            navigate({ q: "" });
          }}
        >
          清除筛选
        </Button>
      </div>
      <div className="lab-table-wrap">
        <table className="lab-table">
          <thead>
            <tr>
              <th>内容</th>
              <th>来源</th>
              <th>收录日期</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td>
                  <button onClick={() => openStory(s.id)}>
                    {reports ? "AI 情报摘录 · " : ""}
                    {s.title}
                  </button>
                </td>
                <td>{s.sources[0].name}</td>
                <td>{demoDate}</td>
                <td>
                  {reports ? (
                    <Button
                      icon="file"
                      onClick={() =>
                        downloadText(
                          s.id + ".md",
                          "# " + s.title + "\n\n" + s.summary + "\n\n设计演示",
                        )
                      }
                    >
                      导出
                    </Button>
                  ) : (
                    <SaveButton id={s.id} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <Empty title="没有匹配的归档" />}
    </div>
  );
}
