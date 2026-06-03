/**
 * Stone Harbor -- Seasonal & birthday acknowledgments.
 *
 * Surfaces a quiet, dismissible tile on the dashboard on days that are
 * statistically hard for men in storm seasons. The voice never assumes
 * joy and never assumes grief -- it makes space for whatever the day
 * actually is for the man reading it.
 *
 * Four seasonal days are marked. The list is intentionally small.
 * Marking more days dilutes the meaning of marking any of them.
 */

export type Acknowledgment = {
  key: string;
  eyebrow: string;
  headline: string;
  body: string;
  amplify988: boolean;
};

type Resolver = (d: Date) => Acknowledgment | null;

/** Thanksgiving -- 4th Thursday in November (US). */
function isThanksgiving(d: Date): boolean {
  if (d.getMonth() !== 10) return false;
  const firstOfMonth = new Date(d.getFullYear(), 10, 1);
  const firstThursday = ((4 - firstOfMonth.getDay() + 7) % 7) + 1;
  return d.getDate() === firstThursday + 21;
}

/** Father's Day -- 3rd Sunday in June (US). */
function isFathersDay(d: Date): boolean {
  if (d.getMonth() !== 5) return false;
  const firstOfMonth = new Date(d.getFullYear(), 5, 1);
  const firstSunday = ((0 - firstOfMonth.getDay() + 7) % 7) + 1;
  return d.getDate() === firstSunday + 14;
}

const seasonalResolvers: Resolver[] = [
  (d) =>
    isThanksgiving(d)
      ? {
          key: "thanksgiving",
          eyebrow: "Today",
          headline:
            "Today carries a lot. Whether it feels easy, complicated, or unbearable -- the harbor is open.",
          body: "Some men are with family. Some are alone. Some are sitting with an empty chair. Wherever you are, you are not the only one who feels this day.",
          amplify988: true,
        }
      : null,

  (d) =>
    d.getMonth() === 11 && d.getDate() === 24
      ? {
          key: "christmas-eve",
          eyebrow: "Tonight",
          headline: "Christmas asks a lot of men.",
          body: "If tonight is heavy, you are not the only one feeling it. We are here. No performance required.",
          amplify988: true,
        }
      : null,

  (d) =>
    d.getMonth() === 11 && d.getDate() === 25
      ? {
          key: "christmas-day",
          eyebrow: "Today",
          headline: "Christmas does not require a feeling from you today.",
          body: "Joy is welcome. So is grief. So is numb. Whatever is here is here, and the harbor is open.",
          amplify988: true,
        }
      : null,

  (d) =>
    d.getMonth() === 11 && d.getDate() === 31
      ? {
          key: "new-years-eve",
          eyebrow: "Tonight",
          headline:
            "Another year ends. You do not have to perform. You do not have to make a plan.",
          body: "Just notice it with us. That is enough for tonight.",
          amplify988: true,
        }
      : null,

  (d) =>
    isFathersDay(d)
      ? {
          key: "fathers-day",
          eyebrow: "Today",
          headline:
            "Today brings up a lot for many men. Fathers, sons, both, neither.",
          body: "Whatever it stirs in you -- pride, grief, longing, anger, or all of them at once -- we see you.",
          amplify988: false,
        }
      : null,
];

export function getSeasonalAcknowledgment(
  now: Date = new Date(),
): Acknowledgment | null {
  for (const resolver of seasonalResolvers) {
    const ack = resolver(now);
    if (ack) return ack;
  }
  return null;
}

export function getBirthdayAcknowledgment(
  birthMonth: number | null | undefined,
  birthDay: number | null | undefined,
  now: Date = new Date(),
): Acknowledgment | null {
  if (!birthMonth || !birthDay) return null;
  if (now.getMonth() + 1 !== birthMonth) return null;
  if (now.getDate() !== birthDay) return null;
  return {
    key: "birthday",
    eyebrow: "Today",
    headline:
      "Today is your birthday. Whatever it feels like this year, the harbor is here.",
    body: "Some birthdays are easy. Some carry a lot. We do not presume -- we just notice the day with you.",
    amplify988: false,
  };
}

export function dismissalKey(
  ackKey: string,
  now: Date = new Date(),
): string {
  return `${ackKey}-${now.getFullYear()}`;
}

export function resolveActiveAcknowledgment(args: {
  birthMonth: number | null | undefined;
  birthDay: number | null | undefined;
  acknowledgeBirthday: boolean;
  seasonalEnabled: boolean;
  dismissed: Record<string, string> | null | undefined;
  now?: Date;
}): Acknowledgment | null {
  const now = args.now ?? new Date();
  const dismissed = args.dismissed ?? {};

  if (args.seasonalEnabled) {
    const seasonal = getSeasonalAcknowledgment(now);
    if (seasonal && !dismissed[dismissalKey(seasonal.key, now)]) {
      return seasonal;
    }
  }

  if (args.acknowledgeBirthday) {
    const birthday = getBirthdayAcknowledgment(
      args.birthMonth,
      args.birthDay,
      now,
    );
    if (birthday && !dismissed[dismissalKey(birthday.key, now)]) {
      return birthday;
    }
  }

  return null;
}