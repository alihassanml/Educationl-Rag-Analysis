"use client";

import { FileText, Plus, SearchX } from "lucide-react";
import { useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { CitationPill, SourceCard } from "@/components/ui/citation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Input, Select, Textarea, describedBy } from "@/components/ui/field";
import { EmptyState, ErrorBlock, LoadingBlock, Notice } from "@/components/ui/feedback";
import { Panel } from "@/components/ui/panel";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SegmentedTiles } from "@/components/ui/segmented-tiles";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { DocumentStatusLabel, TopicStatusLabel } from "@/components/ui/status-label";
import { useToast } from "@/components/ui/toast";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-4 text-lg font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

const SWATCHES = [
  ["paper", "bg-paper border border-stone"],
  ["stone-50", "bg-stone-50"],
  ["stone-100", "bg-stone-100"],
  ["stone", "bg-stone"],
  ["stone-strong", "bg-stone-strong"],
  ["ink", "bg-ink"],
  ["ink-2", "bg-ink-2"],
  ["clay", "bg-clay"],
  ["clay-strong", "bg-clay-strong"],
  ["clay-stronger", "bg-clay-stronger"],
  ["clay-soft", "bg-clay-soft"],
  ["success", "bg-success"],
  ["warning", "bg-warning"],
  ["danger", "bg-danger"],
] as const;

export function DesignGallery() {
  const toast = useToast();
  const [difficulty, setDifficulty] = useState<"beginner" | "intermediate" | "advanced">("beginner");
  const [dialog, setDialog] = useState(false);

  return (
    <PageContainer>
      <PageHeader title="Design components" description="Every shared component in every state. Development only." action={<Button onClick={() => toast.show("Document deleted")}>Show a toast</Button>} />

      <Section title="Colour tokens">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {SWATCHES.map(([name, cls]) => (
            <li key={name}>
              <div className={`h-12 rounded-control ${cls}`} />
              <p className="mt-1 text-small text-ink-2">{name}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="danger">Danger</Button>
          <Button disabled>Disabled</Button>
          <Button loading>Loading</Button>
          <Button size="sm">Small 32</Button>
          <Button size="lg">Large 40</Button>
          <Button variant="secondary">
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
            With icon
          </Button>
        </div>
      </Section>

      <Section title="Inputs">
        <div className="grid gap-4 md:grid-cols-2">
          <Field id="d-text" label="Text input" hint="Help text sits below in ink-2">
            <Input id="d-text" placeholder="Placeholder" aria-describedby={describedBy("d-text", undefined, "hint")} />
          </Field>
          <Field id="d-error" label="With an error" error="Enter a valid email address">
            <Input id="d-error" defaultValue="not-an-email" aria-invalid aria-describedby={describedBy("d-error", "error")} />
          </Field>
          <Field id="d-select" label="Select">
            <Select id="d-select">
              <option>Beginner</option>
              <option>Intermediate</option>
            </Select>
          </Field>
          <Field id="d-disabled" label="Disabled">
            <Input id="d-disabled" disabled defaultValue="Disabled value" />
          </Field>
          <div className="md:col-span-2">
            <Field id="d-area" label="Textarea">
              <Textarea id="d-area" placeholder="Longer text" />
            </Field>
          </div>
        </div>
      </Section>

      <Section title="Cards and stat tiles">
        <div className="grid gap-4 md:grid-cols-3">
          <Panel title="Card">Paper with a stone border and no shadow at rest.</Panel>
          <Panel title="Muted card" muted>
            Stone-100 fill with no border.
          </Panel>
          <StatTile label="Average score" value="72%" context="from 12 attempts" />
          <StatTile label="Quizzes completed" value={null} />
        </div>
      </Section>

      <Section title="Chips and status">
        <div className="flex flex-wrap gap-2">
          <DocumentStatusLabel status="ready" />
          <DocumentStatusLabel status="processing" />
          <DocumentStatusLabel status="failed" />
          <TopicStatusLabel status="insufficient_data" />
          <TopicStatusLabel status="needs_revision" />
          <TopicStatusLabel status="practicing" />
          <TopicStatusLabel status="doing_well" />
          <Chip>Planned</Chip>
          <Chip tone="clay" icon={FileText}>
            Source
          </Chip>
        </div>
      </Section>

      <Section title="Citations">
        <p className="max-w-prose text-base">
          A deadlock occurs when processes wait for each other
          <CitationPill marker={1} title="OS Notes.pdf" page="page 45" snippet="Four conditions must hold at once for a deadlock." />. Hover or focus the pill.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <SourceCard marker={1} title="OS Notes.pdf" page="Page 45" snippet="Four conditions must hold at once: mutual exclusion, hold and wait, no preemption and circular wait." active />
          <SourceCard marker={2} title="Textbook chapter 7.pdf" page="Page 12" />
        </div>
      </Section>

      <Section title="Segmented tiles and progress">
        <div className="max-w-xl">
          <SegmentedTiles
            name="difficulty"
            legend="Difficulty"
            value={difficulty}
            onChange={setDifficulty}
            options={[
              { value: "beginner", label: "Beginner" },
              { value: "intermediate", label: "Intermediate" },
              { value: "advanced", label: "Advanced" },
            ]}
          />
          <div className="mt-6 flex flex-col gap-3">
            <ProgressBar value={30} label="Question 3 of 10" />
            <ProgressBar value={82} label="Accuracy" />
          </div>
        </div>
      </Section>

      <Section title="States">
        <div className="grid gap-4 md:grid-cols-2">
          <EmptyState title="No documents yet" icon={SearchX} action={<Button>Upload PDF</Button>}>
            Uploaded PDFs appear here once they are processed.
          </EmptyState>
          <ErrorBlock message="Could not load your documents. Check your connection and try again." onRetry={() => undefined} />
          <LoadingBlock label="Loading your dashboard" />
          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
          <Notice tone="info">Information</Notice>
          <Notice tone="success">Saved</Notice>
          <Notice tone="warning">Small test set (38 items). Results may not reflect real course material</Notice>
        </div>
      </Section>

      <Section title="Dialog">
        <Button variant="secondary" onClick={() => setDialog(true)}>
          Open confirm dialog
        </Button>
        <ConfirmDialog
          open={dialog}
          title="Delete OS Notes.pdf?"
          description="Its passages will be removed from your knowledge base. This cannot be undone."
          confirmLabel="Delete document"
          onConfirm={() => {
            setDialog(false);
            toast.show("Document deleted");
          }}
          onCancel={() => setDialog(false)}
        />
      </Section>
    </PageContainer>
  );
}
