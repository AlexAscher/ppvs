"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { useEcoMode, ECO_INTERVAL_MULTIPLIER } from "@/lib/use-eco";
// Both roles (agency + chatter) render the single indigo design from
// Create_prompt_design — the chatter-page-classic/* components are the
// pixel-match of that design. The older medium-sized chatter-page/* design
// components are retired; only its non-visual modals are still used.
import { Topbar } from "@/components/chatter-page-classic/Topbar";
// ModelSelectorBar removed — model chips moved INTO Topbar (see Topbar.tsx).
import {
  TelegramChat,
  type ChatListItem,
  type Message as ChatMessage,
  type MessageMediaInfo,
} from "@/components/chatter-page-classic/TelegramChat";
import {
  ActionPanel,
  type PpvItem,
  type PpvTag,
  type PpvGroup,
} from "@/components/chatter-page-classic/ActionPanel";
import { NotificationToaster } from "@/components/NotificationToaster";
import type { FanRow, FanNote } from "@/lib/fan-types";
import { QuickReplyModal } from "@/components/chatter-page/QuickReplyModal";
import { FanProfileDrawer } from "@/components/chatter-page/FanProfileDrawer";
import { DeleteMessageModal } from "@/components/chatter-page/DeleteMessageModal";

export type StatsPayload = {
  todayNet: number;
  allTimeNet: number;
  todaySales: number;
  allTimeSales: number;
  unlocks: number;
  todayMessages: number;
  allTimeMessages: number;
};

// ─── types ──────────────────────────────────────────────────────────────────

type Model = { id: string; name: string; username: string | null; avatar_url: string | null; session_status?: string | null };

type Dialog = {
  id: string;
  type: "user" | "chat" | "channel";
  title: string;
  username: string | null;
  lastMessage: string;
  lastMessageDate: number;
  unreadCount: number;
  accessHash: string | null;
  status: string | null;
  readOutboxMaxId?: number;
};

type ApiMessageMedia =
  | { type: "photo"; thumbDataUrl: string | null; width: number | null; height: number | null }
  | {
      type: "video";
      thumbDataUrl: string | null;
      width: number | null;
      height: number | null;
      durationSec: number | null;
    }
  | {
      type: "sticker";
      thumbDataUrl: string | null;
      width: number | null;
      height: number | null;
      mimeType: string | null;
      isAnimated: boolean;
    }
  | {
      type: "document";
      thumbDataUrl: string | null;
      fileName: string | null;
      mimeType: string | null;
      sizeBytes: number | null;
    };

type ApiMessage = {
  id: number;
  text: string;
  date: number;
  isOutgoing: boolean;
  media?: ApiMessageMedia | null;
  groupedId?: string | null;
  replyTo?: { msgId: number; quoteText: string | null } | null;
};

type ActivityState = {
  typing: boolean;
  online: boolean;
  lastActiveAgoSec: number | null;
};

type Tab = "ppv" | "tips" | "notes" | "stats";

// Polls overlap server-side via gramJS per-model serializer; keep intervals
// modest and additionally guard with in-flight refs (see fetchDialogs/fetchMessages).
const DIALOGS_POLL_MS = 10_000;
const MESSAGES_POLL_MS = 5_000;
// Activity is light (in-memory read, no gramJS hop) so we poll faster.
const ACTIVITY_POLL_MS = 3_000;

// ─── helpers ────────────────────────────────────────────────────────────────

function formatTime(unix: number) {
  if (!unix) return "";
  const d = new Date(unix * 1000);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US");
}

function initialsFromTitle(title: string) {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

// ─── page ───────────────────────────────────────────────────────────────────

export default function ChatterPage() {
  const router = useRouter();
  const supabase = createClient();
  // Deep-link from agency Inbox: ?modelId=&peerId= picks both before dialogs
  // load. We grab them once at mount via window.location (avoids importing
  // useSearchParams + Suspense). The peer is consumed in the dialogs effect.
  const initialDeepLinkRef = useRef<{ modelId: string | null; peerId: string | null }>(
    typeof window === "undefined"
      ? { modelId: null, peerId: null }
      : {
          modelId: new URLSearchParams(window.location.search).get("modelId"),
          peerId: new URLSearchParams(window.location.search).get("peerId"),
        },
  );
  // Eco mode: multiplies every polling interval below by ECO_INTERVAL_MULTIPLIER
  // so dialogs / messages / activity refresh less often when the agency
  // has chosen to dial down VPS + MTProto load.
  const eco = useEcoMode();
  const ecoMul = eco ? ECO_INTERVAL_MULTIPLIER : 1;

  // Manual reload — Topbar's refresh button. Spins while async work runs
  // and force-fetches dialogs + the active dialog's messages outside the
  // polling cadence. Particularly useful when Eco Mode dilutes intervals.
  const [reloading, setReloading] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"agency" | "chatter" | null>(null);

  const [models, setModels] = useState<Model[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  const [dialogsByModel, setDialogsByModel] = useState<Record<string, Dialog[]>>({});
  const [selectedDialog, setSelectedDialog] = useState<Dialog | null>(null);
  const [apiMessages, setApiMessages] = useState<ApiMessage[]>([]);
  // Per-dialog system events (tip / PPV paid) — fetched alongside messages
  // and merged into the chat view as centered "Customer doesn't see this"
  // banners. Cleared whenever the open chat changes.
  const [systemEvents, setSystemEvents] = useState<
    { id: string; kind: "tip_paid" | "ppv_paid"; body: string; createdAt: number }[]
  >([]);
  const [activity, setActivity] = useState<ActivityState | null>(null);

  const [search, setSearch] = useState("");
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  // Per-chatter quick-emoji bar (above the input). Loaded from
  // user_metadata.quick_emojis on mount, written back via auth.updateUser
  // whenever the user adds / removes one.
  const [quickEmojis, setQuickEmojis] = useState<string[]>([]);
  // Scheduled-send timestamp (UNIX seconds). Null = send now. Cleared on
  // a successful send so the next message goes immediately by default.
  const [scheduleAt, setScheduleAt] = useState<number | null>(null);
  // Non-error transient banner — used for "PPV delivering…" / "✅ Delivered".
  const [notice, setNotice] = useState("");

  const [activeTab, setActiveTab] = useState<Tab>("ppv");
  const [ppvItems, setPpvItems] = useState<PpvItem[]>([]);
  const [ppvTags, setPpvTags] = useState<PpvTag[]>([]);
  const [ppvGroups, setPpvGroups] = useState<PpvGroup[]>([]);
  const [activeFilter, setActiveFilter] = useState("All");
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  // Raw price input from the chatter — empty/0 means free send (no pay link).
  const [priceInput, setPriceInput] = useState("");
  // Urgency timer: hours until the PPV pay link expires (0 = never).
  const [expiresInHours, setExpiresInHours] = useState(0);
  const [tipAmount, setTipAmount] = useState("");
  const [tipMessage, setTipMessage] = useState("");
  const [notes, setNotes] = useState("");

  // Per-fan data (notes + emoji tags + total_spent). Loaded from
  // /api/fans/[modelId]?peerId=… when a dialog is selected. `fan` is the
  // canonical snapshot from DB; `notes` above is the in-progress textarea
  // value that diverges until the user hits Save.
  const [fan, setFan] = useState<FanRow | null>(null);
  const [notesSaving, setNotesSaving] = useState(false);
  // Running log of timestamped notes (fan_notes table). `notes` (above)
  // is the draft for the next note to add.
  const [fanNotes, setFanNotes] = useState<FanNote[]>([]);

  // Aggregate stats — per model. Refetched every 60s + after each
  // successful PPV send/deliver. Initial null = "loading…".
  const [stats, setStats] = useState<StatsPayload | null>(null);

  // Fan emoji tags for the entire chat list — loaded in batch after dialogs
  // arrive. Keyed by peerId so TelegramChat can render them without N fetches.
  const [fanTagsByPeer, setFanTagsByPeer] = useState<Record<string, string[]>>({});
  // Total spent per fan (dollars). Same batch endpoint → renders as a
  // little "$X" badge under each fan's avatar in the chat list.
  const [fanSpentByPeer, setFanSpentByPeer] = useState<Record<string, number>>({});

  // Fan Groups: the agency's group library + which groups each peer is in,
  // plus the active dialog-list filter (null = All).
  const [fanGroups, setFanGroups] = useState<
    { id: string; name: string; color: string; emoji: string | null }[]
  >([]);
  const [groupIdsByPeer, setGroupIdsByPeer] = useState<Record<string, string[]>>({});
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  // Engagement score per peer (0-100) → hot-lead dot in the chat list.

  // Smart pricing hint for the send panel (avg / common range / top sale).
  const [pricingHint, setPricingHint] = useState<string>("");


  // Mobile single-panel view switch (under md). Desktop shows all three
  // panels side by side regardless. "list" = dialog list, "chat" = open
  // conversation, "actions" = Send PPV / Tips / Notes / Stats panel.
  const [mobileView, setMobileView] = useState<"list" | "chat" | "actions">("list");

  // Quick reply modal — opens from a button next to the message input.
  const [quickReplyOpen, setQuickReplyOpen] = useState(false);
  // Fan profile drawer — opens when user clicks fan name/avatar in header.
  const [fanDrawerOpen, setFanDrawerOpen] = useState(false);

  // Right-click context-menu actions: reply / edit mode. Both blockers
  // for handleSend — when `editing` is set, Send actually edits via PUT;
  // when `replyingTo` is set, Send adds replyToMsgId. Mutually exclusive.
  const [replyingTo, setReplyingTo] = useState<{
    id: number;
    text: string;
    isChatter: boolean;
    quote: string | null;
  } | null>(null);
  const [editing, setEditing] = useState<{ id: number; originalText: string } | null>(null);

  // Delete confirmation modal — caches the message id + text + revoke
  // permission so the modal can render a preview and pick the right
  // default option ("for everyone" only on outgoing).
  const [deletingMessage, setDeletingMessage] = useState<{
    id: number;
    text: string;
    canRevoke: boolean;
  } | null>(null);

  const autoSelectedRef = useRef<string | null>(null);
  // Deep-link from the agency Inbox (?modelId=&peerId=) — the peer to open
  // once that model's dialogs have loaded. Consumed once, then cleared.
  const deepLinkPeerRef = useRef<string | null>(null);
  // Track in-flight network requests so polling never piles up requests
  // against the per-model gramJS serializer in the server-side pool.
  const dialogsInFlight = useRef<Set<string>>(new Set());
  const messagesInFlight = useRef(false);
  // While a POST (send / PPV / tip) is in-flight, pause all polling so the
  // POST doesn't get queued behind a freshly-fired GET in the server pool.
  const sendInFlightRef = useRef(false);
  // Stable ref to the currently open dialog — used inside fetchDialogs (which
  // lives in a useCallback with no selectedDialog dep) to auto-zero unread
  // counts when new messages arrive in the active conversation.
  const selectedDialogRef = useRef<Dialog | null>(null);

  // ── auth + models ─────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        router.replace("/login");
        return;
      }
      const r = (user.user_metadata?.role as "agency" | "chatter") ?? "chatter";
      setRole(r);
      const name =
        (user.user_metadata?.full_name as string) ||
        (user.user_metadata?.display_name as string) ||
        user.email?.split("@")[0] ||
        "User";
      setDisplayName(name);
      // Hydrate the quick-emoji bar from this user's metadata. We bump
      // `quick_emojis_v` whenever the shipped default changes so existing
      // accounts pick up the new bar on next login without us having to
      // detect the exact bytes of the previous seed (which got fragile —
      // some legacy users had 5-item arrays that didn't match either
      // historic default exactly).
      const EMOJI_BAR_VERSION = 2;
      const NEW_DEFAULT = [
        "😍", "😈", "🍆", "🍑", "🥵", "💋",
        "🥰", "🤤", "💕", "👅", "😘", "💦",
        "😊", "🍓", "💘", "🥺",
      ];
      const savedVersion = Number(user.user_metadata?.quick_emojis_v ?? 0);
      const saved = user.user_metadata?.quick_emojis;
      if (
        savedVersion >= EMOJI_BAR_VERSION &&
        Array.isArray(saved) &&
        saved.length > 0
      ) {
        setQuickEmojis(saved as string[]);
      } else {
        setQuickEmojis(NEW_DEFAULT);
        void supabase.auth.updateUser({
          data: { quick_emojis: NEW_DEFAULT, quick_emojis_v: EMOJI_BAR_VERSION },
        });
      }

      if (r === "agency") {
        // Try with session_status; if that column doesn't exist yet (no
        // migration run), fall back to the base columns so the page still
        // loads instead of 400-ing the whole query.
        const withStatus = await supabase
          .from("models")
          .select("id, name, username, avatar_url, session_status")
          .eq("agency_user_id", user.id);
        let rows = (withStatus.data ?? null) as Model[] | null;
        if (withStatus.error) {
          const base = await supabase
            .from("models")
            .select("id, name, username, avatar_url")
            .eq("agency_user_id", user.id);
          rows = (base.data ?? null) as Model[] | null;
        }
        if (cancelled) return;
        const list = rows ?? [];
        setModels(list);
        // If we arrived via the Inbox deep-link, pick that model and stash
        // the peer so the dialogs effect can auto-select it once dialogs
        // arrive. Otherwise default to the first model.
        const deep = initialDeepLinkRef.current;
        const wanted = deep.modelId && list.find((m) => m.id === deep.modelId);
        if (wanted) {
          setSelectedModelId(wanted.id);
          deepLinkPeerRef.current = deep.peerId;
        } else if (list.length > 0) {
          setSelectedModelId(list[0].id);
        }
      } else {
        const { data: ac } = await supabase
          .from("agency_chatters")
          .select("model_id")
          .eq("chatter_id", user.id)
          .maybeSingle();
        if (cancelled) return;
        const modelId = (ac as { model_id: string | null } | null)?.model_id ?? null;
        if (modelId) {
          const withStatus = await supabase
            .from("models")
            .select("id, name, username, avatar_url, session_status")
            .eq("id", modelId)
            .maybeSingle();
          let row = (withStatus.data ?? null) as Model | null;
          if (withStatus.error) {
            const base = await supabase
              .from("models")
              .select("id, name, username, avatar_url")
              .eq("id", modelId)
              .maybeSingle();
            row = (base.data ?? null) as Model | null;
          }
          if (cancelled) return;
          if (row) {
            setModels([row]);
            setSelectedModelId(row.id);
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, router]);

  // Keep selectedDialogRef in sync so fetchDialogs (stable useCallback) can
  // read the latest selected dialog without including it as a dep.
  useEffect(() => {
    selectedDialogRef.current = selectedDialog;
  }, [selectedDialog]);

  // ── PPV data per model ────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selectedModelId) {
        if (cancelled) return;
        setPpvItems([]);
        setPpvTags([]);
        setPpvGroups([]);
        return;
      }
      const [{ data: tagsRaw }, { data: itemsRaw }, { data: links }, { data: groupsRaw }] =
        await Promise.all([
          supabase
            .from("ppv_tags")
            .select("id, model_id, name, color, emoji")
            .eq("model_id", selectedModelId),
          supabase
            .from("ppvs")
            .select("id, model_id, group_id, name, price, media_url, preview_url, review_status, created_at")
            .eq("model_id", selectedModelId)
            .order("created_at", { ascending: false }),
          supabase.from("ppv_item_tags").select("ppv_id, tag_id"),
          supabase
            .from("ppv_groups")
            .select("id, name, bundle_price, created_at")
            .eq("model_id", selectedModelId)
            .order("created_at", { ascending: false }),
        ]);
      if (cancelled) return;
      const tags = (tagsRaw ?? []) as PpvTag[];
      const tagMap = new Map(tags.map((t) => [t.id, t]));
      const linksByItem = new Map<string, PpvTag[]>();
      ((links ?? []) as { ppv_id: string; tag_id: string }[]).forEach((l) => {
        const t = tagMap.get(l.tag_id);
        if (!t) return;
        const arr = linksByItem.get(l.ppv_id) ?? [];
        arr.push(t);
        linksByItem.set(l.ppv_id, arr);
      });
      const items: PpvItem[] = ((itemsRaw ?? []) as Array<{
        id: string;
        name: string;
        price: number | string;
        media_url: string | null;
        preview_url?: string | null;
        group_id: string | null;
        review_status?: "pending" | "approved" | "rejected" | null;
      }>)
        // Only approved PPVs are sendable from the chat. Pending / rejected
        // items are hidden entirely so a chatter can't attach unreviewed
        // content. Null / missing status (pre-moderation schemas) counts as
        // approved for backwards-compat.
        .filter((row) => (row.review_status ?? "approved") === "approved")
        .map((row) => ({
          id: row.id,
          name: row.name,
          price: row.price,
          media_url: row.media_url,
          preview_url: row.preview_url ?? null,
          group_id: row.group_id,
          tags: linksByItem.get(row.id) ?? [],
        }));
      const groups: PpvGroup[] = ((groupsRaw ?? []) as Array<{
        id: string;
        name: string;
        bundle_price: number | string | null;
      }>).map((g) => ({
        id: g.id,
        name: g.name,
        bundle_price: g.bundle_price == null ? null : Number(g.bundle_price),
      }));
      setPpvTags(tags);
      setPpvItems(items);
      setPpvGroups(groups);
      setActiveFilter("All");
      setSelectedItems([]);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, selectedModelId]);

  // ── fan tags batch fetch ──────────────────────────────────────────────────
  // Load emoji tags for all dialogs when the model changes so the chat list
  // shows 🔴💵⭐ next to fan usernames without N individual requests.
  // The simple key-guard prevents re-fetching on every 10s dialogs poll.
  const fanTagsFetchKey = useRef("");
  useEffect(() => {
    if (!selectedModelId) {
      // Defer setState per React 19 strict-effects convention.
      const tid = setTimeout(() => {
        setFanTagsByPeer({});
        setFanSpentByPeer({});
        fanTagsFetchKey.current = "";
      }, 0);
      return () => clearTimeout(tid);
    }
    const dialogs = (dialogsByModel[selectedModelId] ?? []);
    if (dialogs.length === 0) return;
    // Key = modelId + count so we re-fetch when the model changes OR when
    // entirely new dialogs arrive (e.g. first time connecting a new account).
    const key = `${selectedModelId}:${dialogs.length}`;
    if (fanTagsFetchKey.current === key) return;
    fanTagsFetchKey.current = key;

    const peerIds = dialogs.map((d) => d.id).filter(Boolean).slice(0, 300).join(",");
    const model = selectedModelId;
    void fetch(`/api/fans/${model}/batch?peerIds=${peerIds}`)
      .then((r) => r.json())
      .then((data: { tags?: Record<string, string[]>; spent?: Record<string, number> }) => {
        if (data.tags) setFanTagsByPeer(data.tags);
        if (data.spent) setFanSpentByPeer(data.spent);
      })
      .catch(() => { /* best-effort */ });

    // Group memberships for the same peers (so the dialog-list filter can
    // restrict by group). byPeer maps peerId -> group chips.
    void fetch(`/api/groups/for-fan?modelId=${model}&peerIds=${peerIds}`)
      .then((r) => r.json())
      .then((data: { byPeer?: Record<string, { id: string }[]> }) => {
        if (!data.byPeer) return;
        const map: Record<string, string[]> = {};
        for (const [pid, chips] of Object.entries(data.byPeer)) {
          map[pid] = chips.map((c) => c.id);
        }
        setGroupIdsByPeer(map);
      })
      .catch(() => { /* best-effort */ });
  }, [selectedModelId, dialogsByModel]);

  // Smart-pricing hint per model (avg sale / common range / top sale).
  useEffect(() => {
    if (!selectedModelId) { setPricingHint(""); return; }
    void fetch(`/api/ppv/pricing-stats?modelId=${selectedModelId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { avgPaid?: number; sales?: number; commonRange?: string | null; topSale?: number } | null) => {
        if (!d || !d.sales) { setPricingHint(""); return; }
        const parts: string[] = [];
        if (d.avgPaid) parts.push(`Avg sale $${d.avgPaid}`);
        if (d.commonRange) parts.push(`most common ${d.commonRange}`);
        if (d.topSale) parts.push(`top $${d.topSale}`);
        setPricingHint(parts.join(" · "));
      })
      .catch(() => setPricingHint(""));
  }, [selectedModelId]);

  // Presence heartbeat — bump my last_seen_at every 30s while this page is
  // open so the agency's Chatters tab can show who's online.
  useEffect(() => {
    const ping = () => { void fetch("/api/presence", { method: "POST" }).catch(() => {}); };
    ping();
    const iv = setInterval(ping, 30_000);
    return () => clearInterval(iv);
  }, []);

  // Load the agency's group library once (for the dialog-list filter chips).
  useEffect(() => {
    void fetch("/api/groups")
      .then((r) => (r.ok ? r.json() : { groups: [] }))
      .then((data: { groups?: { id: string; name: string; color: string; emoji: string | null }[] }) => {
        setFanGroups(data.groups ?? []);
      })
      .catch(() => { /* best-effort */ });
  }, []);

  // ── dialogs polling ───────────────────────────────────────────────────────

  const fetchDialogs = useCallback(async (modelId: string, autoSelectFirst: boolean) => {
    // Skip if a previous poll for this model is still pending, or a send is
    // about to go out — avoids piling up requests behind gramJS's per-model
    // serializer in the server pool.
    if (sendInFlightRef.current) return;
    if (dialogsInFlight.current.has(modelId)) return;
    dialogsInFlight.current.add(modelId);
    try {
      const res = await fetch(`/api/telegram/dialogs/${modelId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      let list: Dialog[] = data.dialogs ?? [];

      // Auto-zero unread for the currently open dialog so the badge doesn't
      // reappear after a poll when the chatter is actively reading messages.
      const sel = selectedDialogRef.current;
      if (sel) {
        const liveIdx = list.findIndex((d) => d.id === sel.id);
        if (liveIdx !== -1 && (list[liveIdx].unreadCount ?? 0) > 0) {
          list = list.map((d) =>
            d.id === sel.id ? { ...d, unreadCount: 0 } : d,
          );
          void fetch(`/api/telegram/mark-read/${modelId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ peerId: sel.id, accessHash: sel.accessHash }),
          }).catch(() => {});
        }
      }

      setDialogsByModel((prev) => ({ ...prev, [modelId]: list }));
      if (autoSelectFirst && list.length > 0 && autoSelectedRef.current !== modelId) {
        autoSelectedRef.current = modelId;
        // If we have an inbox deep-link peer pending, open that chat instead
        // of the first dialog. Otherwise fall back to the newest dialog.
        const wantedPeer = deepLinkPeerRef.current;
        const wanted = wantedPeer ? list.find((d) => d.id === wantedPeer) : null;
        setSelectedDialog(wanted ?? list[0]);
        if (wanted) {
          // Consume the deep-link so polling refreshes don't keep re-selecting.
          deepLinkPeerRef.current = null;
        }
      }
      setError("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load dialogs");
    } finally {
      dialogsInFlight.current.delete(modelId);
    }
  }, []);

  useEffect(() => {
    if (!selectedModelId) return;
    const tid = setTimeout(() => {
      void fetchDialogs(selectedModelId, true);
    }, 0);
    const iv = setInterval(() => {
      void fetchDialogs(selectedModelId, false);
    }, DIALOGS_POLL_MS * ecoMul);
    return () => {
      clearTimeout(tid);
      clearInterval(iv);
    };
  }, [selectedModelId, fetchDialogs, ecoMul]);

  useEffect(() => {
    if (role !== "agency") return;
    const others = models.filter((m) => m.id !== selectedModelId);
    if (!others.length) return;
    const tid = setTimeout(() => {
      void (async () => {
        for (const m of others) await fetchDialogs(m.id, false);
      })();
    }, 0);
    const iv = setInterval(() => {
      void (async () => {
        for (const m of others) await fetchDialogs(m.id, false);
      })();
    }, 30_000);
    return () => {
      clearTimeout(tid);
      clearInterval(iv);
    };
  }, [role, models, selectedModelId, fetchDialogs]);

  // ── messages polling ──────────────────────────────────────────────────────

  const fetchMessages = useCallback(async (modelId: string, dialog: Dialog) => {
    // Skip if a previous fetch is still pending, or a send is in flight.
    if (sendInFlightRef.current) return;
    if (messagesInFlight.current) return;
    messagesInFlight.current = true;
    try {
      const url = new URL(`/api/telegram/messages/${modelId}`, window.location.origin);
      url.searchParams.set("peerId", dialog.id);
      if (dialog.accessHash) url.searchParams.set("accessHash", dialog.accessHash);
      // Fan-paid system events live in our DB, not in Telegram — pull them
      // in parallel with messages and merge by timestamp client-side.
      const eventsUrl = new URL(`/api/chat-events/${modelId}`, window.location.origin);
      eventsUrl.searchParams.set("peerId", dialog.id);
      const [res, eventsRes] = await Promise.all([
        fetch(url.toString()),
        fetch(eventsUrl.toString()),
      ]);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      const list: ApiMessage[] = data.messages ?? [];
      if (eventsRes.ok) {
        const ev = (await eventsRes.json()) as {
          events?: { id: string; kind: "tip_paid" | "ppv_paid"; body: string; created_at: string }[];
        };
        const mapped = (ev.events ?? []).map((e) => ({
          id: e.id,
          kind: e.kind,
          body: e.body,
          createdAt: Math.floor(new Date(e.created_at).getTime() / 1000),
        }));
        setSystemEvents((prev) => {
          if (
            prev.length === mapped.length &&
            prev[prev.length - 1]?.id === mapped[mapped.length - 1]?.id
          ) {
            return prev;
          }
          return mapped;
        });
      }
      setApiMessages((prev) => {
        // Carry over optimistic messages (negative ids) that the server
        // poll hasn't reflected yet. Drop an optimistic once a real outgoing
        // message with the same text within ±60s shows up from the server.
        const optimistic = prev.filter((m) => m.id < 0);
        const stillOptimistic = optimistic.filter(
          (o) =>
            !list.some(
              (s) =>
                s.isOutgoing && s.text === o.text && Math.abs(s.date - o.date) < 60,
            ),
        );
        const merged: ApiMessage[] = [...list, ...stillOptimistic];
        // Cheap stability check to avoid pointless re-renders.
        if (
          prev.length === merged.length &&
          prev[prev.length - 1]?.id === merged[merged.length - 1]?.id
        ) {
          return prev;
        }
        return merged;
      });
      setError("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load messages");
    } finally {
      messagesInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!selectedModelId || !selectedDialog) return;
    const tid = setTimeout(() => {
      void fetchMessages(selectedModelId, selectedDialog);
    }, 0);
    const iv = setInterval(() => {
      void fetchMessages(selectedModelId, selectedDialog);
      // Eco mode never slows the OPEN chat — messages stay instant. It only
      // dilutes the chat-list / presence / stats polls below.
    }, MESSAGES_POLL_MS);
    return () => {
      clearTimeout(tid);
      clearInterval(iv);
    };
  }, [selectedModelId, selectedDialog, fetchMessages]);

  // ── activity polling (typing / fresh online) ──────────────────────────────

  const fetchActivity = useCallback(async (modelId: string, dialog: Dialog) => {
    try {
      const url = new URL(`/api/telegram/activity/${modelId}`, window.location.origin);
      url.searchParams.set("peerId", dialog.id);
      if (dialog.accessHash) url.searchParams.set("accessHash", dialog.accessHash);
      const res = await fetch(url.toString());
      if (!res.ok) return;
      const data = (await res.json()) as ActivityState;
      setActivity(data);
    } catch {
      // ignore — activity is a UX nicety, not critical
    }
  }, []);

  useEffect(() => {
    // Reset + first fetch deferred to next tick — React 19 strict effects
    // forbid synchronous setState in effect body.
    const resetTid = setTimeout(() => setActivity(null), 0);
    if (!selectedModelId || !selectedDialog) {
      return () => clearTimeout(resetTid);
    }
    const tid = setTimeout(() => {
      void fetchActivity(selectedModelId, selectedDialog);
    }, 0);
    const iv = setInterval(() => {
      void fetchActivity(selectedModelId, selectedDialog);
    }, ACTIVITY_POLL_MS * ecoMul);
    return () => {
      clearTimeout(resetTid);
      clearTimeout(tid);
      clearInterval(iv);
    };
  }, [selectedModelId, selectedDialog, fetchActivity, ecoMul]);

  // ── SSE realtime stream (typing + new messages) ───────────────────────────
  // Replaces tight polling — server pushes events as gramJS emits them.
  // Polling stays as a backstop so a dropped SSE doesn't strand the UI.

  useEffect(() => {
    if (!selectedModelId) return;
    const modelId = selectedModelId;
    const es = new EventSource(`/api/telegram/stream/${modelId}`);
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data) as {
          kind: "typing" | "message";
          peerId: string;
        };
        // Only refresh for the currently-open dialog — other dialogs'
        // updates surface on the next dialogs poll.
        if (!selectedDialog || ev.peerId !== selectedDialog.id) return;
        if (ev.kind === "message") {
          void fetchMessages(modelId, selectedDialog);
        } else if (ev.kind === "typing") {
          void fetchActivity(modelId, selectedDialog);
        }
      } catch {
        // ignore malformed payloads
      }
    };
    return () => es.close();
  }, [selectedModelId, selectedDialog, fetchMessages, fetchActivity]);

  // ── stats polling ─────────────────────────────────────────────────────────
  // 60s is plenty — the chatter doesn't watch Stats live, and we re-fetch
  // immediately after a successful deliver below to make the green numbers
  // jump on a fresh sale.

  const fetchStats = useCallback(async (modelId: string) => {
    try {
      const scope = role === "chatter" ? "me" : "model";
      const url = new URL(`/api/stats/${modelId}`, window.location.origin);
      url.searchParams.set("scope", scope);
      const res = await fetch(url.toString());
      if (!res.ok) return;
      const data = (await res.json()) as StatsPayload;
      setStats(data);
    } catch {
      // best-effort
    }
  }, [role]);

  // Lazy: only hit /api/stats when the Stats tab is actually open. On a
  // slow uplink the stats query was competing with dialogs/messages at page
  // load and stalling everything — keep it off the critical path.
  useEffect(() => {
    if (!selectedModelId || activeTab !== "stats") return;
    const modelId = selectedModelId;
    // Defer out of the effect body (React 19 strict effects) + keep it
    // refreshing while the tab stays open.
    const tid = setTimeout(() => void fetchStats(modelId), 0);
    const iv = setInterval(() => void fetchStats(modelId), 60_000 * ecoMul);
    return () => {
      clearTimeout(tid);
      clearInterval(iv);
    };
  }, [selectedModelId, activeTab, fetchStats, ecoMul]);

  // ── fan profile (notes + tags + total_spent) ──────────────────────────────
  // One fetch per (model, peer). On open we also touch last_seen_at and
  // ensure the row exists with the latest telegram username/name snapshot so
  // the fan list (future) and drawer have something to show even before the
  // chatter saves notes.

  useEffect(() => {
    // Reset fan + note draft + note list first (deferred for React 19).
    const resetTid = setTimeout(() => {
      setFan(null);
      setNotes("");
      setFanNotes([]);
    }, 0);
    if (!selectedModelId || !selectedDialog) {
      return () => clearTimeout(resetTid);
    }
    const modelId = selectedModelId;
    const dialog = selectedDialog;
    let cancelled = false;
    (async () => {
      try {
        // 1. Fetch fan row + note log in parallel.
        const fanUrl = new URL(`/api/fans/${modelId}`, window.location.origin);
        fanUrl.searchParams.set("peerId", dialog.id);
        const notesUrl = new URL(`/api/fans/${modelId}/notes`, window.location.origin);
        notesUrl.searchParams.set("peerId", dialog.id);

        const [fanRes, notesRes] = await Promise.all([
          fetch(fanUrl.toString()),
          fetch(notesUrl.toString()),
        ]);
        if (cancelled) return;
        if (fanRes.ok) {
          const data = (await fanRes.json()) as { fan: FanRow | null };
          if (!cancelled && data.fan) setFan(data.fan);
        }
        if (notesRes.ok) {
          const nd = (await notesRes.json()) as { notes: FanNote[] };
          if (!cancelled) setFanNotes(nd.notes ?? []);
        }

        // 2. Upsert with latest telegram snapshot + touch last_seen_at.
        const upsertRes = await fetch(`/api/fans/${modelId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            peerId: dialog.id,
            telegramUsername: dialog.username,
            telegramName: dialog.title,
            touchLastSeen: true,
          }),
        });
        if (cancelled || !upsertRes.ok) return;
        const upserted = (await upsertRes.json()) as { fan: FanRow };
        if (!cancelled) setFan(upserted.fan);
      } catch {
        // best-effort: notes/tags just stay empty
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(resetTid);
    };
  }, [selectedModelId, selectedDialog]);

  // ── handlers ──────────────────────────────────────────────────────────────

  function handleModelSelect(id: string) {
    autoSelectedRef.current = null;
    setSelectedDialog(null);
    setApiMessages([]);
    setSystemEvents([]);
    setSelectedModelId(id);
  }

  function handleDialogSelect(id: string) {
    const modelId = selectedModelId;
    const list = modelId ? dialogsByModel[modelId] ?? [] : [];
    const d = list.find((x) => x.id === id) ?? null;
    setSelectedDialog(d);
    setApiMessages([]);
    setSystemEvents([]);
    // On mobile, opening a chat swaps the single visible panel to the
    // conversation view (desktop shows everything at once anyway).
    setMobileView("chat");

    // Open == read: zero the unread count locally right now so both the
    // sidebar badge and the model badge update instantly, then tell
    // Telegram so the next dialogs poll doesn't bring the badge back.
    if (d && modelId && (d.unreadCount ?? 0) > 0) {
      setDialogsByModel((prev) => {
        const cur = prev[modelId];
        if (!cur) return prev;
        return {
          ...prev,
          [modelId]: cur.map((x) =>
            x.id === id ? { ...x, unreadCount: 0 } : x,
          ),
        };
      });
      void fetch(`/api/telegram/mark-read/${modelId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peerId: d.id, accessHash: d.accessHash }),
      }).catch(() => {
        // Best-effort: even if the network call fails, the next poll will
        // simply reflect the still-unread state. No need to surface an error.
      });
    }
  }

  // Common POST helper: pauses polling so the send doesn't queue behind GETs
  // in the per-model gramJS serializer, and surfaces real server error text.
  // Returns the real message metadata so callers can replace their
  // optimistic placeholder.
  async function sendTelegramMessage(
    modelId: string,
    dialog: Dialog,
    text: string,
    replyToMsgId?: number,
    quoteText?: string | null,
    scheduleAtSec?: number | null,
  ): Promise<ApiMessage | null> {
    sendInFlightRef.current = true;
    try {
      const res = await fetch(`/api/telegram/messages/${modelId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          peerId: dialog.id,
          accessHash: dialog.accessHash,
          text,
          replyToMsgId,
          scheduleAt: scheduleAtSec ?? undefined,
          quoteText,
        }),
      });
      let data: { ok?: boolean; error?: string; message?: ApiMessage } = {};
      try { data = await res.json(); } catch {}
      if (!res.ok || data.error) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      return data.message ?? null;
    } finally {
      sendInFlightRef.current = false;
    }
  }

  // PUT edit + DELETE — both bypass the optimistic-merge flow since we
  // already know the message's real id.
  async function editTelegramMessage(
    modelId: string,
    dialog: Dialog,
    messageId: number,
    text: string,
  ): Promise<void> {
    sendInFlightRef.current = true;
    try {
      const res = await fetch(`/api/telegram/messages/${modelId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          peerId: dialog.id,
          accessHash: dialog.accessHash,
          messageId,
          text,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
    } finally {
      sendInFlightRef.current = false;
    }
  }

  async function deleteTelegramMessage(
    modelId: string,
    dialog: Dialog,
    messageId: number,
    revoke: boolean,
  ): Promise<void> {
    sendInFlightRef.current = true;
    try {
      const res = await fetch(`/api/telegram/messages/${modelId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          peerId: dialog.id,
          accessHash: dialog.accessHash,
          messageIds: [messageId],
          revoke,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
    } finally {
      sendInFlightRef.current = false;
    }
  }

  async function handleSend() {
    if (!inputText.trim() || !selectedModelId || !selectedDialog) return;
    setSending(true);
    setError("");
    const text = inputText;
    const dialog = selectedDialog;
    const modelId = selectedModelId;

    // EDIT MODE: replace the existing bubble's text instead of sending new.
    if (editing) {
      const editId = editing.id;
      setInputText("");
      // Optimistic local edit so the user sees the change instantly.
      setApiMessages((prev) =>
        prev.map((m) => (m.id === editId ? { ...m, text } : m)),
      );
      try {
        await editTelegramMessage(modelId, dialog, editId, text);
        setEditing(null);
      } catch (e: unknown) {
        setError(e instanceof Error ? `Edit failed: ${e.message}` : "Edit failed");
        // Restore both the original input and the bubble text on failure.
        setInputText(text);
        setApiMessages((prev) =>
          prev.map((m) =>
            m.id === editId ? { ...m, text: editing.originalText } : m,
          ),
        );
      } finally {
        setSending(false);
      }
      return;
    }

    const replyId = replyingTo?.id;
    const quote = replyingTo?.quote ?? null;
    setInputText("");
    setReplyingTo(null);
    // Optimistic: negative id so fetchMessages's merge keeps it until the
    // server response includes a real matching outgoing message.
    const optimisticId = -Date.now();
    setApiMessages((prev) => [
      ...prev,
      { id: optimisticId, text, date: Math.floor(Date.now() / 1000), isOutgoing: true },
    ]);
    // Snapshot the schedule before clearing — we want each send to be
    // explicit, not have the timer linger across messages.
    const sendSchedule = scheduleAt;
    setScheduleAt(null);
    try {
      const real = await sendTelegramMessage(modelId, dialog, text, replyId, quote, sendSchedule);
      // Replace optimistic with real message so subsequent polls de-dupe by id.
      if (real) {
        setApiMessages((prev) =>
          prev.map((m) => (m.id === optimisticId ? real : m)),
        );
      } else if (sendSchedule) {
        // Scheduled sends never appear in the live chat history (they sit
        // in Telegram's "Scheduled" tab on the model's account until they
        // fire). Drop the optimistic so the UI doesn't show a ghost.
        setApiMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        setNotice(`📅 Scheduled for ${new Date(sendSchedule * 1000).toLocaleString("en-US")}`);
        setTimeout(() => setNotice((n) => (n.startsWith("📅") ? "" : n)), 5000);
      }
      void fetchDialogs(modelId, false);
    } catch (e: unknown) {
      setError(e instanceof Error ? `Send failed: ${e.message}` : "Send failed");
      setInputText(text);
      // remove the optimistic message on failure + restore the schedule
      // so the chatter doesn't have to set it up again.
      setApiMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      if (sendSchedule) setScheduleAt(sendSchedule);
    } finally {
      setSending(false);
    }
  }

  // ── context-menu handlers ─────────────────────────────────────────────────

  function handleReplyToMessage(messageId: number, messageText: string, isChatter: boolean) {
    setEditing(null);
    setReplyingTo({ id: messageId, text: messageText, isChatter, quote: null });
  }

  function handleReplyWithQuote(
    messageId: number,
    messageText: string,
    isChatter: boolean,
    selection: string,
  ) {
    setEditing(null);
    // Quote text is sent as a native Telegram `quoteText` in InputReplyTo —
    // the receiving client renders it as a highlighted snippet inside the
    // reply preview, no `> …` markdown injection needed.
    setReplyingTo({
      id: messageId,
      text: messageText,
      isChatter,
      quote: selection.trim() || null,
    });
  }

  function handleStartEdit(messageId: number, currentText: string) {
    setReplyingTo(null);
    setEditing({ id: messageId, originalText: currentText });
    setInputText(currentText);
  }

  function handleCancelEdit() {
    if (editing) setInputText("");
    setEditing(null);
  }

  function handleDeleteMessage(messageId: number) {
    // Just open the modal — the actual delete happens in
    // `confirmDeleteMessage` once the user picks "for me" vs "for
    // everyone". revoke is only available on outgoing messages (own
    // sends) — Telegram refuses to revoke fan's messages.
    const msg = apiMessages.find((m) => m.id === messageId);
    if (!msg) return;
    setDeletingMessage({
      id: messageId,
      text: msg.text || (msg.media ? "[media]" : ""),
      canRevoke: msg.isOutgoing,
    });
  }

  async function confirmDeleteMessage(revoke: boolean) {
    if (!selectedModelId || !selectedDialog || !deletingMessage) return;
    const modelId = selectedModelId;
    const dialog = selectedDialog;
    const messageId = deletingMessage.id;
    setDeletingMessage(null);
    // Optimistic remove
    const before = apiMessages;
    setApiMessages((prev) => prev.filter((m) => m.id !== messageId));
    try {
      await deleteTelegramMessage(modelId, dialog, messageId, revoke);
    } catch (e: unknown) {
      setError(e instanceof Error ? `Delete failed: ${e.message}` : "Delete failed");
      // Restore on failure
      setApiMessages(before);
    }
  }

  async function handleSendPpv() {
    if (!selectedDialog || !selectedModelId || !selectedItems.length) return;
    // Preserve the chatter's selection order — the server uses `ppvIds`
    // ordering to lay out the album and the /pay grid.
    const ordered = selectedItems.filter((id) => ppvItems.some((p) => p.id === id));
    // Resolve the chatter's price input. Empty / 0 / NaN means a free gift
    // (server skips the blurred preview, just pushes originals to TG).
    const parsedPrice = Number(priceInput);
    const priceForSend =
      Number.isFinite(parsedPrice) && parsedPrice > 0
        ? Math.round(parsedPrice * 100) / 100
        : 0;
    setSending(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/ppv/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: selectedModelId,
          peerId: selectedDialog.id,
          accessHash: selectedDialog.accessHash,
          peerUsername: selectedDialog.username,
          caption,
          ppvIds: ordered,
          totalPrice: priceForSend,
          expiresInHours: priceForSend > 0 ? expiresInHours : 0,
        }),
      });
      let data: { ok?: boolean; error?: string; code?: string; payUrl?: string } = {};
      try { data = await res.json(); } catch {}
      if (!res.ok || data.error) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      // POST returns immediately now — Telegram upload runs in background
      // via next/server `after()`. Clear UI optimistically and follow the
      // outcome by polling the status endpoint.
      setSelectedItems([]);
      setCaption("");
      setPriceInput("");
      setExpiresInHours(0);
      setNotice(priceForSend > 0 ? "Sending PPV to fan…" : "Sending free content to fan…");
      const sentCode = data.code;
      const modelIdForRefresh = selectedModelId;
      if (sentCode) {
        void pollPpvSendStatus(sentCode, modelIdForRefresh);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? `PPV send failed: ${e.message}` : "PPV send failed");
    } finally {
      setSending(false);
    }
  }

  // Polls the background delivery state for ~90s. Resolves silently when
  // status reaches a terminal state; surfaces failure as a setError call.
  async function pollPpvSendStatus(code: string, modelIdForRefresh: string) {
    const start = Date.now();
    const POLL_INTERVAL_MS = 2_000;
    const MAX_WAIT_MS = 90_000;
    while (Date.now() - start < MAX_WAIT_MS) {
      try {
        const res = await fetch(`/api/ppv/send/status?code=${encodeURIComponent(code)}`);
        const data = (await res.json()) as { status?: string; error?: string | null };
        if (data.status === "sent" || data.status === "paid" || data.status === "delivered") {
          setNotice("✅ PPV delivered to fan");
          // refresh sidebar so the new outgoing messages appear in the chat
          void fetchDialogs(modelIdForRefresh, false);
          // auto-dismiss the success notice after a few seconds
          setTimeout(() => setNotice((n) => (n === "✅ PPV delivered to fan" ? "" : n)), 4_000);
          return;
        }
        if (data.status === "failed") {
          setNotice("");
          setError(`PPV send failed: ${data.error ?? "unknown error"}`);
          return;
        }
      } catch {
        // network blip — keep polling
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    setNotice("");
    setError("PPV send is taking too long — check /pay link or retry.");
  }

  async function handleSendTip() {
    if (!selectedDialog || !selectedModelId || !tipAmount) return;
    const amount = Number(String(tipAmount).replace(/[^0-9.]/g, ""));
    if (!amount || amount <= 0) return;
    setSending(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/tips/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: selectedModelId,
          peerId: selectedDialog.id,
          accessHash: selectedDialog.accessHash,
          peerUsername: selectedDialog.username,
          amount,
          message: tipMessage.trim() || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        tipUrl?: string;
      };
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      setTipAmount("");
      setTipMessage("");
      void fetchDialogs(selectedModelId, false);
      setNotice(`✅ Tip request sent ($${amount.toFixed(2)})`);
      setTimeout(
        () => setNotice((n) => (n.startsWith("✅ Tip") ? "" : n)),
        4_000,
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? `Tip send failed: ${e.message}` : "Tip send failed");
    } finally {
      setSending(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  // ── fan profile mutations ─────────────────────────────────────────────────

  async function handleAddNote() {
    if (!selectedModelId || !selectedDialog || !notes.trim()) return;
    setNotesSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/fans/${selectedModelId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          peerId: selectedDialog.id,
          body: notes,
          authorName: displayName,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { note?: FanNote; error?: string };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (data.note) setFanNotes((prev) => [data.note as FanNote, ...prev]);
      setNotes(""); // clear draft for the next note
    } catch (e: unknown) {
      setError(e instanceof Error ? `Note add failed: ${e.message}` : "Note add failed");
    } finally {
      setNotesSaving(false);
    }
  }

  async function handleDeleteNote(noteId: string) {
    if (!selectedModelId) return;
    const before = fanNotes;
    setFanNotes((prev) => prev.filter((n) => n.id !== noteId));
    try {
      const res = await fetch(
        `/api/fans/${selectedModelId}/notes?id=${encodeURIComponent(noteId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `HTTP ${res.status}`);
      }
    } catch (e: unknown) {
      setFanNotes(before); // rollback
      setError(e instanceof Error ? `Note delete failed: ${e.message}` : "Note delete failed");
    }
  }

  async function handleToggleTag(tag: string) {
    if (!selectedModelId || !selectedDialog) return;
    // Compute new tag list optimistically; rollback on failure.
    const current = fan?.tags ?? [];
    const next = current.includes(tag)
      ? current.filter((t) => t !== tag)
      : [...current, tag];
    // Optimistic update
    setFan((prev) =>
      prev
        ? { ...prev, tags: next }
        : ({
            id: "",
            model_id: selectedModelId,
            peer_id: selectedDialog.id,
            telegram_username: selectedDialog.username,
            telegram_name: selectedDialog.title,
            notes: "",
            total_spent: 0,
            tags: next,
            last_seen_at: null,
            created_at: new Date().toISOString(),
          } as FanRow),
    );
    try {
      const res = await fetch(`/api/fans/${selectedModelId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peerId: selectedDialog.id, tags: next }),
      });
      const data = (await res.json().catch(() => ({}))) as { fan?: FanRow; error?: string };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (data.fan) {
        setFan(data.fan);
        // Mirror updated tags into the chat list so the badge refreshes instantly.
        const peerId = selectedDialog?.id;
        if (peerId) {
          setFanTagsByPeer((prev) => ({ ...prev, [peerId]: data.fan!.tags ?? [] }));
        }
      }
    } catch (e: unknown) {
      // Rollback
      setFan((prev) => (prev ? { ...prev, tags: current } : prev));
      setError(e instanceof Error ? `Tag toggle failed: ${e.message}` : "Tag toggle failed");
    }
  }

  // ── derived data ──────────────────────────────────────────────────────────

  const unreadByModel = useMemo(() => {
    const out: Record<string, number> = {};
    // Badge shows COUNT OF DIALOGS with unread, not the total message count.
    for (const [mid, list] of Object.entries(dialogsByModel)) {
      out[mid] = list.filter((d) => (d.unreadCount ?? 0) > 0).length;
    }
    return out;
  }, [dialogsByModel]);

  const currentDialogs = useMemo(
    () => (selectedModelId ? dialogsByModel[selectedModelId] ?? [] : []),
    [dialogsByModel, selectedModelId],
  );

  const filteredDialogs = useMemo((): ChatListItem[] => {
    const q = search.trim().toLowerCase();
    let list = q
      ? currentDialogs.filter(
          (d) => d.title.toLowerCase().includes(q) || (d.username ?? "").toLowerCase().includes(q),
        )
      : currentDialogs;
    // Group filter: keep only dialogs whose peer is in the active group.
    if (activeGroupId) {
      list = list.filter((d) => (groupIdsByPeer[d.id] ?? []).includes(activeGroupId));
    }
    return list.map((d) => ({
      id: d.id,
      username: d.username ?? d.title,
      lastMessage: d.lastMessage || "—",
      time: formatTime(d.lastMessageDate),
      unread: d.unreadCount ?? 0,
      avatar: initialsFromTitle(d.title),
      status: d.status,
      tags: fanTagsByPeer[d.id] ?? [],
      spent: fanSpentByPeer[d.id] ?? 0,
    }));
  }, [currentDialogs, search, fanTagsByPeer, fanSpentByPeer, activeGroupId, groupIdsByPeer]);

  const chatMessages = useMemo(
    (): ChatMessage[] =>
      apiMessages.map((m): ChatMessage => {
        let media: MessageMediaInfo | null = null;
        if (m.media && selectedModelId && selectedDialog && m.id > 0) {
          // Optimistic messages have id < 0 — we have no real Telegram messageId
          // to fetch the full file with, so skip media for them.
          const params = new URLSearchParams({
            peerId: selectedDialog.id,
            messageId: String(m.id),
          });
          if (selectedDialog.accessHash) params.set("accessHash", selectedDialog.accessHash);
          const fullUrl = `/api/telegram/media/${selectedModelId}?${params.toString()}`;
          if (m.media.type === "photo") {
            media = {
              type: "photo",
              thumbDataUrl: m.media.thumbDataUrl,
              fullUrl,
              width: m.media.width,
              height: m.media.height,
            };
          } else if (m.media.type === "video") {
            media = {
              type: "video",
              thumbDataUrl: m.media.thumbDataUrl,
              fullUrl,
              width: m.media.width,
              height: m.media.height,
              durationSec: m.media.durationSec,
            };
          } else if (m.media.type === "sticker") {
            media = {
              type: "sticker",
              thumbDataUrl: m.media.thumbDataUrl,
              fullUrl,
              width: m.media.width,
              height: m.media.height,
              mimeType: m.media.mimeType,
              isAnimated: m.media.isAnimated,
            };
          } else {
            media = {
              type: "document",
              thumbDataUrl: m.media.thumbDataUrl,
              fullUrl,
              fileName: m.media.fileName,
              mimeType: m.media.mimeType,
              sizeBytes: m.media.sizeBytes,
            };
          }
        }
        // Resolve the reply target's text snippet from the loaded message
        // list. If the target isn't in our 50-message window (older
        // message) we still render the reply card with the quoteText (if
        // present) or a fallback "Message".
        let replyPreview: ChatMessage["replyPreview"] = null;
        if (m.replyTo) {
          const target = apiMessages.find((x) => x.id === m.replyTo!.msgId);
          const isToChatter = target ? target.isOutgoing : false;
          const targetText = target?.text?.trim() || (target?.media ? "[media]" : "");
          replyPreview = {
            targetMsgId: m.replyTo.msgId,
            targetText,
            quoteText: m.replyTo.quoteText,
            isToChatter,
          };
        }
        return {
          id: String(m.id),
          text: m.text || (media ? "" : "—"),
          time: formatTime(m.date),
          isChatter: m.isOutgoing,
          media,
          replyPreview,
          groupedId: m.groupedId ?? null,
        };
      }),
    [apiMessages, selectedModelId, selectedDialog],
  );

  // Merge chat_system_events into the rendered chat so the chatter sees
  // "Customer sent a tip of $X" inline. Sorted by event timestamp against
  // the Telegram message dates so the banner lands at the right spot in
  // the conversation. The TelegramChat component renders entries with
  // `system` as a centered banner, ignoring media / reply / grouping.
  const chatMessagesWithEvents = useMemo((): ChatMessage[] => {
    if (systemEvents.length === 0) return chatMessages;
    const sysAsMessages: (ChatMessage & { _sortKey: number })[] = systemEvents.map(
      (e): ChatMessage & { _sortKey: number } => ({
        id: `sys_${e.id}`,
        text: e.body,
        time: formatTime(e.createdAt),
        isChatter: false,
        media: null,
        replyPreview: null,
        groupedId: null,
        system: { kind: e.kind },
        _sortKey: e.createdAt,
      }),
    );
    const realWithKeys = chatMessages.map((m, idx): ChatMessage & { _sortKey: number } => ({
      ...m,
      _sortKey: apiMessages[idx]?.date ?? 0,
    }));
    const merged = [...realWithKeys, ...sysAsMessages].sort(
      (a, b) => a._sortKey - b._sortKey,
    );
    return merged.map(({ _sortKey: _omit, ...rest }) => {
      void _omit;
      return rest;
    });
  }, [chatMessages, systemEvents, apiMessages]);

  const selectedChatItem = useMemo((): ChatListItem | null => {
    if (!selectedDialog) return null;
    // Prefer the latest status from the polled list so it stays fresh as
    // dialogs refresh in the background.
    const live = currentDialogs.find((d) => d.id === selectedDialog.id);
    const source = live ?? selectedDialog;
    // Activity beats stale `entity.status` from getDialogs. If the fan was
    // typing/messaging within the last minute we show "online" / "typing…"
    // even when Telegram privacy reports only "last seen recently".
    let status = source.status;
    if (activity?.typing) status = "typing…";
    else if (activity?.online) status = "online";
    return {
      id: source.id,
      username: source.username ?? source.title,
      lastMessage: source.lastMessage || "—",
      time: formatTime(source.lastMessageDate),
      unread: source.unreadCount ?? 0,
      avatar: initialsFromTitle(source.title),
      status,
    };
  }, [selectedDialog, currentDialogs, activity]);

  // Chatter sets the price manually now — no derived total from item prices.

  // Fan-derived display values for the chat header.
  const totalSpentFormatted = useMemo(() => {
    const n = Number(fan?.total_spent ?? 0);
    if (!Number.isFinite(n) || n <= 0) return "$0";
    return `$${n.toFixed(0)}`;
  }, [fan]);
  const fanTags = useMemo(() => fan?.tags ?? [], [fan]);

  const recipientLabel = selectedDialog
    ? selectedDialog.username
      ? `@${selectedDialog.username}`
      : selectedDialog.title
    : "@user";

  const modelOptions = useMemo(
    () => models.map((m) => ({ id: m.id, name: m.name, unread: unreadByModel[m.id] ?? 0 })),
    [models, unreadByModel],
  );

  const selectedModelExpired = useMemo(
    () => models.find((m) => m.id === selectedModelId)?.session_status === "expired",
    [models, selectedModelId],
  );

  if (role === null) return null;

  // Both agency and chatter render the same indigo design
  // (Create_prompt_design → chatter-page-classic/*). No more per-role size
  // split — the components are imported directly at module scope above.

  return (
    <div
      className="chatter-root h-[100dvh] w-full flex flex-col bg-[#0d1117] text-white overflow-hidden"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif' }}
    >
      {/* Top-right toaster — pops a 5s toast when a tip/PPV this user sent
          gets paid. Only the link's creator sees it (API-scoped). */}
      <NotificationToaster />
      <Topbar
        displayName={displayName}
        sales="$0"
        onLogout={handleLogout}
        onBack={() => router.push("/dashboard")}
        reloading={reloading}
        onReload={async () => {
          if (reloading) return;
          if (!selectedModelId) return;
          setReloading(true);
          try {
            await fetchDialogs(selectedModelId, true);
            if (selectedDialog) {
              await fetchMessages(selectedModelId, selectedDialog);
            }
          } finally {
            setReloading(false);
          }
        }}
        models={modelOptions}
        selectedModelId={selectedModelId ?? undefined}
        onSelectModel={handleModelSelect}
      />
      {/* ModelSelectorBar is folded into the Topbar above (per user spec
          "no separate strip, no scroll, just chips right of the logo"). */}
      {selectedModelExpired && (
        <div className="px-5 py-2 bg-amber-500/10 border-b border-amber-500/30 text-[12px] text-amber-300 flex items-center gap-2">
          <span>⚠️</span>
          <span>
            This model&apos;s Telegram session expired.{" "}
            {role === "agency"
              ? "Reconnect it in Dashboard → Models."
              : "Ask your agency to reconnect it in Dashboard → Models."}
          </span>
        </div>
      )}
      {error && (
        <div className="px-5 py-1.5 bg-red-500/10 border-b border-red-500/30 text-[11px] text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError("")} className="text-[#6b7280] hover:text-white ml-4">×</button>
        </div>
      )}
      {notice && !error && (
        <div className="px-5 py-1.5 bg-emerald-500/10 border-b border-emerald-500/30 text-[11px] text-emerald-300 flex items-center justify-between">
          <span>{notice}</span>
          <button
            onClick={() => setNotice("")}
            className="text-[#6b7280] hover:text-white ml-4"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}
      <div className="flex-1 flex overflow-hidden">
        <TelegramChat
          chatList={filteredDialogs}
          selectedChat={selectedDialog?.id ?? ""}
          onSelectChat={handleDialogSelect}
          selected={selectedChatItem}
          modelId={selectedModelId}
          readOutboxMaxId={selectedDialog?.readOutboxMaxId}
          groups={fanGroups}
          activeGroupId={activeGroupId}
          onSelectGroup={setActiveGroupId}
          onCreateGroup={async (name) => {
            const r = await fetch("/api/groups", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name }),
            });
            if (r.ok) {
              const j = (await r.json()) as {
                group: { id: string; name: string; color: string; emoji: string | null };
              };
              setFanGroups((cur) => [...cur, j.group]);
            }
          }}
          onDeleteGroup={async (id) => {
            const r = await fetch(`/api/groups/${id}`, { method: "DELETE" });
            if (r.ok) {
              setFanGroups((cur) => cur.filter((g) => g.id !== id));
              if (activeGroupId === id) setActiveGroupId(null);
            }
          }}
          messages={chatMessagesWithEvents}
          totalSpent={totalSpentFormatted}
          inputText={inputText}
          onInputChange={setInputText}
          onSend={handleSend}
          search={search}
          onSearch={setSearch}
          sending={sending}
          fanTags={fanTags}
          onToggleTag={handleToggleTag}
          quickEmojis={quickEmojis}
          onAddQuickEmoji={async (em) => {
            if (quickEmojis.includes(em)) return;
            const next = [...quickEmojis, em].slice(0, 30);
            setQuickEmojis(next);
            // Persist into user_metadata so the bar follows the chatter
            // across devices. Best-effort.
            try {
              await supabase.auth.updateUser({
                data: { quick_emojis: next, quick_emojis_v: 2 },
              });
            } catch { /* ignore */ }
          }}
          onRemoveQuickEmoji={async (em) => {
            const next = quickEmojis.filter((e) => e !== em);
            setQuickEmojis(next);
            try {
              await supabase.auth.updateUser({
                data: { quick_emojis: next, quick_emojis_v: 2 },
              });
            } catch { /* ignore */ }
          }}
          scheduleAt={scheduleAt}
          onChangeScheduleAt={setScheduleAt}
          selectedFanGroupIds={selectedDialog ? (groupIdsByPeer[selectedDialog.id] ?? []) : []}
          onToggleFanGroup={async (groupId) => {
            if (!selectedDialog || !selectedModelId) return;
            const peerId = selectedDialog.id;
            const current = groupIdsByPeer[peerId] ?? [];
            const isMember = current.includes(groupId);
            // Optimistic flip — the header chip recolours instantly even
            // while the API call is in flight. Rollback if the call fails.
            setGroupIdsByPeer((prev) => ({
              ...prev,
              [peerId]: isMember
                ? current.filter((g) => g !== groupId)
                : [...current, groupId],
            }));
            try {
              if (isMember) {
                await fetch(
                  `/api/groups/${groupId}/members?modelId=${selectedModelId}&peerId=${peerId}`,
                  { method: "DELETE" },
                );
              } else {
                await fetch(`/api/groups/${groupId}/members`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ modelId: selectedModelId, peerId }),
                });
              }
            } catch {
              // Rollback optimistic update on failure.
              setGroupIdsByPeer((prev) => ({ ...prev, [peerId]: current }));
            }
          }}
          onOpenQuickReply={() => setQuickReplyOpen(true)}
          onOpenFanProfile={() => setFanDrawerOpen(true)}
          replyingTo={replyingTo}
          editing={editing}
          onCancelReply={() => setReplyingTo(null)}
          onCancelEdit={handleCancelEdit}
          onReplyToMessage={handleReplyToMessage}
          onReplyWithQuote={handleReplyWithQuote}
          onStartEdit={handleStartEdit}
          onDeleteMessage={handleDeleteMessage}
          mobileView={mobileView}
          onMobileBack={() => setMobileView("list")}
        />
        <div
          className={`${
            mobileView === "actions" ? "flex w-full" : "hidden"
          } xl:contents`}
        >
        <ActionPanel
          activeTab={activeTab}
          onTabChange={setActiveTab}
          ppvItems={ppvItems}
          ppvTags={ppvTags}
          ppvGroups={ppvGroups}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          selectedItems={selectedItems}
          onToggleItem={(id) =>
            setSelectedItems((prev) =>
              prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
            )
          }
          caption={caption}
          onCaptionChange={setCaption}
          priceInput={priceInput}
          onPriceInputChange={setPriceInput}
          pricingHint={pricingHint}
          expiresInHours={expiresInHours}
          onExpiresInHoursChange={setExpiresInHours}
          onSelectBundle={(itemIds, price) => {
            setSelectedItems(itemIds);
            setPriceInput(price > 0 ? String(price) : "");
          }}
          recipientLabel={recipientLabel}
          sending={sending}
          onSendPpv={handleSendPpv}
          tipAmount={tipAmount}
          onTipAmountChange={setTipAmount}
          tipMessage={tipMessage}
          onTipMessageChange={setTipMessage}
          onSendTip={handleSendTip}
          notes={notes}
          onNotesChange={setNotes}
          hasRecipient={!!selectedDialog}
          onAddNote={handleAddNote}
          notesSaving={notesSaving}
          notesList={fanNotes}
          onDeleteNote={handleDeleteNote}
          stats={stats}
        />
        </div>
      </div>

      {/* Mobile + tablet bottom nav — switches the single visible panel.
          Hidden only on desktop (>=xl) where all 3 panels show side by side. */}
      <div className="xl:hidden shrink-0 h-[54px] bg-[#161a22] border-t border-[#2a2d35] flex items-stretch">
        {([
          { key: "list", label: "Chats", icon: "💬" },
          { key: "chat", label: "Chat", icon: "✉️" },
          { key: "actions", label: "Send", icon: "💸" },
        ] as const).map((t) => {
          const active = mobileView === t.key;
          const disabled = t.key === "chat" && !selectedDialog;
          return (
            <button
              key={t.key}
              onClick={() => !disabled && setMobileView(t.key)}
              disabled={disabled}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
                active ? "text-[#6366f1]" : "text-[#6b7280]"
              } ${disabled ? "opacity-40" : ""}`}
            >
              <span className="text-[16px] leading-none">{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </div>

      <QuickReplyModal
        modelId={selectedModelId}
        open={quickReplyOpen}
        onClose={() => setQuickReplyOpen(false)}
        canManage={role === "agency"}
        onPick={(body) => {
          // Insert at end of current input, preceded by a single space if
          // user already typed something. Don't auto-send — user may want
          // to edit before hitting Send.
          setInputText((prev) => (prev.trim() ? `${prev} ${body}` : body));
        }}
      />
      <FanProfileDrawer
        open={fanDrawerOpen}
        onClose={() => setFanDrawerOpen(false)}
        modelId={selectedModelId}
        peerId={selectedDialog?.id ?? null}
        fan={fan}
        displayName={selectedDialog?.title ?? "User"}
        username={selectedDialog?.username ?? null}
      />
      <DeleteMessageModal
        open={!!deletingMessage}
        canRevoke={deletingMessage?.canRevoke ?? false}
        preview={deletingMessage?.text ?? ""}
        onClose={() => setDeletingMessage(null)}
        onConfirm={(revoke) => void confirmDeleteMessage(revoke)}
      />
    </div>
  );
}
