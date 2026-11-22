import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const email = `student-${Date.now()}@example.com`;
const password = "password123";
const pdf = path.join(__dirname, "fixtures", "recursion-notes.pdf");

test.describe.configure({ mode: "serial" });

let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await (await browser.newContext()).newPage();
});

test.afterAll(async () => {
  await page.context().close();
});

test("visitors are sent to sign in", async () => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("registration validates input and keeps what was typed", async () => {
  await page.goto("/register");
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Enter a valid email address")).toBeVisible();
  await expect(page.getByText("Use at least 8 characters").first()).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue("not-an-email");
});

test("a new student registers and sees the getting started steps", async () => {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/tutor/); // the chat is the first screen
  await page.getByRole("link", { name: "Dashboard" }).first().click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Good (morning|afternoon|evening)/);
  await expect(page.getByRole("heading", { name: "Get started in three steps" })).toBeVisible();
  await expect(page.getByText("0 of 3 done")).toBeVisible();
  await expect(page.getByText("Documents ready")).toHaveCount(0); // no fake zero-filled cards
});

test("uploading a PDF indexes it and rejects non-PDFs", async () => {
  await page.getByRole("link", { name: "My library" }).first().click();
  await expect(page.getByText("Drop a PDF here or choose a file")).toBeVisible();

  await page.locator("#pdf-upload").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(page.getByRole("alert").filter({ hasText: "Only PDF files are supported" })).toBeVisible();

  await page.locator("#pdf-upload").setInputFiles(pdf);
  const row = page.getByRole("row").filter({ hasText: "recursion-notes" });
  await expect(row).toBeVisible();
  await expect(row.getByText("Ready")).toBeVisible();
  await expect(row.getByText("2 pages")).toBeVisible();
});

const FIRST_QUESTION = "What does a recursive function need to stop calling itself?";

async function openHistory() {
  // The history rail sits inline from 1280px; below that it opens as a drawer
  const rail = page.getByRole("complementary", { name: "Chats" });
  if (await rail.isVisible()) return rail;
  await page.getByRole("button", { name: "History" }).click();
  return page.getByRole("dialog", { name: "History" });
}

test("a new chat streams an answer with a citation that opens the source", async () => {
  await page.getByRole("link", { name: "Study tutor" }).first().click();
  await page.getByLabel("Your question").fill(FIRST_QUESTION);
  await page.getByRole("button", { name: "Send question" }).click();

  // Sources arrive first, then the text; the address follows the saved chat
  const sources = page.getByRole("list", { name: "Sources for this answer" });
  await expect(sources.getByRole("button", { name: /recursion-notes/ })).toBeVisible();
  await expect(page.getByText("According to your notes")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy answer" })).toBeVisible(); // the answer has finished
  await expect(page).toHaveURL(/\/tutor\/[0-9a-f-]{36}$/);

  // Opening the citation shows the passage in the sources panel (a sheet below 1536px, a column above)
  await page.getByRole("button", { name: /^Source 1/ }).first().click();
  const panel = page.getByRole("dialog", { name: "Sources" });
  await expect(panel.getByText("recursion-notes")).toBeVisible();
  await expect(panel.getByText("Page 1")).toBeVisible();
  await page.keyboard.press("Escape"); // close the sheet so the page is usable again
});

test("a follow-up shows what was searched, and the chat survives a reload, rename and delete", async () => {
  await page.getByLabel("Your question").fill("Why does it need that?");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.getByText(/^Searched your material for:/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy answer" })).toHaveCount(2);

  await page.reload();
  await expect(page.locator("main ol p").filter({ hasText: FIRST_QUESTION })).toBeVisible(); // the saved question, not the history link
  await expect(page.getByText(/^Searched your material for:/)).toBeVisible();
  await expect(page.getByRole("list", { name: "Sources for this answer" }).first()).toBeVisible();
  await expect(page.getByText("According to your notes").first()).toBeVisible();

  let drawer = await openHistory();
  await drawer.getByRole("button", { name: /^Options for / }).click();
  await drawer.getByRole("menuitem", { name: "Rename" }).click();
  await drawer.getByRole("textbox", { name: "Chat title" }).fill("Recursion revision");
  await page.keyboard.press("Enter");
  await expect(drawer.getByRole("link", { name: "Recursion revision" })).toBeVisible();

  await drawer.getByRole("button", { name: "Options for Recursion revision" }).click();
  await drawer.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete chat" }).click();
  await expect(page).toHaveURL(/\/tutor$/);
  drawer = await openHistory();
  await expect(drawer.getByRole("link", { name: "Recursion revision" })).toHaveCount(0);
  await page.keyboard.press("Escape");
});

test("a question the material cannot answer is declined in a new chat", async () => {
  await page.goto("/tutor");
  await page.getByLabel("Your question").fill("How do volcanoes erupt in Iceland?");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.getByText("Not found in your material")).toBeVisible();
});

test("a quiz can be created, taken once, and scored", async () => {
  await page.getByRole("link", { name: "Quizzes" }).first().click();
  await page.getByRole("button", { name: "New quiz" }).first().click();
  await page.getByLabel("Number of questions").selectOption("3");
  await page.getByRole("button", { name: "Create quiz" }).click();

  await expect(page.getByText("0 of 3 answered")).toBeVisible();
  await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();
  await expect(page.getByText("The notes say a recursive function needs a base case")).toHaveCount(0); // answers hidden

  // One question per view. Option order is shuffled by the backend, so pick by text; Enter moves on
  for (let i = 0; i < 2; i++) {
    await page.getByText("A base case", { exact: true }).click();
    await expect(page.getByRole("button", { name: "Next" })).toBeEnabled();
    await page.keyboard.press("Enter");
    await expect(page.getByText(`Question ${i + 2} of 3`).first()).toBeVisible();
  }
  await page.getByText("A base case", { exact: true }).click();
  await expect(page.getByText("3 of 3 answered")).toBeVisible();
  await page.getByRole("button", { name: "Submit quiz" }).click();

  await expect(page.getByText("3 of 3 correct").first()).toBeVisible();
  await expect(page.getByText("The notes say a recursive function needs a base case").first()).toBeVisible();
  await expect(page.getByText(/Source: recursion-notes, page [12]/).first()).toBeVisible();

  await page.reload(); // the saved result is shown again, not the quiz form
  await expect(page.getByText("3 of 3 correct").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit quiz" })).toHaveCount(0);

  // The study notes download as a real PDF containing the questions and explanations
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download notes (PDF)" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/-notes\.pdf$/);
  const file = await download.path();
  expect(fs.readFileSync(file).subarray(0, 4).toString()).toBe("%PDF");
});

test("progress and dashboard reflect the completed quiz", async () => {
  await page.getByRole("link", { name: "Progress" }).first().click();
  await expect(page.getByText("Recursion").first()).toBeVisible();
  await expect(page.getByText("100% · 3 of 3 correct").first()).toBeVisible();
  await expect(page.getByText("Doing well").first()).toBeVisible();

  await page.getByRole("link", { name: "Dashboard" }).first().click();
  await expect(page.getByText("Recommended next step")).toBeVisible();
  await expect(page.getByText("Average quiz score")).toBeVisible();
  await expect(page.getByText("100%").first()).toBeVisible();
});

test("deleting a document asks first and removes it", async () => {
  await page.getByRole("link", { name: "My library" }).first().click();
  await page.getByRole("button", { name: "Actions for recursion-notes" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByRole("dialog", { name: /Delete recursion-notes/ }).or(page.getByRole("dialog"))).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("cell", { name: "recursion-notes", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Actions for recursion-notes" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete document" }).click();
  await expect(page.getByText("Drop a PDF here or choose a file")).toBeVisible();
});

test("signing out ends the session", async () => {
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("signing back in works and wrong passwords are refused", async () => {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("wrongpassword");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Invalid email or password" })).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/tutor/);
});

test.describe("mobile layout", () => {
  test("pages fit the screen and navigation collapses into a menu", async () => {
    await page.setViewportSize({ width: 375, height: 740 });
    for (const route of ["/dashboard", "/library", "/tutor", "/quizzes", "/progress"]) {
      await page.goto(route);
      await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${route} scrolls horizontally`).toBeLessThanOrEqual(0);
    }
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("link", { name: "Progress" }).last().click();
    await expect(page).toHaveURL(/\/progress/);
  });
});
