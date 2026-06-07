"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { AutoRepliesSection } from "./AutoRepliesSection";
import { SalesAlertsSection } from "./SalesAlertsSection";
import { PayoutSection } from "./PayoutSection";

/**
 * Settings — shared by agency dashboard and chatter dashboard. All writes
 * go through Supabase Auth (no extra tables) except auto-replies which
 * live on the models table:
 *   - Profile display name → user_metadata.full_name
 *   - Password            → auth.updateUser({ password })
 *   - Auto replies        → /api/auto-reply/[modelId] (agency only)
 *
 * `role` gates the agency-only Auto Replies section.
 */
export function SettingsTab({ role }: { role: "agency" | "chatter" }) {
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");

  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setEmail(user.email ?? "");
      setDisplayName(
        (user.user_metadata?.full_name as string) ||
          (user.user_metadata?.display_name as string) ||
          "",
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveProfile() {
    setSavingProfile(true);
    setProfileMsg("");
    try {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: displayName.trim() },
      });
      if (error) throw error;
      setProfileMsg("Saved ✓");
    } catch (e: unknown) {
      setProfileMsg(e instanceof Error ? `Error: ${e.message}` : "Error");
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword() {
    if (newPassword.length < 6) {
      setPasswordMsg("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg("Passwords don't match");
      return;
    }
    setSavingPassword(true);
    setPasswordMsg("");
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setPasswordMsg("Password updated ✓");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e: unknown) {
      setPasswordMsg(e instanceof Error ? `Error: ${e.message}` : "Error");
    } finally {
      setSavingPassword(false);
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

  return (
    <div className="flex-1 bg-[#0d1117] overflow-y-auto p-4 md:p-6">
      <div className="max-w-[640px] mx-auto space-y-5">
        <div>
          <h1 className="text-[22px] md:text-[24px] font-bold text-white mb-1">Settings ⚙️</h1>
          <p className="text-[13px] text-[#9ca3af]">Manage your profile, password{role === "agency" ? " and auto-replies" : ""}.</p>
        </div>

        {/* Profile */}
        <div className={card}>
          <h2 className="text-[15px] font-semibold text-white mb-4">Profile</h2>
          <div className="space-y-3">
            <div>
              <label className={label}>Display name</label>
              <input
                className={input}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
              />
            </div>
            <div>
              <label className={label}>Email</label>
              <input className={`${input} opacity-60 cursor-not-allowed`} value={email} disabled />
            </div>
            <div className="flex items-center gap-3">
              <button className={btn} onClick={saveProfile} disabled={savingProfile}>
                {savingProfile ? "Saving…" : "Save profile"}
              </button>
              {profileMsg && <span className={msgCls(profileMsg)}>{profileMsg}</span>}
            </div>
          </div>
        </div>

        {/* Password */}
        <div className={card}>
          <h2 className="text-[15px] font-semibold text-white mb-4">Change password</h2>
          <div className="space-y-3">
            <div>
              <label className={label}>New password</label>
              <input
                type="password"
                className={input}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className={label}>Confirm new password</label>
              <input
                type="password"
                className={input}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>
            <div className="flex items-center gap-3">
              <button className={btn} onClick={savePassword} disabled={savingPassword}>
                {savingPassword ? "Updating…" : "Update password"}
              </button>
              {passwordMsg && <span className={msgCls(passwordMsg)}>{passwordMsg}</span>}
            </div>
          </div>
        </div>

        {/* Sales Alerts — agency only */}
        {role === "agency" && <SalesAlertsSection />}

        {/* Payout & Splits — agency only */}
        {role === "agency" && <PayoutSection />}

        {/* Auto Replies — agency only */}
        {role === "agency" && <AutoRepliesSection />}
      </div>
    </div>
  );
}
