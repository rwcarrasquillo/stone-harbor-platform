"use client";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { InactivityGate } from "@/app/components/inactivityGate";
import { AnchorMark } from "@/app/components/anchorMark";
import { useTheme } from "@/app/components/themeProvider";
import { VentInput } from "@/app/components/ventField";
import { BrotherhoodPairing } from "@/app/components/brotherhoodPairing";
import {
  FEATURE_THRESHOLDS,
  isFeatureUnlocked,
} from "@/lib/userProgress";
import { serif, sans } from "@/lib/fonts";
import {
  Anchor as AnchorIcon,
  Lock,
} from "@/app/components/icons";
import { Toast, type ToastState } from "@/app/components/toast";

/**
 * Stone Harbor — Messages route (production, harbor vocabulary).
 *
 * Member-to-member private messaging in the harbor vocabulary shared
 * with /journal, /dashboard, /vent, /lineage, /meditation. Letter-
 * style, not chat-style: each message reads as a turn in correspondence
 * rather than a Slack-shaped bubble.
 *
 * Composition (top → bottom):
 *   - Brand header (anchor + "Stone Harbor · Brotherhood" → /dashboard)
 *   - Anchor strip: "BROTHERHOOD" eyebrow + "Connection without
 *     performance." title + privacy sub-line with lock icon
 *   - Brotherhood Pairing tile (day 120+ unlock) at max-w-[920px]
 *   - Two-column grid inside max-w-[1200px], divided by a thin border:
 *     · Left (~420px): conversations strip + "+ Find a member" toggle
 *     · Right (~760px): active thread OR empty-state breath circle
 *   - Horizon mark + voice signature ("The harbor holds what you share.")
 *   - Crisis footer visible at the bottom via h-full layout
 *
 * Conversation strip (left column):
 *   - Each card uses the journal-entry geometry adapted for messaging:
 *     gold avatar bubble + relative time + serif italic name +
 *     two-line message preview + engraved-gold hairlines on hover or
 *     active selection
 *   - Unread signal: gold avatar ring + semibold title + "N new" count
 *     in the time row. Three reinforcing cues without a notification
 *     badge that creates inbox anxiety.
 *   - Optimistic clearing: clicking a card zeroes its unreadCount in
 *     local state immediately, before the server roundtrip
 *
 * Active thread (right column):
 *   - Header: avatar + "CONVERSATION" eyebrow + serif italic name +
 *     presence line ("Reading now" with moss-green dot when active,
 *     "Last read X ago" otherwise, "Hasn't opened this yet" if never)
 *   - Messages cluster by calendar date with a date separator below
 *     each cluster ("TODAY", "YESTERDAY", "FRI 13 JUN")
 *   - Each message: sender row (avatar + label for theirs; "YOU" only
 *     for own), serif italic body in max-w-[720px] reading column,
 *     time stamp, status anchors on own messages (1 anchor =
 *     received, 2 anchors = read)
 *   - Composer: borderless writing surface, serif italic placeholder,
 *     auto-expanding textarea up to 200px, quiet "Send →" link that
 *     appears only when content present
 *
 * Real-time architecture:
 *   - INBOX-WIDE subscription on messages INSERT: drives unread count
 *     and last-message previews live across all conversations
 *   - ACTIVE-CONVERSATION subscription on messages INSERT + on
 *     conversation_members UPDATE: drives in-thread message arrival,
 *     read-receipt anchor transitions (1 → 2), and the "Reading now"
 *     presence indicator transitions, all live
 *   - Migration realtime_add_conversation_members.sql adds the
 *     conversation_members table to the supabase_realtime publication
 *     so UPDATE events broadcast to subscribers
 *
 * Data layer is unchanged from pre-vocabulary /messages:
 *   - Same Supabase tables (conversations, conversation_members,
 *     messages, profiles), same RLS, same RPC for create/send
 *   - Same Brotherhood Pairing component (day 120+ unlock)
 *   - Same VentInput for member search
 *   - Same loading state breathing pulse
 *
 * Desktop-first. Mobile responsive tuning is tracked under SH-52.
 *
 * Tracked under SH-48 (Messages — harbor vocabulary port).
 */

// Brand system — matches home, dashboard, journal, login, register
const GOLD = "#c4934e";
const GOLD_DEEP = "#a9793d";

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
  /**
   * When the OTHER member of this conversation last opened it
   * (read it). Comes from conversation_members.last_read_at, which
   * we already update via markConversationAsRead. Null if the
   * other member has never opened this conversation. Used by the
   * thread header to surface "Reading now" / "Last read X ago" as
   * a quiet presence signal — more honest than generic app-wide
   * online status and less surveillance-y.
   */
  otherMemberLastReadAt?: string | null;
  /**
   * Count of messages from the OTHER member with created_at after
   * the current user's last_read_at on this conversation. Drives
   * the unread signal on the conversation card: gold avatar ring +
   * semibold title + "N new" count next to the date stamp.
   *
   * Computed against the recent-100-messages window we already
   * fetch — accurate up to that limit, which covers any realistic
   * unread state for an active member. Resets to 0 in local state
   * the moment the user opens the conversation; persisted via
   * markConversationAsRead on the server.
   */
  unreadCount: number;
};

type MessageItem = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

function relativeTime(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "NOW";
  if (minutes < 60) return `${minutes}M`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}H`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}D`;
  return new Date(value)
    .toLocaleDateString([], { month: "short", day: "numeric" })
    .toUpperCase();
}

export default function MessagesPage() {
  const t = useTranslations("messages");
  const locale = useLocale();
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

  // Ticking "now" for the presence indicator. ReadState derives "Reading
  // now" / "Last read X ago" from the gap between this and the other
  // member's last_read_at; computing the gap here (in render-safe state)
  // rather than calling Date.now() inside ReadState keeps that component
  // pure and lets the label advance live as time passes.
  const [now, setNow] = useState(() => Date.now());

  // Hover state for conversation cards — same pattern as the journal
  // strip's hoveredStripIdx. Drives the engraved-gold lens hairlines:
  // they sit on the active conversation by default, follow the cursor
  // while hovering, snap back on mouse-leave.
  const [hoveredConvoIdx, setHoveredConvoIdx] = useState<number | null>(null);

  // Member search collapsed by default. "+ Find a member" toggles open.
  // Resets memberSearch when closed so reopening starts fresh.
  const [searchOpen, setSearchOpen] = useState(false);

  // ───── Deferred conversation creation ─────
  //
  // When a member is selected from the search results, we DO NOT
  // immediately create a conversation row in the database. Instead,
  // we set `pendingRecipient` and render a "new message" view in the
  // right panel. The conversation is only created via the
  // create_direct_conversation RPC when the user actually sends the
  // first message.
  //
  // Why deferred: SH-64. Previous behavior created empty conversation
  // rows in `conversations` and `conversation_members` on every click
  // of a search result. Those empty conversations persisted forever
  // in both members' inboxes if the user navigated away without
  // sending — visible as "No messages yet" entries that cluttered
  // the strip and polluted the database. Standard messaging-app
  // pattern (iMessage, Signal, Telegram) is to defer creation until
  // commitment is real.
  //
  // Cleared when:
  //   - User sends a message (transitions to active conversation)
  //   - User clicks an existing conversation in the strip
  //   - User reopens search and picks a different member
  //   - User navigates away (component unmount)
  const [pendingRecipient, setPendingRecipient] = useState<Profile | null>(
    null,
  );

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Tracks whether we've already auto-selected the first conversation
  // on this mount. Ref (not state) because we want the check to be
  // synchronous and not trigger a re-render. Set to true the moment
  // loadConversations auto-selects its first conversation on initial
  // load; checked thereafter so the auto-select never re-fires from
  // a real-time subscription handler invoking loadConversations
  // again. Prevents the "page jumps to incoming conversation" bug
  // caught on 2026-06-18 smoke.
  const hasAutoSelectedRef = useRef(false);


  const activeConversation = useMemo(() => {
    return conversations.find((item) => item.id === activeConversationId);
  }, [conversations, activeConversationId]);

  // Mobile uses a Messenger-style two-screen flow: tap a conversation
  // (or a search result) to push into a full-screen thread; tap "←
  // Conversations" to pop back to the inbox. `inThreadMode` is true
  // whenever a thread or a pending-recipient new-message view should
  // occupy the screen. Tablets and above (sm: 640px+, catches iPad
  // mini portrait at 744px) ignore this — both panels render
  // side-by-side via the grid regardless.
  const inThreadMode =
    activeConversationId !== null || pendingRecipient !== null;

  // When the mobile thread overlay is up, hide the body-level
  // MobileTabBar and GlobalCrisisFooter via a body data attribute.
  // Cleaner than fighting stacking contexts with z-index — the chrome
  // simply doesn't render so the panel has the entire viewport with
  // the composer pinned at the bottom edge. Crisis access returns
  // when the user taps "← Conversations" to pop back to the inbox.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (inThreadMode) {
      document.body.dataset.mobileThreadOverlay = "true";
    } else {
      delete document.body.dataset.mobileThreadOverlay;
    }
    return () => {
      delete document.body.dataset.mobileThreadOverlay;
    };
  }, [inThreadMode]);

  const activeConvoIdx = useMemo(() => {
    return conversations.findIndex((item) => item.id === activeConversationId);
  }, [conversations, activeConversationId]);

  const highlightedConvoIdx = hoveredConvoIdx ?? activeConvoIdx;

  // breath cycle for loading + empty state
  useEffect(() => {
    const id = setInterval(() => {
      setBreathPhase((p) => (p === "inhale" ? "exhale" : "inhale"));
    }, 4000);
    return () => clearInterval(id);
  }, []);

  // advance "now" so the presence label updates without a fresh message
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
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
      .eq("consumer", "stone_harbor")
      .order("updated_at", { ascending: false });
    if (conversationError) {
      console.error("Could not load conversations:", conversationError.message);
      return;
    }
    const { data: memberRows, error: memberError } = await supabase
      .from("conversation_members")
      .select("conversation_id, user_id, last_read_at")
      .in("conversation_id", conversationIds)
      .eq("consumer", "stone_harbor");
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
        .in("id", uniqueOtherUserIds)
        .eq("consumer", "stone_harbor");
      if (error) {
        console.error("Could not load profiles:", error.message);
      }
      profiles = data ?? [];
    }
    const { data: recentMessages, error: recentMessageError } = await supabase
      .from("messages")
      // sender_id added so we can compute unreadCount per conversation
      // — we only count messages from the OTHER member as unread, not
      // our own outgoing messages.
      .select("conversation_id, body, created_at, sender_id")
      .in("conversation_id", conversationIds)
      .is("deleted_at", null)
      .eq("consumer", "stone_harbor")
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
        const otherMemberRow = memberRows?.find(
          (member) =>
            member.conversation_id === conversation.id &&
            member.user_id !== currentUserId,
        );
        const otherMemberId = otherMemberRow?.user_id;
        const otherMember =
          profiles.find((profile) => profile.id === otherMemberId) ?? null;
        const lastMessage = recentMessages?.find(
          (message) => message.conversation_id === conversation.id,
        );

        // My own last_read_at for this conversation. Falls back to
        // epoch (0) when null so "never opened" treats every message
        // from the other member as unread — which is the right
        // behavior: if you've never opened a thread that has
        // messages in it, those are unread for you.
        const myMemberRow = memberRows?.find(
          (member) =>
            member.conversation_id === conversation.id &&
            member.user_id === currentUserId,
        );
        const myLastReadTime = myMemberRow?.last_read_at
          ? new Date(myMemberRow.last_read_at).getTime()
          : 0;

        // Count messages from the OTHER member with created_at past
        // my last_read_at. Bounded by the recent-100 query window —
        // accurate for any realistic active member; capped at 100
        // for the rare case of a long backlog (in which case the
        // count just shows "100+" worth of presence without quoting
        // a specific number — we only display unreadCount > 0, not
        // the count itself, so the cap is invisible to the UX).
        const unreadCount =
          recentMessages?.filter(
            (msg) =>
              msg.conversation_id === conversation.id &&
              msg.sender_id !== currentUserId &&
              new Date(msg.created_at).getTime() > myLastReadTime,
          ).length ?? 0;

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
          otherMemberLastReadAt: otherMemberRow?.last_read_at ?? null,
          unreadCount,
        };
      }) ?? [];
    setConversations(list);

    // Auto-select the most recently updated conversation on INITIAL
    // load only. Guarded by hasAutoSelectedRef so this only fires
    // once per mount, regardless of how many times loadConversations
    // is invoked thereafter.
    //
    // Without this guard, real-time subscription handlers
    // (inbox-wide messages INSERT, active-conversation
    // conversation_members UPDATE) re-invoke loadConversations on
    // every incoming change. Those handlers close over a stale
    // `activeConversationId` from subscription-setup time, so the
    // previous `if (!activeConversationId)` check evaluates with the
    // OLD value (often null) and the auto-select re-fires —
    // causing the page to "jump" to the most recently updated
    // conversation on every received message. Real production bug,
    // caught on 2026-06-18 smoke.
    //
    // Ref-based check is synchronous and survives re-renders without
    // triggering one, so it works correctly even when called from
    // within a stale closure.
    if (!hasAutoSelectedRef.current && list.length > 0) {
      hasAutoSelectedRef.current = true;
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
      .eq("consumer", "stone_harbor")
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
      .eq("consumer", "stone_harbor")
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
    // Deferred-creation pattern (SH-64): selecting a member from the
    // search results does NOT create a conversation row anymore. We
    // just stash the recipient and let the right panel render a
    // "new message" compose view. The conversation only gets created
    // when sendMessage fires for the first time (see sendMessage
    // below for the create_direct_conversation call).
    //
    // This prevents the "empty conversation" entries that used to
    // pollute both members' inboxes whenever a search-result click
    // was accidental or abandoned.
    const recipient = memberResults.find((m) => m.id === otherUserId);
    if (!recipient) {
      // Defensive: shouldn't happen (we only call startConversation
      // from search-result onClicks where the member is in scope),
      // but if memberResults has been cleared mid-click we'd rather
      // bail than crash.
      return;
    }
    setPendingRecipient(recipient);
    // Important: clear activeConversationId so the right panel
    // renders the "new message" view instead of an old thread.
    setActiveConversationId(null);
    setMemberSearch("");
    setMemberResults([]);
    setSearchOpen(false);
  }

  async function sendMessage(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!messageBody.trim()) return;

    setSending(true);

    // Resolve the conversation we're sending into. Two paths:
    //
    //   1. EXISTING conversation — activeConversationId is set, just
    //      use it.
    //
    //   2. NEW conversation via deferred-creation (SH-64) —
    //      pendingRecipient is set, activeConversationId is null. We
    //      call create_direct_conversation NOW (not at search-click
    //      time) and use the returned id for the send. This is the
    //      moment the conversation actually comes into being; if the
    //      send fails afterward we have a real-but-empty conversation
    //      that the next message will populate (acceptable). If RPC
    //      returns an existing conversation for this recipient pair
    //      (idempotent on the server side), that's fine too — we just
    //      land in the existing thread.
    let conversationId = activeConversationId;

    if (!conversationId && pendingRecipient) {
      const { data: createdId, error: createError } = await supabase.rpc(
        "create_direct_conversation",
        { other_user_id: pendingRecipient.id },
      );
      if (createError) {
        fail(createError.message);
        setSending(false);
        return;
      }
      conversationId = createdId as string;
    }

    if (!conversationId) {
      // No active conversation and no pending recipient — nothing to
      // send into. Shouldn't happen because the composer is only
      // rendered when one of those is true, but defensive.
      setSending(false);
      return;
    }

    const { error: sendError } = await supabase.rpc("send_message", {
      conversation_uuid: conversationId,
      message_body: messageBody,
    });
    if (sendError) {
      fail(sendError.message);
      setSending(false);
      return;
    }

    setMessageBody("");

    // If this was a deferred-creation flow, transition from pending
    // into the active conversation. After this the thread reads as a
    // normal active thread; the "new message" view goes away.
    if (pendingRecipient) {
      setPendingRecipient(null);
      setActiveConversationId(conversationId);
    }

    await loadMessages(conversationId, true);
    if (userId) {
      await loadConversations(userId);
    }
    setSending(false);
  }

  // Time-only stamp for individual messages. With date grouping above
  // each cluster, the date is redundant in the per-message timestamp;
  // showing just "9:32 PM" reads cleaner.
  function formatTimeOnly(value: string) {
    return new Date(value).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  // Date group label — "TODAY" / "YESTERDAY" / localized "FRI 13 JUN".
  // Used by the DateSeparator that sits above each calendar-day
  // cluster of messages. Locale-aware via the next-intl locale, with
  // English/Spanish day + month abbreviations falling out of Intl.
  function formatDateGroup(value: string): string {
    const date = new Date(value);
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    if (date >= startOfToday) return t("today");
    if (date >= startOfYesterday) return t("yesterday");

    return date
      .toLocaleDateString(locale === "es" ? "es-ES" : "en-US", {
        weekday: "short",
        day: "numeric",
        month: "short",
      })
      .toUpperCase()
      .replace(/,/g, "");
  }

  // Group consecutive messages by calendar date for the cluster view.
  // useMemo because messages can be long lists and grouping runs on
  // every render otherwise. Resets whenever the underlying messages
  // array changes (new arrival, conversation switch).
  const groupedMessages = useMemo(() => {
    const groups: Array<{ dateKey: string; items: MessageItem[] }> = [];
    for (const message of messages) {
      const dateKey = formatDateGroup(message.created_at);
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.dateKey === dateKey) {
        lastGroup.items.push(message);
      } else {
        groups.push({ dateKey, items: [message] });
      }
    }
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, locale]);

  useEffect(() => {
    loadPage();
  }, []);

  // ───── Inbox-wide subscription ─────
  //
  // Listens for INSERT events on the `messages` table across ALL
  // conversations the current user is a member of. RLS on the table
  // (already in place) restricts the broadcast to messages we can
  // SELECT — which means we only receive events for our own
  // conversations, even though there's no explicit filter here.
  //
  // The handler just refreshes loadConversations, which recomputes
  // unread counts, updates the last-message preview, and updates
  // the relative timestamp on each card. That makes idle
  // conversations on the strip light up the moment a new message
  // arrives, without the user having to refresh.
  //
  // The PER-ACTIVE-CONVERSATION subscription below handles the
  // extra concerns specific to the open thread (loadMessages for
  // the chat history, conversation_members UPDATE for read
  // receipts). Both subscriptions coexist; the active one is
  // narrower and does more, the global one is broader and does
  // less. There's a small redundancy when a new message arrives
  // in the active conversation (both subscriptions fire), but the
  // resulting double-refresh is harmless and barely measurable.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`messages-inbox-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        async () => {
          await loadConversations(userId);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!activeConversationId) return;
    loadMessages(activeConversationId, true);
    const channel = supabase
      .channel(`messages-${activeConversationId}`)
      // Real-time INSERT on messages — drives the live arrival of new
      // messages in the active thread. The inbox-wide subscription
      // above already triggers loadConversations on any new message
      // (so the strip stays fresh), so this handler focuses on the
      // active-thread-specific concern: pulling the new message into
      // the visible chat history and marking it read.
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
      // Real-time UPDATE on conversation_members — drives the live
      // refresh of read state. When the OTHER member opens the active
      // conversation, their last_read_at updates on the server but no
      // message is inserted; without this subscription our 2-anchor
      // read receipt and "Reading now" presence indicator would
      // remain stale until the next INSERT-triggered refresh.
      // Reloading conversations picks up the new last_read_at for
      // both signals (otherMemberLastReadAt feeds the thread header
      // presence + the per-message read anchor logic).
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversation_members",
          filter: `conversation_id=eq.${activeConversationId}`,
        },
        async () => {
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

  // STYLED LOADING — breathing pulse, matches dashboard/journal.
  //
  // Using min-h-screen instead of h-full because during the Next.js
  // route transition from /dashboard the parent layout's height isn't
  // fully resolved at the moment this render fires. With h-full the
  // wrapper would collapse to natural content height, sticking the
  // breathing pulse to the top of the viewport. min-h-screen references
  // the viewport directly so the centering math works regardless of
  // parent state. Caught 2026-06-18 during hotfix smoke.
  if (loading) {
    return (
      <main
        className={`${sans.className} flex min-h-screen items-center justify-center bg-[var(--sh-bg-page)]`}
      >
        <div className="flex flex-col items-center">
          <motion.div
            animate={{ scale: [1, 1.18, 1], opacity: [0.6, 0.95, 0.6] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="h-24 w-24 rounded-full border border-[var(--sh-accent-gold-dusk)]/30"
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
      className={`${sans.variable} ${serif.variable} relative flex h-full w-full flex-col overflow-y-auto text-[var(--sh-text-primary)]`}
    >
      <InactivityGate />

      <div className="relative z-10 mx-auto flex w-full max-w-[1440px] flex-col">
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
              {t("brandCrumb")}
            </span>
          </Link>
        </header>

        {/* ===== Anchor strip =====
            "BROTHERHOOD" + serif title + privacy line. Same pattern as
            other harbor surfaces. The privacy sub-line is the trust
            signal Brotherhood specifically needs upfront — members
            need to know nothing here is displayed anywhere else.
            Hidden on mobile when the member is inside a thread so the
            composer has the vertical real estate. Always visible at
            md: and above, and on mobile when on the inbox screen. */}
        <section
          className={`flex-shrink-0 flex-col items-center border-b border-[var(--sh-border-subtle)] px-4 py-6 sm:flex sm:px-10 sm:py-8 ${
            inThreadMode ? "hidden" : "flex"
          }`}
        >
          <p
            className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--sh-accent-gold)]`}
          >
            {t("centeredEyebrow")}
          </p>
          <p
            className={`${serif.className} mt-2 text-[24px] italic font-medium tracking-[-0.01em]`}
          >
            {t("centeredTitle")}
          </p>
          <p
            className={`${sans.className} mt-3 flex items-center gap-2 text-[11px] tracking-[0.06em] text-[var(--sh-text-tertiary)]`}
          >
            <Lock size={12} className="text-[var(--sh-text-tertiary)]" />
            {t("centeredPrivacy")}
          </p>
        </section>

        {/* ===== Brotherhood Pairing tile — day 120 unlock =====
            Wider than the two-column grid below (max-w-[920px]) so it
            reads as a feature panel — matches the dashboard "Story to
            Tell" treatment for important cards. Preserves the existing
            BrotherhoodPairing component as-is. */}
        {userId &&
          isFeatureUnlocked(
            userCreatedAt,
            FEATURE_THRESHOLDS.brotherhoodPairing,
          ) && (
            <div className="mx-auto w-full max-w-[920px] px-10 pt-8">
              <BrotherhoodPairing userId={userId} />
            </div>
          )}

        {/* ===== Two-column grid =====
            Inside max-w-[1200px] container. Left column ~420px
            (conversations strip + search toggle), right column flex-1
            (active thread or empty state). Both columns max-h-[640px]
            so they don't push the horizon mark off screen on shorter
            viewports. */}
        <section className="flex flex-1 flex-col items-center px-4 py-6 sm:px-10 sm:py-10">
          {/* Grid switches to two-column at md: instead of lg: — the
              old lg: breakpoint meant tablets in portrait fell back to
              a stacked single-column render (acknowledged as poorly
              considered in the SH-52 closure). Mobile now uses
              Messenger-style two-screen navigation: exactly one panel
              visible at a time, swap on tap. */}
          <div className="grid w-full max-w-[1200px] gap-0 sm:grid-cols-[0.36fr_0.64fr]">
            {/* LEFT — Conversations strip + search toggle.
                On mobile this IS the inbox screen and fills the
                viewport. md:border-r adds the thin vertical divider
                between the conversations pane and the active thread
                on desktop only — on mobile there's no second panel
                visible to divide from, and the trailing edge would
                read as a stray line. Inner md:pr-8 likewise applies
                only on desktop. Hidden on mobile when inside a thread. */}
            <aside
              className={`flex-col gap-6 sm:flex sm:border-r sm:border-[var(--sh-border-subtle)] sm:pr-8 ${
                inThreadMode ? "hidden" : "flex"
              }`}
            >
              <div className="flex items-center justify-between">
                <p
                  className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--sh-text-tertiary)]`}
                >
                  {t("conversationsEyebrow")}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchOpen((open) => !open);
                    if (searchOpen) {
                      setMemberSearch("");
                      setMemberResults([]);
                    }
                  }}
                  style={{ outline: "none", outlineOffset: 0 }}
                  className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.26em] text-[var(--sh-accent-gold)] transition-colors hover:text-[var(--sh-accent-gold-bright)]`}
                >
                  {searchOpen ? t("closeSearch") : t("findMemberShort")}
                </button>
              </div>

              {/* Member search — collapsed by default. The "+ Find a
                  member" link toggles it. When open, search field +
                  results render here above the conversations list. */}
              {searchOpen && (
                <div className="flex flex-col gap-3">
                  <VentInput
                    value={memberSearch}
                    onChange={(e) => searchMembers(e.target.value)}
                    placeholder={t("inbox.searchPlaceholder")}
                  />
                  {searching && (
                    <div
                      className={`px-4 py-3 text-[12px] text-[var(--sh-text-tertiary)] ${
                        isDusk
                          ? "border border-white/10 bg-white/[0.03]"
                          : "border border-[var(--sh-border-subtle)] bg-[var(--sh-bg-elevated)]"
                      }`}
                    >
                      {t("inbox.searching")}
                    </div>
                  )}
                  {searchError && (
                    <div className="border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-700">
                      {t("inbox.searchError", { error: searchError })}
                    </div>
                  )}
                  {memberResults.length > 0 && (
                    <div
                      className={`flex max-h-72 flex-col overflow-y-auto ${
                        isDusk
                          ? "border border-white/10 bg-[#1a1614]"
                          : "border border-[var(--sh-border-medium)] bg-[var(--sh-bg-card-tinted)]"
                      }`}
                    >
                      {memberResults.map((member) => (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() => startConversation(member.id)}
                          className={`flex w-full items-center gap-3 border-b px-3 py-3 text-left transition last:border-b-0 ${
                            isDusk
                              ? "border-white/5 hover:bg-white/[0.05]"
                              : "border-[var(--sh-border-subtle)] hover:bg-[var(--sh-bg-elevated)]"
                          }`}
                        >
                          <Avatar profile={member} size="sm" />
                          <div className="min-w-0">
                            <p
                              className={`${serif.className} truncate text-[14px] italic text-[var(--sh-text-primary)]`}
                            >
                              {member.display_name ||
                                member.username ||
                                member.email ||
                                t("inbox.memberFallback")}
                            </p>
                            <p className="truncate text-[11px] text-[var(--sh-text-tertiary)]">
                              {member.username
                                ? `@${member.username}`
                                : member.email}
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
                      <div className="px-4 py-3 text-[12px] text-[var(--sh-text-tertiary)]">
                        {t("inbox.noMembersFound")}
                      </div>
                    )}
                </div>
              )}

              {/* Conversations strip — journal-entry geometry per card. */}
              {conversations.length === 0 ? (
                <div className="flex flex-col items-start gap-3 pt-4">
                  <p
                    className={`${serif.className} text-[18px] italic text-[var(--sh-text-secondary)]`}
                  >
                    {t("strip.noneYet")}
                  </p>
                  <p
                    className={`${sans.className} text-[12px] leading-relaxed text-[var(--sh-text-tertiary)]`}
                  >
                    {t("strip.reachOut")}
                  </p>
                </div>
              ) : (
                <div
                  className="flex flex-col gap-2"
                  onMouseLeave={() => setHoveredConvoIdx(null)}
                >
                  {conversations.map((convo, i) => (
                    <button
                      key={convo.id}
                      type="button"
                      onClick={() => {
                        // Clear any pending recipient (SH-64) — if the
                        // member was composing a brand-new message via
                        // the deferred-creation flow and clicked an
                        // existing conversation instead, we abandon the
                        // new-message draft. No DB write ever happened.
                        setPendingRecipient(null);
                        setActiveConversationId(convo.id);
                        // Optimistic: zero unread immediately in local
                        // state so the gold ring + count disappear on
                        // click. The server-side markConversationAsRead
                        // (inside loadMessages) persists it; the next
                        // loadConversations would naturally compute 0
                        // unread anyway. This just keeps the UI
                        // honest in the half-second between click and
                        // refresh.
                        setConversations((prev) =>
                          prev.map((c) =>
                            c.id === convo.id ? { ...c, unreadCount: 0 } : c,
                          ),
                        );
                        void loadMessages(convo.id, true);
                      }}
                      onMouseEnter={() => setHoveredConvoIdx(i)}
                      style={{ outline: "none", outlineOffset: 0 }}
                      className="flex-shrink-0 text-left transition-colors"
                    >
                      <ConversationCard
                        convo={convo}
                        active={i === highlightedConvoIdx}
                        theme={theme}
                        t={t}
                      />
                    </button>
                  ))}
                </div>
              )}
            </aside>

            {/* RIGHT — Active thread or empty state. md:pl-8 balances
                the left pane's md:pr-8 so the divider sits visually
                centered in the gap on desktop. Mobile drops the
                padding (the panel IS the screen there) and hides
                this column entirely when no thread is active — the
                inbox panel is the mobile landing view, not the empty
                state.
                On mobile when in thread mode the panel is lifted
                out of normal flow as a `fixed inset-0` overlay so
                back link + thread header + composer stay pinned to
                the viewport while the messages list scrolls between
                them. Same pattern Messenger and iMessage use. */}
            <div
              className={`flex-col gap-5 sm:flex sm:pl-8 sm:relative sm:inset-auto sm:z-auto sm:h-auto sm:overflow-visible sm:bg-transparent sm:px-0 sm:pt-0 sm:pb-0 ${
                inThreadMode
                  ? "fixed inset-x-0 top-0 bottom-[var(--sh-mobile-crisis-h,140px)] z-50 flex overflow-hidden bg-[var(--sh-bg-page)] px-4 pb-4 pt-4"
                  : "hidden sm:flex"
              }`}
            >
              {/* Mobile-only back affordance — quiet gold uppercase
                  link that clears both activeConversationId and
                  pendingRecipient so the user pops back to the inbox.
                  Hidden on desktop where both panels are visible
                  side-by-side and back navigation isn't needed. */}
              <button
                type="button"
                onClick={() => {
                  setActiveConversationId(null);
                  setPendingRecipient(null);
                }}
                style={{ outline: "none", outlineOffset: 0 }}
                className={`${sans.className} flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--sh-accent-gold)] transition-colors hover:text-[var(--sh-accent-gold-bright)] sm:hidden`}
              >
                ← {t("backToConversations")}
              </button>
              {activeConversation ? (
                <>
                  {/* Thread header — avatar + eyebrow + name + read-state.
                      The read-state line surfaces a quiet presence
                      signal under the name: a soft moss-green dot +
                      "Reading now" when the other member has opened
                      this conversation within the last 5 minutes,
                      "Last read X ago" otherwise, "Hasn't opened this
                      yet" if they've never read it. Sourced from
                      conversation_members.last_read_at — the same
                      column markConversationAsRead updates. More
                      honest and less surveillance-y than app-wide
                      online status: it tells you about THIS
                      conversation specifically. */}
                  <div className="flex items-center gap-4 border-b border-[var(--sh-border-subtle)] pb-4">
                    <Avatar profile={activeConversation.otherMember ?? null} />
                    <div className="flex flex-col gap-1">
                      <p
                        className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--sh-accent-gold)]`}
                      >
                        {t("thread.eyebrow")}
                      </p>
                      <h2
                        className={`${serif.className} text-[26px] italic font-medium leading-tight text-[var(--sh-text-primary)] md:text-[30px]`}
                      >
                        {activeConversation.title}
                      </h2>
                      <ReadState
                        lastReadAt={activeConversation.otherMemberLastReadAt}
                        now={now}
                        t={t}
                      />
                    </div>
                  </div>

                  {/* Messages — centered max-w-[720px] reading column.
                      Body scrolls within a flex container; mask-fade
                      at the top so the most recent messages sit
                      against a clean horizon. Own messages = gold bg
                      right-aligned, others = subtle bg left-aligned. */}
                  <div
                    className="relative flex min-h-0 flex-1 flex-col overflow-y-auto pr-2 sm:min-h-[420px]"
                    style={{
                      scrollbarWidth: "none",
                      WebkitMaskImage:
                        "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.45) 8%, rgba(0,0,0,0.85) 18%, black 30%, black 100%)",
                      maskImage:
                        "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.45) 8%, rgba(0,0,0,0.85) 18%, black 30%, black 100%)",
                    }}
                  >
                    {messages.length === 0 ? (
                      <div className="flex h-full items-center justify-center pt-12">
                        <div className="max-w-md text-center">
                          <p
                            className={`${serif.className} text-[22px] italic text-[var(--sh-text-secondary)]`}
                          >
                            {t("thread.noMessagesTitle")}
                          </p>
                          <p
                            className={`${sans.className} mt-2 text-[12px] leading-relaxed text-[var(--sh-text-tertiary)]`}
                          >
                            {t("thread.noMessagesSub")}
                          </p>
                        </div>
                      </div>
                    ) : (
                      /* Letter-style message display — no bubbles.
                         Messages are grouped by calendar date; a thin
                         gold rule + date label sits above each cluster
                         instead of between individual messages.

                         Each message:
                           - Sender label (small uppercase gold)
                           - Body text (serif italic, full reading width)
                           - Time + read indicator (small uppercase)
                           Own messages indent right ~32px, body right-
                           aligned. Others align left, body left-aligned.

                         Read receipts: own messages whose created_at is
                         at-or-before the other member's last_read_at
                         get a quiet "· read" italic suffix next to their
                         time stamp. Unread own messages show only the
                         time — the absence of "read" is the signal,
                         which keeps unread state visually neutral. */
                      <div className="mx-auto mt-auto flex w-full max-w-[720px] flex-col gap-5 pt-6">
                        {/* Date separator sits BELOW each cluster, not
                            above. The date reads as a closing mark for
                            the messages that just passed ("those
                            happened on Friday") rather than a heading
                            ("on Friday, these things happened"). When
                            the thread is auto-scrolled to the bottom
                            (default state), the most recent date label
                            ends up at the foot of the visible view —
                            a quiet bookmark of where you are in time
                            rather than a banner above the conversation. */}
                        {groupedMessages.map((group) => (
                          <Fragment key={group.dateKey}>
                            {group.items.map((message) => {
                              const isMine =
                                message.sender_id === userId;
                              const senderLabel = isMine
                                ? t("you")
                                : activeConversation.title;
                              const isRead =
                                isMine &&
                                activeConversation.otherMemberLastReadAt !=
                                  null &&
                                new Date(
                                  activeConversation.otherMemberLastReadAt,
                                ).getTime() >=
                                  new Date(message.created_at).getTime();
                              return (
                                <div
                                  key={message.id}
                                  className={`flex flex-col gap-1.5 ${
                                    isMine
                                      ? "items-end pl-8"
                                      : "items-start pr-8"
                                  }`}
                                >
                                  {/* Sender row.
                                      Their messages: avatar bubble +
                                      name. The Avatar component falls
                                      back to the brand anchor icon
                                      when the member has no avatar_url
                                      — same default as everywhere else
                                      in the app.
                                      Own messages: just "YOU" — no
                                      avatar. You know it's you; the
                                      right-indent + the read receipt
                                      anchors already mark these as
                                      yours. Adding your avatar to
                                      your own messages would be
                                      redundant visual chrome. */}
                                  {isMine ? (
                                    <p
                                      className={`${sans.className} text-[9px] font-semibold uppercase tracking-[0.32em] text-[var(--sh-accent-gold)]`}
                                    >
                                      {senderLabel}
                                    </p>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <Avatar
                                        profile={
                                          activeConversation.otherMember ??
                                          null
                                        }
                                        size="xs"
                                      />
                                      <p
                                        className={`${sans.className} text-[9px] font-semibold uppercase tracking-[0.32em] text-[var(--sh-accent-gold)]`}
                                      >
                                        {senderLabel}
                                      </p>
                                    </div>
                                  )}
                                  <p
                                    className={`${serif.className} whitespace-pre-wrap text-[15px] italic leading-[1.65] text-[var(--sh-text-primary)] ${
                                      isMine ? "text-right" : "text-left"
                                    }`}
                                  >
                                    {message.body}
                                  </p>
                                  <p
                                    className={`${sans.className} flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.28em] text-[var(--sh-text-tertiary)]`}
                                  >
                                    <span>
                                      {formatTimeOnly(message.created_at)}
                                    </span>
                                    {/* Status indicator — only on own
                                        messages. The anchor is Stone
                                        Harbor's brand mark, here doing
                                        double duty as a delivery /
                                        read signal:
                                          1 anchor  → received (in the
                                                      harbor, sent ok)
                                          2 anchors → read by the
                                                      other member
                                        Both gold. The second anchor
                                        materializes when their
                                        last_read_at advances past
                                        this message's created_at.
                                        WhatsApp's two checks for our
                                        product — same affordance,
                                        Harbor Voice. */}
                                    {isMine && (
                                      <span
                                        className="inline-flex items-center gap-0.5 text-[var(--sh-accent-gold)]"
                                        aria-label={
                                          isRead
                                            ? t("readMark")
                                            : t("sentMark")
                                        }
                                      >
                                        <AnchorIcon
                                          size={9}
                                          strokeWidth={1.6}
                                          aria-hidden="true"
                                        />
                                        {isRead && (
                                          <AnchorIcon
                                            size={9}
                                            strokeWidth={1.6}
                                            aria-hidden="true"
                                          />
                                        )}
                                      </span>
                                    )}
                                  </p>
                                </div>
                              );
                            })}
                            <DateSeparator label={group.dateKey} />
                          </Fragment>
                        ))}
                        <div ref={messagesEndRef} />
                      </div>
                    )}
                  </div>

                  {/* Composer — borderless writing surface.
                      No border, no bg, no input-box chrome. The
                      textarea reads as writing on a page, with serif
                      italic for both placeholder and body text. Same
                      vocabulary as /journal compose. Auto-expands as
                      the member types (up to a 200px ceiling, then
                      scrolls internally). The "Send →" link appears
                      only when there's content — no empty-form button
                      to interrupt the calm. A thin hairline above
                      separates compose from the conversation history. */}
                  <form
                    onSubmit={sendMessage}
                    className="border-t border-[var(--sh-border-subtle)] pt-6"
                  >
                    <div className="mx-auto w-full max-w-[720px]">
                      <textarea
                        value={messageBody}
                        onChange={(e) => {
                          setMessageBody(e.target.value);
                          // Auto-resize: shrink to scrollHeight, capped.
                          const ta = e.currentTarget;
                          ta.style.height = "auto";
                          ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
                        }}
                        placeholder={t("thread.composePlaceholder")}
                        rows={1}
                        className={`${serif.className} w-full resize-none bg-transparent text-[15px] italic leading-[1.65] text-[var(--sh-text-primary)] placeholder:italic placeholder:text-[var(--sh-text-muted)]`}
                        style={{
                          outline: "none",
                          outlineOffset: 0,
                          minHeight: "26px",
                        }}
                      />
                      {messageBody.trim().length > 0 && (
                        <div className="mt-4 flex items-center justify-end gap-3">
                          {sending && (
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
                              className="h-1.5 w-1.5 rounded-full bg-[var(--sh-accent-gold)]"
                            />
                          )}
                          <button
                            type="submit"
                            disabled={sending}
                            style={{ outline: "none", outlineOffset: 0 }}
                            className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.26em] text-[var(--sh-accent-gold)] transition-colors hover:text-[var(--sh-accent-gold-bright)] disabled:opacity-50`}
                          >
                            {sending ? t("thread.sending") : `${t("thread.send")} →`}
                          </button>
                        </div>
                      )}
                    </div>
                  </form>
                </>
              ) : pendingRecipient ? (
                /* New message view — deferred-creation (SH-64).
                   Member picked a recipient from search but no
                   conversation row exists yet. We render:
                     - Thread header with recipient's avatar + name
                       and a "NEW MESSAGE" eyebrow (distinct from the
                       "CONVERSATION" eyebrow on existing threads)
                     - An empty body area with a quiet invitation to
                       write the first message
                     - The standard composer
                   The conversation only gets created when sendMessage
                   fires (see sendMessage's create_direct_conversation
                   branch). If the user clicks an existing conversation
                   or another search result, pendingRecipient clears
                   and no DB write ever happened. */
                <>
                  <div className="flex items-center gap-4 border-b border-[var(--sh-border-subtle)] pb-4">
                    <Avatar profile={pendingRecipient} />
                    <div className="flex flex-col gap-1">
                      <p
                        className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--sh-accent-gold)]`}
                      >
                        {t("thread.newMessageEyebrow")}
                      </p>
                      <h2
                        className={`${serif.className} text-[26px] italic font-medium leading-tight text-[var(--sh-text-primary)] md:text-[30px]`}
                      >
                        {pendingRecipient.display_name ||
                          pendingRecipient.username ||
                          pendingRecipient.email ||
                          t("inbox.memberFallback")}
                      </h2>
                    </div>
                  </div>

                  <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-6 text-center sm:p-10">
                    <p
                      className={`${serif.className} max-w-md text-[18px] italic leading-relaxed text-[var(--sh-text-tertiary)]`}
                    >
                      {t("thread.newMessageInvitation", {
                        name:
                          pendingRecipient.display_name ||
                          pendingRecipient.username ||
                          t("inbox.memberFallback"),
                      })}
                    </p>
                  </div>

                  {/* Composer — same shape as the active thread's
                      composer. sendMessage handles the
                      pendingRecipient → create_direct_conversation
                      transition transparently. */}
                  <form
                    onSubmit={sendMessage}
                    className="border-t border-[var(--sh-border-subtle)] pt-6"
                  >
                    <div className="mx-auto w-full max-w-[720px]">
                      <textarea
                        value={messageBody}
                        onChange={(e) => {
                          setMessageBody(e.target.value);
                          const ta = e.currentTarget;
                          ta.style.height = "auto";
                          ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
                        }}
                        placeholder={t("thread.composePlaceholder")}
                        rows={1}
                        className={`${serif.className} w-full resize-none bg-transparent text-[15px] italic leading-[1.65] text-[var(--sh-text-primary)] placeholder:italic placeholder:text-[var(--sh-text-muted)]`}
                        style={{
                          outline: "none",
                          outlineOffset: 0,
                          minHeight: "26px",
                        }}
                      />
                      {messageBody.trim().length > 0 && (
                        <div className="mt-4 flex items-center justify-end gap-3">
                          {sending && (
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
                              className="h-1.5 w-1.5 rounded-full bg-[var(--sh-accent-gold)]"
                            />
                          )}
                          <button
                            type="submit"
                            disabled={sending}
                            style={{ outline: "none", outlineOffset: 0 }}
                            className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.26em] text-[var(--sh-accent-gold)] transition-colors hover:text-[var(--sh-accent-gold-bright)] disabled:opacity-50`}
                          >
                            {sending
                              ? t("thread.sending")
                              : `${t("thread.send")} →`}
                          </button>
                        </div>
                      )}
                    </div>
                  </form>
                </>
              ) : (
                /* Empty state — breath circle + serif italic prompt.
                   Preserved from production; the only thing that's
                   different is the typography rhythm to match the
                   surrounding harbor vocabulary. */
                <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
                  <motion.div
                    animate={{
                      scale: breathPhase === "inhale" ? 1.25 : 1,
                      opacity: breathPhase === "inhale" ? 0.95 : 0.55,
                    }}
                    transition={{ duration: 4, ease: "easeInOut" }}
                    className="mb-10 flex h-28 w-28 items-center justify-center rounded-full border border-[var(--sh-accent-gold-dusk)]/40"
                    style={{
                      background:
                        "radial-gradient(circle, rgba(196,147,78,0.20) 0%, rgba(196,147,78,0.04) 70%, transparent 100%)",
                    }}
                  >
                    <span
                      className={`${serif.className} text-sm italic text-[var(--sh-accent-gold-sunlit)]`}
                    >
                      {breathPhase === "inhale"
                        ? t("empty.inhale")
                        : t("empty.exhale")}
                    </span>
                  </motion.div>
                  <p
                    className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--sh-accent-gold)]`}
                  >
                    {t("empty.eyebrow")}
                  </p>
                  <h2
                    className={`${serif.className} mt-4 max-w-md text-[28px] italic font-medium leading-snug text-[var(--sh-text-primary)] md:text-[32px]`}
                  >
                    {t("empty.headline")}
                  </h2>
                  <p
                    className={`${sans.className} mt-4 max-w-md text-[13px] leading-relaxed text-[var(--sh-text-secondary)]`}
                  >
                    {t("empty.sub")}
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ===== Horizon mark + voice signature ===== */}
        <MessagesHorizonMark voiceSignature={t("voiceSignature")} />
      </div>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </main>
  );
}

// ============================================================================
// Components
// ============================================================================

/**
 * ReadState — quiet presence signal below the conversation name.
 *
 * Three modes:
 *   - "Reading now" — soft moss-green dot + label, when the other
 *     member's last_read_at is within the last 5 minutes
 *   - "Last read X ago" — muted, when read longer ago
 *   - "Hasn't opened this yet" — italic muted, when last_read_at is
 *     null (never opened)
 *
 * Conversation-specific by design: this tells you about THIS exchange,
 * not generic app-wide availability. More honest than a global online
 * dot, and aligns with Stone Harbor's no-surveillance ethos.
 *
 * The moss-green dot uses #586558 — the brand's moss palette, not a
 * generic green — so the presence signal stays inside the harbor's
 * visual vocabulary.
 */
function ReadState({
  lastReadAt,
  now,
  t,
}: {
  lastReadAt: string | null | undefined;
  now: number;
  t: (key: string, values?: Record<string, string>) => string;
}) {
  if (!lastReadAt) {
    return (
      <p
        className={`${sans.className} text-[11px] italic text-[var(--sh-text-tertiary)]`}
      >
        {t("hasntRead")}
      </p>
    );
  }

  const diffMs = now - new Date(lastReadAt).getTime();
  const minutes = Math.floor(diffMs / 60000);
  const readingNow = minutes < 5;

  // Human relative time for the "last read X ago" label. We use a
  // gentler format than the inbox card's relativeTime (which abbreviates
  // to "3M" / "2H" / "1D") — here we want "5 minutes ago" / "2 hours ago",
  // language-readable in a sentence.
  function humanAgo(): string {
    if (minutes < 1) return t("justNow");
    if (minutes < 60) return t("minutesAgo", { count: String(minutes) });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t("hoursAgo", { count: String(hours) });
    const days = Math.floor(hours / 24);
    if (days < 7) return t("daysAgo", { count: String(days) });
    return t("longAgo");
  }

  if (readingNow) {
    return (
      <p
        className={`${sans.className} flex items-center gap-1.5 text-[11px] text-[var(--sh-text-secondary)]`}
      >
        <span
          aria-hidden="true"
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{
            backgroundColor: "#586558",
            boxShadow: "0 0 6px rgba(88,101,88,0.6)",
          }}
        />
        {t("readingNow")}
      </p>
    );
  }

  return (
    <p
      className={`${sans.className} text-[11px] text-[var(--sh-text-tertiary)]`}
    >
      {t("lastRead", { time: humanAgo() })}
    </p>
  );
}

/**
 * DateSeparator — sits above each calendar-day cluster of messages.
 *
 * A thin gold rule on either side flanks the centered date label
 * ("TODAY" / "YESTERDAY" / "FRI 13 JUN"). Replaces the per-message
 * hairlines from the earlier preview: instead of dividing every
 * exchange, we divide by day — which is how people remember
 * conversations ("we talked on Tuesday") rather than per-message.
 *
 * The gradient rules fade at the outer ends so they don't read as
 * hard horizontal lines crossing the page; they recede into the
 * reading column the way the harbor's other engraved-gold marks do.
 */
function DateSeparator({ label }: { label: string }) {
  const { theme } = useTheme();
  const goldRgb = theme === "sunlit" ? "169,121,61" : "196,147,78";
  const alphaInner = theme === "sunlit" ? 0.9 : 0.75;
  const alphaMid = theme === "sunlit" ? 0.45 : 0.35;
  const lineShadow =
    theme === "sunlit"
      ? "0 0.5px 0 rgba(60,40,15,0.18)"
      : "0 0 4px rgba(196,147,78,0.25)";

  return (
    <div className="flex items-center justify-center gap-3 py-2">
      <div
        aria-hidden="true"
        className="h-px flex-1"
        style={{
          background: `linear-gradient(to right, transparent 0%, rgba(${goldRgb},${alphaMid}) 50%, rgba(${goldRgb},${alphaInner}) 100%)`,
          boxShadow: lineShadow,
        }}
      />
      <span
        className={`${sans.className} text-[9px] font-semibold uppercase tracking-[0.32em] text-[var(--sh-text-tertiary)]`}
      >
        {label}
      </span>
      <div
        aria-hidden="true"
        className="h-px flex-1"
        style={{
          background: `linear-gradient(to right, rgba(${goldRgb},${alphaInner}) 0%, rgba(${goldRgb},${alphaMid}) 50%, transparent 100%)`,
          boxShadow: lineShadow,
        }}
      />
    </div>
  );
}

function Avatar({
  profile,
  size = "md",
  ringVariant = "default",
}: {
  profile: Profile | null;
  /**
   * "xs" — 20px inline bubble next to message sender labels.
   * "sm" — 36px in conversation list cards and member search results.
   * "md" — 44px in the active thread header.
   */
  size?: "xs" | "sm" | "md";
  /**
   * "default" — the standard subtle border every Avatar uses.
   * "gold" — gold accent border, used on conversation cards to
   * signal unread messages from the other member.
   */
  ringVariant?: "default" | "gold";
}) {
  const sizeClass =
    size === "xs" ? "h-5 w-5" : size === "sm" ? "h-9 w-9" : "h-11 w-11";
  const iconSize = size === "xs" ? 11 : size === "sm" ? 16 : 20;
  const borderClass =
    ringVariant === "gold"
      ? "border-[1.5px] border-[var(--sh-accent-gold)]"
      : "border border-[var(--sh-border-subtle)]";
  return (
    <div
      className={`flex ${sizeClass} shrink-0 items-center justify-center overflow-hidden rounded-full ${borderClass} bg-[#efe8dc]`}
    >
      {profile?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={profile.avatar_url}
          alt={`${profile.display_name ?? "Member"} avatar`}
          className="h-full w-full object-cover"
        />
      ) : (
        <AnchorIcon size={iconSize} strokeWidth={1.4} className="text-[var(--sh-accent-gold-sunlit)]" />
      )}
    </div>
  );
}

/**
 * Conversation card on the left strip.
 *
 * Geometry: same fixed dimensions and padding as journal entries on
 * /journal (px-3.5 py-3, no border, hover bg-tint). Each card carries:
 *   - Avatar + gold dot at top, with date stamp (relative)
 *   - Serif italic name (truncate)
 *   - Sans tagline = last message preview (line-clamp-2)
 *   - Active/hovered → HairlineLens top + bottom (engraved-gold)
 *
 * Active state is driven by the parent's highlightedConvoIdx ?? active
 * pattern — same hover-follows-cursor behavior as the journal strip.
 */
function ConversationCard({
  convo,
  active,
  theme,
  t,
}: {
  convo: ConversationListItem;
  active: boolean;
  theme: "sunlit" | "dusk";
  /** next-intl translator from useTranslations("messages"). Needed
   *  here so the card can render "{count} new" without a separate
   *  hook call per card. */
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const activeBg =
    active && theme === "sunlit" ? "bg-[rgba(196,147,78,0.045)]" : "";
  const hoverBg = !active ? (theme === "sunlit" ? "hover:bg-[var(--sh-bg-card-tinted-hover)]" : "hover:bg-white/[0.02]") : "";

  // Has unread messages from the other member? Drives three signals:
  //   - Gold ring around the avatar (ringVariant="gold")
  //   - Title weight bump (font-medium → font-semibold)
  //   - "N new" count next to the date stamp in gold accent caps
  // Active conversation never shows unread (we zero it on click).
  const hasUnread = convo.unreadCount > 0;

  // Engraved-gold accent — CSS gradient bars instead of an SVG lens
  // path. Two reasons:
  //   1. The SVG path version (used on /journal) gets visibly
  //      pixelated here because the conversation cards are taller
  //      and the path's sharp tips compress against the pixel grid.
  //      A CSS gradient on a 1px-tall div is always crisp.
  //   2. We want the accent to sit on the NAME area, not span the
  //      full card width (which would draw the engraving across the
  //      avatar zone too). Using `left-[44px]` aligns the gradient's
  //      start with the name's left edge — the bar sits in the middle
  //      of the user name, framed top and bottom, exactly where the
  //      eye is reading.
  const goldRgb = theme === "sunlit" ? "169,121,61" : "196,147,78";
  const goldAlpha = theme === "sunlit" ? 0.95 : 0.85;
  const barShadow =
    theme === "sunlit"
      ? "0 0.5px 0 rgba(60,40,15,0.18)"
      : "0 0 4px rgba(196,147,78,0.35), 0 0 8px rgba(196,147,78,0.18)";
  const accentGradient = `linear-gradient(to right, transparent 0%, rgba(${goldRgb},${goldAlpha * 0.4}) 22%, rgba(${goldRgb},${goldAlpha}) 50%, rgba(${goldRgb},${goldAlpha * 0.4}) 78%, transparent 100%)`;

  return (
    <div
      className={`relative flex w-full flex-col gap-1.5 px-3.5 py-3 transition-colors ${activeBg} ${hoverBg}`}
    >
      {active && (
        <>
          <div
            className="pointer-events-none absolute top-0 h-px"
            style={{
              left: "44px",
              right: "14px",
              background: accentGradient,
              boxShadow: barShadow,
            }}
          />
          <div
            className="pointer-events-none absolute bottom-0 h-px"
            style={{
              left: "44px",
              right: "14px",
              background: accentGradient,
              boxShadow: barShadow,
            }}
          />
        </>
      )}
      <div className="flex items-center gap-2.5">
        <Avatar
          profile={convo.otherMember ?? null}
          size="sm"
          ringVariant={hasUnread ? "gold" : "default"}
        />
        <div className="flex min-w-0 flex-col">
          <span
            className={`${sans.className} flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.32em] text-[var(--sh-text-tertiary)]`}
          >
            <span>{relativeTime(convo.updated_at)}</span>
            {hasUnread && (
              <>
                <span className="text-[var(--sh-text-muted)]">·</span>
                <span className="text-[var(--sh-accent-gold)]">
                  {t("newCount", { count: convo.unreadCount })}
                </span>
              </>
            )}
          </span>
          <span
            className={`${serif.className} truncate text-[14px] italic ${
              hasUnread ? "font-semibold" : "font-medium"
            } leading-tight tracking-[-0.005em] text-[var(--sh-text-primary)]`}
          >
            {convo.title}
          </span>
        </div>
      </div>
      <p
        className={`${sans.className} line-clamp-2 pl-[44px] text-[11px] leading-[1.5] text-[var(--sh-text-secondary)]`}
      >
        {convo.lastMessage}
      </p>
    </div>
  );
}

/**
 * Horizon mark + voice signature for the /messages foot. Same
 * composition as the /journal, /journal/archive, /lineage, and
 * meditation horizon marks. Inlined for now; shared HorizonMark
 * component refactor is tracked under SH-46 follow-up.
 */
function MessagesHorizonMark({ voiceSignature }: { voiceSignature: string }) {
  const { theme } = useTheme();
  const goldRgb = theme === "sunlit" ? "169,121,61" : "196,147,78";
  const lineShadow =
    theme === "sunlit"
      ? "0 1px 0 rgba(60,40,15,0.18)"
      : "0 0 4px rgba(196,147,78,0.28)";
  const lineAlphaInner = theme === "sunlit" ? 0.95 : 0.85;
  const lineAlphaMid = theme === "sunlit" ? 0.5 : 0.4;

  return (
    <div className="flex flex-shrink-0 flex-col items-center justify-center border-t border-[var(--sh-border-subtle)] px-10 pb-10 pt-8">
      <motion.div
        animate={{ opacity: [0.78, 1, 0.78] }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="flex w-3/4 max-w-[640px] items-center justify-center gap-3"
      >
        <div
          aria-hidden="true"
          className="h-px flex-1"
          style={{
            background: `linear-gradient(to right, transparent 0%, rgba(${goldRgb},${lineAlphaMid}) 50%, rgba(${goldRgb},${lineAlphaInner}) 100%)`,
            boxShadow: lineShadow,
          }}
        />
        <motion.div
          animate={{ scale: [1, 1.04, 1] }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{ transformOrigin: "center" }}
        >
          <AnchorMark size={20} shaftHeight={42} fill="var(--sh-accent-gold)" />
        </motion.div>
        <div
          aria-hidden="true"
          className="h-px flex-1"
          style={{
            background: `linear-gradient(to right, rgba(${goldRgb},${lineAlphaInner}) 0%, rgba(${goldRgb},${lineAlphaMid}) 50%, transparent 100%)`,
            boxShadow: lineShadow,
          }}
        />
      </motion.div>
      <p
        className={`${serif.className} mt-5 text-[14px] italic text-[var(--sh-text-tertiary)]`}
      >
        {voiceSignature}
      </p>
    </div>
  );
}
