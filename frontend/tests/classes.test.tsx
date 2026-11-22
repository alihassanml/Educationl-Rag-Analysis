import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClassesView } from "@/components/classes/classes-view";
import { ClassManager } from "@/components/teacher/class-manager";
import { TeacherView } from "@/components/teacher/teacher-view";
import { ApiError } from "@/lib/api-client";
import { classesApi, documentsApi, teacherApi } from "@/lib/api";
import { navItemsFor } from "@/lib/features";
import type { ClassDetail, ClassInsights, ClassSummary } from "@/types/api";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/api", () => ({
  classesApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), join: vi.fn(), leave: vi.fn(), remove: vi.fn(), removeMember: vi.fn(), share: vi.fn(), unshare: vi.fn() },
  teacherApi: { insights: vi.fn() },
  documentsApi: { list: vi.fn() },
}));

const summary: ClassSummary = { id: "c1", name: "CS101", teacher_name: "Ms Khan", member_count: 2, document_count: 1, created_at: "2026-01-01T00:00:00Z", join_code: null };
const detail: ClassDetail = {
  ...summary,
  join_code: "ABCD2345",
  documents: [{ id: "d1", title: "Week 1 slides", kind: "notes", status: "ready", page_count: 4, shared_at: "2026-01-02T00:00:00Z" }],
  members: [{ student_id: "s1", display_name: "Mina", joined_at: "2026-01-03T00:00:00Z" }],
};
const insights: ClassInsights = { class_id: "c1", class_name: "CS101", student_count: 1, min_students: 3, topics: [], topics_hidden: 2, students: [{ student_id: "s1", display_name: "Mina", topics: [{ topic: "Recursion", status: "needs_revision", level: "beginner", accuracy: 20, attempted: 10 }] }] };

beforeEach(() => vi.resetAllMocks());

describe("navigation by role", () => {
  const hrefs = (user: Parameters<typeof navItemsFor>[0]) => navItemsFor(user).map((i) => i.href);
  it("gives students the study pages and My classes, not the teacher area", () => {
    const list = hrefs({ is_admin: false, role: "student" });
    expect(list).toContain("/classes");
    expect(list).toContain("/course-map");
    expect(list).not.toContain("/teacher");
  });
  it("gives teachers the teacher area and the library, not the study pages", () => {
    const list = hrefs({ is_admin: false, role: "teacher" });
    expect(list).toEqual(expect.arrayContaining(["/teacher", "/library"]));
    expect(list).not.toContain("/course-map");
    expect(list).not.toContain("/classes");
  });
  it("treats an account with no role as a student", () => {
    expect(hrefs({ is_admin: false })).toContain("/classes");
  });
});

describe("ClassesView (student)", () => {
  it("joins with a code, uppercased, and reloads the list", async () => {
    vi.mocked(classesApi.list).mockResolvedValueOnce([]).mockResolvedValue([summary]);
    vi.mocked(classesApi.get).mockResolvedValue(detail);
    vi.mocked(classesApi.join).mockResolvedValue(summary);
    render(<ClassesView />);
    expect(await screen.findByText("You have not joined a class")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Class code"), "abcd2345");
    await userEvent.click(screen.getByRole("button", { name: "Join class" }));
    expect(classesApi.join).toHaveBeenCalledWith("ABCD2345");
    expect(await screen.findByText("Week 1 slides")).toBeInTheDocument();
  });

  it("checks the code length before calling the server", async () => {
    vi.mocked(classesApi.list).mockResolvedValue([]);
    render(<ClassesView />);
    await userEvent.type(await screen.findByLabelText("Class code"), "ABC");
    await userEvent.click(screen.getByRole("button", { name: "Join class" }));
    expect(screen.getByText("A class code has 8 characters")).toBeInTheDocument();
    expect(classesApi.join).not.toHaveBeenCalled();
  });

  it("says plainly when no class has that code", async () => {
    vi.mocked(classesApi.list).mockResolvedValue([]);
    vi.mocked(classesApi.join).mockRejectedValue(new ApiError("Class not found", 404, "not_found"));
    render(<ClassesView />);
    await userEvent.type(await screen.findByLabelText("Class code"), "ZZZZZZZZ");
    await userEvent.click(screen.getByRole("button", { name: "Join class" }));
    expect(await screen.findByText(/No class has that code/)).toBeInTheDocument();
  });

  it("tells students what the teacher can and cannot see", async () => {
    vi.mocked(classesApi.list).mockResolvedValue([]);
    render(<ClassesView />);
    expect(await screen.findByText(/cannot see your documents or chats/)).toBeInTheDocument();
  });
});

describe("TeacherView", () => {
  it("creates a class", async () => {
    vi.mocked(classesApi.list).mockResolvedValue([]);
    vi.mocked(classesApi.create).mockResolvedValue({ ...summary, join_code: "ABCD2345" });
    render(<TeacherView />);
    await userEvent.type(await screen.findByLabelText("Class name"), "CS101");
    await userEvent.click(screen.getByRole("button", { name: "Create class" }));
    expect(classesApi.create).toHaveBeenCalledWith("CS101");
  });

  it("lists classes with counts, each linking to its page", async () => {
    vi.mocked(classesApi.list).mockResolvedValue([{ ...summary, join_code: "ABCD2345" }]);
    render(<TeacherView />);
    const link = await screen.findByRole("link", { name: /CS101/ });
    expect(link).toHaveAttribute("href", "/teacher/c1");
    expect(link).toHaveTextContent("2 students · 1 shared document");
  });
});

describe("ClassManager (teacher)", () => {
  beforeEach(() => {
    vi.mocked(classesApi.get).mockResolvedValue(detail);
    vi.mocked(teacherApi.insights).mockResolvedValue(insights);
    vi.mocked(documentsApi.list).mockResolvedValue({
      items: [
        { id: "d1", title: "Week 1 slides", status: "ready" },
        { id: "d2", title: "Week 2 slides", status: "ready" },
        { id: "d3", title: "Still indexing", status: "processing" },
      ],
      total: 3,
    } as never);
  });

  it("shows the code, shared material and members by display name", async () => {
    render(<ClassManager classId="c1" />);
    expect(await screen.findByLabelText("Class code")).toHaveTextContent("ABCD2345");
    expect(within_list("Shared documents")).toContain("Week 1 slides");
    expect(within_list("Members")).toContain("Mina");
  });

  it("offers only ready documents that are not shared yet, and shares the chosen one", async () => {
    vi.mocked(classesApi.share).mockResolvedValue(undefined);
    render(<ClassManager classId="c1" />);
    const select = await screen.findByLabelText("Document to share");
    const options = Array.from(select.querySelectorAll("option")).map((o) => o.textContent);
    expect(options).toEqual(["Choose a document", "Week 2 slides"]);
    await userEvent.selectOptions(select, "d2");
    await userEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(classesApi.share).toHaveBeenCalledWith("c1", "d2");
  });

  it("stops sharing and removes a member", async () => {
    vi.mocked(classesApi.unshare).mockResolvedValue(undefined);
    vi.mocked(classesApi.removeMember).mockResolvedValue(undefined);
    render(<ClassManager classId="c1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Stop sharing" }));
    expect(classesApi.unshare).toHaveBeenCalledWith("c1", "d1");
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(classesApi.removeMember).toHaveBeenCalledWith("c1", "s1");
  });

  it("explains why class topics are held back and shows each student's topic status", async () => {
    render(<ClassManager classId="c1" />);
    expect(await screen.findByText(/once at least 3 students have practised it/)).toBeInTheDocument();
    expect(screen.getByText(/2 topics are waiting for more students/)).toBeInTheDocument();
    expect(await screen.findByText("Recursion")).toBeInTheDocument();
    expect(screen.getByText("Needs revision")).toBeInTheDocument();
    expect(screen.getByText(/Their documents and chats are private/)).toBeInTheDocument();
  });

  it("lists weak class topics when enough students are behind them", async () => {
    vi.mocked(teacherApi.insights).mockResolvedValue({ ...insights, topics_hidden: 0, topics: [{ topic: "Recursion", students: 3, accuracy: 20, status: "needs_revision", weak: true }] });
    render(<ClassManager classId="c1" />);
    expect(await screen.findByText("3 students · 20% correct", { exact: false })).toBeInTheDocument();
  });

  it("shows an error with retry when the class cannot load", async () => {
    vi.mocked(classesApi.get).mockRejectedValue(new ApiError("Class not found", 404, "not_found"));
    render(<ClassManager classId="nope" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Class not found");
    await waitFor(() => expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled());
  });
});

function within_list(label: string): string {
  return screen.getByLabelText(label).textContent ?? "";
}
