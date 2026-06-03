import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description: "What Stone Harbor is, and isn't.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
