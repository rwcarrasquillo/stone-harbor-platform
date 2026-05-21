"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
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

function timeGreeting() {
  const h = new Date().getHours();
  if (h < 5) return "Late night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Tonight";
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
  const [userId, setUserId] = useState<string | null>(null);
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
            Opening your conversations…
          </p>
        </div>
      </main>
    );
  }

  return (
    <main
      className={`${sans.className} relative min-h-screen overflow-hidden bg-[#f3efe7] text-stone-900`}
    >
      {/* AMBIENT — contour */}
      <svg
        className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-[0.035]"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern
            id="messages-contour"
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
        <rect width="100%" height="100%" fill="url(#messages-contour)" />
      </svg>

      {/* AMBIENT — paper grain */}
      <svg
        className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-[0.05] mix-blend-multiply"
        xmlns="http://www.w3.org/2000/svg"
      >
        <filter id="messages-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves="2"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#messages-grain)" />
      </svg>

      {/* AMBIENT — dawn glow upper-right */}
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
          <Link
            href="/dashboard"
            className="group flex flex-col leading-none no-underline"
          >
            <span className="text-base font-bold uppercase tracking-[0.28em] text-[#a9793d] transition group-hover:text-[#8d6432]">
              ← Dashboard
            </span>
            <span className="mt-1 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-[#a9793d]/70">
              Return To Harbor
            </span>
          </Link>
          <Link
            href="/"
            className="text-xs font-bold uppercase tracking-[0.28em] text-stone-500 transition hover:text-[#a9793d]"
          >
            Stone Harbor
          </Link>
        </div>

        {/* GREETING STRIP */}
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
              className={`${serif.className} mt-2 text-2xl italic text-[#a9793d]`}
            >
              Brotherhood.
            </p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[#a9793d]">
              Member-to-member only.
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-stone-500">
              Conversations
            </p>
            <p
              className={`${serif.className} mt-2 text-2xl italic text-stone-900`}
            >
              {conversations.length === 0
                ? "None yet."
                : conversations.length === 1
                  ? "1 open."
                  : `${conversations.length} open.`}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-stone-500">
              {conversations.length === 0
                ? "Reach out when you're ready."
                : "Each one is a small act of courage."}
            </p>
          </div>
          <div className="md:col-span-2">
            <div className="flex items-center gap-2">
              <Lock size={14} className="text-[#a9793d]" />
              <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-stone-500">
                Privacy
              </p>
            </div>
            <p
              className={`${serif.className} mt-2 text-xl italic leading-snug text-stone-900 md:text-2xl`}
            >
              Stone Harbor staff cannot read your messages.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-stone-500">
              Encrypted. Yours alone. Member-to-member, by design.
            </p>
          </div>
        </motion.div>

        <div className="grid min-h-[760px] gap-8 lg:grid-cols-[0.42fr_0.58fr]">
          {/* LEFT — INBOX + SEARCH */}
          <motion.aside
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="rounded-none border border-white/70 bg-white p-7 shadow-[0_16px_60px_rgba(0,0,0,0.06)]"
          >
            <div className="mb-8">
              <div className="mb-3 flex items-center gap-2">
                <MessageIcon size={14} className="text-[#a9793d]" />
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#a9793d]">
                  Private Inbox
                </p>
              </div>
              <h1
                className={`${serif.className} text-5xl font-medium leading-tight text-stone-900`}
              >
                Reach out.
              </h1>
              <p className="mt-4 leading-relaxed text-stone-600">
                A conversation is a small act of courage. Find another member to
                begin.
              </p>
            </div>

            <div className="mb-8">
              <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-stone-500">
                Find Member
              </label>
              <input
                value={memberSearch}
                onChange={(e) => searchMembers(e.target.value)}
                className="w-full rounded-none border border-stone-300 bg-[#f8f4ed] px-5 py-4 outline-none transition focus:border-[#a9793d] focus:ring-2 focus:ring-[#586558]/30"
                placeholder="Search name, username, or email"
              />
              {searching && (
                <div className="mt-3 border border-stone-200 bg-[#f8f4ed] px-4 py-4 text-sm text-stone-500">
                  Searching members…
                </div>
              )}
              {searchError && (
                <div className="mt-3 border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
                  Search error: {searchError}
                </div>
              )}
              {memberResults.length > 0 && (
                <div className="mt-3 max-h-72 overflow-y-auto border border-stone-300 bg-white shadow-lg">
                  {memberResults.map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => startConversation(member.id)}
                      className="flex w-full items-center gap-4 border-b border-stone-200 px-4 py-4 text-left transition last:border-b-0 hover:bg-[#f8f4ed]"
                    >
                      <Avatar profile={member} />
                      <div className="min-w-0">
                        <p className="truncate font-bold text-stone-900">
                          {member.display_name ||
                            member.username ||
                            member.email ||
                            "Stone Harbor Member"}
                        </p>
                        <p className="truncate text-sm text-stone-500">
                          {member.username
                            ? `@${member.username}`
                            : member.email}
                        </p>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[#a9793d]">
                          Start Conversation
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
                  <div className="mt-3 border border-stone-200 bg-[#f8f4ed] px-4 py-4 text-sm text-stone-500">
                    No members found.
                  </div>
                )}
            </div>

            <div className="border-t border-stone-200 pt-6">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.22em] text-stone-500">
                Conversations
              </p>
              {conversations.length === 0 ? (
                <div className="border border-stone-200 bg-[#f8f4ed] p-6">
                  <p
                    className={`${serif.className} text-2xl italic text-stone-700`}
                  >
                    No conversations yet.
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-stone-500">
                    Reach out to one man this week. That&apos;s enough.
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
                          borderColor: active ? GOLD_DEEP : "#e7e5e4",
                          backgroundColor: active ? "#f3efe7" : "#f8f4ed",
                          boxShadow: active
                            ? `inset 0 0 0 1px ${GOLD_DEEP}`
                            : undefined,
                        }}
                      >
                        <div className="flex items-center gap-4">
                          <Avatar profile={conversation.otherMember ?? null} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <p className="truncate font-bold text-stone-900">
                                {conversation.title}
                              </p>
                              <p className="shrink-0 text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">
                                {relativeTime(conversation.updated_at)}
                              </p>
                            </div>
                            <p className="mt-1 truncate text-sm text-stone-500">
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
            className="flex min-h-[760px] flex-col rounded-none border border-white/70 bg-white shadow-[0_16px_60px_rgba(0,0,0,0.06)]"
          >
            {activeConversation ? (
              <>
                <div className="border-b border-stone-200 bg-[#f8f4ed] px-7 py-6">
                  <div className="flex items-center gap-4">
                    <Avatar profile={activeConversation.otherMember ?? null} />
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#a9793d]">
                        Conversation
                      </p>
                      <h2
                        className={`${serif.className} mt-1 text-3xl font-medium text-stone-900 md:text-4xl`}
                      >
                        {activeConversation.title}
                      </h2>
                    </div>
                  </div>
                </div>

                <div className="relative flex-1 overflow-y-auto px-7 py-6">
                  {/* top edge fade */}
                  <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 h-8 bg-gradient-to-b from-white to-transparent" />
                  {messages.length === 0 ? (
                    <div className="flex h-full items-center justify-center">
                      <div className="max-w-md border border-stone-200 bg-[#f8f4ed] p-8 text-center">
                        <p
                          className={`${serif.className} text-2xl italic text-stone-700`}
                        >
                          No messages yet.
                        </p>
                        <p className="mt-2 text-sm leading-relaxed text-stone-500">
                          One honest sentence is enough.
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
                                  : "border-stone-200 bg-[#f8f4ed] text-stone-800"
                              }`}
                            >
                              <p className="whitespace-pre-wrap leading-relaxed">
                                {message.body}
                              </p>
                              <p
                                className={`mt-3 text-[10px] font-bold uppercase tracking-[0.18em] ${
                                  isMine ? "text-white/70" : "text-stone-400"
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
                  <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-8 bg-gradient-to-t from-white to-transparent" />
                </div>

                <form
                  onSubmit={sendMessage}
                  className="border-t border-stone-200 bg-[#f8f4ed] p-6"
                >
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-stone-500">
                    Message
                  </label>
                  <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                    <textarea
                      value={messageBody}
                      onChange={(e) => setMessageBody(e.target.value)}
                      rows={3}
                      className="w-full resize-none rounded-none border border-stone-300 bg-white px-5 py-4 outline-none transition focus:border-[#a9793d] focus:ring-2 focus:ring-[#586558]/30"
                      placeholder="Write a private message…"
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
                        {sending ? "Sending…" : "Send"}
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
                    {breathPhase === "inhale" ? "Inhale" : "Exhale"}
                  </span>
                </motion.div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#a9793d]">
                  No Conversation Selected
                </p>
                <h2
                  className={`${serif.className} mt-4 max-w-md text-4xl font-medium leading-snug text-stone-900 md:text-5xl`}
                >
                  A conversation is a small act of courage.
                </h2>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-stone-600">
                  When you&apos;re ready, choose a member from the left or
                  search for one above.
                </p>
              </div>
            )}
          </motion.section>
        </div>
      </section>

      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* FOOTER — 988 crisis line */}
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

function Avatar({ profile }: { profile: Profile | null }) {
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-stone-200 bg-[#efe8dc]">
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
