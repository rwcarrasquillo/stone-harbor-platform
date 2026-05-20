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

export type DailyPrompt = {
  question: string;
  topic: string;
};

export const PROMPTS: DailyPrompt[] = [
  {
    question: "What did you notice you tried to avoid this week?",
    topic: "avoidance",
  },
  {
    question: "What would the calmer version of you say to today's version?",
    topic: "your calmer self",
  },
  {
    question: "Where did you feel most yourself this week?",
    topic: "feeling like yourself",
  },
  {
    question: "What is one truth you have been postponing?",
    topic: "a postponed truth",
  },
  {
    question:
      "Who do you owe an honest conversation with — including yourself?",
    topic: "an honest conversation",
  },
  {
    question: "What still hurts that you haven't named?",
    topic: "unnamed pain",
  },
  {
    question: "What pattern keeps repeating? Where did it start?",
    topic: "the pattern that keeps repeating",
  },
  {
    question: "What did your body feel today that your mind ignored?",
    topic: "what the body knows",
  },
  {
    question: "What would you do this week if no one was watching?",
    topic: "what you'd do unwatched",
  },
  {
    question:
      "Name one thing you survived that you have not given yourself credit for.",
    topic: "what you survived",
  },
  {
    question:
      "Where is your nervous system spending energy it does not need to?",
    topic: "the nervous system",
  },
  {
    question: "What boundary have you been afraid to say out loud?",
    topic: "boundaries",
  },
  {
    question: "Who in your life makes you smaller? Who makes you fuller?",
    topic: "the people around you",
  },
  {
    question:
      "What did your father teach you — that you are still deciding what to do with?",
    topic: "your father",
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
export function getPromptForDay(offsetDays = 0): DailyPrompt {
  const now = new Date();
  now.setDate(now.getDate() + offsetDays);
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const diffMs = Number(now) - Number(startOfYear);
  const dayOfYear = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return PROMPTS[dayOfYear % PROMPTS.length];
}

/** Convenience: today's full question, for the /journal page. */
export function todaysPrompt(): string {
  return getPromptForDay(0).question;
}

/** Convenience: tomorrow's topic, for the dashboard's Tomorrow tile. */
export function tomorrowsTopic(): string {
  return getPromptForDay(1).topic;
}