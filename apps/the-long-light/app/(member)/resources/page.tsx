/**
 * /resources — stub so the nav link doesn't 404 (skeleton).
 *
 * A single centered DraftPlaceholder card. Real content (support lines,
 * what-to-do-tonight guidance, links) is authored later. Note: this is
 * the in-app resources surface, distinct from the global /crisis-resources
 * page, which stays as-is from Phase 1.
 */

import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { DraftPlaceholder } from "@/app/components/draftPlaceholder";

export default async function ResourcesPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col items-center px-6 py-20 text-center">
      <h1 className="font-serif text-3xl text-[var(--primary)] md:text-4xl">
        Resources.
      </h1>
      <div className="mt-6 w-full text-left">
        <DraftPlaceholder note="Authored later, after editorial review.">
          Coming next: a calm, in-app place for support — what to do on the
          hard nights, who to reach, and gentler things to try first. Content
          and voice TBD.
        </DraftPlaceholder>
      </div>
    </main>
  );
}
