import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Messages",
  description: "Conversations with the brotherhood.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
