import { redirect } from "next/navigation";

/**
 * Stone Harbor — /journal-centered redirect.
 *
 * The centered preview design has been committed to production at
 * /journal (see app/journal/page.tsx). This route is preserved
 * temporarily as a redirect so anyone who has /journal-centered
 * bookmarked or open in a tab lands on the production journal
 * instead of a 404.
 *
 * The /journal-centered directory was kept (not deleted) because the
 * dev environment that built this redirect couldn't remove it. Safe
 * to delete the entire `app/journal-centered/` directory from Finder
 * whenever convenient — once it's gone, Next.js will simply 404 the
 * old preview URL, which is the correct end state.
 */
export default function JournalCenteredRedirect(): never {
  redirect("/journal");
}