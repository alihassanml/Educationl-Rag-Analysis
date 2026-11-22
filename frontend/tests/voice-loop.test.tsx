import { act, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NO_ANSWER, useVoiceLoop } from "@/components/viva/use-voice-loop";

// The browser pieces the loop drives, replaced by stand-ins we control
let loudness = 0;
let spoken: string[] = [];

class FakeRecorder {
  state = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["audio"]) });
    this.onstop?.();
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  loudness = 0;
  spoken = [];
  const stream = { getTracks: () => [{ stop: vi.fn() }] };
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  vi.stubGlobal(
    "AudioContext",
    class {
      resume = vi.fn().mockResolvedValue(undefined);
      close = vi.fn().mockResolvedValue(undefined);
      createAnalyser() {
        return { fftSize: 1024, getFloatTimeDomainData: (a: Float32Array) => a.fill(loudness) };
      }
      createMediaStreamSource() {
        return { connect: vi.fn() };
      }
    },
  );
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public text: string) {}
    },
  );
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: {
      cancel: vi.fn(),
      speak: (u: { text: string; onend: (() => void) | null }) => {
        spoken.push(u.text);
        setTimeout(() => u.onend?.(), 50); // the bot "finishes speaking" a moment later
      },
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function Harness({ transcribe, onAnswer, limit = 90 }: { transcribe: (b: Blob) => Promise<string>; onAnswer: (t: string) => void; limit?: number }) {
  const [turn, setTurn] = useState(0);
  const voice = useVoiceLoop({
    turnKey: turn > 0 ? `turn-${turn}` : null,
    prompt: `Question ${turn}`,
    voiceOn: true,
    timeLimitSeconds: limit,
    transcribe,
    onAnswer: (text) => {
      onAnswer(text);
      setTurn((t) => t + 1); // the page moves on to the next question once an answer is accepted
    },
    onTimeUp: vi.fn(),
    onProblem: vi.fn(),
  });
  return (
    <div>
      <button
        onClick={async () => {
          await voice.openMic();
          setTurn(1);
        }}
      >
        Start
      </button>
      <p data-testid="phase">{voice.phase}</p>
      <p data-testid="left">{voice.secondsLeft}</p>
    </div>
  );
}

const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const phase = () => screen.getByTestId("phase").textContent;

describe("hands-free voice loop", () => {
  it("asks, listens, sends the answer and asks the next question after a single click", async () => {
    const transcribe = vi.fn().mockResolvedValue("a base case stops the calls");
    const onAnswer = vi.fn();
    render(<Harness transcribe={transcribe} onAnswer={onAnswer} />);

    await act(async () => screen.getByText("Start").click()); // the only click
    expect(spoken).toEqual(["Question 1"]);
    expect(phase()).toBe("speaking");

    await advance(100); // the bot finishes speaking
    expect(phase()).toBe("listening");

    loudness = 0.1; // the student talks for a second
    await advance(1000);
    expect(onAnswer).not.toHaveBeenCalled(); // still talking: nothing is sent early
    loudness = 0; // and stops
    await advance(2000);

    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith("a base case stops the calls");

    // Next question starts by itself, with no click
    await advance(200);
    expect(spoken).toEqual(["Question 1", "Question 2"]);
    expect(phase()).toBe("listening");
  });

  it("keeps listening when the recording only held noise", async () => {
    const transcribe = vi.fn().mockResolvedValueOnce("   ").mockResolvedValue("finally an answer");
    const onAnswer = vi.fn();
    render(<Harness transcribe={transcribe} onAnswer={onAnswer} />);
    await act(async () => screen.getByText("Start").click());
    await advance(100);
    loudness = 0.1;
    await advance(1000);
    loudness = 0;
    await advance(2000);
    expect(onAnswer).not.toHaveBeenCalled();
    expect(phase()).toBe("listening");
    loudness = 0.1;
    await advance(1000);
    loudness = 0;
    await advance(2000);
    expect(onAnswer).toHaveBeenCalledWith("finally an answer");
  });

  it("sends a no-answer marker when the time runs out in silence", async () => {
    const onAnswer = vi.fn();
    render(<Harness transcribe={vi.fn()} onAnswer={onAnswer} limit={10} />);
    await act(async () => screen.getByText("Start").click());
    await advance(100);
    expect(screen.getByTestId("left").textContent).toBe("10");
    await advance(10_500);
    expect(onAnswer).toHaveBeenCalledWith(NO_ANSWER);
  });
});
