import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Journal",
  description: "Your private reflection space.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
