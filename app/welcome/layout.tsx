import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your Profile",
  description: "Edit your Stone Harbor profile.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
