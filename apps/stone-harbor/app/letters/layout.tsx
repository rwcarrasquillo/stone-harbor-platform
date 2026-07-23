import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Letters",
  description: "Letters from the harbor — original writing from the Stone Harbor team.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
