"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { InactivityGate } from "@/app/components/inactivityGate";
import { serif, sans } from "@/lib/fonts";
import { Toast, type ToastState } from "@/app/components/toast";
import { ThemeToggle } from "@/app/components/themeToggle";
import { useTheme } from "@/app/components/themeProvider";
import { PageAmbience } from "@/app/components/pageAmbience";

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
};

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
  const [userId, setUserId] = useState<string | null>(null);

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
      setCloseError(`Could not submit: ${error.message}`);
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
      .select("suspended_at")
      .eq("id", user.id)
      .single();
    if (gateRow?.suspended_at) {
      window.location.href = "/suspended";
      return;
    }

    setUserId(user.id);

    const { data, error } = await supabase
      .from("profiles")
      .select(
        "email, display_name, username, role, bio, location, healing_stage, privacy_level, avatar_url, cover_url, work, work_company_name, work_company_logo_url, work_company_domain, education, hometown, relationship_status, website, languages, interests, favorite_quote, birth_month, birth_day, birth_year, acknowledge_birthday, seasonal_acknowledgments_enabled",
      )
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      fail(`Could not load profile: ${error.message}`);
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
    });

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

  async function useCurrentLocation() {
    if (!navigator.geolocation) {
      fail("Location services are not supported by this browser.");
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
            fail("Could not determine your city from your coordinates.");
            return;
          }

          setFormData((prev) => ({
            ...prev,
            location: locationLabel,
          }));
        } catch {
          fail("Could not convert your coordinates into a city/state.");
        } finally {
          setDetectingLocation(false);
        }
      },
      (error) => {
        setDetectingLocation(false);

        const code = error?.code;

        if (code === 1) {
          fail(
            "Location permission was denied. Please allow location access in your browser.",
          );
        } else if (code === 2) {
          fail("Your location is currently unavailable.");
        } else if (code === 3) {
          fail("Location request timed out. Please try again.");
        } else {
          fail("Could not detect your location.");
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
      fail(`Avatar upload failed: ${error.message}`);
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
      fail(`Cover upload failed: ${error.message}`);
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
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("profiles").upsert(updatedProfile);

    if (error) {
      setSaving(false);
      fail(`Could not save profile: ${error.message}`);
      return;
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

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--sh-bg-page)]">
        <p className="text-sm font-bold uppercase tracking-[0.3em] text-[var(--sh-text-secondary)]">
          Loading Profile...
        </p>
      </main>
    );
  }

  return (
    <main
      className={`${sans.className} relative min-h-screen overflow-hidden bg-[var(--sh-bg-page)] px-4 py-8 text-[var(--sh-text-primary)] md:px-8`}
    >
      <InactivityGate />

      {/* Same atmospheric layer used on the dashboard so the harbor
          feels continuous as the member moves between pages. */}
      <PageAmbience />

      <section className="relative z-10 mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <Link
            href="/dashboard"
            className="rounded-none text-sm font-bold uppercase tracking-[0.35em] text-[#a9793d]"
          >
            ← Dashboard
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
                Change Cover
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
                      alt="Profile avatar"
                      className="h-full w-full rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-5xl text-[#a9793d]">⚓</span>
                  )}

                  <label className="absolute bottom-0 left-0 right-0 cursor-pointer rounded-none bg-black/45 py-2 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-white backdrop-blur-sm transition hover:bg-black/60">
                    Change
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
                {formData.display_name || "Your Profile"}
              </h2>

              <p className="mt-1 text-sm font-bold uppercase tracking-[0.22em] text-[var(--sh-text-muted)]">
                {formData.username ? `@${formData.username}` : formData.email}
              </p>

              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm font-semibold text-[var(--sh-text-tertiary)]">
                <span>{formData.location || "Location not set"}</span>
                <span>•</span>
                <span>{formData.healing_stage}</span>
                <span>•</span>
                <span>{formData.privacy_level}</span>
              </div>
            </div>
          </div>

          <div className="px-6 pb-8 pt-0 md:px-10">
            <h1
              className={`${serif.className} text-5xl font-medium text-[var(--sh-text-primary)] md:text-7xl`}
            >
              Edit Profile
            </h1>

            <p className="mt-3 max-w-2xl text-lg leading-relaxed text-[var(--sh-text-secondary)]">
              Update your personal information, privacy, and location.
            </p>

            <div className="mt-10 grid gap-8">
              <div className="grid gap-6 md:grid-cols-2">
                <TextInput
                  label="Display Name"
                  value={formData.display_name}
                  onChange={(value) =>
                    setFormData({ ...formData, display_name: value })
                  }
                  placeholder="Rafael Carrasquillo"
                />

                <TextInput
                  label="Username"
                  value={formData.username}
                  onChange={(value) =>
                    setFormData({ ...formData, username: value })
                  }
                  placeholder="rafael102476"
                />

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="block text-xs font-bold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)]">
                      Location
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
                      aria-label="Use current location"
                      title="Use current location"
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
                    placeholder="Davenport, Florida"
                    className={`w-full border px-4 py-3 text-sm transition focus:border-[var(--sh-accent-gold)] focus:outline-none ${
                      isDusk
                        ? "border-white/15 bg-black/40 text-stone-100 placeholder:text-stone-500"
                        : "border-[var(--sh-border-medium)] bg-white text-[var(--sh-text-secondary)]"
                    }`}
                  />
                </div>

                <TextInput
                  label="Hometown"
                  value={formData.hometown}
                  onChange={(value) =>
                    setFormData({ ...formData, hometown: value })
                  }
                  placeholder="San Juan, Puerto Rico"
                />

                <SelectInput
                  label="Healing Stage"
                  value={formData.healing_stage}
                  options={healingStageOptions}
                  onChange={(value) =>
                    setFormData({ ...formData, healing_stage: value })
                  }
                />

                <SelectInput
                  label="Privacy"
                  value={formData.privacy_level}
                  options={privacyOptions}
                  onChange={(value) =>
                    setFormData({ ...formData, privacy_level: value })
                  }
                />

                <SelectInput
                  label="Relationship"
                  value={formData.relationship_status}
                  options={relationshipOptions}
                  onChange={(value) =>
                    setFormData({
                      ...formData,
                      relationship_status: value,
                    })
                  }
                />

                <CompanyInput
                  label="Work"
                  value={formData.work}
                  logoUrl={formData.work_company_logo_url}
                  domain={formData.work_company_domain}
                  suggestions={companySuggestions}
                  searching={searchingCompanies}
                  onChange={searchCompanies}
                  onSelect={selectCompany}
                />

                <SelectInput
                  label="Education"
                  value={formData.education}
                  options={educationOptions}
                  onChange={(value) =>
                    setFormData({
                      ...formData,
                      education: value,
                    })
                  }
                />

                <TextInput
                  label="Website"
                  value={formData.website}
                  onChange={(value) =>
                    setFormData({ ...formData, website: value })
                  }
                  placeholder="https://example.com"
                />

                <TextInput
                  label="Languages"
                  value={formData.languages}
                  onChange={(value) =>
                    setFormData({ ...formData, languages: value })
                  }
                  placeholder="English, Spanish"
                />

                <TextInput
                  label="Interests"
                  value={formData.interests}
                  onChange={(value) =>
                    setFormData({ ...formData, interests: value })
                  }
                  placeholder="Healing, fitness, technology, family"
                />
              </div>

              <TextArea
                label="Perspective"
                value={formData.bio}
                onChange={(value) => setFormData({ ...formData, bio: value })}
                placeholder="Rebuilding with clarity, strength, and purpose..."
              />

              <TextArea
                label="Favorite Quote"
                value={formData.favorite_quote}
                onChange={(value) =>
                  setFormData({ ...formData, favorite_quote: value })
                }
                placeholder="Rebuilding isn’t about returning to who I was—it’s about becoming who I was meant to be."
              />

              {/* ────────── THE DATES WE NOTICE ──────────
                  Optional birthday capture + two opt-outs that control
                  the quiet dashboard acknowledgment tile. The harbor
                  notices the day; it never celebrates. */}
              <section className="border-t border-[var(--sh-border-subtle)] pt-8">
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#a9793d]">
                  The Dates We Notice
                </p>
                <h3
                  className={`${serif.className} mt-3 text-3xl font-medium leading-tight text-[var(--sh-text-primary)]`}
                >
                  If you want us to mark a day with you.
                </h3>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--sh-text-secondary)]">
                  Stone Harbor quietly notices your birthday and a few of the
                  hardest days of the year — Thanksgiving, Christmas, New
                  Year&apos;s Eve, Father&apos;s Day. We will not celebrate. We
                  will simply notice. Both can be turned off.
                </p>

                <div className="mt-8">
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)]">
                    Your Birthday (Optional)
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
                      <option value="">Month</option>
                      {MONTH_NAMES.map((name, i) => (
                        <option key={name} value={i + 1}>
                          {name}
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
                      <option value="">Day</option>
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
                      placeholder="Year (optional)"
                      className={`h-[46px] w-full border px-4 text-sm transition focus:border-[var(--sh-accent-gold)] focus:outline-none ${
                        isDusk
                          ? "border-white/15 bg-black/40 text-stone-100 placeholder:text-stone-500"
                          : "border-[var(--sh-border-medium)] bg-white text-[var(--sh-text-secondary)]"
                      }`}
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-[var(--sh-text-tertiary)]">
                    The year is optional. We don&apos;t need your age — we just
                    remember the day.
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
                      Acknowledge my birthday quietly when it arrives.
                      <span className="block text-[11px] text-[var(--sh-text-tertiary)]">
                        A single tile on the dashboard. No popup. No email.
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
                      Acknowledge the hard holidays with me.
                      <span className="block text-[11px] text-[var(--sh-text-tertiary)]">
                        Thanksgiving, Christmas, New Year&apos;s Eve,
                        Father&apos;s Day. One quiet tile only on those days.
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
                    ? "Saving..."
                    : "Save Profile"}
                </button>

                <Link
                  href="/dashboard"
                  className={`rounded-none border px-8 py-4 text-xs font-bold uppercase tracking-[0.22em] transition hover:border-[var(--sh-accent-gold)] ${
                    isDusk
                      ? "border-white/15 bg-black/40 text-stone-100"
                      : "border-[var(--sh-border-medium)] bg-white text-[var(--sh-text-secondary)]"
                  }`}
                >
                  Cancel
                </Link>
              </div>

              {/* ────────── APPEARANCE ──────────
                  Member-level theme choice: Sunlit (cream) or Dusk
                  (dark amniotic). Saves to localStorage + Supabase
                  profiles.theme_preference on every toggle. */}
              <section className="mt-12 border-t border-[var(--sh-border-subtle)] pt-10">
                <ThemeToggle />
              </section>

              {/* ────────── CLOSE ACCOUNT ──────────
                  Required by Privacy Policy §8. A member can request
                  deletion at any time. We acknowledge in 30 days. */}
              <section className="mt-16 border-t border-[var(--sh-border-subtle)] pt-10">
                <p
                  className="text-xs font-bold uppercase tracking-[0.3em]"
                  style={{ color: "#b14a3a" }}
                >
                  Leaving the Harbor
                </p>
                <h3
                  className={`${serif.className} mt-3 text-3xl font-medium leading-tight text-[var(--sh-text-primary)]`}
                >
                  Close your account.
                </h3>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--sh-text-secondary)]">
                  You can close your account at any time. We will delete your
                  private journal entries within 30 days and your other personal
                  data within 90 days, as described in our{" "}
                  <Link
                    href="/privacy"
                    className="font-semibold text-[#a9793d] underline-offset-4 hover:underline"
                  >
                    Privacy Policy
                  </Link>
                  . If you ever want to come back, you are welcome — but a new
                  account will start fresh.
                </p>

                {!closeOpen ? (
                  <button
                    type="button"
                    onClick={() => setCloseOpen(true)}
                    className={`mt-6 rounded-none border border-[#b14a3a] px-6 py-3 text-[11px] font-bold uppercase tracking-[0.22em] text-[#b14a3a] transition hover:bg-[#b14a3a] hover:text-white ${
                      isDusk ? "bg-black/40" : "bg-white"
                    }`}
                  >
                    Close My Account
                  </button>
                ) : (
                  <div
                    className={`mt-6 border-l-[3px] px-6 py-6 ${
                      isDusk ? "bg-[#2a1612]" : "bg-[#fcefe9]"
                    }`}
                    style={{ borderLeftColor: "#b14a3a" }}
                  >
                    <p className="text-sm font-semibold text-[var(--sh-text-primary)]">
                      Are you sure?
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--sh-text-secondary)]">
                      Once submitted, your account is queued for deletion. You
                      will be signed out immediately. You can leave a brief note
                      below if you want to tell us why — it helps us improve,
                      and we read every one.
                    </p>
                    <textarea
                      value={closeReason}
                      onChange={(e) => setCloseReason(e.target.value)}
                      rows={3}
                      maxLength={1000}
                      placeholder="Anything you'd like us to know? (optional)"
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
                        {closing ? "Submitting…" : "Yes, Close My Account"}
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
                        Stay
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

      {/* FOOTER — 988 crisis line required on every authenticated screen */}
      <footer
        className={`relative z-10 mt-12 border-t border-[var(--sh-border-subtle)] px-6 py-8 backdrop-blur-sm ${
          isDusk ? "bg-black/30" : "bg-[#efe8dc]/70"
        }`}
      >
        <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-3 md:items-center">
          <p className="text-base font-bold uppercase tracking-[0.28em] text-[#a9793d]">
            Stone Harbor
          </p>
          <p
            className={`${serif.className} text-center text-base italic text-[var(--sh-text-secondary)]`}
          >
            The harbor is patient.
          </p>
          <p className="text-right text-sm leading-relaxed text-[var(--sh-text-secondary)]">
            <span className="block text-[10px] font-bold uppercase tracking-[0.3em] text-[var(--sh-text-tertiary)]">
              If You Are In Crisis
            </span>
            <span className="mt-1 block">
              Call or text <span className="font-bold text-[#a9793d]">988</span>{" "}
              — 24/7. Free. Confidential.
            </span>
          </p>
        </div>
      </footer>
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
}: {
  label: string;
  value: string;
  logoUrl: string;
  domain: string;
  suggestions: CompanySuggestion[];
  searching: boolean;
  onChange: (value: string) => void;
  onSelect: (company: CompanySuggestion) => void;
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
          placeholder="Start typing company name..."
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
          Searching...
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

function SelectInput({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
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
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}
