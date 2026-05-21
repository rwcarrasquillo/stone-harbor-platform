import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What we do with your words.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
