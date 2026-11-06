import { useState } from "react";
import { concepts, stories } from "./data";
import { useLab } from "./state";
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
  Skeleton,
  Sticker,
  Tip,
  Toggle,
} from "./ui";
import { StoryCard } from "./Reading";
import { downloadText } from "./Management";

export function Showcase() {
  const { notify, refresh, job } = useLab();
  const [toggle, setToggle] = useState(true),
    [choice, setChoice] = useState("one"),
    [value, setValue] = useState(""),
    [modal, setModal] = useState(""),
    [motion, setMotion] = useState(0),
    [loading, setLoading] = useState(false);
  return (
    <div className="lab-showcase">
      <SectionTitle
        level={1}
        eyebrow="THE DETAILS MAKE THE DIFFERENCE"
        title="看起来舒服，用起来顺手。"
      >
        <Badge>Radar UI · 01</Badge>
      </SectionTitle>
      <p className="lab-page-description">
        同一套组件，四种表达。切换上方方案，比较状态、质感与交互反馈。
      </p>
      <section className="lab-panel">
        <SectionTitle title="01 / 按钮与操作" eyebrow="ACTIONS" />
        <div className="lab-component-row">
          <Button
            tone="primary"
            icon="plus"
            onClick={() => notify("主要操作已完成 · 演示反馈")}
          >
            主要操作
          </Button>
          <Button icon="bookmark" onClick={() => notify("次要操作反馈")}>
            次要操作
          </Button>
          <Button tone="ghost" icon="arrow" onClick={() => setModal("dialog")}>
            打开弹窗
          </Button>
          <Button tone="danger" onClick={() => setModal("confirm")}>
            危险操作
          </Button>
          <Button disabled>暂不可用</Button>
          <Button busy icon="refresh">
            加载中
          </Button>
        </div>
        <div className="lab-component-row">
          <SaveButton id="demo-event-1" />
          <SaveButton id="weibo" channel />
          <Tip text="保留上下文，顺滑展开">
            <button className="lab-icon-btn" aria-label="查看提示">
              <Icon name="bell" />
            </button>
          </Tip>
          <Menu
            label="展示下拉菜单"
            items={[
              {
                label: "复制链接",
                icon: "copy",
                action: () =>
                  navigator.clipboard
                    .writeText(location.href)
                    .then(() => notify("预览链接已复制"))
                    .catch(() => notify("请从浏览器地址栏复制")),
              },
              {
                label: "打开详情抽屉",
                icon: "arrow",
                action: () => setModal("drawer"),
              },
              {
                label: "不可用的操作",
                icon: "off",
                action: () => {},
                disabled: true,
              },
            ]}
          />
          <span className="lab-muted">试试收藏、悬停提示和菜单</span>
        </div>
        <div className="lab-state-grid">
          {[
            ["default", "默认"],
            ["hover", "悬停"],
            ["focus", "键盘焦点"],
            ["pressed", "按压"],
            ["success", "成功"],
            ["error", "失败"],
          ].map(([state, label]) => (
            <div key={state}>
              <button
                data-demo-state={state}
                className="lab-btn lab-btn-quiet"
                onClick={() => notify(label + "状态示例")}
              >
                {label}
              </button>
              <small>{state}</small>
            </div>
          ))}
        </div>
      </section>
      <div className="lab-showcase-grid">
        <section className="lab-panel">
          <SectionTitle title="02 / 导航与选择" />
          <Segments
            label="示例导航"
            value={choice}
            onChange={setChoice}
            items={[
              { value: "one", label: "为你精选" },
              { value: "two", label: "最近更新" },
              { value: "three", label: "我的关注" },
            ]}
          />
          <div className="lab-sample-tab-content">
            {choice === "one"
              ? "先看看最值得留意的事情。"
              : choice === "two"
                ? "按时间排列，让新变化更容易被发现。"
                : "沿着兴趣，找到属于你的线索。"}
          </div>
          <div className="lab-setting-row">
            <span>接收演示提醒</span>
            <Toggle
              label="组件演示提醒开关"
              checked={toggle}
              onChange={setToggle}
            />
          </div>
          <div className="lab-tag-row">
            <Badge>模型与研究</Badge>
            <Badge tone="good">来源可用</Badge>
            <Badge tone="warn">等待重试</Badge>
          </div>
        </section>
        <section className="lab-panel">
          <SectionTitle title="03 / 输入与反馈" />
          <SearchField label="组件示例搜索" value={value} onChange={setValue} />
          <p className="lab-muted">
            {value ? "你正在查找：“" + value + "”" : "支持搜索与清除操作"}
          </p>
          <label className="lab-field">
            来源名称
            <input placeholder="例如：开发者周刊" />
          </label>
          <label className="lab-field">
            有错误的输入
            <input
              aria-invalid="true"
              defaultValue="不是一个完整的网址"
              aria-describedby="lab-field-error"
            />
          </label>
          <p id="lab-field-error" className="lab-error">
            <Icon name="alert" size={15} />
            请输入完整的 https:// 地址
          </p>
        </section>
      </div>
      <section className="lab-panel">
        <SectionTitle
          eyebrow="SMALL MOVEMENTS, REAL FEEDBACK"
          title="04 / 动效试验台"
        >
          <Button icon="play" onClick={() => setMotion((v) => v + 1)}>
            重新播放
          </Button>
        </SectionTitle>
        <div className="lab-motion-grid">
          <div>
            <span className="lab-motion-orbit" key={motion}>
              <Sticker kind="star" />
            </span>
            <strong>弹性反馈</strong>
            <p>小幅形变，让一次点击有了触感。</p>
          </div>
          <div>
            <Button
              tone="primary"
              icon="arrow"
              onClick={() => setModal("drawer")}
            >
              展开面板
            </Button>
            <strong>保持阅读上下文</strong>
            <p>面板展开，焦点随之进入。</p>
          </div>
          <div>
            <SaveButton id="demo-event-3" />
            <strong>收藏这一刻</strong>
            <p>D 版体验一次短暂的彩纸庆祝。</p>
          </div>
          <div>
            <Button
              busy={!!job && !job.done}
              icon="refresh"
              onClick={() => refresh("组件试验台")}
            >
              模拟刷新
            </Button>
            <strong>看得见的进度</strong>
            <p>{job?.stage || "按需触发，完成后明确反馈。"}</p>
          </div>
        </div>
      </section>
      <div className="lab-showcase-grid">
        <section className="lab-panel">
          <SectionTitle title="05 / 内容组件" />
          <StoryCard story={stories[2]} />
        </section>
        <section className="lab-panel">
          <SectionTitle title="06 / 等待与空状态">
            <Button onClick={() => setLoading((v) => !v)}>
              {loading ? "展示空状态" : "展示骨架屏"}
            </Button>
          </SectionTitle>
          {loading ? (
            <Skeleton rows={3} />
          ) : (
            <Empty
              title="下一份灵感，还在路上"
              description="这里展示没有内容时的状态。"
              action={
                <Button onClick={() => setLoading(true)}>模拟加载</Button>
              }
            />
          )}
        </section>
      </div>
      <section className="lab-panel">
        <SectionTitle title="07 / 消息与错误" />
        <div className="lab-callout">
          <Icon name="alert" />
          <div>
            <h3>这个来源暂时访问受限</h3>
            <p>上一次有效内容会保留，你可以稍后重试。</p>
            <Button
              icon="refresh"
              busy={!!job && !job.done}
              onClick={() => refresh("错误状态示例")}
            >
              模拟重试
            </Button>
          </div>
        </div>
        <div className="lab-component-row">
          <Button onClick={() => notify("偏好已保存 · 这是一条轻提示")}>
            显示轻提示
          </Button>
          <Button onClick={() => setModal("confirm")}>显示确认弹窗</Button>
        </div>
      </section>
      <Modal
        open={modal === "dialog" || modal === "confirm"}
        onClose={() => setModal("")}
        title={
          modal === "confirm" ? "确认移除这个示例？" : "为好想法，留一点空间。"
        }
      >
        <p>
          {modal === "confirm"
            ? "这只是一个确认交互示例，不会删除正式数据。"
            : "弹窗支持键盘操作、Escape 关闭和焦点恢复。"}
        </p>
        <div className="lab-form-actions">
          <Button onClick={() => setModal("")}>返回</Button>
          <Button
            tone="primary"
            icon="check"
            onClick={() => {
              setModal("");
              notify("演示操作已完成");
            }}
          >
            确认
          </Button>
        </div>
      </Modal>
      <Modal
        open={modal === "drawer"}
        onClose={() => setModal("")}
        title="一个顺滑展开的面板"
        drawer
      >
        <div className="lab-demo-drawer-art">
          <Sticker kind="orbit" />
        </div>
        <h2>让每次变化，都有来由。</h2>
        <p>抽屉保留了当前页面的位置。关闭后，你可以继续刚才的浏览。</p>
        <div className="lab-form-actions">
          <Button tone="primary" onClick={() => setModal("")}>
            体验完成
          </Button>
        </div>
      </Modal>
    </div>
  );
}
export function SpecsView() {
  const { route, notify } = useLab();
  const theme = concepts[route.concept];
  const [component, setComponent] = useState("channel");
  const tokens = {
    concept: route.concept,
    name: theme.name,
    colors: theme.colors,
    radius: theme.radius,
    sidebar: theme.sidebar,
    gridColumns1440: theme.grid,
    motionMs: theme.motion,
    spacing: [4, 8, 12, 16, 24, 32, 48],
    channelHeight: 500,
    buttonHeight: 40,
    mobileTouchTarget: 44,
  };
  const names = ["页面背景", "主要文字", "主操作色", "辅助色", "醒目标记"];
  return (
    <div className="lab-specs">
      <SectionTitle
        level={1}
        eyebrow="RADAR DESIGN SYSTEM / 1.0"
        title="好设计，细节有据可循。"
      >
        <Button
          icon="file"
          onClick={() =>
            downloadText(
              "radar-" + route.concept + "-tokens.json",
              JSON.stringify(tokens, null, 2),
              "application/json",
            )
          }
        >
          导出变量
        </Button>
      </SectionTitle>
      <p className="lab-page-description">
        当前方案 {route.concept.toUpperCase()} · {theme.name}
        。尺寸图为可伸缩组件的结构规范，实际宽度随视口变化。
      </p>
      <section className="lab-panel">
        <SectionTitle title="颜色与角色" />
        <div className="lab-swatches">
          {theme.colors.map((color, i) => (
            <button
              key={color}
              onClick={() =>
                navigator.clipboard
                  .writeText(color)
                  .then(() => notify("已复制 " + color))
                  .catch(() => notify("色值：" + color))
              }
            >
              <span style={{ background: color }} />
              <strong>{names[i]}</strong>
              <code>{color}</code>
              <Icon name="copy" size={14} />
            </button>
          ))}
        </div>
      </section>
      <section className="lab-panel">
        <SectionTitle title="组件的结构与尺寸">
          <Segments
            value={component}
            label="尺寸图组件"
            onChange={setComponent}
            items={[
              { value: "channel", label: "频道卡片" },
              { value: "event", label: "事件卡片" },
              { value: "drawer", label: "详情抽屉" },
            ]}
          />
        </SectionTitle>
        <svg
          className="lab-dimension-sheet"
          viewBox="0 0 1000 490"
          role="img"
          aria-label={
            component === "drawer"
              ? "详情抽屉尺寸：480 像素宽，满高，内边距24像素"
              : "卡片尺寸：宽度自适应，频道高度500像素，内边距16像素"
          }
        >
          <defs>
            <marker
              id="lab-dim-arrow"
              viewBox="0 0 10 10"
              refX="5"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M0 0 10 5 0 10Z" fill="currentColor" />
            </marker>
            <pattern
              id="lab-grid"
              width="20"
              height="20"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M20 0H0V20"
                fill="none"
                stroke="currentColor"
                opacity=".06"
              />
            </pattern>
          </defs>
          <rect width="1000" height="490" fill="url(#lab-grid)" />
          <text x="25" y="35" fontSize="12" letterSpacing="2">
            UI / {component.toUpperCase()} / {route.concept.toUpperCase()}
          </text>
          <text x="25" y="460" fontSize="11">
            STRUCTURE · PROPORTIONS · RELATIONSHIPS
          </text>
          {component === "drawer" ? (
            <>
              <rect
                x="90"
                y="80"
                width="600"
                height="330"
                rx="12"
                className="lab-dim-outline"
              />
              <path d="M410 80V410" className="lab-dim-line" />
              <rect
                x="430"
                y="100"
                width="240"
                height="48"
                rx="4"
                className="lab-dim-shade"
              />
              <path
                d="M430 180h190m-190 18h165m-165 18h220m-220 70h220m-220 18h200m-200 18h210"
                className="lab-dim-line"
              />
              <text x="130" y="240">
                PRESERVED CONTEXT
              </text>
              <text x="445" y="130">
                TITLE + CLOSE
              </text>
              <path d="M410 55H690" className="lab-dim-measure" />
              <text x="515" y="45">
                W = 480
              </text>
              <path d="M710 80V410" className="lab-dim-measure" />
              <text x="730" y="250">
                H = viewport
              </text>
              <text x="770" y="115">
                CONTENT
              </text>
              <text x="770" y="140">
                P = 24
              </text>
              <text x="770" y="165">
                scroll = internal
              </text>
            </>
          ) : (
            <>
              <rect
                x="140"
                y="85"
                width="280"
                height="330"
                rx={theme.radius}
                className="lab-dim-outline"
              />
              <rect
                x="155"
                y="100"
                width="250"
                height="55"
                rx="8"
                className="lab-dim-shade"
              />
              <circle cx="178" cy="126" r="13" className="lab-dim-outline" />
              <path d="M205 117h110m-110 16h70" className="lab-dim-line" />
              <text x="164" y="183">
                {component === "channel"
                  ? "SCROLL CONTAINER"
                  : "TITLE + SUMMARY"}
              </text>
              <path
                d="M160 205h240m-240 28h220m-220 28h235m-235 28h200m-200 28h240m-240 28h190"
                className="lab-dim-line"
              />
              <path d="M155 378h250" className="lab-dim-line" />
              <text x="164" y="399">
                SOURCE / TIME / STATE
              </text>
              <path d="M140 60H420" className="lab-dim-measure" />
              <text x="220" y="49">
                W = flexible
              </text>
              <path d="M110 85V415" className="lab-dim-measure" />
              <text x="62" y="255" transform="rotate(-90 62 255)">
                {component === "channel" ? "H = 500" : "H = content"}
              </text>
              <path d="M420 85 540 110h150" className="lab-dim-line" />
              <text x="550" y="99">
                R = {theme.radius}
              </text>
              <path d="M405 155 540 210h150" className="lab-dim-line" />
              <text x="550" y="199">
                P = 16 · GAP = 12
              </text>
              <rect
                x="570"
                y="280"
                width="220"
                height="100"
                rx={theme.radius}
                className="lab-dim-outline"
              />
              <rect
                x="582"
                y="292"
                width="196"
                height="76"
                rx={Math.max(4, theme.radius - 12)}
                className="lab-dim-shade"
              />
              <text x="590" y="330">
                NESTED CORNERS
              </text>
              <text x="590" y="352">
                R inner = max(4, R−12)
              </text>
            </>
          )}
        </svg>
      </section>
      <div className="lab-showcase-grid">
        <section className="lab-panel">
          <SectionTitle title="排版与间距" />
          <div className="lab-type-sample">
            <h2>每个细节，都为阅读服务。</h2>
            <p>
              正文使用 IBM Plex Sans / Noto Sans SC。B 的简报标题使用 Noto Serif
              SC，D 的英文展示字体使用 Manrope。
            </p>
            <small>正文 15–16px · 元信息 12px · 基础间距 4px</small>
          </div>
          <div className="lab-spacing-scale">
            {tokens.spacing.map((n) => (
              <span key={n}>
                <i style={{ width: n, height: n }} />
                {n}
              </span>
            ))}
          </div>
        </section>
        <section className="lab-panel">
          <SectionTitle title="交互与无障碍" />
          <dl className="lab-token-list">
            <dt>主要动效</dt>
            <dd>{theme.motion}ms</dd>
            <dt>按钮高度</dt>
            <dd>40px / 手机 44px</dd>
            <dt>文字对比度</dt>
            <dd>≥ 4.5:1</dd>
            <dt>键盘焦点</dt>
            <dd>2px 可见轮廓</dd>
            <dt>减少动画</dt>
            <dd>系统设置 + 手动开关</dd>
            <dt>状态存储</dt>
            <dd>独立演示空间</dd>
          </dl>
        </section>
      </div>
      <section className="lab-panel">
        <SectionTitle title="设计参考与署名" />
        <p className="lab-muted">
          交互基础使用 Radix，图标使用 Tabler，手动精选滑动使用
          Blossom。样稿采用原创排版、SVG 装饰和动效实现。
        </p>
        <div className="lab-reference-links">
          {[
            ["Happy Hues", "https://www.happyhues.co/palettes/2"],
            ["HeroUI", "https://heroui.com/"],
            ["Appica", "https://appica.dev/ui"],
            ["Transitions", "https://transitions.dev/"],
            ["beUI", "https://beui.dev/"],
            ["Uiverse", "https://uiverse.io/"],
            ["Lander", "https://blocks.lander.studio/"],
            ["Tabler", "https://tabler.io/icons"],
            ["Blossom", "https://github.com/jespervos/blossom-carousel"],
            [
              "Dimensional Drawing",
              "https://github.com/enesozturk/dimensional-drawing",
            ],
            ["Color Hunt", "https://colorhunt.co/"],
            ["Iconsax", "https://app.iconsax.io/"],
            ["APPLORE", "https://applore.app/"],
            [
              "Realtime Colors",
              "https://www.realtimecolors.com/?colors=050315-fbfbfe-2f27ce-dedcff-433bff",
            ],
          ].map(([name, href]) => (
            <a href={href} key={name} target="_blank" rel="noreferrer">
              {name}
              <Icon name="arrow" size={14} />
            </a>
          ))}
        </div>
        <a
          href="/assets/newsnow/LICENSE.txt"
          target="_blank"
          rel="noreferrer"
          className="lab-text-link"
        >
          NewsNow 频道图标与目录 · MIT 许可证
        </a>
      </section>
    </div>
  );
}
