// Screenshot capture for the "AI look" review (docs/UI_REDESIGN.md section 21.3).
//
//   node e2e/review/capture.mjs seed                 create the demo student and its data
//   node e2e/review/capture.mjs <phase> [screens]    save PNGs to artifacts/screens/review/<phase>/
//   node e2e/review/capture.mjs landing-images       write the cropped product images shown on the landing page
//
// It talks to a review stack that is already running: the e2e backend (scripted LLM, real embeddings)
// and a Next.js server. Defaults: WEB=http://localhost:3021 API=http://localhost:8021/api/v1
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB = process.env.WEB ?? "http://localhost:3021";
const API = process.env.API ?? "http://localhost:8021/api/v1";
const EMAIL = process.env.REVIEW_EMAIL ?? "review@example.com";
// The Evaluation Lab is admin only, and its sample documents would pollute the student's library
const ADMIN_EMAIL = process.env.REVIEW_ADMIN_EMAIL ?? "admin-review@example.com";
const PASSWORD = "password123";
const pdf = path.join(here, "programming-notes.pdf");
const out = path.join(here, "..", "..", "..", "artifacts", "screens", "review");
const WIDTHS = [1440, 390];

const [mode = "after", only] = process.argv.slice(2);

async function signedIn(browser, options = {}, email = EMAIL) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  let response = await context.request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
  if (!response.ok()) {
    response = await context.request.post(`${API}/auth/register`, { data: { email, password: PASSWORD } });
    if (!response.ok()) throw new Error(`Could not sign in or register: ${response.status()}`);
  }
  return context;
}

async function seed(browser) {
  const context = await signedIn(browser);
  const api = context.request;
  const docs = await (await api.get(`${API}/documents`)).json();
  if (docs.total === 0) {
    for (const title of ["Programming notes", "Data structures lecture 3", "Sorting algorithms"]) {
      const r = await api.post(`${API}/documents`, {
        multipart: { file: { name: `${title}.pdf`, mimeType: "application/pdf", buffer: fs.readFileSync(pdf) }, title },
      });
      if (!r.ok()) throw new Error(`upload failed ${r.status()}`);
    }
  }
  let threads = await (await api.get(`${API}/tutor/threads`)).json();
  if (process.env.RESEED_THREADS) {
    for (const t of threads) await api.delete(`${API}/tutor/threads/${t.id}`);
    threads = [];
  }
  if (threads.length === 0) {
    const thread = await (await api.post(`${API}/tutor/threads`, { data: {} })).json();
    for (const question of ["What does a recursive function need to stop calling itself?", "Why does it need that?"]) {
      await api.post(`${API}/tutor/threads/${thread.id}/messages`, { data: { question } });
    }
    const second = await (await api.post(`${API}/tutor/threads`, { data: {} })).json();
    await api.post(`${API}/tutor/threads/${second.id}/messages`, { data: { question: "How do volcanoes erupt in Iceland?" } });
  }
  const quizzes = await (await api.get(`${API}/quizzes`)).json();
  if (quizzes.total === 0) {
    for (const wrong of [2, 0]) {
      const quiz = await (await api.post(`${API}/quizzes/generate`, { data: { topic: "Recursion", difficulty: "beginner", num_questions: 3 } })).json();
      const answers = quiz.questions.map((q, i) => ({
        question_id: q.id,
        selected_index: i < wrong ? q.options.findIndex((o) => o !== "A base case") : q.options.indexOf("A base case"),
      }));
      await api.post(`${API}/quizzes/${quiz.id}/attempts`, { data: { answers } });
    }
  }
  await context.close();
  await (await signedIn(browser, {}, ADMIN_EMAIL)).close(); // registered here, promoted with app.scripts.make_admin
  console.log("seeded", EMAIL, "and", ADMIN_EMAIL);
}

async function shoot(page, name, width, fullPage = true) {
  const dir = path.join(out, mode);
  fs.mkdirSync(dir, { recursive: true });
  await page.waitForLoadState("networkidle");
  // The Next.js dev badge is not part of the design, and the hero illustration plays once over about 2.8s
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.waitForTimeout(name === "landing" ? 3500 : 400);
  await page.screenshot({ path: path.join(dir, `${name}-${width}.png`), fullPage });
}

// Crop to the union of some elements, plus padding, so a landing image shows only the product
async function cropTo(page, file, selectors, { pad = 12, maxHeight = 760 } = {}) {
  const boxes = [];
  for (const selector of selectors) {
    const box = await page.locator(selector).first().boundingBox();
    if (box) boxes.push(box);
  }
  const x = Math.min(...boxes.map((b) => b.x)) - pad;
  const y = Math.min(...boxes.map((b) => b.y)) - pad;
  const right = Math.max(...boxes.map((b) => b.x + b.width)) + pad;
  const bottom = Math.max(...boxes.map((b) => b.y + b.height)) + pad;
  await page.screenshot({
    path: path.join(here, "..", "..", "public", "landing", file),
    clip: { x: Math.max(0, x), y: Math.max(0, y), width: right - x, height: Math.min(bottom - y, maxHeight) },
  });
}

async function landingImages(browser) {
  const context = await signedIn(browser, { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  let page = await context.newPage();
  const css = "nextjs-portal { display: none !important; }";
  const open = async (route, ready) => {
    await page.goto(`${WEB}${route}`);
    await page.addStyleTag({ content: css });
    await ready.waitFor({ timeout: 20000 });
    await page.waitForTimeout(400);
  };
  const threads = await (await context.request.get(`${API}/tutor/threads`)).json();
  const answered = threads.find((t) => t.title.startsWith("What does a recursive"));
  const declined = threads.find((t) => t.title.startsWith("How do volcanoes"));
  const quizzes = await (await context.request.get(`${API}/quizzes`)).json();

  await open(`/tutor/${answered.id}`, page.getByRole("button", { name: "Copy answer" }).last());
  await cropTo(page, "tutor-answer.png", ["main ol", "aside[aria-label=Sources] ul"], { maxHeight: 640 });
  await open(`/tutor/${declined.id}`, page.getByRole("heading", { name: "Not found in your material" }));
  await cropTo(page, "tutor-not-found.png", ["main ol li"], { maxHeight: 360 });
  await open(`/quizzes/${quizzes.items[0].id}`, page.getByText("Suggested next step"));
  await cropTo(page, "quiz-result.png", ["main:visible h1", "main:visible ol, main:visible ul"], { maxHeight: 820 });
  await open("/progress", page.getByText("How we decide"));
  await cropTo(page, "progress.png", ["main:visible h1", "main:visible section:last-of-type"], { maxHeight: 640 });
  await context.close();
  const adminContext = await signedIn(browser, { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 }, ADMIN_EMAIL);
  const adminPage = await adminContext.newPage();
  page = adminPage;
  const runs = await (await adminContext.request.get(`${API}/eval/runs`)).json();
  await open(`/evaluation/runs/${runs.items[0].id}`, page.getByText("Abstention", { exact: false }).first());
  await cropTo(page, "evaluation.png", ["main:visible h1", "main:visible section"], { maxHeight: 900 });
  await adminContext.close();
  console.log("landing images written to public/landing");
}

async function main() {
  const browser = await chromium.launch();
  if (mode === "landing-images") {
    await landingImages(browser);
    await browser.close();
    return;
  }
  if (mode === "seed") {
    await seed(browser);
    await browser.close();
    return;
  }
  const want = (name) => !only || only.split(",").includes(name);

  // Public screens, signed out
  const publicCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pub = await publicCtx.newPage();
  for (const width of WIDTHS) {
    await pub.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    if (want("landing")) {
      await pub.goto(`${WEB}/`);
      await shoot(pub, "landing", width);
    }
    if (want("auth")) {
      await pub.goto(`${WEB}/login`);
      await shoot(pub, "auth-login", width);
      await pub.goto(`${WEB}/register`);
      await shoot(pub, "auth-register", width);
    }
  }
  await publicCtx.close();

  // Signed-in screens
  const context = await signedIn(browser);
  const page = await context.newPage();
  const threads = await (await context.request.get(`${API}/tutor/threads`)).json();
  const answered = threads.find((t) => t.title.startsWith("What does a recursive"));
  const quizzes = await (await context.request.get(`${API}/quizzes`)).json();
  const screens = [
    ["dashboard", "dashboard", "/dashboard"],
    ["tutor", "tutor-empty", "/tutor"],
    ["tutor", "tutor-answered", answered ? `/tutor/${answered.id}` : "/tutor"],
    ["library", "library", "/library"],
    ["quizzes", "quizzes", "/quizzes"],
    ["quizzes", "quiz-result", quizzes.items?.[0] ? `/quizzes/${quizzes.items[0].id}` : "/quizzes"],
    ["progress", "progress", "/progress"],
  ];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const [group, name, route] of screens) {
      if (!want(group)) continue;
      await page.goto(`${WEB}${route}`);
      await page.locator("main:visible h1").first().waitFor({ timeout: 20000 }).catch(() => undefined);
      await shoot(page, name, width);
    }
  }
  if (want("evaluation")) {
    const admin = await signedIn(browser, {}, ADMIN_EMAIL);
    const p = await admin.newPage();
    for (const width of WIDTHS) {
      await p.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await p.goto(`${WEB}/evaluation`);
      await p.locator("main:visible h1").first().waitFor();
      await shoot(p, "evaluation", width);
    }
    await admin.close();
  }
  if (want("dashboard")) {
    // A student with no documents sees the first-run checklist
    const fresh = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await fresh.request.post(`${API}/auth/register`, { data: { email: `new-${Date.now()}@example.com`, password: PASSWORD } });
    const p = await fresh.newPage();
    for (const width of WIDTHS) {
      await p.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await p.goto(`${WEB}/dashboard`);
      await p.getByText("Get started in three steps").waitFor();
      await shoot(p, "dashboard-new", width);
    }
    await fresh.close();
  }
  await browser.close();
  console.log("saved to", path.join(out, mode));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
