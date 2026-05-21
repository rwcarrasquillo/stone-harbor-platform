import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Return to your harbor.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
