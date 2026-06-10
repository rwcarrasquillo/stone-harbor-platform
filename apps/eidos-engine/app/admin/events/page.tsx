import Link from "next/link";

import { getServiceClient } from "@/lib/supabase/server";

/**
 * Eidos Engine — admin events index (EID-21).
 *
 * Lists every distinct `(consumer_id, member_id)` tuple that has
 * produced events, with event count and last-event timestamp. The
 * landing page for the admin spot-check surface — pick a member, jump
 * to their per-member spot-check view.
 *
 * Server component: queries Supabase directly. JS-side aggregation
 * because the dataset is tiny (dozens of events today, hundreds of
 * members at the planning horizon). When this stops being tiny we'll
 * introduce a materialised view or RPC and keep the page shape.
 */

export const dynamic = "force-dynamic";

interface EventRow {
  consumer_id: string;
  user_id: string;
  timestamp: string;
}

interface MemberRow {
  consumer_id: string;
  member_id: string;
  event_count: number;
  last_event: string;
}

export default async function EventsIndexPage() {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("eidos_event_stream")
    .select("consumer_id, user_id, timestamp")
    .order("timestamp", { ascending: false });

  if (error) {
    return (
      <ErrorPanel
        title="Failed to read eidos_event_stream"
        detail={error.message}
      />
    );
  }

  const events = (data ?? []) as EventRow[];

  // Aggregate (consumer_id, user_id) → { event_count, last_event }.
  // Since we ordered DESC, the first occurrence we see is the most
  // recent timestamp.
  const byMember = new Map<string, MemberRow>();
  for (const ev of events) {
    const key = `${ev.consumer_id}::${ev.user_id}`;
    const existing = byMember.get(key);
    if (existing) {
      existing.event_count += 1;
    } else {
      byMember.set(key, {
        consumer_id: ev.consumer_id,
        member_id: ev.user_id,
        event_count: 1,
        last_event: ev.timestamp,
      });
    }
  }

  const members = Array.from(byMember.values()).sort((a, b) =>
    a.last_event < b.last_event ? 1 : -1,
  );

  return (
    <section>
      <h1 style={{ fontSize: "1.1rem", marginBottom: "0.25rem" }}>
        Event-stream members
      </h1>
      <p style={{ opacity: 0.6, fontSize: "0.85rem", marginBottom: "1.5rem" }}>
        Every consumer × member tuple that has produced events. Click into one
        to see the histogram and the latest circadian observation overlay.
      </p>

      {members.length === 0 ? (
        <p style={{ opacity: 0.6 }}>No events yet.</p>
      ) : (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "0.85rem",
          }}
        >
          <thead>
            <tr style={{ textAlign: "left", opacity: 0.6 }}>
              <Th>Consumer</Th>
              <Th>Member id</Th>
              <Th align="right">Events</Th>
              <Th>Last event</Th>
              <Th>Spot-check</Th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr
                key={`${m.consumer_id}::${m.member_id}`}
                style={{ borderTop: "1px solid #1f2128" }}
              >
                <Td>{m.consumer_id}</Td>
                <Td>
                  <code style={{ opacity: 0.85 }}>{m.member_id}</code>
                </Td>
                <Td align="right">{m.event_count}</Td>
                <Td>
                  <span style={{ opacity: 0.8 }}>
                    {fmtIso(m.last_event)}
                  </span>
                </Td>
                <Td>
                  <Link
                    href={`/admin/spot-check/${encodeURIComponent(
                      m.consumer_id,
                    )}/${encodeURIComponent(m.member_id)}`}
                    style={{ color: "#7aa2f7" }}
                  >
                    open →
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      style={{
        padding: "0.5rem 0.75rem",
        textAlign: align,
        fontWeight: 500,
        opacity: 0.7,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td style={{ padding: "0.5rem 0.75rem", textAlign: align }}>{children}</td>
  );
}

function fmtIso(ts: string): string {
  // Trim trailing nanoseconds + timezone for readability. The full ts
  // is one Inspect-Element away if anyone needs it.
  return ts.replace(/\.\d+/, "").replace("+00", "Z");
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
      <pre
        style={{
          marginTop: "0.5rem",
          whiteSpace: "pre-wrap",
          fontSize: "0.8rem",
          opacity: 0.8,
        }}
      >
        {detail}
      </pre>
    </section>
  );
}
