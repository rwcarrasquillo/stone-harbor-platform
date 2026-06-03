"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { InactivityGate } from "@/app/components/inactivityGate";
import { PageAmbience } from "@/app/components/pageAmbience";
import { PageTopNav } from "@/app/components/pageTopNav";
import { useTheme } from "@/app/components/themeProvider";
import { VentInput, VentTextarea } from "@/app/components/ventField";
import { BrotherhoodPairing } from "@/app/components/brotherhoodPairing";
import {
  FEATURE_THRESHOLDS,
  isFeatureUnlocked,
} from "@/lib/userProgress";
import { serif, sans } from "@/lib/fonts";
import {
  Anchor as AnchorIcon,
  Lock,
  Message as MessageIcon,
  Send,
} from "@/app/components/icons";
import { Toast, type ToastState } from "@/app/components/toast";

// Brand system — matches home, dashboard, journal, login, register
const GOLD = "#c4934e";
const GOLD_DEEP = "#a9793d";
const MOSS = "#586558";

type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

type ConversationListItem = {
  id: string;
  title: string;
  updated_at: string;
  otherMember?: Profile | null;
  lastMessage?: string;
};

type MessageItem = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

// Returns the shared timeOfDay catalog key for the current hour. The
// caller resolves the actual label via t("timeOfDay.<key>") so the
// greeting localizes with the interface language.
function timeGreetingKey():
  | "lateNight"
  | "morning"
  | "afternoon"
  | "evening"
  | "tonight" {
  const h = new Date().getHours();
  if (h < 5) return "lateNight";
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  if (h < 21) return "evening";
  return "tonight";
}

function relativeTime(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(value).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

export default function MessagesPage() {
  const t = useTranslations("messages");
  const tTime = useTranslations("timeOfDay");
  const { theme } = useTheme();
  const isDusk = theme === "dusk";

  const [userId, setUserId] = useState<string | null>(null);
  // Account age for gating the Brotherhood pairing tile to day 120+.
  const [userCreatedAt, setUserCreatedAt] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationListItem[]>(
    [],
  );
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [messageBody, setMessageBody] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [memberResults, setMemberResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastState>(null);
  const fail = (msg: string) => setToast({ tone: "error", text: msg });
  const [sending, setSending] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [breathPhase, setBreathPhase] = useState<"inhale" | "exhale">("inhale");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const activeConversation = useMemo(() => {
    return conversations.find((item) => item.id === activeConversationId);
  }, [conversations, activeConversationId]);

  // breath cycle for loading + empty state
  useEffect(() => {
    const id = setInterval(() => {
      setBreathPhase((p) => (p === "inhale" ? "exhale" : "inhale"));
    }, 4000);
    return () => clearInterval(id);
  }, []);

  // auto-scroll to bottom when messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadPage() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = "/login";
      return;
    }
    // Suspension gate — block messaging when suspended.
    // Also fetch created_at so we can gate the Brotherhood pairing
    // tile (day 120 unlock).
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
    await loadConversations(user.id);
    setLoading(false);
  }

  async function loadConversations(currentUserId: string) {
    const { data: memberships, error: membershipError } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("user_id", currentUserId);
    if (membershipError) {
      console.error("Could not load memberships:", membershipError.message);
      setConversations([]);
      return;
    }
    const conversationIds =
      memberships?.map((item) => item.conversation_id) ?? [];
    if (conversationIds.length === 0) {
      setConversations([]);
      return;
    }
    const { data: conversationRows, error: conversationError } = await supabase
      .from("conversations")
      .select("id, title, updated_at")
      .in("id", conversationIds)
      .order("updated_at", { ascending: false });
    if (conversationError) {
      console.error("Could not load conversations:", conversationError.message);
      return;
    }
    const { data: memberRows, error: memberError } = await supabase
      .from("conversation_members")
      .select("conversation_id, user_id")
      .in("conversation_id", conversationIds);
    if (memberError) {
      console.error(
        "Could not load conversation members:",
        memberError.message,
      );
      return;
    }
    const otherUserIds =
      memberRows
        ?.filter((member) => member.user_id !== currentUserId)
        .map((member) => member.user_id) ?? [];
    const uniqueOtherUserIds = Array.from(new Set(otherUserIds));
    let profiles: Profile[] = [];
    if (uniqueOtherUserIds.length > 0) {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, display_name, username, avatar_url")
        .in("id", uniqueOtherUserIds);
      if (error) {
        console.error("Could not load profiles:", error.message);
      }
      profiles = data ?? [];
    }
    const { data: recentMessages, error: recentMessageError } = await supabase
      .from("messages")
      .select("conversation_id, body, created_at")
      .in("conversation_id", conversationIds)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(100);
    if (recentMessageError) {
      console.error(
        "Could not load recent messages:",
        recentMessageError.message,
      );
    }
    const list =
      conversationRows?.map((conversation) => {
        const otherMemberId = memberRows?.find(
          (member) =>
            member.conversation_id === conversation.id &&
            member.user_id !== currentUserId,
        )?.user_id;
        const otherMember =
          profiles.find((profile) => profile.id === otherMemberId) ?? null;
        const lastMessage = recentMessages?.find(
          (message) => message.conversation_id === conversation.id,
        );
        return {
          id: conversation.id,
          title:
            conversation.title ||
            otherMember?.display_name ||
            otherMember?.username ||
            otherMember?.email ||
            "Stone Harbor Member",
          updated_at: conversation.updated_at,
          otherMember,
          lastMessage: lastMessage?.body ?? "No messages yet.",
        };
      }) ?? [];
    setConversations(list);
    if (!activeConversationId && list.length > 0) {
      setActiveConversationId(list[0].id);
      await loadMessages(list[0].id, true);
    }
  }

  async function markConversationAsRead(conversationId: string) {
    if (!userId) return;
    const { error } = await supabase
      .from("conversation_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("user_id", userId);
    if (error) {
      console.error("Could not mark conversation as read:", error.message);
    }
  }

  async function loadMessages(conversationId: string, markRead = false) {
    const { data, error } = await supabase
      .from("messages")
      .select("id, conversation_id, sender_id, body, created_at")
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("Could not load messages:", error.message);
      setMessages([]);
      return;
    }
    setMessages(data ?? []);
    if (markRead) {
      await markConversationAsRead(conversationId);
    }
  }

  async function searchMembers(value: string) {
    setMemberSearch(value);
    setSearchError("");
    const query = value.trim();
    if (query.length < 2 || !userId) {
      setMemberResults([]);
      return;
    }
    setSearching(true);
    const safeQuery = query.replaceAll(",", "").replaceAll("%", "");
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, display_name, username, avatar_url")
      .or(
        `display_name.ilike.%${safeQuery}%,username.ilike.%${safeQuery}%,email.ilike.%${safeQuery}%`,
      )
      .neq("id", userId)
      .limit(10);
    if (error) {
      console.error("Member search failed:", error.message);
      setSearchError(error.message);
      setMemberResults([]);
      setSearching(false);
      return;
    }
    setMemberResults(data ?? []);
    setSearching(false);
  }

  async function startConversation(otherUserId: string) {
    const { data, error } = await supabase.rpc("create_direct_conversation", {
      other_user_id: otherUserId,
    });
    if (error) {
      fail(error.message);
      return;
    }
    const conversationId = data as string;
    setMemberSearch("");
    setMemberResults([]);
    setActiveConversationId(conversationId);
    if (userId) {
      await loadConversations(userId);
    }
    await loadMessages(conversationId, true);
  }

  async function sendMessage(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!activeConversationId || !messageBody.trim()) return;
    setSending(true);
    const { error } = await supabase.rpc("send_message", {
      conversation_uuid: activeConversationId,
      message_body: messageBody,
    });
    if (error) {
      fail(error.message);
      setSending(false);
      return;
    }
    setMessageBody("");
    await loadMessages(activeConversationId, true);
    if (userId) {
      await loadConversations(userId);
    }
    setSending(false);
  }

  function formatMessageTime(value: string) {
    return new Date(value).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  useEffect(() => {
    loadPage();
  }, []);

  useEffect(() => {
    if (!activeConversationId) return;
    loadMessages(activeConversationId, true);
    const channel = supabase
      .channel(`messages-${activeConversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${activeConversationId}`,
        },
        async () => {
          await loadMessages(activeConversationId, true);
          if (userId) {
            await loadConversations(userId);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeConversationId, userId]);

  // STYLED LOADING — breathing pulse, matches dashboard/journal
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
            {t("loading")}
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
      {/* Unified harbor ambience — same on every authenticated page */}
      <PageAmbience />

      {/* Canonical TOP NAV. Same component on every text-link page so
          the ← Dashboard affordance never drifts horizontally between
          surfaces. See app/components/pageTopNav.tsx. */}
      <PageTopNav />

      <section className="relative z-10 mx-auto w-full max-w-7xl flex-1 px-4 pb-8 md:px-8">
        {/* GREETING STRIP */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className={`mb-8 grid gap-6 border-y px-6 py-6 backdrop-blur-sm md:grid-cols-4 ${
            isDusk
              ? "border-white/10 bg-black/25"
              : "border-[var(--sh-border-subtle)] bg-white/40"
          }`}
        >
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--sh-text-tertiary)]">
              {tTime(timeGreetingKey())}
            </p>
            <p
              className={`${serif.className} mt-2 text-2xl italic text-[#a9793d]`}
            >
              {t("strip.brotherhood")}
            </p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[#a9793d]">
              {t("strip.memberOnly")}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--sh-text-tertiary)]">
              {t("strip.conversationsLabel")}
            </p>
            <p
              className={`${serif.className} mt-2 text-2xl italic text-[var(--sh-text-primary)]`}
            >
              {conversations.length === 0
                ? t("strip.noneYet")
                : conversations.length === 1
                  ? t("strip.oneOpen")
                  : t("strip.manyOpen", { count: conversations.length })}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--sh-text-tertiary)]">
              {conversations.length === 0
                ? t("strip.reachOut")
                : t("strip.smallAct")}
            </p>
          </div>
          <div className="md:col-span-2">
            <div className="flex items-center gap-2">
              <Lock size={14} className="text-[#a9793d]" />
              <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--sh-text-tertiary)]">
                {t("strip.privacyLabel")}
              </p>
            </div>
            <p
              className={`${serif.className} mt-2 text-xl italic leading-snug text-[var(--sh-text-primary)] md:text-2xl`}
            >
              {t("strip.privacyHeadline")}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-[var(--sh-text-tertiary)]">
              {t("strip.privacySub")}
            </p>
          </div>
        </motion.div>

        {/* BROTHERHOOD PAIRING TILE — day 120 unlock.
            Sits above the inbox grid so the opt-in flow is the first
            thing the man sees when he comes to /messages. After he
            opts in, the same tile transforms into a waiting panel,
            and then into the active pairing once a match is made. */}
        {userId &&
          isFeatureUnlocked(
            userCreatedAt,
            FEATURE_THRESHOLDS.brotherhoodPairing,
          ) && (
            <div className="mb-8">
              <BrotherhoodPairing userId={userId} />
            </div>
          )}

        <div className="grid min-h-[760px] gap-8 lg:grid-cols-[0.42fr_0.58fr]">
          {/* LEFT — INBOX + SEARCH */}
          <motion.aside
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className={`rounded-none border p-7 shadow-[0_16px_60px_rgba(0,0,0,0.06)] ${
              isDusk
                ? "border-white/10 bg-black/30 backdrop-blur-md"
                : "border-white/70 bg-white"
            }`}
          >
            <div className="mb-8">
              <div className="mb-3 flex items-center gap-2">
                <MessageIcon size={14} className="text-[#a9793d]" />
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#a9793d]">
                  {t("inbox.eyebrow")}
                </p>
              </div>
              <h1
                className={`${serif.className} text-5xl font-medium leading-tight text-[var(--sh-text-primary)]`}
              >
                {t("inbox.title")}
              </h1>
              <p className="mt-4 leading-relaxed text-[var(--sh-text-secondary)]">
                {t("inbox.subtitle")}
              </p>
            </div>

            <div className="mb-8">
              <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)]">
                {t("inbox.findMember")}
              </label>
              <VentInput
                value={memberSearch}
                onChange={(e) => searchMembers(e.target.value)}
                placeholder={t("inbox.searchPlaceholder")}
              />
              {searching && (
                <div
                  className={`mt-3 border px-4 py-4 text-sm text-[var(--sh-text-tertiary)] ${
                    isDusk
                      ? "border-white/10 bg-white/[0.03]"
                      : "border-[var(--sh-border-subtle)] bg-[#f8f4ed]"
                  }`}
                >
                  {t("inbox.searching")}
                </div>
              )}
              {searchError && (
                <div className="mt-3 border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
                  {t("inbox.searchError", { error: searchError })}
                </div>
              )}
              {memberResults.length > 0 && (
                <div
                  className={`mt-3 max-h-72 overflow-y-auto border shadow-lg ${
                    isDusk
                      ? "border-white/10 bg-[#1a1614]"
                      : "border-[var(--sh-border-medium)] bg-white"
                  }`}
                >
                  {memberResults.map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => startConversation(member.id)}
                      className={`flex w-full items-center gap-4 border-b px-4 py-4 text-left transition last:border-b-0 ${
                        isDusk
                          ? "border-white/5 hover:bg-white/[0.05]"
                          : "border-[var(--sh-border-subtle)] hover:bg-[#f8f4ed]"
                      }`}
                    >
                      <Avatar profile={member} />
                      <div className="min-w-0">
                        <p className="truncate font-bold text-[var(--sh-text-primary)]">
                          {member.display_name ||
                            member.username ||
                            member.email ||
                            t("inbox.memberFallback")}
                        </p>
                        <p className="truncate text-sm text-[var(--sh-text-tertiary)]">
                          {member.username
                            ? `@${member.username}`
                            : member.email}
                        </p>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[#a9793d]">
                          {t("inbox.startConversation")}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {memberSearch.trim().length >= 2 &&
                !searching &&
                !searchError &&
                memberResults.length === 0 && (
                  <div
                    className={`mt-3 border px-4 py-4 text-sm text-[var(--sh-text-tertiary)] ${
                      isDusk
                        ? "border-white/10 bg-white/[0.03]"
                        : "border-[var(--sh-border-subtle)] bg-[#f8f4ed]"
                    }`}
                  >
                    {t("inbox.noMembersFound")}
                  </div>
                )}
            </div>

            <div className="border-t border-[var(--sh-border-subtle)] pt-6">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)]">
                {t("inbox.conversationsLabel")}
              </p>
              {conversations.length === 0 ? (
                <div
                  className={`border p-6 ${
                    isDusk
                      ? "border-white/10 bg-white/[0.03]"
                      : "border-[var(--sh-border-subtle)] bg-[#f8f4ed]"
                  }`}
                >
                  <p
                    className={`${serif.className} text-2xl italic text-[var(--sh-text-secondary)]`}
                  >
                    {t("inbox.noConversationsTitle")}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--sh-text-tertiary)]">
                    {t("inbox.noConversationsSub")}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {conversations.map((conversation) => {
                    const active = activeConversationId === conversation.id;
                    return (
                      <button
                        key={conversation.id}
                        type="button"
                        onClick={() => {
                          setActiveConversationId(conversation.id);
                          loadMessages(conversation.id, true);
                        }}
                        className="w-full border px-4 py-4 text-left transition"
                        style={{
                          borderColor: active
                            ? GOLD_DEEP
                            : isDusk
                              ? "rgba(255,255,255,0.1)"
                              : "#e7e5e4",
                          backgroundColor: active
                            ? isDusk
                              ? "rgba(196,147,78,0.12)"
                              : "#f3efe7"
                            : isDusk
                              ? "rgba(255,255,255,0.04)"
                              : "#f8f4ed",
                          boxShadow: active
                            ? `inset 0 0 0 1px ${GOLD_DEEP}`
                            : undefined,
                        }}
                      >
                        <div className="flex items-center gap-4">
                          <Avatar profile={conversation.otherMember ?? null} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <p className="truncate font-bold text-[var(--sh-text-primary)]">
                                {conversation.title}
                              </p>
                              <p className="shrink-0 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--sh-text-muted)]">
                                {relativeTime(conversation.updated_at)}
                              </p>
                            </div>
                            <p className="mt-1 truncate text-sm text-[var(--sh-text-tertiary)]">
                              {conversation.lastMessage}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.aside>

          {/* RIGHT — ACTIVE CONVERSATION */}
          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className={`flex min-h-[760px] flex-col rounded-none border shadow-[0_16px_60px_rgba(0,0,0,0.06)] ${
              isDusk
                ? "border-white/10 bg-black/30 backdrop-blur-md"
                : "border-white/70 bg-white"
            }`}
          >
            {activeConversation ? (
              <>
                <div
                  className={`border-b px-7 py-6 ${
                    isDusk
                      ? "border-white/10 bg-black/20"
                      : "border-[var(--sh-border-subtle)] bg-[#f8f4ed]"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <Avatar profile={activeConversation.otherMember ?? null} />
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#a9793d]">
                        {t("thread.eyebrow")}
                      </p>
                      <h2
                        className={`${serif.className} mt-1 text-3xl font-medium text-[var(--sh-text-primary)] md:text-4xl`}
                      >
                        {activeConversation.title}
                      </h2>
                    </div>
                  </div>
                </div>

                <div className="relative flex-1 overflow-y-auto px-7 py-6">
                  {/* top edge fade */}
                  <div
                    className={`pointer-events-none absolute left-0 right-0 top-0 z-10 h-8 bg-gradient-to-b to-transparent ${
                      isDusk ? "from-black/40" : "from-white"
                    }`}
                  />
                  {messages.length === 0 ? (
                    <div className="flex h-full items-center justify-center">
                      <div
                        className={`max-w-md border p-8 text-center ${
                          isDusk
                            ? "border-white/10 bg-white/[0.03]"
                            : "border-[var(--sh-border-subtle)] bg-[#f8f4ed]"
                        }`}
                      >
                        <p
                          className={`${serif.className} text-2xl italic text-[var(--sh-text-secondary)]`}
                        >
                          {t("thread.noMessagesTitle")}
                        </p>
                        <p className="mt-2 text-sm leading-relaxed text-[var(--sh-text-tertiary)]">
                          {t("thread.noMessagesSub")}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {messages.map((message) => {
                        const isMine = message.sender_id === userId;
                        return (
                          <div
                            key={message.id}
                            className={`flex ${
                              isMine ? "justify-end" : "justify-start"
                            }`}
                          >
                            <div
                              className={`max-w-[78%] border px-5 py-4 shadow-sm ${
                                isMine
                                  ? "border-[#a9793d] bg-[#a9793d] text-white"
                                  : isDusk
                                    ? "border-white/10 bg-white/[0.05] text-[var(--sh-text-primary)] backdrop-blur-sm"
                                    : "border-[var(--sh-border-subtle)] bg-[#f8f4ed] text-[var(--sh-text-primary)]"
                              }`}
                            >
                              <p className="whitespace-pre-wrap leading-relaxed">
                                {message.body}
                              </p>
                              <p
                                className={`mt-3 text-[10px] font-bold uppercase tracking-[0.18em] ${
                                  isMine ? "text-white/70" : "text-[var(--sh-text-muted)]"
                                }`}
                              >
                                {formatMessageTime(message.created_at)}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                  {/* bottom edge fade */}
                  <div
                    className={`pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-8 bg-gradient-to-t to-transparent ${
                      isDusk ? "from-black/40" : "from-white"
                    }`}
                  />
                </div>

                <form
                  onSubmit={sendMessage}
                  className={`border-t p-6 ${
                    isDusk
                      ? "border-white/10 bg-black/30"
                      : "border-[var(--sh-border-subtle)] bg-[#f8f4ed]"
                  }`}
                >
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)]">
                    {t("thread.composeLabel")}
                  </label>
                  <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                    <VentTextarea
                      value={messageBody}
                      onChange={(e) => setMessageBody(e.target.value)}
                      rows={3}
                      compact
                      placeholder={t("thread.composePlaceholder")}
                    />
                    <button
                      type="submit"
                      disabled={sending || !messageBody.trim()}
                      className="group relative flex items-center justify-center gap-3 overflow-hidden rounded-none border border-[#c4934e] bg-[#a9793d] px-8 py-4 text-sm font-bold uppercase tracking-[0.22em] text-white transition hover:bg-[#8d6432] disabled:opacity-60"
                    >
                      {sending ? (
                        <motion.span
                          animate={{
                            scale: [1, 1.3, 1],
                            opacity: [0.5, 1, 0.5],
                          }}
                          transition={{
                            duration: 1.6,
                            repeat: Infinity,
                            ease: "easeInOut",
                          }}
                          className="h-2 w-2 rounded-full bg-white"
                        />
                      ) : (
                        <Send size={14} />
                      )}
                      <span className="relative z-10">
                        {sending ? t("thread.sending") : t("thread.send")}
                      </span>
                      <span className="absolute bottom-0 left-0 h-[2px] w-0 bg-white/60 transition-all duration-500 group-hover:w-full" />
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
                <motion.div
                  animate={{
                    scale: breathPhase === "inhale" ? 1.25 : 1,
                    opacity: breathPhase === "inhale" ? 0.95 : 0.55,
                  }}
                  transition={{ duration: 4, ease: "easeInOut" }}
                  className="mb-10 flex h-28 w-28 items-center justify-center rounded-full border border-[#c4934e]/40"
                  style={{
                    background:
                      "radial-gradient(circle, rgba(196,147,78,0.20) 0%, rgba(196,147,78,0.04) 70%, transparent 100%)",
                  }}
                >
                  <span
                    className={`${serif.className} text-sm italic text-[#a9793d]`}
                  >
                    {breathPhase === "inhale"
                      ? t("empty.inhale")
                      : t("empty.exhale")}
                  </span>
                </motion.div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#a9793d]">
                  {t("empty.eyebrow")}
                </p>
                <h2
                  className={`${serif.className} mt-4 max-w-md text-4xl font-medium leading-snug text-[var(--sh-text-primary)] md:text-5xl`}
                >
                  {t("empty.headline")}
                </h2>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-[var(--sh-text-secondary)]">
                  {t("empty.sub")}
                </p>
              </div>
            )}
          </motion.section>
        </div>
      </section>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </main>
  );
}

function Avatar({ profile }: { profile: Profile | null }) {
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--sh-border-subtle)] bg-[#efe8dc]">
      {profile?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        // Note: kept as <img> rather than next/image because Supabase
        // Storage URLs in avatar context don't benefit much from the
        // next/image optimizer at 44×44 — payload is already tiny and
        // every member avatar would otherwise need a separate
        // optimization round-trip. The 10 <img> tags codebase-wide will
        // be re-evaluated in a focused post-launch performance pass.
        <img
          src={profile.avatar_url}
          alt={`${profile.display_name ?? "Member"} avatar`}
          className="h-full w-full object-cover"
        />
      ) : (
        <AnchorIcon size={20} strokeWidth={1.4} className="text-[#a9793d]" />
      )}
    </div>
  );
}
