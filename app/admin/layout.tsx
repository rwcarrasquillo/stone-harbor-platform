import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Console",
  description: "Stone Harbor administration.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
