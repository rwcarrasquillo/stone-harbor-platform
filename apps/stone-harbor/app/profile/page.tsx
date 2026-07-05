"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { trackMilestone } from "@/lib/memberUsage";
import { serif, sans } from "@/lib/fonts";
import { InactivityGate } from "@/app/components/inactivityGate";
import { AnchorMark } from "@/app/components/anchorMark";
import { HorizonSegment } from "@/app/components/horizonSegment";
import { HairlineLens } from "@/app/components/hairlineLens";
import { useTheme, type Theme } from "@/app/components/themeProvider";
import { UnsavedChangesModal } from "@/app/components/unsavedChangesModal";
import { useUnsavedChangesWarning } from "@/lib/hooks/useUnsavedChangesWarning";
import { LineageSection } from "@/app/components/lineageSection";
import { Toast, type ToastState } from "@/app/components/toast";
import { cascadeFadeUp, cascadeTransition } from "@/lib/motion";
import { FEATURE_THRESHOLDS, isFeatureUnlocked } from "@/lib/userProgress";

/**
 * Stone Harbor — Profile route (production, harbor-vocabulary composition).
 *
 * This is the dedicated account/profile surface, split out of the old
 * /welcome page (SH ship: split /welcome into /profile). It carries the
 * same harbor vocabulary as /journal, /vent and /dashboard — top brand
 * header (anchor + "Stone Harbor · Profile"), anchor strip with the
 * page's intention, a centered max-w-[720px] editing column, horizon
 * mark + voice signature, crisis footer permanently visible via the
 * body-level layout mount.
 *
 * Routing note: /profile is a Phase 2 root page (app/profile/page.tsx,
 * NO [locale] segment). Locale resolves from the NEXT_LOCALE cookie at
 * request time, exactly like /journal and /vent. The middleware's
 * PHASE_2_PAGES set carries "profile" so a stray /en/profile 308s to
 * the canonical /profile. /welcome is now a thin redirect stub that
 * lands here.
 *
 * The save path is a straight port of the old /welcome saveProfile:
 * avatar upload → Supabase Storage → public URL, company-suggestion
 * resolution, birth-date string→int conversion, known_languages array,
 * updated_at. The only behavioral change from /welcome is the save
 * DISCIPLINE — an explicit Save button that stays on the page and
 * fires a toast, disabled until something actually changes, guarded by
 * useUnsavedChangesWarning — matching /journal and /vent rather than
 * /welcome's old redirect-to-dashboard.
 */

type CompanySuggestion = {
  name: string;
  domain: string;
  logo: string;
};

type ProfileForm = {
  email: string;
  display_name: string;
  username: string;
  pronouns: string;
  bio: string;
  location: string;
  healing_stage: string;
  privacy_level: string;
  avatar_url: string;
  cover_url: string;
  work: string;
  work_company_name: string;
  work_company_logo_url: string;
  work_company_domain: string;
  education: string;
  hometown: string;
  relationship_status: string;
  website: string;
  interests: string;
  favorite_quote: string;
  // Birthday — string form fields (empty = unset); converted to
  // int/bool in saveProfile via parseBirthdayForSave().
  birth_month: string;
  birth_day: string;
  birth_year: string;
  acknowledge_birthday: boolean;
  seasonal_acknowledgments_enabled: boolean;
  // Lineage — three optional prompts surfaced via LineageSection once
  // the day-90 disclosure threshold is reached.
  lineage_father_grief: string;
  lineage_father_anger: string;
  lineage_pattern_to_leave: string;
  // known_languages — text[] of canonical lowercase English slugs.
  // See migration profile_001_known_languages.sql. Defaults to
  // ['english'] on load when null/empty.
  known_languages: string[];
  // Visual preference — member-level theme. Edited here as a plain
  // form field for dirty-tracking; on save it's both persisted to
  // profiles.theme_preference and pushed through ThemeProvider's
  // setTheme() so the live theme flips without a page reload.
  theme_preference: Theme;
};

type FieldErrors = {
  username?: string;
  website?: string;
  birthday?: string;
};

// Canonical language keys for the Known Languages multi-select. Stored
// in the DB exactly as written here (lowercase English). NOTE: the ship
// spec asked to narrow this to en/es only, but doing so would silently
// drop any other language a member has already stored on save, so the
// full set is preserved. Founder follow-up: confirm whether the set
// should shrink (needs a data migration).
const knownLanguageOptions = [
  "english",
  "spanish",
  "portuguese",
  "french",
  "italian",
  "german",
  "mandarin",
  "arabic",
  "russian",
  "hindi",
  "japanese",
  "korean",
  "tagalog",
  "vietnamese",
  "other",
] as const;

const relationshipOptions = [
  "Prefer not to say",
  "Single",
  "In a relationship",
  "Married",
  "Separated",
  "Divorced",
  "Widowed",
  "Co-parenting",
  "Complicated",
  "Healing",
  "Focused on myself",
];

// NOTE: the ship spec asked to narrow healing_stage to clarity/calm/
// strength, but existing rows store these six capitalized values and
// other surfaces read them. Collapsing the set is a data-model
// migration (out of this PR's "UI port, no backend logic" scope), so
// the existing set is preserved. Founder follow-up.
const healingStageOptions = [
  "Clarity",
  "Rebuilding",
  "Healing",
  "Growing",
  "Surviving",
  "Thriving",
];

const privacyOptions = ["Private", "Members Only", "Friends Only", "Public"];

const educationOptions = [
  "Prefer not to say",
  "High School",
  "GED",
  "Some College",
  "Associate Degree",
  "Bachelor’s Degree",
  "Master’s Degree",
  "MBA",
  "Doctorate / PhD",
  "Trade School",
  "Technical Certification",
  "Military Training",
  "Self-Taught",
  "Currently Studying",
  "Other",
];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const EMPTY_FORM: ProfileForm = {
  email: "",
  display_name: "",
  username: "",
  pronouns: "",
  bio: "",
  location: "",
  healing_stage: "Clarity",
  privacy_level: "Private",
  avatar_url: "",
  cover_url: "",
  work: "",
  work_company_name: "",
  work_company_logo_url: "",
  work_company_domain: "",
  education: "Prefer not to say",
  hometown: "",
  relationship_status: "Prefer not to say",
  website: "",
  interests: "",
  favorite_quote: "",
  birth_month: "",
  birth_day: "",
  birth_year: "",
  acknowledge_birthday: true,
  seasonal_acknowledgments_enabled: true,
  lineage_father_grief: "",
  lineage_father_anger: "",
  lineage_pattern_to_leave: "",
  known_languages: ["english"],
  theme_preference: "sunlit",
};

export default function ProfilePage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("profile");
  // Live theme + setter from the provider. `theme` seeds the visual-
  // preferences radio on load; `setTheme` is fired on save so the
  // change repaints immediately (it also mirrors cookie + DB).
  const { theme, setTheme } = useTheme();

  const [userId, setUserId] = useState<string | null>(null);
  // Account age for progressive disclosure — the Lineage section is
  // hidden until day 90+ (same gate /welcome and /lineage use).
  const [userCreatedAt, setUserCreatedAt] = useState<string | null>(null);
  const [lineageDefaultCollapsed, setLineageDefaultCollapsed] =
    useState(false);

  const [formData, setFormData] = useState<ProfileForm>(EMPTY_FORM);
  // Baseline snapshot of the last-saved form, used to compute the
  // dirty flag (Save disabled until something changes; unsaved-changes
  // guard armed while dirty).
  const [savedSnapshot, setSavedSnapshot] = useState(
    JSON.stringify(EMPTY_FORM),
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);

  const [companySuggestions, setCompanySuggestions] = useState<
    CompanySuggestion[]
  >([]);
  const [searchingCompanies, setSearchingCompanies] = useState(false);

  const [toast, setToast] = useState<ToastState>(null);
  const fail = (msg: string) => setToast({ tone: "error", text: msg });

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // Dirty when the form diverges from the last-saved snapshot OR a new
  // avatar/cover file is staged for upload.
  const isDirty =
    JSON.stringify(formData) !== savedSnapshot ||
    avatarFile !== null ||
    coverFile !== null;
  const unsaved = useUnsavedChangesWarning(isDirty);

  const avatarPreview = avatarFile
    ? URL.createObjectURL(avatarFile)
    : formData.avatar_url;

  const coverPreview = coverFile
    ? URL.createObjectURL(coverFile)
    : formData.cover_url;

  // ───── Auth + load ─────
  useEffect(() => {
    let cancelled = false;

    async function checkUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!user) {
        router.replace("/login");
        return;
      }

      // Suspension gate — suspended members cannot edit their profile.
      const { data: gateRow } = await supabase
        .from("profiles")
        .select("suspended_at, created_at")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;

      if (gateRow?.suspended_at) {
        router.replace("/suspended");
        return;
      }

      setUserId(user.id);
      setUserCreatedAt(gateRow?.created_at ?? null);

      const { data, error } = await supabase
        .from("profiles")
        .select(
          "email, display_name, username, pronouns, bio, location, healing_stage, privacy_level, avatar_url, cover_url, work, work_company_name, work_company_logo_url, work_company_domain, education, hometown, relationship_status, website, interests, favorite_quote, birth_month, birth_day, birth_year, acknowledge_birthday, seasonal_acknowledgments_enabled, lineage_father_grief, lineage_father_anger, lineage_pattern_to_leave, lineage_section_visit_count, known_languages, theme_preference",
        )
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;

      if (error) {
        fail(t("toasts.error"));
      }

      const loaded: ProfileForm = {
        email: data?.email ?? user.email ?? "",
        display_name: data?.display_name ?? "",
        username: data?.username ?? "",
        pronouns: data?.pronouns ?? "",
        bio: data?.bio ?? "",
        location: data?.location ?? "",
        healing_stage: data?.healing_stage ?? "Clarity",
        privacy_level: data?.privacy_level ?? "Private",
        avatar_url: data?.avatar_url ?? "",
        cover_url: data?.cover_url ?? "",
        work: data?.work ?? "",
        work_company_name: data?.work_company_name ?? "",
        work_company_logo_url: data?.work_company_logo_url ?? "",
        work_company_domain: data?.work_company_domain ?? "",
        education: data?.education ?? "Prefer not to say",
        hometown: data?.hometown ?? "",
        relationship_status: data?.relationship_status ?? "Prefer not to say",
        website: data?.website ?? "",
        interests: data?.interests ?? "",
        favorite_quote: data?.favorite_quote ?? "",
        birth_month: data?.birth_month != null ? String(data.birth_month) : "",
        birth_day: data?.birth_day != null ? String(data.birth_day) : "",
        birth_year: data?.birth_year != null ? String(data.birth_year) : "",
        acknowledge_birthday: data?.acknowledge_birthday ?? true,
        seasonal_acknowledgments_enabled:
          data?.seasonal_acknowledgments_enabled ?? true,
        lineage_father_grief: data?.lineage_father_grief ?? "",
        lineage_father_anger: data?.lineage_father_anger ?? "",
        lineage_pattern_to_leave: data?.lineage_pattern_to_leave ?? "",
        known_languages:
          (data?.known_languages as string[] | null | undefined) &&
          (data?.known_languages as string[]).length > 0
            ? (data?.known_languages as string[])
            : ["english"],
        // Prefer the stored preference; fall back to the live theme
        // the provider already reconciled from cookie/DB on mount.
        theme_preference:
          data?.theme_preference === "sunlit" ||
          data?.theme_preference === "dusk"
            ? (data.theme_preference as Theme)
            : theme,
      };

      setFormData(loaded);
      setSavedSnapshot(JSON.stringify(loaded));

      // Lineage auto-collapse bookkeeping — mirrors the old /welcome
      // logic. Increment lineage_section_visit_count while all three
      // fields are empty and below the threshold; after 3 blank visits
      // the section default-collapses. A #lineage deep-link always
      // opens it expanded.
      const COLLAPSE_AFTER_VISITS = 3;
      const lineageEmpty =
        !(data?.lineage_father_grief ?? "").trim() &&
        !(data?.lineage_father_anger ?? "").trim() &&
        !(data?.lineage_pattern_to_leave ?? "").trim();
      const currentVisitCount =
        (data as { lineage_section_visit_count?: number } | null)
          ?.lineage_section_visit_count ?? 0;
      let effectiveVisitCount = currentVisitCount;
      if (lineageEmpty && currentVisitCount < COLLAPSE_AFTER_VISITS) {
        effectiveVisitCount = currentVisitCount + 1;
        void supabase
          .from("profiles")
          .update({ lineage_section_visit_count: effectiveVisitCount })
          .eq("id", user.id);
      }
      const deepLinkedToLineage =
        typeof window !== "undefined" &&
        window.location.hash === "#lineage";
      setLineageDefaultCollapsed(
        !deepLinkedToLineage &&
          lineageEmpty &&
          effectiveVisitCount >= COLLAPSE_AFTER_VISITS,
      );

      setLoading(false);
    }

    checkUser();
    return () => {
      cancelled = true;
    };
  }, [router, t]);

  // ───── Hash-aware scroll (deep-link to #lineage) ─────
  useEffect(() => {
    if (loading) return;
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash) return;
    const targetId = hash.replace(/^#/, "");
    if (!targetId) return;

    let attempts = 0;
    const maxAttempts = 8;
    let timer: ReturnType<typeof setTimeout>;

    const tryScroll = () => {
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      attempts += 1;
      if (attempts < maxAttempts) {
        timer = setTimeout(tryScroll, 80);
      }
    };

    timer = setTimeout(tryScroll, 50);
    return () => clearTimeout(timer);
  }, [loading]);

  // ───── Company suggestions ─────
  async function searchCompanies(query: string) {
    setFormData((prev) => ({
      ...prev,
      work: query,
      work_company_name: query,
      work_company_logo_url: "",
      work_company_domain: "",
    }));

    if (query.trim().length < 2) {
      setCompanySuggestions([]);
      return;
    }

    setSearchingCompanies(true);
    try {
      const response = await fetch(
        `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(
          query,
        )}`,
      );
      if (!response.ok) {
        setCompanySuggestions([]);
        return;
      }
      const data = await response.json();
      setCompanySuggestions(data ?? []);
    } catch {
      setCompanySuggestions([]);
    } finally {
      setSearchingCompanies(false);
    }
  }

  function selectCompany(company: CompanySuggestion) {
    setFormData((prev) => ({
      ...prev,
      work: company.name,
      work_company_name: company.name,
      work_company_logo_url: company.logo,
      work_company_domain: company.domain,
    }));
    setCompanySuggestions([]);
  }

  // ───── Avatar upload ─────
  async function uploadAvatar() {
    if (!avatarFile || !userId) return formData.avatar_url;

    setUploadingAvatar(true);
    const fileExt = avatarFile.name.split(".").pop();
    const filePath = `${userId}/avatar-${Date.now()}.${fileExt}`;

    const { error } = await supabase.storage
      .from("profile-images")
      .upload(filePath, avatarFile, {
        cacheControl: "3600",
        upsert: true,
      });

    if (error) {
      setUploadingAvatar(false);
      fail(t("toasts.error"));
      return formData.avatar_url;
    }

    const { data } = supabase.storage
      .from("profile-images")
      .getPublicUrl(filePath);

    setUploadingAvatar(false);
    return data.publicUrl;
  }

  // ───── Cover upload ─────
  // Mirrors uploadAvatar exactly: same profile-images bucket, a
  // cover-${ts} filename under the member's folder, public URL
  // persisted to profiles.cover_url by saveProfile.
  async function uploadCover() {
    if (!coverFile || !userId) return formData.cover_url;

    setUploadingCover(true);
    const fileExt = coverFile.name.split(".").pop();
    const filePath = `${userId}/cover-${Date.now()}.${fileExt}`;

    const { error } = await supabase.storage
      .from("profile-images")
      .upload(filePath, coverFile, {
        cacheControl: "3600",
        upsert: true,
      });

    if (error) {
      setUploadingCover(false);
      fail(t("toasts.error"));
      return formData.cover_url;
    }

    const { data } = supabase.storage
      .from("profile-images")
      .getPublicUrl(filePath);

    setUploadingCover(false);
    return data.publicUrl;
  }

  // ───── Birthday string→int ─────
  function parseBirthdayForSave(): {
    birth_month: number | null;
    birth_day: number | null;
    birth_year: number | null;
  } {
    const m = formData.birth_month.trim();
    const d = formData.birth_day.trim();
    const y = formData.birth_year.trim();
    const monthNum = m === "" ? null : Number(m);
    const dayNum = d === "" ? null : Number(d);
    const yearNum = y === "" ? null : Number(y);
    // Drop a partial month/day pair so we never persist half a date.
    if (monthNum == null || dayNum == null) {
      return { birth_month: null, birth_day: null, birth_year: yearNum };
    }
    return { birth_month: monthNum, birth_day: dayNum, birth_year: yearNum };
  }

  // ───── Client-side validation ─────
  // Returns the resolved known_languages (defaulted to the interface
  // locale when empty) or null when a hard validation error blocks save.
  function validate(): { known_languages: string[] } | null {
    const errors: FieldErrors = {};

    // Website — optional, but must parse as a URL when present.
    const website = formData.website.trim();
    if (website) {
      try {
        // Accept bare domains by prefixing a scheme when missing.
        const candidate = /^https?:\/\//i.test(website)
          ? website
          : `https://${website}`;
        // Throws on malformed input — that's the validation signal.
        new URL(candidate);
      } catch {
        errors.website = t("validation.websiteInvalid");
      }
    }

    // Birthday — reject impossible month/day/year combinations. A bare
    // year is allowed; a bare month+day is allowed; nothing is allowed.
    const bday = parseBirthdayForSave();
    if (bday.birth_month != null && bday.birth_day != null) {
      const m = bday.birth_month;
      const d = bday.birth_day;
      const y = bday.birth_year ?? 2000; // leap-safe reference when no year
      const validMonth = m >= 1 && m <= 12;
      const daysInMonth = validMonth ? new Date(y, m, 0).getDate() : 0;
      if (!validMonth || d < 1 || d > daysInMonth) {
        errors.birthday = t("validation.dateInvalid");
      }
    }
    if (
      formData.birth_year.trim() &&
      (Number.isNaN(Number(formData.birth_year)) ||
        Number(formData.birth_year) < 1900 ||
        Number(formData.birth_year) > new Date().getFullYear())
    ) {
      errors.birthday = t("validation.dateInvalid");
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return null;

    // known_languages must have at least one; default to the interface
    // locale's language when the member cleared every chip.
    const localeLanguage = locale === "es" ? "spanish" : "english";
    const known_languages =
      formData.known_languages.length > 0
        ? formData.known_languages
        : [localeLanguage];

    return { known_languages };
  }

  // ───── Save ─────
  async function saveProfile() {
    if (!userId || saving) return;

    setFieldErrors({});
    const validated = validate();
    if (!validated) return;

    setSaving(true);

    // Server-side username uniqueness — only when a non-empty username
    // is set. Case-insensitive match, excluding the member's own row.
    const username = formData.username.trim();
    if (username) {
      const { data: clash } = await supabase
        .from("profiles")
        .select("id")
        .ilike("username", username)
        .neq("id", userId)
        .maybeSingle();
      if (clash) {
        setSaving(false);
        setFieldErrors((prev) => ({
          ...prev,
          username: t("validation.usernameTaken"),
        }));
        return;
      }
    }

    const avatarUrl = await uploadAvatar();
    const coverUrl = await uploadCover();
    const birthday = parseBirthdayForSave();

    const updatedProfile = {
      id: userId,
      email: formData.email,
      display_name: formData.display_name,
      username: formData.username,
      pronouns: formData.pronouns.trim() || null,
      bio: formData.bio,
      location: formData.location,
      healing_stage: formData.healing_stage,
      privacy_level: formData.privacy_level,
      avatar_url: avatarUrl,
      cover_url: coverUrl,
      work: formData.work,
      work_company_name: formData.work_company_name,
      work_company_logo_url: formData.work_company_logo_url,
      work_company_domain: formData.work_company_domain,
      education: formData.education,
      hometown: formData.hometown,
      relationship_status: formData.relationship_status,
      website: formData.website,
      interests: formData.interests,
      favorite_quote: formData.favorite_quote,
      birth_month: birthday.birth_month,
      birth_day: birthday.birth_day,
      birth_year: birthday.birth_year,
      acknowledge_birthday: formData.acknowledge_birthday,
      seasonal_acknowledgments_enabled:
        formData.seasonal_acknowledgments_enabled,
      lineage_father_grief: formData.lineage_father_grief.trim() || null,
      lineage_father_anger: formData.lineage_father_anger.trim() || null,
      lineage_pattern_to_leave:
        formData.lineage_pattern_to_leave.trim() || null,
      known_languages: validated.known_languages,
      theme_preference: formData.theme_preference,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("profiles").upsert(updatedProfile);

    if (error) {
      setSaving(false);
      fail(t("toasts.error"));
      return;
    }

    if (
      updatedProfile.lineage_father_grief ||
      updatedProfile.lineage_father_anger ||
      updatedProfile.lineage_pattern_to_leave
    ) {
      trackMilestone("first_lineage_entry");
    }

    // Push the chosen theme through the provider so the harbor
    // repaints in it immediately — same setTheme() the header toggle
    // uses (it also mirrors cookie + localStorage + cross-device DB).
    // Guarded so an unchanged selection doesn't spend a needless
    // write. theme_preference is already persisted via the upsert
    // above; this call is purely the live sync.
    if (formData.theme_preference !== theme) {
      void setTheme(formData.theme_preference);
    }

    // Rebase the dirty baseline onto the freshly-saved state, fold the
    // uploaded avatar + cover URLs back into the form, and stay on the
    // page.
    const persisted: ProfileForm = {
      ...formData,
      avatar_url: avatarUrl,
      cover_url: coverUrl,
      known_languages: validated.known_languages,
    };
    setFormData(persisted);
    setSavedSnapshot(JSON.stringify(persisted));
    setAvatarFile(null);
    setCoverFile(null);
    setSaving(false);
    setToast({ tone: "success", text: t("toasts.saved") });
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const surfaceName = locale === "es" ? "Perfil" : "Profile";
  const lineageUnlocked = isFeatureUnlocked(
    userCreatedAt,
    FEATURE_THRESHOLDS.lineage,
  );

  if (loading) {
    return (
      <div
        className={`${sans.variable} ${serif.variable} flex h-full w-full items-center justify-center text-[var(--sh-text-primary)]`}
      >
        <p
          className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.3em] text-[var(--sh-text-secondary)]`}
        >
          {t("loading")}
        </p>
      </div>
    );
  }

  return (
    <>
      <div
        className={`${sans.variable} ${serif.variable} h-full w-full overflow-y-auto text-[var(--sh-text-primary)]`}
      >
        <InactivityGate />
        <div className="mx-auto flex min-h-full w-full max-w-[1440px] flex-col">
          {/* ===== Top brand header ===== */}
          <header className="flex flex-shrink-0 items-center justify-between border-b border-[var(--sh-border-subtle)] px-10 py-6">
            <Link
              href="/dashboard"
              className="flex items-center gap-3"
              aria-label="Stone Harbor — Dashboard"
            >
              <AnchorMark size={32} />
              <span
                className={`${serif.className} text-[20px] italic tracking-[-0.012em] text-[var(--sh-text-primary)]`}
              >
                Stone Harbor
              </span>
              <span className="text-[16px] text-[var(--sh-text-muted)]">·</span>
              <span
                className={`${serif.className} text-[20px] italic tracking-[-0.012em] text-[var(--sh-text-secondary)]`}
              >
                {surfaceName}
              </span>
            </Link>

            <nav className="flex items-center gap-6">
              <button
                type="button"
                onClick={signOut}
                style={{ outline: "none", outlineOffset: 0 }}
                className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.26em] text-[var(--sh-text-tertiary)] transition-colors hover:text-[var(--sh-accent-gold)]`}
              >
                {t("signOut")}
              </button>
            </nav>
          </header>

          {/* ===== Anchor strip — page intention ===== */}
          <motion.section
            {...cascadeFadeUp}
            transition={cascadeTransition(0)}
            className="flex flex-shrink-0 flex-col items-center border-b border-[var(--sh-border-subtle)] px-10 py-6 text-center"
          >
            <p
              className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--sh-accent-gold)]`}
            >
              {t("eyebrow")}
            </p>
            <p
              className={`${serif.className} mt-1.5 text-[22px] italic font-medium tracking-[-0.01em] text-[var(--sh-text-primary)]`}
            >
              {t("title")}
            </p>
            <p
              className={`${serif.className} mt-1.5 text-[14px] italic text-[var(--sh-text-secondary)]`}
            >
              {t("supportLine")}
            </p>
          </motion.section>

          {/* ===== Main editing column ===== */}
          <main className="flex flex-1 flex-col">
            <div className="mx-auto w-full max-w-[720px] flex-1 px-6 pb-4 pt-10 md:px-10">
              {/* ── Section 1 — What we call you ── */}
              <motion.section {...cascadeFadeUp} transition={cascadeTransition(1)}>
                <SectionHead
                  header={t("sections.identity.header")}
                  subtitle={t("sections.identity.subtitle")}
                />
                <div className="mt-8 space-y-6">
                  {/* Cover banner + avatar. The banner spans the column at
                      a 3:1 ratio; the avatar overlaps its lower edge by
                      ~40% via a negative top margin so the two read as one
                      composed unit (the LinkedIn/Facebook convention). Both
                      live in one wrapper so the negative margin isn't eaten
                      by the parent's space-y rhythm. */}
                  <div>
                    {/* Cover banner — click to upload; warm gradient +
                        quiet hint when empty. No label, no CTA button; the
                        hint's presence is the affordance. */}
                    <label
                      className="group relative block aspect-[3/1] w-full cursor-pointer overflow-hidden rounded-md border-[0.5px] border-[var(--sh-border-subtle)]"
                      aria-label={t("sections.identity.fields.coverEmpty")}
                    >
                      {coverPreview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={coverPreview}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#f3efe7] to-[#e6dfd0]">
                          <span
                            className={`${serif.className} text-[10.5px] italic tracking-[0.14em] text-[var(--sh-text-tertiary)]`}
                          >
                            {t("sections.identity.fields.coverEmpty")}
                          </span>
                        </span>
                      )}
                      <span className="absolute inset-x-0 bottom-0 bg-black/45 py-1 text-center text-[9px] font-semibold uppercase tracking-[0.16em] text-white opacity-0 transition-opacity group-hover:opacity-100">
                        {uploadingCover
                          ? t("sections.identity.fields.avatarUploading")
                          : t("sections.identity.fields.avatarChange")}
                      </span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) =>
                          setCoverFile(e.target.files?.[0] ?? null)
                        }
                        className="hidden"
                      />
                    </label>

                    {/* Avatar — lifted onto the banner's lower edge. */}
                    <div className="-mt-12 flex items-end gap-5 px-1">
                    <label
                      className="group relative h-24 w-24 shrink-0 cursor-pointer overflow-hidden rounded-full border-2 border-[var(--sh-bg-page)] bg-[#efe8dc] ring-[0.5px] ring-[var(--sh-border-subtle)]"
                      aria-label={t("sections.identity.fields.avatar")}
                    >
                      {avatarPreview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={avatarPreview}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center">
                          <AnchorMark size={28} fill="#a9793d" />
                        </span>
                      )}
                      <span className="absolute inset-x-0 bottom-0 bg-black/45 py-1 text-center text-[9px] font-semibold uppercase tracking-[0.16em] text-white opacity-0 transition-opacity group-hover:opacity-100">
                        {uploadingAvatar
                          ? t("sections.identity.fields.avatarUploading")
                          : t("sections.identity.fields.avatarChange")}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) =>
                          setAvatarFile(e.target.files?.[0] ?? null)
                        }
                        className="hidden"
                      />
                    </label>
                    <p
                      className={`${sans.className} text-[11px] italic text-[var(--sh-text-tertiary)]`}
                    >
                      {t("sections.identity.fields.avatarHelp")}
                    </p>
                    </div>
                  </div>

                  <TextInput
                    label={t("sections.identity.fields.name")}
                    value={formData.display_name}
                    onChange={(v) =>
                      setFormData({ ...formData, display_name: v })
                    }
                  />
                  <TextInput
                    label={t("sections.identity.fields.username")}
                    value={formData.username}
                    onChange={(v) => {
                      setFormData({ ...formData, username: v });
                      if (fieldErrors.username)
                        setFieldErrors((p) => ({ ...p, username: undefined }));
                    }}
                    error={fieldErrors.username}
                  />
                  <TextInput
                    label={t("sections.identity.fields.pronouns")}
                    value={formData.pronouns}
                    onChange={(v) => setFormData({ ...formData, pronouns: v })}
                  />
                  <ReadOnlyField
                    label={t("sections.identity.fields.email")}
                    value={formData.email}
                    support={t("sections.identity.fields.emailSupport")}
                  />
                </div>
              </motion.section>

              {/* ── Section 2 — Dates the harbor keeps ── */}
              <motion.section
                {...cascadeFadeUp}
                transition={cascadeTransition(2)}
                className="mt-12 border-t border-[var(--sh-border-subtle)] pt-10 md:mt-16"
              >
                <SectionHead
                  header={t("sections.dates.header")}
                  subtitle={t("sections.dates.subtitle")}
                />
                <div className="mt-8 space-y-6">
                  {/* Birthday */}
                  <div>
                    <FieldLabel>
                      {t("sections.dates.fields.birthday")}
                    </FieldLabel>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <BareSelect
                        value={formData.birth_month}
                        onChange={(v) =>
                          setFormData({ ...formData, birth_month: v })
                        }
                      >
                        <option value="">
                          {t("sections.dates.fields.month")}
                        </option>
                        {MONTH_NAMES.map((name, i) => (
                          <option key={name} value={i + 1}>
                            {t(`options.months.${name}`)}
                          </option>
                        ))}
                      </BareSelect>
                      <BareSelect
                        value={formData.birth_day}
                        onChange={(v) =>
                          setFormData({ ...formData, birth_day: v })
                        }
                      >
                        <option value="">
                          {t("sections.dates.fields.day")}
                        </option>
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </BareSelect>
                      <BareInput
                        type="number"
                        min={1900}
                        max={new Date().getFullYear()}
                        value={formData.birth_year}
                        placeholder={t("sections.dates.fields.year")}
                        onChange={(v) =>
                          setFormData({ ...formData, birth_year: v })
                        }
                      />
                    </div>
                    <FieldSupport>
                      {t("sections.dates.fields.birthdaySupport")}
                    </FieldSupport>
                    {fieldErrors.birthday && (
                      <FieldError>{fieldErrors.birthday}</FieldError>
                    )}
                  </div>

                  {/* Toggles */}
                  <ToggleField
                    checked={formData.acknowledge_birthday}
                    onChange={(c) =>
                      setFormData({ ...formData, acknowledge_birthday: c })
                    }
                    label={t("sections.dates.fields.acknowledgeBirthday")}
                  />
                  <ToggleField
                    checked={formData.seasonal_acknowledgments_enabled}
                    onChange={(c) =>
                      setFormData({
                        ...formData,
                        seasonal_acknowledgments_enabled: c,
                      })
                    }
                    label={t("sections.dates.fields.seasonalAcknowledgments")}
                  />

                  {/* Healing stage */}
                  <div>
                    <SelectInput
                      label={t("sections.dates.fields.healingStage")}
                      value={formData.healing_stage}
                      options={healingStageOptions}
                      labelFor={(v) => t(`options.healingStage.${v}`)}
                      onChange={(v) =>
                        setFormData({ ...formData, healing_stage: v })
                      }
                    />
                    <FieldSupport>
                      {t("sections.dates.fields.healingStageSupport")}
                    </FieldSupport>
                  </div>
                </div>
              </motion.section>

              {/* ── Section 3 — Privacy and language ── */}
              <motion.section
                {...cascadeFadeUp}
                transition={cascadeTransition(3)}
                className="mt-12 border-t border-[var(--sh-border-subtle)] pt-10 md:mt-16"
              >
                <SectionHead
                  header={t("sections.privacy.header")}
                  subtitle={t("sections.privacy.subtitle")}
                />
                <div className="mt-8 space-y-6">
                  <SelectInput
                    label={t("sections.privacy.fields.privacyLevel")}
                    value={formData.privacy_level}
                    options={privacyOptions}
                    labelFor={(v) => t(`options.privacy.${v}`)}
                    onChange={(v) =>
                      setFormData({ ...formData, privacy_level: v })
                    }
                  />
                  <div>
                    <FieldLabel>
                      {t("sections.privacy.fields.knownLanguages")}
                    </FieldLabel>
                    <div className="flex flex-wrap gap-2">
                      {knownLanguageOptions.map((code) => {
                        const active = formData.known_languages.includes(code);
                        return (
                          <button
                            key={code}
                            type="button"
                            aria-pressed={active}
                            onClick={() =>
                              setFormData((prev) => {
                                const set = new Set(prev.known_languages);
                                if (set.has(code)) set.delete(code);
                                else set.add(code);
                                return {
                                  ...prev,
                                  known_languages: Array.from(set),
                                };
                              })
                            }
                            className={`border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] transition ${
                              active
                                ? "border-[var(--sh-accent-gold)] bg-[var(--sh-accent-gold)] text-white"
                                : "border-[var(--sh-border-subtle)] text-[var(--sh-text-secondary)] hover:border-[var(--sh-accent-gold)] hover:text-[var(--sh-accent-gold)]"
                            }`}
                          >
                            {t(`options.languages.${code}`)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </motion.section>

              {/* ── Section 4 — What you've chosen to share ── */}
              <motion.section
                {...cascadeFadeUp}
                transition={cascadeTransition(4)}
                className="mt-12 border-t border-[var(--sh-border-subtle)] pt-10 md:mt-16"
              >
                <SectionHead
                  header={t("sections.extended.header")}
                  subtitle={t("sections.extended.subtitle")}
                />
                <div className="mt-8 space-y-6">
                  <TextArea
                    label={t("sections.extended.fields.bio")}
                    value={formData.bio}
                    onChange={(v) => setFormData({ ...formData, bio: v })}
                  />
                  <TextInput
                    label={t("sections.extended.fields.location")}
                    value={formData.location}
                    onChange={(v) => setFormData({ ...formData, location: v })}
                  />
                  <TextInput
                    label={t("sections.extended.fields.hometown")}
                    value={formData.hometown}
                    onChange={(v) => setFormData({ ...formData, hometown: v })}
                  />
                  <CompanyInput
                    label={t("sections.extended.fields.work")}
                    value={formData.work}
                    logoUrl={formData.work_company_logo_url}
                    domain={formData.work_company_domain}
                    suggestions={companySuggestions}
                    searching={searchingCompanies}
                    searchingLabel={t("sections.extended.fields.workSearching")}
                    onChange={searchCompanies}
                    onSelect={selectCompany}
                  />
                  <SelectInput
                    label={t("sections.extended.fields.education")}
                    value={formData.education}
                    options={educationOptions}
                    labelFor={(v) => t(`options.education.${v}`)}
                    onChange={(v) => setFormData({ ...formData, education: v })}
                  />
                  <SelectInput
                    label={t("sections.extended.fields.relationshipStatus")}
                    value={formData.relationship_status}
                    options={relationshipOptions}
                    labelFor={(v) => t(`options.relationship.${v}`)}
                    onChange={(v) =>
                      setFormData({ ...formData, relationship_status: v })
                    }
                  />
                  <TextInput
                    label={t("sections.extended.fields.website")}
                    value={formData.website}
                    onChange={(v) => {
                      setFormData({ ...formData, website: v });
                      if (fieldErrors.website)
                        setFieldErrors((p) => ({ ...p, website: undefined }));
                    }}
                    error={fieldErrors.website}
                  />
                  <TextInput
                    label={t("sections.extended.fields.interests")}
                    value={formData.interests}
                    onChange={(v) => setFormData({ ...formData, interests: v })}
                  />
                  <TextArea
                    label={t("sections.extended.fields.favoriteQuote")}
                    value={formData.favorite_quote}
                    onChange={(v) =>
                      setFormData({ ...formData, favorite_quote: v })
                    }
                  />
                </div>
              </motion.section>

              {/* ── Section 5 — Your lineage (day-90 gated) ── */}
              {lineageUnlocked && (
                <motion.section
                  {...cascadeFadeUp}
                  transition={cascadeTransition(5)}
                  id="lineage"
                  className="mt-12 scroll-mt-24 border-t border-[var(--sh-border-subtle)] pt-10 md:mt-16"
                >
                  <SectionHead
                    header={t("sections.lineage.header")}
                    subtitle={t("sections.lineage.subtitle")}
                  />
                  <div className="mt-8">
                    <LineageSection
                      fatherGrief={formData.lineage_father_grief}
                      fatherAnger={formData.lineage_father_anger}
                      patternToLeave={formData.lineage_pattern_to_leave}
                      onChangeFatherGrief={(value) =>
                        setFormData({
                          ...formData,
                          lineage_father_grief: value,
                        })
                      }
                      onChangeFatherAnger={(value) =>
                        setFormData({
                          ...formData,
                          lineage_father_anger: value,
                        })
                      }
                      onChangePatternToLeave={(value) =>
                        setFormData({
                          ...formData,
                          lineage_pattern_to_leave: value,
                        })
                      }
                      defaultCollapsed={lineageDefaultCollapsed}
                    />
                  </div>
                </motion.section>
              )}

              {/* ── Section 6 — Visual preferences (unconditional) ── */}
              <motion.section
                {...cascadeFadeUp}
                transition={cascadeTransition(lineageUnlocked ? 6 : 5)}
                className="mt-12 border-t border-[var(--sh-border-subtle)] pt-10 md:mt-16"
              >
                <SectionHead
                  header={t("sections.preferences.header")}
                  subtitle={t("sections.preferences.subtitle")}
                />
                <div className="mt-8 space-y-6">
                  <div>
                    <FieldLabel>
                      {t("sections.preferences.themeLabel")}
                    </FieldLabel>
                    <div
                      role="radiogroup"
                      aria-label={t("sections.preferences.themeLabel")}
                      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                    >
                      {(["sunlit", "dusk"] as const).map((option) => {
                        const active = formData.theme_preference === option;
                        return (
                          <button
                            key={option}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => {
                              // Instant preview — flip the live theme on
                              // click, the same setTheme() the header
                              // ThemeToggle uses (writes cookie +
                              // localStorage, best-effort DB mirror). The
                              // setFormData below keeps the field dirty so
                              // Save still persists it alongside the rest
                              // of the form.
                              void setTheme(option);
                              setFormData({
                                ...formData,
                                theme_preference: option,
                              });
                            }}
                            className={`flex flex-col items-start gap-1 rounded-none border px-4 py-3 text-left transition ${
                              active
                                ? "border-[var(--sh-accent-gold)] bg-[var(--sh-accent-gold)]/5"
                                : "border-[var(--sh-border-medium)] hover:border-[var(--sh-accent-gold)]"
                            }`}
                          >
                            <span
                              className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${
                                active
                                  ? "text-[var(--sh-accent-gold)]"
                                  : "text-[var(--sh-text-secondary)]"
                              }`}
                            >
                              {t(`sections.preferences.${option}.label`)}
                            </span>
                            <span className="text-[12px] italic text-[var(--sh-text-tertiary)]">
                              {t(
                                `sections.preferences.${option}.description`,
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </motion.section>

              {/* ── Save ── */}
              <motion.div
                {...cascadeFadeUp}
                transition={cascadeTransition(lineageUnlocked ? 7 : 6)}
                className="mt-12 flex justify-end"
              >
                <button
                  type="button"
                  onClick={saveProfile}
                  disabled={
                    !isDirty || saving || uploadingAvatar || uploadingCover
                  }
                  className={`${sans.className} w-full rounded-none bg-[var(--sh-accent-gold)] px-8 py-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-white shadow-md transition hover:bg-[#8d6432] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto`}
                >
                  {saving || uploadingAvatar || uploadingCover
                    ? t("saving")
                    : t("saveChanges")}
                </button>
              </motion.div>
            </div>

            {/* ── Horizon mark + voice signature ── */}
            <motion.div
              {...cascadeFadeUp}
              transition={cascadeTransition(lineageUnlocked ? 7 : 6)}
            >
              <ProfileHorizonMark signature={t("voiceSignature")} />
            </motion.div>
          </main>
        </div>
      </div>

      <UnsavedChangesModal
        open={unsaved.showModal}
        onStay={unsaved.cancelNavigation}
        onLeave={unsaved.confirmNavigation}
        bodyLabel={t("unsavedBody")}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}

// ============================================================================
// Horizon mark — same component shape used on /journal + /vent, with the
// profile surface's own voice signature underneath.
// ============================================================================

function ProfileHorizonMark({ signature }: { signature: string }) {
  const { theme } = useTheme();
  const goldRgb = theme === "sunlit" ? "169,121,61" : "196,147,78";
  const goldHex = theme === "sunlit" ? "#a9793d" : "#c4934e";
  const filterShadow =
    theme === "sunlit"
      ? "drop-shadow(0 0.5px 0 rgba(60,40,15,0.18))"
      : "drop-shadow(0 0 3px rgba(196,147,78,0.35)) drop-shadow(0 0 6px rgba(196,147,78,0.18))";
  const lineAlphaInner = theme === "sunlit" ? 0.95 : 0.85;
  const lineAlphaMid = theme === "sunlit" ? 0.5 : 0.4;

  return (
    <div className="flex flex-shrink-0 flex-col items-center justify-center pb-8 pt-6">
      <motion.div
        animate={{ opacity: [0.78, 1, 0.78] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="flex w-3/4 max-w-[640px] items-center justify-center gap-3"
      >
        <HorizonSegment
          direction="left"
          goldRgb={goldRgb}
          lineAlphaInner={lineAlphaInner}
          lineAlphaMid={lineAlphaMid}
          filter={filterShadow}
        />
        <motion.div
          animate={{ scale: [1, 1.04, 1] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: "center" }}
        >
          <AnchorMark size={20} shaftHeight={42} fill={goldHex} />
        </motion.div>
        <HorizonSegment
          direction="right"
          goldRgb={goldRgb}
          lineAlphaInner={lineAlphaInner}
          lineAlphaMid={lineAlphaMid}
          filter={filterShadow}
        />
      </motion.div>
      <p
        className={`${serif.className} mt-3 text-[14px] italic text-[var(--sh-text-tertiary)]`}
      >
        {signature}
      </p>
    </div>
  );
}

// ============================================================================
// Field primitives — the harbor's form vocabulary, ported from the old
// /welcome editor so /profile inputs look identical to what members knew.
// ============================================================================

function SectionHead({
  header,
  subtitle,
}: {
  header: string;
  subtitle: string;
}) {
  return (
    <div>
      <h2
        className={`${serif.className} text-[20px] italic font-medium tracking-[-0.01em] text-[var(--sh-text-primary)]`}
      >
        {header}
      </h2>
      <p
        className={`${serif.className} mt-2 text-[13px] italic text-[var(--sh-text-secondary)]`}
      >
        {subtitle}
      </p>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)]">
      {children}
    </label>
  );
}

function FieldSupport({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 text-[11px] italic text-[var(--sh-text-tertiary)]">
      {children}
    </p>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 text-[11px] font-semibold text-[#b14a3a]">{children}</p>
  );
}

function inputClasses(isDusk: boolean) {
  return `w-full rounded-none border px-4 py-3 text-sm transition focus:outline-none ${
    isDusk
      ? "border-white/15 bg-black/40 text-stone-100 placeholder:text-stone-500"
      : "border-[var(--sh-border-medium)] bg-white text-[var(--sh-text-secondary)]"
  }`;
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
}) {
  const { theme } = useTheme();
  const isDusk = theme === "dusk";
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="group relative">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={inputClasses(isDusk)}
        />
        <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100">
          <HairlineLens position="top" theme={theme} />
          <HairlineLens position="bottom" theme={theme} />
        </div>
      </div>
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const { theme } = useTheme();
  const isDusk = theme === "dusk";
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="group relative">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={4}
          className={`${inputClasses(isDusk)} leading-relaxed`}
        />
        <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100">
          <HairlineLens position="top" theme={theme} />
          <HairlineLens position="bottom" theme={theme} />
        </div>
      </div>
    </div>
  );
}

function ReadOnlyField({
  label,
  value,
  support,
}: {
  label: string;
  value: string;
  support: string;
}) {
  const { theme } = useTheme();
  const isDusk = theme === "dusk";
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        value={value}
        readOnly
        disabled
        className={`${inputClasses(isDusk)} cursor-not-allowed opacity-70`}
      />
      <FieldSupport>{support}</FieldSupport>
    </div>
  );
}

function SelectInput({
  label,
  value,
  options,
  onChange,
  labelFor,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  labelFor?: (value: string) => string;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <BareSelect value={value} onChange={onChange}>
        {options.map((option) => (
          <option key={option} value={option}>
            {labelFor ? labelFor(option) : option}
          </option>
        ))}
      </BareSelect>
    </div>
  );
}

function BareSelect({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  const { theme } = useTheme();
  const isDusk = theme === "dusk";
  return (
    <div className="group relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-[46px] w-full appearance-none rounded-none border px-4 py-3 text-sm font-medium transition focus:outline-none ${
          isDusk
            ? "border-white/15 bg-black/40 text-stone-100"
            : "border-[var(--sh-border-medium)] bg-white text-[var(--sh-text-secondary)]"
        }`}
      >
        {children}
      </select>
      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100">
        <HairlineLens position="top" theme={theme} />
        <HairlineLens position="bottom" theme={theme} />
      </div>
    </div>
  );
}

function BareInput({
  value,
  onChange,
  type = "text",
  min,
  max,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  type?: string;
  min?: number;
  max?: number;
  placeholder?: string;
}) {
  const { theme } = useTheme();
  const isDusk = theme === "dusk";
  return (
    <input
      type={type}
      min={min}
      max={max}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`h-[46px] ${inputClasses(isDusk)}`}
    />
  );
}

function ToggleField({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-[#a9793d]"
      />
      <span className="text-sm leading-relaxed text-[var(--sh-text-secondary)]">
        {label}
      </span>
    </label>
  );
}

function CompanyInput({
  label,
  value,
  logoUrl,
  domain,
  suggestions,
  searching,
  searchingLabel,
  onChange,
  onSelect,
}: {
  label: string;
  value: string;
  logoUrl: string;
  domain: string;
  suggestions: CompanySuggestion[];
  searching: boolean;
  searchingLabel: string;
  onChange: (value: string) => void;
  onSelect: (company: CompanySuggestion) => void;
}) {
  const { theme } = useTheme();
  const isDusk = theme === "dusk";
  return (
    <div className="relative">
      <FieldLabel>{label}</FieldLabel>
      <div
        className={`flex items-center rounded-none border ${
          isDusk
            ? "border-white/15 bg-black/40"
            : "border-[var(--sh-border-medium)] bg-white"
        }`}
      >
        {(logoUrl || domain) && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={
              logoUrl ||
              `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
            }
            alt=""
            className="ml-3 h-7 w-7 rounded-full object-contain"
          />
        )}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full bg-transparent px-4 py-3 text-sm transition focus:outline-none ${
            isDusk
              ? "text-stone-100 placeholder:text-stone-500"
              : "text-[var(--sh-text-secondary)]"
          }`}
        />
      </div>

      {domain && (
        <p className="mt-2 text-xs font-semibold text-[var(--sh-text-muted)]">
          {domain}
        </p>
      )}

      {searching && (
        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--sh-text-muted)]">
          {searchingLabel}
        </p>
      )}

      {suggestions.length > 0 && (
        <div
          className={`absolute z-50 mt-2 max-h-72 w-full overflow-y-auto border shadow-xl ${
            isDusk
              ? "border-white/10 bg-[#1a1614]"
              : "border-[var(--sh-border-subtle)] bg-white"
          }`}
        >
          {suggestions.map((company) => (
            <button
              key={`${company.name}-${company.domain}`}
              type="button"
              onClick={() => onSelect(company)}
              className={`flex w-full items-center gap-3 rounded-none border-b px-4 py-3 text-left transition ${
                isDusk
                  ? "border-white/5 hover:bg-white/5"
                  : "border-stone-100 hover:bg-[#f3efe7]"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  company.logo ||
                  `https://www.google.com/s2/favicons?domain=${company.domain}&sz=64`
                }
                alt=""
                className="h-8 w-8 rounded-full object-contain"
              />
              <div>
                <p className="text-sm font-semibold text-[var(--sh-text-primary)]">
                  {company.name}
                </p>
                <p className="text-xs text-[var(--sh-text-muted)]">
                  {company.domain}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
