import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const storageKey = "radar-design-lab:v1:preferences";
const url = (concept = "a", page = "ai", extra = "") =>
  "/?preview=redesign&concept=" + concept + "&page=" + page + extra;
async function open(page: Page, concept = "a", view = "ai", extra = "") {
  await page.goto(url(concept, view, extra));
  await expect(page.locator(".design-lab")).toBeVisible();
}
async function prefs(page: Page) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    storageKey,
  );
}
test.beforeEach(async ({ page }) => {
  // A preview must not make even read requests to a live application endpoint.
  await page.route("**/api/**", async (route) => {
    throw new Error(
      "Preview made a real API request: " + route.request().url(),
    );
  });
});

for (const concept of ["a", "b", "c", "d"]) {
  test(
    concept + " : accessible controls and contrast in light and dark modes",
    async ({ page }, testInfo) => {
      for (const dark of [false, true]) {
        for (const view of ["ai", "monitor", "components"]) {
          await open(page, concept, view);
          if (
            (await page.locator(".design-lab").getAttribute("data-dark")) !==
            String(dark)
          )
            await page
              .getByRole("button", {
                name: dark ? "切换暗色模式" : "切换浅色模式",
              })
              .click();
          await page.evaluate(async () => {
            await document.fonts.ready;
            await Promise.all(
              document
                .getAnimations()
                .filter((a) => a.effect?.getTiming().iterations !== Infinity)
                .map((a) => a.finished.catch(() => {})),
            );
          });
          if (dark && ["ai", "monitor"].includes(view))
            await page.screenshot({
              path: testInfo.outputPath(concept + "-dark-" + view + ".png"),
            });
          const result = await new AxeBuilder({ page })
            .include(".design-lab")
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze();
          await testInfo.attach(view + "-" + dark + "-a11y.json", {
            body: JSON.stringify(result.violations, null, 2),
            contentType: "application/json",
          });
          expect(
            result.violations.map((v) => ({
              id: v.id,
              nodes: v.nodes.map((n) => ({
                target: n.target,
                summary: n.failureSummary,
              })),
            })),
          ).toEqual([]);
        }
      }
    },
  );
  for (const width of [1440, 1024, 390]) {
    test(
      concept + " / " + width + " : all pages fit and load without API calls",
      async ({ page }, testInfo) => {
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.setViewportSize({
          width,
          height: width === 390 ? 844 : 1000,
        });
        for (const view of [
          "ai",
          "monitor",
          "saved",
          "briefs",
          "sources",
          "settings",
          "jobs",
          "components",
          "specs",
          "archive",
          "articles",
          "reports",
        ]) {
          await open(page, concept, view);
          await expect(page.locator(".lab-main h1").first()).toBeVisible();
          const overflow = await page
            .locator(".lab-main")
            .evaluate((el) => el.scrollWidth - el.clientWidth);
          expect(
            overflow,
            view + " must not overflow horizontally",
          ).toBeLessThanOrEqual(1);
          if (view === "ai" || view === "monitor") {
            await page.screenshot({
              path: testInfo.outputPath(
                concept + "-" + width + "-" + view + ".png",
              ),
            });
          }
          if (view === "monitor") {
            const columns = await page
              .locator(".lab-channel-grid")
              .evaluate(
                (el) =>
                  getComputedStyle(el).gridTemplateColumns.split(" ").length,
              );
            expect(columns).toBe(
              width === 390 ? 1 : width === 1024 ? 2 : concept === "c" ? 4 : 3,
            );
            const board = page.locator(".lab-channel-items").first();
            expect(
              await board.evaluate((el) => el.scrollHeight > el.clientHeight),
            ).toBeTruthy();
          }
        }
        expect(errors).toEqual([]);
      },
    );
  }
}

test("bookmark, read state, stars and settings persist only in the demo namespace", async ({
  page,
}) => {
  await open(page, "d");
  await page.evaluate(() =>
    localStorage.setItem("radar-theme", "untouched-sentinel"),
  );
  const first = page.locator('[data-story="demo-event-0"]');
  await first.getByRole("button", { name: "收藏资讯", exact: true }).click();
  await expect(
    first.getByRole("button", { name: "取消收藏资讯" }),
  ).toHaveAttribute("aria-pressed", "true");
  await first.locator(".lab-story-open").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(first.locator(".lab-story-open")).toBeFocused();
  await page.reload();
  expect((await prefs(page)).bookmarks).toContain("demo-event-0");
  expect((await prefs(page)).read).toContain("demo-event-0");
  await open(page, "d", "monitor");
  const github = page.locator('[data-channel="github-trending-today"]');
  await github.getByRole("button", { name: "取消星标频道" }).click();
  await page.reload();
  expect((await prefs(page)).stars).not.toContain("github-trending-today");
  await page.getByRole("button", { name: "切换暗色模式" }).click();
  await page.reload();
  await expect(page.locator(".design-lab")).toHaveAttribute(
    "data-dark",
    "true",
  );
  expect(await page.evaluate(() => localStorage.getItem("radar-theme"))).toBe(
    "untouched-sentinel",
  );
  expect(await page.evaluate(() => Object.keys(localStorage).sort())).toEqual([
    "radar-design-lab:v1:preferences",
    "radar-theme",
  ]);
});

test("channel menus and drag sort persist; refresh waits for explicit apply", async ({
  page,
}) => {
  await open(page, "c", "monitor");
  const first = page.locator('[data-channel="weibo"]');
  await first.getByRole("button", { name: "微博频道操作" }).click();
  await page.getByRole("menuitem", { name: "向后移动" }).click();
  await expect(page.locator("[data-channel]").first()).toHaveAttribute(
    "data-channel",
    "zhihu",
  );
  await page.reload();
  await expect(page.locator("[data-channel]").first()).toHaveAttribute(
    "data-channel",
    "zhihu",
  );
  await first
    .getByRole("button", { name: "拖动 微博" })
    .dragTo(page.locator('[data-channel="zhihu"]'));
  await expect(page.locator("[data-channel]").first()).toHaveAttribute(
    "data-channel",
    "weibo",
  );
  const list = first.locator(".lab-channel-items");
  await list.evaluate((el) => {
    el.scrollTop = 300;
  });
  await page.getByRole("button", { name: "模拟更新", exact: true }).click();
  await expect(page.locator(".lab-update-banner")).toBeVisible();
  await expect(first.locator(".lab-channel-row").first()).not.toContainText(
    "新收录",
  );
  await page.getByRole("button", { name: "查看更新", exact: true }).click();
  await expect(first.locator(".lab-channel-row").first()).toContainText(
    "新收录",
  );
  expect(await list.evaluate((el) => el.scrollTop)).toBe(300);
});

test("B carousel, deep-linked reader, back/forward and scroll restoration", async ({
  page,
}) => {
  await open(page, "b");
  const carousel = page.locator(".lab-carousel");
  await page.getByRole("button", { name: "下一条精选" }).click();
  await expect
    .poll(() => carousel.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(100);
  await page.locator(".lab-main").evaluate((el) => {
    el.scrollTop = 650;
  });
  const story = page.locator('[data-story="demo-event-1"] .lab-story-open');
  await story.click();
  await expect(page.locator(".lab-full-reader")).toBeVisible();
  await page.getByRole("button", { name: "返回浏览" }).click();
  await expect
    .poll(() => page.locator(".lab-main").evaluate((el) => el.scrollTop))
    .toBeGreaterThan(500);
  await page.goBack();
  await expect(page.locator(".lab-full-reader")).toBeVisible();
  await page.goForward();
  await expect(page.locator(".lab-events-grid")).toBeVisible();
  await open(page, "b", "ai", "&item=demo-event-0");
  await page.getByRole("button", { name: "返回浏览" }).click();
  await expect(page.locator(".lab-events-grid")).toBeVisible();
});

test("search, keyboard, empty results and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, "d");
  await expect(page.locator(".design-lab")).toHaveAttribute(
    "data-reduced",
    "true",
  );
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("textbox", { name: "全局搜索", exact: true })
    .fill("Agent");
  await expect(page.locator(".lab-command-results button")).not.toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.keyboard.press("/");
  await expect(
    page.getByRole("textbox", { name: "搜索演示内容" }),
  ).toBeFocused();
  await page.keyboard.type("no-match-jk");
  await expect(
    page.getByText("没有找到匹配内容", { exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get("item")).toBeNull();
  await page.getByRole("button", { name: "清除搜索" }).click();
  await page.locator(".lab-main").focus();
  await page.keyboard.press("j");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .locator('[data-story="demo-event-0"]')
    .getByRole("button", { name: "收藏资讯", exact: true })
    .click();
  await expect(page.locator(".lab-confetti")).toHaveCount(0);
});

test("keyword rules validate, filter by exclusions and survive reload", async ({
  page,
}) => {
  await open(page, "a", "monitor", "&tab=watches");
  await page.getByRole("button", { name: "新建关注" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "保存规则" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog.getByLabel("规则名称").fill("测试开发者");
  await dialog.getByLabel("包含关键词").fill("AI");
  await dialog.getByLabel("排除词").fill("模型");
  await dialog.getByRole("button", { name: "保存规则" }).click();
  await page.reload();
  const rule = page.locator(".lab-watch").filter({
    has: page.getByRole("heading", { name: "测试开发者", exact: true }),
  });
  await expect(rule).toBeVisible();
  expect(
    (await prefs(page)).watches.find(
      (w: { name: string }) => w.name === "测试开发者",
    ).exclude,
  ).toBe("模型");
  await rule.getByRole("button", { name: /条示例命中/ }).click();
  await expect(
    page.locator(".lab-match-list button h3").filter({ hasText: "模型" }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await rule.getByRole("button", { name: "删除 测试开发者" }).click();
  await page.getByRole("button", { name: "删除规则", exact: true }).click();
  await expect(rule).toHaveCount(0);
});

test("cache, rate limit, restricted source and interrupted history explain state", async ({
  page,
}) => {
  await open(page, "d", "monitor");
  await expect(page.locator('[data-channel="baidu"]')).toContainText("缓存");
  await expect(page.locator('[data-channel="coolapk"]')).toContainText("429");
  await expect(page.locator('[data-channel="pcbeta-windows11"]')).toContainText(
    "人机验证",
  );
  await open(page, "d", "monitor", "&tab=history");
  await page.getByRole("button", { name: "15:00 采样中断" }).click();
  await expect(
    page.getByRole("heading", { name: "这一段采样中断了" }),
  ).toBeVisible();
  await page.getByLabel("开始日期").fill("2026-12-01");
  await expect(
    page.getByText("这个日期没有演示采样", { exact: true }),
  ).toBeVisible();
});

for (const concept of ["a", "b", "c", "d"]) {
  test(
    concept + " : mobile reader keeps the list and has reachable controls",
    async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await open(page, concept);
      const card = page.locator('[data-story="demo-event-1"] .lab-story-open');
      await card.click();
      if (concept === "b") {
        await expect(page.locator(".lab-full-reader")).toBeVisible();
        await page.getByRole("button", { name: "返回浏览" }).click();
      } else {
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        const box = await dialog.boundingBox();
        expect(box?.width).toBeCloseTo(390, 1);
        expect(box?.height).toBeCloseTo(844, 1);
        await dialog.getByRole("button", { name: "关闭" }).click();
      }
      await expect(card).toBeFocused();
      await expect(card).toBeInViewport();
      const rect = await page
        .getByRole("button", { name: "打开全局搜索" })
        .boundingBox();
      expect(rect!.width).toBeGreaterThanOrEqual(44);
      expect(rect!.height).toBeGreaterThanOrEqual(44);
    },
  );
}

test("source groups and subscription switches remain isolated", async ({
  page,
}) => {
  await open(page, "d", "sources");
  await page.getByLabel("采集渠道", { exact: true }).selectOption("rss");
  await expect(page.locator(".lab-source-table tbody tr")).toHaveCount(6);
  const enabled = page.getByRole("switch", {
    name: "自动采集 OpenAI News 官方博客",
  });
  await enabled.click();
  await page.reload();
  await expect(enabled).toHaveAttribute("aria-checked", "false");
  await page.getByLabel("采集渠道", { exact: true }).selectOption("newsnow");
  await expect(page.locator(".lab-source-table tbody tr")).toHaveCount(52);
});

test("reader keyboard and per-event scroll survive switching", async ({
  page,
}) => {
  await open(page, "c");
  await page.locator('[data-story="demo-event-0"] .lab-story-open').click();
  const reader = page.locator('[data-lab-scroll="reader-demo-event-0"]');
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "EN", exact: true })
    .focus();
  await reader.evaluate((el) => {
    el.scrollTop = 220;
  });
  await page.keyboard.press("j");
  await expect(
    page.locator('[data-lab-scroll="reader-demo-event-1"]'),
  ).toBeVisible();
  expect(
    await page
      .locator('[data-lab-scroll="reader-demo-event-1"]')
      .evaluate((el) => el.scrollTop),
  ).toBe(0);
  await page.keyboard.press("k");
  await expect.poll(() => reader.evaluate((el) => el.scrollTop)).toBe(220);
  await page.keyboard.press("b");
  expect((await prefs(page)).bookmarks).toContain("demo-event-0");
  await page.keyboard.press("Escape");
  await expect(
    page.locator('[data-story="demo-event-0"] .lab-story-open'),
  ).toBeFocused();
});
