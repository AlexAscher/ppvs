"use client";

import { Send, Lock } from 'lucide-react';

interface TopbarProps {
  displayName: string;
  sales: string;
  onLogout: () => void;
}

export function Topbar({ displayName, sales, onLogout }: TopbarProps) {
  return (
    <div className="h-[52px] bg-[#1a1d24] border-b border-[#2a2d35] flex items-center justify-between px-5">
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 bg-gradient-to-br from-[#6366f1] to-[#4f46e5] rounded-md flex items-center justify-center relative shadow-sm">
          <Send className="w-3.5 h-3.5 text-white" />
          <Lock className="w-2 h-2 text-white absolute bottom-0.5 right-0.5" />
        </div>
        <div className="text-[13px] font-semibold">
          chatter<span className="text-[#6366f1]">.ppvs.io</span>
        </div>
      </div>

      <div className="flex items-center gap-2 px-4 py-1.5 bg-[#1f2937]/40 border border-[#374151]/50 rounded-full">
        <span className="text-[12px] font-medium text-[#d1d5db]">{displayName}</span>
        <span className="text-[14px]">✍️</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="px-5 py-2 bg-gradient-to-r from-[#6366f1]/10 to-[#4f46e5]/10 border border-[#6366f1]/30 rounded-lg">
          <div className="flex flex-col items-center">
            <div className="text-[9px] text-[#9ca3af] uppercase tracking-wider">All Time Net Sales</div>
            <div className="text-[18px] font-bold text-[#6366f1]">{sales}</div>
          </div>
        </div>
        <button onClick={onLogout} className="text-[11px] text-[#6b7280] hover:text-[#9ca3af] transition-colors">Logout</button>
      </div>
    </div>
  );
}
