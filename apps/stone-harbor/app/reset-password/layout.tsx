import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Set New Password",
  description: "Choose a new password.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
