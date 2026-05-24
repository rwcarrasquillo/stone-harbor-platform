import { describe, it, expect } from "vitest";
import {
  detectLineageThemes,
  resolveLineageReferences,
  type LineageContent,
} from "@/lib/lineageMatcher";

/**
 * Lineage matcher tests. The matcher is the engine behind the
 * "you wrote something about this once — would you like to read it?"
 * reference-back experience on the journal page. Two responsibilities:
 *
 *   1. detectLineageThemes — given a journal entry, return the set
 *      of lineage themes the entry touches on, based on keyword hits.
 *   2. resolveLineageReferences — combine detected themes with the
 *      user's stored lineage text to produce render-ready references.
 */
describe("detectLineageThemes", () => {
  it("returns empty for empty input", () => {
    expect(detectLineageThemes("")).toEqual([]);
  });

  it("returns empty for very short input (< 8 chars)", () => {
    expect(detectLineageThemes("dad")).toEqual([]);
  });

  it("detects fatherGrief from 'father' alone", () => {
    const themes = detectLineageThemes(
      "I keep thinking about my father lately.",
    );
    expect(themes).toContain("fatherGrief");
  });

  it("detects fatherGrief from 'dad' alone", () => {
    const themes = detectLineageThemes("my dad was on my mind today");
    expect(themes).toContain("fatherGrief");
  });

  it("detects fatherGrief from 'grief'", () => {
    const themes = detectLineageThemes(
      "the grief comes in waves and I don't know what to do with it",
    );
    expect(themes).toContain("fatherGrief");
  });

  it("detects fatherGrief from 'died'", () => {
    const themes = detectLineageThemes(
      "it's been three years since he died and I still can't talk about it",
    );
    expect(themes).toContain("fatherGrief");
  });

  it("detects fatherAnger from 'anger'", () => {
    const themes = detectLineageThemes(
      "the anger keeps showing up in places I don't expect",
    );
    expect(themes).toContain("fatherAnger");
  });

  it("detects fatherAnger from 'yelled at'", () => {
    const themes = detectLineageThemes("I yelled at my kid today and I hated it");
    expect(themes).toContain("fatherAnger");
  });

  it("detects fatherAnger from 'snapped'", () => {
    const themes = detectLineageThemes(
      "I snapped at her over something stupid",
    );
    expect(themes).toContain("fatherAnger");
  });

  it("detects patternToLeave from 'pattern'", () => {
    const themes = detectLineageThemes(
      "I keep falling into the same pattern with this",
    );
    expect(themes).toContain("patternToLeave");
  });

  it("detects patternToLeave from 'cycle'", () => {
    const themes = detectLineageThemes(
      "trying to break this cycle but it keeps coming back",
    );
    expect(themes).toContain("patternToLeave");
  });

  it("detects patternToLeave from 'my son'", () => {
    const themes = detectLineageThemes(
      "I don't want my son to feel the way I did growing up",
    );
    expect(themes).toContain("patternToLeave");
  });

  it("detects patternToLeave from 'just like him'", () => {
    const themes = detectLineageThemes(
      "I caught myself acting just like him today",
    );
    expect(themes).toContain("patternToLeave");
  });

  it("detects multiple themes when entry touches both", () => {
    const themes = detectLineageThemes(
      "I yelled at my son today, same pattern I grew up with",
    );
    expect(themes).toContain("fatherAnger");
    expect(themes).toContain("patternToLeave");
  });

  it("returns each matched theme only once even if multiple keywords hit", () => {
    const themes = detectLineageThemes(
      "the anger, the rage, my temper — all of it from my dad",
    );
    const angerCount = themes.filter((t) => t === "fatherAnger").length;
    expect(angerCount).toBe(1);
  });

  it("does NOT match 'fatherly' (whole-word check)", () => {
    const themes = detectLineageThemes(
      "he was very fatherly toward the younger guys",
    );
    expect(themes).not.toContain("fatherGrief");
  });

  it("does NOT match 'madness' as 'mad'", () => {
    const themes = detectLineageThemes(
      "the madness of trying to keep up with this schedule",
    );
    expect(themes).not.toContain("fatherAnger");
  });

  it("does NOT match generic entry with no triggers", () => {
    const themes = detectLineageThemes(
      "today was a quiet day. I drank coffee and watched the rain.",
    );
    expect(themes).toEqual([]);
  });

  it("is case-insensitive", () => {
    const themes = detectLineageThemes("MY FATHER NEVER UNDERSTOOD ME");
    expect(themes).toContain("fatherGrief");
  });
});

describe("resolveLineageReferences", () => {
  const content: LineageContent = {
    fatherGrief: "what I never got to say to my father",
    fatherAnger: "the way my dad would explode out of nowhere",
    patternToLeave: "I will not raise my kids the way I was raised",
  };

  it("returns no references when nothing matched", () => {
    const refs = resolveLineageReferences([], content);
    expect(refs).toEqual([]);
  });

  it("returns no references when user has no lineage content", () => {
    const refs = resolveLineageReferences(["fatherGrief"], {
      fatherGrief: null,
      fatherAnger: null,
      patternToLeave: null,
    });
    expect(refs).toEqual([]);
  });

  it("returns one reference per matched theme that has content", () => {
    const refs = resolveLineageReferences(
      ["fatherGrief", "patternToLeave"],
      content,
    );
    expect(refs.length).toBe(2);
    expect(refs.map((r) => r.theme).sort()).toEqual([
      "fatherGrief",
      "patternToLeave",
    ]);
  });

  it("attaches a human-readable label to each reference", () => {
    const refs = resolveLineageReferences(["fatherAnger"], content);
    expect(refs[0].label).toBeTruthy();
    expect(typeof refs[0].label).toBe("string");
  });

  it("skips themes where the user has empty content", () => {
    const refs = resolveLineageReferences(
      ["fatherGrief", "fatherAnger"],
      { ...content, fatherAnger: null },
    );
    expect(refs.length).toBe(1);
    expect(refs[0].theme).toBe("fatherGrief");
  });

  it("treats whitespace-only content as empty", () => {
    const refs = resolveLineageReferences(["fatherAnger"], {
      ...content,
      fatherAnger: "   \n  ",
    });
    expect(refs).toEqual([]);
  });
});
