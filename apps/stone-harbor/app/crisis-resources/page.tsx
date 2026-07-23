import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { serif, sans } from "@/lib/fonts";

/**
 * Stone Harbor — /crisis-resources (SH-105, Ship 1 of crisis intervention).
 *
 * The public crisis directory. Reachable signed-out (middleware
 * allow-lists it in PHASE_2_PAGES), linked from the CrisisFooter's 988
 * band and from the CrisisModal the Map's safety evaluator surfaces.
 *
 * Content is founder-authored and copy-verbatim from
 * stone-harbor-docs/legal-and-ops/Stone_Harbor_Crisis_Resources_Page.md.
 * Every phone number, short code, and URL on this page is authoritative.
 * Do not paraphrase the copy and do not "tidy" a number — if one looks
 * wrong, flag it; the numbers were reviewed by the founder and the
 * markdown is the source of truth. Reviewed for accuracy June 2026;
 * the doc asks for a re-check every six months.
 *
 * Deliberate non-features — someone landing here may be in acute
 * distress, and every one of these would be friction between them and
 * a phone number:
 *
 *   - No entrance animation, no cascade, no HairlineLens, no
 *     framer-motion. The page is simply there when it loads.
 *   - No auth guard, no useAuth, no account gate, no email capture.
 *   - No progressive disclosure. Everything is visible by default.
 *
 * Server component so the copy is in the first HTML payload rather than
 * behind a hydration boundary, and so the page is indexable. Locale
 * comes from i18n/request.ts (NEXT_LOCALE cookie for root-path pages);
 * the root layout's `dynamic = "force-dynamic"` means that resolution
 * happens per request rather than being baked in at build time.
 *
 * Color note: --sh-accent-gold is #a9793d on Sunlit, which is 3.8:1
 * against the white card fill — under the 4.5:1 this page holds itself
 * to. So gold lives on the accent rules and focus rings here, and every
 * piece of text uses --sh-text-primary or --sh-text-secondary, both of
 * which clear 4.5:1 on every surface this page paints in both themes.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("crisisResources.meta");

  return {
    // `absolute` bypasses the root layout's "%s · Stone Harbor" title
    // template — the founder-specified title already carries the brand,
    // and the template would render "… — Stone Harbor · Stone Harbor".
    title: { absolute: t("title") },
    description: t("description"),
    alternates: {
      canonical: "/crisis-resources",
      languages: {
        en: "/crisis-resources",
        es: "/es/crisis-resources",
      },
    },
    robots: { index: true, follow: true },
  };
}

/**
 * One tappable affordance on a resource — a tel:, sms:, mailto:, or
 * https: destination.
 *
 * Hrefs live here in the component rather than in messages/*.json, and
 * that is a safety decision, not a convenience one: a phone number
 * duplicated across en.json and es.json is a phone number that can
 * silently diverge in one locale. The label text is translated; the
 * number it dials is written once.
 */
type Action = {
  /** Message key for the visible label, relative to the resource. */
  key: string;
  href: string;
  /** Message key for plain text rendered beside the link, not inside it. */
  suffixKey?: string;
  /** https: destinations open in a new tab so this page stays put. */
  external?: boolean;
};

type Resource = {
  /** Message key for the resource, relative to its section. */
  id: string;
  actions: Action[];
  /**
   * Message key for the closing line under the actions. Defaults to
   * "hours"; `null` for the resources the content doc gives no closing
   * line at all (the two Florida website-only entries).
   */
  noteKey?: string | null;
};

const PRIMARY: Resource[] = [
  {
    id: "988",
    actions: [
      { key: "call", href: "tel:988" },
      { key: "text", href: "sms:988" },
      { key: "chat", href: "https://988lifeline.org/chat/", external: true },
    ],
  },
  {
    id: "ctl",
    actions: [
      { key: "text", href: "sms:741741?body=HOME", suffixKey: "regions" },
    ],
  },
  {
    id: "veterans",
    actions: [
      // "Call: 988, then press 1" — the tel: dials 988; the press-1
      // branch is spoken by the 988 menu, not dialable from a URL.
      { key: "call", href: "tel:988" },
      { key: "text", href: "sms:838255" },
      {
        key: "chat",
        href: "https://www.veteranscrisisline.net/get-help-now/chat/",
        external: true,
      },
    ],
  },
  {
    id: "911",
    actions: [{ key: "call", href: "tel:911" }],
    noteKey: "international",
  },
];

const SECONDARY: Resource[] = [
  {
    id: "trevor",
    actions: [
      { key: "call", href: "tel:18664887386" },
      { key: "text", href: "sms:678678?body=START" },
      {
        key: "chat",
        href: "https://www.thetrevorproject.org/get-help/",
        external: true,
      },
    ],
  },
  {
    id: "samhsa",
    actions: [{ key: "call", href: "tel:18006624357" }],
  },
  {
    id: "dv",
    actions: [
      { key: "call", href: "tel:18007997233" },
      { key: "text", href: "sms:88788?body=START" },
      { key: "chat", href: "https://www.thehotline.org/", external: true },
    ],
  },
  {
    id: "postvention",
    actions: [
      { key: "afsp", href: "https://afsp.org/find-support/", external: true },
      {
        key: "allianceOfHope",
        href: "https://allianceofhope.org/",
        external: true,
      },
    ],
  },
  {
    id: "rainn",
    actions: [
      { key: "call", href: "tel:18006564673" },
      { key: "chat", href: "https://www.rainn.org/", external: true },
    ],
  },
];

const FLORIDA: Resource[] = [
  {
    id: "211",
    actions: [
      { key: "call", href: "tel:211" },
      { key: "chat", href: "https://www.211florida.org/", external: true },
    ],
  },
  {
    id: "veterans",
    actions: [
      {
        key: "website",
        href: "https://floridaveteransfoundation.org/",
        external: true,
      },
    ],
    noteKey: null,
  },
  {
    id: "dcf",
    actions: [
      {
        key: "website",
        href: "https://www.myflfamilies.com/services/mental-health-substance-abuse",
        external: true,
      },
    ],
    noteKey: null,
  },
];

const ESPANOL: Resource[] = [
  {
    id: "988es",
    actions: [
      { key: "call", href: "tel:988" },
      { key: "text", href: "sms:988?body=AYUDA", suffixKey: "textNote" },
      {
        key: "chat",
        href: "https://988lineadeayuda.org/chat/",
        external: true,
      },
    ],
  },
  {
    id: "ctles",
    actions: [{ key: "text", href: "sms:741741?body=AYUDA" }],
  },
  {
    id: "samhsaes",
    actions: [{ key: "call", href: "tel:18006624357" }],
  },
];

const INTERNATIONAL: Resource[] = [
  {
    id: "canada",
    actions: [
      { key: "call", href: "tel:18334564566" },
      { key: "text", href: "sms:45645" },
    ],
  },
  { id: "uk", actions: [{ key: "call", href: "tel:116123" }] },
  { id: "ireland", actions: [{ key: "call", href: "tel:116123" }] },
  { id: "australia", actions: [{ key: "call", href: "tel:131114" }] },
  { id: "mexico", actions: [{ key: "call", href: "tel:5552598121" }] },
  {
    id: "worldwide",
    actions: [
      { key: "link", href: "https://findahelpline.com/", external: true },
    ],
  },
];

/**
 * 44px minimum touch target, per the content doc's mobile note.
 *
 * No focus-ring utilities here on purpose. globals.css carries an
 * UNLAYERED `:focus-visible { outline: 2px solid <gold>; outline-offset:
 * 2px }`, and unlayered rules beat anything in Tailwind's
 * `@layer utilities` no matter how specific — so per-element
 * focus-visible:outline-* classes on this page compile fine and then do
 * nothing. Verified by keyboard-tabbing the rendered page: the ring is
 * 2px solid gold at 2px offset in both themes, from the global rule.
 */
const ACTION_CLASS =
  `inline-flex min-h-[44px] items-center border-l-2 border-[var(--sh-accent-gold)] ` +
  `bg-[var(--sh-bg-card)] px-3 py-2.5 text-sm font-medium leading-snug ` +
  `text-[var(--sh-text-primary)] transition hover:bg-[var(--sh-bg-card-tinted-hover)] ` +
  `md:text-[0.95rem]`;

export default async function CrisisResourcesPage() {
  const t = await getTranslations("crisisResources");

  /**
   * One affordance. The accessible name pairs the label with the
   * resource it belongs to, so a screen reader announces "Call: 988,
   * 988 Suicide and Crisis Lifeline" rather than a bare number read out
   * of context — and flags the new tab on external destinations.
   */
  const action = (path: string, name: string, a: Action) => {
    const label = t(`${path}.${a.key}`);

    return (
      <div key={a.key} className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <a
          href={a.href}
          {...(a.external
            ? { target: "_blank", rel: "noopener noreferrer" }
            : {})}
          aria-label={
            a.external
              ? `${label} — ${name}, ${t("newTab")}`
              : `${label} — ${name}`
          }
          className={ACTION_CLASS}
        >
          {label}
        </a>
        {a.suffixKey && (
          <span className="text-sm text-[var(--sh-text-secondary)]">
            {t(`${path}.${a.suffixKey}`)}
          </span>
        )}
      </div>
    );
  };

  /**
   * One resource block. `primary` gets the filled card and an <h2>,
   * because the four immediate lines sit directly under the hero with
   * no section header of their own (the content doc calls for going
   * straight into them). Everything else lives under a section <h2> and
   * so takes an <h3>. No level is skipped in either case.
   */
  const resource = (
    section: string,
    r: Resource,
    variant: "primary" | "standard",
  ) => {
    const path = `${section}.${r.id}`;
    const name = t(`${path}.name`);
    const isPrimary = variant === "primary";
    const Heading = isPrimary ? "h2" : "h3";

    return (
      <article
        key={r.id}
        className={
          isPrimary
            ? "bg-[var(--sh-bg-card-tinted)] p-4 md:p-5"
            : "border-t border-[var(--sh-border-subtle)] pt-5 first:border-t-0 first:pt-0"
        }
      >
        <Heading className="text-base font-semibold leading-snug text-[var(--sh-text-primary)] md:text-lg">
          {name}
        </Heading>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--sh-text-secondary)] md:text-[0.95rem]">
          {t(`${path}.purpose`)}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {r.actions.map((a) => action(path, name, a))}
        </div>
        {r.noteKey !== null && (
          <p className="mt-3 text-sm leading-relaxed text-[var(--sh-text-secondary)]">
            {t(`${path}.${r.noteKey ?? "hours"}`)}
          </p>
        )}
      </article>
    );
  };

  /** A titled section: serif <h2> header, then its resources. */
  const section = (id: string, resources: Resource[]) => (
    <section aria-labelledby={`crisis-${id}`} className="mt-12">
      <h2
        id={`crisis-${id}`}
        className={`${serif.className} text-xl font-medium leading-snug text-[var(--sh-text-primary)] md:text-2xl`}
      >
        {t(`${id}.sectionHeader`)}
      </h2>
      <div className="mt-5 space-y-5">
        {resources.map((r) => resource(id, r, "standard"))}
      </div>
    </section>
  );

  return (
    <main
      className={`${sans.className} min-h-screen bg-[var(--sh-bg-page)] text-[var(--sh-text-primary)]`}
    >
      {/* max-w-[720px] is the harbor's canonical reading measure. The
          primary four land first; the deeper directory scrolls below. */}
      <div className="mx-auto w-full max-w-[720px] px-5 pb-16 pt-8 md:px-6 md:pt-14">
        <header>
          <h1
            className={`${serif.className} text-[1.6rem] font-medium italic leading-tight text-[var(--sh-text-primary)] md:text-4xl`}
          >
            {t("hero.title")}
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-[var(--sh-text-secondary)] md:text-base">
            {t("hero.body")}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-[var(--sh-text-secondary)] md:text-base">
            {t("hero.epilogue")}
          </p>
        </header>

        {/* The immediate four. No section header — the content doc goes
            straight from the hero into them — so the group carries an
            aria-label instead of a visible heading. */}
        <section aria-label={t("primary.aria")} className="mt-7 space-y-3">
          {PRIMARY.map((r) => resource("primary", r, "primary"))}
        </section>

        {section("secondary", SECONDARY)}
        {section("florida", FLORIDA)}
        {section("espanol", ESPANOL)}

        <section aria-labelledby="crisis-international" className="mt-12">
          <h2
            id="crisis-international"
            className={`${serif.className} text-xl font-medium leading-snug text-[var(--sh-text-primary)] md:text-2xl`}
          >
            {t("international.sectionHeader")}
          </h2>
          <ul className="mt-5 space-y-5">
            {INTERNATIONAL.map((r) => {
              const path = `international.${r.id}`;
              const country = t(`${path}.country`);
              // The worldwide directory row is a bare link with no
              // organization name beside it.
              const org = r.id === "worldwide" ? null : t(`${path}.org`);

              return (
                <li
                  key={r.id}
                  className="border-t border-[var(--sh-border-subtle)] pt-5 first:border-t-0 first:pt-0"
                >
                  <p className="text-sm font-semibold leading-snug text-[var(--sh-text-primary)] md:text-[0.95rem]">
                    {country}
                    {org && (
                      <>
                        <span
                          aria-hidden="true"
                          className="mx-2 font-normal text-[var(--sh-text-secondary)]"
                        >
                          ·
                        </span>
                        <span className="font-normal text-[var(--sh-text-secondary)]">
                          {org}
                        </span>
                      </>
                    )}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {r.actions.map((a) =>
                      action(path, org ? `${country} — ${org}` : country, a),
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Closing note — a <div>, not a <section>. A <section> with no
            accessible name isn't exposed as a landmark anyway, and this
            is a sign-off rather than another directory of resources. */}
        <div className="mt-14 border-t border-[var(--sh-border-subtle)] pt-8">
          <p className="text-sm leading-relaxed text-[var(--sh-text-secondary)] md:text-base">
            {t.rich("closing.body", {
              mail: (chunks) => (
                <a
                  href="mailto:rafael@stoneharborapp.com"
                  className="font-medium text-[var(--sh-text-primary)] underline underline-offset-4"
                >
                  {chunks}
                </a>
              ),
            })}
          </p>
          <p
            className={`${serif.className} mt-5 text-base italic leading-snug text-[var(--sh-text-primary)] md:text-lg`}
          >
            {t("closing.signature")}
          </p>
        </div>
      </div>
    </main>
  );
}
