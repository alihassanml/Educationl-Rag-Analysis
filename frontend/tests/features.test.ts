import { describe, expect, it } from "vitest";
import { FEATURES, liveFeatures, navItems, plannedFeatures } from "@/lib/features";

describe("feature registry", () => {
  it("gives every feature a unique id", () => {
    const ids = FEATURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("puts only live features in the navigation", () => {
    const hrefs = navItems().map((item) => item.href);
    for (const feature of plannedFeatures()) {
      expect(feature.nav, `${feature.id} is planned and must not have a nav entry`).toBeUndefined();
    }
    expect(hrefs).toEqual(["/dashboard", "/tutor", "/library", "/quizzes", "/progress", "/evaluation"]);
  });

  it("keeps the Evaluation Lab admin only", () => {
    expect(navItems().find((item) => item.href === "/evaluation")?.adminOnly).toBe(true);
    expect(navItems().filter((item) => item.adminOnly)).toHaveLength(1);
  });

  it("has landing copy only for live features and a roadmap line only for planned ones", () => {
    for (const feature of liveFeatures()) expect(feature.roadmap).toBeUndefined();
    for (const feature of plannedFeatures()) {
      expect(feature.landing).toBeUndefined();
      expect(feature.roadmap).toBeTruthy();
    }
  });

  it("lists chat history, follow-up questions and streamed answers as live, not on the roadmap", () => {
    const live = liveFeatures().map((f) => f.id);
    expect(live).toEqual(expect.arrayContaining(["chat-history", "follow-ups", "streaming"]));
    const roadmap = plannedFeatures().map((f) => f.id);
    for (const id of ["chat-history", "follow-ups", "streaming"]) expect(roadmap).not.toContain(id);
  });

  it("describes the tutor with follow-ups and sources shown before the answer", () => {
    const tutor = FEATURES.find((f) => f.id === "tutor")!;
    const copy = [tutor.landing!.body, ...tutor.landing!.bullets].join(" ").toLowerCase();
    expect(copy).toContain("follow-up");
    expect(copy).toContain("before the answer");
  });

  it("writes headings and labels without a trailing full stop", () => {
    for (const feature of FEATURES) {
      expect(feature.label.endsWith(".")).toBe(false);
      if (feature.landing) expect(feature.landing.title.endsWith(".")).toBe(false);
    }
  });
});
