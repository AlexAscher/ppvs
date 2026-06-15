"use client";

import { useState } from "react";
import { X, Mail, ChevronDown, Send } from "lucide-react";
import { ChatterModel } from "./types";

type Props = {
  models: ChatterModel[];
  onClose: () => void;
  onInvited: () => void;
};

export function InviteChatterModal({ models, onClose, onInvited }: Props) {
  const [email, setEmail] = useState("");
  const [modelId, setModelId] = useState<string>(models[0]?.id ?? "");
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!email.trim() || !modelId) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/chatters/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), modelId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send invitation");
      onInvited();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  const selectedModel = models.find((m) => m.id === modelId);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#161a22] border border-[#2a2d35] rounded-xl shadow-2xl w-full max-w-[440px] p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-[18px] font-semibold text-white">Invite Chatter</h2>
            <p className="text-[12px] text-[#9ca3af] mt-1">Send an invitation to join your agency</p>
          </div>
          <button onClick={onClose} className="text-[#6b7280] hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[12px] text-[#9ca3af] font-medium mb-1.5 block">Chatter Email</label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#6b7280]" />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="chatter@example.com"
                type="email"
                className="w-full pl-10 pr-4 py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[14px] text-white placeholder:text-[#4b5563] focus:border-[#00AFF0] focus:outline-none transition-colors"
              />
            </div>
            <p className="text-[11px] text-[#6b7280] mt-1.5">Must be an existing ppvs.io account</p>
          </div>

          <div>
            <label className="text-[12px] text-[#9ca3af] font-medium mb-1.5 block">Assign to Creator</label>
            {models.length === 0 ? (
              <div className="px-4 py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[13px] text-[#9ca3af]">
                No creators yet. Add a creator first.
              </div>
            ) : (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowDropdown((v) => !v)}
                  className="w-full px-4 py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[14px] text-white text-left flex items-center justify-between hover:border-[#4b5563] transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {selectedModel?.avatar_url ? (
                      <img src={selectedModel.avatar_url} alt={selectedModel.name} className="w-6 h-6 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#00AFF0] to-[#00AFF0] shrink-0" />
                    )}
                    <span className="truncate">{selectedModel?.name ?? "Select creator"}</span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-[#6b7280] shrink-0" />
                </button>
                {showDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-[#1f2937] border border-[#374151] rounded-lg shadow-xl overflow-hidden z-10 max-h-[200px] overflow-y-auto">
                    {models.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => { setModelId(m.id); setShowDropdown(false); }}
                        className={`w-full px-4 py-2.5 text-left text-[13px] hover:bg-[#374151] transition-colors flex items-center gap-2.5 ${modelId === m.id ? "bg-[#374151] text-[#00AFF0]" : "text-white"}`}
                      >
                        {m.avatar_url ? (
                          <img src={m.avatar_url} alt={m.name} className="w-6 h-6 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#00AFF0] to-[#00AFF0] shrink-0" />
                        )}
                        <span className="truncate">{m.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {error && <p className="text-[12px] text-red-400">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={loading || !email.trim() || !modelId}
            className="w-full py-3 bg-gradient-to-r from-[#00AFF0] to-[#00AFF0] text-white rounded-lg font-semibold text-[14px] disabled:opacity-50 disabled:cursor-not-allowed hover:from-[#0098D4] hover:to-[#0098D4] transition-all flex items-center justify-center gap-2"
          >
            <Send className="w-4 h-4" />
            {loading ? "Sending…" : "Send Invitation"}
          </button>
        </div>
      </div>
    </div>
  );
}
