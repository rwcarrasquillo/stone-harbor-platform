/**
 * Member-area layout — the signed-in shell.
 *
 * Everything under this route group ((member): /dashboard, /journal,
 * /map, /resources, /welcome) shares the LongLightNav chrome and the
 * bottom clearance the mobile tab bar needs. The marketing surfaces
 * (/, /login, /signup, /crisis-resources) live outside this group and
 * stay nav-free.
 *
 * The global crisis footer is rendered once in the root layout, so it
 * isn't repeated here. The `pb` on the content wrapper keeps page
 * content (and the footer beneath it) clear of the fixed bottom tab
 * bar on mobile.
 */

import { LongLightNav } from "@/app/components/longLightNav";

export default function MemberLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <LongLightNav />
      <div className="flex-1 pb-24 md:pb-12">{children}</div>
    </>
  );
}
