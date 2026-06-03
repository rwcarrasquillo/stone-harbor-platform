import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Welcome",
  description: "A quiet walk into the harbor.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
