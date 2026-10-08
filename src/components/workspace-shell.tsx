"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Barcode,
  Boxes,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  CheckSquare2,
  ChevronDown,
  Factory,
  Grid2X2,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  ReceiptText,
  Settings,
  ShoppingCart,
  Store,
  UserRound,
  Users,
  WalletCards,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { signOut } from "firebase/auth";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { NotificationCenter } from "./notification-menu";
import { WorkspaceSearch } from "./workspace-search";
import { AttendanceHeartbeat } from "./attendance-heartbeat";
import { IdFinderCardModal } from "./id-finder-card-modal";
import type { IdFinderConnection } from "@/lib/id-finder";
import { MODULES, type ModuleKey } from "@/lib/types";
import { auth } from "@/lib/firebase-client";
const glyphs: Record<ModuleKey, ComponentType<{ size?: number }>> = {
  discuss: MessageCircle,
  calendar: CalendarDays,
  todo: CheckSquare2,
  contacts: Users,
  crm: ChartNoAxesCombined,
  sales: ReceiptText,
  dashboards: LayoutDashboard,
  pos: Store,
  accounting: WalletCards,
  purchase: ShoppingCart,
  inventory: Boxes,
  manufacturing: Factory,
  "shop-floor": Wrench,
  barcode: Barcode,
};
export function WorkspaceShell({
  companyId,
  companyName,
  accountId,
  accountName,
  accountIdFinder,
  role,
  modules,
  canManageMembers,
  canManageApps,
  children,
}: {
  companyId: string;
  companyName: string;
  accountId: string;
  accountName: string;
  accountIdFinder?: IdFinderConnection;
  role: string;
  modules: ModuleKey[];
  canManageMembers: boolean;
  canManageApps: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [companyMenu, setCompanyMenu] = useState(false);
  const [accountCard, setAccountCard] = useState(false);
  const companyMenuRef = useRef<HTMLDivElement>(null);
  const path = usePathname();
  const base = `/workspace/${companyId}`;
  const accountHue = Array.from(accountId).reduce(
    (hash, character) => (hash * 31 + character.charCodeAt(0)) % 360,
    0,
  );
  const links = [
    {
      href: `${base}/dashboard`,
      label: "Overview",
      icon: <LayoutDashboard size={18} />,
    },
    ...(canManageApps
      ? [{ href: `${base}/apps`, label: "Apps", icon: <Grid2X2 size={18} /> }]
      : []),
    ...(canManageMembers
      ? [
          {
            href: `${base}/employees`,
            label: "Employees",
            icon: <Users size={18} />,
          },
        ]
      : []),
    ...(canManageMembers || canManageApps
      ? [
          {
            href: `${base}/settings`,
            label: "Settings",
            icon: <Settings size={18} />,
          },
        ]
      : []),
  ];
  useEffect(() => {
    if (!companyMenu) return;
    const close = (event: MouseEvent) => {
      if (!companyMenuRef.current?.contains(event.target as Node))
        setCompanyMenu(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [companyMenu]);
  useEffect(() => {
    const closeDetails = (event: PointerEvent) => {
      document.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((details) => {
        if (!details.contains(event.target as Node)) details.open = false;
      });
    };
    document.addEventListener("pointerdown", closeDetails);
    return () => document.removeEventListener("pointerdown", closeDetails);
  }, []);
  async function logout() {
    if (auth) await signOut(auth);
    await fetch("/api/auth/session", { method: "DELETE" });
    location.href = "/login";
  }
  return (
    <div className="min-h-screen md:pl-[248px]">
      <AttendanceHeartbeat companyId={companyId} />
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-dvh w-[248px] flex-col overflow-hidden bg-[var(--sidebar)] p-4 text-[var(--sidebarText)] transition-transform md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex shrink-0 items-center justify-between px-2 py-1">
          <Logo />
          <button className="md:hidden" onClick={() => setOpen(false)}>
            <X />
          </button>
        </div>
        <div className="relative my-6 shrink-0" ref={companyMenuRef}>
          <button
            type="button"
            aria-expanded={companyMenu}
            aria-haspopup="menu"
            onClick={() => setCompanyMenu((value) => !value)}
            className="flex w-full items-center gap-3 rounded-xl bg-white/7 p-3 text-left hover:bg-white/10"
          >
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/10">
              <Building2 size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">
                {companyName}
              </span>
              <span className="block text-xs capitalize text-white/45">
                {role}
              </span>
            </span>
            <ChevronDown
              size={15}
              className={`transition ${companyMenu ? "rotate-180" : ""}`}
            />
          </button>
          {companyMenu && (
            <div
              role="menu"
              className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-xl border border-white/10 bg-[#121b18] p-2 shadow-2xl"
            >
              <p className="px-2 py-2 text-xs text-white/45">
                This is the only Toro workspace.
              </p>
              <MenuLink
                href="/account/settings"
                icon={<UserRound size={15} />}
                label="Account settings"
                close={() => setCompanyMenu(false)}
              />
              <button
                role="menuitem"
                onClick={logout}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-white/60 hover:bg-white/8 hover:text-white"
              >
                <LogOut size={15} /> Logout
              </button>
            </div>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3">
          <nav className="space-y-1">
            {links.map((l) => (
              <Link
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${path === l.href ? "bg-[var(--accent)] text-white" : "text-white/60 hover:bg-white/5 hover:text-white"}`}
                href={l.href}
                key={l.href}
              >
                {l.icon}
                {l.label}
              </Link>
            ))}
          </nav>
          <p className="mb-2 mt-7 px-3 text-[10px] font-bold uppercase tracking-[.2em] text-white/35">
            Enabled apps
          </p>
          <nav className="space-y-1">
            {MODULES.filter((m) => modules.includes(m.key)).map((m) => {
              const Icon = glyphs[m.key];
              return (
                <Link
                  key={m.key}
                  href={`${base}/${m.key}`}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${path === `${base}/${m.key}` ? "bg-white/8 text-white" : "text-white/55 hover:bg-white/5 hover:text-white"}`}
                >
                  <span className="grid w-5 place-items-center">
                    <Icon size={16} />
                  </span>
                  {m.name}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-17 items-center gap-3 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] px-4 backdrop-blur-lg sm:px-7">
          <button
            className="btn btn-secondary !p-2 md:hidden"
            onClick={() => setOpen(true)}
          >
            <Menu size={18} />
          </button>
          <WorkspaceSearch
            companyId={companyId}
            hasCrm={modules.includes("crm")}
          />
          <div className="ml-auto flex gap-2">
            <ThemeToggle />
            <NotificationCenter companyId={companyId} />
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-full font-bold text-white transition hover:ring-2 hover:ring-[var(--accent)] hover:ring-offset-2 hover:ring-offset-[var(--bg)] disabled:cursor-default disabled:hover:ring-0"
              style={{ backgroundColor: `hsl(${accountHue} 68% 46%)` }}
              title={accountIdFinder ? `Open ${accountName}'s ID card` : accountName}
              aria-label={`Signed in as ${accountName}`}
              disabled={!accountIdFinder}
              onClick={() => setAccountCard(true)}
            >
              {accountName.trim()[0]?.toUpperCase() || "U"}
            </button>
          </div>
        </header>
        <main className="p-4 sm:p-7 lg:p-10">{children}</main>
      </div>
      {open && (
        <button
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
        />
      )}
      {accountCard && accountIdFinder && (
        <IdFinderCardModal
          connection={accountIdFinder}
          close={() => setAccountCard(false)}
        />
      )}
    </div>
  );
}

function MenuLink({
  href,
  icon,
  label,
  close,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  close: () => void;
}) {
  return (
    <Link
      role="menuitem"
      href={href}
      onClick={close}
      className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-white/60 hover:bg-white/8 hover:text-white"
    >
      {icon}
      {label}
    </Link>
  );
}
