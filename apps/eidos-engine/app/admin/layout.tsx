import type { ReactNode } from "react";

/**
 * Eidos Engine — admin layout (EID-21).
 *
 * Shared chrome for every page under /admin. Header strip with a
 * back-link to the events index. No login/logout UI — Basic Auth is
 * managed by the browser; closing the tab clears the cached
 * credentials in most browsers.
 *
 * Plain inline styles, no Tailwind, matching the root layout. Admin
 * surface is internal-only — Rafael today, eventual clinical advisor
 * later — and the visual cost is "useful, not pretty."
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: "100vh" }}>
      <header
        style={{
          padding: "1rem 2rem",
          borderBottom: "1px solid #1f2128",
          display: "flex",
          alignItems: "center",
          gap: "1.5rem",
          fontSize: "0.85rem",
        }}
      >
        <strong style={{ fontWeight: 600 }}>Eidos Admin</strong>
        <a href="/admin/events" style={{ color: "#7aa2f7" }}>
          Events index
        </a>
        <span style={{ marginLeft: "auto", opacity: 0.6 }}>
          internal · service surface
        </span>
      </header>
      <main style={{ padding: "2rem", maxWidth: 1100, margin: "0 auto" }}>
        {children}
      </main>
    </div>
  );
}
