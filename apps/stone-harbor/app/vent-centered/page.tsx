import { redirect } from "next/navigation";

/**
 * Stone Harbor — /vent-centered redirect.
 *
 * The centered preview design has been committed to production at
 * /vent (see app/vent/page.tsx). This route is preserved temporarily
 * as a redirect so anyone who has /vent-centered bookmarked or open
 * in a tab lands on the production vent instead of a 404.
 *
 * The /vent-centered directory was kept (not deleted) because the dev
 * environment that built this redirect couldn't remove it. Safe to
 * delete the entire `app/vent-centered/` directory from Finder
 * whenever convenient — once it's gone, Next.js will simply 404 the
 * old preview URL, which is the correct end state.
 */
export default function VentCenteredRedirect(): never {
  redirect("/vent");
}
