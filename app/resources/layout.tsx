import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Resources",
  description: "Help when you need it.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
