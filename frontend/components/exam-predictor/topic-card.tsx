"use client";

import { ChevronRight, Pin } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { LevelChip } from "@/components/quizzes/level-change";
import { Button, ButtonLink } from "@/components/ui/button";
import { Chip, type ChipTone } from "@/components/ui/chip";
import { ProgressBar } from "@/components/ui/progress-bar";
import { cn } from "@/lib/cn";
import { examApi } from "@/lib/api";
import type { EvidenceQuestion, PredictedTopic } from "@/types/api";

const LABEL_TONE: Record<PredictedTopic["label"], ChipTone> = { High: "danger", Medium: "warning", Low: "neutral" };

/** "Paper 2025 · 2025 · Summer · page 3" */
export function paperLine(q: EvidenceQuestion): string {
  return [q.paper_title, q.paper_year && !q.paper_title.includes(String(q.paper_year)) ? String(q.paper_year) : null, q.paper_session, q.page_number ? `page ${q.page_number}` : null]
    .filter(Boolean)
    .join(" · ");
}

/** A real question from a past paper, with its source as a link to that paper in the tutor. */
export function EvidenceItem({ q }: { q: EvidenceQuestion }) {
  return (
    <li className="py-2.5 first:pt-0 last:pb-0">
      <p className="text-sm text-ink">{q.text}</p>
      <p className="mt-1 text-small text-ink-2">
        <Link href={`/tutor?doc=${q.document_id}`} className="font-medium text-accent-link underline-offset-4 hover:underline">
          {paperLine(q)}
        </Link>
        {q.marks ? ` · ${q.marks} marks` : ""}
      </p>
    </li>
  );
}

/** One ranked topic: its likelihood, the rule applied in plain words, the questions behind it, and what to do next. */
export function TopicCard({ topic, rank }: { topic: PredictedTopic; rank: number }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(topic.pinned);
  const [pinError, setPinError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const listId = useId();
  const encoded = encodeURIComponent(topic.name);

  async function togglePin() {
    const next = !pinned;
    setSaving(true);
    setPinError(null);
    setPinned(next);
    try {
      await examApi.setPriority(topic.topic_id, next);
    } catch {
      setPinned(!next);
      setPinError("Could not save this. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li>
      <section aria-label={`${topic.name}, ${topic.label} likelihood`} className="rounded-panel border border-stone bg-paper p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-small text-ink-2" aria-hidden="true">
            {rank}.
          </span>
          <h3 className="mr-auto min-w-0 truncate text-base font-semibold text-ink">{topic.name}</h3>
          <Chip tone={LABEL_TONE[topic.label]}>{topic.label}</Chip>
          {topic.level ? <LevelChip level={topic.level} /> : null}
        </div>
        <div className="mt-3">
          <ProgressBar value={topic.score} label={`${topic.name} likelihood score`} />
        </div>
        <p className="mt-2 text-sm text-ink">{topic.explanation}</p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ButtonLink size="sm" href={`/tutor?mode=quiz&q=${encoded}`}>
            Quiz me on this topic
          </ButtonLink>
          <ButtonLink size="sm" variant="secondary" href={`/tutor?q=${encodeURIComponent(`Explain ${topic.name}`)}`}>
            Explain this topic
          </ButtonLink>
          <Button size="sm" variant="secondary" aria-pressed={pinned} onClick={() => void togglePin()} disabled={saving}>
            <Pin size={14} strokeWidth={1.75} aria-hidden="true" />
            {pinned ? "On your Course Map priority" : "Add to my Course Map priority"}
          </Button>
        </div>
        {pinError ? (
          <p role="alert" className="mt-2 text-small text-danger">
            {pinError}
          </p>
        ) : null}

        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((v) => !v)}
          className="mt-3 inline-flex items-center gap-1 rounded-control text-sm font-medium text-ink-2 hover:text-ink"
        >
          <ChevronRight size={14} strokeWidth={1.75} aria-hidden="true" className={cn("transition-transform duration-[120ms]", open && "rotate-90")} />
          Past questions ({topic.question_count})
        </button>
        {open ? (
          <ul id={listId} aria-label={`Past questions on ${topic.name}`} className="mt-2 divide-y divide-stone">
            {topic.evidence.map((q) => (
              <EvidenceItem key={q.question_id} q={q} />
            ))}
          </ul>
        ) : null}
        {open && topic.question_count > topic.evidence.length ? <p className="mt-2 text-small text-ink-2">Showing {topic.evidence.length} of {topic.question_count} questions</p> : null}
      </section>
    </li>
  );
}
