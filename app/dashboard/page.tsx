"use client";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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

// Two-color discipline — matches home/page.tsx
const GOLD = "#c4934e";
const GOLD_DEEP = "#a9793d";
const MOSS = "#586558";

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
  work_company_name?: string | null;
  work_company_logo_url?: string | null;
  work_company_domain?: string | null;
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

type DailyQuote = {
  quote_text: string;
  theme: string;
  category: string | null;
};

type MemberPost = {
  id: string;
  user_id: string;
  body: string;
  privacy_level: string;
  created_at: string;
  profiles?: {
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
  } | null;
};

type DashboardCardProps = {
  href: string;
  label: string;
  title: string;
  text: string;
  badge?: number;
};

function normalizeHealingStage(value: string | null | undefined) {
  const stage = value?.trim().toLowerCase();
  if (stage === "calm") return "Calm";
  if (stage === "strength" || stage === "strenght") return "Strength";
  return "Clarity";
}

function stageAccent(stage: string) {
  return stage === "Calm" ? MOSS : GOLD_DEEP;
}

function timeGreeting() {
  const h = new Date().getHours();
  if (h < 5) return "Late night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Tonight";
}

function identityLine(stage: string) {
  if (stage === "Calm") return "On the path: Calm.";
  if (stage === "Strength") return "On the path: Strength.";
  return "On the path: Clarity.";
}

export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [coverImages, setCoverImages] = useState<CoverImage[]>([]);
  const [currentCoverIndex, setCurrentCoverIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [introExpanded, setIntroExpanded] = useState(true);
  const [loading, setLoading] = useState(true);
  const [dailyQuote, setDailyQuote] = useState<DailyQuote | null>(null);
  const [quoteStage, setQuoteStage] = useState("Clarity");
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [postBody, setPostBody] = useState("");
  const [postPrivacy, setPostPrivacy] = useState("members");
  const [memberPosts, setMemberPosts] = useState<MemberPost[]>([]);
  const [posting, setPosting] = useState(false);
  const [breathPhase, setBreathPhase] = useState<"inhale" | "exhale">("inhale");

  const activeCover = useMemo(() => {
    return (
      coverImages[currentCoverIndex]?.image_url || profile?.cover_url || ""
    );
  }, [coverImages, currentCoverIndex, profile?.cover_url]);

  const activeCoverDetails = coverImages[currentCoverIndex] || null;
  const stage = normalizeHealingStage(profile?.healing_stage);
  const accent = stageAccent(stage);

  // 4s/4s box-breath cycle — matches home page rhythm.
  useEffect(() => {
    const id = setInterval(() => {
      setBreathPhase((p) => (p === "inhale" ? "exhale" : "inhale"));
    }, 4000);
    return () => clearInterval(id);
  }, []);

  async function loadUnreadMessageCount() {
    const { data, error } = await supabase.rpc("get_unread_message_count");
    if (error) {
      console.error("Could not load unread message count:", error.message);
      setUnreadMessageCount(0);
      return;
    }
    setUnreadMessageCount(data ?? 0);
  }

  async function loadMemberPosts() {
    // 1) Pull the posts on their own — no PostgREST embedding, so no FK dependency.
    const { data: postsData, error: postsError } = await supabase
      .from("member_posts")
      .select("id, user_id, body, privacy_level, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(25);

    if (postsError) {
      console.error("Could not load timeline:", postsError.message);
      setMemberPosts([]);
      return;
    }

    const posts = postsData ?? [];
    if (posts.length === 0) {
      setMemberPosts([]);
      return;
    }

    // 2) Fetch the unique authors in one query.
    const userIds = Array.from(new Set(posts.map((p) => p.user_id)));
    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("id, display_name, username, avatar_url")
      .in("id", userIds);

    if (profilesError) {
      console.error("Could not load post authors:", profilesError.message);
    }

    const profileMap = new Map<
      string,
      {
        display_name: string | null;
        username: string | null;
        avatar_url: string | null;
      }
    >(
      (profilesData ?? []).map((p) => [
        p.id as string,
        {
          display_name: p.display_name ?? null,
          username: p.username ?? null,
          avatar_url: p.avatar_url ?? null,
        },
      ]),
    );

    // 3) Stitch them together into the shape the UI already expects.
    const merged: MemberPost[] = posts.map((post) => ({
      id: post.id,
      user_id: post.user_id,
      body: post.body,
      privacy_level: post.privacy_level,
      created_at: post.created_at,
      profiles: profileMap.get(post.user_id) ?? null,
    }));

    setMemberPosts(merged);
  }

  async function createMemberPost(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!userId || !postBody.trim()) return;
    setPosting(true);
    const { error } = await supabase.from("member_posts").insert({
      user_id: userId,
      body: postBody.trim(),
      privacy_level: postPrivacy,
    });
    if (error) {
      alert(error.message);
      setPosting(false);
      return;
    }
    setPostBody("");
    setPostPrivacy("members");
    await loadMemberPosts();
    setPosting(false);
  }

  async function deleteMemberPost(postId: string) {
    const confirmed = window.confirm("Delete this post?");
    if (!confirmed) return;
    const { error } = await supabase
      .from("member_posts")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", postId);
    if (error) {
      alert(error.message);
      return;
    }
    await loadMemberPosts();
  }

  function formatPostDate(value: string) {
    return new Date(value).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  async function loadDailyQuote(healingStageValue: string | null | undefined) {
    const today = new Date().toISOString().split("T")[0];
    const normalizedStage = normalizeHealingStage(healingStageValue);
    setQuoteStage(normalizedStage);

    const { data, error } = await supabase
      .from("daily_quotes")
      .select("quote_text, theme, category")
      .eq("quote_date", today)
      .eq("audience", "men")
      .eq("theme", normalizedStage)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      console.error("Daily quote error:", error.message);
      setDailyQuote(null);
      return;
    }
    if (data) {
      setDailyQuote(data);
      return;
    }
    const { data: fallbackQuote, error: fallbackError } = await supabase
      .from("daily_quotes")
      .select("quote_text, theme, category")
      .eq("quote_date", today)
      .eq("audience", "men")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (fallbackError) {
      console.error("Fallback quote error:", fallbackError.message);
      setDailyQuote(null);
      return;
    }
    setDailyQuote(fallbackQuote);
  }

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
        "email, display_name, username, role, bio, location, healing_stage, privacy_level, avatar_url, cover_url, work, work_company_name, work_company_logo_url, work_company_domain, education, hometown, relationship_status, website, languages, interests",
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
      work_company_name: data?.work_company_name ?? null,
      work_company_logo_url: data?.work_company_logo_url ?? null,
      work_company_domain: data?.work_company_domain ?? null,
      education: data?.education ?? null,
      hometown: data?.hometown ?? null,
      relationship_status: data?.relationship_status ?? null,
      website: data?.website ?? null,
      languages: data?.languages ?? null,
      interests: data?.interests ?? null,
    };

    setProfile(loadedProfile);
    await loadCoverImages(user.id, loadedProfile.cover_url);
    await loadDailyQuote(loadedProfile.healing_stage);
    await loadUnreadMessageCount();
    await loadMemberPosts();
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
      prev ? { ...prev, cover_url: activeCoverDetails.image_url } : prev,
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

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`dashboard-live-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async () => {
          await loadUnreadMessageCount();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "member_posts" },
        async () => {
          await loadMemberPosts();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // STYLED LOADING — breathing pulse on warm cream
  if (loading) {
    return (
      <main
        className={`${sans.className} flex min-h-screen items-center justify-center bg-[#f3efe7]`}
      >
        <div className="flex flex-col items-center">
          <motion.div
            animate={{ scale: [1, 1.18, 1], opacity: [0.6, 0.95, 0.6] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="h-24 w-24 rounded-full border border-[#c4934e]/30"
            style={{
              background:
                "radial-gradient(circle, rgba(196,147,78,0.20) 0%, rgba(196,147,78,0.04) 70%, transparent 100%)",
            }}
          />
          <p
            className={`${serif.className} mt-8 text-2xl italic text-stone-700`}
          >
            Returning to your harbor…
          </p>
        </div>
      </main>
    );
  }

  return (
    <main
      className={`${sans.className} relative min-h-screen overflow-hidden bg-[#f3efe7] text-stone-900`}
    >
      {/* AMBIENT — contour pattern at very low opacity for visual continuity with home */}
      <svg
        className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-[0.035]"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern
            id="dash-contour"
            x="0"
            y="0"
            width="320"
            height="320"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M0 60 Q 80 30 160 60 T 320 60"
              fill="none"
              stroke="#a9793d"
              strokeWidth="1"
            />
            <path
              d="M0 130 Q 80 100 160 130 T 320 130"
              fill="none"
              stroke="#a9793d"
              strokeWidth="1"
            />
            <path
              d="M0 200 Q 80 170 160 200 T 320 200"
              fill="none"
              stroke="#a9793d"
              strokeWidth="1"
            />
            <path
              d="M0 270 Q 80 240 160 270 T 320 270"
              fill="none"
              stroke="#a9793d"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dash-contour)" />
      </svg>

      {/* AMBIENT — paper grain across the whole page */}
      <svg
        className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-[0.05] mix-blend-multiply"
        xmlns="http://www.w3.org/2000/svg"
      >
        <filter id="dash-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves="2"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#dash-grain)" />
      </svg>

      {/* AMBIENT — dawn glow in upper right, the "window of light" */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 50% 35% at 88% 8%, rgba(196,147,78,0.18) 0%, rgba(196,147,78,0.06) 40%, transparent 75%)",
        }}
      />

      <section className="relative z-10 mx-auto max-w-7xl px-4 py-8 md:px-8">
        {/* TOP NAV */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <a href="/" className="group flex flex-col leading-none no-underline">
            <span className="text-base font-bold uppercase tracking-[0.28em] text-[#a9793d] transition group-hover:text-[#8d6432]">
              ← Stone Harbor
            </span>
            <span className="mt-1 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-[#a9793d]/70">
              Men&apos;s Mental Wellness
            </span>
          </a>
          <div className="flex flex-wrap gap-3">
            <a
              href="/welcome"
              className="group relative overflow-hidden rounded-none border border-stone-300 bg-white/70 px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-stone-700 transition hover:border-[#a9793d] hover:bg-white"
            >
              <span className="relative z-10">Edit Profile</span>
              <span className="absolute bottom-0 left-0 h-[2px] w-0 bg-[#c4934e] transition-all duration-500 group-hover:w-full" />
            </a>
            <a
              href="/messages"
              className="group relative overflow-hidden rounded-none border border-stone-300 bg-white/70 px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-stone-700 transition hover:border-[#a9793d] hover:bg-white"
            >
              <span className="relative z-10">Messages</span>
              <span className="absolute bottom-0 left-0 h-[2px] w-0 bg-[#c4934e] transition-all duration-500 group-hover:w-full" />
              {unreadMessageCount > 0 && (
                <span className="absolute -right-2 -top-2 z-20 flex h-6 min-w-6 items-center justify-center border border-[#c4934e] bg-[#a9793d] px-2 text-[10px] font-black text-white">
                  {unreadMessageCount}
                </span>
              )}
            </a>
            <button
              onClick={handleLogout}
              className="group relative overflow-hidden rounded-none border border-stone-300 bg-white/70 px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-stone-700 transition hover:border-[#a9793d] hover:bg-white"
            >
              <span className="relative z-10">Logout</span>
              <span className="absolute bottom-0 left-0 h-[2px] w-0 bg-[#c4934e] transition-all duration-500 group-hover:w-full" />
            </button>
          </div>
        </div>

        {/* GREETING STRIP — daily ritual + retention hooks */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8 grid gap-6 border-y border-stone-200 bg-white/40 px-6 py-6 backdrop-blur-sm md:grid-cols-4"
        >
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-stone-500">
              {timeGreeting()}
            </p>
            <p
              className={`${serif.className} mt-2 text-2xl italic`}
              style={{ color: accent }}
            >
              {profile?.display_name?.split(" ")[0] || "Friend"}.
            </p>
            <p
              className="mt-1 text-[10px] font-bold uppercase tracking-[0.22em]"
              style={{ color: accent }}
            >
              {identityLine(stage)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-stone-500">
              Streak
            </p>
            {/* TODO: wire to real streak query */}
            <p
              className={`${serif.className} mt-2 text-2xl italic text-stone-900`}
            >
              Day 7.
            </p>
            <p className="mt-1 text-xs leading-relaxed text-stone-500">
              Missing a day doesn&apos;t reset you.
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-stone-500">
              Tomorrow
            </p>
            <p
              className={`${serif.className} mt-2 text-2xl italic text-stone-900`}
            >
              A question on boundaries.
            </p>
            <p className="mt-1 text-xs leading-relaxed text-stone-500">
              Three sentences. That&apos;s all.
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-stone-500">
              Brotherhood
            </p>
            {/* TODO: wire to real Supabase count of today's posts/check-ins */}
            <p
              className={`${serif.className} mt-2 text-2xl italic text-stone-900`}
            >
              12 men reflected today.
            </p>
            <p className="mt-1 text-xs leading-relaxed text-stone-500">
              You&apos;re not the only one here.
            </p>
          </div>
        </motion.div>

        {/* PROFILE CARD */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="mb-10 overflow-hidden rounded-none border border-stone-200 bg-[#f8f4ed] shadow-[0_20px_70px_rgba(0,0,0,0.08)]"
        >
          <div
            className="group relative h-64 bg-cover bg-center"
            style={{
              backgroundImage: activeCover
                ? `url(${activeCover})`
                : "linear-gradient(135deg, #d8b07b, #8d6432)",
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/5 to-transparent" />
            {coverImages.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    previousCover();
                  }}
                  className="absolute left-5 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/15 text-lg text-white/70 opacity-0 backdrop-blur-md transition duration-300 hover:bg-black/25 hover:text-white group-hover:opacity-100"
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
                  className="absolute right-5 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/15 text-lg text-white/70 opacity-0 backdrop-blur-md transition duration-300 hover:bg-black/25 hover:text-white group-hover:opacity-100"
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
            <div className="absolute bottom-5 right-5 z-20 rounded-full border border-white/15 bg-black/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70 opacity-0 backdrop-blur-md transition duration-300 group-hover:opacity-100">
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
                    className="h-full w-full rounded-full object-cover"
                  />
                ) : (
                  <span className="text-5xl text-[#a9793d]">⚓</span>
                )}
              </div>
            </div>
          </div>
          <div className="px-8 pb-8 pt-16">
            <div className="grid gap-8 md:grid-cols-[1.05fr_auto_0.95fr] md:items-start">
              <div>
                <p
                  className="text-xs font-bold uppercase tracking-[0.22em]"
                  style={{ color: accent }}
                >
                  {identityLine(stage)}
                </p>
                <h1
                  className={`${serif.className} mt-3 text-5xl font-medium leading-tight text-stone-900 md:text-7xl`}
                >
                  {profile?.display_name || "Stone Harbor Member"}
                </h1>
                <p className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-stone-400">
                  {profile?.username ? `@${profile.username}` : profile?.email}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-stone-500">
                  <span>{profile?.location || "Location not set"}</span>
                  <span>•</span>
                  <span
                    className="border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.22em]"
                    style={{ borderColor: accent, color: accent }}
                  >
                    {stage}
                  </span>
                  <span>•</span>
                  <span className="capitalize">
                    {formatLabel(profile?.privacy_level)}
                  </span>
                </div>
              </div>
              <div className="hidden w-px self-stretch bg-stone-200 md:block" />
              <div className="border-t border-stone-200 pt-6 md:border-t-0 md:pt-0">
                <p
                  className="mb-3 text-[10px] font-bold uppercase tracking-[0.28em]"
                  style={{ color: accent }}
                >
                  Perspective
                </p>
                <p className="text-base leading-relaxed text-stone-700 md:text-lg">
                  {profile?.bio ||
                    "Welcome to your private harbor. This is your space to rebuild, reflect, and reconnect with who you are becoming."}
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* DAILY REFLECTION */}
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className="mb-8"
        >
          <div className="relative overflow-hidden rounded-none border border-stone-200 bg-gradient-to-br from-[#f8f4ed] via-[#f3efe7] to-[#efe8dc] px-6 py-10 shadow-[0_14px_40px_rgba(0,0,0,0.06)] md:px-10 md:py-12">
            {/* paper grain inside the panel */}
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.04] mix-blend-multiply"
              xmlns="http://www.w3.org/2000/svg"
            >
              <filter id="quote-grain">
                <feTurbulence
                  type="fractalNoise"
                  baseFrequency="0.85"
                  numOctaves="2"
                />
                <feColorMatrix type="saturate" values="0" />
              </filter>
              <rect width="100%" height="100%" filter="url(#quote-grain)" />
            </svg>
            <div className="relative mx-auto max-w-5xl text-center">
              <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.38em] text-[#a9793d]">
                Today&apos;s Reflection
              </p>
              {dailyQuote ? (
                <>
                  <p
                    className={`${serif.className} mx-auto max-w-[1100px] text-2xl font-medium italic leading-[1.18] tracking-[-0.015em] text-stone-900 md:text-4xl xl:text-[2.85rem]`}
                  >
                    &ldquo;{dailyQuote.quote_text}&rdquo;
                  </p>
                  <div className="mt-6 flex justify-center">
                    <span
                      className="border bg-white/60 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.24em] shadow-sm"
                      style={{
                        borderColor: stageAccent(dailyQuote.theme) + "59",
                        color: stageAccent(dailyQuote.theme),
                      }}
                    >
                      {dailyQuote.theme}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <p
                    className={`${serif.className} mx-auto max-w-4xl text-2xl font-medium italic leading-[1.18] tracking-[-0.015em] text-stone-900 md:text-4xl`}
                  >
                    Your reflection is being prepared.
                  </p>
                  <p className="mx-auto mt-3 max-w-xl text-xs leading-relaxed text-stone-500">
                    No active quote was found for today&apos;s {quoteStage}{" "}
                    stage. Generate this week&apos;s reflections and refresh
                    your harbor.
                  </p>
                </>
              )}
            </div>
          </div>
        </motion.section>

        {/* DAILY BREATH — compact return ritual */}
        <motion.section
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className="mb-12 flex flex-col items-center gap-6 border-y border-stone-200 px-6 py-10 md:flex-row md:justify-center md:gap-12"
        >
          <motion.div
            animate={{
              scale: breathPhase === "inhale" ? 1.25 : 1,
              opacity: breathPhase === "inhale" ? 0.95 : 0.55,
            }}
            transition={{ duration: 4, ease: "easeInOut" }}
            className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full border"
            style={{
              borderColor: accent + "66",
              background: `radial-gradient(circle, ${accent}33 0%, ${accent}0A 70%, transparent 100%)`,
            }}
          >
            <span
              className={`${serif.className} text-base italic`}
              style={{ color: accent }}
            >
              {breathPhase === "inhale" ? "Inhale" : "Exhale"}
            </span>
          </motion.div>
          <div className="text-center md:text-left">
            <p
              className="text-[10px] font-bold uppercase tracking-[0.32em]"
              style={{ color: accent }}
            >
              Daily Breath
            </p>
            <p
              className={`${serif.className} mt-2 text-3xl italic text-stone-900`}
            >
              Sixty seconds, every morning.
            </p>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-stone-600">
              One breath at the door of the harbor. Stay as long as you want.
            </p>
          </div>
        </motion.section>

        {/* TIMELINE COMPOSER + FEED */}
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className="mb-12"
        >
          <div className="grid gap-8 lg:grid-cols-[0.42fr_0.58fr]">
            <form
              onSubmit={createMemberPost}
              className="rounded-none border border-white/70 bg-white p-7 shadow-[0_16px_60px_rgba(0,0,0,0.06)]"
            >
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.28em] text-[#a9793d]">
                Timeline
              </p>
              <h2
                className={`${serif.className} text-4xl font-medium text-stone-900`}
              >
                Share an update.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-stone-600">
                Post a reflection, milestone, or thought for other Stone Harbor
                members.
              </p>
              <textarea
                value={postBody}
                onChange={(e) => setPostBody(e.target.value)}
                rows={6}
                className="mt-6 w-full resize-none rounded-none border border-stone-300 bg-[#f8f4ed] px-5 py-4 outline-none transition focus:border-[#a9793d] focus:ring-2 focus:ring-[#586558]/30"
                placeholder="What would you like to share?"
              />
              <select
                value={postPrivacy}
                onChange={(e) => setPostPrivacy(e.target.value)}
                className="mt-4 w-full rounded-none border border-stone-300 bg-[#f8f4ed] px-5 py-4 outline-none transition focus:border-[#a9793d]"
              >
                <option value="members">Members only</option>
                <option value="private">Private</option>
              </select>
              <button
                type="submit"
                disabled={posting || !postBody.trim()}
                className="group relative mt-5 w-full overflow-hidden rounded-none border border-[#c4934e] bg-[#a9793d] px-8 py-4 text-sm font-bold uppercase tracking-[0.22em] text-white transition hover:bg-[#8d6432] disabled:opacity-60"
              >
                <span className="relative z-10">
                  {posting ? "Posting..." : "Post Update"}
                </span>
              </button>
            </form>
            <div className="rounded-none border border-white/70 bg-white p-7 shadow-[0_16px_60px_rgba(0,0,0,0.06)]">
              <div className="mb-6 flex items-end justify-between gap-4">
                <div>
                  <p className="mb-3 text-xs font-bold uppercase tracking-[0.28em] text-[#a9793d]">
                    Member Feed
                  </p>
                  <h2
                    className={`${serif.className} text-4xl font-medium text-stone-900`}
                  >
                    Recent posts.
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={loadMemberPosts}
                  className="rounded-none border border-stone-300 bg-[#f8f4ed] px-5 py-3 text-xs font-bold uppercase tracking-[0.2em] text-stone-600 transition hover:border-[#a9793d]"
                >
                  Refresh
                </button>
              </div>
              {memberPosts.length === 0 ? (
                <div className="border border-stone-200 bg-[#f8f4ed] p-6 text-stone-600">
                  No timeline posts yet.
                </div>
              ) : (
                <div className="max-h-[620px] space-y-5 overflow-y-auto pr-2">
                  {memberPosts.map((post) => (
                    <article
                      key={post.id}
                      className="rounded-none border border-stone-200 bg-[#f8f4ed] p-6 transition hover:border-[#a9793d]/40"
                    >
                      <div className="mb-4 flex items-start justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-stone-200 bg-[#efe8dc]">
                            {post.profiles?.avatar_url ? (
                              <img
                                src={post.profiles.avatar_url}
                                alt="Member avatar"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span className="text-lg text-[#a9793d]">⚓</span>
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-stone-900">
                              {post.profiles?.display_name ||
                                post.profiles?.username ||
                                "Stone Harbor Member"}
                            </p>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                              {formatPostDate(post.created_at)} ·{" "}
                              {post.privacy_level === "private"
                                ? "Private"
                                : "Members"}
                            </p>
                          </div>
                        </div>
                        {post.user_id === userId && (
                          <button
                            type="button"
                            onClick={() => deleteMemberPost(post.id)}
                            className="rounded-none border border-stone-300 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-stone-500 transition hover:border-red-300 hover:text-red-600"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap text-lg leading-relaxed text-stone-700">
                        {post.body}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.section>

        {/* ANCHOR + DASHBOARD CARDS */}
        <div
          className={`mt-8 grid items-stretch gap-8 ${
            introExpanded ? "lg:grid-cols-[0.85fr_1.15fr]" : "lg:grid-cols-1"
          }`}
        >
          <motion.aside
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7 }}
            className="relative flex h-full flex-col rounded-none border border-white/70 bg-white p-7 shadow-[0_16px_60px_rgba(0,0,0,0.06)]"
          >
            <button
              type="button"
              onClick={() => setIntroExpanded((current) => !current)}
              className="absolute right-5 top-5 text-2xl leading-none text-[#a9793d] transition hover:text-[#8d6432]"
              aria-label={
                introExpanded
                  ? "Contract intro section"
                  : "Expand intro section"
              }
              title={introExpanded ? "Contract intro" : "Expand intro"}
            >
              {introExpanded ? "⌃" : "⌄"}
            </button>
            <div className="mb-6 flex items-center justify-between pr-8">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#a9793d]">
                  Anchor
                </p>
                <h2
                  className={`${serif.className} mt-2 text-4xl font-medium text-stone-900`}
                >
                  Who you are.
                </h2>
              </div>
            </div>
            {introExpanded ? (
              <div className="flex flex-1 flex-col divide-y divide-stone-200">
                <AboutRow icon="⚑" label="Lives in" value={profile?.location} />
                <AboutRow icon="◬" label="From" value={profile?.hometown} />
                <AboutRow
                  icon="⚒"
                  label="Work"
                  value={profile?.work_company_name || profile?.work}
                  logoUrl={profile?.work_company_logo_url}
                  domain={profile?.work_company_domain}
                />
                <AboutRow
                  icon="⌬"
                  label="Education"
                  value={profile?.education}
                />
                <AboutRow
                  icon="⊹"
                  label="Relationship"
                  value={formatLabel(profile?.relationship_status)}
                />
                <AboutRow icon="◎" label="Website" value={profile?.website} />
                <AboutRow
                  icon="⋄"
                  label="Languages"
                  value={profile?.languages}
                />
                <AboutRow
                  icon="✢"
                  label="Interests"
                  value={profile?.interests}
                />
              </div>
            ) : null}
          </motion.aside>

          <motion.section
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="h-full"
          >
            <div
              className={`grid h-full gap-6 ${
                introExpanded
                  ? "md:grid-cols-2 md:grid-rows-2"
                  : "md:grid-cols-2 xl:grid-cols-4"
              }`}
            >
              <DashboardCard
                href="/journal"
                label="Private"
                title="Reflect"
                text="Write, search, and revisit private reflections only you can access."
              />
              <DashboardCard
                href="/messages"
                label={
                  unreadMessageCount > 0
                    ? `${unreadMessageCount} Unread`
                    : "Members"
                }
                title="Connect"
                text={
                  unreadMessageCount > 0
                    ? "You have unread member messages waiting."
                    : "Start private conversations with other Stone Harbor members."
                }
                badge={unreadMessageCount}
              />
              <DashboardCard
                href="/members-blog"
                label="Members"
                title="Read"
                text="Protected articles and thoughtful member discussions."
              />
              <DashboardCard
                href="/welcome"
                label="Identity"
                title="Refine"
                text="Update your avatar, cover image, privacy defaults, and healing stage."
              />
            </div>
          </motion.section>
        </div>

        {/* ROADMAP PROGRESS — loss-aversion return hook */}
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className="mt-10 rounded-none border border-stone-200 bg-white/70 p-8 backdrop-blur-sm"
        >
          <div className="grid gap-6 md:grid-cols-[1.4fr_1fr] md:items-center">
            <div>
              <p
                className="text-xs font-bold uppercase tracking-[0.3em]"
                style={{ color: accent }}
              >
                Your Roadmap
              </p>
              <h2
                className={`${serif.className} mt-3 text-4xl font-medium text-stone-900 md:text-5xl`}
              >
                Pick up where you left off.
              </h2>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-stone-600">
                {/* TODO: wire to real progress data */}
                You&apos;re <span className="font-bold">
                  23% through
                </span> the {stage} path. Next:{" "}
                <span
                  className={`${serif.className} italic`}
                  style={{ color: accent }}
                >
                  Naming the Pattern.
                </span>
              </p>
            </div>
            <div>
              <div className="mb-3 h-[6px] w-full bg-stone-200">
                <div
                  className="h-[6px] transition-all duration-700"
                  style={{ width: "23%", backgroundColor: accent }}
                />
              </div>
              <a
                href="/roadmap"
                className="group relative inline-block overflow-hidden rounded-none border px-8 py-4 text-sm font-bold uppercase tracking-[0.22em] text-white transition hover:scale-105"
                style={{ backgroundColor: accent, borderColor: accent }}
              >
                <span className="relative z-10">Continue Your Path</span>
              </a>
            </div>
          </div>
        </motion.section>
      </section>

      {/* COVER IMAGE VIEWER */}
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

      {/* FOOTER — 988 crisis line required on every authenticated screen */}
      <footer className="relative z-10 mt-12 border-t border-stone-200 bg-[#efe8dc]/70 px-6 py-10 backdrop-blur-sm">
        <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-3 md:items-center">
          <div>
            <p className="text-base font-bold uppercase tracking-[0.28em] text-[#a9793d]">
              Stone Harbor
            </p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#a9793d]/70">
              Men&apos;s Mental Wellness
            </p>
          </div>
          <div className="text-center">
            <p className={`${serif.className} text-base italic text-stone-600`}>
              The harbor is patient.
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-stone-500">
              If You Are In Crisis
            </p>
            <p className="mt-2 text-sm leading-relaxed text-stone-700">
              Call or text <span className="font-bold text-[#a9793d]">988</span>{" "}
              — 24/7. Free. Confidential.
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}

function AboutRow({
  icon,
  label,
  value,
  logoUrl,
  domain,
}: {
  icon: string;
  label: string;
  value?: string | null;
  logoUrl?: string | null;
  domain?: string | null;
}) {
  const fallbackLogo =
    domain && `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  return (
    <div className="flex gap-5 py-5">
      <div className="min-w-[42px] pt-[2px] text-3xl font-light leading-none text-stone-500">
        {logoUrl || fallbackLogo ? (
          <img
            src={logoUrl || fallbackLogo || ""}
            alt=""
            className="h-9 w-9 rounded-full object-contain"
            onError={(event) => {
              if (fallbackLogo) {
                event.currentTarget.src = fallbackLogo;
              }
            }}
          />
        ) : (
          icon
        )}
      </div>
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#a9793d]">
          {label}
        </p>
        <p className="mt-2 text-lg font-medium leading-relaxed text-stone-800">
          {value || "Not added yet"}
        </p>
        {domain && (
          <p className="mt-1 text-xs font-semibold text-stone-400">{domain}</p>
        )}
      </div>
    </div>
  );
}

function DashboardCard({
  href,
  label,
  title,
  text,
  badge = 0,
}: DashboardCardProps) {
  return (
    <a
      href={href}
      className="group relative flex h-full flex-col overflow-hidden rounded-none border border-white/70 bg-white p-7 shadow-[0_12px_40px_rgba(0,0,0,0.05)] transition duration-300 hover:-translate-y-1 hover:border-[#a9793d]/40 hover:shadow-[0_18px_55px_rgba(0,0,0,0.09)]"
    >
      {badge > 0 && (
        <span className="absolute right-5 top-5 z-20 flex h-8 min-w-8 items-center justify-center border border-[#c4934e] bg-[#a9793d] px-2 text-xs font-black text-white shadow-[0_8px_20px_rgba(169,121,61,0.35)]">
          {badge}
        </span>
      )}
      <p className="mb-4 pr-10 text-xs font-bold uppercase tracking-[0.24em] text-[#a9793d]">
        {label}
      </p>
      <h3 className={`${serif.className} text-4xl font-medium text-stone-900`}>
        {title}
      </h3>
      <p className="mt-4 flex-1 leading-relaxed text-stone-600">{text}</p>
      <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-stone-400 transition group-hover:text-[#a9793d]">
        Open →
      </p>
      {/* gold underline draw — matches home CTAs */}
      <span className="absolute bottom-0 left-0 h-[2px] w-0 bg-[#c4934e] transition-all duration-500 group-hover:w-full" />
    </a>
  );
}
