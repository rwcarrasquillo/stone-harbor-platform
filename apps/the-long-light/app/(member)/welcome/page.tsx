/**
 * /welcome — stub so the nav link doesn't 404 (skeleton).
 *
 * A single centered DraftPlaceholder card. This will become the
 * first-run orientation / onboarding surface. Content and voice TBD.
 */

import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { DraftPlaceholder } from "@/app/components/draftPlaceholder";

export default async function WelcomePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col items-center px-6 py-20 text-center">
      <h1 className="font-serif text-3xl text-[var(--primary)] md:text-4xl">
        Welcome.
      </h1>
      <div className="mt-6 w-full text-left">
        <DraftPlaceholder note="Authored later, after editorial review.">
          Coming next: a gentle first-run orientation — what this place is,
          what it isn&apos;t, and how to make it yours. The welcome a woman
          meets on her first night here. Voice TBD.
        </DraftPlaceholder>
      </div>
    </main>
  );
}
