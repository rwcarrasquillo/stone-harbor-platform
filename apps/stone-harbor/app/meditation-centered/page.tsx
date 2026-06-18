import { redirect } from "next/navigation";

/**
 * Stone Harbor — /meditation-centered redirect.
 *
 * The centered preview design has been committed to production at
 * /meditation (see app/meditation/page.tsx). This route is preserved
 * temporarily as a redirect so anyone who has /meditation-centered
 * bookmarked or open in a tab lands on the production meditation
 * instead of a 404.
 *
 * The /meditation-centered directory was kept (not deleted) because
 * the dev environment that built this redirect couldn't remove it.
 * Safe to delete the entire `app/meditation-centered/` directory
 * from Finder whenever convenient — once it's gone, Next.js will
 * simply 404 the old preview URL, which is the correct end state.
 *
 * Tracked under SH-53 (chore — delete preview directories) alongside
 * the journal-centered / dashboard-centered / vent-centered redirects.
 */
export default function MeditationCenteredRedirect(): never {
  redirect("/meditation");
}
