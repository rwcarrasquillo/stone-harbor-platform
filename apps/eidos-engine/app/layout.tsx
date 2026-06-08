import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Eidos Engine",
  description:
    "Standalone behavioral-inference engine for Stone Harbor Ventures. Service surface — not a member-facing site.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          background: "#0b0c10",
          color: "#e6e6e6",
        }}
      >
        {children}
      </body>
    </html>
  );
}
