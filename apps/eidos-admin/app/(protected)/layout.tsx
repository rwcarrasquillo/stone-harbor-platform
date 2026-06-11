import type { ReactNode } from "react";

/**
 * Eidos Admin — protected layout.
 *
 * Header strip with the events index link and a Sign out button.
 * Wraps every page except /login. The Sign-out control is a POST
 * form so link-prefetchers can't accidentally sign you out.
 */
export default function ProtectedLayout({ children }: { children: ReactNode }) {
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
        <span style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
          <EidosMarkSmall />
          <strong style={{ fontWeight: 600 }}>Eidos Admin</strong>
        </span>
        <a href="/" style={{ color: "#7aa2f7" }}>
          Events index
        </a>
        <span style={{ marginLeft: "auto", opacity: 0.6 }}>
          internal · validation surface
        </span>
        <form method="POST" action="/api/auth/logout" style={{ margin: 0 }}>
          <button
            type="submit"
            style={{
              background: "transparent",
              border: "1px solid #2a2d36",
              color: "#e6e6e6",
              fontFamily: "inherit",
              fontSize: "0.75rem",
              padding: "0.3rem 0.7rem",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </form>
      </header>
      <main style={{ padding: "2rem", maxWidth: 1100, margin: "0 auto" }}>
        {children}
      </main>
    </div>
  );
}

function EidosMarkSmall() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="header_mark" cx="40%" cy="34%" r="55%">
          <stop offset="0%" stopColor="#f5faff" stopOpacity="1" />
          <stop offset="60%" stopColor="#a8c4e0" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#1a2c44" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="14" fill="url(#header_mark)" />
      <circle cx="16" cy="16" r="9" fill="#0b0c10" />
      <circle
        cx="16"
        cy="16"
        r="9"
        fill="none"
        stroke="#f5faff"
        strokeWidth="1.2"
      />
      <line
        x1="6"
        y1="16"
        x2="26"
        y2="16"
        stroke="#f5faff"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}
