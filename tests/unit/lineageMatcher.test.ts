import { describe, expect, it } from "vitest";
import {
  detectLineageThemes,
  resolveLineageReferences,
  type LineageContent,
} from "@/lib/lineageMatcher";

/**
 * Unit tests for lib/lineageMatcher.ts.
 *
 * This is the keyword logic that decides when to surface the "you
 * wrote about this once" reference card. Both false positives and
 * false negatives are bad here:
 *   - A false positive trivializes the moment by surfacing the
 *     reference at unrelated times.
 *   - A false negative misses the connection entirely.
 *
 * We test both the trigger words (positives) and the non-triggers
 * (negatives) explicitly.
 */

describe("detectLineageThemes", () => {
  it("returns empty for empty input", () => {
    expect(detectLineageThemes("")).toEqual([]);
  });

  it("returns empty for very short input (< 8 chars)", () => {
    // The matcher bails on very short text — a journal entry of "ok"
    // shouldn't trigger anything.
    expect(detectLineageThemes("father")).toEqual([]);
  });

  // ── fatherGrief positives ────────────────────────────────────────

  it("detects fatherGrief from 'father' alone", () => {
    const themes = detectLineageThemes(
      "I keep thinking about my father these days.",
    );
    expect(themes).toContain("fatherGrief");
  });

  it("detects fatherGrief from 'dad' alone", () => {
    const themes = detectLineageThemes(
      "My dad called me out of the blue today.",
    );
    expect(themes).toContain("fatherGrief");
  });

  it("detects fatherGrief from 'grief'", () => {
    const themes = detectLineageThemes(
      "The grief comes and goes in waves.",
    );
    expect(themes).toContain("fatherGrief");
  });

  it("detects fatherGrief from 'died'", () => {
    const themes = detectLineageThemes(
      "Five years since he died and it still surprises me.",
    );
    expect(themes).toContain("fatherGrief");
  });

  // ── fatherAnger positives ────────────────────────────────────────

  it("detects fatherAnger from 'anger'", () => {
    const themes = detectLineageThemes(
      "Felt the anger rise in my chest today.",
    );
    expect(themes).toContain("fatherAnger");
  });

  it("detects fatherAnger from 'yelled at'", () => {
    const themes = detectLineageThemes(
      "I yelled at my son before I could catch myself.",
    );
    expect(themes).toContain("fatherAnger");
  });

  it("detects fatherAnger from 'snapped'", () => {
    const themes = detectLineageThemes(
      "I snapped at her over nothing this morning.",
    );
    expect(themes).toContain("fatherAnger");
  });

  // ── patternToLeave positives ────────────────────────────────────

  it("detects patternToLeave from 'pattern'", () => {
    const themes = detectLineageThemes(
      "I can see the pattern repeating in myself.",
    );
    expect(themes).toContain("patternToLeave");
  });

  it("detects patternToLeave from 'cycle'", () => {
    const themes = detectLineageThemes(
      "Breaking the cycle is harder than I thought.",
    );
    expect(themes).toContain("patternToLeave");
  });

  it("detects patternToLeave from 'my son'", () => {
    const themes = detectLineageThemes(
      "My son watched me put down the drink tonight.",
    );
    expect(themes).toContain("patternToLeave");
  });

  it("detects patternToLeave from 'just like him'", () => {
    const themes = detectLineageThemes(
      "I sounded just like him for a second there.",
    );
    expect(themes).toContain("patternToLeave");
  });

  // ── Multi-theme detection ───────────────────────────────────────

  it("detects multiple themes when entry touches both", () => {
    // The text deliberately includes triggers for two themes:
    //   - "anger" hits fatherAnger
    //   - "my son" hits patternToLeave
    const themes = detectLineageThemes(
      "My anger flared today and my son saw it. I do not want him to grow up scared of me.",
    );
    expect(themes).toContain("fatherAnger");
    expect(themes).toContain("patternToLeave");
  });

  it("returns each matched theme only once even if multiple keywords hit", () => {
    const themes = detectLineageThemes(
      "My father was angry, my dad was always mad — anger everywhere.",
    );
    // fatherAnger and fatherGrief both match multiple times but each
    // appears only once in the result
    const occurrences = themes.filter((t) => t === "fatherAnger").length;
    expect(occurrences).toBe(1);
  });

  // ── False positive resistance ───────────────────────────────────

  it("does NOT match 'fatherly' (whole-word check)", () => {
    // "fatherly" contains "father" as a substring but should not
    // trigger — the whole-word boundary check prevents it
    const themes = detectLineageThemes(
      "He gave me a fatherly piece of advice today, which was nice.",
    );
    expect(themes).not.toContain("fatherGrief");
  });

  it("does NOT match 'madness' as 'mad'", () => {
    const themes = detectLineageThemes(
      "There is a certain madness in this whole situation.",
    );
    expect(themes).not.toContain("fatherAnger");
  });

  it("does NOT match generic entry with no triggers", () => {
    const themes = detectLineageThemes(
      "Today was quiet. Worked, went for a walk, made dinner.",
    );
    expect(themes).toEqual([]);
  });

  it("is case-insensitive", () => {
    const themes = detectLineageThemes(
      "MY FATHER would never have apologized.",
    );
    expect(themes).toContain("fatherGrief");
  });
});

// ─── resolveLineageReferences ─────────────────────────────────────

describe("resolveLineageReferences", () => {
  const fullContent: LineageContent = {
    fatherGrief: "He cried only once at his mother's funeral.",
    fatherAnger: "He went silent for days when he was angry.",
    patternToLeave: "The silence. The walking away mid-conversation.",
  };

  it("returns no references when nothing matched", () => {
    expect(resolveLineageReferences([], fullContent)).toEqual([]);
  });

  it("returns no references when user has no lineage content", () => {
    const empty: LineageContent = {
      fatherGrief: null,
      fatherAnger: null,
      patternToLeave: null,
    };
    expect(
      resolveLineageReferences(["fatherGrief", "fatherAnger"], empty),
    ).toEqual([]);
  });

  it("returns one reference per matched theme that has content", () => {
    const refs = resolveLineageReferences(
      ["fatherGrief", "fatherAnger"],
      fullContent,
    );
    expect(refs).toHaveLength(2);
    expect(refs[0].theme).toBe("fatherGrief");
    expect(refs[0].text).toBe(fullContent.fatherGrief);
    expect(refs[1].theme).toBe("fatherAnger");
  });

  it("attaches a human-readable label to each reference", () => {
    const refs = resolveLineageReferences(["fatherGrief"], fullContent);
    expect(refs[0].label).toBe("what your father did with grief");
  });

  it("skips themes where the user has empty content", () => {
    const partial: LineageContent = {
      fatherGrief: "Something.",
      fatherAnger: null,
      patternToLeave: "",
    };
    const refs = resolveLineageReferences(
      ["fatherGrief", "fatherAnger", "patternToLeave"],
      partial,
    );
    expect(refs).toHaveLength(1);
    expect(refs[0].theme).toBe("fatherGrief");
  });

  it("treats whitespace-only content as empty", () => {
    const whitespace: LineageContent = {
      fatherGrief: "   \n  \t  ",
      fatherAnger: null,
      patternToLeave: null,
    };
    expect(resolveLineageReferences(["fatherGrief"], whitespace)).toEqual([]);
  });
});
