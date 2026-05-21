"use client";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { Cormorant_Garamond, Inter } from "next/font/google";
import {
  Anchor as AnchorIcon,
  Book,
  Briefcase,
  Cap,
  ChevronDown,
  ChevronUp,
  Compass,
  Edit as EditIcon,
  Flame,
  Globe,
  Link as LinkIcon,
  Logout,
  Message,
  Pin,
  Roadmap,
  Settings,
  Speech,
  Spark,
  type IconProps,
} from "@/app/components/icons";
import { tomorrowsTopic } from "@/lib/dailyPrompts";
import { Toast, type ToastState } from "@/app/components/toast";
import {
  dismissalKey,
  resolveActiveAcknowledgment,
  type Acknowledgment,
} from "@/lib/seasonalAcknowledgments";

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
  birth_month?: number | null;
  birth_day?: number | null;
  birth_year?: number | null;
  acknowledge_birthday?: boolean;
  seasonal_acknowledgments_enabled?: boolean;
  acknowledgments_dismissed?: Record<string, string> | null;
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

type Notification = {
  id: string;
  kind:
    | "solidarity_threshold"
    | "daily_solidarity_summary"
    | "warning_issued"
    | "suspension_lifted"
    | "system";
  payload: Record<string, unknown>;
  read_at: string | null;
  dismissed_at: string | null;
  created_at: string;
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
  // Solidarity ("With You" / dropped anchor) — populated by
  // get_solidarity_for_posts() after the posts load.
  with_count?: number;
  i_am_with?: boolean;
};

type DashboardCardProps = {
  href: string;
  label: string;
  title: string;
  text: string;
  badge?: number;
  Icon?: ComponentType<IconProps>;
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
  const [acknowledgment, setAcknowledgment] = useState<Acknowledgment | null>(
    null,
  );
  const [ackDismissing, setAckDismissing] = useState(false);

  // Toast replaces alert() so failure feedback doesn't break the brand.
  const [toast, setToast] = useState<ToastState>(null);
  const fail = (msg: string) => setToast({ tone: "error", text: msg });

  // In-app notifications (threshold crossings, daily summaries, etc.)
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [coverImages, setCoverImages] = useState<CoverImage[]>([]);
  const [currentCoverIndex, setCurrentCoverIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [introExpanded, setIntroExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dailyQuote, setDailyQuote] = useState<DailyQuote | null>(null);
  const [quoteStage, setQuoteStage] = useState("Clarity");
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [streak, setStreak] = useState<number | null>(null);
  const [dailyReflections, setDailyReflections] = useState<number>(0);
  const [roadmapProgress, setRoadmapProgress] = useState<{
    percent: number;
    next_step_title: string | null;
    completed_steps: number;
    total_steps: number;
  } | null>(null);
  const [newReadCount, setNewReadCount] = useState<number>(0);
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
      with_count: 0,
      i_am_with: false,
    }));

    // 4) Batch-fetch solidarity counts + "am I with this post?" flag for
    //    every post in one RPC call. Anonymity is preserved — the RPC
    //    never returns who is with each post, only the aggregate count.
    const postIds = posts.map((p) => p.id);
    const { data: solidarityRows } = await supabase.rpc(
      "get_solidarity_for_posts",
      { post_ids: postIds },
    );
    const solidarityMap = new Map<
      string,
      { with_count: number; i_am_with: boolean }
    >();
    if (Array.isArray(solidarityRows)) {
      for (const row of solidarityRows) {
        solidarityMap.set(row.post_id as string, {
          with_count: Number(row.with_count ?? 0),
          i_am_with: !!row.i_am_with,
        });
      }
    }
    for (const post of merged) {
      const s = solidarityMap.get(post.id);
      if (s) {
        post.with_count = s.with_count;
        post.i_am_with = s.i_am_with;
      }
    }

    setMemberPosts(merged);
  }

  /**
   * Toggle solidarity ("I'm with you") for a post. Optimistic update —
   * count flips immediately, the DB write follows; if it fails we revert.
   */
  async function toggleSolidarity(postId: string) {
    if (!userId) return;
    const post = memberPosts.find((p) => p.id === postId);
    if (!post) return;
    const wasWith = post.i_am_with ?? false;
    const prevCount = post.with_count ?? 0;
    // Optimistic update
    setMemberPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? {
              ...p,
              i_am_with: !wasWith,
              with_count: Math.max(0, prevCount + (wasWith ? -1 : 1)),
            }
          : p,
      ),
    );
    const { error } = wasWith
      ? await supabase
          .from("post_solidarity")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", userId)
      : await supabase
          .from("post_solidarity")
          .insert({ post_id: postId, user_id: userId });
    if (error) {
      // Revert on failure
      setMemberPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, i_am_with: wasWith, with_count: prevCount }
            : p,
        ),
      );
    }
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
      fail(error.message);
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
      fail(error.message);
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

  // Map each pillar to the themes the quote generator actually produces.
  // The edge function emits Clarity / Rebuilding / Healing / Growing / Surviving / Thriving;
  // these mappings translate pillar → semantically-aligned themes.
  // Adjust freely if you change the theme list in generate-daily-quote.
  function themesForStage(stage: string): string[] {
    const s = stage.toLowerCase();
    if (s === "calm") return ["Healing", "Surviving"];
    if (s === "strength") return ["Rebuilding", "Growing", "Thriving"];
    return ["Clarity", "Surviving", "Healing"]; // clarity default
  }

  // Local date, not UTC — so the daily quote doesn't flip at 4pm Pacific.
  function localDateString(offsetDays = 0): string {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  // Deterministic pick across a day: stable across page reloads, varies by day.
  function pickStable<T>(arr: T[], seedKey: string): T | null {
    if (arr.length === 0) return null;
    let h = 0;
    for (let i = 0; i < seedKey.length; i++) {
      h = (h << 5) - h + seedKey.charCodeAt(i);
      h |= 0;
    }
    return arr[Math.abs(h) % arr.length];
  }

  async function loadDailyQuote(healingStageValue: string | null | undefined) {
    const today = localDateString();
    const normalizedStage = normalizeHealingStage(healingStageValue);
    setQuoteStage(normalizedStage);

    const stageThemes = themesForStage(normalizedStage);

    // Tier 1: today's quotes matching the user's stage themes.
    const { data: todayMatches } = await supabase
      .from("daily_quotes")
      .select("quote_text, theme, category")
      .eq("quote_date", today)
      .eq("audience", "men")
      .eq("is_active", true)
      .in("theme", stageThemes);

    if (todayMatches && todayMatches.length > 0) {
      // Deterministic pick: same quote for the whole day, varies per stage/date.
      const seed = `${today}-${normalizedStage}`;
      setDailyQuote(pickStable(todayMatches, seed));
      return;
    }

    // Tier 2: last 7 days matching the user's stage themes (no fresh quote today).
    const sevenDaysAgo = localDateString(-7);
    const { data: weekMatches } = await supabase
      .from("daily_quotes")
      .select("quote_text, theme, category")
      .gte("quote_date", sevenDaysAgo)
      .eq("audience", "men")
      .eq("is_active", true)
      .in("theme", stageThemes)
      .order("quote_date", { ascending: false })
      .limit(7);

    if (weekMatches && weekMatches.length > 0) {
      const seed = `${today}-${normalizedStage}-w`;
      setDailyQuote(pickStable(weekMatches, seed));
      return;
    }

    // Tier 3: any active quote from the last 30 days, ignoring stage.
    const thirtyDaysAgo = localDateString(-30);
    const { data: anyRecent } = await supabase
      .from("daily_quotes")
      .select("quote_text, theme, category")
      .gte("quote_date", thirtyDaysAgo)
      .eq("audience", "men")
      .eq("is_active", true)
      .order("quote_date", { ascending: false })
      .limit(1);

    setDailyQuote(anyRecent?.[0] ?? null);
  }

  /**
   * Dismiss the acknowledgment tile. When silenceForFuture=true, also
   * flips the relevant opt-out toggle so the member never sees this
   * kind of acknowledgment again. Per-year dismissal is the default —
   * a man who just doesn't want today's tile can still see next year's.
   */
  async function dismissAcknowledgment(silenceForFuture: boolean) {
    if (!acknowledgment || !userId || !profile) return;
    setAckDismissing(true);

    const dismissed = { ...(profile.acknowledgments_dismissed ?? {}) };
    dismissed[dismissalKey(acknowledgment.key)] = new Date().toISOString();

    const updates: Record<string, unknown> = {
      acknowledgments_dismissed: dismissed,
    };

    if (silenceForFuture) {
      if (acknowledgment.key === "birthday") {
        updates.acknowledge_birthday = false;
      } else {
        updates.seasonal_acknowledgments_enabled = false;
      }
    }

    await supabase.from("profiles").update(updates).eq("id", userId);
    setProfile({ ...profile, ...updates } as Profile);
    setAcknowledgment(null);
    setAckDismissing(false);
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
        "email, display_name, username, role, bio, location, healing_stage, privacy_level, avatar_url, cover_url, work, work_company_name, work_company_logo_url, work_company_domain, education, hometown, relationship_status, website, languages, interests, onboarding_completed_at, birth_month, birth_day, birth_year, acknowledge_birthday, seasonal_acknowledgments_enabled, acknowledgments_dismissed, suspended_at",
      )
      .eq("id", user.id)
      .single();

    // Suspension gate: if the account is suspended, route to the suspension
    // screen where they can see warnings and submit an appeal. This must
    // come before the onboarding gate so a suspended new user lands at
    // /suspended rather than being forced through onboarding.
    if (data && data.suspended_at) {
      window.location.href = "/suspended";
      return;
    }

    // Onboarding gate: send brand-new users through the wizard once.
    // The wizard writes onboarding_completed_at when finished or skipped,
    // so this redirect won't loop after the first pass.
    if (data && !data.onboarding_completed_at) {
      window.location.href = "/onboarding";
      return;
    }

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
      birth_month: data?.birth_month ?? null,
      birth_day: data?.birth_day ?? null,
      birth_year: data?.birth_year ?? null,
      acknowledge_birthday: data?.acknowledge_birthday ?? true,
      seasonal_acknowledgments_enabled:
        data?.seasonal_acknowledgments_enabled ?? true,
      acknowledgments_dismissed:
        (data?.acknowledgments_dismissed as Record<string, string> | null) ??
        {},
    };

    setProfile(loadedProfile);

    // Compute today's acknowledgment (birthday or seasonal) respecting
    // the member's opt-outs and per-year dismissals.
    setAcknowledgment(
      resolveActiveAcknowledgment({
        birthMonth: loadedProfile.birth_month,
        birthDay: loadedProfile.birth_day,
        acknowledgeBirthday: loadedProfile.acknowledge_birthday ?? true,
        seasonalEnabled: loadedProfile.seasonal_acknowledgments_enabled ?? true,
        dismissed: loadedProfile.acknowledgments_dismissed,
      }),
    );

    await loadCoverImages(user.id, loadedProfile.cover_url);
    await loadDailyQuote(loadedProfile.healing_stage);
    await loadUnreadMessageCount();
    await loadMemberPosts();
    await loadStatistics();
    await loadNotifications();
    setLoading(false);
  }

  async function loadNotifications() {
    if (!userId) {
      // Fallback path: get current user inline if userId state isn't set
      // yet (this loader runs from both checkUser and the realtime hook).
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("notifications")
        .select("id, kind, payload, read_at, dismissed_at, created_at")
        .eq("user_id", user.id)
        .is("dismissed_at", null)
        .order("created_at", { ascending: false })
        .limit(10);
      setNotifications((data ?? []) as Notification[]);
      return;
    }
    const { data } = await supabase
      .from("notifications")
      .select("id, kind, payload, read_at, dismissed_at, created_at")
      .eq("user_id", userId)
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(10);
    setNotifications((data ?? []) as Notification[]);
  }

  /** Dismiss a single notification permanently. */
  async function dismissNotification(notifId: string) {
    if (!userId) return;
    // Optimistic remove
    setNotifications((prev) => prev.filter((n) => n.id !== notifId));
    await supabase
      .from("notifications")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("id", notifId)
      .eq("user_id", userId);
  }

  async function loadStatistics() {
    const [
      { data: streakData },
      { data: reflectionsData },
      { data: roadmapData },
      { data: newReadData },
    ] = await Promise.all([
      supabase.rpc("get_user_streak"),
      supabase.rpc("get_daily_reflection_count"),
      supabase.rpc("get_user_roadmap_progress"),
      supabase.rpc("get_new_posts_for_my_stage"),
    ]);
    setStreak((streakData as number | null) ?? 0);
    setDailyReflections((reflectionsData as number | null) ?? 0);
    setNewReadCount((newReadData as number | null) ?? 0);

    // get_user_roadmap_progress returns a one-row table → first element.
    const row = Array.isArray(roadmapData) ? roadmapData[0] : roadmapData;
    if (row) {
      setRoadmapProgress({
        percent: row.percent ?? 0,
        next_step_title: row.next_step_title ?? null,
        completed_steps: row.completed_steps ?? 0,
        total_steps: row.total_steps ?? 0,
      });
    } else {
      setRoadmapProgress(null);
    }
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
      fail(`Could not update cover: ${error.message}`);
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
      .on(
        // Cross-session live counts. When anyone drops or lifts an
        // anchor, refresh the solidarity numbers for the current feed.
        // loadMemberPosts also re-runs the solidarity RPC, so the
        // counter + i_am_with state both update without a page reload.
        "postgres_changes",
        { event: "*", schema: "public", table: "post_solidarity" },
        async () => {
          await loadMemberPosts();
        },
      )
      .on(
        // New notifications (threshold crossings, daily summaries, etc.)
        // arrive in real time too. Triggers a re-fetch of the panel.
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        async () => {
          await loadNotifications();
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
              <span className="relative z-10 inline-flex items-center gap-2">
                <EditIcon size={14} />
                Edit Profile
              </span>
              <span className="absolute bottom-0 left-0 h-[2px] w-0 bg-[#c4934e] transition-all duration-500 group-hover:w-full" />
            </a>
            <a
              href="/messages"
              className="group relative overflow-hidden rounded-none border border-stone-300 bg-white/70 px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-stone-700 transition hover:border-[#a9793d] hover:bg-white"
            >
              <span className="relative z-10 inline-flex items-center gap-2">
                <Message size={14} />
                Messages
              </span>
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
              <span className="relative z-10 inline-flex items-center gap-2">
                <Logout size={14} />
                Logout
              </span>
              <span className="absolute bottom-0 left-0 h-[2px] w-0 bg-[#c4934e] transition-all duration-500 group-hover:w-full" />
            </button>
          </div>
        </div>

        {/* ACKNOWLEDGMENT TILE — quiet recognition on hard days.
            Surfaces on Thanksgiving, Christmas Eve/Day, New Year's Eve,
            Father's Day, and the member's birthday. Never assumes joy,
            never assumes grief — makes space for whatever is here.
            Members can dismiss for today, or silence forever. */}
        <AnimatePresence>
          {acknowledgment && (
            <motion.section
              key={acknowledgment.key}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              className="mb-6 overflow-hidden border-l-[3px] bg-[#f8f4ed] px-6 py-7 shadow-[0_10px_30px_rgba(0,0,0,0.06)] md:px-10"
              style={{ borderLeftColor: GOLD_DEEP }}
            >
              <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 max-w-3xl">
                  <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#a9793d]">
                    {acknowledgment.eyebrow}
                  </p>
                  <p
                    className={`${serif.className} mt-3 text-2xl italic leading-[1.25] text-stone-900 md:text-3xl`}
                  >
                    {acknowledgment.headline}
                  </p>
                  <p className="mt-4 text-sm leading-relaxed text-stone-600 md:text-base">
                    {acknowledgment.body}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-stretch gap-2 md:items-end">
                  <button
                    type="button"
                    disabled={ackDismissing}
                    onClick={() => dismissAcknowledgment(false)}
                    className="border border-stone-300 bg-white/70 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-stone-700 transition hover:border-[#a9793d] hover:bg-white disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    disabled={ackDismissing}
                    onClick={() => dismissAcknowledgment(true)}
                    className="text-[11px] text-stone-500 underline-offset-4 transition hover:text-[#a9793d] hover:underline disabled:opacity-50"
                  >
                    Don&apos;t show these again
                  </button>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* NOTIFICATIONS — solidarity moments, daily summaries.
            One small card per active notification, dismissible.
            These are warm-tone moments, never red badges. */}
        {notifications.length > 0 && (
          <AnimatePresence>
            <motion.section
              key="notifications-panel"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-6 space-y-2"
            >
              {notifications.map((n) => (
                <NotificationCard
                  key={n.id}
                  notification={n}
                  onDismiss={() => dismissNotification(n.id)}
                />
              ))}
            </motion.section>
          </AnimatePresence>
        )}

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
            <div className="flex items-center gap-2">
              <Flame size={14} className="text-[#a9793d]" />
              <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-stone-500">
                Streak
              </p>
            </div>
            <p
              className={`${serif.className} mt-2 text-2xl italic text-stone-900`}
            >
              {streak === null
                ? "—"
                : streak === 0
                  ? "Begin today."
                  : streak === 1
                    ? "Day 1."
                    : `Day ${streak}.`}
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
              A question on {tomorrowsTopic()}.
            </p>
            <p className="mt-1 text-xs leading-relaxed text-stone-500">
              Three sentences. That&apos;s all.
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-stone-500">
              Brotherhood
            </p>
            <p
              className={`${serif.className} mt-2 text-2xl italic text-stone-900`}
            >
              {dailyReflections === 0
                ? "Be the first today."
                : dailyReflections === 1
                  ? "1 man reflected today."
                  : `${dailyReflections} men reflected today.`}
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
                  <AnchorIcon
                    size={52}
                    strokeWidth={1.25}
                    className="text-[#a9793d]"
                  />
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
                              <AnchorIcon
                                size={20}
                                strokeWidth={1.4}
                                className="text-[#a9793d]"
                              />
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
                      {/* WITH YOU — anonymous solidarity. The poster sees a
                          warm count message; other members see a quieter
                          factual one. Tapping toggles the anchor. */}
                      <div className="mt-5 flex items-center justify-between gap-4 border-t border-stone-200 pt-4">
                        <WithYouButton
                          isWith={!!post.i_am_with}
                          isOwnPost={post.user_id === userId}
                          onClick={() => toggleSolidarity(post.id)}
                        />
                        <WithYouCount
                          count={post.with_count ?? 0}
                          isPoster={post.user_id === userId}
                        />
                      </div>
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
              {introExpanded ? (
                <ChevronUp size={20} strokeWidth={1.75} />
              ) : (
                <ChevronDown size={20} strokeWidth={1.75} />
              )}
            </button>
            <div className="mb-6 flex items-center justify-between pr-8">
              <div>
                <div className="flex items-center gap-2">
                  <AnchorIcon size={14} className="text-[#a9793d]" />
                  <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#a9793d]">
                    Anchor
                  </p>
                </div>
                <h2
                  className={`${serif.className} mt-2 text-4xl font-medium text-stone-900`}
                >
                  Who you are.
                </h2>
              </div>
            </div>
            {introExpanded ? (
              <div className="flex flex-1 flex-col divide-y divide-stone-200">
                <AboutRow
                  Icon={Pin}
                  label="Lives in"
                  value={profile?.location}
                />
                <AboutRow
                  Icon={Compass}
                  label="From"
                  value={profile?.hometown}
                />
                <AboutRow
                  Icon={Briefcase}
                  label="Work"
                  value={profile?.work_company_name || profile?.work}
                  logoUrl={profile?.work_company_logo_url}
                  domain={profile?.work_company_domain}
                />
                <AboutRow
                  Icon={Cap}
                  label="Education"
                  value={profile?.education}
                />
                <AboutRow
                  Icon={LinkIcon}
                  label="Relationship"
                  value={formatLabel(profile?.relationship_status)}
                />
                <AboutRow
                  Icon={Globe}
                  label="Website"
                  value={profile?.website}
                />
                <AboutRow
                  Icon={Speech}
                  label="Languages"
                  value={profile?.languages}
                />
                <AboutRow
                  Icon={Spark}
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
                Icon={EditIcon}
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
                Icon={Message}
              />
              <DashboardCard
                href="/members-blog"
                label={newReadCount > 0 ? `${newReadCount} New` : "Members"}
                title="Read"
                text={
                  newReadCount > 0
                    ? `${newReadCount} new ${newReadCount === 1 ? "post" : "posts"} in your stage this month.`
                    : "Protected articles and thoughtful member discussions."
                }
                badge={newReadCount}
                Icon={Book}
              />
              <DashboardCard
                href="/welcome"
                label="Identity"
                title="Refine"
                text="Update your avatar, cover image, privacy defaults, and healing stage."
                Icon={Settings}
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
              <div
                className="flex items-center gap-2"
                style={{ color: accent }}
              >
                <Roadmap size={16} />
                <p className="text-xs font-bold uppercase tracking-[0.3em]">
                  Your Roadmap
                </p>
              </div>
              <h2
                className={`${serif.className} mt-3 text-4xl font-medium text-stone-900 md:text-5xl`}
              >
                Pick up where you left off.
              </h2>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-stone-600">
                {roadmapProgress === null ? (
                  <>Loading your roadmap…</>
                ) : roadmapProgress.total_steps === 0 ? (
                  <>No steps in the {stage} path yet. Check back soon.</>
                ) : roadmapProgress.completed_steps === 0 ? (
                  <>
                    You haven&apos;t started the {stage} path yet. Begin with:{" "}
                    <span
                      className={`${serif.className} italic`}
                      style={{ color: accent }}
                    >
                      {roadmapProgress.next_step_title}.
                    </span>
                  </>
                ) : roadmapProgress.next_step_title === null ? (
                  <>
                    You&apos;ve completed the {stage} path. Time to set the next
                    intention.
                  </>
                ) : (
                  <>
                    You&apos;re{" "}
                    <span className="font-bold">
                      {roadmapProgress.percent}% through
                    </span>{" "}
                    the {stage} path. Next:{" "}
                    <span
                      className={`${serif.className} italic`}
                      style={{ color: accent }}
                    >
                      {roadmapProgress.next_step_title}.
                    </span>
                  </>
                )}
              </p>
            </div>
            <div>
              <div className="mb-3 h-[6px] w-full bg-stone-200">
                <div
                  className="h-[6px] transition-all duration-700"
                  style={{
                    width: `${roadmapProgress?.percent ?? 0}%`,
                    backgroundColor: accent,
                  }}
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

      <Toast toast={toast} onDismiss={() => setToast(null)} />

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
            {acknowledgment?.amplify988 && (
              <motion.p
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
                className={`${serif.className} mt-3 text-base italic leading-snug text-[#a9793d]`}
              >
                Tonight more than most nights, you are not alone.
              </motion.p>
            )}
          </div>
        </div>
      </footer>
    </main>
  );
}

/* ──────────────────────────────────────────────
   NOTIFICATION CARD

   Renders a single in-app notification with copy chosen by `kind`.
   Threshold + summary cards are warm, gold-accented, and dismissible.
   Other kinds (warning, suspension lift) can be added later without
   changing the surrounding panel.
   ────────────────────────────────────────────── */

function NotificationCard({
  notification,
  onDismiss,
}: {
  notification: Notification;
  onDismiss: () => void;
}) {
  const { kind, payload } = notification;

  let eyebrow = "Notice";
  let headline = "Something arrived.";
  let body = "";
  let borderColor = "#a9793d";

  if (kind === "solidarity_threshold") {
    const count = Number(payload.count ?? 0);
    eyebrow = "Brothers Are With You";
    borderColor = "#a9793d";
    if (count === 1) {
      headline = "1 brother is with you on that post.";
      body =
        "Someone read what you wrote and dropped anchor next to you. You are not the only one in this.";
    } else if (count === 5) {
      headline = "5 brothers are with you.";
      body = "Five men saw it. Five men answered with their silent presence.";
    } else if (count === 25) {
      headline = "25 brothers are with you.";
      body =
        "You wrote something brave today. Twenty-five men felt it enough to say so without words.";
    } else if (count === 50) {
      headline = "50 brothers are with you.";
      body =
        "Half a hundred men dropped anchor next to your post. The harbor is not a metaphor right now.";
    } else if (count === 100) {
      headline = "100 brothers are with you.";
      body =
        "One hundred men. That number is not nothing. Whatever you wrote, it reached.";
    } else {
      headline = `${count} brothers are with you.`;
      body = "Your post is being held.";
    }
  } else if (kind === "daily_solidarity_summary") {
    const distinct = Number(payload.distinct_brothers ?? 0);
    const date = String(payload.date ?? "");
    const dateStr = date
      ? new Date(date + "T00:00:00").toLocaleDateString(undefined, {
          weekday: "long",
          month: "short",
          day: "numeric",
        })
      : "yesterday";
    eyebrow = "Yesterday";
    borderColor = "#586558"; // moss for daily roll-ups
    headline =
      distinct === 1
        ? `1 brother was with you on ${dateStr}.`
        : `${distinct} brothers were with you on ${dateStr}.`;
    body =
      "We thought you should know — quietly. The harbor was holding what you wrote.";
  } else if (kind === "warning_issued") {
    eyebrow = "Important";
    borderColor = "#b14a3a";
    headline = "A moderation note is on your account.";
    body =
      "Please review the warning in your profile settings. If you believe it is in error, you can appeal.";
  } else if (kind === "suspension_lifted") {
    eyebrow = "Welcome Back";
    borderColor = "#586558";
    headline = "Your account is active again.";
    body = "We're glad you're here. The harbor is open.";
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      transition={{ duration: 0.4 }}
      className="border-l-[3px] bg-white px-6 py-5 shadow-[0_6px_20px_rgba(0,0,0,0.05)]"
      style={{ borderLeftColor: borderColor }}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 max-w-2xl">
          <p
            className="text-[10px] font-bold uppercase tracking-[0.32em]"
            style={{ color: borderColor }}
          >
            {eyebrow}
          </p>
          <p
            className={`${serif.className} mt-2 text-xl italic leading-snug text-stone-900 md:text-2xl`}
          >
            {headline}
          </p>
          {body && (
            <p className="mt-2 text-sm leading-relaxed text-stone-600">
              {body}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 self-start border border-stone-300 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-500 transition hover:border-[#a9793d] hover:text-[#a9793d]"
        >
          Dismiss
        </button>
      </div>
    </motion.div>
  );
}

/* ──────────────────────────────────────────────
   WITH YOU — anonymous solidarity controls

   The whole gesture is: drop anchor next to a brother. No words. No
   names exposed. The button itself is the speech act.

   Two pieces:
     • WithYouButton — the anchor toggle. Outline = not with; filled =
       with. Hidden when looking at your own post (you can't be with
       yourself).
     • WithYouCount  — the counter. Reads warmly to the poster, factually
       to others. Hidden entirely at zero.
   ────────────────────────────────────────────── */

function WithYouButton({
  isWith,
  isOwnPost,
  onClick,
}: {
  isWith: boolean;
  isOwnPost: boolean;
  onClick: () => void;
}) {
  // A man cannot be with himself. Show a soft "you posted this" label
  // in place of the button, so the layout doesn't shift.
  if (isOwnPost) {
    return (
      <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">
        Your Post
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={
        isWith
          ? "You are with him. Tap to lift the anchor."
          : "I am with you, brother. Drop anchor next to him."
      }
      className={`inline-flex items-center gap-2 rounded-none border px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] transition ${
        isWith
          ? "border-[#a9793d] bg-[#a9793d] text-white shadow-[0_4px_14px_rgba(169,121,61,0.35)]"
          : "border-stone-300 bg-white text-stone-700 hover:border-[#a9793d] hover:text-[#a9793d]"
      }`}
    >
      <AnchorIcon
        size={14}
        strokeWidth={isWith ? 1.7 : 1.5}
        className={isWith ? "text-white" : "text-[#a9793d]"}
      />
      {isWith ? "With Him" : "I'm With You"}
    </button>
  );
}

function WithYouCount({
  count,
  isPoster,
}: {
  count: number;
  isPoster: boolean;
}) {
  if (count === 0) {
    // Don't show a "0 brothers" line — that's worse than silence.
    return <span className="text-[11px] text-stone-300">·</span>;
  }
  if (isPoster) {
    // Warm, weighted message addressed TO the poster about HIS post.
    return (
      <span className={`${serif.className} text-base italic text-[#a9793d]`}>
        {count === 1
          ? "1 brother is with you."
          : `${count} brothers are with you.`}
      </span>
    );
  }
  // Quieter, factual message for everyone else viewing the post.
  return (
    <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">
      {count === 1 ? "1 with him" : `${count} with him`}
    </span>
  );
}

function AboutRow({
  Icon,
  label,
  value,
  logoUrl,
  domain,
}: {
  Icon: ComponentType<IconProps>;
  label: string;
  value?: string | null;
  logoUrl?: string | null;
  domain?: string | null;
}) {
  const fallbackLogo =
    domain && `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  return (
    <div className="flex gap-5 py-5">
      <div className="flex min-w-[42px] items-start pt-[2px] text-stone-500">
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
          <Icon size={26} strokeWidth={1.5} />
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
  Icon,
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
      <div className="mb-4 flex items-center gap-3 pr-10">
        {Icon && (
          <Icon size={22} strokeWidth={1.5} className="text-[#a9793d]" />
        )}
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#a9793d]">
          {label}
        </p>
      </div>
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
