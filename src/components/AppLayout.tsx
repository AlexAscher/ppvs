"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@/app/logo";
import { createClient } from "@/lib/supabase";

function IconGrid() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}
function IconSend() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M22 2L11 13" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M22 2L15 22l-4-9-9-4 20-7z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconVault() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 9V7M12 17v-2M9 12H7M17 12h-2" strokeLinecap="round" />
    </svg>
  );
}
function IconChat() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconTeam() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="9" cy="7" r="4" />
      <path
        d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"
        strokeLinecap="round"
      />
      <path
        d="M16 3.13a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0-3-3.87"
        strokeLinecap="round"
      />
    </svg>
  );
}
function IconPayouts() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" strokeLinecap="round" />
      <circle cx="7" cy="15" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IconSearch() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
    </svg>
  );
}
function IconBell() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" />
    </svg>
  );
}

const AGENCY_NAV = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: <IconGrid />,
    href: "/dashboard",
    section: "Main",
  },
  { id: "send", label: "Send PPV", icon: <IconSend />, href: "/send" },
  { id: "vault", label: "Vault", icon: <IconVault />, href: "/vault" },
  { id: "chatter", label: "Chatting", icon: <IconChat />, href: "/chatter" },
  {
    id: "team",
    label: "Team",
    icon: <IconTeam />,
    href: "/team",
    section: "Manage",
  },
  {
    id: "payouts",
    label: "Payouts",
    icon: <IconPayouts />,
    href: "/dashboard",
  },
];

const CHATTER_NAV = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: <IconGrid />,
    href: "/dashboard",
    section: "Main",
  },
  { id: "chatter", label: "Chatting", icon: <IconChat />, href: "/chatter" },
  { id: "team", label: "Team", icon: <IconTeam />, href: "/team" },
  { id: "vault", label: "Vault", icon: <IconVault />, href: "/vault" },
  { id: "send", label: "Send PPV", icon: <IconSend />, href: "/send" },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [displayName, setDisplayName] = useState("...");
  const [initials, setInitials] = useState("?");
  const [role, setRole] = useState<"agency" | "chatter" | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      const name =
        (user.user_metadata?.display_name as string | undefined) ??
        user.email?.split("@")[0] ??
        "User";
      setDisplayName(name);
      setInitials(
        name
          .split(" ")
          .map((n: string) => n[0])
          .join("")
          .slice(0, 2)
          .toUpperCase(),
      );
      setRole((user.user_metadata?.role as "agency" | "chatter") ?? "chatter");
    });
  }, [supabase]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const nav = role === null ? [] : role === "agency" ? AGENCY_NAV : CHATTER_NAV;
  const navItems = nav.map((item, i) => ({
    ...item,
    showHeader:
      !!item.section && (i === 0 || item.section !== nav[i - 1].section),
  }));

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: "var(--dash-bg)" }}
    >
      {/* Sidebar */}
      <aside className="w-[220px] shrink-0 bg-[var(--dash-surface)] border-r border-[var(--dash-border)] flex flex-col h-full">
        <div className="px-5 py-[18px] border-b border-[var(--dash-border)]">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo size={30} />
            <span className="text-[15px] font-semibold tracking-tight">
              ppvs<span className="text-[var(--blue)]">.io</span>
            </span>
          </Link>
        </div>

        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));

            return (
              <div key={item.id}>
                {item.showHeader && (
                  <div className="text-[10px] text-[var(--dash-dim)] tracking-[0.08em] uppercase px-2.5 mb-1.5 mt-3 first:mt-0">
                    {item.section}
                  </div>
                )}
                <Link
                  href={item.href}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-[8px] rounded-[8px] text-[13px] mb-0.5 transition-colors ${
                    isActive
                      ? "bg-[var(--dash-card)] text-[var(--dash-text)]"
                      : "text-[var(--dash-muted)] hover:text-[var(--dash-text)] hover:bg-[#ffffff08]"
                  }`}
                >
                  <span
                    className={
                      isActive ? "text-[var(--blue)]" : "text-[var(--dash-dim)]"
                    }
                  >
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              </div>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-[var(--dash-border)] space-y-2">
          <div className="flex items-center gap-2.5 px-2.5 py-2">
            <div className="w-8 h-8 rounded-full bg-[#00AFF020] flex items-center justify-center text-[12px] font-bold text-[var(--blue)] shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="text-[12px] text-[var(--dash-text)] font-semibold truncate">
                {displayName}
              </div>
              <div className="text-[10px] text-[var(--dash-muted)] capitalize">
                {role ?? ""}
              </div>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-2.5 py-[7px] rounded-[8px] text-[12px] text-[var(--dash-dim)] hover:text-[var(--dash-text)] hover:bg-[#ffffff06] transition-colors bg-transparent border-none cursor-pointer"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path
                d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
                strokeLinecap="round"
              />
              <polyline
                points="16 17 21 12 16 7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <line x1="21" y1="12" x2="9" y2="12" strokeLinecap="round" />
            </svg>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <div className="h-[56px] shrink-0 bg-[var(--dash-surface)] border-b border-[var(--dash-border)] flex items-center justify-between px-6">
          <div className="flex items-center gap-2 bg-[var(--dash-bg)] border border-[var(--dash-border)] rounded-[8px] px-3 py-2 w-[240px]">
            <span className="text-[var(--dash-dim)]">
              <IconSearch />
            </span>
            <input
              type="text"
              placeholder="Search fans, content..."
              className="bg-transparent border-none outline-none text-[13px] text-[var(--dash-text)] placeholder-[var(--dash-dim)] w-full"
            />
          </div>
          <div className="flex items-center gap-4">
            {role === "agency" && (
              <>
                <div className="text-[13px] text-[var(--dash-muted)]">
                  Balance:{" "}
                  <span className="text-[var(--blue)] font-semibold text-[14px]">
                    $0.00
                  </span>
                </div>
                <button className="bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-[12px] font-semibold px-3.5 py-[7px] rounded-[7px] border-none transition-colors cursor-pointer">
                  Withdraw
                </button>
              </>
            )}
            <button className="relative text-[var(--dash-muted)] hover:text-[var(--dash-text)] transition-colors bg-transparent border-none p-1 cursor-pointer">
              <IconBell />
              <span className="absolute top-0 right-0 w-[7px] h-[7px] bg-[var(--blue)] rounded-full" />
            </button>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
