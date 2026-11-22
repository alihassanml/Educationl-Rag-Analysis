/** Decides, from the microphone's loudness, when a student has started and finished an answer.
 *  Pure on purpose (no audio, no timers), so the rules can be tested exactly. */

export type SpeechState = "waiting" | "speaking" | "ended";

export type SpeechDetectorOptions = {
  /** Loudness (RMS, 0 to 1) above which the microphone counts as hearing speech */
  threshold?: number;
  /** Quiet time after speech that ends the answer */
  silenceMs?: number;
  /** Speech shorter than this is treated as a cough or a click, not an answer */
  minSpeechMs?: number;
};

export class SpeechDetector {
  private readonly threshold: number;
  private readonly silenceMs: number;
  private readonly minSpeechMs: number;
  private speechStart: number | null = null;
  private lastLoud = 0;
  private done = false;

  constructor({ threshold = 0.02, silenceMs = 1700, minSpeechMs = 400 }: SpeechDetectorOptions = {}) {
    this.threshold = threshold;
    this.silenceMs = silenceMs;
    this.minSpeechMs = minSpeechMs;
  }

  /** True once speech has been heard, even if the answer has not ended yet */
  get heard(): boolean {
    return this.speechStart !== null;
  }

  update(rms: number, now: number): SpeechState {
    if (this.done) return "ended";
    if (rms >= this.threshold) {
      this.speechStart ??= now;
      this.lastLoud = now;
      return "speaking";
    }
    if (this.speechStart === null) return "waiting";
    const spoke = this.lastLoud - this.speechStart;
    if (now - this.lastLoud >= this.silenceMs) {
      if (spoke >= this.minSpeechMs) {
        this.done = true;
        return "ended";
      }
      // A short noise: forget it and keep waiting for the real answer
      this.speechStart = null;
      return "waiting";
    }
    return "speaking";
  }
}

/** Root-mean-square loudness of a block of samples (-1 to 1) */
export function rms(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}
