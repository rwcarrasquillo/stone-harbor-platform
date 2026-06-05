"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Routes that render the member chrome (LongLightNav). On mobile those
// pages have a fixed bottom tab bar, so the global crisis footer needs
// extra bottom clearance there — and only there — so its content (the
// 988 line and "More resources" link) is never hidden behind the bar.
// Marketing/login surfaces keep their original spacing untouched.
const MEMBER_ROUTE_PREFIXES = [
  "/dashboard",
  "/journal",
  "/map",
  "/resources",
  "/welcome",
];

export function LongLightCrisisFooter() {
  const pathname = usePathname();
  const inMemberArea = MEMBER_ROUTE_PREFIXES.some(
    (p) => pathname === p || pathname?.startsWith(`${p}/`),
  );

  return (
    <footer
      className={`border-t border-[var(--background-recessed)] bg-[var(--background-base)] px-6 pt-6 text-center ${
        inMemberArea ? "pb-24 md:pb-6" : "pb-6"
      }`}
    >
      <p className="font-sans text-sm text-[var(--text-secondary)] max-w-3xl mx-auto leading-relaxed">
        If tonight is harder than it should be: call or text{" "}
        <a href="tel:988" className="text-[var(--primary)] underline underline-offset-2">
          988
        </a>
        . The light is here for as long as you need it.{" "}
        <Link href="/crisis-resources" className="text-[var(--primary)] underline underline-offset-2">
          More resources
        </Link>
        .
      </p>
    </footer>
  );
}
