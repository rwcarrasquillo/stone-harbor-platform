import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reading",
  description: "Stories and reflections from the harbor.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
