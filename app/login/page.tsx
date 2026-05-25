import { redirect } from "next/navigation";
import { routing } from "@/i18n/routing";

/**
 * Stone Harbor — legacy /login redirect shim.
 *
 * Canonical login lives at /app/[locale]/login/page.tsx. See the
 * comment on /app/page.tsx for the full rationale — same situation,
 * same workaround.
 */
export default function LoginRedirect() {
  redirect(`/${routing.defaultLocale}/login`);
}
