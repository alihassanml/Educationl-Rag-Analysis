import { CheckCircle2, XCircle } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { DownloadNotesButton } from "./download-notes-button";
import { LEVEL_LABEL, LevelChangeNote } from "./level-change";
import { NextQuizButton } from "./next-quiz-button";
import { ButtonLink } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Panel } from "@/components/ui/panel";
import { TopicStatusLabel } from "@/components/ui/status-label";
import { cn } from "@/lib/cn";
import { sourceLabel } from "@/lib/formatters";
import type { AttemptResult } from "@/types/api";

/** Light mode, in supportive and neutral words: a lighter step has started or just finished. */
function LightModeNote({ result }: { result: AttemptResult }) {
  const note = result.light_mode;
  if (!note) return null;
  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-stone pt-4">
      <p className="text-ink">{note.message}</p>
      {note.state === "active" ? (
        <div>
          <ButtonLink size="sm" href={`/light-mode/${note.episode_id}`}>
            {result.kind === "confidence" ? "Open the recap" : "Start with a quick recap"}
          </ButtonLink>
        </div>
      ) : null}
    </div>
  );
}

/** What the diagnostic found: where each topic starts, and which are strong or weak. */
function DiagnosticFindings({ result }: { result: AttemptResult }) {
  const d = result.diagnostic;
  if (!d) return null;
  return (
    <Panel title="Where each topic starts">
      <ul className="divide-y divide-stone">
        {d.topics.map((t) => (
          <li key={t.topic_id} className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
            <span className="min-w-0 truncate text-sm font-medium text-ink">{t.topic}</span>
            <span className="flex shrink-0 items-center gap-3 text-small text-ink-2">
              {t.correct} of {t.asked} correct
              <Chip tone={t.level === "advanced" ? "success" : t.level === "beginner" ? "warning" : "neutral"}>{LEVEL_LABEL[t.level]}</Chip>
            </span>
          </li>
        ))}
      </ul>
      <dl className="mt-4 space-y-2 border-t border-stone pt-4 text-sm">
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 text-ink-2">Strengths</dt>
          <dd className="text-ink">{d.strengths.length > 0 ? d.strengths.join(", ") : "None yet. Every topic still has room to grow"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 text-ink-2">Weak topics</dt>
          <dd className="text-ink">{d.weak_topics.length > 0 ? d.weak_topics.join(", ") : "None. No topic scored below half"}</dd>
        </div>
      </dl>
    </Panel>
  );
}

export function QuizResult({ result }: { result: AttemptResult }) {
  const diagnostic = result.kind === "diagnostic";
  const needsReview = result.topic_status === "needs_revision" && result.topic;
  return (
    <PageContainer>
      <PageHeader title={result.quiz_title} description="Your result" />
      <div className="flex max-w-3xl flex-col gap-6">
        <Panel>
          <p className="text-metric font-medium text-ink">
            {result.score} of {result.total_questions} correct
          </p>
          <p className="mt-1 text-ink-2">{result.percent}%</p>
          <LevelChangeNote result={result} />
          <LightModeNote result={result} />
          {!diagnostic && result.recommendation ? (
            <div className="mt-4 border-t border-stone pt-4">
              <div className="flex items-center gap-3">
                <p className="text-sm font-medium text-ink">Suggested next step</p>
                {result.topic_status ? <TopicStatusLabel status={result.topic_status} /> : null}
              </div>
              <p className="mt-1 text-ink">{result.recommendation.message}</p>
            </div>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-3">
            {diagnostic || result.kind === "confidence" ? (
              <ButtonLink href="/course-map">Open your Course Map</ButtonLink>
            ) : needsReview ? (
              <ButtonLink href={`/tutor?q=${encodeURIComponent(`Explain ${result.topic} in simple words`)}`}>Review this topic</ButtonLink>
            ) : (
              <NextQuizButton result={result} />
            )}
            {needsReview && !diagnostic ? <NextQuizButton result={result} variant="secondary" /> : null}
            <DownloadNotesButton quizId={result.quiz_id} />
            <ButtonLink variant="ghost" href="/progress">
              View progress
            </ButtonLink>
          </div>
        </Panel>

        <DiagnosticFindings result={result} />

        {/* One flat list: the questions are not cards, and correct or incorrect is said in words, not in a badge */}
        <ol className="divide-y divide-stone border-y border-stone">
          {result.results.map((r, index) => (
            <li key={r.question_id} className="py-6">
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-small text-ink-2">Question {index + 1}</p>
                <p className={cn("inline-flex items-center gap-1 text-sm font-medium", r.is_correct ? "text-success" : "text-danger")}>
                  {r.is_correct ? <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden="true" /> : <XCircle size={16} strokeWidth={1.75} aria-hidden="true" />}
                  <span>{r.is_correct ? "Correct" : "Incorrect"}</span>
                </p>
              </div>
              <p className="mt-2 text-base font-medium text-ink">{r.question_text}</p>
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex gap-2">
                  <dt className="shrink-0 text-ink-2">Your answer:</dt>
                  <dd className="text-ink">{r.options[r.selected_index]}</dd>
                </div>
                {!r.is_correct ? (
                  <div className="flex gap-2">
                    <dt className="shrink-0 text-ink-2">Correct answer:</dt>
                    <dd className="font-medium text-ink">{r.options[r.correct_index]}</dd>
                  </div>
                ) : null}
              </dl>
              <p className="mt-3 text-sm text-ink">{r.explanation}</p>
              {r.sources.length > 0 ? (
                <p className="mt-2 text-small text-ink-2">Source: {r.sources.map(sourceLabel).join("; ")}</p>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </PageContainer>
  );
}
