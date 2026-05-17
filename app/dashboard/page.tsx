"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Cormorant_Garamond, Inter } from "next/font/google";

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const sans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

type Profile = {
  email: string | null;
  display_name: string | null;
  username: string | null;
  role: string | null;
  bio: string | null;
  location: string | null;
  healing_stage: string | null;
  privacy_level: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  work?: string | null;
  education?: string | null;
  hometown?: string | null;
  relationship_status?: string | null;
  website?: string | null;
  languages?: string | null;
  interests?: string | null;
};

type CoverImage = {
  id: string;
  user_id: string;
  image_url: string;
  caption: string | null;
  created_at: string;
};

export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [coverImages, setCoverImages] = useState<CoverImage[]>([]);
  const [currentCoverIndex, setCurrentCoverIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const activeCover = useMemo(() => {
    return (
      coverImages[currentCoverIndex]?.image_url || profile?.cover_url || ""
    );
  }, [coverImages, currentCoverIndex, profile?.cover_url]);

  const activeCoverDetails = coverImages[currentCoverIndex] || null;

  async function checkUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    setUserId(user.id);

    const { data } = await supabase
      .from("profiles")
      .select(
        "email, display_name, username, role, bio, location, healing_stage, privacy_level, avatar_url, cover_url, work, education, hometown, relationship_status, website, languages, interests",
      )
      .eq("id", user.id)
      .single();

    const loadedProfile: Profile = {
      email: data?.email ?? user.email ?? null,
      display_name: data?.display_name ?? null,
      username: data?.username ?? null,
      role: data?.role ?? "member",
      bio: data?.bio ?? null,
      location: data?.location ?? null,
      healing_stage: data?.healing_stage ?? null,
      privacy_level: data?.privacy_level ?? "private",
      avatar_url: data?.avatar_url ?? null,
      cover_url: data?.cover_url ?? null,
      work: data?.work ?? null,
      education: data?.education ?? null,
      hometown: data?.hometown ?? null,
      relationship_status: data?.relationship_status ?? null,
      website: data?.website ?? null,
      languages: data?.languages ?? null,
      interests: data?.interests ?? null,
    };

    setProfile(loadedProfile);
    await loadCoverImages(user.id, loadedProfile.cover_url);
    setLoading(false);
  }

  async function loadCoverImages(
    currentUserId: string,
    currentCoverUrl: string | null,
  ) {
    const { data, error } = await supabase
      .from("profile_cover_images")
      .select("id, user_id, image_url, caption, created_at")
      .eq("user_id", currentUserId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Could not load cover image history:", error.message);
      setCoverImages([]);
      return;
    }

    const images = data ?? [];
    setCoverImages(images);

    if (currentCoverUrl && images.length > 0) {
      const activeIndex = images.findIndex(
        (image) => image.image_url === currentCoverUrl,
      );

      setCurrentCoverIndex(activeIndex >= 0 ? activeIndex : 0);
    } else {
      setCurrentCoverIndex(0);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function useCurrentImageAsCover() {
    if (!userId || !activeCoverDetails) return;

    const { error } = await supabase
      .from("profiles")
      .update({
        cover_url: activeCoverDetails.image_url,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (error) {
      alert(`Could not update cover: ${error.message}`);
      return;
    }

    setProfile((prev) =>
      prev
        ? {
            ...prev,
            cover_url: activeCoverDetails.image_url,
          }
        : prev,
    );
  }

  function previousCover() {
    if (coverImages.length <= 1) return;

    setCurrentCoverIndex((current) =>
      current === 0 ? coverImages.length - 1 : current - 1,
    );
  }

  function nextCover() {
    if (coverImages.length <= 1) return;

    setCurrentCoverIndex((current) =>
      current === coverImages.length - 1 ? 0 : current + 1,
    );
  }

  function formatLabel(value: string | null | undefined) {
    if (!value) return "Not set";
    return value.replaceAll("_", " ");
  }

  function formatDateTime(dateValue: string | null | undefined) {
    if (!dateValue) return "No date available";

    return new Date(dateValue).toLocaleString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  useEffect(() => {
    checkUser();
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3efe7]">
        <p className="text-sm font-bold uppercase tracking-[0.3em] text-stone-600">
          Loading Harbor...
        </p>
      </main>
    );
  }

  return (
    <main
      className={`${sans.className} min-h-screen bg-[#f3efe7] px-4 py-8 text-stone-900 md:px-8`}
    >
      <section className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <a
            href="/"
            className="text-sm font-bold uppercase tracking-[0.35em] text-[#a9793d]"
          >
            ← Stone Harbor
          </a>

          <div className="flex flex-wrap gap-3">
            <a
              href="/welcome"
              className="rounded-none border border-stone-300 bg-white/70 px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-stone-700 transition hover:border-[#a9793d] hover:bg-white"
            >
              Edit Profile
            </a>

            <button
              onClick={handleLogout}
              className="rounded-none border border-stone-300 bg-white/70 px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-stone-700 transition hover:border-[#a9793d] hover:bg-white"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="mb-10 overflow-hidden rounded-none border border-stone-200 bg-[#f8f4ed] shadow-[0_20px_70px_rgba(0,0,0,0.08)]">
          <div
            className="relative h-64 bg-cover bg-center"
            style={{
              backgroundImage: activeCover
                ? `url(${activeCover})`
                : "linear-gradient(135deg, #d8b07b, #8d6432)",
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/5 to-transparent" />

            <a
              href="/welcome"
              onClick={(event) => event.stopPropagation()}
              className="absolute right-5 top-5 cursor-pointer rounded-none border border-white/40 bg-white/30 px-5 py-3 text-xs font-bold uppercase tracking-[0.2em] text-white shadow-lg backdrop-blur-xl transition hover:bg-white/45"
            >
              Upload Cover
            </a>

            {coverImages.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    previousCover();
                  }}
                  className="absolute left-5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-none border border-white/40 bg-white/25 text-2xl text-white backdrop-blur-xl transition hover:bg-white/40"
                  aria-label="Previous cover image"
                >
                  ‹
                </button>

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    nextCover();
                  }}
                  className="absolute right-5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-none border border-white/40 bg-white/25 text-2xl text-white backdrop-blur-xl transition hover:bg-white/40"
                  aria-label="Next cover image"
                >
                  ›
                </button>
              </>
            )}

            <div
              onClick={() => activeCover && setViewerOpen(true)}
              className="absolute inset-0 cursor-pointer"
            />

            <div className="absolute bottom-5 right-5 rounded-none border border-white/35 bg-white/25 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-white backdrop-blur-xl">
              {coverImages.length > 0
                ? `${currentCoverIndex + 1} of ${coverImages.length}`
                : "No Cover History"}
            </div>

            <div className="absolute -bottom-14 left-8">
              <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-4 border-[#f8f4ed] bg-[#efe8dc] shadow-xl">
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt="Profile avatar"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-5xl text-[#a9793d]">⚓</span>
                )}
              </div>
            </div>
          </div>

          <div className="px-8 pb-8 pt-24">
            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.25em] text-[#a9793d]">
                  Member Home
                </p>

                <h1
                  className={`${serif.className} mt-3 text-5xl font-medium leading-tight text-stone-900 md:text-7xl`}
                >
                  {profile?.display_name || "Stone Harbor Member"}
                </h1>

                <p className="mt-2 text-sm font-bold uppercase tracking-[0.22em] text-stone-400">
                  {profile?.username ? `@${profile.username}` : profile?.email}
                </p>

                <div className="mt-4 flex flex-wrap gap-x-3 gap-y-2 text-sm font-semibold text-stone-500">
                  <span>{profile?.location || "Location not set"}</span>
                  <span>•</span>
                  <span className="capitalize">
                    {formatLabel(profile?.healing_stage)}
                  </span>
                  <span>•</span>
                  <span className="capitalize">
                    {formatLabel(profile?.privacy_level)}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <a
                  href="/welcome"
                  className="rounded-none bg-[#a9793d] px-7 py-4 text-xs font-bold uppercase tracking-[0.22em] text-white shadow-md transition hover:bg-[#8d6432]"
                >
                  Edit Profile
                </a>

                <a
                  href="/journal"
                  className="rounded-none border border-stone-300 bg-white px-7 py-4 text-xs font-bold uppercase tracking-[0.22em] text-stone-700 transition hover:border-[#a9793d]"
                >
                  Journal
                </a>
              </div>
            </div>

            <p className="mt-8 max-w-4xl border-t border-stone-200 pt-6 text-lg leading-relaxed text-stone-700 md:text-xl">
              {profile?.bio ||
                "Welcome to your private harbor. This is your space to rebuild, reflect, and reconnect with who you are becoming."}
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
          <aside className="rounded-none border border-white/70 bg-white p-7 shadow-[0_16px_60px_rgba(0,0,0,0.06)]">
            <div className="mb-6 flex items-center justify-between">
              <h2
                className={`${serif.className} text-4xl font-medium text-stone-900`}
              >
                Intro
              </h2>

              <a
                href="/welcome"
                className="text-xs font-bold uppercase tracking-[0.22em] text-[#a9793d]"
              >
                Edit
              </a>
            </div>

            <div className="divide-y divide-stone-200">
              <AboutRow icon="⚑" label="Lives in" value={profile?.location} />
              <AboutRow icon="◬" label="From" value={profile?.hometown} />
              <AboutRow icon="⚒" label="Work" value={profile?.work} />
              <AboutRow icon="⌬" label="Education" value={profile?.education} />
              <AboutRow
                icon="⊹"
                label="Relationship"
                value={formatLabel(profile?.relationship_status)}
              />
              <AboutRow icon="◎" label="Website" value={profile?.website} />
              <AboutRow icon="⋄" label="Languages" value={profile?.languages} />
              <AboutRow icon="✢" label="Interests" value={profile?.interests} />
            </div>
          </aside>

          <section>
            <div className="grid gap-6 md:grid-cols-2">
              <DashboardCard
                href="/journal"
                label="Private"
                title="Journal"
                text="Write, search, and revisit private reflections only you can access."
              />

              <DashboardCard
                href="/members-blog"
                label="Members"
                title="Blog"
                text="Read protected articles and join thoughtful member discussions."
              />

              <DashboardCard
                href="/welcome"
                label="Identity"
                title="Profile"
                text="Update your avatar, cover image, privacy defaults, and healing stage."
              />

              <DashboardCard
                href="/community"
                label="Coming Soon"
                title="Community"
                text="Future member feed, photo sharing, friends, and support circles."
              />
            </div>
          </section>
        </div>
      </section>

      {viewerOpen && (
        <div className="fixed inset-0 z-[100] bg-black/90">
          <button
            type="button"
            onClick={() => setViewerOpen(false)}
            className="absolute right-6 top-6 z-20 rounded-none border border-white/30 bg-white/10 px-6 py-3 text-xs font-bold uppercase tracking-[0.25em] text-white backdrop-blur-xl transition hover:bg-white/20"
          >
            Close
          </button>

          {coverImages.length > 1 && (
            <>
              <button
                type="button"
                onClick={previousCover}
                className="absolute left-6 top-1/2 z-20 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-none border border-white/30 bg-white/10 text-3xl text-white backdrop-blur-xl transition hover:bg-white/20"
                aria-label="Previous image"
              >
                ‹
              </button>

              <button
                type="button"
                onClick={nextCover}
                className="absolute right-6 top-1/2 z-20 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-none border border-white/30 bg-white/10 text-3xl text-white backdrop-blur-xl transition hover:bg-white/20"
                aria-label="Next image"
              >
                ›
              </button>
            </>
          )}

          <div
            className="h-full w-full bg-contain bg-center bg-no-repeat"
            style={{
              backgroundImage: activeCover
                ? `url(${activeCover})`
                : "linear-gradient(135deg, #d8b07b, #8d6432)",
            }}
          />

          <div className="absolute bottom-8 left-8 max-w-xl rounded-none border border-white/20 bg-black/35 p-6 text-white backdrop-blur-2xl">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em] text-[#f4d7a1]">
              Cover Image
            </p>

            <h2 className={`${serif.className} text-4xl font-medium`}>
              {activeCoverDetails?.caption || "Profile Cover"}
            </h2>

            <p className="mt-3 text-sm leading-relaxed text-white/80">
              Uploaded: {formatDateTime(activeCoverDetails?.created_at)}
            </p>

            <p className="mt-1 text-sm leading-relaxed text-white/80">
              Image {coverImages.length > 0 ? currentCoverIndex + 1 : 0} of{" "}
              {coverImages.length}
            </p>

            {activeCoverDetails?.image_url === profile?.cover_url ? (
              <p className="mt-4 rounded-none border border-white/25 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-white/90">
                Current Active Cover
              </p>
            ) : (
              <button
                type="button"
                onClick={useCurrentImageAsCover}
                className="mt-4 rounded-none bg-[#a9793d] px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-white transition hover:bg-[#8d6432]"
              >
                Use as Cover
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function AboutRow({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value?: string | null;
}) {
  return (
    <div className="flex gap-5 py-5">
      <div className="min-w-[42px] pt-[2px] text-3xl font-light leading-none text-stone-500">
        {icon}
      </div>

      <div>
        <p className="text-sm font-bold uppercase tracking-[0.28em] text-[#a9793d]">
          {label}
        </p>

        <p className="mt-2 text-lg font-medium leading-relaxed text-stone-800">
          {value || "Not added yet"}
        </p>
      </div>
    </div>
  );
}

function DashboardCard({
  href,
  label,
  title,
  text,
}: {
  href: string;
  label: string;
  title: string;
  text: string;
}) {
  return (
    <a
      href={href}
      className="group rounded-none border border-white/70 bg-white p-7 shadow-[0_12px_40px_rgba(0,0,0,0.05)] transition duration-300 hover:-translate-y-1 hover:border-[#a9793d]/40 hover:shadow-[0_18px_55px_rgba(0,0,0,0.09)]"
    >
      <p className="mb-4 text-sm font-bold uppercase tracking-[0.25em] text-[#a9793d]">
        {label}
      </p>

      <h3 className={`${serif.className} text-4xl font-medium text-stone-900`}>
        {title}
      </h3>

      <p className="mt-4 leading-relaxed text-stone-600">{text}</p>

      <p className="mt-6 text-sm font-bold uppercase tracking-[0.2em] text-stone-400 transition group-hover:text-[#a9793d]">
        Open →
      </p>
    </a>
  );
}
