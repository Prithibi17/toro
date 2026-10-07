import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Building2, Settings } from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoutButton } from "@/components/logout-button";
import { currentUser, memberships } from "@/lib/session";
import type { Membership } from "@/lib/types";
import { InvitationSync } from "@/components/invitation-sync";
import { PendingInvitations } from "@/components/pending-invitations";

export default async function SelectCompany() {
  const user = await currentUser();
  if (!user) redirect("/login");
  let list: Membership[] = [];
  let setupError = false;
  try {
    list = await memberships(user.uid);
  } catch {
    setupError = true;
  }
  if (list.length === 1)
    redirect(`/workspace/${list[0].companyId}/dashboard`);
  return (
    <main className="min-h-screen p-5 sm:p-10">
      <InvitationSync />
      <header className="mx-auto flex max-w-6xl items-center justify-between">
        <Logo />
        <div className="flex gap-2">
          <ThemeToggle />
          <LogoutButton />
        </div>
      </header>
      <section className="mx-auto max-w-6xl py-16">
        <div className="mb-10 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 text-sm font-bold uppercase tracking-[.2em] text-[var(--accent)]">
              Your companies
            </p>
            <h1 className="text-4xl font-extrabold tracking-tight">
              Choose your workspace
            </h1>
            <p className="mt-2 muted">
              Welcome back, {user.name || user.email}.
            </p>
          </div>
        </div>
        {setupError && (
          <div className="panel mb-6 border-amber-400/40 p-5 text-sm">
            Firebase Admin is not configured yet. Add the server environment
            variables to load real memberships.
          </div>
        )}
        <PendingInvitations />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((m) => (
            <Link
              key={m.companyId}
              href={`/workspace/${m.companyId}/dashboard`}
              className="panel group p-6 transition hover:-translate-y-1 hover:border-[var(--accent)]"
            >
              <div className="mb-8 flex items-start justify-between">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--soft)]">
                  <Building2 />
                </span>
                <ArrowRight className="muted transition group-hover:translate-x-1 group-hover:text-[var(--accent)]" />
              </div>
              <h2 className="text-xl font-bold">{m.companyName}</h2>
              <p className="mt-1 text-sm capitalize muted">
                {m.role} · {m.status}
              </p>
            </Link>
          ))}
        </div>
        <div className="mt-8 flex gap-4 text-sm muted">
          <Link className="flex items-center gap-1" href="/account/settings">
            <Settings size={15} />
            Account settings
          </Link>
        </div>
      </section>
    </main>
  );
}
