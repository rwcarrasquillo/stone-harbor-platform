/**
 * Eidos Engine — root index.
 *
 * Deliberately minimal. Eidos is a service substrate (push-event
 * ingestion + per-construct cron compute + internal admin spot-check),
 * not a member-facing site. The member-visible behavioral inferences
 * render inside each host app (Stone Harbor's /map → Rhythm, etc.),
 * not here. This page exists only so the deployment has a 200 root.
 */
export default function Home() {
  return (
    <main style={{ padding: "3rem", maxWidth: 640 }}>
      <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Eidos Engine</h1>
      <p style={{ lineHeight: 1.6, opacity: 0.8 }}>
        Behavioral-inference service for Stone Harbor Ventures. No member
        surface lives here.
      </p>
      <p style={{ lineHeight: 1.6, opacity: 0.8 }}>
        Health: <a href="/api/health" style={{ color: "#7aa2f7" }}>/api/health</a>
      </p>
    </main>
  );
}
