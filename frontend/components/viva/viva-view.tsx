"use client";

import {
  AlertTriangle,
  Award,
  BookOpen,
  Clock,
  Mic,
  MicOff,
  RotateCcw,
  Volume2,
} from "lucide-react";
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

const DEFAULT_TIME_LIMIT_SECONDS = 90;

export function VivaView() {
  const [topic, setTopic] = useState("");
  const [activeSession, setActiveSession] = useState<VivaSessionDetail | null>(null);
  const sessions = useApi(vivaApi.sessions);
  const path = useApi(pathApi.get);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestedTopics = (path.data?.steps ?? []).map((s) => s.name).slice(0, 5);

  // Turn answer state
  const [answerText, setAnswerText] = useState("");
  const [timeLeft, setTimeLeft] = useState(DEFAULT_TIME_LIMIT_SECONDS);
  const [tabSwitches, setTabSwitches] = useState(0);

  // Audio recording state
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Timer countdown for active turns
  useEffect(() => {
    if (!activeSession || activeSession.status !== "in_progress") return;
    const limit = activeSession.time_limit_seconds ?? DEFAULT_TIME_LIMIT_SECONDS;
    const startTime = Date.now();
    const tick = () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.max(0, limit - elapsed);
      setTimeLeft(remaining);
      if (remaining === 0) clearInterval(timer);
    };
    const timer = setInterval(tick, 1000);
    const first = setTimeout(tick, 0); // show the full limit at the start of each question
    return () => {
      clearInterval(timer);
      clearTimeout(first);
    };
  }, [activeSession]);

  // Anti-cheating: visibilitychange tab-switch detection
  useEffect(() => {
    if (!activeSession || activeSession.status !== "in_progress") return;

    function handleVisibilityChange() {
      if (document.hidden) {
        setTabSwitches((c) => c + 1);
        if (activeSession) {
          vivaApi.tabSwitch(activeSession.id, 1).catch(() => {});
        }
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [activeSession]);

  async function handleStartSession(topicToUse?: string) {
    const chosen = (topicToUse || topic).trim();
    if (!chosen) return;
    try {
      setStarting(true);
      setError(null);
      const session = await vivaApi.start(chosen);
      setActiveSession(session);
      setTabSwitches(0);
      setAnswerText("");
      speakQuestion(session.current_turn?.question_text);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not start viva session. Make sure documents are uploaded.");
    } finally {
      setStarting(false);
    }
  }

  function speakQuestion(text?: string | null) {
    if (!text || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  }

  async function startRecording() {
    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        setError("Microphone not supported on this device. You can type your answer below.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        try {
          setTranscribing(true);
          const res = await vivaApi.transcribe(audioBlob, "answer.webm");
          setAnswerText((prev) => (prev ? `${prev} ${res.transcript}` : res.transcript));
        } catch {
          setError("Transcription failed. You can type or edit your answer.");
        } finally {
          setTranscribing(false);
        }
      };

      recorder.start();
      setRecording(true);
    } catch {
      setError("Microphone permission was denied. You can type your answer instead.");
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  }

  async function handleSubmitAnswer() {
    if (!activeSession || !activeSession.current_turn || !answerText.trim()) return;
    const isFollowUp = activeSession.current_turn.is_follow_up_pending;
    try {
      setSubmitting(true);
      setError(null);
      const updated = await vivaApi.answer(
        activeSession.id,
        activeSession.current_turn.turn_index,
        answerText.trim(),
        isFollowUp
      );
      setActiveSession(updated);
      setAnswerText("");

      if (updated.status === "in_progress") {
        if (updated.current_turn?.is_follow_up_pending) {
          speakQuestion(updated.current_turn.follow_up_question);
        } else {
          speakQuestion(updated.current_turn?.question_text);
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to submit answer");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Viva bot"
        description="Cheating-proof oral exam with follow-up probing and rubric scoring"
      />

      <div className="flex flex-col gap-6">
        {error ? <ErrorBlock message={error} onRetry={() => setError(null)} /> : null}

        {/* 1. Start Screen */}
        {!activeSession ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="flex flex-col gap-6 lg:col-span-2">
              <Panel
                title="Start an oral examination"
                description="The bot will ask 5 questions with follow-ups, graded strictly from your course notes."
              >
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-ink-2">Exam topic</label>
                    <input
                      type="text"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder="e.g. Recursion, Dynamic Programming..."
                      className="mt-1.5 w-full rounded-control border border-stone bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none"
                    />
                  </div>

                  {suggestedTopics.length > 0 ? (
                    <div>
                      <span className="text-xs text-ink-3">From your Course Map:</span>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {suggestedTopics.map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setTopic(t)}
                            className="rounded-full bg-stone-100 px-3 py-1 text-xs text-ink hover:bg-clay-soft"
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-control bg-stone-50 p-3.5 text-xs text-ink-2 space-y-1.5">
                    <p className="font-semibold text-ink">Exam guidelines:</p>
                    <p>• 5 oral conceptual questions tailored from your uploaded documents.</p>
                    <p>• Each question has 1 probing follow-up testing real understanding.</p>
                    <p>• Speak with your microphone or type your response. 90s time limit per turn.</p>
                    <p>• Tab switches and copy/paste are detected to maintain academic integrity.</p>
                  </div>

                  <Button
                    onClick={() => handleStartSession()}
                    disabled={!topic.trim() || starting}
                    loading={starting}
                    variant="primary"
                    size="lg"
                  >
                    <Mic size={18} className="mr-2" aria-hidden="true" />
                    Begin oral exam
                  </Button>
                </div>
              </Panel>
            </div>

            {/* Past sessions history */}
            <div>
              <Panel title="Past viva exams">
                {sessions.loading ? (
                  <LoadingBlock label="Loading history..." />
                ) : (sessions.data ?? []).length === 0 ? (
                  <p className="py-6 text-center text-sm text-ink-2">No completed exams yet.</p>
                ) : (
                  <div className="divide-y divide-stone">
                    {(sessions.data ?? []).map((s) => (
                      <div
                        key={s.id}
                        onClick={async () => {
                          const detail = await vivaApi.session(s.id);
                          setActiveSession(detail);
                        }}
                        className="cursor-pointer py-3 first:pt-0 last:pb-0 hover:bg-stone-50 rounded-control p-2 -mx-2 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm text-ink">{s.topic_name}</span>
                          <span className="text-xs font-semibold text-ink">
                            {s.total_score}/{s.max_score}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-xs text-ink-3">
                          <span>{formatDate(s.created_at)}</span>
                          {s.tab_switch_count > 0 ? (
                            <span className="text-danger flex items-center gap-1 text-[11px]">
                              <AlertTriangle size={12} /> {s.tab_switch_count} switches
                            </span>
                          ) : (
                            <span className="text-success text-[11px]">Clean</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          </div>
        ) : null}

        {/* 2. Active Exam Screen */}
        {activeSession && activeSession.status === "in_progress" && activeSession.current_turn ? (
          <div className="max-w-3xl mx-auto w-full space-y-6">
            {/* Top Bar: Turn indicator, timer, and tab-switch warning */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-panel border border-stone bg-paper p-4">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-ink">
                  Question {activeSession.current_turn.turn_index + 1} of {activeSession.total_turns}
                </span>
                <Chip tone={activeSession.current_turn.is_follow_up_pending ? "clay" : "neutral"}>
                  {activeSession.current_turn.is_follow_up_pending ? "Follow-up Probe" : "Main Question"}
                </Chip>
              </div>

              <div className="flex items-center gap-4">
                <span
                  className={cn(
                    "flex items-center gap-1.5 font-mono text-sm font-semibold",
                    timeLeft < 20 ? "text-danger animate-pulse" : "text-ink"
                  )}
                >
                  <Clock size={16} aria-hidden="true" />
                  {timeLeft}s
                </span>

                {tabSwitches > 0 ? (
                  <span className="flex items-center gap-1 text-xs text-danger font-medium bg-danger/10 px-2.5 py-1 rounded-full">
                    <AlertTriangle size={14} /> {tabSwitches} tab switch{tabSwitches > 1 ? "es" : ""} logged
                  </span>
                ) : null}
              </div>
            </div>

            {/* Question Card */}
            <div className="rounded-panel border border-stone bg-paper p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-accent">
                    {activeSession.current_turn.is_follow_up_pending ? "Follow-up Question" : "Oral Question"}
                  </span>
                  <h2 className="text-lg font-semibold text-ink leading-snug">
                    {activeSession.current_turn.is_follow_up_pending
                      ? activeSession.current_turn.follow_up_question
                      : activeSession.current_turn.question_text}
                  </h2>
                </div>
                <button
                  type="button"
                  aria-label="Speak question"
                  onClick={() =>
                    speakQuestion(
                      activeSession.current_turn?.is_follow_up_pending
                        ? activeSession.current_turn.follow_up_question
                        : activeSession.current_turn?.question_text
                    )
                  }
                  className="rounded-full p-2.5 text-ink-2 hover:bg-stone-100 hover:text-ink shrink-0"
                >
                  <Volume2 size={20} aria-hidden="true" />
                </button>
              </div>

              {activeSession.current_turn.is_follow_up_pending && activeSession.current_turn.student_answer ? (
                <div className="mt-4 rounded-control bg-stone-50 p-3 text-xs text-ink-2 border border-stone/50">
                  <span className="font-semibold text-ink">Your initial response: </span>
                  {activeSession.current_turn.student_answer}
                </div>
              ) : null}
            </div>

            {/* Answer Input Area: Voice & Text */}
            <div className="rounded-panel border border-stone bg-paper p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink">Your response</span>
                <div className="flex items-center gap-2">
                  {recording ? (
                    <Button size="sm" variant="danger" onClick={stopRecording}>
                      <MicOff size={16} className="mr-1.5" /> Stop recording
                    </Button>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={startRecording} disabled={transcribing}>
                      <Mic size={16} className="mr-1.5" /> Speak answer
                    </Button>
                  )}
                </div>
              </div>

              {recording ? (
                <div className="flex items-center justify-center gap-2 py-4 bg-danger/5 rounded-control text-danger text-sm font-medium">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-danger"></span>
                  </span>
                  Recording audio... Click stop when finished.
                </div>
              ) : null}

              {transcribing ? (
                <div className="py-2 text-center text-xs text-ink-2 animate-pulse">
                  Transcribing your audio with Whisper...
                </div>
              ) : null}

              <textarea
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                onPaste={(e) => {
                  e.preventDefault();
                  setError("Copying and pasting is disabled during the viva examination.");
                }}
                rows={4}
                placeholder="Speak using the microphone or type your answer in your own words..."
                className="w-full rounded-control border border-stone bg-paper p-3 text-sm text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none"
              />

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-ink-3">
                  Graded on accuracy, completeness, and explaining in your own words.
                </span>
                <Button
                  onClick={handleSubmitAnswer}
                  disabled={!answerText.trim() || submitting}
                  loading={submitting}
                  variant="primary"
                >
                  {activeSession.current_turn.is_follow_up_pending
                    ? "Submit & Grade Turn"
                    : "Submit & Get Follow-up"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {/* 3. Completed Exam Report */}
        {activeSession && activeSession.status === "completed" ? (
          <div className="max-w-3xl mx-auto w-full space-y-6">
            <div className="rounded-panel border border-stone bg-paper p-6 text-center space-y-4">
              <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-clay text-ink">
                <Award size={32} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-ink">Oral Exam Completed</h2>
                <p className="mt-1 text-sm text-ink-2">{activeSession.topic_name}</p>
              </div>

              <div className="inline-flex items-center gap-6 rounded-control bg-stone-50 px-6 py-3 border border-stone">
                <div>
                  <span className="text-xs text-ink-3 uppercase font-medium">Final Score</span>
                  <p className="text-2xl font-bold text-ink">
                    {activeSession.total_score} / {activeSession.max_score}
                  </p>
                </div>
                <div className="h-8 w-px bg-stone" />
                <div>
                  <span className="text-xs text-ink-3 uppercase font-medium">Integrity Log</span>
                  <p className={cn("text-sm font-semibold", activeSession.tab_switch_count > 0 ? "text-danger" : "text-success")}>
                    {activeSession.tab_switch_count === 0 ? "0 tab switches" : `${activeSession.tab_switch_count} tab switches`}
                  </p>
                </div>
              </div>

              {activeSession.overall_feedback ? (
                <p className="text-sm text-ink-2 max-w-lg mx-auto">{activeSession.overall_feedback}</p>
              ) : null}

              <div className="pt-2">
                <Button
                  variant="primary"
                  onClick={() => {
                    setActiveSession(null);
                    sessions.reload();
                  }}
                >
                  <RotateCcw size={16} className="mr-2" /> Start another viva
                </Button>
              </div>
            </div>

            {/* Weak points: the questions that scored under half marks */}
            {activeSession.completed_turns.some((t) => t.grade_score < 3) ? (
              <Panel title="Weak points to revise">
                <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink">
                  {activeSession.completed_turns
                    .filter((t) => t.grade_score < 3)
                    .map((t) => (
                      <li key={t.turn_index}>
                        {t.question_text}
                        {t.sources?.[0] ? (
                          <span className="text-ink-3"> ({t.sources[0].document_title}, p. {t.sources[0].page_number ?? 1})</span>
                        ) : null}
                      </li>
                    ))}
                </ul>
              </Panel>
            ) : null}

            {/* Question Breakdown and Rubric Report */}
            <Panel title="Rubric evaluation & feedback">
              <div className="space-y-6">
                {activeSession.completed_turns.map((turn, idx) => (
                  <div key={turn.turn_index} className="rounded-control border border-stone bg-stone-50/50 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-ink text-sm">
                        Q{idx + 1}: {turn.question_text}
                      </h3>
                      <span className="rounded-full bg-clay px-2.5 py-0.5 text-xs font-bold text-ink">
                        {turn.grade_score} / 6
                      </span>
                    </div>

                    <div className="text-xs space-y-2 text-ink-2">
                      <p>
                        <strong className="text-ink">Initial answer: </strong>
                        {turn.student_answer || "(None)"}
                      </p>
                      {turn.follow_up_question ? (
                        <p>
                          <strong className="text-ink">Follow-up: </strong>
                          {turn.follow_up_question}
                        </p>
                      ) : null}
                      {turn.follow_up_answer ? (
                        <p>
                          <strong className="text-ink">Follow-up answer: </strong>
                          {turn.follow_up_answer}
                        </p>
                      ) : null}
                    </div>

                    {/* Rubric scores */}
                    <div className="grid grid-cols-3 gap-2 border-y border-stone py-2 text-xs">
                      <div>
                        <span className="text-ink-3">Accuracy:</span>{" "}
                        <strong className="text-ink">{turn.grade_accuracy}/2</strong>
                      </div>
                      <div>
                        <span className="text-ink-3">Completeness:</span>{" "}
                        <strong className="text-ink">{turn.grade_completeness}/2</strong>
                      </div>
                      <div>
                        <span className="text-ink-3">Own words:</span>{" "}
                        <strong className="text-ink">{turn.grade_own_words}/2</strong>
                      </div>
                    </div>

                    <div className="text-xs text-ink">
                      <span className="font-semibold">Examiner feedback: </span>
                      {turn.grade_feedback}
                    </div>

                    {turn.ideal_answer ? (
                      <div className="rounded bg-paper p-2.5 text-xs border border-stone text-ink-2">
                        <span className="font-semibold text-ink">Model answer key: </span>
                        {turn.ideal_answer}
                      </div>
                    ) : null}

                    {turn.sources && turn.sources.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-ink-3">
                        <BookOpen size={12} />
                        <span>Sources cited: </span>
                        {turn.sources.map((s, i) => (
                          <span key={i} className="font-medium text-ink-2">
                            {s.document_title} (p. {s.page_number || 1})
                            {i < turn.sources.length - 1 ? ", " : ""}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        ) : null}
      </div>
    </PageContainer>
  );
}
