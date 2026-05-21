import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Account Paused",
  description: "Account status and appeal.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
