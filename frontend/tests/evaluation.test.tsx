import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComparePanel } from "@/components/evaluation/compare-panel";
import { EvaluationView } from "@/components/evaluation/evaluation-view";
import { ResultList } from "@/components/evaluation/result-list";
import { RunView } from "@/components/evaluation/run-view";
import { StartRunPanel } from "@/components/evaluation/start-run-panel";
import { StatGrid } from "@/components/evaluation/stat-grid";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { ApiError } from "@/lib/api-client";
import { evalApi } from "@/lib/api";
import { formatDelta, formatLatency, formatPercent } from "@/lib/eval-format";
import { formatDateTime } from "@/lib/formatters";
import type { EvalMetrics, EvalResult, EvalRun } from "@/types/api";

vi.mock("@/lib/api", () => ({
  evalApi: { datasets: vi.fn(), startRun: vi.fn(), runs: vi.fn(), run: vi.fn(), results: vi.fn(), compare: vi.fn() },
  // The Live feedback list is part of this page but is tested in live-feedback.test.tsx
  tutorApi: { recentFeedback: vi.fn(() => new Promise(() => undefined)) },
}));
vi.mock("@/components/evaluation/hit-rate-chart", () => ({ HitRateChart: () => <div>hit rate chart</div> }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard", useRouter: () => ({ push: vi.fn() }) }));
const userState = vi.hoisted(() => ({ is_admin: false }));
vi.mock("@/components/auth/session-provider", () => ({
  useUser: () => ({ id: "1", email: "a@b.com", is_admin: userState.is_admin, created_at: "2026-01-01" }),
}));

const metrics: EvalMetrics = {
  n_answerable: 30,
  n_unanswerable: 8,
  n_errors: 0,
  hit_rate: { "1": 0.9667, "3": 1, "5": 1, "10": 1 },
  precision: { "1": 0.9667, "3": 0.3333, "5": 0.2, "10": 0.1 },
  ndcg: { "1": 0.9667, "3": 0.98, "5": 0.9877, "10": 0.9877 },
  mrr: 0.9833,
  ci: { "hit_rate@5": [0.9, 1], mrr: [0.95, 1] },
  abstention: { tp: 30, fn: 0, fp: 3, tn: 5, precision: 0.9091, recall: 1, f1: 0.9524, accuracy: 0.9211 },
  pass_rate: 0.9,
  latency_ms: { p50: 16, p95: 19.3 },
};

function makeRun(over: Partial<EvalRun> = {}): EvalRun {
  return {
    id: "run-1",
    dataset_id: "ds-1",
    dataset_name: "Sample course",
    status: "completed",
    config: { retrieval_mode: "dense", min_similarity: 0.6, depth: 10, embedding_model: "bge" },
    metrics,
    error_message: null,
    items_done: 38,
    items_total: 38,
    created_at: "2026-11-09T09:00:00Z",
    started_at: "2026-11-09T09:00:01Z",
    finished_at: "2026-11-09T09:00:30Z",
    ...over,
  };
}

function makeResult(over: Partial<EvalResult> = {}): EvalResult {
  return {
    id: "res-1",
    question: "What is a variable?",
    answerable: true,
    question_type: "factual",
    concept: "Intro",
    gold_document_title: "Notes",
    gold_page: 1,
    answered: true,
    passed: true,
    first_relevant_rank: 1,
    retrieved: [
      { rank: 1, chunk_id: "c1", document_title: "Notes", page_number: 1, similarity: 0.83, relevant: true },
      { rank: 2, chunk_id: "c2", document_title: "Notes", page_number: 2, similarity: 0.41, relevant: false },
    ],
    latency_ms: 12,
    error: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  userState.is_admin = false;
});
afterEach(() => vi.useRealTimers());

describe("eval-format", () => {
  it("formats percentages with one decimal", () => {
    expect(formatPercent(0.8667)).toBe("86.7%");
    expect(formatPercent(1)).toBe("100.0%");
    expect(formatPercent(0)).toBe("0.0%");
  });

  it("formats a change in percentage points with a direction", () => {
    expect(formatDelta(0.8, 0.8667)).toEqual({ text: "+6.7 pts", direction: "up" });
    expect(formatDelta(0.9, 0.8)).toEqual({ text: "-10.0 pts", direction: "down" });
    expect(formatDelta(0.5, 0.5)).toEqual({ text: "No change", direction: "flat" });
  });

  it("formats a change as an absolute value for scores that are not percentages", () => {
    expect(formatDelta(0.9833, 0.9667, "abs")).toEqual({ text: "-0.017", direction: "down" });
  });

  it("formats latency in ms or seconds", () => {
    expect(formatLatency(840)).toBe("840 ms");
    expect(formatLatency(19.3)).toBe("19 ms");
    expect(formatLatency(1234)).toBe("1.2 s");
  });
});

describe("formatDateTime", () => {
  it("includes the time so runs from the same day can be told apart", () => {
    expect(formatDateTime("2026-11-09T09:05:00Z")).toMatch(/9 Nov.*\d{2}:\d{2}/);
  });
});

describe("StatGrid", () => {
  it("shows the four headline metrics with captions", () => {
    render(<StatGrid latest={makeRun()} previous={null} />);
    expect(screen.getByText("Hit rate at 5")).toBeInTheDocument();
    expect(screen.getByText("100.0%")).toBeInTheDocument();
    expect(screen.getByText("MRR")).toBeInTheDocument();
    expect(screen.getByText("0.983")).toBeInTheDocument();
    expect(screen.getByText("Abstention accuracy")).toBeInTheDocument();
    expect(screen.getByText("92.1%")).toBeInTheDocument();
    expect(screen.getByText("Items tested")).toBeInTheDocument();
    expect(screen.getByText("38")).toBeInTheDocument();
  });

  it("always shows the sample size, question set and date next to the numbers", () => {
    render(<StatGrid latest={makeRun()} previous={null} />);
    expect(screen.getByText("38 labelled questions · Sample course · 9 Nov 2026")).toBeInTheDocument();
  });

  it("says there is no previous run instead of inventing a change", () => {
    render(<StatGrid latest={makeRun()} previous={null} />);
    expect(screen.getAllByText("No previous run").length).toBeGreaterThan(0);
  });

  it("says how many questions could not be scored", () => {
    render(<StatGrid latest={makeRun({ metrics: { ...metrics, n_errors: 2 } })} previous={null} />);
    expect(screen.getByText(/2 questions could not be scored/)).toBeInTheDocument();
  });

  it("does not mention unscored questions when there are none", () => {
    render(<StatGrid latest={makeRun()} previous={null} />);
    expect(screen.queryByText(/could not be scored/)).not.toBeInTheDocument();
  });

  it("shows the change against the previous run", () => {
    const previous = makeRun({ id: "run-0", metrics: { ...metrics, hit_rate: { ...metrics.hit_rate, "5": 0.9 } } });
    render(<StatGrid latest={makeRun()} previous={previous} />);
    expect(screen.getByText("+10.0 pts")).toBeInTheDocument();
  });
});

describe("StartRunPanel", () => {
  const datasets = [{ id: "ds-1", name: "Sample course", item_count: 38, answerable_count: 30, created_at: "2026-11-09T00:00:00Z" }];

  it("disables the button while the request is pending", async () => {
    vi.mocked(evalApi.startRun).mockReturnValue(new Promise(() => undefined));
    render(<StartRunPanel datasets={datasets} onStarted={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText("Retrieval mode"), "hybrid");
    await userEvent.click(screen.getByRole("button", { name: "Start run" }));
    expect(screen.getByRole("button", { name: /Start run/ })).toBeDisabled();
    expect(evalApi.startRun).toHaveBeenCalledWith({ dataset_id: "ds-1", retrieval_mode: "hybrid" });
  });

  it("shows the service message when the worker is unavailable and lets the admin retry", async () => {
    vi.mocked(evalApi.startRun).mockRejectedValue(
      new ApiError("The background service is not running. Please try again shortly", 503, "queue_unavailable"),
    );
    render(<StartRunPanel datasets={datasets} onStarted={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Start run" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The background service is not running");
    expect(screen.getByRole("button", { name: "Start run" })).toBeEnabled();
  });

  it("tells the admin how to create a dataset when there is none", () => {
    render(<StartRunPanel datasets={[]} onStarted={vi.fn()} />);
    expect(screen.getByText(/eval\.seed_lab/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start run" })).not.toBeInTheDocument();
  });
});

describe("EvaluationView", () => {
  it("shows a calm message and no retry button for a non-administrator", async () => {
    vi.mocked(evalApi.datasets).mockRejectedValue(new ApiError("This area is for administrators", 403, "forbidden"));
    vi.mocked(evalApi.runs).mockRejectedValue(new ApiError("This area is for administrators", 403, "forbidden"));
    render(<EvaluationView />);
    expect(await screen.findByText("This area is for administrators")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("shows headline numbers from the latest completed run and the run list", async () => {
    vi.mocked(evalApi.datasets).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(evalApi.runs).mockResolvedValue({ items: [makeRun()], total: 1 });
    render(<EvaluationView />);
    expect(await screen.findByText("Hit rate at 5")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Sample course/ })).toHaveAttribute("href", "/evaluation/runs/run-1");
  });

  it("explains the first step when there are no runs yet", async () => {
    vi.mocked(evalApi.datasets).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(evalApi.runs).mockResolvedValue({ items: [], total: 0 });
    render(<EvaluationView />);
    expect(await screen.findByText("No evaluation runs yet")).toBeInTheDocument();
    expect(screen.queryByText("Hit rate at 5")).not.toBeInTheDocument();
  });
});

describe("RunView", () => {
  beforeEach(() => {
    vi.mocked(evalApi.results).mockResolvedValue({ items: [makeResult()], total: 1 });
  });

  it("shows the confusion matrix counts and says only retrieval is measured", async () => {
    vi.mocked(evalApi.run).mockResolvedValue(makeRun());
    render(<RunView runId="run-1" />);
    expect(await screen.findByText(/Retrieval only, no answer generation yet/)).toBeInTheDocument();
    const matrix = screen.getByRole("table", { name: "Abstention confusion matrix" });
    expect(within(matrix).getByText("30")).toBeInTheDocument();
    expect(within(matrix).getByText("5")).toBeInTheDocument();
    expect(screen.getByText(/95% interval/)).toBeInTheDocument();
  });

  it("polls while the run is in progress and stops once it completes", async () => {
    vi.useFakeTimers();
    vi.mocked(evalApi.run)
      .mockResolvedValueOnce(makeRun({ status: "running", metrics: null, items_done: 10 }))
      .mockResolvedValue(makeRun());
    render(<RunView runId="run-1" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("10 of 38 questions")).toBeInTheDocument();
    expect(evalApi.run).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(evalApi.run).toHaveBeenCalledTimes(2);
    expect(screen.getByText("hit rate chart")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(evalApi.run).toHaveBeenCalledTimes(2);
  });

  it("shows the failure reason for a failed run", async () => {
    vi.mocked(evalApi.run).mockResolvedValue(
      makeRun({ status: "failed", metrics: null, error_message: "The evaluation could not be completed" }),
    );
    render(<RunView runId="run-1" />);
    expect(await screen.findByText("The evaluation could not be completed")).toBeInTheDocument();
    expect(evalApi.results).not.toHaveBeenCalled();
  });
});

describe("ResultList", () => {
  it("shows retrieved chunks with rank, similarity and the gold passage marker", async () => {
    render(<ResultList results={[makeResult()]} total={1} filter="all" onFilterChange={vi.fn()} />);
    expect(screen.getByText("What is a variable?")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Retrieved passages"));
    expect(screen.getByText("Gold passage")).toBeInTheDocument();
    expect(screen.getByText("0.83")).toBeInTheDocument();
  });

  it("shows the error text for an item that could not be scored", () => {
    const errored = makeResult({ id: "res-2", passed: null, answered: null, error: "Gold passage not found in your library" });
    render(<ResultList results={[errored]} total={1} filter="all" onFilterChange={vi.fn()} />);
    expect(screen.getByText("Gold passage not found in your library")).toBeInTheDocument();
  });

  it("reports the chosen filter", async () => {
    const onFilterChange = vi.fn();
    render(<ResultList results={[]} total={0} filter="all" onFilterChange={onFilterChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Failed" }));
    expect(onFilterChange).toHaveBeenCalledWith("failed");
    expect(screen.getByText("No questions match this filter")).toBeInTheDocument();
  });
});

describe("ComparePanel", () => {
  it("compares two runs with metric changes and the config difference", async () => {
    const dense = makeRun({ id: "run-d", metrics: { ...metrics, hit_rate: { ...metrics.hit_rate, "5": 0.8 } } });
    const hybrid = makeRun({
      id: "run-h",
      config: { ...dense.config, retrieval_mode: "hybrid" },
      metrics: { ...metrics, hit_rate: { ...metrics.hit_rate, "5": 0.8667 } },
    });
    vi.mocked(evalApi.compare).mockResolvedValue({
      runs: [dense, hybrid],
      config_diff: { retrieval_mode: ["dense", "hybrid"] },
    });
    render(<ComparePanel runs={[dense, hybrid]} />);
    await userEvent.selectOptions(screen.getByLabelText("Run B"), "run-h");
    await userEvent.click(screen.getByRole("button", { name: "Compare" }));
    expect(evalApi.compare).toHaveBeenCalledWith(["run-d", "run-h"]);
    expect(await screen.findByText("+6.7 pts")).toBeInTheDocument();
    expect(screen.getByText("Retrieval mode")).toBeInTheDocument();
  });

  it("picks sensible runs when a second run completes after the panel was shown", async () => {
    const dense = makeRun({ id: "run-d" });
    const hybrid = makeRun({ id: "run-h", config: { ...dense.config, retrieval_mode: "hybrid" } });
    vi.mocked(evalApi.compare).mockResolvedValue({ runs: [hybrid, dense], config_diff: {} });
    const { rerender } = render(<ComparePanel runs={[dense]} />);
    rerender(<ComparePanel runs={[hybrid, dense]} />);
    await userEvent.click(screen.getByRole("button", { name: "Compare" }));
    expect(evalApi.compare).toHaveBeenCalledWith(["run-h", "run-d"]);
  });

  it("needs two completed runs", () => {
    render(<ComparePanel runs={[makeRun()]} />);
    expect(screen.getByText("Complete two runs to compare them")).toBeInTheDocument();
  });
});

describe("SidebarNav", () => {
  it("hides Evaluation from regular users", () => {
    render(<SidebarNav />);
    expect(screen.queryByRole("link", { name: "Evaluation Lab" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
  });

  it("shows Evaluation to administrators", () => {
    userState.is_admin = true;
    render(<SidebarNav />);
    expect(screen.getByRole("link", { name: "Evaluation Lab" })).toHaveAttribute("href", "/evaluation");
  });
});

describe("small test set warning", () => {
  it("warns when the latest run used fewer than 150 items, and stays quiet for a large set", async () => {
    userState.is_admin = true;
    vi.mocked(evalApi.datasets).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(evalApi.runs).mockResolvedValue({ items: [makeRun()], total: 1 });
    const { unmount } = render(<EvaluationView />);
    expect(await screen.findByText(/Small test set \(38 items\)/)).toBeInTheDocument();
    unmount();

    vi.mocked(evalApi.runs).mockResolvedValue({ items: [makeRun({ items_total: 150 })], total: 1 });
    render(<EvaluationView />);
    await screen.findByText("Hit rate at 5");
    expect(screen.queryByText(/Small test set/)).not.toBeInTheDocument();
  });
});
