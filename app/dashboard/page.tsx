"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { InactivityGate } from "@/app/components/inactivityGate";
import { serif, sans } from "@/lib/fonts";
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
import { RotatingNatureBackdrop } from "@/app/components/rotatingNatureBackdrop";
import { AmnioticBackdrop } from "@/app/components/amnioticBackdrop";
import { PageAmbience } from "@/app/components/pageAmbience";
import {
  SmallThing,
  shouldShowSmallThingToday,
} from "@/app/components/smallThing";
import { LineageDoorCard } from "@/app/components/lineageDoorCard";
import { TheMapTile } from "@/app/components/theMapTile";
import {
  FEATURE_THRESHOLDS,
  isFeatureUnlocked,
} from "@/lib/userProgress";
import { useTheme } from "@/app/components/themeProvider";
import { PersonalizedGreeting } from "@/app/components/personalizedGreeting";
import { TodayIntention } from "@/app/components/todayIntention";
import { BreathCircle } from "@/app/components/breathCircle";
// Note: Compass is imported from the local icons module above (line 15).
// Importing it from lucide-react too would create a duplicate identifier.
import { X, Wind, Heart, Users, BookOpen, Newspaper } from "lucide-react";
import {
  dismissalKey,
  resolveActiveAcknowledgment,
  type Acknowledgment,
} from "@/lib/seasonalAcknowledgments";

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
  const { theme } = useTheme();
  const isDusk = theme === "dusk";

  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  // Account age for progressive disclosure (the small-thing tile is
  // gated to day 75 to land a couple weeks after the sub-mood unlock).
  const [userCreatedAt, setUserCreatedAt] = useState<string | null>(null);
  // Whether the once-shown Lineage door announcement has already
  // appeared for this member. Null until profile loads; null also
  // means "never shown" once loaded, in which case the announcement
  // renders at day 90+.
  const [lineageDoorSeenAt, setLineageDoorSeenAt] = useState<string | null>(
    null,
  );
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
  // Greeting strip — on mobile the 4 cells cycle through one at a time
  // with a fade transition. Desktop renders all four in a row and
  // ignores this index entirely.
  const [greetingIndex, setGreetingIndex] = useState(0);
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

    // Optimistic UI: hide the post locally immediately.
    const snapshot = memberPosts;
    setMemberPosts((prev) => prev.filter((p) => p.id !== postId));

    // Route through soft_delete_member_post() SECURITY DEFINER RPC.
    // The RPC checks ownership itself and bypasses the RLS WITH CHECK
    // path that was intermittently rejecting direct UPDATEs on
    // member_posts. Returns true on delete, false on "already gone".
    const { error } = await supabase.rpc("soft_delete_member_post", {
      post_id_arg: postId,
    });

    if (error) {
      // The RPC raises descriptive exceptions — surface them as-is.
      setMemberPosts(snapshot);
      fail(error.message || "Could not delete this post. Please try again.");
      return;
    }

    // Refresh server state in the background.
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
        "email, display_name, username, role, bio, location, healing_stage, privacy_level, avatar_url, cover_url, work, work_company_name, work_company_logo_url, work_company_domain, education, hometown, relationship_status, website, languages, interests, onboarding_completed_at, birth_month, birth_day, birth_year, acknowledge_birthday, seasonal_acknowledgments_enabled, acknowledgments_dismissed, suspended_at, created_at, lineage_door_seen_at",
      )
      .eq("id", user.id)
      .single();
    // created_at drives progressive disclosure of the small-thing tile.
    setUserCreatedAt((data as { created_at?: string } | null)?.created_at ?? null);
    // The "Lineage" door appears once at day 90+ and is then marked seen.
    setLineageDoorSeenAt(
      (data as { lineage_door_seen_at?: string | null } | null)
        ?.lineage_door_seen_at ?? null,
    );

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

  /**
   * Auto-cycle the mobile greeting strip every 5.5 seconds. Long
   * enough to read each cell, short enough that the page never feels
   * static. Desktop ignores this state — the grid renders all three
   * cells side-by-side anyway. Cleaned up on unmount.
   *
   * The strip used to have four cards including a "Good Morning /
   * Rafael" cell, but PersonalizedGreeting now provides that
   * attunement higher up the page, so the strip dropped to three
   * (Streak / Tomorrow / Brotherhood) to remove the echo.
   */
  useEffect(() => {
    const id = setInterval(() => {
      setGreetingIndex((i) => (i + 1) % 3);
    }, 5500);
    return () => clearInterval(id);
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
        className={`${sans.className} flex min-h-screen items-center justify-center bg-[var(--sh-bg-page)]`}
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
            className={`${serif.className} mt-8 text-2xl italic text-[var(--sh-text-secondary)]`}
          >
            Returning to your harbor…
          </p>
        </div>
      </main>
    );
  }

  return (
    <main
      className={`${sans.className} relative flex min-h-screen flex-col overflow-hidden bg-[var(--sh-bg-page)] text-[var(--sh-text-primary)]`}
    >
      <InactivityGate />

      {/* Unified atmospheric layer (amniotic + contour ripples +
          paper grain + dawn glow). The same backdrop runs across
          every authenticated page so the harbor feels continuous. */}
      <PageAmbience />

      <section className="relative z-10 mx-auto w-full max-w-7xl flex-1 px-3 py-4 md:px-8 md:py-8">
        {/* TOP NAV */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between md:mb-8 md:gap-4">
          <Link href="/" className="group flex flex-col leading-none no-underline">
            <span className="text-sm font-bold uppercase tracking-[0.22em] text-[#a9793d] transition group-hover:text-[#8d6432] md:text-base md:tracking-[0.28em]">
              ← Stone Harbor
            </span>
            <span className="mt-1 hidden text-[0.62rem] font-bold uppercase tracking-[0.18em] text-[#a9793d]/70 md:block">
              Men&apos;s Mental Wellness
            </span>
          </Link>
          <div className="flex flex-wrap gap-2 md:gap-3">
            {/* On Dusk: gold-on-amber treatment matching the Post Update
                button (border-[#c4934e] bg-[#a9793d] text-white).
                On Sunlit: original cream-white treatment. */}
            <Link
              href="/welcome"
              aria-label="Edit profile"
              className={`group relative overflow-hidden rounded-none p-3 text-xs font-bold uppercase tracking-[0.22em] transition md:px-6 ${
                isDusk
                  ? "border border-[#c4934e] bg-[#a9793d] text-white hover:bg-[#8d6432]"
                  : "border border-stone-300 bg-white/70 text-stone-700 hover:border-[#a9793d] hover:bg-white"
              }`}
            >
              <span className="relative z-10 inline-flex items-center md:gap-2">
                <EditIcon size={14} />
                <span className="hidden md:inline">Edit Profile</span>
              </span>
              <span className="absolute bottom-0 left-0 h-[2px] w-0 bg-[#c4934e] transition-all duration-500 group-hover:w-full" />
            </Link>
            <Link
              href="/messages"
              aria-label="Messages"
              className={`group relative overflow-hidden rounded-none p-3 text-xs font-bold uppercase tracking-[0.22em] transition md:px-6 ${
                isDusk
                  ? "border border-[#c4934e] bg-[#a9793d] text-white hover:bg-[#8d6432]"
                  : "border border-stone-300 bg-white/70 text-stone-700 hover:border-[#a9793d] hover:bg-white"
              }`}
            >
              <span className="relative z-10 inline-flex items-center md:gap-2">
                <Message size={14} />
                <span className="hidden md:inline">Messages</span>
              </span>
              <span className="absolute bottom-0 left-0 h-[2px] w-0 bg-[#c4934e] transition-all duration-500 group-hover:w-full" />
              {unreadMessageCount > 0 && (
                <span
                  className={`absolute -right-2 -top-2 z-20 flex h-6 min-w-6 items-center justify-center border px-2 text-[10px] font-black ${
                    isDusk
                      ? "border-white/60 bg-white text-[#8d6432]"
                      : "border-[#c4934e] bg-[#a9793d] text-white"
                  }`}
                >
                  {unreadMessageCount}
                </span>
              )}
            </Link>
            <button
              onClick={handleLogout}
              aria-label="Log out"
              className={`group relative overflow-hidden rounded-none p-3 text-xs font-bold uppercase tracking-[0.22em] transition md:px-6 ${
                isDusk
                  ? "border border-[#c4934e] bg-[#a9793d] text-white hover:bg-[#8d6432]"
                  : "border border-stone-300 bg-white/70 text-stone-700 hover:border-[#a9793d] hover:bg-white"
              }`}
            >
              <span className="relative z-10 inline-flex items-center md:gap-2">
                <Logout size={14} />
                <span className="hidden md:inline">Logout</span>
              </span>
              <span className="absolute bottom-0 left-0 h-[2px] w-0 bg-[#c4934e] transition-all duration-500 group-hover:w-full" />
            </button>
          </div>
        </div>

        {/* WELCOME — time + days-aware greeting. The "I'm seen" moment.
            Replaces the cover banner / avatar hero that used to live here;
            those have moved to /welcome where they belong (profile space,
            not session space). */}
        <PersonalizedGreeting
          name={profile?.display_name || profile?.username || null}
          userId={userId}
        />

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
              className={`relative mb-4 overflow-hidden border border-l-[3px] px-4 py-4 md:mb-6 md:px-10 md:py-7 ${
                isDusk
                  ? "border-white/10 bg-black/35 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-md"
                  : "border-stone-200 bg-[#f8f4ed] shadow-[0_10px_30px_rgba(0,0,0,0.06)]"
              }`}
              style={{ borderLeftColor: GOLD_DEEP }}
            >
              {/* Mobile: X icon top-right for dismiss. The "don't show again"
                  option moves to a small underline link below the body copy
                  so it doesn't crowd the corner. */}
              <button
                type="button"
                disabled={ackDismissing}
                onClick={() => dismissAcknowledgment(false)}
                aria-label="Dismiss"
                className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center text-[var(--sh-text-muted)] transition hover:text-[var(--sh-accent-gold)] disabled:opacity-50 md:right-3 md:top-3"
              >
                <X size={18} aria-hidden="true" />
              </button>

              <div className="flex flex-col gap-3 pr-8 md:flex-row md:items-start md:justify-between md:gap-5 md:pr-10">
                <div className="min-w-0 max-w-3xl">
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[var(--sh-accent-gold)] md:tracking-[0.32em]">
                    {acknowledgment.eyebrow}
                  </p>
                  <p
                    className={`${serif.className} mt-2 text-xl italic leading-[1.2] text-[var(--sh-text-primary)] md:mt-3 md:text-3xl`}
                  >
                    {acknowledgment.headline}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--sh-text-secondary)] md:mt-4 md:text-base">
                    {acknowledgment.body}
                  </p>
                  <button
                    type="button"
                    disabled={ackDismissing}
                    onClick={() => dismissAcknowledgment(true)}
                    className="mt-3 text-[10px] text-[var(--sh-text-tertiary)] underline-offset-4 transition hover:text-[var(--sh-accent-gold)] hover:underline disabled:opacity-50 md:mt-4 md:text-[11px]"
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

        {/* DAILY REFLECTION — moved above the greeting strip per the
            psychoanalytic restructure (meaning before metrics). The
            quote is the day's emotional anchor and reads most
            strongly when it's the first inspirational element after
            the personalized greeting. */}
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className="mb-6 md:mb-8"
        >
          <div
            className={`relative overflow-hidden rounded-none border px-4 py-6 shadow-[0_14px_40px_rgba(0,0,0,0.06)] md:px-10 md:py-12 ${
              isDusk
                ? "border-white/10 bg-black/35 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl"
                : "border-stone-200 bg-gradient-to-br from-[#f8f4ed] via-[#f3efe7] to-[#efe8dc]"
            }`}
          >
            {/* Card-level backdrop — contained. Dusk = amniotic warmth.
                Sunlit = the original nature image rotation that fits
                the cream gradient. */}
            {isDusk ? (
              <AmnioticBackdrop contained intensity={0.7} moss={false} />
            ) : (
              <RotatingNatureBackdrop
                images={[
                  "/nature/alpine-lake-trees-mountains.jpg",
                  "/nature/sunrise-mountain-lake-icy-rocks.jpg",
                  "/nature/trees-lake-mountain-daytime.jpg",
                  "/nature/lake-mountain-alps.jpg",
                ]}
                opacity={0.12}
                rotationMs={18000}
                imageFilter="sepia(0.15)"
              />
            )}

            <div className="relative mx-auto max-w-5xl text-center">
              <p
                className={`mb-2 text-[10px] font-bold uppercase tracking-[0.32em] md:mb-4 md:tracking-[0.38em] ${
                  isDusk ? "text-[#c4934e]" : "text-[#a9793d]"
                }`}
              >
                Today&apos;s Reflection
              </p>
              {dailyQuote ? (
                <>
                  <p
                    className={`${serif.className} mx-auto max-w-[1100px] text-lg font-medium italic leading-[1.2] tracking-[-0.015em] md:text-4xl xl:text-[2.85rem] ${
                      isDusk ? "text-stone-100" : "text-stone-900"
                    }`}
                  >
                    &ldquo;{dailyQuote.quote_text}&rdquo;
                  </p>
                  <div className="mt-3 flex justify-center md:mt-6">
                    <span
                      className={`border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] shadow-sm md:px-4 md:py-1.5 md:tracking-[0.24em] ${
                        isDusk ? "bg-black/30" : "bg-white/60"
                      }`}
                      style={{
                        borderColor:
                          stageAccent(dailyQuote.theme) + (isDusk ? "80" : "59"),
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
                    className={`${serif.className} mx-auto max-w-4xl text-2xl font-medium italic leading-[1.18] tracking-[-0.015em] md:text-4xl ${
                      isDusk ? "text-stone-100" : "text-stone-900"
                    }`}
                  >
                    Your reflection is being prepared.
                  </p>
                  <p
                    className={`mx-auto mt-3 max-w-xl text-xs leading-relaxed ${
                      isDusk ? "text-stone-400" : "text-stone-500"
                    }`}
                  >
                    No active quote was found for today&apos;s {quoteStage}{" "}
                    stage. Generate this week&apos;s reflections and refresh
                    your harbor.
                  </p>
                </>
              )}
            </div>
          </div>
        </motion.section>

        {/* A SMALL THING — behavioral activation channel.
            Gated by FEATURE_THRESHOLDS.smallThings (day 75) so the
            harbor has been quiet for a couple months before any
            "consider doing X" tile surfaces. Within that gate, the
            cadence helper limits display to 2-3 days per week per
            member, never consecutive days — turning the tile into
            an occasional offer rather than a daily prompt.

            Width matches the surrounding section so the tile reads
            as part of the same column as Today's Reflection above
            and the three-cell Streak / Tomorrow / Brotherhood strip
            below — same edges, same horizontal alignment. Vertical
            margin is balanced top and bottom so it doesn't feel
            tacked onto either neighbor. */}
        {userId &&
          isFeatureUnlocked(
            userCreatedAt,
            FEATURE_THRESHOLDS.smallThings,
          ) &&
          shouldShowSmallThingToday(userId) && (
            // Symmetric padding (not margin) so the tile sits visually
            // equidistant between Today's Reflection (above) and the
            // Streak / Tomorrow / Brotherhood strip (below). The strip
            // wrapper has no top margin of its own, AND uses `border-y`
            // which fights margin-collapse on some browsers — using
            // padding on a div wrapper guarantees the gap renders.
            <div className="py-10 md:py-12">
              <SmallThing userId={userId} />
            </div>
          )}

        {/* THE MAP — Eidos entry tile. Renders for every signed-in
            member, always. The tile itself reads /api/map/state and
            decides whether to show "Begin", "Continue", "Assemble
            Chapter 1", or "Open Operating Manual" — so the dashboard
            doesn't need to know the member's Map status. Routes to
            the locale the member last selected (NEXT_LOCALE cookie). */}
        {userId && <TheMapTile />}

        {/* LINEAGE DOOR — once-shown announcement that the Lineage
            room exists in the profile. Renders only at day 90+ and
            only if the member hasn't seen it before (or is in
            preview mode). After dismissal, the LineageDoorCard
            self-hides for the session and writes the timestamp so
            it never returns. */}
        {userId &&
          isFeatureUnlocked(
            userCreatedAt,
            FEATURE_THRESHOLDS.lineage,
          ) && (
            <div className="py-2 md:py-3">
              <LineageDoorCard
                userId={userId}
                lineageDoorSeenAt={lineageDoorSeenAt}
              />
            </div>
          )}

        {/* GREETING STRIP — orientation cards (Streak / Tomorrow /
            Brotherhood). Desktop: three cells in a row. Mobile: one
            cell at a time cycling every 5.5 seconds with a fade
            transition, with three small dots below for manual
            navigation. The PersonalizedGreeting higher up the page
            now covers the "Good Morning, Rafael" attunement that
            used to live in a fourth cell here. */}
        {(() => {
          // Define the four cells once, then render differently per
          // viewport. Putting them in an array keeps DOM order stable
          // and lets AnimatePresence key by the active index without
          // confusing the diff.
          // PersonalizedGreeting above the page already provides the
          // time-of-day greeting + identity line. The strip is now
          // three orientation cards (Streak / Tomorrow / Brotherhood)
          // — no duplicate "Good Morning" cell.
          const cells = [
            // 0 — Streak
            <div key="streak">
              <div className="flex items-center gap-2">
                <Flame size={14} className="text-[#a9793d]" />
                <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--sh-text-tertiary)]">
                  Streak
                </p>
              </div>
              <p
                className={`${serif.className} mt-2 text-2xl italic text-[var(--sh-text-primary)]`}
              >
                {streak === null
                  ? "—"
                  : streak === 0
                    ? "Day zero is still a day."
                    : streak === 1
                      ? "Day 1."
                      : `Day ${streak}.`}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--sh-text-tertiary)]">
                {streak === 0
                  ? "Begin when you're ready. The harbor isn't keeping score."
                  : "Missing a day doesn't reset you."}
              </p>
            </div>,
            // 1 — Tomorrow
            <div key="tomorrow">
              <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--sh-text-tertiary)]">
                Tomorrow
              </p>
              <p
                className={`${serif.className} mt-2 text-2xl italic text-[var(--sh-text-primary)]`}
              >
                A question on {tomorrowsTopic()}.
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--sh-text-tertiary)]">
                Three sentences. That&apos;s all.
              </p>
            </div>,
            // 2 — Brotherhood
            <div key="brotherhood">
              <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--sh-text-tertiary)]">
                Brotherhood
              </p>
              <p
                className={`${serif.className} mt-2 text-2xl italic text-[var(--sh-text-primary)]`}
              >
                {dailyReflections === 0
                  ? "Be the first today."
                  : dailyReflections === 1
                    ? "1 man reflected today."
                    : `${dailyReflections} men reflected today.`}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--sh-text-tertiary)]">
                You&apos;re not the only one here.
              </p>
            </div>,
          ];

          return (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className={`mb-6 backdrop-blur-md md:mb-8 ${
                isDusk
                  ? "border-y border-white/10 bg-black/25"
                  : "border-y border-stone-200 bg-white/40"
              }`}
            >
              {/* DESKTOP: three-column grid (Streak / Tomorrow / Brotherhood) */}
              <div className="hidden gap-6 px-6 py-6 md:grid md:grid-cols-3">
                {cells}
              </div>

              {/* MOBILE: single fading card + dot navigator */}
              <div className="px-4 py-5 md:hidden">
                <div className="relative min-h-[6.5rem]">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={greetingIndex}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.5, ease: "easeInOut" }}
                    >
                      {cells[greetingIndex]}
                    </motion.div>
                  </AnimatePresence>
                </div>

                <div className="mt-4 flex justify-center gap-2">
                  {cells.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setGreetingIndex(i)}
                      aria-label={`Show card ${i + 1} of ${cells.length}`}
                      className={`h-1 rounded-full transition-all duration-500 ${
                        i === greetingIndex
                          ? "w-5 bg-[var(--sh-accent-gold)]"
                          : isDusk
                            ? "w-1 bg-white/25 hover:bg-white/50"
                            : "w-1 bg-stone-300 hover:bg-stone-400"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          );
        })()}

        {/* PROFILE CARD — hidden on the dashboard per the
            psychoanalytic restructure. Identity belongs at /welcome
            (profile editor), not in a session space. The full block
            stays in the source for now so the cover-image carousel
            logic, viewer, etc. are easy to migrate to /welcome in a
            follow-up. Hidden via `hidden` class — display:none. */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="hidden mb-10 overflow-hidden rounded-none border border-stone-200 bg-[#f8f4ed] shadow-[0_20px_70px_rgba(0,0,0,0.08)]"
        >
          <div
            className="group relative h-36 bg-cover bg-center md:h-64"
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
            <div className="absolute bottom-3 right-3 z-20 rounded-full border border-white/15 bg-black/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70 opacity-0 backdrop-blur-md transition duration-300 group-hover:opacity-100 md:bottom-5 md:right-5">
              {coverImages.length > 0
                ? `${currentCoverIndex + 1} of ${coverImages.length}`
                : "No Cover History"}
            </div>
            <div className="absolute -bottom-10 left-4 md:-bottom-14 md:left-8">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-4 border-[#f8f4ed] bg-[#efe8dc] shadow-xl md:h-32 md:w-32">
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt="Profile avatar"
                    className="h-full w-full rounded-full object-cover"
                  />
                ) : (
                  <AnchorIcon
                    size={32}
                    strokeWidth={1.25}
                    className="text-[#a9793d] md:size-[52px]"
                  />
                )}
              </div>
            </div>
          </div>
          <div className="px-4 pb-5 pt-12 md:px-8 md:pb-8 md:pt-16">
            <div className="grid gap-5 md:grid-cols-[1.05fr_auto_0.95fr] md:items-start md:gap-8">
              <div>
                <p
                  className="text-[10px] font-bold uppercase tracking-[0.22em] md:text-xs"
                  style={{ color: accent }}
                >
                  {identityLine(stage)}
                </p>
                <h1
                  className={`${serif.className} mt-2 text-3xl font-medium leading-tight text-stone-900 md:mt-3 md:text-7xl`}
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

        {/* DAILY REFLECTION was relocated higher up the page (above the
            greeting strip) per the psychoanalytic restructure. Meaning
            before metrics. See above. */}

        {/* TODAY'S INTENTION — optional. Persists for the day via
            localStorage keyed by user + date. The rotating placeholder
            gives the field gentle energy when blank. */}
        <TodayIntention userId={userId} />

        {/* MEDITATION ENTRY — quiet doorway to the full /meditation
            experience (image rotation + breath circle + ambient audio).
            On mobile this is a compact circular button with serif copy.
            On desktop a wider banner that mirrors the original Daily
            Breath layout. */}
        <motion.section
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className="mb-10 md:mb-12"
        >
          <Link
            href="/meditation"
            className={`group flex flex-col items-center gap-4 px-6 py-6 transition md:flex-row md:justify-center md:gap-12 md:py-10 ${
              isDusk
                ? "border-y border-white/10 hover:bg-white/[0.04]"
                : "border-y border-stone-200 hover:bg-[#f8f4ed]/40"
            }`}
          >
            <BreathCircle
              phase={breathPhase}
              size="sm"
              accent={accent}
              label={
                <>
                  <Wind
                    size={22}
                    strokeWidth={1.5}
                    style={{ color: accent }}
                    aria-hidden="true"
                    className="md:hidden"
                  />
                  <span
                    className={`${serif.className} hidden text-base italic md:inline`}
                    style={{ color: accent }}
                  >
                    {breathPhase === "inhale" ? "Inhale" : "Exhale"}
                  </span>
                </>
              }
            />
            <div className="text-center md:text-left">
              <p
                className="text-[10px] font-bold uppercase tracking-[0.32em]"
                style={{ color: accent }}
              >
                Daily Breath · Open Meditation
              </p>
              <p
                className={`${serif.className} mt-1 text-xl italic text-[var(--sh-text-primary)] md:mt-2 md:text-3xl`}
              >
                Sixty seconds, every morning.
              </p>
              <p className="mt-1 max-w-md text-xs leading-relaxed text-[var(--sh-text-secondary)] md:mt-2 md:text-sm">
                One breath at the door of the harbor. Stay as long as you want.
              </p>
              <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--sh-text-muted)] transition group-hover:text-[var(--sh-accent-gold)] md:mt-3">
                Enter the Meditation →
              </p>
            </div>
          </Link>
        </motion.section>

        {/* RIPPLES — the public-share section on the dashboard.
            "Ripples" replaces "Timeline" as the brand-aligned noun:
            water imagery instead of social-media language, a smaller
            psychological commitment to participate, and a metaphor
            that says "your action reaches others." Action verbs stay
            plain ("Share") for clarity at decision points.
            Hidden on mobile per the psychoanalytic restructure;
            ripple composition belongs inside the Brotherhood door,
            not the dashboard. Will migrate to /brotherhood in a
            follow-up. On desktop it remains where it is. */}
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className="hidden md:block md:mb-12"
        >
          <div className="grid gap-4 md:gap-8 lg:grid-cols-[0.42fr_0.58fr]">
            <form
              onSubmit={createMemberPost}
              className={`rounded-none p-4 shadow-[0_16px_60px_rgba(0,0,0,0.06)] md:p-7 ${
                isDusk
                  ? "border border-white/10 bg-black/30 backdrop-blur-md"
                  : "border border-white/70 bg-white"
              }`}
            >
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.26em] text-[var(--sh-accent-gold)] md:mb-4 md:text-xs md:tracking-[0.28em]">
                Ripples
              </p>
              <h2
                className={`${serif.className} text-xl font-medium text-[var(--sh-text-primary)] md:text-4xl`}
              >
                Share what mattered today.
              </h2>
              <p className="mt-2 hidden text-sm leading-relaxed text-[var(--sh-text-secondary)] md:mt-3 md:block">
                A small word, a hard-won shift, a thought worth setting down.
                Your ripple reaches others.
              </p>
              <textarea
                value={postBody}
                onChange={(e) => setPostBody(e.target.value)}
                rows={3}
                className={`mt-3 w-full resize-none rounded-none px-4 py-3 text-sm outline-none transition focus:ring-2 focus:ring-[#586558]/30 md:mt-6 md:px-5 md:py-4 md:text-base ${
                  isDusk
                    ? "border border-white/15 bg-black/40 text-stone-100 placeholder:text-white/30 focus:border-[#c4934e]"
                    : "border border-stone-300 bg-[#f8f4ed] text-stone-800 placeholder:text-stone-400 focus:border-[#a9793d]"
                }`}
                placeholder="What's the ripple today?"
              />
              <select
                value={postPrivacy}
                onChange={(e) => setPostPrivacy(e.target.value)}
                className={`mt-3 w-full rounded-none px-4 py-3 text-sm outline-none transition md:mt-4 md:px-5 md:py-4 md:text-base ${
                  isDusk
                    ? "border border-white/15 bg-black/40 text-stone-100 focus:border-[#c4934e]"
                    : "border border-stone-300 bg-[#f8f4ed] text-stone-800 focus:border-[#a9793d]"
                }`}
              >
                <option value="members">Members only</option>
                <option value="private">Private</option>
              </select>
              <button
                type="submit"
                disabled={posting || !postBody.trim()}
                className="group relative mt-3 w-full overflow-hidden rounded-none border border-[#c4934e] bg-[#a9793d] px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-white transition hover:bg-[#8d6432] disabled:opacity-60 md:mt-5 md:px-8 md:py-4 md:text-sm"
              >
                <span className="relative z-10">
                  {posting ? "Sharing…" : "Share"}
                </span>
              </button>
            </form>
            <div
              className={`rounded-none p-4 shadow-[0_16px_60px_rgba(0,0,0,0.06)] md:p-7 ${
                isDusk
                  ? "border border-white/10 bg-black/30 backdrop-blur-md"
                  : "border border-white/70 bg-white"
              }`}
            >
              <div className="mb-4 flex items-end justify-between gap-3 md:mb-6 md:gap-4">
                <div>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.26em] text-[var(--sh-accent-gold)] md:mb-3 md:text-xs md:tracking-[0.28em]">
                    Recent Ripples
                  </p>
                  <h2
                    className={`${serif.className} text-xl font-medium text-[var(--sh-text-primary)] md:text-4xl`}
                  >
                    Today on the water.
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={loadMemberPosts}
                  className={`rounded-none px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] transition md:px-5 md:py-3 md:text-xs md:tracking-[0.2em] ${
                    isDusk
                      ? "border border-[#c4934e] bg-[#a9793d] text-white hover:bg-[#8d6432]"
                      : "border border-stone-300 bg-[#f8f4ed] text-stone-600 hover:border-[#a9793d]"
                  }`}
                >
                  Refresh
                </button>
              </div>
              {memberPosts.length === 0 ? (
                <div
                  className={`p-4 italic md:p-6 ${
                    isDusk
                      ? "border border-white/10 bg-black/30 text-stone-300"
                      : "border border-stone-200 bg-[#f8f4ed] text-stone-600"
                  }`}
                >
                  <p
                    className={`${serif.className} text-lg md:text-xl`}
                  >
                    The water is still.
                  </p>
                  <p className="mt-2 text-xs leading-relaxed md:text-sm">
                    Be the first ripple today.
                  </p>
                </div>
              ) : (
                <div className="max-h-[360px] space-y-3 overflow-y-auto pr-2 md:max-h-[620px] md:space-y-5">
                  {memberPosts.map((post) => (
                    <article
                      key={post.id}
                      className={`rounded-none p-3 transition md:p-6 ${
                        isDusk
                          ? "border border-white/10 bg-black/25 hover:border-[#c4934e]/40"
                          : "border border-stone-200 bg-[#f8f4ed] hover:border-[#a9793d]/40"
                      }`}
                    >
                      <div className="mb-3 flex items-start justify-between gap-3 md:mb-4 md:gap-4">
                        <div className="flex items-center gap-3 md:gap-4">
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full md:h-12 md:w-12 ${
                              isDusk
                                ? "border border-white/15 bg-[#c4934e]/10"
                                : "border border-stone-200 bg-[#efe8dc]"
                            }`}
                          >
                            {post.profiles?.avatar_url ? (
                              <img
                                src={post.profiles.avatar_url}
                                alt="Member avatar"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <AnchorIcon
                                size={16}
                                strokeWidth={1.4}
                                className="text-[var(--sh-accent-gold)] md:size-5"
                              />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-[var(--sh-text-primary)] md:text-base">
                              {post.profiles?.display_name ||
                                post.profiles?.username ||
                                "Stone Harbor Member"}
                            </p>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--sh-text-muted)] md:text-xs md:tracking-[0.18em]">
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
                            aria-label="Delete post"
                            className={`rounded-none p-2 transition hover:border-red-300 hover:text-red-500 md:px-4 md:py-2 ${
                              isDusk
                                ? "border border-white/15 text-stone-400"
                                : "border border-stone-300 text-stone-500"
                            }`}
                          >
                            <X size={14} className="md:hidden" aria-hidden="true" />
                            <span className="hidden text-xs font-bold uppercase tracking-[0.18em] md:inline">
                              Delete
                            </span>
                          </button>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--sh-text-secondary)] md:text-lg">
                        {post.body}
                      </p>
                      {/* WITH YOU — anonymous solidarity. The poster sees a
                          warm count message; other members see a quieter
                          factual one. Tapping toggles the anchor. */}
                      <div
                        className={`mt-3 flex items-center justify-between gap-3 border-t pt-3 md:mt-5 md:gap-4 md:pt-4 ${
                          isDusk ? "border-white/10" : "border-stone-200"
                        }`}
                      >
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
          {/* ANCHOR / WHO YOU ARE — hidden on the dashboard per the
              psychoanalytic restructure. Identity belongs at /welcome
              (full profile editor). Mobile: the "Me" icon in the
              bottom tab bar takes members there in one tap. Desktop:
              the icon CTAs in the top header do the same. The aside
              code stays in source so the AboutRow visualization can
              be migrated to /welcome in a follow-up. */}
          <motion.aside
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7 }}
            className="hidden relative flex h-full flex-col rounded-none border border-white/70 bg-white p-7 shadow-[0_16px_60px_rgba(0,0,0,0.06)]"
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
            // No `h-full` here. Earlier this was set so the doors
            // column matched the (now-hidden) anchor aside's height
            // via the parent grid's items-stretch. With the aside
            // gone, h-full propagated down through the 4-card row
            // and stretched the cards to consume the entire grid
            // cell — pushing the PATIENCE LINE and Library/Resources
            // rows below the viewport. Letting the section size to
            // its content makes all three children visible in order.
            className=""
          >
            {/* Mobile: horizontal swipe through the four destinations.
                Desktop: original 2x2 / 4-up grid. The hide-scrollbar +
                snap-mandatory pattern matches the home pillars carousel —
                next card peeks on the right edge so the swipe affordance
                is visible without dots or arrows.

                No `h-full` on this row either — the grid's items-stretch
                already keeps all four cards in the same row at equal
                height. h-full would re-introduce the stretch bug. */}
            <div
              className={`hide-scrollbar flex min-w-0 items-start gap-3 overflow-x-auto pr-8 snap-x snap-mandatory md:grid md:items-start md:gap-6 md:overflow-visible md:pr-0 ${
                introExpanded
                  ? "md:grid-cols-2 md:grid-rows-2"
                  : "md:grid-cols-2 xl:grid-cols-4"
              }`}
            >
              {/* THE FOUR DOORS — Reflect / Vent / Brotherhood / Breathe.
                  Each maps to an emotional state, not a feature. The man
                  picks the door that matches what he arrived with today.
                  Read + Refine demoted to a secondary "Other doors" row
                  on desktop only (mobile keeps the focus to four). */}
              <DashboardCard
                href="/journal"
                label="Private"
                title="Reflect"
                text="Write, search, and revisit private reflections only you can access."
                Icon={EditIcon}
              />
              <DashboardCard
                href="/vent"
                label="Release"
                title="Vent"
                text="A blank page, no prompts, no audience. For when you just need to put it down."
                Icon={Heart}
              />
              <DashboardCard
                href="/messages"
                label={
                  unreadMessageCount > 0
                    ? `${unreadMessageCount} Unread`
                    : "Together"
                }
                title="Brotherhood"
                text={
                  unreadMessageCount > 0
                    ? "You have unread member messages waiting."
                    : "Step into the brotherhood. You're not the only one here."
                }
                badge={unreadMessageCount}
                Icon={Users}
              />
              <DashboardCard
                href="/meditation"
                label="Sixty seconds"
                title="Breathe"
                text="One breath at the door of the harbor. Stay as long as you want."
                Icon={Wind}
              />
            </div>

            {/* PATIENCE LINE — sits between the four primary doors
                and the Library/Resources row as a quiet exhale. The
                harbor will be here tomorrow whether or not the man
                walks through any door today. Earlier this line lived
                at the bottom of the dashboard where it ended up
                visually under the new Library/Resources row; this
                placement gives it breathing room on both sides and
                lets the man encounter it before deciding to scroll
                further into the secondary reading row. */}
            <div className="relative mt-8 overflow-hidden px-6 py-6 md:mt-12 md:py-8">
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(ellipse 40% 70% at 50% 50%, rgba(196,147,78,0.14) 0%, rgba(196,147,78,0.04) 50%, transparent 80%)",
                }}
              />
              <p
                className={`${serif.className} relative text-center text-base italic md:text-lg ${
                  isDusk ? "text-white/80" : "text-stone-500"
                }`}
              >
                The harbor will be here tomorrow.
              </p>
            </div>

            {/* OTHER DOORS — Read + Resources. Long-form blog content
                from the team (curated, AI-drafted, human-edited) and
                external reading aggregated from vetted sources via
                the daily RSS pipeline. Quieter row on desktop; same
                horizontal scroll behavior on mobile so the two cards
                sit beside the four primary doors above without
                crowding the eye. Bottom margin keeps the row from
                pressing against the global crisis footer. */}
            <div className="mt-3 hide-scrollbar mb-12 flex gap-3 overflow-x-auto pr-8 snap-x snap-mandatory md:mt-6 md:mb-20 md:grid md:grid-cols-2 md:gap-6 md:overflow-visible md:pr-0">
              <DashboardCard
                href="/members-blog"
                label="Read"
                title="The Library"
                text="Long-form pieces from the team. The thinking the harbor returns to, written in the voice of someone who knows."
                Icon={Newspaper}
              />
              <DashboardCard
                href="/resources"
                label="Curated"
                title="Resources"
                text="External reading the team has read first — books, essays, talks worth carrying with you between sessions."
                Icon={Compass}
              />
            </div>
          </motion.section>
        </div>

        {/* BROTHERHOOD WHISPERS — mobile-only compact preview of the
            three most recent member posts. Tease, not feed. Encourages
            the member to step further in via the Brotherhood door above
            without forcing the full feed into the dashboard scroll. */}
        {memberPosts.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.6 }}
            className="mt-6 md:hidden"
            aria-label="Recent brotherhood whispers"
          >
            <div className="mb-3 flex items-end justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[var(--sh-accent-gold)]">
                Today&apos;s Ripples
              </p>
              <Link
                href="/messages"
                className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)] transition hover:text-[var(--sh-accent-gold)]"
              >
                Step further in →
              </Link>
            </div>
            <div className="space-y-2.5">
              {memberPosts.slice(0, 3).map((post) => (
                <article
                  key={post.id}
                  className={`rounded-none p-3 ${
                    isDusk
                      ? "border border-white/10 bg-black/30 backdrop-blur-sm"
                      : "border border-stone-200 bg-white/70"
                  }`}
                >
                  <div className="mb-1.5 flex items-center gap-2">
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full ${
                        isDusk
                          ? "border border-white/15 bg-[#c4934e]/10"
                          : "border border-stone-200 bg-[#efe8dc]"
                      }`}
                    >
                      {post.profiles?.avatar_url ? (
                        <img
                          src={post.profiles.avatar_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <AnchorIcon
                          size={12}
                          strokeWidth={1.5}
                          className="text-[var(--sh-accent-gold)]"
                        />
                      )}
                    </div>
                    <p className="text-[11px] font-bold text-[var(--sh-text-primary)]">
                      {post.profiles?.display_name ||
                        post.profiles?.username ||
                        "A brother"}
                    </p>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--sh-text-muted)]">
                      · {formatPostDate(post.created_at)}
                    </p>
                  </div>
                  <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-[var(--sh-text-secondary)]">
                    {post.body}
                  </p>
                </article>
              ))}
            </div>
          </motion.section>
        )}

        {/* ROADMAP PROGRESS — conditional. Show only if the member
            has actually started a path. A 0/0 or empty-state progress
            bar communicates "you're behind" rather than "you have
            room." On the dashboard this matters a lot psychologically.
            If they haven't started, the Roadmap door (or /start-here)
            is where they discover the path. */}
        {roadmapProgress &&
          roadmapProgress.total_steps > 0 &&
          roadmapProgress.completed_steps > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className={`mt-6 rounded-none p-4 backdrop-blur-sm md:mt-10 md:p-8 ${
            isDusk
              ? "border border-white/10 bg-black/30 backdrop-blur-md"
              : "border border-stone-200 bg-white/70"
          }`}
        >
          <div className="grid gap-4 md:grid-cols-[1.4fr_1fr] md:items-center md:gap-6">
            <div>
              <div
                className="flex items-center gap-2"
                style={{ color: accent }}
              >
                <Roadmap size={14} className="md:size-4" />
                <p className="text-[10px] font-bold uppercase tracking-[0.26em] md:text-xs md:tracking-[0.3em]">
                  Your Roadmap
                </p>
              </div>
              <h2
                className={`${serif.className} mt-2 text-2xl font-medium text-[var(--sh-text-primary)] md:mt-3 md:text-5xl`}
              >
                Pick up where you left off.
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--sh-text-secondary)] md:mt-4 md:text-base">
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
              <div
                className={`mb-3 h-1 w-full md:h-[6px] ${
                  isDusk ? "bg-white/15" : "bg-stone-200"
                }`}
              >
                <div
                  className="h-full transition-all duration-700"
                  style={{
                    width: `${roadmapProgress?.percent ?? 0}%`,
                    backgroundColor: accent,
                  }}
                />
              </div>
              <Link
                href="/roadmap"
                className="group relative inline-block overflow-hidden rounded-none border px-6 py-3 text-xs font-bold uppercase tracking-[0.2em] text-white transition hover:scale-105 md:px-8 md:py-4 md:text-sm md:tracking-[0.22em]"
                style={{ backgroundColor: accent, borderColor: accent }}
              >
                <span className="relative z-10">Continue Your Path</span>
              </Link>
            </div>
          </div>
        </motion.section>
        )}

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
  const { theme } = useTheme();
  const isDusk = theme === "dusk";

  return (
    <Link
      href={href}
      // Compact card — heights matched by the parent grid's items-stretch
      // (so siblings in the same row end up identical) but the per-card
      // padding/typography is sized down to only what the title and one
      // line of description need. Earlier the cards rendered noticeably
      // taller than the text inside them, with extra whitespace below
      // the "Open →" affordance.
      className={`group relative flex w-[78%] shrink-0 snap-start flex-col overflow-hidden rounded-none p-4 transition duration-300 hover:-translate-y-1 md:w-auto md:p-5 ${
        isDusk
          ? "border border-white/10 bg-black/35 shadow-[0_18px_50px_rgba(0,0,0,0.4)] backdrop-blur-md hover:border-[#c4934e]/40 hover:bg-black/45"
          : "border border-white/70 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.05)] hover:border-[#a9793d]/40 hover:shadow-[0_18px_55px_rgba(0,0,0,0.09)]"
      }`}
    >
      {badge > 0 && (
        <span className="absolute right-3 top-3 z-20 flex h-6 min-w-6 items-center justify-center border border-[#c4934e] bg-[#a9793d] px-2 text-[11px] font-black text-white shadow-[0_8px_20px_rgba(169,121,61,0.35)] md:right-4 md:top-4 md:h-7 md:min-w-7">
          {badge}
        </span>
      )}
      {/* Hero icon block — gold ring on mobile. Smaller (10x10 vs 12x12)
          so the card collapses to a tighter footprint when the row
          stretches all cards to match the tallest. */}
      {Icon && (
        <div
          className={`mb-2 flex h-10 w-10 items-center justify-center rounded-full md:hidden ${
            isDusk
              ? "border border-[#c4934e]/30 bg-[#c4934e]/10"
              : "border border-[#a9793d]/25 bg-gradient-to-br from-[#f8f4ed] to-[#efe8dc]"
          }`}
        >
          <Icon
            size={20}
            strokeWidth={1.5}
            className="text-[var(--sh-accent-gold)]"
          />
        </div>
      )}
      <div className="mb-2 hidden items-center gap-2 pr-10 md:flex">
        {Icon && (
          <Icon
            size={18}
            strokeWidth={1.5}
            className="text-[var(--sh-accent-gold)]"
          />
        )}
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--sh-accent-gold)]">
          {label}
        </p>
      </div>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--sh-accent-gold)] md:hidden">
        {label}
      </p>
      <h3
        className={`${serif.className} text-xl font-medium leading-tight text-[var(--sh-text-primary)] md:text-2xl`}
      >
        {title}
      </h3>
      <p className="mt-2 text-[13px] leading-snug text-[var(--sh-text-secondary)] md:text-sm">
        {text}
      </p>
      <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--sh-text-muted)] transition group-hover:text-[var(--sh-accent-gold)] md:mt-4">
        Open →
      </p>
      <span className="absolute bottom-0 left-0 h-[2px] w-0 bg-[#c4934e] transition-all duration-500 group-hover:w-full" />
    </Link>
  );
}
