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
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Enter a valid email address")).toBeVisible();
  await expect(page.getByText("Use at least 8 characters").first()).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue("not-an-email");
});

test("a new student registers and sees the getting started steps", async () => {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Your learning" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Get started" })).toBeVisible();
  await expect(page.getByText("Documents ready")).toHaveCount(0); // no fake zero-filled cards
});

test("uploading a PDF indexes it and rejects non-PDFs", async () => {
  await page.getByRole("link", { name: "My library" }).first().click();
  await expect(page.getByText("No documents yet")).toBeVisible();

  await page.locator("#pdf-upload").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(page.getByRole("alert").filter({ hasText: "Only PDF files are supported" })).toBeVisible();

  await page.locator("#pdf-upload").setInputFiles(pdf);
  const row = page.getByRole("listitem").filter({ hasText: "recursion-notes" });
  await expect(row).toBeVisible();
  await expect(row.getByText("Ready")).toBeVisible();
  await expect(row.getByText("2 pages")).toBeVisible();
});

test("the tutor answers with sources and admits when material has no answer", async () => {
  await page.getByRole("link", { name: "Study tutor" }).first().click();
  await page.getByLabel("Your question").fill("What does a recursive function need to stop calling itself?");
  await page.getByRole("button", { name: "Ask your tutor" }).last().click();
  await expect(page.getByText("According to your notes")).toBeVisible();
  await expect(page.getByText("recursion-notes, page 1")).toBeVisible();

  await page.getByLabel("Your question").fill("How do volcanoes erupt in Iceland?");
  await page.getByRole("button", { name: "Ask your tutor" }).last().click();
  await expect(page.getByText("Not found in your material")).toBeVisible();
});

test("a quiz can be created, taken once, and scored", async () => {
  await page.getByRole("link", { name: "Quizzes" }).first().click();
  await page.getByLabel("Number of questions").selectOption("3");
  await page.getByRole("button", { name: "Create quiz" }).click();

  await expect(page.getByText("0 of 3 answered")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit answers" })).toBeDisabled();
  await expect(page.getByText("The notes say a recursive function needs a base case")).toHaveCount(0); // answers hidden

  for (const group of await page.getByRole("group").all()) {
    await group.getByLabel("A base case").check();
  }
  await expect(page.getByText("3 of 3 answered")).toBeVisible();
  await page.getByRole("button", { name: "Submit answers" }).click();

  await expect(page.getByText("3 of 3 correct").first()).toBeVisible();
  await expect(page.getByText("The notes say a recursive function needs a base case").first()).toBeVisible();
  await expect(page.getByText(/Source: recursion-notes, page [12]/).first()).toBeVisible();

  await page.reload(); // the saved result is shown again, not the quiz form
  await expect(page.getByText("3 of 3 correct").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit answers" })).toHaveCount(0);
});

test("progress and dashboard reflect the completed quiz", async () => {
  await page.getByRole("link", { name: "Progress" }).first().click();
  await expect(page.getByText("Recursion").first()).toBeVisible();
  await expect(page.getByText("100% · 3 of 3 correct")).toBeVisible();
  await expect(page.getByText("Doing well").first()).toBeVisible();

  await page.getByRole("link", { name: "Dashboard" }).first().click();
  await expect(page.getByText("Quizzes completed")).toBeVisible();
  await expect(page.getByText("Average quiz score")).toBeVisible();
  await expect(page.getByText("100%").first()).toBeVisible();
});

test("deleting a document asks first and removes it", async () => {
  await page.getByRole("link", { name: "My library" }).first().click();
  await page.getByRole("button", { name: "Delete recursion-notes" }).click();
  await expect(page.getByRole("alertdialog").or(page.getByRole("dialog"))).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("recursion-notes")).toBeVisible();

  await page.getByRole("button", { name: "Delete recursion-notes" }).click();
  await page.getByRole("button", { name: "Delete document" }).click();
  await expect(page.getByText("No documents yet")).toBeVisible();
});

test("signing out ends the session", async () => {
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("signing back in works and wrong passwords are refused", async () => {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("wrongpassword");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Invalid email or password" })).toBeVisible();
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
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
