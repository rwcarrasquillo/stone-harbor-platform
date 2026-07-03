import { redirect } from "next/navigation";

/**
 * /welcome is retired. The profile editor it used to host now lives at
 * the dedicated /profile surface (harbor-vocabulary composition, split
 * out of this page). This stub keeps old bookmarks, links and the
 * dashboard's day-90 lineage deep-link working by redirecting here.
 *
 * /welcome is a Phase 2 root page (no [locale] segment; locale resolves
 * from the NEXT_LOCALE cookie), so the redirect target is the bare
 * canonical path. Hash fragments (e.g. /welcome#lineage) are never sent
 * to the server, so the browser re-applies them to /profile after the
 * redirect — /welcome#lineage lands at /profile#lineage.
 */
export default function WelcomeRedirect() {
  redirect("/profile");
}
