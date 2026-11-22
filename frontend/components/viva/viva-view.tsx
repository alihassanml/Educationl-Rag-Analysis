"use client";

import { useEffect, useRef, useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { ErrorBlock, LoadingBlock } from "@/components/ui/feedback";
import { Panel } from "@/components/ui/panel";
import { pathApi, vivaApi } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/formatters";
import { useApi } from "@/lib/use-api";
import type { VivaSessionDetail } from "@/types/api";
import { NO_ANSWER, useVoiceLoop, type VoicePhase } from "./use-voice-loop";

const DEFAULT_TIME_LIMIT_SECONDS = 90;

const PHASE_LABEL: Record<VoicePhase, string> = {
  idle: "",
  speaking: "Asking the question",
  listening: "Listening",
  transcribing: "Writing down your answer",
};

/** The question to answer right now: the follow-up when one is pending, else the main question */
function promptOf(session: VivaSessionDetail | null): string | null {
  const turn = session?.status === "in_progress" ? session.current_turn : null;
  if (!turn) return null;
  return (turn.is_follow_up_pending ? turn.follow_up_question : turn.question_text) ?? null;
}

function Meter({ level, active }: { level: number; active: boolean }) {
  return (
    <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-stone-100" aria-hidden="true">
      <div className={cn("h-full rounded-full bg-clay-strong transition-[width] duration-100", !active && "opacity-0")} style={{ width: `${Math.round(level * 100)}%` }} />
    </div>
  );
}

export function VivaView() {
  const [topic, setTopic] = useState("");
  const [session, setSession] = useState<VivaSessionDetail | null>(null);
  const sessions = useApi(vivaApi.sessions);
  const path = useApi(pathApi.get);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceOn, setVoiceOn] = useState(true);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const [lastAnswer, setLastAnswer] = useState("");
  const [tabSwitches, setTabSwitches] = useState(0);
  const busy = useRef(false);

  const suggested = (path.data?.steps ?? []).map((s) => s.name).slice(0, 4);
  const inProgress = session?.status === "in_progress" && session.current_turn ? session : null;
  const turn = inProgress?.current_turn ?? null;
  const followUp = Boolean(turn?.is_follow_up_pending);
  const prompt = promptOf(session);
  const turnKey = inProgress && turn ? `${inProgress.id}:${turn.turn_index}:${followUp ? "f" : "q"}` : null;

  const voice = useVoiceLoop({
    turnKey,
    prompt,
    voiceOn,
    timeLimitSeconds: inProgress?.time_limit_seconds ?? DEFAULT_TIME_LIMIT_SECONDS,
    transcribe: async (audio, filename) => (await vivaApi.transcribe(audio, filename)).transcript,
    onAnswer: (text) => void submit(text),
    onTimeUp: () => void submit(typed.trim() || NO_ANSWER),
    onProblem: (message) => {
      setError(message);
      setVoiceOn(false);
    },
  });

  // Count the times the student leaves the page during the exam
  useEffect(() => {
    if (!inProgress) return;
    const id = inProgress.id;
    function onVisibility() {
      if (!document.hidden) return;
      setTabSwitches((n) => n + 1);
      vivaApi.tabSwitch(id, 1).catch(() => undefined);
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [inProgress]);

  // The microphone is only needed during an exam
  const { closeMic } = voice;
  const examOver = session !== null && session.status !== "in_progress";
  useEffect(() => {
    if (examOver) closeMic();
  }, [examOver, closeMic]);

  async function begin(chosen?: string) {
    const name = (chosen ?? topic).trim();
    if (!name || starting) return;
    setStarting(true);
    setError(null);
    // This click is what lets the browser open the microphone and speak the questions
    const micOk = await voice.openMic();
    setVoiceOn(micOk);
    setTyping(!micOk);
    try {
      const started = await vivaApi.start(name);
      setTabSwitches(0);
      setTyped("");
      setLastAnswer("");
      setSession(started);
    } catch (err) {
      voice.closeMic();
      setError(err instanceof Error ? err.message : "Could not start. Add a document first.");
    } finally {
      setStarting(false);
    }
  }

  async function submit(answer: string) {
    if (!inProgress || !turn || busy.current) return;
    busy.current = true;
    voice.hold();
    setSubmitting(true);
    setError(null);
    setLastAnswer(answer === NO_ANSWER ? "" : answer);
    try {
      const updated = await vivaApi.answer(inProgress.id, turn.turn_index, answer, followUp);
      setTyped("");
      setSession(updated);
      if (updated.status !== "in_progress") sessions.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the answer");
      setVoiceOn(false);
      setTyping(true);
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }

  function chooseTyping() {
    setTyping(true);
    setVoiceOn(false);
  }

  function chooseVoice() {
    setTyping(false);
    setVoiceOn(true);
  }

  return (
    <PageContainer>
      <PageHeader title="Viva bot" />
      <div className="flex flex-col gap-4">
        {error ? <ErrorBlock message={error} onRetry={() => setError(null)} /> : null}

        {!session ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="New exam">
              <form
                className="flex flex-col gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void begin();
                }}
              >
                <label className="flex flex-col gap-1.5">
                  <span className="font-medium text-ink">Topic</span>
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="For example, Recursion"
                    className="h-11 rounded-control border border-stone-strong bg-paper px-3 text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none"
                  />
                </label>
                {suggested.length > 0 ? (
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Suggested topics">
                    {suggested.map((t) => (
                      <button key={t} type="button" onClick={() => setTopic(t)} className="h-9 rounded-full bg-stone-100 px-4 text-sm text-ink hover:bg-clay-soft">
                        {t}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="submit" size="lg" disabled={!topic.trim()} loading={starting}>
                    Start exam
                  </Button>
                  <span className="text-ink-2">Answer out loud. It listens after each question.</span>
                </div>
              </form>
            </Panel>

            <Panel title="Past exams">
              {sessions.loading ? (
                <LoadingBlock label="Loading" />
              ) : (sessions.data ?? []).length === 0 ? (
                <p className="py-4 text-ink-2">No exams yet.</p>
              ) : (
                <ul className="divide-y divide-stone">
                  {(sessions.data ?? []).map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={async () => setSession(await vivaApi.session(s.id))}
                        className="-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-control px-2 py-3 text-left hover:bg-stone-100"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink">{s.topic_name}</span>
                          <span className="block text-ink-2">{formatDate(s.created_at)}</span>
                        </span>
                        <span className="shrink-0 font-semibold text-ink">
                          {s.total_score}/{s.max_score}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        ) : null}

        {inProgress && turn ? (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <p className="flex items-center gap-3 font-medium text-ink">
                Question {turn.turn_index + 1} of {inProgress.total_turns}
                {followUp ? <Chip tone="clay">Follow-up</Chip> : null}
              </p>
              <p className={cn("text-page font-semibold tabular-nums", voice.secondsLeft <= 15 ? "text-danger" : "text-ink")} aria-label="Seconds left">
                {voice.secondsLeft}s
              </p>
            </div>

            <section className="flex flex-col gap-5 rounded-panel border border-stone bg-paper p-6 sm:p-8">
              <h2 className="text-2xl font-semibold leading-snug tracking-tight text-ink">{prompt}</h2>

              <div className="flex min-h-12 flex-col gap-2" aria-live="polite">
                {submitting ? (
                  <p className="font-medium text-ink">Checking your answer</p>
                ) : voice.phase !== "idle" ? (
                  <>
                    <p className="font-medium text-ink">{PHASE_LABEL[voice.phase]}</p>
                    <Meter level={voice.level} active={voice.phase === "listening"} />
                  </>
                ) : typing ? (
                  <p className="text-ink-2">Type your answer</p>
                ) : (
                  <p className="text-ink-2">Voice is paused</p>
                )}
                {lastAnswer && (submitting || voice.phase === "transcribing") ? <p className="text-ink-2">You said: {lastAnswer}</p> : null}
              </div>

              {typing ? (
                <div className="flex flex-col gap-3">
                  <textarea
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    onPaste={(e) => {
                      e.preventDefault();
                      setError("Pasting is turned off during the exam.");
                    }}
                    rows={4}
                    aria-label="Your answer"
                    placeholder="Your answer"
                    className="w-full rounded-control border border-stone-strong bg-paper p-3 text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none"
                  />
                  <div>
                    <Button onClick={() => void submit(typed.trim())} disabled={!typed.trim() || submitting} loading={submitting}>
                      Send answer
                    </Button>
                  </div>
                </div>
              ) : null}
            </section>

            <div className="flex flex-wrap gap-2">
              {voice.micReady ? (
                <>
                  <Button variant="secondary" onClick={() => (voiceOn ? setVoiceOn(false) : chooseVoice())}>
                    {voiceOn ? "Pause voice" : "Resume voice"}
                  </Button>
                  <Button variant="secondary" onClick={voice.repeat} disabled={!voiceOn || submitting}>
                    Repeat question
                  </Button>
                </>
              ) : null}
              <Button variant="secondary" onClick={typing ? chooseVoice : chooseTyping} disabled={!voice.micReady && !typing}>
                {typing ? "Use voice" : "Type instead"}
              </Button>
              {tabSwitches > 0 ? <span className="self-center text-danger">{tabSwitches} tab switches logged</span> : null}
            </div>
          </div>
        ) : null}

        {session?.status === "completed" ? <Report session={session} onDone={() => { setSession(null); sessions.reload(); }} /> : null}
      </div>
    </PageContainer>
  );
}

function Report({ session, onDone }: { session: VivaSessionDetail; onDone: () => void }) {
  const weak = session.completed_turns.filter((t) => t.grade_score < 3);
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-panel bg-clay-300 p-6">
        <div>
          <p className="text-ink">{session.topic_name}</p>
          <p className="text-metric font-semibold tracking-tight text-ink">
            {session.total_score} / {session.max_score}
          </p>
          <p className={cn("mt-1", session.tab_switch_count > 0 ? "text-danger" : "text-ink")}>
            {session.tab_switch_count === 0 ? "No tab switches" : `${session.tab_switch_count} tab switches`}
          </p>
        </div>
        <Button onClick={onDone}>New exam</Button>
      </section>

      {session.overall_feedback ? <Panel title="Summary">{session.overall_feedback}</Panel> : null}

      {weak.length > 0 ? (
        <Panel title="To revise">
          <ul className="flex flex-col gap-2">
            {weak.map((t) => (
              <li key={t.turn_index} className="text-ink">
                {t.question_text}
                {t.sources?.[0] ? <span className="text-ink-2"> ({t.sources[0].document_title}, p. {t.sources[0].page_number ?? 1})</span> : null}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel title="Question by question">
        <ol className="divide-y divide-stone">
          {session.completed_turns.map((turn, i) => (
            <li key={turn.turn_index} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-4">
                <h3 className="font-semibold text-ink">
                  {i + 1}. {turn.question_text}
                </h3>
                <Chip tone={turn.grade_score >= 3 ? "success" : "warning"}>{turn.grade_score} / 6</Chip>
              </div>
              <p className="text-ink-2">
                <span className="font-medium text-ink">Your answer: </span>
                {turn.student_answer || "None"}
              </p>
              {turn.follow_up_question ? (
                <p className="text-ink-2">
                  <span className="font-medium text-ink">Follow-up: </span>
                  {turn.follow_up_question} {turn.follow_up_answer ? `— ${turn.follow_up_answer}` : ""}
                </p>
              ) : null}
              <p className="text-ink-2">
                Accuracy {turn.grade_accuracy}/2 · Completeness {turn.grade_completeness}/2 · Own words {turn.grade_own_words}/2
              </p>
              <p className="text-ink">{turn.grade_feedback}</p>
              {turn.ideal_answer ? (
                <p className="rounded-control bg-stone-100 p-3 text-ink-2">
                  <span className="font-medium text-ink">Model answer: </span>
                  {turn.ideal_answer}
                </p>
              ) : null}
              {turn.sources && turn.sources.length > 0 ? (
                <p className="text-ink-2">Sources: {turn.sources.map((s) => `${s.document_title} p. ${s.page_number || 1}`).join(", ")}</p>
              ) : null}
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}
