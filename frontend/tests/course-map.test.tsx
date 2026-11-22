import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CourseMapView } from "@/components/course-map/course-map-view";
import { diagnosticApi, pathApi } from "@/lib/api";
import type { LearningPath, PathStep } from "@/types/api";

vi.mock("@/lib/api", () => ({ pathApi: { get: vi.fn() }, diagnosticApi: { status: vi.fn(), start: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const step = (over: Partial<PathStep> = {}): PathStep => ({
  topic_id: "t1", name: "Recursion", position: 1, status: "needs_revision", level: "beginner", accuracy_percent: 40, questions_attempted: 5,
  sources: [{ document_id: "d1", document_title: "Programming Notes", first_page: 3, last_page: 6 }],
  next_action: { kind: "revise", message: "Revise this topic with the tutor, then take a quiz at your level." }, is_current: true, ...over,
});

const event = { id: "e1", topic_id: "t1", topic: "Recursion", old_status: "practicing" as const, new_status: "needs_revision" as const, reason: "Recursion moved up because you scored 2/5.", created_at: "2026-11-22T10:00:00Z" };

const path = (over: Partial<LearningPath> = {}): LearningPath => ({
  steps: [step(), step({ topic_id: "t2", name: "Arrays", position: 2, status: "insufficient_data", level: null, accuracy_percent: null, questions_attempted: 0, is_current: false, next_action: { kind: "start", message: "Study this topic, then take a quiz on it." }, sources: [{ document_id: "d1", document_title: "Programming Notes", first_page: 1, last_page: 2 }] })],
  current_topic_id: "t1", latest_event: event, events: [event], ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  vi.mocked(diagnosticApi.status).mockResolvedValue({ ready_documents: 1, topic_count: 2, available: true, taken: true, taken_at: "2026-11-20T10:00:00Z", latest_quiz_id: "q1", pending_quiz_id: null, suggested: false });
});

describe("CourseMapView", () => {
  it("lists the topics as a numbered path with the current step marked", async () => {
    vi.mocked(pathApi.get).mockResolvedValue(path());
    render(<CourseMapView />);
    const list = await screen.findByRole("list", { name: "Your study path" });
    const steps = within(list).getAllByRole("listitem");
    expect(steps).toHaveLength(2);
    expect(within(steps[0]).getByText("Recursion")).toBeInTheDocument();
    expect(within(steps[0]).getByText("Current step")).toBeInTheDocument();
    expect(within(steps[0]).getByText("Needs revision")).toBeInTheDocument();
    expect(within(steps[0]).getByText("Beginner")).toBeInTheDocument();
    expect(steps[0]).toHaveAttribute("aria-current", "step");
    expect(steps[1]).not.toHaveAttribute("aria-current");
    // A topic with no results shows no accuracy bar and no level
    expect(within(steps[1]).queryByRole("progressbar")).not.toBeInTheDocument();
    expect(within(steps[1]).getByText("Study this topic, then take a quiz on it.")).toBeInTheDocument();
  });

  it("gives each step Study, Quiz and Source", async () => {
    vi.mocked(pathApi.get).mockResolvedValue(path());
    render(<CourseMapView />);
    const first = (await screen.findAllByRole("listitem"))[0];
    expect(within(first).getByRole("link", { name: "Study" }).getAttribute("href")).toBe("/tutor?q=Explain%20Recursion");
    expect(within(first).getByRole("link", { name: "Quiz" }).getAttribute("href")).toBe("/tutor?mode=quiz&q=Recursion");
    const source = within(first).getByRole("button", { name: "Source" });
    expect(source).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(source);
    expect(source).toHaveAttribute("aria-expanded", "true");
    expect(within(first).getByText("Programming Notes")).toBeInTheDocument();
    expect(within(first).getByText(/pages 3 to 6/)).toBeInTheDocument();
  });

  it("shows the Route updated banner with the reason, and remembers that it was closed", async () => {
    vi.mocked(pathApi.get).mockResolvedValue(path());
    const { unmount } = render(<CourseMapView />);
    const banner = (await screen.findByText("Route updated")).closest("[role=status]") as HTMLElement;
    expect(within(banner).getByText("Recursion moved up because you scored 2/5.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Dismiss route update" }));
    expect(screen.queryByText("Route updated")).not.toBeInTheDocument();
    // The history below keeps the reason
    expect(screen.getByText("Route updates")).toBeInTheDocument();
    expect(screen.getByText("Recursion moved up because you scored 2/5.")).toBeInTheDocument();
    unmount();

    // A new update brings the banner back
    vi.mocked(pathApi.get).mockResolvedValue(path({ latest_event: { ...event, id: "e2", reason: "Arrays moved up because you scored 1/5." } }));
    render(<CourseMapView />);
    expect(await screen.findByText("Arrays moved up because you scored 1/5.", { selector: "p" })).toBeInTheDocument();
  });

  it("keeps a history of route updates and shows no banner when there are none", async () => {
    vi.mocked(pathApi.get).mockResolvedValue(path({ latest_event: null, events: [] }));
    render(<CourseMapView />);
    await screen.findByRole("list", { name: "Your study path" });
    expect(screen.queryByText("Route updated")).not.toBeInTheDocument();
    expect(screen.queryByText("Route updates")).not.toBeInTheDocument();
  });

  it("explains an empty map and points to the library", async () => {
    vi.mocked(pathApi.get).mockResolvedValue({ steps: [], current_topic_id: null, latest_event: null, events: [] });
    render(<CourseMapView />);
    expect(await screen.findByText("Your Course Map is empty")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to My library" })).toHaveAttribute("href", "/library");
  });

  it("shows an error with a retry when the path cannot be loaded", async () => {
    vi.mocked(pathApi.get).mockRejectedValue(new Error("down"));
    render(<CourseMapView />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again|retry/i })).toBeInTheDocument();
  });

  it("offers the lighter step first on a topic that has one running", async () => {
    vi.mocked(pathApi.get).mockResolvedValue(path({ steps: [step({ light_episode_id: "e9", next_action: { kind: "light", message: "Let's take a lighter step on Recursion: a quick recap, then a short confidence quiz." } })] }));
    render(<CourseMapView />);
    const first = (await screen.findAllByRole("listitem"))[0];
    expect(within(first).getByRole("link", { name: "Lighter step" })).toHaveAttribute("href", "/light-mode/e9");
    expect(within(first).getByText(/Let's take a lighter step on Recursion/)).toBeInTheDocument();
  });

  it("says why a topic was moved first for the exam", async () => {
    vi.mocked(pathApi.get).mockResolvedValue(path({ steps: [step({ priority_reason: "Likely in exam" })] }));
    render(<CourseMapView />);
    const first = (await screen.findAllByRole("listitem"))[0];
    expect(within(first).getByText("Likely in exam")).toBeInTheDocument();
  });

  it("offers to retake the diagnostic", async () => {
    vi.mocked(pathApi.get).mockResolvedValue(path());
    render(<CourseMapView />);
    expect(await screen.findByRole("button", { name: "Retake the diagnostic" })).toBeInTheDocument();
  });
});
