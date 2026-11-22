import { describe, expect, it } from "vitest";
import { rms, SpeechDetector } from "@/lib/speech-detector";

describe("SpeechDetector", () => {
  it("waits while it is quiet", () => {
    const d = new SpeechDetector();
    expect(d.update(0, 0)).toBe("waiting");
    expect(d.update(0.001, 5000)).toBe("waiting");
    expect(d.heard).toBe(false);
  });

  it("ends the answer after enough silence once speech was heard", () => {
    const d = new SpeechDetector({ silenceMs: 1500 });
    expect(d.update(0.1, 0)).toBe("speaking");
    expect(d.update(0.1, 800)).toBe("speaking");
    expect(d.update(0, 1500)).toBe("speaking"); // a pause inside the answer
    expect(d.update(0, 2200)).toBe("speaking");
    expect(d.update(0, 2300)).toBe("ended"); // 1500 ms after the last loud moment
    expect(d.heard).toBe(true);
    expect(d.update(0.5, 3000)).toBe("ended"); // stays ended
  });

  it("does not end an answer in the middle of a sentence", () => {
    const d = new SpeechDetector({ silenceMs: 1700 });
    d.update(0.1, 0);
    d.update(0.1, 1000);
    expect(d.update(0, 2000)).toBe("speaking");
    expect(d.update(0.1, 2500)).toBe("speaking"); // the student carries on
    expect(d.update(0, 4000)).toBe("speaking");
  });

  it("ignores a cough: speech shorter than the minimum is forgotten", () => {
    const d = new SpeechDetector({ minSpeechMs: 400, silenceMs: 1000 });
    d.update(0.2, 0);
    d.update(0.2, 100);
    expect(d.update(0, 1200)).toBe("waiting");
    expect(d.heard).toBe(false);
  });
});

describe("rms", () => {
  it("measures loudness", () => {
    expect(rms([])).toBe(0);
    expect(rms([0, 0, 0])).toBe(0);
    expect(rms([0.5, -0.5, 0.5, -0.5])).toBeCloseTo(0.5);
  });
});
