"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { routing } from "@/i18n/routing";
import { supabase } from "@/lib/supabaseClient";
import { trackMilestone } from "@/lib/memberUsage";
import { InactivityGate } from "@/app/components/inactivityGate";
import { serif, sans } from "@/lib/fonts";
import { Toast, type ToastState } from "@/app/components/toast";
import { ThemeToggle } from "@/app/components/themeToggle";
import { useTheme } from "@/app/components/themeProvider";
import { PageAmbience } from "@/app/components/pageAmbience";
import { LineageSection } from "@/app/components/lineageSection";
import {
  FEATURE_THRESHOLDS,
  isFeatureUnlocked,
} from "@/lib/userProgress";

type CompanySuggestion = {
  name: string;
  domain: string;
  logo: string;
};

type ProfileForm = {
  email: string;
  display_name: string;
  username: string;
  role: string;
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
  languages: string;
  interests: string;
  favorite_quote: string;
  // Birthday + opt-outs. Form fields are strings (empty = unset);
  // conversion to int/bool happens in saveProfile().
  birth_month: string;
  birth_day: string;
  birth_year: string;
  acknowledge_birthday: boolean;
  seasonal_acknowledgments_enabled: boolean;
  // Lineage — three optional prompts. Plain text. Surfaced via the
  // LineageSection component once the day-90 disclosure threshold
  // is reached. Always saved as a regular profile field; if the
  // member never fills them in, they stay empty strings.
  lineage_father_grief: string;
  lineage_father_anger: string;
  lineage_pattern_to_leave: string;
  // known_languages — text[] in the DB (see migration
  // profile_001_known_languages.sql). Stored as canonical English
  // lowercase keys ("english", "spanish", "portuguese", …). Distinct
  // from the legacy free-text `languages` field above: this one is
  // structured and used by matching/tone logic, while `languages`
  // remains a freeform display string the man controls. Default in
  // the DB is ['english']; loading defaults to ['english'] when null.
  known_languages: string[];
};

/**
 * Canonical language keys for the Known Languages multi-select.
 * Stored in the DB exactly as written here (lowercase English).
 * The rendered chip label is resolved via `t(`options.languages.${key}`)`
 * so the chip flips with the interface language.
 */
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

export default function WelcomePage() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDusk = theme === "dusk";
  // i18n — `t` covers the welcome namespace, which holds every label
  // and helper string the page renders. Option labels (relationship,
  // healing-stage, privacy, education, months, languages) live under
  // `welcome.options.*` so the English value persisted to the DB stays
  // untouched while the rendered label flips locale.
  const t = useTranslations("welcome");
  // The settle-in flow can be revisited from here; its label lives in
  // its own namespace so the orientation copy stays in one place.
  const tSettle = useTranslations("settleIn");
  // `currentLocale` drives the Interface Language pill row. Changing
  // it writes the NEXT_LOCALE cookie and triggers a full reload so
  // every authenticated page (Phase 2, cookie-driven) re-renders in
  // the new locale. Same pattern as LanguagePicker — see component
  // header for why router.refresh() isn't enough here.
  const currentLocale = useLocale();
  const [switchingLocale, setSwitchingLocale] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  // Account age for progressive disclosure (the Lineage section is
  // hidden until day 90+).
  const [userCreatedAt, setUserCreatedAt] = useState<string | null>(null);
  // Whether the Lineage section should default-collapse on render.
  // Set true when profile has visit_count >= 3 AND all three lineage
  // fields are still empty. Resolved during profile load; the
  // LineageSection still owns its expand/collapse interaction.
  const [lineageDefaultCollapsed, setLineageDefaultCollapsed] = useState(false);

  const [formData, setFormData] = useState<ProfileForm>({
    email: "",
    display_name: "",
    username: "",
    role: "member",
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
    languages: "",
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
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [detectingLocation, setDetectingLocation] = useState(false);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const [companySuggestions, setCompanySuggestions] = useState<
    CompanySuggestion[]
  >([]);
  const [searchingCompanies, setSearchingCompanies] = useState(false);

  // Toast replaces every alert() on this page — alert() breaks the
  // patient-harbor immersion. Tone is "error" by default for failures.
  const [toast, setToast] = useState<ToastState>(null);
  const fail = (msg: string) => setToast({ tone: "error", text: msg });

  // Close-account flow (Privacy Policy §8 commitment).
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeReason, setCloseReason] = useState("");
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  async function requestAccountDeletion() {
    setClosing(true);
    setCloseError(null);
    const { error } = await supabase.rpc("request_account_deletion", {
      reason: closeReason.trim() || null,
    });
    if (error) {
      setClosing(false);
      setCloseError(t("errors.submitFailed", { message: error.message }));
      return;
    }
    // Sign the member out and route to home with a quiet confirmation.
    await supabase.auth.signOut();
    window.location.href = "/?account=closed";
  }

  const avatarPreview = avatarFile
    ? URL.createObjectURL(avatarFile)
    : formData.avatar_url;

  const coverPreview = coverFile
    ? URL.createObjectURL(coverFile)
    : formData.cover_url;

  async function checkUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    // Suspension gate — suspended members cannot edit profile.
    const { data: gateRow } = await supabase
      .from("profiles")
      .select("suspended_at, created_at")
      .eq("id", user.id)
      .single();
    if (gateRow?.suspended_at) {
      window.location.href = "/suspended";
      return;
    }

    setUserId(user.id);
    setUserCreatedAt(gateRow?.created_at ?? null);

    const { data, error } = await supabase
      .from("profiles")
      .select(
        "email, display_name, username, role, bio, location, healing_stage, privacy_level, avatar_url, cover_url, work, work_company_name, work_company_logo_url, work_company_domain, education, hometown, relationship_status, website, languages, interests, favorite_quote, birth_month, birth_day, birth_year, acknowledge_birthday, seasonal_acknowledgments_enabled, lineage_father_grief, lineage_father_anger, lineage_pattern_to_leave, lineage_section_visit_count, known_languages",
      )
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      fail(t("errors.loadFailed", { message: error.message }));
    }

    setFormData({
      email: data?.email ?? user.email ?? "",
      display_name: data?.display_name ?? "",
      username: data?.username ?? "",
      role: data?.role ?? "member",
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
      languages: data?.languages ?? "",
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
      // Defensive: if the DB row predates the known_languages migration
      // or somehow stored NULL, fall back to the canonical [english]
      // default rather than rendering an empty multi-select.
      known_languages:
        (data?.known_languages as string[] | null | undefined) &&
        (data?.known_languages as string[]).length > 0
          ? (data?.known_languages as string[])
          : ["english"],
    });

    // Lineage auto-collapse bookkeeping.
    //
    // Increment lineage_section_visit_count if all three fields are
    // empty AND the count hasn't yet hit the threshold. After the
    // threshold (3 blank visits) the section default-collapses; the
    // man can still expand it via the threshold affordance.
    //
    // We use the AFTER-increment count to decide whether to collapse
    // this very render, so the third blank visit lands as the first
    // collapsed view rather than waiting for a fourth visit.
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
      // Fire-and-forget; an error here shouldn't block profile load.
      void supabase
        .from("profiles")
        .update({ lineage_section_visit_count: effectiveVisitCount })
        .eq("id", user.id);
    }
    // If the man deep-linked here via /welcome#lineage (e.g., from the
    // dashboard's "Visit the room" announcement), open the section
    // regardless of visit count — he asked for it explicitly.
    const deepLinkedToLineage =
      typeof window !== "undefined" && window.location.hash === "#lineage";
    setLineageDefaultCollapsed(
      !deepLinkedToLineage &&
        lineageEmpty &&
        effectiveVisitCount >= COLLAPSE_AFTER_VISITS,
    );

    setLoading(false);
  }

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

  /**
   * Switch the member's interface language.
   *
   * Writes the NEXT_LOCALE cookie (1-year max-age) and reloads the
   * page so:
   *   1. The server (`i18n/request.ts` → `getRequestConfig`) re-reads
   *      the cookie and serves the matching `messages/<locale>.json`.
   *   2. `NextIntlClientProvider` remounts on the client with the
   *      fresh messages bundle.
   *
   * We use `window.location.reload()` rather than `router.refresh()`
   * for the same reason LanguagePicker does: `router.refresh()` did
   * NOT reliably re-mount the provider when only the cookie changed
   * (page text stayed in the old locale and only the toggle button
   * updated). Heavier reload is reliable; language switching is rare
   * enough that the cost doesn't matter.
   *
   * Calling this while a switch is already in-flight is a no-op.
   */
  function switchInterfaceLanguage(next: string) {
    if (next === currentLocale || switchingLocale) return;
    setSwitchingLocale(true);
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; SameSite=Lax`;
    window.location.reload();
  }

  async function useCurrentLocation() {
    if (!navigator.geolocation) {
      fail(t("errors.locationUnsupported"));
      return;
    }

    setDetectingLocation(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
          );

          if (!response.ok) {
            throw new Error("Reverse geocoding request failed.");
          }

          const data = await response.json();

          const city =
            data?.address?.city ||
            data?.address?.town ||
            data?.address?.village ||
            data?.address?.hamlet ||
            "";

          const state = data?.address?.state || "";

          const locationLabel =
            city && state ? `${city}, ${state}` : city || state || "";

          if (!locationLabel) {
            fail(t("errors.locationNoCity"));
            return;
          }

          setFormData((prev) => ({
            ...prev,
            location: locationLabel,
          }));
        } catch {
          fail(t("errors.locationReverseFailed"));
        } finally {
          setDetectingLocation(false);
        }
      },
      (error) => {
        setDetectingLocation(false);

        const code = error?.code;

        if (code === 1) {
          fail(t("errors.locationDenied"));
        } else if (code === 2) {
          fail(t("errors.locationUnavailable"));
        } else if (code === 3) {
          fail(t("errors.locationTimeout"));
        } else {
          fail(t("errors.locationGeneric"));
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    );
  }

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
      fail(t("errors.avatarFailed", { message: error.message }));
      return formData.avatar_url;
    }

    const { data } = supabase.storage
      .from("profile-images")
      .getPublicUrl(filePath);

    setUploadingAvatar(false);
    return data.publicUrl;
  }

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
      fail(t("errors.coverFailed", { message: error.message }));
      return formData.cover_url;
    }

    const { data } = supabase.storage
      .from("profile-images")
      .getPublicUrl(filePath);

    await supabase.from("profile_cover_images").insert({
      user_id: userId,
      image_url: data.publicUrl,
      caption: "Profile Cover",
    });

    setUploadingCover(false);
    return data.publicUrl;
  }

  async function saveProfileHistory(
    currentUserId: string,
    snapshot: ProfileForm,
  ) {
    const { error } = await supabase.from("profile_change_history").insert({
      user_id: currentUserId,
      change_type: "profile_update",
      snapshot,
    });

    if (error) {
      console.warn("Profile history was not saved:", error.message);
    }
  }

  // Parse the form's string birthday fields into ints (or null) for the DB.
  // Month/day must both be set together or both empty — enforced by a CHECK
  // constraint on profiles, so we mirror that rule here for cleaner errors.
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
    // If one of month/day is set but not the other, drop both so we never
    // hit the DB constraint with a partial date.
    if (monthNum == null || dayNum == null) {
      return { birth_month: null, birth_day: null, birth_year: yearNum };
    }
    return { birth_month: monthNum, birth_day: dayNum, birth_year: yearNum };
  }

  async function saveProfile() {
    if (!userId) return;

    setSaving(true);

    const avatarUrl = await uploadAvatar();
    const coverUrl = await uploadCover();
    const birthday = parseBirthdayForSave();

    const updatedProfile = {
      id: userId,
      email: formData.email,
      display_name: formData.display_name,
      username: formData.username,
      role: formData.role,
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
      languages: formData.languages,
      interests: formData.interests,
      favorite_quote: formData.favorite_quote,
      birth_month: birthday.birth_month,
      birth_day: birthday.birth_day,
      birth_year: birthday.birth_year,
      acknowledge_birthday: formData.acknowledge_birthday,
      seasonal_acknowledgments_enabled:
        formData.seasonal_acknowledgments_enabled,
      // Lineage. Empty strings are stored as NULL so the columns
      // reflect "not filled in" rather than "intentionally empty."
      lineage_father_grief: formData.lineage_father_grief.trim() || null,
      lineage_father_anger: formData.lineage_father_anger.trim() || null,
      lineage_pattern_to_leave: formData.lineage_pattern_to_leave.trim() || null,
      // known_languages: persist the structured selection. If somehow
      // the user cleared every checkbox we fall back to [english] so
      // matching/tone logic always has something to read.
      known_languages:
        formData.known_languages.length > 0
          ? formData.known_languages
          : ["english"],
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("profiles").upsert(updatedProfile);

    if (error) {
      setSaving(false);
      fail(t("errors.saveFailed", { message: error.message }));
      return;
    }

    // If any lineage field is now non-empty, mark the milestone. The
    // server-side UNIQUE constraint keeps this idempotent.
    if (
      updatedProfile.lineage_father_grief ||
      updatedProfile.lineage_father_anger ||
      updatedProfile.lineage_pattern_to_leave
    ) {
      trackMilestone("first_lineage_entry");
    }

    await saveProfileHistory(userId, {
      ...formData,
      avatar_url: avatarUrl,
      cover_url: coverUrl,
    });

    setSaving(false);
    // Auth state is unchanged — soft client-side navigation preserves
    // the Supabase Realtime channel and any other in-flight subscriptions.
    router.push("/dashboard");
  }

  useEffect(() => {
    checkUser();
  }, []);

  /**
   * Hash-aware scroll. Browsers natively scroll to a URL fragment
   * on navigation, but when the target element is rendered behind
   * a loading guard (as the Lineage section is — it only mounts
   * after profile data has loaded AND the day-90 gate is passed),
   * the browser's first scroll attempt finds no element and gives
   * up. By the time the section is in the DOM we've already lost
   * the scroll moment.
   *
   * Strategy:
   *   When loading flips to false, retry the scroll attempt up to
   *   five times at 80ms intervals. Each attempt looks up the
   *   element fresh; the first time the element exists, we scroll
   *   and stop. This handles the case where the gated section is
   *   rendered slightly later than `loading` flipping (e.g.,
   *   userCreatedAt loads, isFeatureUnlocked starts returning true,
   *   React commits the section in the next paint).
   *
   *   Smooth scrolling is intentional — a sudden jump from the top
   *   of the page to a mid-page section would feel jarring in the
   *   harbor's tone.
   */
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

    // Defer the first attempt one frame so React has committed the
    // form to the DOM. Subsequent retries cover the case where the
    // section appears slightly later as nested state settles.
    timer = setTimeout(tryScroll, 50);
    return () => clearTimeout(timer);
  }, [loading]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--sh-bg-page)]">
        <p className="text-sm font-bold uppercase tracking-[0.3em] text-[var(--sh-text-secondary)]">
          {t("loading")}
        </p>
      </main>
    );
  }

  return (
    <main
      className={`${sans.className} relative flex min-h-screen flex-col overflow-hidden bg-[var(--sh-bg-page)] py-8 text-[var(--sh-text-primary)]`}
    >
      <InactivityGate />

      {/* Same atmospheric layer used on the dashboard so the harbor
          feels continuous as the member moves between pages. */}
      <PageAmbience />

      <section className="relative z-10 mx-auto w-full max-w-5xl flex-1 px-4 md:px-8">
        <div className="mb-8 flex items-center justify-between">
          <Link
            href="/dashboard"
            className="rounded-none text-sm font-bold uppercase tracking-[0.35em] text-[#a9793d]"
          >
            {t("backToDashboard")}
          </Link>
        </div>

        <div
          className={`overflow-hidden border ${
            isDusk
              ? "border-white/10 bg-black/30 shadow-[0_20px_70px_rgba(0,0,0,0.45)] backdrop-blur-md"
              : "border-[var(--sh-border-subtle)] bg-[#f8f4ed] shadow-[0_20px_70px_rgba(0,0,0,0.08)]"
          }`}
        >
          <div
            className={`relative mb-10 overflow-hidden border-b ${
              isDusk
                ? "border-white/10 bg-black/20"
                : "border-[var(--sh-border-subtle)] bg-[#f8f4ed]"
            }`}
          >
            <div
              className="relative h-64 bg-cover bg-center"
              style={{
                backgroundImage: coverPreview
                  ? `url(${coverPreview})`
                  : "linear-gradient(135deg, #d8b07b, #8d6432)",
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/10 to-transparent" />

              <label className="absolute right-4 top-4 z-20 cursor-pointer rounded-none border border-white/30 bg-black/30 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-white backdrop-blur-md transition hover:bg-black/45">
                {t("changeCover")}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </label>

              <div className="absolute -bottom-16 left-8 z-20">
                <div
                  className={`relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-4 shadow-xl ${
                    isDusk
                      ? "border-[#1a1614] bg-[#1f1a16]"
                      : "border-[#f8f4ed] bg-[#efe8dc]"
                  }`}
                >
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt={t("avatarAlt")}
                      className="h-full w-full rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-5xl text-[#a9793d]">⚓</span>
                  )}

                  <label className="absolute bottom-0 left-0 right-0 cursor-pointer rounded-none bg-black/45 py-2 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-white backdrop-blur-sm transition hover:bg-black/60">
                    {t("changeAvatar")}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) =>
                        setAvatarFile(e.target.files?.[0] ?? null)
                      }
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="h-20" />

            <div className="px-8 pb-8">
              <h2
                className={`${serif.className} text-4xl font-medium leading-tight text-[var(--sh-text-primary)]`}
              >
                {formData.display_name || t("fallbackName")}
              </h2>

              <p className="mt-1 text-sm font-bold uppercase tracking-[0.22em] text-[var(--sh-text-muted)]">
                {formData.username ? `@${formData.username}` : formData.email}
              </p>

              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm font-semibold text-[var(--sh-text-tertiary)]">
                <span>{formData.location || t("locationNotSet")}</span>
                <span>•</span>
                <span>{t(`options.healingStage.${formData.healing_stage}`)}</span>
                <span>•</span>
                <span>{t(`options.privacy.${formData.privacy_level}`)}</span>
              </div>
            </div>
          </div>

          <div className="px-6 pb-8 pt-0 md:px-10">
            <h1
              className={`${serif.className} text-5xl font-medium text-[var(--sh-text-primary)] md:text-7xl`}
            >
              {t("pageTitle")}
            </h1>

            <p className="mt-3 max-w-2xl text-lg leading-relaxed text-[var(--sh-text-secondary)]">
              {t("pageSubtitle")}
            </p>

            <div className="mt-10 grid gap-8">
              <div className="grid gap-6 md:grid-cols-2">
                <TextInput
                  label={t("fields.displayName")}
                  value={formData.display_name}
                  onChange={(value) =>
                    setFormData({ ...formData, display_name: value })
                  }
                  placeholder={t("placeholders.displayName")}
                />

                <TextInput
                  label={t("fields.username")}
                  value={formData.username}
                  onChange={(value) =>
                    setFormData({ ...formData, username: value })
                  }
                  placeholder={t("placeholders.username")}
                />

                {/* INTERFACE LANGUAGE — switches the whole app on click,
                    not on save. Uses the same NEXT_LOCALE-cookie-plus-
                    reload mechanism as the LanguagePicker that lives in
                    the footer; this one is a form-styled pill row so
                    it reads as a profile preference rather than a UI
                    toggle. Active locale stays in gold. */}
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)]">
                    {t("fields.interfaceLanguage")}
                  </label>
                  <div
                    role="radiogroup"
                    aria-label={t("fields.interfaceLanguage")}
                    className={`inline-flex w-full border ${
                      isDusk
                        ? "border-white/15 bg-black/40"
                        : "border-[var(--sh-border-medium)] bg-white"
                    }`}
                  >
                    {routing.locales.map((code) => {
                      const active = currentLocale === code;
                      return (
                        <button
                          key={code}
                          type="button"
                          onClick={() => switchInterfaceLanguage(code)}
                          disabled={switchingLocale}
                          aria-pressed={active}
                          className={`flex-1 px-4 py-3 text-xs font-bold uppercase tracking-[0.22em] transition disabled:cursor-not-allowed disabled:opacity-60 ${
                            active
                              ? "bg-[#a9793d] text-white"
                              : isDusk
                                ? "text-stone-300 hover:bg-white/[0.05]"
                                : "text-[var(--sh-text-secondary)] hover:bg-[#f8f4ed]"
                          }`}
                        >
                          {code === "en" ? "English" : "Español"}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[11px] italic text-[var(--sh-text-tertiary)]">
                    {t("interfaceLanguageHelp")}
                  </p>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="block text-xs font-bold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)]">
                      {t("fields.location")}
                    </label>

                    <button
                      type="button"
                      onClick={useCurrentLocation}
                      disabled={detectingLocation}
                      className={`flex h-8 w-8 items-center justify-center rounded-none border transition hover:border-[var(--sh-accent-gold)] hover:text-[var(--sh-accent-gold)] disabled:cursor-not-allowed disabled:opacity-50 ${
                        isDusk
                          ? "border-white/15 bg-black/40 text-[var(--sh-text-tertiary)]"
                          : "border-[var(--sh-border-medium)] bg-white text-[var(--sh-text-tertiary)]"
                      }`}
                      aria-label={t("useLocation")}
                      title={t("useLocation")}
                    >
                      {detectingLocation ? (
                        <span className="text-xs">...</span>
                      ) : (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          className="h-4 w-4"
                        >
                          <circle cx="12" cy="12" r="3" />
                          <path d="M12 2v3" />
                          <path d="M12 19v3" />
                          <path d="M2 12h3" />
                          <path d="M19 12h3" />
                        </svg>
                      )}
                    </button>
                  </div>

                  <input
                    value={formData.location}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        location: e.target.value,
                      })
                    }
                    placeholder={t("placeholders.location")}
                    className={`w-full border px-4 py-3 text-sm transition focus:border-[var(--sh-accent-gold)] focus:outline-none ${
                      isDusk
                        ? "border-white/15 bg-black/40 text-stone-100 placeholder:text-stone-500"
                        : "border-[var(--sh-border-medium)] bg-white text-[var(--sh-text-secondary)]"
                    }`}
                  />
                </div>

                <TextInput
                  label={t("fields.hometown")}
                  value={formData.hometown}
                  onChange={(value) =>
                    setFormData({ ...formData, hometown: value })
                  }
                  placeholder={t("placeholders.hometown")}
                />

                <div>
                  {/* Option C: pillar selection lives here now (deferred from
                      the retired onboarding flow). Minimum-touch microcopy —
                      no banner, no nudge; members who care will find it. */}
                  <p className="mb-2 text-[11px] italic text-[var(--sh-text-tertiary)]">
                    Where you&apos;re starting — change this anytime.
                  </p>
                  <SelectInput
                    label={t("fields.healingStage")}
                    value={formData.healing_stage}
                    options={healingStageOptions}
                    labelFor={(v) => t(`options.healingStage.${v}`)}
                    onChange={(value) =>
                      setFormData({ ...formData, healing_stage: value })
                    }
                  />
                </div>

                <SelectInput
                  label={t("fields.privacy")}
                  value={formData.privacy_level}
                  options={privacyOptions}
                  labelFor={(v) => t(`options.privacy.${v}`)}
                  onChange={(value) =>
                    setFormData({ ...formData, privacy_level: value })
                  }
                />

                <SelectInput
                  label={t("fields.relationship")}
                  value={formData.relationship_status}
                  options={relationshipOptions}
                  labelFor={(v) => t(`options.relationship.${v}`)}
                  onChange={(value) =>
                    setFormData({
                      ...formData,
                      relationship_status: value,
                    })
                  }
                />

                <CompanyInput
                  label={t("fields.work")}
                  value={formData.work}
                  logoUrl={formData.work_company_logo_url}
                  domain={formData.work_company_domain}
                  suggestions={companySuggestions}
                  searching={searchingCompanies}
                  onChange={searchCompanies}
                  onSelect={selectCompany}
                  placeholder={t("placeholders.companySearch")}
                  searchingLabel={t("placeholders.searching")}
                />

                <SelectInput
                  label={t("fields.education")}
                  value={formData.education}
                  options={educationOptions}
                  labelFor={(v) => t(`options.education.${v}`)}
                  onChange={(value) =>
                    setFormData({
                      ...formData,
                      education: value,
                    })
                  }
                />

                <TextInput
                  label={t("fields.website")}
                  value={formData.website}
                  onChange={(value) =>
                    setFormData({ ...formData, website: value })
                  }
                  placeholder={t("placeholders.website")}
                />

                <TextInput
                  label={t("fields.languages")}
                  value={formData.languages}
                  onChange={(value) =>
                    setFormData({ ...formData, languages: value })
                  }
                  placeholder={t("placeholders.languages")}
                />

                {/* KNOWN LANGUAGES — structured multi-select that
                    writes to the profiles.known_languages text[]
                    column (see migration profile_001_known_languages.sql).
                    Values are stored as canonical English lowercase
                    keys so matching/tone logic always reads the same
                    set; the chip label flips with the interface
                    language. Spans both grid columns so the chip
                    cloud has room to breathe. */}
                <div className="md:col-span-2">
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)]">
                    {t("fields.knownLanguages")}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {knownLanguageOptions.map((code) => {
                      const active = formData.known_languages.includes(code);
                      return (
                        <button
                          key={code}
                          type="button"
                          onClick={() => {
                            setFormData((prev) => {
                              const set = new Set(prev.known_languages);
                              if (set.has(code)) {
                                set.delete(code);
                              } else {
                                set.add(code);
                              }
                              return { ...prev, known_languages: Array.from(set) };
                            });
                          }}
                          aria-pressed={active}
                          className={`border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.22em] transition ${
                            active
                              ? "border-[#a9793d] bg-[#a9793d] text-white"
                              : isDusk
                                ? "border-white/15 bg-black/40 text-stone-300 hover:border-[#c4934e] hover:text-[#c4934e]"
                                : "border-[var(--sh-border-medium)] bg-white text-[var(--sh-text-secondary)] hover:border-[#a9793d] hover:text-[#a9793d]"
                          }`}
                        >
                          {t(`options.languages.${code}`)}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[11px] italic text-[var(--sh-text-tertiary)]">
                    {t("knownLanguagesHelp")}
                  </p>
                </div>

                <TextInput
                  label={t("fields.interests")}
                  value={formData.interests}
                  onChange={(value) =>
                    setFormData({ ...formData, interests: value })
                  }
                  placeholder={t("placeholders.interests")}
                />
              </div>

              <TextArea
                label={t("fields.perspective")}
                value={formData.bio}
                onChange={(value) => setFormData({ ...formData, bio: value })}
                placeholder={t("placeholders.perspective")}
              />

              <TextArea
                label={t("fields.favoriteQuote")}
                value={formData.favorite_quote}
                onChange={(value) =>
                  setFormData({ ...formData, favorite_quote: value })
                }
                placeholder={t("placeholders.favoriteQuote")}
              />

              {/* ────────── LINEAGE ──────────
                  Day 90 unlock. Three optional prompts about the
                  inheritance the member carries from his father.
                  The id="lineage" lets the dashboard's once-shown
                  LineageDoorCard deep-link directly to this section
                  via /welcome#lineage. */}
              {isFeatureUnlocked(
                userCreatedAt,
                FEATURE_THRESHOLDS.lineage,
              ) && (
                <div id="lineage" className="scroll-mt-24">
                  <LineageSection
                    fatherGrief={formData.lineage_father_grief}
                    fatherAnger={formData.lineage_father_anger}
                    patternToLeave={formData.lineage_pattern_to_leave}
                    onChangeFatherGrief={(value) =>
                      setFormData({ ...formData, lineage_father_grief: value })
                    }
                    onChangeFatherAnger={(value) =>
                      setFormData({ ...formData, lineage_father_anger: value })
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
              )}

              {/* ────────── THE DATES WE NOTICE ──────────
                  Optional birthday capture + two opt-outs that control
                  the quiet dashboard acknowledgment tile. The harbor
                  notices the day; it never celebrates. */}
              <section className="border-t border-[var(--sh-border-subtle)] pt-8">
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#a9793d]">
                  {t("dates.eyebrow")}
                </p>
                <h3
                  className={`${serif.className} mt-3 text-3xl font-medium leading-tight text-[var(--sh-text-primary)]`}
                >
                  {t("dates.title")}
                </h3>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--sh-text-secondary)]">
                  {t("dates.body")}
                </p>

                <div className="mt-8">
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)]">
                    {t("dates.birthdayLabel")}
                  </label>
                  <div className="grid max-w-xl grid-cols-3 gap-3">
                    <select
                      value={formData.birth_month}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          birth_month: e.target.value,
                        })
                      }
                      className={`h-[46px] w-full appearance-none rounded-none border px-4 py-3 text-sm font-medium transition focus:border-[var(--sh-accent-gold)] focus:outline-none ${
                        isDusk
                          ? "border-white/15 bg-black/40 text-stone-100"
                          : "border-[var(--sh-border-medium)] bg-white text-[var(--sh-text-secondary)]"
                      }`}
                    >
                      <option value="">{t("dates.month")}</option>
                      {MONTH_NAMES.map((name, i) => (
                        <option key={name} value={i + 1}>
                          {t(`options.months.${name}`)}
                        </option>
                      ))}
                    </select>

                    <select
                      value={formData.birth_day}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          birth_day: e.target.value,
                        })
                      }
                      className={`h-[46px] w-full appearance-none rounded-none border px-4 py-3 text-sm font-medium transition focus:border-[var(--sh-accent-gold)] focus:outline-none ${
                        isDusk
                          ? "border-white/15 bg-black/40 text-stone-100"
                          : "border-[var(--sh-border-medium)] bg-white text-[var(--sh-text-secondary)]"
                      }`}
                    >
                      <option value="">{t("dates.day")}</option>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>

                    <input
                      type="number"
                      min={1900}
                      max={new Date().getFullYear()}
                      value={formData.birth_year}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          birth_year: e.target.value,
                        })
                      }
                      placeholder={t("dates.yearPlaceholder")}
                      className={`h-[46px] w-full border px-4 text-sm transition focus:border-[var(--sh-accent-gold)] focus:outline-none ${
                        isDusk
                          ? "border-white/15 bg-black/40 text-stone-100 placeholder:text-stone-500"
                          : "border-[var(--sh-border-medium)] bg-white text-[var(--sh-text-secondary)]"
                      }`}
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-[var(--sh-text-tertiary)]">
                    {t("dates.yearHelp")}
                  </p>
                </div>

                <div className="mt-8 space-y-3">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={formData.acknowledge_birthday}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          acknowledge_birthday: e.target.checked,
                        })
                      }
                      className="mt-1 h-4 w-4 accent-[#a9793d]"
                    />
                    <span className="text-sm leading-relaxed text-[var(--sh-text-secondary)]">
                      {t("dates.ackBirthday")}
                      <span className="block text-[11px] text-[var(--sh-text-tertiary)]">
                        {t("dates.ackBirthdayHelp")}
                      </span>
                    </span>
                  </label>

                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={formData.seasonal_acknowledgments_enabled}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          seasonal_acknowledgments_enabled: e.target.checked,
                        })
                      }
                      className="mt-1 h-4 w-4 accent-[#a9793d]"
                    />
                    <span className="text-sm leading-relaxed text-[var(--sh-text-secondary)]">
                      {t("dates.ackSeasonal")}
                      <span className="block text-[11px] text-[var(--sh-text-tertiary)]">
                        {t("dates.ackSeasonalHelp")}
                      </span>
                    </span>
                  </label>
                </div>
              </section>

              <div className="flex flex-wrap gap-4 border-t border-[var(--sh-border-subtle)] pt-8">
                <button
                  type="button"
                  onClick={saveProfile}
                  disabled={saving || uploadingAvatar || uploadingCover}
                  className="rounded-none bg-[var(--sh-accent-gold)] px-8 py-4 text-xs font-bold uppercase tracking-[0.22em] text-white shadow-md transition hover:bg-[#8d6432] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving || uploadingAvatar || uploadingCover
                    ? t("saving")
                    : t("save")}
                </button>

                <Link
                  href="/dashboard"
                  className={`rounded-none border px-8 py-4 text-xs font-bold uppercase tracking-[0.22em] transition hover:border-[var(--sh-accent-gold)] ${
                    isDusk
                      ? "border-white/15 bg-black/40 text-stone-100"
                      : "border-[var(--sh-border-medium)] bg-white text-[var(--sh-text-secondary)]"
                  }`}
                >
                  {t("cancel")}
                </Link>
              </div>

              {/* ────────── APPEARANCE ──────────
                  Member-level theme choice: Sunlit (cream) or Dusk
                  (dark amniotic). Saves to localStorage + Supabase
                  profiles.theme_preference on every toggle. */}
              <section className="mt-12 border-t border-[var(--sh-border-subtle)] pt-10">
                <ThemeToggle />
              </section>

              {/* ────────── REVISIT SETTLE-IN ──────────
                  The orientation flow is never one-and-done; a member can
                  walk back through it any time. Revisiting does not touch
                  settle_in_completed_at. */}
              <section className="mt-16 border-t border-[var(--sh-border-subtle)] pt-10">
                <Link
                  href="/settle-in?step=1"
                  className="text-sm font-semibold text-[var(--sh-accent-gold)] underline-offset-4 transition hover:underline"
                >
                  {tSettle("revisit")}
                </Link>
              </section>

              {/* ────────── CLOSE ACCOUNT ──────────
                  Required by Privacy Policy §8. A member can request
                  deletion at any time. We acknowledge in 30 days. */}
              <section className="mt-16 border-t border-[var(--sh-border-subtle)] pt-10">
                <p
                  className="text-xs font-bold uppercase tracking-[0.3em]"
                  style={{ color: "#b14a3a" }}
                >
                  {t("leaving.eyebrow")}
                </p>
                <h3
                  className={`${serif.className} mt-3 text-3xl font-medium leading-tight text-[var(--sh-text-primary)]`}
                >
                  {t("leaving.title")}
                </h3>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--sh-text-secondary)]">
                  {t("leaving.body1")}{" "}
                  <Link
                    href="/privacy"
                    className="font-semibold text-[#a9793d] underline-offset-4 hover:underline"
                  >
                    {t("leaving.privacyPolicy")}
                  </Link>
                  {t("leaving.body2")}
                </p>

                {!closeOpen ? (
                  <button
                    type="button"
                    onClick={() => setCloseOpen(true)}
                    className={`mt-6 rounded-none border border-[#b14a3a] px-6 py-3 text-[11px] font-bold uppercase tracking-[0.22em] text-[#b14a3a] transition hover:bg-[#b14a3a] hover:text-white ${
                      isDusk ? "bg-black/40" : "bg-white"
                    }`}
                  >
                    {t("leaving.closeButton")}
                  </button>
                ) : (
                  <div
                    className={`mt-6 border-l-[3px] px-6 py-6 ${
                      isDusk ? "bg-[#2a1612]" : "bg-[#fcefe9]"
                    }`}
                    style={{ borderLeftColor: "#b14a3a" }}
                  >
                    <p className="text-sm font-semibold text-[var(--sh-text-primary)]">
                      {t("leaving.confirmTitle")}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--sh-text-secondary)]">
                      {t("leaving.confirmBody")}
                    </p>
                    <textarea
                      value={closeReason}
                      onChange={(e) => setCloseReason(e.target.value)}
                      rows={3}
                      maxLength={1000}
                      placeholder={t("leaving.reasonPlaceholder")}
                      className={`mt-4 w-full border px-3 py-2 text-sm focus:border-[#b14a3a] focus:outline-none ${
                        isDusk
                          ? "border-white/15 bg-black/40 text-stone-100 placeholder:text-stone-500"
                          : "border-[var(--sh-border-medium)] bg-white text-[var(--sh-text-primary)]"
                      }`}
                    />
                    {closeError && (
                      <p className="mt-2 text-xs font-semibold text-red-700">
                        {closeError}
                      </p>
                    )}
                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={requestAccountDeletion}
                        disabled={closing}
                        className="rounded-none bg-[#b14a3a] px-6 py-3 text-[11px] font-bold uppercase tracking-[0.22em] text-white transition hover:bg-[#8d2f21] disabled:opacity-50"
                      >
                        {closing ? t("leaving.submitting") : t("leaving.submit")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCloseOpen(false);
                          setCloseReason("");
                          setCloseError(null);
                        }}
                        disabled={closing}
                        className={`rounded-none border px-6 py-3 text-[11px] font-bold uppercase tracking-[0.22em] transition hover:border-[var(--sh-accent-gold)] disabled:opacity-50 ${
                          isDusk
                            ? "border-white/15 bg-black/40 text-stone-100"
                            : "border-[var(--sh-border-medium)] bg-white text-[var(--sh-text-secondary)]"
                        }`}
                      >
                        {t("leaving.stay")}
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      </section>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </main>
  );
}

function CompanyInput({
  label,
  value,
  logoUrl,
  domain,
  suggestions,
  searching,
  onChange,
  onSelect,
  placeholder,
  searchingLabel,
}: {
  label: string;
  value: string;
  logoUrl: string;
  domain: string;
  suggestions: CompanySuggestion[];
  searching: boolean;
  onChange: (value: string) => void;
  onSelect: (company: CompanySuggestion) => void;
  placeholder?: string;
  searchingLabel?: string;
}) {
  const { theme } = useTheme();
  const isDusk = theme === "dusk";

  return (
    <div className="relative">
      <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)]">
        {label}
      </label>

      <div
        className={`flex items-center border ${
          isDusk
            ? "border-white/15 bg-black/40"
            : "border-[var(--sh-border-medium)] bg-white"
        }`}
      >
        {(logoUrl || domain) && (
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
          placeholder={placeholder ?? "Start typing company name..."}
          className={`w-full bg-transparent px-4 py-3 text-sm transition focus:outline-none ${
            isDusk
              ? "text-stone-100 placeholder:text-stone-500"
              : "text-[var(--sh-text-secondary)]"
          }`}
        />
      </div>

      {domain && (
        <p className="mt-2 text-xs font-semibold text-[var(--sh-text-muted)]">{domain}</p>
      )}

      {searching && (
        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--sh-text-muted)]">
          {searchingLabel ?? "Searching..."}
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
                <p className="text-xs text-[var(--sh-text-muted)]">{company.domain}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TextInput({
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
      <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)]">
        {label}
      </label>

      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full border px-4 py-3 text-sm transition focus:border-[var(--sh-accent-gold)] focus:outline-none ${
          isDusk
            ? "border-white/15 bg-black/40 text-stone-100 placeholder:text-stone-500"
            : "border-[var(--sh-border-medium)] bg-white text-[var(--sh-text-secondary)]"
        }`}
      />
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
      <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)]">
        {label}
      </label>

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
        className={`w-full border px-4 py-3 text-sm leading-relaxed transition focus:border-[var(--sh-accent-gold)] focus:outline-none ${
          isDusk
            ? "border-white/15 bg-black/40 text-stone-100 placeholder:text-stone-500"
            : "border-[var(--sh-border-medium)] bg-white text-[var(--sh-text-secondary)]"
        }`}
      />
    </div>
  );
}

/**
 * SelectInput renders a labeled <select>. Option values are kept in
 * English (they're persisted to the DB as canonical strings, e.g.
 * "Clarity", "Married", "GED"). The optional `labelFor` callback maps
 * each English value to a locale-aware display label without changing
 * what gets saved. If `labelFor` is omitted, the value renders as its
 * own label (legacy behavior).
 */
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
  const { theme } = useTheme();
  const isDusk = theme === "dusk";

  return (
    <div>
      <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)]">
        {label}
      </label>

      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-[46px] w-full appearance-none rounded-none border px-4 py-3 text-sm font-medium transition focus:border-[var(--sh-accent-gold)] focus:outline-none ${
          isDusk
            ? "border-white/15 bg-black/40 text-stone-100"
            : "border-[var(--sh-border-medium)] bg-white text-[var(--sh-text-secondary)]"
        }`}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {labelFor ? labelFor(option) : option}
          </option>
        ))}
      </select>
    </div>
  );
}
