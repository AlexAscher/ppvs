"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";

/**
 * QuickReplyModal — shared between classic and agency variants.
 *
 * Two modes:
 *   - `mode="pick"` (chatter or agency): list templates, click inserts the
 *     body into the chat input via `onPick`.
 *   - `mode="manage"` (agency only): list templates with add/edit/delete.
 *
 * In `mode="pick"` agency users still see a small "+ New" button that
 * switches the modal to manage view; chatters only see Pick. The parent
 * passes `canManage` to gate that.
 */

export type Template = {
  id: string;
  model_id: string;
  title: string;
  body: string;
  sort_order: number;
  created_at: string;
};

interface Props {
  modelId: string | null;
  open: boolean;
  onClose: () => void;
  onPick: (body: string) => void;
  canManage: boolean;
}

export function QuickReplyModal({ modelId, open, onClose, onPick, canManage }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !modelId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/templates/${modelId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        if (cancelled) return;
        setTemplates((data.templates ?? []) as Template[]);
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, modelId]);

  useEffect(() => {
    // Deferred reset — React 19 strict effects ban synchronous setState
    // in the effect body.
    if (open) return;
    const tid = setTimeout(() => {
      setEditingId(null);
      setDraftTitle("");
      setDraftBody("");
      setError("");
    }, 0);
    return () => clearTimeout(tid);
  }, [open]);

  if (!open) return null;

  function startEdit(t: Template) {
    setEditingId(t.id);
    setDraftTitle(t.title);
    setDraftBody(t.body);
  }

  function startNew() {
    setEditingId("new");
    setDraftTitle("");
    setDraftBody("");
  }

  async function saveDraft() {
    if (!modelId || !draftTitle.trim() || !draftBody.trim()) return;
    setSaving(true);
    setError("");
    try {
      if (editingId === "new") {
        const res = await fetch(`/api/templates/${modelId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: draftTitle, body: draftBody }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        setTemplates((prev) => [...prev, data.template as Template]);
      } else if (editingId) {
        const res = await fetch(`/api/templates/${modelId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingId, title: draftTitle, body: draftBody }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        setTemplates((prev) =>
          prev.map((t) => (t.id === editingId ? (data.template as Template) : t)),
        );
      }
      setEditingId(null);
      setDraftTitle("");
      setDraftBody("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate(id: string) {
    if (!modelId) return;
    if (!confirm("Delete this template?")) return;
    setError("");
    try {
      const res = await fetch(`/api/templates/${modelId}?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[520px] max-h-[80vh] bg-[#161a22] border border-[#2a2d35] rounded-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#2a2d35] flex items-center justify-between">
          <div>
            <div className="text-[14px] font-semibold text-white">Quick Replies</div>
            <div className="text-[11px] text-[#6b7280] mt-0.5">
              {canManage ? "Click to insert · pencil to edit" : "Click any template to insert"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canManage && editingId === null && (
              <button
                onClick={startNew}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#00AFF0] hover:bg-[#0098D4] rounded-md text-[12px] font-semibold text-white"
              >
                <Plus className="w-3.5 h-3.5" /> New
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-[#1f2937] text-[#9ca3af] hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {error && (
            <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-md text-[11px] text-red-400">
              {error}
            </div>
          )}

          {editingId !== null && canManage && (
            <div className="p-3 bg-[#1f2937]/60 border border-[#374151] rounded-lg space-y-2">
              <input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="Title (e.g. Greeting)"
                className="w-full px-3 py-2 bg-[#1f2937] border border-[#374151] rounded-md text-[12px] text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#00AFF0]"
              />
              <textarea
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                placeholder="Body of the reply…"
                rows={4}
                className="w-full px-3 py-2 bg-[#1f2937] border border-[#374151] rounded-md text-[12px] text-white placeholder:text-[#6b7280] resize-none focus:outline-none focus:border-[#00AFF0]"
              />
              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={() => {
                    setEditingId(null);
                    setDraftTitle("");
                    setDraftBody("");
                  }}
                  className="px-3 py-1.5 text-[12px] text-[#9ca3af] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={saveDraft}
                  disabled={saving || !draftTitle.trim() || !draftBody.trim()}
                  className="px-4 py-1.5 bg-gradient-to-r from-[#00AFF0] to-[#00AFF0] text-white rounded-md text-[12px] font-semibold disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          )}

          {loading && (
            <div className="text-center py-6 text-[12px] text-[#6b7280]">Loading…</div>
          )}

          {!loading && templates.length === 0 && editingId === null && (
            <div className="text-center py-8 text-[12px] text-[#6b7280]">
              {canManage
                ? "No templates yet — hit «New» to add one."
                : "No templates have been created for this model yet."}
            </div>
          )}

          {templates.map((t) => (
            <div
              key={t.id}
              className="group p-3 bg-[#1f2937]/40 hover:bg-[#1f2937] border border-[#2a2d35] rounded-lg flex items-start gap-3"
            >
              <button
                onClick={() => {
                  onPick(t.body);
                  onClose();
                }}
                className="flex-1 text-left min-w-0"
              >
                <div className="text-[12px] font-semibold text-white mb-1">{t.title}</div>
                <div className="text-[11px] text-[#9ca3af] line-clamp-2 whitespace-pre-wrap">
                  {t.body}
                </div>
              </button>
              {canManage && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => startEdit(t)}
                    aria-label="Edit"
                    className="px-2 py-1 text-[10px] text-[#9ca3af] hover:text-white"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteTemplate(t.id)}
                    aria-label="Delete"
                    className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-red-500/15 text-[#9ca3af] hover:text-red-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
