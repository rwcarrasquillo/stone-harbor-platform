/**
 * Stone Harbor — Daily journal prompts.
 *
 * Single source of truth for the rotating daily prompt that powers:
 *   - /journal (today's question to answer)
 *   - /dashboard's Tomorrow tile (preview of tomorrow's topic)
 *
 * Rotation is deterministic by day-of-year so the same prompt appears
 * across reloads, and it varies by date so members see something fresh
 * each return. To add a prompt, append it here — both surfaces pick it
 * up automatically with no other changes.
 *
 * Each prompt has:
 *   - question: the full journal prompt shown on /journal
 *   - topic:    a short noun phrase used by the dashboard's preview tile,
 *               rendered as "A question on {topic}."
 *               Keep topics as natural English noun phrases.
 */

import type { RoadmapStage } from "@/lib/spine";

export type DailyPrompt = {
  question: string;
  topic: string;
  /**
   * Which stage of the path this question belongs to (SH-120, spine
   * Ship 2A). Calm questions work on the nervous system, clarity
   * questions on seeing the pattern, strength questions on what to do
   * about it.
   *
   * Used only when spine content adaptation is on and the member has a
   * current step — see stagePromptForDay(). The plain day-of-year
   * rotation ignores this field entirely, so the prompts stay a single
   * pool rather than three separate ones.
   */
  stage: RoadmapStage;
};

export const PROMPTS: DailyPrompt[] = [
  {
    question: "What did you notice you tried to avoid this week?",
    topic: "avoidance",
    stage: "clarity",
  },
  {
    question: "What would the calmer version of you say to today's version?",
    topic: "your calmer self",
    stage: "calm",
  },
  {
    question: "Where did you feel most yourself this week?",
    topic: "feeling like yourself",
    stage: "clarity",
  },
  {
    question: "What is one truth you have been postponing?",
    topic: "a postponed truth",
    stage: "clarity",
  },
  {
    question:
      "Who do you owe an honest conversation with — including yourself?",
    topic: "an honest conversation",
    stage: "strength",
  },
  {
    question: "What still hurts that you haven't named?",
    topic: "unnamed pain",
    stage: "calm",
  },
  {
    question: "What pattern keeps repeating? Where did it start?",
    topic: "the pattern that keeps repeating",
    stage: "clarity",
  },
  {
    question: "What did your body feel today that your mind ignored?",
    topic: "what the body knows",
    stage: "calm",
  },
  {
    question: "What would you do this week if no one was watching?",
    topic: "what you'd do unwatched",
    stage: "strength",
  },
  {
    question:
      "Name one thing you survived that you have not given yourself credit for.",
    topic: "what you survived",
    stage: "strength",
  },
  {
    question:
      "Where is your nervous system spending energy it does not need to?",
    topic: "the nervous system",
    stage: "calm",
  },
  {
    question: "What boundary have you been afraid to say out loud?",
    topic: "boundaries",
    stage: "strength",
  },
  {
    question: "Who in your life makes you smaller? Who makes you fuller?",
    topic: "the people around you",
    stage: "clarity",
  },
  {
    question:
      "What did your father teach you — that you are still deciding what to do with?",
    topic: "your father",
    stage: "clarity",
  },
];

/**
 * Returns the prompt for a given day offset.
 *   offsetDays = 0 → today
 *   offsetDays = 1 → tomorrow
 *
 * Deterministic across reloads: same day-of-year always yields the same
 * prompt. Uses local time, not UTC, so the prompt does not flip mid-evening
 * for members on the West Coast.
 */
function dayOfYear(offsetDays = 0): number {
  const now = new Date();
  now.setDate(now.getDate() + offsetDays);
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const diffMs = Number(now) - Number(startOfYear);
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function getPromptForDay(offsetDays = 0): DailyPrompt {
  return PROMPTS[dayOfYear(offsetDays) % PROMPTS.length];
}

/**
 * The prompt for a given day, narrowed to one stage of the path
 * (SH-120, spine Ship 2A).
 *
 * Rotation stays deterministic and day-driven exactly as above — the
 * stage only decides which pool the day-of-year indexes into, so a
 * member on Calm still gets a different question each day, and still
 * gets the SAME question on every reload of that day.
 *
 * Returns null when the stage has no prompts at all, which lets callers
 * fall back to the full rotation rather than render nothing. Today
 * every stage has 4-6 prompts, so the null branch is defensive.
 */
export function stagePromptForDay(
  stage: RoadmapStage,
  offsetDays = 0,
): DailyPrompt | null {
  const pool = PROMPTS.filter((p) => p.stage === stage);
  if (pool.length === 0) return null;
  return pool[dayOfYear(offsetDays) % pool.length];
}

/** Convenience: today's full question, for the /journal page. */
export function todaysPrompt(): string {
  return getPromptForDay(0).question;
}

/** Convenience: tomorrow's topic, for the dashboard's Tomorrow tile. */
export function tomorrowsTopic(): string {
  return getPromptForDay(1).topic;
}