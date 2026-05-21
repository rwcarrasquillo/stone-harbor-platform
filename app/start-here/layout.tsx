import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Start Here",
  description: "Your first steps with Stone Harbor.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
