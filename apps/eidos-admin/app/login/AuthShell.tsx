import type { CSSProperties, ReactNode } from "react";

/**
 * Eidos Admin — shared chrome for the sign-in screens (/login, /login/mfa,
 * /login/enroll): centered card, horizon mark, title, banner and field styles.
 */

export const fieldLabelStyle: CSSProperties = {
  display: "block",
  fontSize: "0.7rem",
  opacity: 0.6,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: "0.4rem",
};

export const fieldInputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "0.6rem 0.75rem",
  fontFamily: "inherit",
  fontSize: "0.85rem",
  background: "#0a0b10",
  color: "#e6e6e6",
  border: "1px solid #2a2d36",
  borderRadius: 4,
  outline: "none",
};

export const primaryButtonStyle: CSSProperties = {
  marginTop: "1rem",
  width: "100%",
  padding: "0.6rem 0.75rem",
  fontFamily: "inherit",
  fontSize: "0.85rem",
  background: "#7aa2f7",
  color: "#0b0c10",
  border: "none",
  borderRadius: 4,
  fontWeight: 600,
  cursor: "pointer",
};

export function AuthShell({
  title,
  subtitle = "Internal-only validation surface.",
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 380,
          border: "1px solid #1f2128",
          borderRadius: 6,
          padding: "1.75rem",
          background: "#0e1015",
        }}
      >
        <header style={{ marginBottom: "1.75rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: "0.6rem",
            }}
          >
            <EidosHorizonMark />
          </div>
          <h1
            style={{
              fontSize: "0.85rem",
              margin: 0,
              fontWeight: 500,
              textAlign: "center",
              opacity: 0.75,
              letterSpacing: "0.02em",
            }}
          >
            {title}
          </h1>
          <p
            style={{
              opacity: 0.5,
              fontSize: "0.75rem",
              marginTop: "0.4rem",
              lineHeight: 1.5,
              textAlign: "center",
            }}
          >
            {subtitle}
          </p>
        </header>
        {children}
      </section>
    </main>
  );
}

export function Banner({
  tone,
  children,
}: {
  tone: "ok" | "err";
  children: ReactNode;
}) {
  const color = tone === "ok" ? "#4ade80" : "#ff8080";
  const border = tone === "ok" ? "#1e3a2b" : "#5a2a2a";
  const bg = tone === "ok" ? "#0f1a14" : "#1c0f0f";
  return (
    <p
      style={{
        marginTop: 0,
        marginBottom: "1rem",
        padding: "0.6rem 0.75rem",
        border: `1px solid ${border}`,
        background: bg,
        color,
        borderRadius: 4,
        fontSize: "0.8rem",
      }}
    >
      {children}
    </p>
  );
}

export const footnoteStyle: CSSProperties = {
  marginTop: "1.5rem",
  opacity: 0.45,
  fontSize: "0.7rem",
  lineHeight: 1.5,
};

function EidosHorizonMark() {
  return (
    <svg
      width="300"
      viewBox="0 0 540 180"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Eidos"
      role="img"
    >
      <defs>
        <radialGradient id="login_halo_outer" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#d8e6f4" stopOpacity="0.45" />
          <stop offset="55%" stopColor="#8aabcb" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#2c4868" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="login_halo_inner" cx="40%" cy="34%" r="58%">
          <stop offset="0%" stopColor="#f5faff" stopOpacity="1" />
          <stop offset="42%" stopColor="#b3cee8" stopOpacity="0.7" />
          <stop offset="80%" stopColor="#5d80a2" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#2c4868" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="120" cy="90" r="110" fill="url(#login_halo_outer)" />
      <circle cx="120" cy="90" r="70" fill="url(#login_halo_inner)" />
      <circle cx="120" cy="90" r="44" fill="#0e1015" />
      <circle
        cx="120"
        cy="90"
        r="44"
        fill="none"
        stroke="#f5faff"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1="10"
        y1="90"
        x2="530"
        y2="90"
        stroke="#ffffff"
        strokeWidth="1"
        strokeOpacity="0.9"
        vectorEffect="non-scaling-stroke"
      />
      <text
        x="210"
        y="90"
        fontFamily="'Avenir Next', Avenir, 'Helvetica Neue', ui-sans-serif, system-ui, sans-serif"
        fontSize="36"
        fontWeight="300"
        letterSpacing="5"
        fill="#ffffff"
      >
        eidos
      </text>
    </svg>
  );
}
