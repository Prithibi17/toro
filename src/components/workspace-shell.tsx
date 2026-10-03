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
  Check,
  Factory,
  Grid2X2,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  ReceiptText,
  Search,
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
import { NotificationMenu } from "./notification-menu";
import { MODULES, type ModuleKey } from "@/lib/types";
import { auth } from "@/lib/firebase-client";
type CompanyOption = { id: string; name: string; role: string };
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
  role,
  modules,
  canManageMembers,
  canManageApps,
  children,
}: {
  companyId: string;
  companyName: string;
  role: string;
  modules: ModuleKey[];
  canManageMembers: boolean;
  canManageApps: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [companyMenu, setCompanyMenu] = useState(false);
  const [companies, setCompanies] = useState<CompanyOption[] | null>(null);
  const companyMenuRef = useRef<HTMLDivElement>(null);
  const path = usePathname();
  const base = `/workspace/${companyId}`;
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
  async function toggleCompanyMenu() {
    const next = !companyMenu;
    setCompanyMenu(next);
    if (next && !companies) {
      const response = await fetch("/api/companies");
      if (response.ok) setCompanies((await response.json()).companies ?? []);
      else setCompanies([]);
    }
  }
  async function logout() {
    if (auth) await signOut(auth);
    await fetch("/api/auth/session", { method: "DELETE" });
    location.href = "/login";
  }
  return (
    <div className="min-h-screen md:grid md:grid-cols-[248px_1fr]">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[248px] bg-[var(--sidebar)] p-4 text-[var(--sidebarText)] transition md:static md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-2 py-1">
          <Logo />
          <button className="md:hidden" onClick={() => setOpen(false)}>
            <X />
          </button>
        </div>
        <div className="relative my-6" ref={companyMenuRef}>
          <button
            type="button"
            aria-expanded={companyMenu}
            aria-haspopup="menu"
            onClick={toggleCompanyMenu}
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
              <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-[.16em] text-white/35">
                Workspaces
              </p>
              {companies === null ? (
                <p className="px-2 py-3 text-xs text-white/45">Loading…</p>
              ) : (
                companies.map((company) => (
                  <Link
                    role="menuitem"
                    key={company.id}
                    href={`/workspace/${company.id}/dashboard`}
                    onClick={() => setCompanyMenu(false)}
                    className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-white/70 hover:bg-white/8 hover:text-white"
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-md bg-white/8">
                      <Building2 size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        {company.name}
                      </span>
                      <span className="block text-[10px] capitalize text-white/40">
                        {company.role}
                      </span>
                    </span>
                    {company.id === companyId && <Check size={14} />}
                  </Link>
                ))
              )}
              <div className="my-1 border-t border-white/10" />
              <MenuLink
                href="/select-company"
                icon={<Grid2X2 size={15} />}
                label="All workspaces"
                close={() => setCompanyMenu(false)}
              />
              <MenuLink
                href="/create-company"
                icon={<Plus size={15} />}
                label="Create company"
                close={() => setCompanyMenu(false)}
              />
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
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-17 items-center gap-3 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] px-4 backdrop-blur-lg sm:px-7">
          <button
            className="btn btn-secondary !p-2 md:hidden"
            onClick={() => setOpen(true)}
          >
            <Menu size={18} />
          </button>
          <div className="relative hidden max-w-md flex-1 sm:block">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 muted"
              size={17}
            />
            <input
              className="input !pl-10"
              placeholder="Search this workspace…"
            />
          </div>
          <div className="ml-auto flex gap-2">
            <ThemeToggle />
            <NotificationMenu companyId={companyId} />
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--accent)] font-bold text-white">
              {companyName[0]?.toUpperCase()}
            </span>
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
