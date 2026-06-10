import Link from "next/link";

import { getServiceClient } from "@/lib/supabase/server";

/**
 * Eidos Engine — per-member spot-check view (EID-21).
 *
 * Routes: /admin/spot-check/[consumer_id]/[user_id]
 *
 * Renders raw events alongside the latest computed observation and the
 * baseline (if one exists yet) for a single (consumer, member) pair.
 * This is the validation gate: the math from EID-20 should "look
 * right" against the timestamps and the histogram before any
 * member-facing surface is allowed to render the inference.
 *
 * Server component. One Supabase round-trip per panel — three total.
 * Could be one with foreign-key joins later if we feel the latency,
 * but at 19 events the cost is invisible.
 */

export const dynamic = "force-dynamic";

const SURFACING_THRESHOLD = 0.7;
const TZ_LABEL = "America/New_York";

interface EventRow {
  event_id: string;
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

interface ObservationRow {
  id: string;
  window_start: string;
  window_end: string;
  sample_size: number;
  unique_days: number;
  centroid_hour: number | null;
  regularity_entropy: number | null;
  night_load_fraction: number | null;
  social_jet_lag_hours: number | null;
  confidence: number;
  evidence: {
    event_ids?: string[];
    hour_histogram?: number[];
    weekday_count?: number;
    weekend_count?: number;
  };
  computed_at: string;
}

interface BaselineRow {
  trait_centroid_hour: number | null;
  trait_centroid_hour_stddev: number | null;
  trait_regularity_entropy: number | null;
  trait_regularity_entropy_stddev: number | null;
  trait_night_load_fraction: number | null;
  trait_night_load_fraction_stddev: number | null;
  trait_social_jet_lag_hours: number | null;
  sample_size: number;
  window_days: number;
  computed_at: string;
}

export default async function SpotCheckPage({
  params,
}: {
  params: Promise<{ consumer_id: string; user_id: string }>;
}) {
  const { consumer_id: consumerId, user_id: userId } = await params;
  const supabase = getServiceClient();

  // ── Events ──────────────────────────────────────────────────────
  const { data: eventData, error: eventsError } = await supabase
    .from("eidos_event_stream")
    .select("event_id, type, timestamp, payload")
    .eq("consumer_id", consumerId)
    .eq("user_id", userId)
    .order("timestamp", { ascending: false });

  if (eventsError) {
    return <ErrorPanel title="event_stream read failed" detail={eventsError.message} />;
  }

  const events = (eventData ?? []) as EventRow[];

  // ── Latest circadian observation ────────────────────────────────
  const { data: obsData } = await supabase
    .from("eidos_circadian_observations")
    .select(
      "id, window_start, window_end, sample_size, unique_days, centroid_hour, regularity_entropy, night_load_fraction, social_jet_lag_hours, confidence, evidence, computed_at",
    )
    .eq("consumer_id", consumerId)
    .eq("member_id", userId)
    .order("computed_at", { ascending: false })
    .limit(1);

  const observation = (obsData?.[0] ?? null) as ObservationRow | null;

  // ── Baseline ────────────────────────────────────────────────────
  const { data: baselineData } = await supabase
    .from("eidos_circadian_baselines")
    .select(
      "trait_centroid_hour, trait_centroid_hour_stddev, trait_regularity_entropy, trait_regularity_entropy_stddev, trait_night_load_fraction, trait_night_load_fraction_stddev, trait_social_jet_lag_hours, sample_size, window_days, computed_at",
    )
    .eq("consumer_id", consumerId)
    .eq("member_id", userId)
    .limit(1);

  const baseline = (baselineData?.[0] ?? null) as BaselineRow | null;

  // ── Histogram from the raw events (matches what compute would see) ──
  const histogram = buildLocalHourHistogram(events.map((e) => e.timestamp));

  // ── Dates for header ─────────────────────────────────────────────
  const newest = events[0]?.timestamp;
  const oldest = events[events.length - 1]?.timestamp;

  return (
    <section style={{ display: "grid", gap: "2rem" }}>
      <Link
        href="/admin/events"
        style={{ color: "#7aa2f7", fontSize: "0.8rem" }}
      >
        ← back to events index
      </Link>

      {/* Header strip */}
      <header
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "1rem",
          padding: "1rem 1.25rem",
          border: "1px solid #1f2128",
          borderRadius: 4,
        }}
      >
        <Stat label="Consumer">{consumerId}</Stat>
        <Stat label="Member id">
          <code style={{ fontSize: "0.75rem" }}>{userId}</code>
        </Stat>
        <Stat label="Total events">{events.length}</Stat>
        <Stat label="Range">
          {oldest && newest ? `${fmtDate(oldest)} → ${fmtDate(newest)}` : "—"}
        </Stat>
      </header>

      {/* Hour histogram */}
      <Card title={`Hour-of-day histogram (${TZ_LABEL})`}>
        <HourHistogram histogram={histogram} />
      </Card>

      {/* Observation overlay */}
      <Card title="Latest circadian observation (EID-20)">
        {observation ? (
          <ObservationView observation={observation} />
        ) : (
          <EmptyState message="No circadian observation yet. Trigger /api/eidos/compute-circadian to write one." />
        )}
      </Card>

      {/* Baseline overlay */}
      <Card title="Circadian baseline">
        {baseline ? (
          <BaselineView baseline={baseline} />
        ) : (
          <EmptyState message="No baseline yet — requires ≥3 observations within the baseline window." />
        )}
      </Card>

      {/* Raw events */}
      <Card title={`Raw events (${events.length})`}>
        <RawEventsTable events={events} />
      </Card>
    </section>
  );
}

// ── Components ─────────────────────────────────────────────────────

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        border: "1px solid #1f2128",
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      <header
        style={{
          padding: "0.6rem 1rem",
          borderBottom: "1px solid #1f2128",
          background: "#11131a",
          fontSize: "0.8rem",
          fontWeight: 600,
          letterSpacing: "0.02em",
          opacity: 0.85,
        }}
      >
        {title}
      </header>
      <div style={{ padding: "1rem" }}>{children}</div>
    </section>
  );
}

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: "0.7rem",
          opacity: 0.55,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          marginBottom: "0.25rem",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: "0.9rem" }}>{children}</div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p style={{ opacity: 0.6, fontSize: "0.85rem" }}>{message}</p>;
}

function HourHistogram({ histogram }: { histogram: number[] }) {
  const max = Math.max(1, ...histogram);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(24, 1fr)",
        gap: "0.25rem",
        alignItems: "end",
        height: "180px",
      }}
    >
      {histogram.map((count, hour) => {
        const heightPct = (count / max) * 100;
        const isNight = hour >= 23 || hour < 4;
        const color = count === 0
          ? "#1f2128"
          : isNight
            ? "#d4a017" // late-night bars in amber
            : "#7aa2f7"; // day bars in blue
        return (
          <div
            key={hour}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.25rem",
              height: "100%",
              justifyContent: "end",
            }}
            title={`${hour.toString().padStart(2, "0")}:00 — ${count} event${count === 1 ? "" : "s"}`}
          >
            <div
              style={{
                width: "100%",
                background: color,
                borderRadius: 2,
                height: count > 0 ? `${Math.max(heightPct, 3)}%` : "2px",
              }}
            />
            <div
              style={{
                fontSize: "0.65rem",
                opacity: 0.55,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {hour.toString().padStart(2, "0")}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ObservationView({ observation }: { observation: ObservationRow }) {
  const aboveThreshold = observation.confidence >= SURFACING_THRESHOLD;
  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "1rem",
        }}
      >
        <Stat label="Centroid hour">{fmtHour(observation.centroid_hour)}</Stat>
        <Stat label="Regularity entropy">{fmtNum(observation.regularity_entropy, 3)}</Stat>
        <Stat label="Night load">{fmtPct(observation.night_load_fraction)}</Stat>
        <Stat label="Social jet lag">{fmtSigned(observation.social_jet_lag_hours, 2)} h</Stat>
        <Stat label="Sample size">{observation.sample_size}</Stat>
        <Stat label="Unique days">{observation.unique_days}</Stat>
        <Stat label="Confidence">
          <span
            style={{
              color: aboveThreshold ? "#4ade80" : "#fbbf24",
              fontWeight: 600,
            }}
          >
            {observation.confidence.toFixed(3)}
          </span>
          <span style={{ opacity: 0.55, fontSize: "0.75rem", marginLeft: 6 }}>
            {aboveThreshold ? "≥ surfacing" : "< 0.70 surfacing"}
          </span>
        </Stat>
        <Stat label="Computed">{fmtDate(observation.computed_at)}</Stat>
      </div>
      <p style={{ opacity: 0.55, fontSize: "0.75rem", margin: 0 }}>
        Window: {fmtDate(observation.window_start)} →{" "}
        {fmtDate(observation.window_end)} · Evidence has{" "}
        {observation.evidence?.event_ids?.length ?? 0} event ids and a{" "}
        {observation.evidence?.hour_histogram?.length ?? 0}-bin histogram.
      </p>
    </div>
  );
}

function BaselineView({ baseline }: { baseline: BaselineRow }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: "1rem",
      }}
    >
      <Stat label="Trait centroid">
        {fmtHour(baseline.trait_centroid_hour)}
        {baseline.trait_centroid_hour_stddev !== null && (
          <span style={{ opacity: 0.55, fontSize: "0.75rem", marginLeft: 4 }}>
            ± {baseline.trait_centroid_hour_stddev.toFixed(2)}
          </span>
        )}
      </Stat>
      <Stat label="Trait regularity">
        {fmtNum(baseline.trait_regularity_entropy, 3)}
        {baseline.trait_regularity_entropy_stddev !== null && (
          <span style={{ opacity: 0.55, fontSize: "0.75rem", marginLeft: 4 }}>
            ± {baseline.trait_regularity_entropy_stddev.toFixed(3)}
          </span>
        )}
      </Stat>
      <Stat label="Trait night load">
        {fmtPct(baseline.trait_night_load_fraction)}
        {baseline.trait_night_load_fraction_stddev !== null && (
          <span style={{ opacity: 0.55, fontSize: "0.75rem", marginLeft: 4 }}>
            ± {fmtPct(baseline.trait_night_load_fraction_stddev)}
          </span>
        )}
      </Stat>
      <Stat label="Trait jet lag">{fmtSigned(baseline.trait_social_jet_lag_hours, 2)} h</Stat>
      <Stat label="Observations rolled up">{baseline.sample_size}</Stat>
      <Stat label="Window">{baseline.window_days} days</Stat>
      <Stat label="Computed">{fmtDate(baseline.computed_at)}</Stat>
    </div>
  );
}

function RawEventsTable({ events }: { events: EventRow[] }) {
  if (events.length === 0) {
    return <EmptyState message="No events." />;
  }
  return (
    <div style={{ maxHeight: 360, overflow: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "0.8rem",
        }}
      >
        <thead style={{ position: "sticky", top: 0, background: "#0b0c10" }}>
          <tr style={{ textAlign: "left" }}>
            <Th>event_id</Th>
            <Th>type</Th>
            <Th>utc</Th>
            <Th>{TZ_LABEL}</Th>
            <Th>payload preview</Th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.event_id} style={{ borderTop: "1px solid #1f2128" }}>
              <Td>
                <code style={{ fontSize: "0.7rem", opacity: 0.8 }}>{e.event_id.slice(0, 28)}…</code>
              </Td>
              <Td>{e.type}</Td>
              <Td>{fmtDate(e.timestamp)}</Td>
              <Td>{fmtLocal(e.timestamp)}</Td>
              <Td>
                <code style={{ fontSize: "0.7rem", opacity: 0.75 }}>
                  {previewPayload(e.payload)}
                </code>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        padding: "0.4rem 0.6rem",
        textAlign: "left",
        fontWeight: 500,
        opacity: 0.7,
      }}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: "0.4rem 0.6rem" }}>{children}</td>;
}

// ── Format helpers ─────────────────────────────────────────────────

function fmtNum(value: number | null, digits: number): string {
  return value === null ? "—" : value.toFixed(digits);
}

function fmtPct(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function fmtSigned(value: number | null, digits: number): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}`;
}

function fmtHour(value: number | null): string {
  if (value === null) return "—";
  const hour = Math.floor(value);
  const min = Math.round((value - hour) * 60);
  const hh = hour.toString().padStart(2, "0");
  const mm = min.toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

function fmtDate(iso: string): string {
  // Drop subsecond + timezone for the display; full ts is in the
  // payload preview / raw event row.
  return iso.replace(/\.\d+/, "").replace("+00", "Z").replace("T", " ");
}

function fmtLocal(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function previewPayload(payload: Record<string, unknown>): string {
  if (!payload || typeof payload !== "object") return "{}";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(payload)) {
    if (parts.length >= 3) {
      parts.push("…");
      break;
    }
    const valueStr =
      typeof v === "string" ? `"${v}"` : v === null ? "null" : String(v);
    parts.push(`${k}=${valueStr.length > 30 ? valueStr.slice(0, 27) + "…" : valueStr}`);
  }
  return `{ ${parts.join(", ")} }`;
}

/**
 * Build a local-hour histogram (24 bins) from a list of UTC ISO
 * timestamps. Independently computed from the events themselves so we
 * can compare against the histogram stored inside the observation's
 * `evidence` jsonb — if they ever diverge, that's a bug.
 */
function buildLocalHourHistogram(timestamps: string[]): number[] {
  const histogram = new Array(24).fill(0) as number[];
  for (const ts of timestamps) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour: "2-digit",
        hour12: false,
      }).formatToParts(new Date(ts));
      const hourPart = parts.find((p) => p.type === "hour")?.value ?? "0";
      let hour = parseInt(hourPart, 10);
      if (hour === 24) hour = 0;
      if (hour >= 0 && hour < 24) histogram[hour] += 1;
    } catch {
      // skip malformed
    }
  }
  return histogram;
}

function ErrorPanel({ title, detail }: { title: string; detail: string }) {
  return (
    <section
      style={{
        padding: "1rem 1.25rem",
        border: "1px solid #5a2a2a",
        background: "#1c0f0f",
        borderRadius: 4,
      }}
    >
      <strong style={{ color: "#ff8080" }}>{title}</strong>
      <pre style={{ marginTop: "0.5rem", whiteSpace: "pre-wrap", fontSize: "0.8rem", opacity: 0.8 }}>
        {detail}
      </pre>
    </section>
  );
}
