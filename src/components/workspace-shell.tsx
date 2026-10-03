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
  Menu,
  MessageCircle,
  ReceiptText,
  Search,
  Settings,
  ShoppingCart,
  Store,
  Users,
  WalletCards,
  Wrench,
  X,
} from "lucide-react";
import { useState, type ComponentType } from "react";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { NotificationMenu } from "./notification-menu";
import { MODULES, type ModuleKey } from "@/lib/types";
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
  children,
}: {
  companyId: string;
  companyName: string;
  role: string;
  modules: ModuleKey[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const base = `/workspace/${companyId}`;
  const links = [
    {
      href: `${base}/dashboard`,
      label: "Overview",
      icon: <LayoutDashboard size={18} />,
    },
    { href: `${base}/apps`, label: "Apps", icon: <Grid2X2 size={18} /> },
    {
      href: `${base}/employees`,
      label: "Employees",
      icon: <Users size={18} />,
    },
    {
      href: `${base}/settings`,
      label: "Settings",
      icon: <Settings size={18} />,
    },
  ];
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
        <Link
          href="/select-company"
          className="my-6 flex items-center gap-3 rounded-xl bg-white/7 p-3"
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
          <ChevronDown size={15} />
        </Link>
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
