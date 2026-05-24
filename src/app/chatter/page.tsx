"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Topbar } from "@/components/chatter-page/Topbar";
import { ModelSelectorBar } from "@/components/chatter-page/ModelSelectorBar";
import { TelegramChat, type ChatListItem, type Message as ChatMessage } from "@/components/chatter-page/TelegramChat";
import { ActionPanel, type PpvItem, type PpvTag } from "@/components/chatter-page/ActionPanel";

// ─── types ──────────────────────────────────────────────────────────────────

type Model = { id: string; name: string; username: string | null; avatar_url: string | null };

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
};

type ApiMessage = { id: number; text: string; date: number; isOutgoing: boolean };

type Tab = "ppv" | "tips" | "notes" | "stats";

// Polls overlap server-side via gramJS per-model serializer; keep intervals
// modest and additionally guard with in-flight refs (see fetchDialogs/fetchMessages).
const DIALOGS_POLL_MS = 10_000;
const MESSAGES_POLL_MS = 5_000;

// ─── helpers ────────────────────────────────────────────────────────────────

function formatTime(unix: number) {
  if (!unix) return "";
  const d = new Date(unix * 1000);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString();
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

  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"agency" | "chatter" | null>(null);

  const [models, setModels] = useState<Model[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  const [dialogsByModel, setDialogsByModel] = useState<Record<string, Dialog[]>>({});
  const [selectedDialog, setSelectedDialog] = useState<Dialog | null>(null);
  const [apiMessages, setApiMessages] = useState<ApiMessage[]>([]);

  const [search, setSearch] = useState("");
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const [activeTab, setActiveTab] = useState<Tab>("ppv");
  const [ppvItems, setPpvItems] = useState<PpvItem[]>([]);
  const [ppvTags, setPpvTags] = useState<PpvTag[]>([]);
  const [activeFilter, setActiveFilter] = useState("All");
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [tipAmount, setTipAmount] = useState("");
  const [tipMessage, setTipMessage] = useState("");
  const [notes, setNotes] = useState("");

  const autoSelectedRef = useRef<string | null>(null);
  // Track in-flight network requests so polling never piles up requests
  // against the per-model gramJS serializer in the server-side pool.
  const dialogsInFlight = useRef<Set<string>>(new Set());
  const messagesInFlight = useRef(false);
  // While a POST (send / PPV / tip) is in-flight, pause all polling so the
  // POST doesn't get queued behind a freshly-fired GET in the server pool.
  const sendInFlightRef = useRef(false);

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

      if (r === "agency") {
        const { data } = await supabase
          .from("models")
          .select("id, name, username, avatar_url")
          .eq("agency_user_id", user.id);
        if (cancelled) return;
        const list = (data ?? []) as Model[];
        setModels(list);
        if (list.length > 0) setSelectedModelId(list[0].id);
      } else {
        const { data: ac } = await supabase
          .from("agency_chatters")
          .select("model_id")
          .eq("chatter_id", user.id)
          .maybeSingle();
        if (cancelled) return;
        const modelId = (ac as { model_id: string | null } | null)?.model_id ?? null;
        if (modelId) {
          const { data: m } = await supabase
            .from("models")
            .select("id, name, username, avatar_url")
            .eq("id", modelId)
            .maybeSingle();
          if (cancelled) return;
          if (m) {
            const model = m as Model;
            setModels([model]);
            setSelectedModelId(model.id);
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, router]);

  // ── PPV data per model ────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selectedModelId) {
        if (cancelled) return;
        setPpvItems([]);
        setPpvTags([]);
        return;
      }
      const [{ data: tagsRaw }, { data: itemsRaw }, { data: links }] = await Promise.all([
        supabase.from("ppv_tags").select("id, model_id, name, color, emoji").eq("model_id", selectedModelId),
        supabase
          .from("ppvs")
          .select("id, model_id, name, price, media_url, created_at")
          .eq("model_id", selectedModelId)
          .order("created_at", { ascending: false }),
        supabase.from("ppv_item_tags").select("ppv_id, tag_id"),
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
      }>).map((row) => ({
        id: row.id,
        name: row.name,
        price: row.price,
        media_url: row.media_url,
        tags: linksByItem.get(row.id) ?? [],
      }));
      setPpvTags(tags);
      setPpvItems(items);
      setActiveFilter("All");
      setSelectedItems([]);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, selectedModelId]);

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
      const list: Dialog[] = data.dialogs ?? [];
      setDialogsByModel((prev) => ({ ...prev, [modelId]: list }));
      if (autoSelectFirst && list.length > 0 && autoSelectedRef.current !== modelId) {
        autoSelectedRef.current = modelId;
        setSelectedDialog(list[0]);
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
    }, DIALOGS_POLL_MS);
    return () => {
      clearTimeout(tid);
      clearInterval(iv);
    };
  }, [selectedModelId, fetchDialogs]);

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
      const res = await fetch(url.toString());
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      const list: ApiMessage[] = data.messages ?? [];
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
    }, MESSAGES_POLL_MS);
    return () => {
      clearTimeout(tid);
      clearInterval(iv);
    };
  }, [selectedModelId, selectedDialog, fetchMessages]);

  // ── handlers ──────────────────────────────────────────────────────────────

  function handleModelSelect(id: string) {
    autoSelectedRef.current = null;
    setSelectedDialog(null);
    setApiMessages([]);
    setSelectedModelId(id);
  }

  function handleDialogSelect(id: string) {
    const modelId = selectedModelId;
    const list = modelId ? dialogsByModel[modelId] ?? [] : [];
    const d = list.find((x) => x.id === id) ?? null;
    setSelectedDialog(d);
    setApiMessages([]);

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
  ): Promise<ApiMessage | null> {
    sendInFlightRef.current = true;
    try {
      const res = await fetch(`/api/telegram/messages/${modelId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peerId: dialog.id, accessHash: dialog.accessHash, text }),
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

  async function handleSend() {
    if (!inputText.trim() || !selectedModelId || !selectedDialog) return;
    setSending(true);
    setError("");
    const text = inputText;
    const dialog = selectedDialog;
    const modelId = selectedModelId;
    setInputText("");
    // Optimistic: negative id so fetchMessages's merge keeps it until the
    // server response includes a real matching outgoing message.
    const optimisticId = -Date.now();
    setApiMessages((prev) => [
      ...prev,
      { id: optimisticId, text, date: Math.floor(Date.now() / 1000), isOutgoing: true },
    ]);
    try {
      const real = await sendTelegramMessage(modelId, dialog, text);
      // Replace optimistic with real message so subsequent polls de-dupe by id.
      if (real) {
        setApiMessages((prev) =>
          prev.map((m) => (m.id === optimisticId ? real : m)),
        );
      }
      void fetchDialogs(modelId, false);
    } catch (e: unknown) {
      setError(e instanceof Error ? `Send failed: ${e.message}` : "Send failed");
      setInputText(text);
      // remove the optimistic message on failure
      setApiMessages((prev) => prev.filter((m) => m.id !== optimisticId));
    } finally {
      setSending(false);
    }
  }

  async function handleSendPpv() {
    if (!selectedDialog || !selectedModelId || !selectedItems.length) return;
    const selected = ppvItems.filter((i) => selectedItems.includes(i.id));
    const total = selected.reduce((s, i) => s + Number(i.price ?? 0), 0);
    const names = selected.map((i) => i.name).join(", ");
    const body = [caption.trim(), `🔒 PPV: ${names}`, `Total: $${total}`].filter(Boolean).join("\n");
    setSending(true);
    setError("");
    try {
      await sendTelegramMessage(selectedModelId, selectedDialog, body);
      setSelectedItems([]);
      setCaption("");
      void fetchDialogs(selectedModelId, false);
    } catch (e: unknown) {
      setError(e instanceof Error ? `PPV send failed: ${e.message}` : "PPV send failed");
    } finally {
      setSending(false);
    }
  }

  async function handleSendTip() {
    if (!selectedDialog || !selectedModelId || !tipAmount) return;
    const amount = String(tipAmount).replace(/[^0-9.]/g, "");
    if (!amount) return;
    const body = [tipMessage.trim(), `💰 Tip request: $${amount}`].filter(Boolean).join("\n");
    setSending(true);
    setError("");
    try {
      await sendTelegramMessage(selectedModelId, selectedDialog, body);
      setTipAmount("");
      setTipMessage("");
      void fetchDialogs(selectedModelId, false);
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
    const list = q
      ? currentDialogs.filter(
          (d) => d.title.toLowerCase().includes(q) || (d.username ?? "").toLowerCase().includes(q),
        )
      : currentDialogs;
    return list.map((d) => ({
      id: d.id,
      username: d.username ?? d.title,
      lastMessage: d.lastMessage || "—",
      time: formatTime(d.lastMessageDate),
      unread: d.unreadCount ?? 0,
      avatar: initialsFromTitle(d.title),
      status: d.status,
    }));
  }, [currentDialogs, search]);

  const chatMessages = useMemo(
    (): ChatMessage[] =>
      apiMessages.map((m) => ({
        id: String(m.id),
        text: m.text || "—",
        time: formatTime(m.date),
        isChatter: m.isOutgoing,
      })),
    [apiMessages],
  );

  const selectedChatItem = useMemo((): ChatListItem | null => {
    if (!selectedDialog) return null;
    // Prefer the latest status from the polled list so it stays fresh as
    // dialogs refresh in the background.
    const live = currentDialogs.find((d) => d.id === selectedDialog.id);
    const source = live ?? selectedDialog;
    return {
      id: source.id,
      username: source.username ?? source.title,
      lastMessage: source.lastMessage || "—",
      time: formatTime(source.lastMessageDate),
      unread: source.unreadCount ?? 0,
      avatar: initialsFromTitle(source.title),
      status: source.status,
    };
  }, [selectedDialog, currentDialogs]);

  const totalPrice = useMemo(
    () => ppvItems.filter((i) => selectedItems.includes(i.id)).reduce((s, i) => s + Number(i.price ?? 0), 0),
    [ppvItems, selectedItems],
  );

  const recipientLabel = selectedDialog
    ? selectedDialog.username
      ? `@${selectedDialog.username}`
      : selectedDialog.title
    : "@user";

  const modelOptions = useMemo(
    () => models.map((m) => ({ id: m.id, name: m.name, unread: unreadByModel[m.id] ?? 0 })),
    [models, unreadByModel],
  );

  if (role === null) return null;

  return (
    <div
      className="chatter-root h-screen w-screen flex flex-col bg-[#0d1117] text-white overflow-hidden"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif' }}
    >
      <Topbar displayName={displayName} sales="$0" onLogout={handleLogout} />
      <ModelSelectorBar
        models={modelOptions}
        selectedModel={selectedModelId ?? ""}
        onModelSelect={handleModelSelect}
      />
      {error && (
        <div className="px-5 py-1.5 bg-red-500/10 border-b border-red-500/30 text-[11px] text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError("")} className="text-[#6b7280] hover:text-white ml-4">×</button>
        </div>
      )}
      <div className="flex-1 flex overflow-hidden">
        <TelegramChat
          chatList={filteredDialogs}
          selectedChat={selectedDialog?.id ?? ""}
          onSelectChat={handleDialogSelect}
          selected={selectedChatItem}
          messages={chatMessages}
          totalSpent="$0"
          inputText={inputText}
          onInputChange={setInputText}
          onSend={handleSend}
          search={search}
          onSearch={setSearch}
          sending={sending}
        />
        <ActionPanel
          activeTab={activeTab}
          onTabChange={setActiveTab}
          ppvItems={ppvItems}
          ppvTags={ppvTags}
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
          totalPrice={totalPrice}
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
        />
      </div>
    </div>
  );
}
