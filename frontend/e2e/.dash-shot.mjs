// Temporary: render /dashboard against mocked API data and save screenshots.
import { chromium } from "@playwright/test";
const out = process.argv[2];
const day = (offset) => { const d = new Date(); d.setDate(d.getDate() - offset); return d.toISOString().slice(0, 10); };
const activity = Array.from({ length: 84 }, (_, i) => ({ date: day(83 - i), questions: [83, 82, 80, 75, 70, 60, 61].includes(i) ? (i % 5) + 1 : 0, quizzes: i === 83 ? 1 : 0 }));
const now = new Date().toISOString();
const topic = (n, name, acc, status) => ({ topic_id: "t" + n, topic_name: name, questions_attempted: 10, correct_answers: acc / 10, accuracy_percent: acc, status, last_practiced_at: now, recommendation: { action: "x", message: `You answered ${acc / 10}/10 correctly on ${name}, so start with a beginner quiz.` } });
const act = (n, p) => ({ quiz_id: "q" + n, quiz_title: "Quiz " + n, topic: ["Recursion", "Sorting", "Graphs"][n % 3], score: Math.round(p / 20), total_questions: 5, percent: p, completed_at: now });
const variants = {
  noquiz: { quizzes_completed: 0, average_score_percent: null, topics_needing_revision: 0, needs_revision: [], next_step: null, recent_activity: [], score_history: [] },
  quiz: { quizzes_completed: 4, average_score_percent: 65, topics_needing_revision: 2, needs_revision: [topic(1, "Recursion", 40, "needs_revision"), topic(2, "Graphs", 50, "needs_revision")], next_step: topic(1, "Recursion", 40, "needs_revision"), recent_activity: [act(1, 40), act(2, 80), act(3, 60), act(4, 80)], score_history: [act(1, 40), act(2, 80), act(3, 60), act(4, 80)] },
};
const variant = process.argv[3] ?? "noquiz";
const summary = { documents_total: 2, documents_ready: 2, latest_document: { id: "d1", title: "Phynxa Website Knowledge Base (RAG Source)" }, ...variants[variant] };
const insights = {
  questions_asked: 14, answers_with_sources: 11, answers_not_found: 2, citations_total: 31, pages_indexed: 46, chunks_indexed: 120, helpful_votes: 2, unhelpful_votes: 0,
  active_days: 7, current_streak: 3, longest_streak: 3, today: day(0), activity,
  documents: [
    { id: "d1", title: "Phynxa Website Knowledge Base (RAG Source)", source_type: "pdf", page_count: 12, chunk_count: 40, times_cited: 22, pages_cited: 5, last_cited_at: now },
    { id: "d2", title: "Operating Systems Lecture 4", source_type: "pdf", page_count: 34, chunk_count: 80, times_cited: 0, pages_cited: 0, last_cited_at: null },
  ],
  hot_pages: [
    { document_id: "d1", document_title: "Phynxa Website Knowledge Base (RAG Source)", page_number: 3, times_cited: 9 },
    { document_id: "d1", document_title: "Phynxa Website Knowledge Base (RAG Source)", page_number: 1, times_cited: 6 },
    { document_id: "d1", document_title: "Phynxa Website Knowledge Base (RAG Source)", page_number: 7, times_cited: 4 },
  ],
};
const threads = [["hi", 0], ["Summarise the key ideas in Phynxa Website Knowledge Base", 18], ["hi", 18], ["Explain the hardest topic in Phynxa", 28]].map(([title, m], i) => ({ id: "c" + i, title, created_at: now, updated_at: new Date(Date.now() - m * 60000).toISOString() }));
const browser = await chromium.launch();
for (const width of [1440, 1280, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addCookies([{ name: "access_token", value: "x", domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  await page.route("http://localhost:8000/api/v1/**", (route) => {
    const u = new URL(route.request().url());
    const p = u.pathname.replace("/api/v1", "");
    const body = p === "/auth/me" ? { id: "u", email: "student@example.com", is_admin: false, created_at: now }
      : p === "/progress/summary" ? summary : p === "/progress/insights" ? insights : p.startsWith("/tutor/threads") ? threads
      : p.startsWith("/documents") ? { items: [], total: 0 } : {};
    route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "http://localhost:3000", "access-control-allow-credentials": "true" }, body: JSON.stringify(body) });
  });
  await page.goto("http://localhost:3000/dashboard", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/dash-${variant}-${width}.png`, fullPage: true });
  console.log(width, "overflow", await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth));
  await ctx.close();
}
await browser.close();
