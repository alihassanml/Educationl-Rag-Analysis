import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Viewport sweep. Run with: SCREENSHOTS=1 npx playwright test screenshots
//  - saves every screen at 390, 768, 1280 and 1440px to artifacts/screens, with layout checks
//  - the cropped product images on the landing page are written by e2e/review/capture.mjs (landing-images)
// The e2e backend replaces the LLM with a deterministic script, so answer wording is scripted;
// pages, citations, quizzes and scores all come from the real pipeline and database.
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture screenshots");

const sweep = path.join(__dirname, "..", "..", "artifacts", "screens");
const pdf = path.join(__dirname, "fixtures", "recursion-notes.pdf");
const WIDTHS = [390, 768, 1280, 1440];
const APP_ROUTES = ["dashboard", "tutor", "library", "quizzes", "progress", "settings"];

test.setTimeout(180_000);

async function overflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test("sweep every screen", async ({ browser }) => {
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
  await page.waitForURL(/tutor/); // the chat is the first screen
  await page.getByText("Upload a document first").waitFor();
  await page.screenshot({ path: path.join(sweep, "tutor-new-student-1280.png"), fullPage: true, scale: "css" });
  await page.getByRole("link", { name: "Dashboard" }).first().click();
  await page.getByText("Get started in three steps").waitFor();
  await page.screenshot({ path: path.join(sweep, "dashboard-new-student-1280.png"), fullPage: true, scale: "css" });

  await page.getByRole("link", { name: "My library" }).first().click();
  await page.locator("#pdf-upload").setInputFiles(pdf);
  await page.getByRole("row").filter({ hasText: "recursion-notes" }).getByText("Ready").waitFor();

  await page.getByRole("link", { name: "Study tutor" }).first().click();
  await page.getByRole("button", { name: /Summarise the key ideas/ }).waitFor();
  await page.screenshot({ path: path.join(sweep, "tutor-empty-1280.png"), fullPage: true, scale: "css" });
  await page.getByLabel("Your question").fill("What does a recursive function need to stop calling itself?");
  await page.getByRole("button", { name: "Send question" }).click();
  await page.getByRole("button", { name: "Copy answer" }).waitFor(); // the answer has finished
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

  await page.getByRole("link", { name: "Progress" }).first().click();
  await page.getByText("How we decide").waitFor();

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

  // The pages inside the 1200px container share one left edge. The dashboard and the tutor are full width
  // by owner request (2026-11-22), so they are not compared.
  const CONTAINED = APP_ROUTES.filter((route) => route !== "dashboard" && route !== "tutor");
  for (const route of CONTAINED) expect(edges[route], `${route} left edge`).toBe(edges[CONTAINED[0]]);
});
