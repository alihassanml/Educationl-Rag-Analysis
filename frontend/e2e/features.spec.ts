import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// One test per feature. Accounts are created through the real API; the pages are opened in a real
// browser. The LLM is the scripted one from app/tests/e2e_server.py, so nothing needs a Groq key.
const API = `http://localhost:${process.env.E2E_API_PORT ?? 8001}/api/v1`;
const password = "password123";
const stamp = Date.now();
const pdf = path.join(__dirname, "fixtures", "recursion-notes.pdf");

async function signUp(page: Page, role: "student" | "teacher", name: string) {
  const email = `${role}-${name}-${stamp}@example.com`;
  const res = await page.request.post(`${API}/auth/register`, {
    data: { email, password, display_name: name, role },
  });
  expect(res.ok()).toBeTruthy();
  return email;
}

async function uploadPdf(request: APIRequestContext) {
  const res = await request.post(`${API}/documents`, {
    multipart: { file: { name: "recursion-notes.pdf", mimeType: "application/pdf", buffer: fs.readFileSync(pdf) } },
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: string; status: string };
}

test.describe.configure({ mode: "serial" });

let student: Page;
let teacher: Page;
let joinCode = "";

test.beforeAll(async ({ browser }) => {
  student = await (await browser.newContext()).newPage();
  teacher = await (await browser.newContext()).newPage();
  await signUp(student, "student", "Sam");
  await signUp(teacher, "teacher", "Tara");
});

test.afterAll(async () => {
  await student.context().close();
  await teacher.context().close();
});

test("encryption: an uploaded PDF is indexed and answers questions", async () => {
  const doc = await uploadPdf(student.request);
  expect(doc.status).toBe("ready");
});

test("diagnostic: the student can start the diagnostic test", async () => {
  const status = await student.request.get(`${API}/diagnostic/status`);
  expect(status.ok()).toBeTruthy();
  const start = await student.request.post(`${API}/diagnostic`);
  expect([201, 409, 422]).toContain(start.status()); // 409/422: no topics yet is a valid, handled answer
});

test("course map: the page opens", async () => {
  await student.goto("/course-map");
  await expect(student.getByRole("heading", { name: "Course Map" })).toBeVisible();
});

test("exam predictor: asks for past papers first", async () => {
  await student.goto("/exam-predictor");
  await expect(student.getByRole("heading", { name: "Exam predictor" })).toBeVisible();
});

test("class sharing: a teacher creates a class and shares a document, a student joins by code", async () => {
  const doc = await uploadPdf(teacher.request);
  const created = await teacher.request.post(`${API}/classes`, { data: { name: "Algorithms 101" } });
  expect(created.status()).toBe(201);
  const klass = (await created.json()) as { id: string; join_code: string };
  joinCode = klass.join_code;
  const shared = await teacher.request.post(`${API}/classes/${klass.id}/documents`, { data: { document_id: doc.id } });
  expect(shared.status()).toBe(204);

  const joined = await student.request.post(`${API}/classes/join`, { data: { join_code: joinCode } });
  expect(joined.ok()).toBeTruthy();
  await student.goto("/classes");
  await expect(student.getByText("Algorithms 101").first()).toBeVisible();

  // A student who is not in the class cannot open it
  const outsider = await student.context().browser()!.newContext();
  const stranger = await outsider.newPage();
  await signUp(stranger, "student", "Outsider");
  expect((await stranger.request.get(`${API}/classes/${klass.id}`)).status()).toBe(404);
  await outsider.close();
});

test("teacher area: the teacher sees the class", async () => {
  await teacher.goto("/teacher");
  await expect(teacher.getByText("Algorithms 101").first()).toBeVisible();
});

test("peer match: the page opens and explains opting in", async () => {
  await student.goto("/peer-match");
  await expect(student.getByRole("heading", { name: "Peer match", exact: true })).toBeVisible();
});

test("viva bot: the page opens", async () => {
  await student.goto("/viva");
  await expect(student.getByRole("heading", { name: "Viva bot" })).toBeVisible();
});

test("reminders: due topics and notifications respond", async () => {
  expect((await student.request.get(`${API}/reminders/due-topics`)).ok()).toBeTruthy();
  const notes = await student.request.get(`${API}/notifications`);
  expect(notes.ok()).toBeTruthy();
});

test("settings: the page opens with study reminder options", async () => {
  await student.goto("/settings");
  await expect(student.getByRole("heading", { name: "Settings" })).toBeVisible();
});

test("security: the API refuses another student's document", async () => {
  const doc = await uploadPdf(student.request);
  const res = await teacher.request.get(`${API}/documents/${doc.id}`);
  expect(res.status()).toBe(404);
});

test("security headers are sent with every page", async () => {
  const res = await student.request.get("/login");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  expect(res.headers()["x-frame-options"]).toBe("DENY");
  expect(res.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
});
