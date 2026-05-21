import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Begin",
  description: "Create your Stone Harbor account.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
