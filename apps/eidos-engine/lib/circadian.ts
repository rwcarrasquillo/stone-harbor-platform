/**
 * Eidos — Circadian construct compute module (EID-20).
 *
 * Pure, deterministic functions. No DB, no HTTP, no env. Given a set
 * of event timestamps + a timezone + a confidence calibration, return
 * the four circadian sub-measures plus a confidence score and an
 * evidence pointer.
 *
 * The cron route owns I/O; this file owns math. Keep it that way.
 *
 * ## Sub-measures
 *
 * 1. **Chronotype centroid** (`centroid_hour`) — circular mean of the
 *    hour-of-day distribution. The right way to answer "what time of
 *    day does this person typically journal" when the data straddles
 *    midnight. Munich ChronoType Questionnaire methodology (Roenneberg,
 *    2003) operationalises chronotype as the midpoint of sleep on free
 *    days; we're using the proxy of *when journaling happens* because
 *    that's what we observe — not sleep itself, but a behaviour whose
 *    distribution is well-attested to track chronotype in self-reflective
 *    populations.
 *
 * 2. **Regularity entropy** (`regularity_entropy`) — Shannon entropy
 *    of the hour-of-day histogram, normalised to [0, 1]. 0 means "all
 *    journaling happens at exactly the same hour every day" (perfectly
 *    regular); 1 means "journaling happens uniformly across the 24-hour
 *    clock" (no rhythm at all). Activity-regularity indices have been
 *    shown to track health outcomes in large cohorts (Lyall et al., UK
 *    Biobank, 2018).
 *
 * 3. **Night-window load** (`night_load_fraction`) — fraction of events
 *    falling in the 23:00–04:00 local window. Late-night writing has
 *    documented associations with rumination, depression, and disrupted
 *    sleep (Tousignant et al., 2019; Hasler et al., 2010). The 23–04
 *    window is chosen to capture the canonical "I should be asleep but
 *    I'm not" period without being so wide that ordinary evening
 *    writing dominates.
 *
 * 4. **Social jet lag** (`social_jet_lag_hours`) — signed delta between
 *    the weekend chronotype centroid and the weekday chronotype centroid.
 *    Positive = weekend journaling shifted later than weekday journaling
 *    (the typical pattern); negative = weekday later (unusual; often a
 *    sign of work-imposed late nights). Wittmann et al. (2006) coined
 *    the term for sleep timing; we adapt it to the journaling proxy.
 *
 * ## Confidence
 *
 * Confidence is the product of two saturating ratios:
 *
 *   sample_factor = min(1, sample_size / full_confidence_sample_size)
 *   day_factor    = min(1, unique_days / full_confidence_window_days)
 *   confidence    = sample_factor * day_factor
 *
 * This means full confidence requires *both* enough events *and* enough
 * distinct days. A burst of 100 events on a single Sunday wouldn't earn
 * high confidence, and writing once a day for 14 days only earns full
 * confidence if it accumulates to the sample threshold too.
 *
 * Below `min_sample_size` or `min_unique_days`, the four sub-measures
 * are nulled — the row still records the gap, but we don't pretend the
 * math is informative yet.
 */

export interface CircadianEvent {
  /** Idempotency key from the event_stream row. Used for evidence pointer. */
  event_id: string;
  /** ISO 8601 timestamp (UTC or with offset — Date constructor handles both). */
  timestamp: string;
}

export interface CircadianInputs {
  events: CircadianEvent[];
  /** IANA timezone like "America/New_York". Hours are local to this zone. */
  ianaTimezone: string;
  /** Window bounds used for the row metadata. Math doesn't filter by these — caller filters. */
  windowStart: Date;
  windowEnd: Date;
  /** Below this many events, sub-measures are nulled. */
  minSampleSize: number;
  /** Below this many distinct local-calendar days, sub-measures are nulled. */
  minUniqueDays: number;
  /** Sample size at which the sample factor of confidence saturates to 1. */
  fullConfidenceSampleSize: number;
  /** Distinct-day count at which the day factor of confidence saturates to 1. */
  fullConfidenceWindowDays: number;
}

export interface CircadianOutput {
  sample_size: number;
  unique_days: number;
  /** Local hour in [0, 24). null when below threshold. */
  centroid_hour: number | null;
  /** Normalised Shannon entropy in [0, 1]. null when below threshold. */
  regularity_entropy: number | null;
  /** Fraction of events in 23:00–04:00 local. null when below threshold. */
  night_load_fraction: number | null;
  /** Signed weekend-minus-weekday centroid delta in (-12, 12]. null when below threshold OR one of the two buckets is empty. */
  social_jet_lag_hours: number | null;
  /** Saturating product in [0, 1]. Always computed, even when sub-measures are nulled. */
  confidence: number;
  /** Forensic pointer for the admin spot-check view (EID-21). */
  evidence: {
    event_ids: string[];
    hour_histogram: number[]; // 24-bin local-hour counts
    weekday_count: number;
    weekend_count: number;
  };
}

/**
 * The night window expressed as a predicate so the boundary check
 * happens in exactly one place. 23:00 ≤ h < 24 OR 0 ≤ h < 4.
 */
function isNightHour(localHour: number): boolean {
  return localHour >= 23 || localHour < 4;
}

/**
 * Day-of-week categorisation. Saturday + Sunday are weekend; the rest
 * are weekday. ISO day numbers from luxon-style libraries differ; we
 * use the Date.getDay() convention (0 = Sun, 6 = Sat).
 */
function isWeekend(dayOfWeek: number): boolean {
  return dayOfWeek === 0 || dayOfWeek === 6;
}

/**
 * Convert a UTC timestamp string + IANA zone into the local
 * (hour, dayOfWeek, calendarDayKey) triple we need for the rest of the
 * math. Uses Intl.DateTimeFormat with `formatToParts` for reliability
 * — manual offset arithmetic is the most common bug in this kind of
 * code, so we delegate to the platform.
 *
 * `calendarDayKey` is a YYYY-MM-DD string in the local zone; we use it
 * as a set key to count unique days without dragging in Date arithmetic.
 */
export function toLocal(
  timestamp: string,
  ianaTimezone: string,
): { hour: number; dayOfWeek: number; calendarDayKey: string } {
  const date = new Date(timestamp);

  // formatToParts is the only Intl API that gives back the components
  // separately. We ask for everything we need in one call.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ianaTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(date);

  const lookup: Record<string, string> = {};
  for (const part of parts) lookup[part.type] = part.value;

  // hour12: false sometimes returns "24" at midnight in older Node
  // versions. Normalize to [0, 24).
  let hour = Number.parseInt(lookup.hour, 10);
  if (hour === 24) hour = 0;

  // Map "Mon"/"Tue"/... to 0–6 (Sunday = 0, like Date.getDay()).
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dayOfWeek = weekdayMap[lookup.weekday] ?? 0;

  const calendarDayKey = `${lookup.year}-${lookup.month}-${lookup.day}`;

  return { hour, dayOfWeek, calendarDayKey };
}

/**
 * Circular mean of an array of hours (each in [0, 24)). Returns null
 * for empty input. The classic atan2 trick: map each hour to a unit
 * vector on a circle, sum the vectors, take the angle of the resultant.
 * Robust to wraparound: 23:00 and 01:00 average to midnight, not noon.
 */
export function circularMeanHour(hours: number[]): number | null {
  if (hours.length === 0) return null;
  let sinSum = 0;
  let cosSum = 0;
  for (const h of hours) {
    const theta = (h / 24) * 2 * Math.PI;
    sinSum += Math.sin(theta);
    cosSum += Math.cos(theta);
  }
  let mean = Math.atan2(sinSum, cosSum); // in (-PI, PI]
  if (mean < 0) mean += 2 * Math.PI; // shift to [0, 2*PI)
  return (mean / (2 * Math.PI)) * 24;
}

/**
 * Normalised Shannon entropy across 24 hour bins. Returns a value in
 * [0, 1]: 0 = all events on the same hour (perfectly regular), 1 =
 * uniform across the 24-hour clock (no rhythm).
 *
 * Input is the 24-element histogram, not the raw hours, because the
 * cron route already builds the histogram for the evidence column.
 */
export function regularityEntropy(histogram: number[]): number | null {
  if (histogram.length !== 24) return null;
  const total = histogram.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  let H = 0;
  for (const count of histogram) {
    if (count === 0) continue;
    const p = count / total;
    H -= p * Math.log2(p);
  }
  const Hmax = Math.log2(24);
  return H / Hmax;
}

/**
 * Confidence score per the formula above. Always returns a value in
 * [0, 1] — never null, so the observations row always carries a real
 * number even when sub-measures are nulled.
 */
export function computeConfidence(
  sampleSize: number,
  uniqueDays: number,
  fullConfidenceSampleSize: number,
  fullConfidenceWindowDays: number,
): number {
  if (fullConfidenceSampleSize <= 0 || fullConfidenceWindowDays <= 0) return 0;
  const sampleFactor = Math.min(1, sampleSize / fullConfidenceSampleSize);
  const dayFactor = Math.min(1, uniqueDays / fullConfidenceWindowDays);
  return sampleFactor * dayFactor;
}

/**
 * Top-level compute. Pure: same inputs → same output. Caller is
 * responsible for filtering events to the window — this function
 * doesn't re-filter, so the sample_size it returns matches what the
 * caller passed in.
 */
export function computeCircadian(inputs: CircadianInputs): CircadianOutput {
  const {
    events,
    ianaTimezone,
    minSampleSize,
    minUniqueDays,
    fullConfidenceSampleSize,
    fullConfidenceWindowDays,
  } = inputs;

  // ── Decompose every event into (hour, dayOfWeek, dayKey) ─────────
  const decomposed = events.map((e) => ({
    event_id: e.event_id,
    ...toLocal(e.timestamp, ianaTimezone),
  }));

  const sampleSize = decomposed.length;
  const uniqueDays = new Set(decomposed.map((d) => d.calendarDayKey)).size;

  // ── Build the 24-bin hour histogram ──────────────────────────────
  const histogram = new Array(24).fill(0) as number[];
  for (const d of decomposed) histogram[d.hour] += 1;

  // ── Weekday vs weekend split ─────────────────────────────────────
  const weekdayHours: number[] = [];
  const weekendHours: number[] = [];
  for (const d of decomposed) {
    if (isWeekend(d.dayOfWeek)) weekendHours.push(d.hour);
    else weekdayHours.push(d.hour);
  }

  // ── Confidence is always computed ────────────────────────────────
  const confidence = computeConfidence(
    sampleSize,
    uniqueDays,
    fullConfidenceSampleSize,
    fullConfidenceWindowDays,
  );

  const evidence = {
    event_ids: decomposed.map((d) => d.event_id),
    hour_histogram: histogram,
    weekday_count: weekdayHours.length,
    weekend_count: weekendHours.length,
  };

  // ── Below thresholds → null sub-measures, real confidence ────────
  if (sampleSize < minSampleSize || uniqueDays < minUniqueDays) {
    return {
      sample_size: sampleSize,
      unique_days: uniqueDays,
      centroid_hour: null,
      regularity_entropy: null,
      night_load_fraction: null,
      social_jet_lag_hours: null,
      confidence,
      evidence,
    };
  }

  // ── Sub-measures ─────────────────────────────────────────────────
  const allHours = decomposed.map((d) => d.hour);
  const centroidHour = circularMeanHour(allHours);
  const entropy = regularityEntropy(histogram);

  const nightCount = decomposed.filter((d) => isNightHour(d.hour)).length;
  const nightLoadFraction = nightCount / sampleSize;

  // Social jet lag requires at least one event in each bucket. If one
  // bucket is empty, we can't compute the delta — leave it null.
  let socialJetLagHours: number | null = null;
  if (weekdayHours.length > 0 && weekendHours.length > 0) {
    const weekdayMean = circularMeanHour(weekdayHours);
    const weekendMean = circularMeanHour(weekendHours);
    if (weekdayMean !== null && weekendMean !== null) {
      let delta = weekendMean - weekdayMean;
      // Map the delta into (-12, 12]. Without this, a weekend mean of
      // 02:00 and a weekday mean of 22:00 would record a delta of -20
      // when the human-intuitive answer is +4.
      if (delta > 12) delta -= 24;
      if (delta <= -12) delta += 24;
      socialJetLagHours = delta;
    }
  }

  return {
    sample_size: sampleSize,
    unique_days: uniqueDays,
    centroid_hour: centroidHour,
    regularity_entropy: entropy,
    night_load_fraction: nightLoadFraction,
    social_jet_lag_hours: socialJetLagHours,
    confidence,
    evidence,
  };
}
