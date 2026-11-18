import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Captures real application states. Run with: SCREENSHOTS=1 npx playwright test screenshots
//  - landing images go to frontend/public/landing (shown by the landing page when the file exists)
//  - the viewport sweep goes to artifacts/screens (390, 768, 1280 and 1440px) with layout checks
// The e2e backend replaces the LLM with a deterministic script, so answer wording is scripted;
// pages, citations, quizzes and scores all come from the real pipeline and database.
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture screenshots");

const landing = path.join(__dirname, "..", "public", "landing");
const sweep = path.join(__dirname, "..", "..", "artifacts", "screens");
const pdf = path.join(__dirname, "fixtures", "recursion-notes.pdf");
const WIDTHS = [390, 768, 1280, 1440];
const APP_ROUTES = ["dashboard", "tutor", "library", "quizzes", "progress", "settings"];

test.setTimeout(180_000);

async function overflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test("capture landing images and sweep every screen", async ({ browser }) => {
  fs.mkdirSync(landing, { recursive: true });
  fs.mkdirSync(sweep, { recursive: true });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 })).newPage();

  // Public screens, signed out
  const edges: Record<string, number> = {};
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const [name, route] of [["landing", "/"], ["login", "/login"], ["register", "/register"]] as const) {
      await page.goto(route, { waitUntil: "networkidle" });
      expect(await overflow(page), `${name} scrolls horizontally at ${width}px`).toBeLessThanOrEqual(0);
      if (width === 1440) edges[name] = await page.locator("h1").first().evaluate((el) => Math.round(el.getBoundingClientRect().left));
      await page.screenshot({ path: path.join(sweep, `${name}-${width}.png`), fullPage: true, scale: "css" });
    }
  }

  // A real student with real data
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/register");
  await page.getByLabel("Email").fill(`shots-${Date.now()}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/dashboard/);
  await page.getByText("Get started in three steps").waitFor();
  await page.screenshot({ path: path.join(sweep, "dashboard-new-student-1280.png"), fullPage: true, scale: "css" });

  await page.getByRole("link", { name: "My library" }).first().click();
  await page.locator("#pdf-upload").setInputFiles(pdf);
  await page.getByRole("row").filter({ hasText: "recursion-notes" }).getByText("Ready").waitFor();

  await page.getByRole("link", { name: "Study tutor" }).first().click();
  await page.getByLabel("Your question").fill("What does a recursive function need to stop calling itself?");
  await page.getByRole("button", { name: "Send question" }).click();
  await page.getByText("recursion-notes, page 1").waitFor();
  // Crop to the conversation, sources panel and composer (no empty space below)
  const mainBox = await page.locator("main:visible").boundingBox();
  const composerBox = await page.locator("form").filter({ has: page.getByLabel("Your question") }).boundingBox();
  if (!mainBox || !composerBox) throw new Error("Tutor layout not found");
  await page.screenshot({
    path: path.join(landing, "tutor-answer.png"),
    clip: { x: mainBox.x, y: mainBox.y, width: mainBox.width, height: composerBox.y + composerBox.height - mainBox.y + 24 },
  });

  await page.getByLabel("Your question").fill("How do volcanoes erupt in Iceland?");
  await page.getByRole("button", { name: "Send question" }).click();
  await page.getByRole("heading", { name: "Not found in your material" }).waitFor();
  const notFound = page.getByRole("heading", { name: "Not found in your material" }).locator("xpath=ancestor::div[contains(@class,'bg-stone-100')][1]");
  await notFound.scrollIntoViewIfNeeded();
  const box = await notFound.boundingBox();
  if (!box) throw new Error("The not-found card has no bounding box");
  await page.screenshot({ path: path.join(landing, "tutor-not-found.png"), clip: { x: box.x - 4, y: box.y - 4, width: box.width + 8, height: box.height + 8 } });

  await page.getByRole("link", { name: "Quizzes" }).first().click();
  await page.getByRole("button", { name: "New quiz" }).first().click();
  await page.getByLabel("Number of questions").selectOption("3");
  await page.getByRole("button", { name: "Create quiz" }).click();
  await page.getByText("0 of 3 answered").waitFor();
  for (let i = 0; i < 2; i++) {
    await page.getByText("A base case", { exact: true }).click();
    await page.getByRole("button", { name: "Next" }).click();
  }
  await page.getByText("A base case", { exact: true }).click();
  await page.getByRole("button", { name: "Submit quiz" }).click();
  await page.getByText("3 of 3 correct").first().waitFor();
  await page.locator("main:visible").screenshot({ path: path.join(landing, "quiz-result.png") });

  await page.getByRole("link", { name: "Progress" }).first().click();
  await page.getByText("How we decide").waitFor();
  await page.locator("main:visible").screenshot({ path: path.join(landing, "progress.png") });

  // Sweep every app screen at every width: no horizontal scroll, and record where the content starts
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of APP_ROUTES) {
      await page.goto(`/${route}`, { waitUntil: "networkidle" });
      await page.locator("main:visible h1").first().waitFor();
      expect(await overflow(page), `/${route} scrolls horizontally at ${width}px`).toBeLessThanOrEqual(0);
      if (width === 1440) edges[route] = await page.locator("main:visible h1").first().evaluate((el) => Math.round(el.getBoundingClientRect().left));
      await page.screenshot({ path: path.join(sweep, `${route}-${width}.png`), fullPage: true, scale: "css" });
    }
  }
  fs.writeFileSync(path.join(sweep, "left-edges-1440.json"), JSON.stringify(edges, null, 2));
  console.log("left edge of the page heading at 1440px:", JSON.stringify(edges));

  // The app pages share one left edge
  for (const route of APP_ROUTES) expect(edges[route], `${route} left edge`).toBe(edges.dashboard);
});
