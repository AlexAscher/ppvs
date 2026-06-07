"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Upload, X, Image as ImageIcon, Film } from "lucide-react";
import { createClient } from "@/lib/supabase";

/**
 * Auto Replies — agency Settings section.
 *
 * - Model picker (one auto-reply per model). Defaults to first.
 * - Enable toggle.
 * - Message textarea (≤ 4 KB).
 * - Single attached photo/video (Supabase Storage, ppvs bucket).
 *
 * Saved fields are read/written through /api/auto-reply/[modelId].
 * Media upload goes browser → Supabase Storage directly (RLS-safe path
 * under the agency's user id, same convention as PpvMediaInput).
 */

type Model = { id: string; name: string };

type Config = {
  enabled: boolean;
  text: string;
  mediaUrl: string | null;
  mediaType: "photo" | "video" | null;
};

function inferMediaType(file: File): "photo" | "video" | null {
  if (file.type.startsWith("image/")) return "photo";
  if (file.type.startsWith("video/")) return "video";
  return null;
}

export function AutoRepliesSection() {
  const supabase = createClient();

  const [agencyUserId, setAgencyUserId] = useState<string | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  const [config, setConfig] = useState<Config>({
    enabled: false,
    text: "",
    mediaUrl: null,
    mediaType: null,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load agency user + models on mount.
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setAgencyUserId(user.id);
      const { data } = await supabase
        .from("models")
        .select("id, name")
        .eq("agency_user_id", user.id);
      const list = (data ?? []) as Model[];
      setModels(list);
      if (list.length > 0) setSelectedModelId(list[0].id);
    })();
  }, [supabase]);

  // Reload config when the selected model changes.
  useEffect(() => {
    if (!selectedModelId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/auto-reply/${selectedModelId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as Config;
        if (cancelled) return;
        setConfig({
          enabled: !!data.enabled,
          text: data.text ?? "",
          mediaUrl: data.mediaUrl ?? null,
          mediaType: data.mediaType ?? null,
        });
        setMsg("");
      } catch (e: unknown) {
        if (!cancelled) setMsg(e instanceof Error ? `Error: ${e.message}` : "Error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedModelId]);

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !agencyUserId) return;
    const kind = inferMediaType(file);
    if (!kind) {
      setMsg("Error: pick an image or video");
      return;
    }
    setUploading(true);
    setMsg("");
    try {
      // Path scheme: {agencyUserId}/auto_reply_{modelId}.{ext}. Replacing the
      // file overwrites the previous attachment for this model.
      const ext = (file.name.split(".").pop() ?? "bin").toLowerCase();
      const path = `${agencyUserId}/auto_reply_${selectedModelId}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("ppvs")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const publicUrl = supabase.storage.from("ppvs").getPublicUrl(path).data.publicUrl;
      // Cache-buster so the UI shows the new file immediately.
      const url = `${publicUrl}?t=${Date.now()}`;
      setConfig((c) => ({ ...c, mediaUrl: url, mediaType: kind }));
      setMsg("Uploaded ✓");
    } catch (e: unknown) {
      setMsg(e instanceof Error ? `Error: ${e.message}` : "Upload error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleClearMedia() {
    setConfig((c) => ({ ...c, mediaUrl: null, mediaType: null }));
  }

  async function handleSave() {
    if (!selectedModelId) return;
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch(`/api/auto-reply/${selectedModelId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: config.enabled,
          text: config.text,
          mediaUrl: config.mediaUrl,
          mediaType: config.mediaType,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      setMsg("Saved ✓");
    } catch (e: unknown) {
      setMsg(e instanceof Error ? `Error: ${e.message}` : "Save error");
    } finally {
      setSaving(false);
    }
  }

  const card = "bg-[#161a22] border border-[#2a2d35] rounded-xl p-5 md:p-6";
  const label = "block text-[12px] text-[#9ca3af] mb-1.5 font-medium";
  const input =
    "w-full px-3.5 py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[13px] text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#6366f1]";
  const btn =
    "px-5 py-2.5 bg-gradient-to-r from-[#6366f1] to-[#4f46e5] text-white rounded-lg font-semibold text-[12px] hover:from-[#5558e3] hover:to-[#4338ca] transition-all disabled:opacity-50 disabled:cursor-not-allowed";
  const msgCls = (m: string) =>
    `text-[11px] ${m.startsWith("Error") ? "text-red-400" : "text-emerald-400"}`;

  const selectedModel = models.find((m) => m.id === selectedModelId);

  return (
    <div className={card}>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h2 className="text-[15px] font-semibold text-white">Auto Replies 🤖</h2>
          <p className="text-[12px] text-[#6b7280] mt-1">
            Auto-respond to a fan&apos;s very first message with a custom
            greeting + optional photo/video. Sent once per fan, then your
            chatters take over.
          </p>
        </div>
        {/* Model picker */}
        <div className="relative shrink-0">
          <button
            onClick={() => setShowModelDropdown((v) => !v)}
            className="px-3 py-2 bg-[#1f2937] border border-[#374151] rounded-lg text-[12px] font-medium text-white hover:bg-[#374151] transition-all flex items-center gap-2 min-w-[160px] justify-between"
          >
            <span className="truncate">{selectedModel?.name ?? "Select creator"}</span>
            <ChevronDown className="w-3.5 h-3.5 shrink-0" />
          </button>
          {showModelDropdown && (
            <div className="absolute top-full right-0 mt-1 w-full bg-[#1f2937] border border-[#374151] rounded-lg shadow-xl overflow-hidden z-10 max-h-[200px] overflow-y-auto">
              {models.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { setSelectedModelId(m.id); setShowModelDropdown(false); }}
                  className={`w-full px-3 py-2 text-[12px] text-left hover:bg-[#374151] transition-colors ${
                    selectedModelId === m.id ? "bg-[#374151] text-[#6366f1]" : "text-white"
                  }`}
                >
                  {m.name}
                </button>
              ))}
              {models.length === 0 && (
                <div className="px-3 py-2 text-[11px] text-[#6b7280]">No creators</div>
              )}
            </div>
          )}
        </div>
      </div>

      {!selectedModelId ? (
        <p className="text-[12px] text-[#6b7280] mt-4">
          Add a creator in the Creators tab to configure auto-replies.
        </p>
      ) : loading ? (
        <p className="text-[12px] text-[#6b7280] mt-4">Loading…</p>
      ) : (
        <div className="space-y-4 mt-4">
          {/* Enable toggle */}
          <label className="flex items-center justify-between gap-3 p-3 bg-[#1f2937]/40 border border-[#2a2d35] rounded-lg cursor-pointer hover:bg-[#1f2937]/70 transition-colors">
            <div>
              <div className="text-[13px] font-medium text-white">Enable auto-replies</div>
              <div className="text-[11px] text-[#9ca3af] mt-0.5">
                Send this message to every brand-new fan automatically
              </div>
            </div>
            <input
              type="checkbox"
              className="sr-only peer"
              checked={config.enabled}
              onChange={(e) => setConfig((c) => ({ ...c, enabled: e.target.checked }))}
            />
            {/* Custom switch */}
            <div className="relative w-11 h-6 bg-[#374151] rounded-full peer-checked:bg-[#6366f1] transition-colors shrink-0">
              <div
                className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform"
                style={{ transform: config.enabled ? "translateX(20px)" : "translateX(0)" }}
              />
            </div>
          </label>

          {/* Message text */}
          <div>
            <label className={label}>Message</label>
            <textarea
              className={`${input} resize-none`}
              rows={4}
              maxLength={4096}
              value={config.text}
              onChange={(e) => setConfig((c) => ({ ...c, text: e.target.value }))}
              placeholder="Hey 💋 thanks for the message! Stick around — got a lot to show you 🔥"
            />
            <div className="text-[10px] text-[#6b7280] mt-1 text-right">
              {config.text.length} / 4096
            </div>
          </div>

          {/* Attached media */}
          <div>
            <label className={label}>Attachment (optional)</label>
            {config.mediaUrl ? (
              <div className="relative rounded-lg overflow-hidden border border-[#374151] bg-[#1f2937] aspect-video flex items-center justify-center max-w-[360px]">
                {config.mediaType === "video" ? (
                  <video
                    src={config.mediaUrl}
                    controls
                    muted
                    className="w-full h-full object-contain"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={config.mediaUrl}
                    alt="Auto-reply attachment"
                    className="w-full h-full object-contain"
                  />
                )}
                <button
                  onClick={handleClearMedia}
                  className="absolute top-2 right-2 w-7 h-7 bg-black/70 backdrop-blur rounded-full flex items-center justify-center text-white hover:bg-red-500 transition-colors"
                  aria-label="Remove attachment"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/70 backdrop-blur rounded text-[10px] font-semibold text-white flex items-center gap-1">
                  {config.mediaType === "video" ? <Film className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                  {config.mediaType === "video" ? "Video" : "Photo"}
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full max-w-[360px] aspect-video bg-[#1f2937]/40 border-2 border-dashed border-[#374151] hover:border-[#6366f1]/50 rounded-lg flex flex-col items-center justify-center gap-2 text-[#6b7280] hover:text-white transition-colors disabled:opacity-50"
              >
                <Upload className="w-6 h-6" />
                <div className="text-[12px] font-medium">
                  {uploading ? "Uploading…" : "Click to upload photo or video"}
                </div>
                <div className="text-[10px]">JPG, PNG, WebP · MP4, MOV, WebM</div>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={handleFilePick}
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button className={btn} onClick={handleSave} disabled={saving || uploading}>
              {saving ? "Saving…" : "Save auto-reply"}
            </button>
            {msg && <span className={msgCls(msg)}>{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
