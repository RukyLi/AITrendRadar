# Radar Design Lab

四套全站交互样稿位于 `/?preview=redesign`。正式站仍为 `/`。

| 方案         | 入口参数    | 阅读结构                                  | 1440px 频道列数 |
| ------------ | ----------- | ----------------------------------------- | --------------- |
| A 浅色磨砂   | `concept=a` | 72/224px 导航、400px 列表、独立阅读区     | 3               |
| B 暖白阅读   | `concept=b` | 顶部导航、手动 Blossom 精选、760px 阅读页 | 3               |
| C 冷白看板   | `concept=c` | 72px 导航、双列事件、480px 抽屉           | 4               |
| D 快乐游乐场 | `concept=d` | 非对称精选、三列事件、彩色卡头与弹性反馈  | 3               |

例如：`http://127.0.0.1:8787/?preview=redesign&concept=d&page=monitor`。

## 页面与组件

`page` 支持 `ai`、`monitor`、`saved`、`briefs`、`sources`、`settings`、`jobs`、`archive`、`articles`、`reports`、`components` 和 `specs`。

监控 `tab` 支持 `all`、`starred`、`hot`、`live`、`watches`、`history`。筛选与选中详情保存在 URL；浏览器前进/后退恢复视图与滚动位置。频道保留内部滚动、原文入口、星标、拖动和菜单排序、单源模拟刷新。

组件页可以操作按钮、菜单、表单、开关、搜索、收藏、标签、抽屉、确认框、骨架屏、错误与成功反馈，并单独重播动效。规范页包含每套颜色变量、字号、间距、尺寸图和 JSON 变量导出。

`⌘/Ctrl K` 打开搜索；`/` 聚焦页面搜索；`J/K` 浏览事件；`B` 收藏当前事件；`Escape` 关闭弹窗。输入时不触发阅读快捷键。减少动画同时尊重系统偏好和样稿设置。

## 隔离边界

- `main.tsx` 按入口动态加载 `Production.tsx` 或 `design-lab/DesignLab.tsx`。样稿不挂载正式 App，也不加载正式页面样式。
- 全部样稿样式限定在 `.design-lab` 内；Radix 浮层也挂在该区域。
- 数据使用固定的演示标题、摘要和时间。来源引用指向公开栏目，不声称这些标题是来源发布的真实新闻。
- 复用前端 `Event`、`Article` 类型及已有 NewsNow 频道目录和 Logo。来源管理另含六个 RSS 示例。
- 收藏、已读、星标、频道顺序、关键词规则和设置只写入 `radar-design-lab:v1:preferences`，不读取或修改正式站偏好。
- 刷新和生成解读使用本地定时器；更新先提示，再由使用者点击应用。重新加载会重置本轮模拟任务和新增内容，保留演示偏好。
- 不请求后端 API，不触发采集、模型调用或真实数据写入。外部来源链接会打开对应网站。

## 开发与验收

```sh
npm --prefix frontend ci
npm --prefix frontend run build
npm --prefix frontend run test:design
```

浏览器测试默认使用已安装的 Google Chrome。其他环境可先安装 Playwright Chromium，并通过 `PLAYWRIGHT_CHANNEL=chromium` 运行。测试自动启动 `127.0.0.1:8789` 的临时 Vite 服务并在完成后关闭；正式网站继续使用 `127.0.0.1:8787`。

测试覆盖四套方案在 1440、1024、390px 的全站页面、实际列数与内部滚动、书签和星标持久化、拖动/菜单排序、搜索、阅读焦点/历史恢复、模拟刷新、规则校验、来源失败与中断状态。Axe 检查明暗模式下的组件标注和文字对比度。所有样稿测试禁止 `/api/**` 请求。截图、跟踪和失败记录输出至忽略目录 `.run/design-lab-tests/`。

## 参考与许可

交互基础为现有 Radix，功能图标为 Tabler，B 的手动精选为 Blossom Carousel；均使用各自开源许可。字体使用 Fontsource 分发的 IBM Plex Sans、Noto Sans SC、Noto Serif SC 和 Manrope，保留其包内许可。

D 采用 Happy Hues Palette 2 的配色，自绘 SVG 贴纸和装饰。HeroUI、Appica、Transitions.dev、beUI、Uiverse、Lander Blocks、Dimensional Drawing、Iconsax 和 APPLORE 作为样式与结构参考，没有复制其付费组件或引入新的组件框架。完整参考链接可在样稿“设计规范”页查看。频道 Logo 沿用项目现有 NewsNow 素材与许可说明。
