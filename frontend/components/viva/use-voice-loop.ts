"use client";

/* The effects below exist to drive browser speech and microphone APIs, so they start and stop them
   and mirror their state into React state; that is the case the rule allows for. */
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useRef, useState } from "react";
import { rms, SpeechDetector } from "@/lib/speech-detector";

/** What the bot is doing right now: speaking a question, listening for the answer, or turning
 *  the recording into text. "idle" means waiting (typing, paused, or between turns). */
export type VoicePhase = "idle" | "speaking" | "listening" | "transcribing";

/** Sent when time runs out with nothing said, so the turn is still graded (as a miss) */
export const NO_ANSWER = "(no answer)";

type Options = {
  /** Changes with every question the bot asks; the loop restarts when it changes. Null = no turn. */
  turnKey: string | null;
  /** The question to read aloud */
  prompt: string | null;
  /** Hands-free mode: speak, then listen, then submit, without any click */
  voiceOn: boolean;
  timeLimitSeconds: number;
  transcribe: (audio: Blob, filename: string) => Promise<string>;
  /** The finished answer, from speech. The page submits it and the next turn starts the loop again. */
  onAnswer: (text: string) => void;
  /** Time ran out while the student was typing (or paused) */
  onTimeUp: () => void;
  onProblem: (message: string) => void;
};

function extensionFor(mime: string): string {
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

/** Speak `text`, then call `done` once. A safety timer covers browsers that never fire "end". */
function speak(text: string, done: () => void): () => void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    done();
    return () => undefined;
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(safety);
    done();
  };
  const words = text.split(/\s+/).length;
  const safety = setTimeout(finish, Math.max(4000, words * 600 + 3000));
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.onend = finish;
  utterance.onerror = finish;
  synth.speak(utterance);
  return () => {
    finished = true;
    clearTimeout(safety);
    synth.cancel();
  };
}

export function useVoiceLoop(options: Options) {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [level, setLevel] = useState(0);
  const [micReady, setMicReady] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(options.timeLimitSeconds);
  const [deadline, setDeadline] = useState<number | null>(null);

  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<{ ctx: AudioContext; analyser: AnalyserNode } | null>(null);
  const stopSpeaking = useRef<(() => void) | null>(null);
  const listening = useRef<{ finish: () => void; cancel: () => void } | null>(null);
  const deadlineRef = useRef<number | null>(null);
  const spokenKey = useRef<string | null>(null);
  const phaseRef = useRef<VoicePhase>("idle");
  const listenAgain = useRef<() => void>(() => undefined);

  const changePhase = useCallback((next: VoicePhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const startClock = useCallback(() => {
    const at = Date.now() + latest.current.timeLimitSeconds * 1000;
    deadlineRef.current = at;
    setDeadline(at);
  }, []);

  const stopClock = useCallback(() => {
    deadlineRef.current = null;
    setDeadline(null);
  }, []);

  const stopAll = useCallback(() => {
    stopSpeaking.current?.();
    stopSpeaking.current = null;
    listening.current?.cancel();
    listening.current = null;
    setLevel(0);
  }, []);

  /** Ask for the microphone. Call it from the click that starts the exam: browsers only allow it,
   *  and later speech, after a click. Returns false when voice cannot be used. */
  const openMic = useCallback(async (): Promise<boolean> => {
    if (streamRef.current) return true;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      latest.current.onProblem("This browser cannot record audio. Type your answers instead.");
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      void ctx.resume();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      streamRef.current = stream;
      audioRef.current = { ctx, analyser };
      setMicReady(true);
      return true;
    } catch {
      latest.current.onProblem("Microphone access was blocked. Type your answers instead.");
      return false;
    }
  }, []);

  const closeMic = useCallback(() => {
    stopAll();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioRef.current?.ctx.close().catch(() => undefined);
    audioRef.current = null;
    setMicReady(false);
  }, [stopAll]);

  const listen = useCallback(() => {
    const stream = streamRef.current;
    const audio = audioRef.current;
    if (!stream || !audio) return;
    changePhase("listening");
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    const detector = new SpeechDetector();
    const samples = new Float32Array(audio.analyser.fftSize);
    let cancelled = false;
    let stopped = false;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      clearInterval(meter);
      setLevel(0);
      listening.current = null;
      if (cancelled) return;
      if (!detector.heard) {
        // Time ran out in silence
        stopClock();
        changePhase("idle");
        latest.current.onAnswer(NO_ANSWER);
        return;
      }
      changePhase("transcribing");
      const type = recorder.mimeType || "audio/webm";
      latest.current
        .transcribe(new Blob(chunks, { type }), `answer.${extensionFor(type)}`)
        .then((text) => {
          if (cancelled) return;
          const heard = text.trim();
          if (heard) {
            stopClock();
            changePhase("idle");
            latest.current.onAnswer(heard);
          } else if ((deadlineRef.current ?? 0) - Date.now() > 3000) {
            listenAgain.current(); // only noise was heard: keep listening while there is time
          } else {
            stopClock();
            changePhase("idle");
            latest.current.onAnswer(NO_ANSWER);
          }
        })
        .catch(() => {
          if (cancelled) return;
          changePhase("idle");
          latest.current.onProblem("The recording could not be turned into text. Type your answer instead.");
        });
    };

    const finish = () => {
      if (stopped) return;
      stopped = true;
      if (recorder.state !== "inactive") recorder.stop();
    };
    const meter = setInterval(() => {
      audio.analyser.getFloatTimeDomainData(samples);
      const loudness = rms(samples);
      setLevel(Math.min(1, loudness * 10));
      if (detector.update(loudness, Date.now()) === "ended") finish();
    }, 100);
    listening.current = {
      finish,
      cancel: () => {
        cancelled = true;
        finish();
      },
    };
    recorder.start();
  }, [changePhase, stopClock]);

  useEffect(() => {
    listenAgain.current = listen;
  }, [listen]);

  // A new question: read it aloud, then listen, with no click in between
  const turnKey = options.turnKey;
  useEffect(() => {
    if (!turnKey) return;
    let cancelled = false;
    stopClock();
    const begin = () => {
      if (cancelled) return;
      startClock();
      if (latest.current.voiceOn && streamRef.current) listen();
      else changePhase("idle");
    };
    const { voiceOn, prompt } = latest.current;
    if (voiceOn && prompt && streamRef.current) {
      spokenKey.current = turnKey;
      changePhase("speaking");
      stopSpeaking.current = speak(prompt, begin);
    } else {
      begin();
    }
    return () => {
      cancelled = true;
      stopAll();
    };
  }, [turnKey, listen, startClock, stopClock, stopAll, changePhase]);

  // Pause or resume the hands-free mode in the middle of a question
  const voiceOn = options.voiceOn;
  useEffect(() => {
    if (!turnKey) return;
    if (!voiceOn) {
      stopAll();
      changePhase("idle");
      if (deadlineRef.current === null) startClock();
    } else if (phaseRef.current === "idle" && streamRef.current && deadlineRef.current !== null) {
      listen();
    }
    // Only a change of voice mode matters here; a new question is handled above
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceOn]);

  // The countdown for the current question
  useEffect(() => {
    if (deadline === null) return;
    let fired = false;
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left > 0 || fired) return;
      fired = true;
      if (listening.current) listening.current.finish();
      else if (phaseRef.current === "idle") latest.current.onTimeUp();
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [deadline]);

  // Release the microphone when the page closes
  useEffect(() => closeMic, [closeMic]);

  /** Ask the question again, then listen again */
  const repeat = useCallback(() => {
    const { prompt, voiceOn: on } = latest.current;
    if (!prompt || !on || !streamRef.current) return;
    stopAll();
    changePhase("speaking");
    stopSpeaking.current = speak(prompt, () => {
      if (deadlineRef.current === null) startClock();
      listen();
    });
  }, [stopAll, changePhase, startClock, listen]);

  /** The page is submitting an answer by another route (typing): stop listening and the clock */
  const hold = useCallback(() => {
    stopAll();
    stopClock();
    changePhase("idle");
  }, [stopAll, stopClock, changePhase]);

  return { phase, level, secondsLeft, micReady, openMic, closeMic, repeat, hold };
}
