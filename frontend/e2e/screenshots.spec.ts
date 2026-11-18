import { test } from "@playwright/test";
import path from "node:path";

// Captures real application states for the report. Run with: SCREENSHOTS=1 npx playwright test screenshots
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture report screenshots");

const out = path.join(__dirname, "..", "..", "docs", "screenshots");
const pdf = path.join(__dirname, "fixtures", "recursion-notes.pdf");

test("capture screens", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const shot = (name: string) => page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });

  await page.goto("/register");
  await shot("01-register");
  await page.getByLabel("Email").fill(`shots-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/dashboard/);
  await page.getByText("Get started").first().waitFor();
  await shot("02-dashboard-new-student");

  await page.getByRole("link", { name: "My library" }).first().click();
  await page.locator("#pdf-upload").setInputFiles(pdf);
  await page.getByText("Ready", { exact: true }).waitFor();
  await shot("03-library");

  await page.getByRole("link", { name: "Study tutor" }).first().click();
  await shot("04-tutor-empty");
  await page.getByLabel("Your question").fill("What does a recursive function need to stop calling itself?");
  await page.getByRole("button", { name: "Ask your tutor" }).last().click();
  await page.getByText("recursion-notes, page 1").waitFor();
  await page.getByLabel("Your question").fill("How do volcanoes erupt in Iceland?");
  await page.getByRole("button", { name: "Ask your tutor" }).last().click();
  await page.getByText("Not found in your material").waitFor();
  await shot("05-tutor-answers");

  await page.getByRole("link", { name: "Quizzes" }).first().click();
  await page.getByLabel("Number of questions").selectOption("3");
  await shot("06-quizzes-create");
  await page.getByRole("button", { name: "Create quiz" }).click();
  await page.getByText("0 of 3 answered").waitFor();
  await page.getByRole("group").first().getByLabel("A base case").check();
  await shot("07-quiz-taking");
  const groups = await page.getByRole("group").all();
  for (const g of groups.slice(1)) await g.getByLabel(/A global flag|A second thread|A base case/).first().check();
  await page.getByRole("button", { name: "Submit answers" }).click();
  await page.getByText(/correct/).first().waitFor();
  await shot("08-quiz-result");

  await page.getByRole("link", { name: "Progress" }).first().click();
  await page.getByText("How these labels work").waitFor();
  await shot("09-progress");
  await page.getByRole("link", { name: "Dashboard" }).first().click();
  await page.getByText("Quizzes completed").waitFor();
  await shot("10-dashboard");

  await page.setViewportSize({ width: 375, height: 740 });
  await page.reload();
  await page.getByText("Quizzes completed").waitFor();
  await shot("11-dashboard-mobile");
  await page.getByRole("button", { name: "Open menu" }).click();
  await shot("12-mobile-menu");
});
