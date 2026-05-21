import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Join",
  description: "Begin with Stone Harbor.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
