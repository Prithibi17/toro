import Link from "next/link";
import { notFound } from "next/navigation";
import { memberRoleLabel } from "@/lib/member-role";
import { Mail, ShieldCheck, Users } from "lucide-react";
import { MODULES, type ModuleKey } from "@/lib/types";
import { authorizeCompany } from "@/lib/authorization";
import { getAdmin } from "@/lib/firebase-admin";
import { OperationalModule } from "@/components/operational-module";
import { ContactsWorkspace } from "@/components/contacts-workspace";
import { CalendarWorkspace } from "@/components/calendar-workspace";

export default async function ModulePage({
  params,
}: {
  params: Promise<{ companyId: string; module: string }>;
}) {
  const { companyId, module } = await params;
  const moduleKey = MODULES.find((item) => item.key === module)?.key;
  const authz = await authorizeCompany(
    companyId,
    moduleKey ? { module: moduleKey } : {},
  );
  if (!authz.ok) notFound();
  const ctx = authz.access;
  if (
    module === "apps" &&
    (ctx.membership.role === "owner" ||
      ctx.effectivePermissions.actions["security.apps.manage"] ||
      ctx.effectivePermissions.legacyPermissions["apps.manage"])
  )
    return (
      <Apps
        companyId={companyId}
        enabled={ctx.membership.enabledModules || []}
      />
    );
  if (
    module === "employees" &&
    (ctx.membership.role === "owner" ||
      ctx.effectivePermissions.actions["security.members.manage"] ||
      ctx.effectivePermissions.legacyPermissions["members.manage"])
  )
    return <Employees companyId={companyId} />;
  if (module === "dashboards") return <Dashboard companyId={companyId} />;
  if (
    module === "contacts" &&
    ctx.membership.enabledModules?.includes("contacts")
  )
    return <ContactsWorkspace companyId={companyId} />;
  if (
    module === "calendar" &&
    ctx.membership.enabledModules?.includes("calendar")
  )
    return (
      <CalendarWorkspace
        companyId={companyId}
        userId={ctx.user.uid}
        userName={ctx.user.name ?? ctx.user.email ?? "My Calendar"}
      />
    );
  const found = MODULES.find((m) => m.key === module);
  if (!found || !ctx.membership.enabledModules?.includes(found.key)) notFound();
  return <OperationalModule companyId={companyId} module={module} />;
}

function Heading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mb-8">
      <p className="text-sm font-semibold text-[var(--accent)]">
        Company administration
      </p>
      <h1 className="mt-1 text-3xl font-extrabold">{title}</h1>
      <p className="mt-2 muted">{description}</p>
    </div>
  );
}

function Apps({
  companyId,
  enabled,
}: {
  companyId: string;
  enabled: ModuleKey[];
}) {
  return (
    <>
      <Heading
        title="Application launcher"
        description="Open the business tools enabled for this company."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {MODULES.map((m) => {
          const on = enabled.includes(m.key);
          return (
            <Link
              key={m.key}
              href={on ? `/workspace/${companyId}/${m.key}` : "#"}
              aria-disabled={!on}
              className={`panel p-5 transition ${on ? "hover:-translate-y-1 hover:border-[var(--accent)]" : "cursor-not-allowed opacity-45"}`}
            >
              <div className="mb-8 grid h-11 w-11 place-items-center rounded-xl bg-[var(--soft)] font-bold">
                {m.name.slice(0, 1)}
              </div>
              <h2 className="font-bold">{m.name}</h2>
              <p className="mt-1 text-sm muted">{m.description}</p>
              <p
                className={`mt-4 text-xs font-bold ${on ? "text-emerald-500" : "muted"}`}
              >
                {on ? "ENABLED" : "DISABLED"}
              </p>
            </Link>
          );
        })}
      </div>
    </>
  );
}

async function Employees({ companyId }: { companyId: string }) {
  const db = getAdmin().db;
  const [members, invitations] = await Promise.all([
    db.collection(`companies/${companyId}/members`).get(),
    db
      .collection(`companies/${companyId}/invitations`)
      .where("status", "==", "pending")
      .get(),
  ]);
  return (
    <>
      <Heading
        title="Employees"
        description="Active company memberships and pending invitations."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          icon={<Users />}
          label="Active members"
          value={String(
            members.docs.filter((d) => d.data().status === "active").length,
          )}
        />
        <Stat
          icon={<Mail />}
          label="Pending invitations"
          value={String(invitations.size)}
        />
        <Stat
          icon={<ShieldCheck />}
          label="Administrators"
          value={String(
            members.docs.filter((d) =>
              ["owner", "admin"].includes(d.data().role),
            ).length,
          )}
        />
      </div>
      <div className="panel mt-6 overflow-hidden">
        <div className="grid grid-cols-[1.4fr_1fr_.7fr] border-b border-[var(--border)] px-5 py-3 text-xs font-bold uppercase tracking-wider muted">
          <span>Employee</span>
          <span>Role</span>
          <span>Status</span>
        </div>
        {members.docs.map((d) => {
          const x = d.data();
          return (
            <div
              key={d.id}
              className="grid grid-cols-[1.4fr_1fr_.7fr] items-center border-b border-[var(--border)] px-5 py-4 last:border-0"
            >
              <div>
                <b>{x.displayName || x.email || "Unnamed member"}</b>
                <p className="mt-1 text-sm muted">{x.email}</p>
              </div>
              <span>{memberRoleLabel(x.role)}</span>
              <span className="capitalize text-emerald-500">{x.status}</span>
            </div>
          );
        })}
        {members.empty && (
          <p className="p-8 text-center muted">No memberships found.</p>
        )}
      </div>
    </>
  );
}

async function Dashboard({ companyId }: { companyId: string }) {
  const db = getAdmin().db;
  const [tasks, deals, contacts, orders, members] = await Promise.all([
    db.collection(`companies/${companyId}/tasks`).get(),
    db.collection(`companies/${companyId}/crmDeals`).get(),
    db.collection(`companies/${companyId}/contacts`).get(),
    db.collection(`companies/${companyId}/salesOrders`).get(),
    db.collection(`companies/${companyId}/members`).get(),
  ]);
  const values = [
    ["Open tasks", tasks.docs.filter((d) => d.data().status !== "done").length],
    ["CRM opportunities", deals.size],
    ["Contacts", contacts.size],
    ["Sales records", orders.size],
    [
      "Team members",
      members.docs.filter((d) => d.data().status === "active").length,
    ],
  ];
  return (
    <>
      <Heading
        title="Dashboards"
        description="A live summary of records across this company."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {values.map(([label, value]) => (
          <div className="panel p-5" key={label}>
            <p className="text-sm muted">{label}</p>
            <p className="mt-3 text-3xl font-extrabold">{value}</p>
          </div>
        ))}
      </div>
      <div className="panel mt-6 p-6">
        <h2 className="font-bold">Operational readiness</h2>
        <div className="mt-5 space-y-4">
          {values.slice(0, 4).map(([label, value]) => (
            <div key={label}>
              <div className="mb-2 flex justify-between text-sm">
                <span>{label}</span>
                <b>{value}</b>
              </div>
              <div className="h-2 rounded-full bg-[var(--soft)]">
                <div
                  className="h-2 rounded-full bg-[var(--accent)]"
                  style={{ width: `${Math.min(100, Number(value) * 10)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm muted">{label}</p>
        <span className="rounded-lg bg-[var(--soft)] p-2">{icon}</span>
      </div>
      <p className="mt-3 text-3xl font-extrabold">{value}</p>
    </div>
  );
}
