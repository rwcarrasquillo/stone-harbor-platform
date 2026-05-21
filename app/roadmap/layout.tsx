import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Roadmap",
  description: "Your path through Clarity, Calm, and Strength.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
