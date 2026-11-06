import type { Event, Article } from "../api";
import catalog from "../../../trendradar/workbench/newsnow_catalog.json";
import { newsnowSources } from "../components/newsnowSources";

export type Concept = "a" | "b" | "c" | "d";
export const concepts = {
  a: {
    name: "浅色磨砂",
    caption: "轻盈、专注、恰到好处",
    code: "FROST",
    colors: ["#F4F7FB", "#172235", "#2266C7", "#E8F0FC"],
    radius: 16,
    sidebar: "72 / 224",
    grid: "3",
    motion: 220,
  },
  b: {
    name: "暖白阅读",
    caption: "留一点空白，读深一点",
    code: "FOLIO",
    colors: ["#F6F3ED", "#292D28", "#405B49", "#E6EBDD"],
    radius: 12,
    sidebar: "顶部导航",
    grid: "3",
    motion: 200,
  },
  c: {
    name: "冷白看板",
    caption: "把变化，尽收眼底",
    code: "INDEX",
    colors: ["#FBFBFE", "#050315", "#2F27CE", "#DEDCFF"],
    radius: 12,
    sidebar: "72",
    grid: "4",
    motion: 180,
  },
  d: {
    name: "快乐游乐场",
    caption: "保持好奇，好事正在发生",
    code: "PLAY",
    colors: ["#FFFFFE", "#00214D", "#00EBC7", "#FF5470", "#FDE24F"],
    radius: 24,
    sidebar: "顶部导航",
    grid: "3",
    motion: 300,
  },
} as const;
export const pages = {
  ai: "AI 情报",
  monitor: "实时热点",
  saved: "我的收藏",
  briefs: "每日简报",
  sources: "来源管理",
  settings: "偏好设置",
  jobs: "任务状态",
  components: "组件与动效",
  specs: "设计规范",
  archive: "综合归档",
  articles: "原始文章",
  reports: "报告存档",
} as const;
export type Page = keyof typeof pages;
export const topicNames = [
  "全部",
  "模型与研究",
  "AI 编程",
  "Agent",
  "开源工具",
  "产品实践",
];
const titles = [
  [
    "小模型，开始真正走进我们的设备",
    "模型与研究",
    "端侧推理正在让 AI 摆脱对网络的依赖。我们从模型体积、隐私与实际体验三个角度，梳理这次值得关注的变化。",
    "Hugging Face",
    "https://huggingface.co/blog",
    "MODEL NOTES",
  ],
  [
    "写代码之外，编程助手开始理解整个项目",
    "AI 编程",
    "从单文件补全到跨文件修改，新的工作流更关注测试、上下文与可复现的交付。工具变快了，验证依然重要。",
    "GitHub",
    "https://github.blog",
    "BUILD BETTER",
  ],
  [
    "让 Agent 学会停下来：可靠性比自主性更重要",
    "Agent",
    "任务边界、人工确认和失败恢复，正在成为 Agent 系统设计中最实际的三个问题。",
    "Google Research",
    "https://research.google/blog/",
    "AGENT SYSTEMS",
  ],
  [
    "本周值得试用的开源 AI 工具",
    "开源工具",
    "一份轻量工具清单：本地搜索、语音转写与工作流编排。优先关注文档完整、能够快速验证价值的项目。",
    "GitHub",
    "https://github.com/trending",
    "OPEN SOURCE",
  ],
  [
    "从演示到日常：AI 产品如何融入真实工作",
    "产品实践",
    "好的产品设计把模型能力藏在流程之中。用几个小例子，看看操作反馈、来源引用和撤销机制如何影响信任。",
    "OpenAI",
    "https://openai.com/news/",
    "IN PRACTICE",
  ],
  [
    "多模态检索的新思路：让图片和文字共享上下文",
    "模型与研究",
    "多模态不只是看懂图片，还包括检索、比较和解释。本文整理模型如何在不同输入之间建立联系。",
    "Google DeepMind",
    "https://deepmind.google/blog/",
    "RESEARCH",
  ],
  [
    "一个可观察的 Agent，需要记录什么？",
    "Agent",
    "除了最终答案，还需要工具调用、耗时、输入依据和中间失败。可观察性让复杂流程能够被调试。",
    "InfoQ",
    "https://www.infoq.cn/",
    "ENGINEERING",
  ],
  [
    "把重复任务留给工具，把判断留给自己",
    "产品实践",
    "用可撤销的小步骤组织自动化：先完成草稿、展示依据，再由使用者决定是否执行下一步。",
    "阮一峰",
    "https://www.ruanyifeng.com/blog/",
    "WORKFLOW",
  ],
  [
    "轻量推理工具迎来一次值得关注的更新",
    "开源工具",
    "这是一条用于测试手动应用更新的新增演示事件。应用后，原来正在阅读的内容与滚动位置会保留。",
    "Hugging Face",
    "https://huggingface.co/blog",
    "JUST IN",
  ],
  [
    "为本地知识库设计一套更透明的引用方式",
    "产品实践",
    "新增演示事件：检索结果如何连接到原始资料，让每一条重要判断都能被核对。",
    "GitHub",
    "https://github.blog",
    "JUST IN",
  ],
  [
    "开发者分享了一份 Agent 测试清单",
    "Agent",
    "新增演示事件：从任务边界、工具错误与重试三个方面检查工作流的可靠性。",
    "InfoQ",
    "https://www.infoq.cn/",
    "JUST IN",
  ],
] as const;
const originalTitles = [
  "Small models are finding a home on our devices",
  "Coding assistants are learning the whole project",
  "Reliable agents know when to pause",
  "Open-source AI tools to try this week",
  "From demos to everyday AI products",
  "Multimodal retrieval connects images and text",
  "What should an observable agent record?",
  "Let tools repeat, and people decide",
  "An update to lightweight inference tools",
  "Transparent citations for a local knowledge base",
  "A practical checklist for testing agents",
];
export type Story = Event & {
  kicker: string;
  minutes: string;
  color: number;
  original: string;
};
export const stories: Story[] = titles.map(
  ([title, topic, summary, publisher, url, kicker], i) => {
    const id = "demo-event-" + i;
    const stamp =
      "2026-11-06T" +
      String(15 - Math.floor(i / 2)).padStart(2, "0") +
      ":20:00+08:00";
    const source = {
      id: "demo-source-" + i,
      name: publisher,
      kind: "rss",
      publisher_type: "official",
      publisher_label: "发布方栏目",
      delivery_type: "rss",
      delivery_label: "演示引用",
    };
    const article: Article = {
      id: "demo-article-" + i,
      event_id: id,
      source_id: source.id,
      source_name: publisher,
      kind: "rss",
      title,
      summary,
      url,
      published_at: stamp,
      first_seen: stamp,
      last_seen: stamp,
      rank: null,
      is_read: 0,
      bookmarked: 0,
    };
    const related = Array.from({ length: 1 + (i % 3) }, (_, n) => {
      const other = titles[(i + n + 1) % 8];
      const extraSource = {
        ...source,
        id: source.id + "-" + n,
        name: other[3],
      };
      return {
        source: extraSource,
        article: {
          ...article,
          id: article.id + "-" + n,
          source_id: extraSource.id,
          source_name: other[3],
          title: "相关背景 · " + title,
          url: other[4],
        },
      };
    });
    return {
      id,
      title,
      summary,
      kicker,
      minutes: i === 0 ? "12 分钟前" : i + 1 + " 小时前",
      color: i % 4,
      original: originalTitles[i],
      created_at: stamp,
      updated_at: stamp,
      ai_status: i === 6 ? "pending" : "ready",
      analysis_error: "",
      relevance_status: "accepted",
      relevance: null,
      review_error: "",
      is_read: 0,
      bookmarked: 0,
      source_count: 1 + related.length,
      sources: [source, ...related.map((r) => r.source)],
      topics: [
        {
          id: topic,
          name: topic,
          keywords: "",
          color: "#2266c7",
          followed: 1,
          event_count: 2,
        },
      ],
      articles: [article, ...related.map((r) => r.article)],
      analysis: {
        title_zh: title,
        summary_zh: summary,
        why_it_matters:
          "技术进展的意义，需要放到真实的使用场景中理解。关注可验证的能力、运行成本和使用边界，比只看展示效果更有帮助。",
        points: [
          {
            text: "先明确适用场景，再比较能力与成本，不把单次演示当成普遍结论。",
            source_ids: [article.id],
          },
          {
            text: "保留原始来源与时间信息，让重要判断能够被回溯和核对。",
            source_ids: [article.id],
          },
          {
            text: "从小规模、可撤销的流程开始试用，并记录实际使用中的限制。",
            source_ids: [article.id],
          },
        ],
        source_ids: [article.id],
        limitations:
          "这里是固定演示内容，用于比较设计。链接指向发布方公开栏目，不表示该发布方发布了上述示例标题。",
        model: "设计演示",
        generated_at: stamp,
        evidence: "演示摘要",
      },
    };
  },
);
export type Channel = {
  id: string;
  name: string;
  title: string;
  category: string;
  mode: string;
  home: string;
  icon: string;
  color: string;
  status: "ok" | "cache" | "restricted" | "limited" | "empty";
  reason: string;
};
const colorMap: Record<string, string> = {
  blue: "#2266c7",
  red: "#b12f46",
  gray: "#626a77",
  slate: "#626a77",
  green: "#287047",
  emerald: "#287047",
  indigo: "#6052b8",
  orange: "#925416",
};
const priority = [
  "weibo",
  "zhihu",
  "baidu",
  "bilibili-hot-search",
  "ithome",
  "github-trending-today",
  "wallstreetcn-hot",
  "cls-telegraph",
  "pcbeta-windows11",
  "coolapk",
  "v2ex-share",
  "hackernews",
];
export const channels: Channel[] = catalog
  .map((c) => {
    const m = newsnowSources[c.id];
    const status =
      c.id === "pcbeta-windows11"
        ? "restricted"
        : c.id === "coolapk"
          ? "limited"
          : c.id === "v2ex-share"
            ? "empty"
            : c.id === "baidu"
              ? "cache"
              : "ok";
    return {
      ...c,
      home: m?.home || "https://newsnow.busiyi.world",
      icon: c.id.split("-")[0],
      color: colorMap[m?.color] || "#626a77",
      status,
      reason:
        status === "restricted"
          ? "源站返回人机验证页面。保留频道，等待恢复访问。"
          : status === "limited"
            ? "示例 HTTP 429：请求被限流，稍后再试。"
            : status === "empty"
              ? "本次演示没有可展示的条目。"
              : "",
    } as Channel;
  })
  .sort(
    (a, b) =>
      (priority.includes(a.id) ? priority.indexOf(a.id) : 100) -
      (priority.includes(b.id) ? priority.indexOf(b.id) : 100),
  );
export const categories = ["全部", "国内", "国际", "科技", "财经", "体育"];
export const rssSources: Channel[] = [
  ["openai", "OpenAI News", "官方博客", "https://openai.com/news/rss.xml"],
  [
    "huggingface",
    "Hugging Face",
    "官方博客",
    "https://huggingface.co/blog/feed.xml",
  ],
  [
    "deepmind",
    "Google DeepMind",
    "官方博客",
    "https://deepmind.google/blog/rss.xml",
  ],
  ["qbitai", "量子位", "科技媒体", "https://www.qbitai.com/feed"],
  ["infoq", "InfoQ 中文", "技术媒体", "https://www.infoq.cn/feed"],
  [
    "ruanyifeng",
    "阮一峰博客",
    "个人博客",
    "https://www.ruanyifeng.com/blog/atom.xml",
  ],
].map(([id, name, title, home]) => ({
  id: "rss-" + id,
  name,
  title,
  home,
  category: "科技",
  mode: "rss",
  icon: "rss",
  color: "#405b49",
  status: "ok",
  reason: "",
}));
const headlines: Record<string, string[]> = {
  国内: [
    "今天，有哪些值得关注的新鲜事",
    "城市更新，把更多空间留给日常生活",
    "当年轻人开始重新发现图书馆",
    "一张照片记录下秋天的颜色",
    "AI 工具怎样改变普通人的一天",
    "那些让生活更方便的小发明",
    "从一杯咖啡看一座城市的节奏",
    "运动，正在成为新的社交方式",
    "这份周末出行指南请收好",
    "新的工作方式，也需要新的生活边界",
  ],
  科技: [
    "小模型与端侧 AI：值得关注的实践",
    "开源社区的一周：工具、模型和新想法",
    "从原型到产品，开发者需要哪些工具",
    "理解 Agent 的任务编排与失败恢复",
    "本地运行的知识库，怎样做好搜索",
    "更好用的开发环境，从减少切换开始",
    "多模态交互的设计细节",
    "一次性能优化背后的取舍",
    "开发者分享可复现的实验记录",
    "AI 编程工具的实际使用心得",
  ],
  财经: [
    "观察：科技产业的新一轮投入",
    "一周市场回顾与行业观察",
    "从公开财报看企业的研发方向",
    "新技术怎样影响生产效率",
    "消费与服务行业的新变化",
    "企业开始关注 AI 部署的长期成本",
    "基础设施与算力产业观察",
    "从全球视角理解供应链变化",
    "财经快讯：今日重点信息整理",
    "长期投资，先从理解业务开始",
  ],
  国际: [
    "全球科技社区的一天",
    "研究团队分享新的实验方向",
    "城市与公共服务的数字化实践",
    "开放数据如何推动跨学科合作",
    "开发者社区发布新一轮工具更新",
    "从不同地区看技术落地的差异",
  ],
  体育: [
    "运动场上的精彩瞬间",
    "本周赛事看点整理",
    "从训练细节理解团队配合",
    "全民运动，找回生活的节奏",
    "年轻选手的成长故事",
    "赛后复盘：那些值得学习的选择",
  ],
};
export function channelItems(channel: Channel, revision = 0): Article[] {
  if (channel.status === "restricted" || channel.status === "empty") return [];
  const pool = headlines[channel.category] || headlines.科技;
  return Array.from({ length: 20 }, (_, i) => {
    const title =
      revision && i === 0
        ? "新收录 · 一条等待你发现的演示资讯"
        : pool[i % pool.length] + (i >= pool.length ? " · 延伸阅读" : "");
    const id = "demo-" + channel.id + "-" + i;
    return {
      id,
      event_id: stories[i % 8].id,
      source_id: channel.id,
      source_name: channel.name,
      kind: "newsnow",
      title,
      summary: "用于体验频道浏览与状态操作的演示条目。",
      url: channel.home,
      published_at:
        "2026-11-06T" +
        String(15 - Math.floor(i / 5)).padStart(2, "0") +
        ":" +
        String(59 - i * 2).padStart(2, "0") +
        ":00+08:00",
      first_seen: "",
      last_seen: "",
      rank: channel.mode === "hottest" ? i + 1 : null,
      is_read: 0,
      bookmarked: 0,
    };
  });
}
export const defaultStars = [
  "weibo",
  "zhihu",
  "baidu",
  "ithome",
  "github-trending-today",
  "cls-telegraph",
];
export const demoDate = "2026-11-06";
export function resolveStory(id: string): Story | undefined {
  const story = stories.find((s) => s.id === id);
  if (story) return story;
  const channel = channels.find((c) => id.startsWith("demo-" + c.id + "-"));
  const item = channel && channelItems(channel).find((a) => a.id === id);
  if (!channel || !item) return undefined;
  return {
    ...stories[0],
    id,
    title: item.title,
    summary: item.summary,
    kicker: "COMMUNITY NOTES",
    original: "A story from the community · design preview",
    source_count: 1,
    sources: [
      {
        ...stories[0].sources[0],
        id: channel.id,
        name: channel.name,
        kind: "newsnow",
        publisher_label: "平台频道",
        delivery_label: "本地适配器演示",
      },
    ],
    articles: [item],
    topics: [
      { ...stories[0].topics[0], id: channel.category, name: channel.category },
    ],
    analysis: {
      ...stories[0].analysis!,
      title_zh: item.title,
      summary_zh: item.summary,
      source_ids: [item.id],
      points: stories[0].analysis!.points.map((p) => ({
        ...p,
        source_ids: [item.id],
      })),
    },
  };
}
