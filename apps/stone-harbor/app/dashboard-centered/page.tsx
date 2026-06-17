import { redirect } from "next/navigation";

/**
 * Stone Harbor — /dashboard-centered redirect.
 *
 * The centered preview design has been committed to production at
 * /dashboard (see app/dashboard/page.tsx). This route is preserved
 * temporarily as a redirect so anyone who has /dashboard-centered
 * bookmarked or open in a tab lands on the production dashboard
 * instead of a 404.
 *
 * The /dashboard-centered directory was kept (not deleted) because
 * the dev environment that built this redirect couldn't remove it.
 * Safe to delete the entire `app/dashboard-centered/` directory from
 * Finder whenever convenient — once it's gone, Next.js will simply
 * 404 the old preview URL, which is the correct end state.
 */
export default function DashboardCenteredRedirect(): never {
  redirect("/dashboard");
}
