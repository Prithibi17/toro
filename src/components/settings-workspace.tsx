"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AppWindow,
  Building2,
  CalendarDays,
  CheckSquare2,
  ChevronRight,
  Contact,
  KeyRound,
  Mail,
  MessageCircle,
  Search,
  Settings2,
  ShieldCheck,
  Users,
  Webhook,
} from "lucide-react";
import { MODULES, type ModuleKey } from "@/lib/types";

type Data = Record<string, unknown>;
type NavItem = {
  id: string;
  label: string;
  keywords: string;
  icon?: React.ReactNode;
  privileged?: boolean;
  module?: ModuleKey;
};
type NavGroup = { label: string; items: NavItem[] };

const groups: NavGroup[] = [
  {
    label: "General",
    items: [
      {
        id: "general",
        label: "General Settings",
        keywords: "regional language timezone currency documents notifications",
        icon: <Settings2 size={16} />,
      },
      {
        id: "company",
        label: "Company",
        keywords: "company profile address tax business",
        icon: <Building2 size={16} />,
        privileged: true,
      },
      {
        id: "companies",
        label: "Companies",
        keywords: "workspaces company switching",
        icon: <Building2 size={16} />,
        privileged: true,
      },
    ],
  },
  {
    label: "Access & Security",
    items: [
      {
        id: "users",
        label: "Members",
        keywords: "members employees invited portal access",
        icon: <Users size={16} />,
        privileged: true,
      },
      {
        id: "permissions",
        label: "Roles",
        keywords: "roles custom authority inheritance",
        icon: <ShieldCheck size={16} />,
        privileged: true,
      },
      {
        id: "access/organization",
        label: "Departments & Teams",
        keywords: "departments teams organization",
        icon: <Users size={16} />,
        privileged: true,
      },
      {
        id: "access/apps",
        label: "App Access",
        keywords: "applications member app access",
        icon: <AppWindow size={16} />,
        privileged: true,
      },
      {
        id: "security/audit",
        label: "Audit Log",
        keywords: "history actor action target result",
        icon: <ShieldCheck size={16} />,
        privileged: true,
      },
      {
        id: "access/advanced",
        label: "Advanced",
        keywords: "field access approval limits security policies",
        icon: <KeyRound size={16} />,
        privileged: true,
      },
    ],
  },
  {
    label: "Applications",
    items: [
      {
        id: "discuss",
        label: "Discuss",
        keywords: "messages channels calls meetings notifications retention",
        icon: <MessageCircle size={16} />,
        module: "discuss",
      },
      {
        id: "calendar",
        label: "Calendar",
        keywords: "working hours reminders meetings google outlook",
        icon: <CalendarDays size={16} />,
        module: "calendar",
      },
      {
        id: "todo",
        label: "To-Do",
        keywords: "tasks sharing privacy retention activities",
        icon: <CheckSquare2 size={16} />,
        module: "todo",
      },
      {
        id: "contacts",
        label: "Contacts",
        keywords: "contact types tags duplicates addresses archive",
        icon: <Contact size={16} />,
        module: "contacts",
      },
      {
        id: "crm",
        label: "CRM",
        keywords:
          "pipeline stages leads scoring assignment automation forecast",
        icon: <AppWindow size={16} />,
        module: "crm",
      },
      {
        id: "sales",
        label: "Sales",
        keywords: "quotations orders pricing discounts taxes approvals",
        icon: <AppWindow size={16} />,
        module: "sales",
      },
    ],
  },
  {
    label: "Integrations",
    items: [
      {
        id: "integrations/email",
        label: "Email",
        keywords: "outgoing incoming aliases sender templates delivery",
        icon: <Mail size={16} />,
      },
      {
        id: "integrations/calendar",
        label: "Calendar Integrations",
        keywords: "google outlook calendar connect",
        icon: <CalendarDays size={16} />,
      },
      {
        id: "integrations/api",
        label: "API & Webhooks",
        keywords: "api service accounts credentials webhooks logs",
        icon: <Webhook size={16} />,
        privileged: true,
      },
    ],
  },
  {
    label: "Security",
    items: [
      {
        id: "security/authentication",
        label: "Authentication",
        keywords: "password login mfa methods security",
        icon: <KeyRound size={16} />,
        privileged: true,
      },
      {
        id: "security/sessions",
        label: "Sessions",
        keywords: "active sessions devices revoke",
        icon: <Users size={16} />,
        privileged: true,
      },
    ],
  },
];

export function SettingsWorkspace(props: {
  companyId: string;
  selected: string;
  company: Data;
  enabledModules: ModuleKey[];
  canManageMembers: boolean;
  canManageApps: boolean;
  members: Data[];
  roles: Data[];
  audits: Data[];
}) {
  const router = useRouter();
  const { companyId, selected, enabledModules, canManageMembers } = props;
  const [query, setQuery] = useState("");
  const visible = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          items: group.items.filter(
            (item) =>
              (!item.privileged || canManageMembers) &&
              (!item.module || enabledModules.includes(item.module)) &&
              (!query ||
                `${item.label} ${item.keywords}`
                  .toLowerCase()
                  .includes(query.toLowerCase())),
          ),
        }))
        .filter((group) => group.items.length),
    [query, canManageMembers, enabledModules],
  );
  return (
    <div className="-m-4 min-h-[calc(100vh-68px)] sm:-m-7 lg:-m-10 lg:grid lg:grid-cols-[238px_minmax(0,1fr)]">
      <aside className="border-b border-[var(--border)] bg-[var(--panel)] p-4 lg:sticky lg:top-17 lg:h-[calc(100vh-68px)] lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <h1 className="px-2 text-lg font-extrabold">Settings</h1>
        <label className="relative mt-3 block">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 muted"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="input !py-2 !pl-9 text-sm"
            placeholder="Search settings..."
          />
        </label>
        <nav className="mt-4 space-y-5">
          {visible.map((group) => (
            <div key={group.label}>
              <p className="mb-1 px-2 text-[10px] font-bold uppercase tracking-[.16em] muted">
                {group.label}
              </p>
              {group.items.map((item) => (
                <Link
                  key={item.id}
                  href={`/workspace/${companyId}/settings/${item.id}`}
                  prefetch={false}
                  onMouseEnter={() =>
                    router.prefetch(
                      `/workspace/${companyId}/settings/${item.id}`,
                    )
                  }
                  onFocus={() =>
                    router.prefetch(
                      `/workspace/${companyId}/settings/${item.id}`,
                    )
                  }
                  className={`flex items-center gap-2 rounded-lg px-2 py-2 text-sm ${selected === item.id ? "bg-[var(--soft)] font-bold text-[var(--accent)]" : "muted hover:bg-[var(--soft)] hover:text-[var(--text)]"}`}
                >
                  {item.icon}
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
          {!visible.length && (
            <p className="px-2 text-sm muted">No settings found.</p>
          )}
        </nav>
      </aside>
      <section className="min-w-0 p-5 sm:p-7 lg:p-9">
        <header className="mb-7 border-b border-[var(--border)] pb-5">
          <h2 className="text-2xl font-extrabold">{titleFor(selected)}</h2>
          <p className="mt-1 text-sm muted">
            {String(props.company.name ?? "Company")} · Company settings
          </p>
        </header>
        <SettingsContent {...props} />
      </section>
    </div>
  );
}

function SettingsContent(props: Parameters<typeof SettingsWorkspace>[0]) {
  const {
    selected,
    companyId,
    company,
    enabledModules,
    members,
    roles,
    audits,
    canManageApps,
    canManageMembers,
  } = props;
  if (selected === "company")
    return <CompanyForm companyId={companyId} company={company} />;
  if (selected === "users")
    return <UsersView companyId={companyId} members={members} />;
  if (selected === "companies")
    return (
      <Rows
        rows={[
          {
            title: String(company.name),
            description: "Active company · Your current workspace",
            action: (
              <LinkButton href="/select-company">Manage companies</LinkButton>
            ),
          },
        ]}
      />
    );
  if (selected === "permissions")
    return <RolesView companyId={companyId} roles={roles} />;
  if (selected === "access/organization")
    return (
      <Rows
        rows={[
          {
            title: "Departments & Teams",
            description:
              "Departments and sales teams define reporting, visibility, and assignment context.",
            action: (
              <LinkButton href={`/workspace/${companyId}/employees`}>
                Manage members
              </LinkButton>
            ),
          },
        ]}
      />
    );
  if (selected === "access/apps")
    return (
      <Rows
        rows={[
          {
            title: "Member app access",
            description:
              "Open a member to turn individual workspace applications on or off.",
            action: (
              <LinkButton href={`/workspace/${companyId}/employees`}>
                Configure
              </LinkButton>
            ),
          },
        ]}
      />
    );
  if (selected === "access/advanced")
    return (
      <Rows
        rows={[
          {
            title: "Field Access",
            description:
              "Advanced field visibility, masking, and read-only policies remain managed by enterprise roles.",
            value: "Advanced",
          },
          {
            title: "Approval Limits",
            description:
              "Role-based approval ceilings for sensitive financial operations.",
            value: "Advanced",
          },
          {
            title: "Security Policies",
            description:
              "Protected rules prevent ownership and security privilege escalation.",
            value: "Enforced",
          },
        ]}
      />
    );
  if (selected === "security/audit") return <AuditView audits={audits} />;
  if (selected === "security/sessions")
    return (
      <Rows
        rows={[
          {
            title: "Current session",
            description:
              "Your signed-in Firebase session is active. Session cookies are verified on every protected server request.",
            value: "Active",
          },
        ]}
      />
    );
  if (selected === "security/authentication")
    return (
      <Rows
        rows={[
          {
            title: "Authentication provider",
            description:
              "Toro currently uses Firebase Authentication for verified email and Google sign-in.",
            value: "Firebase Auth",
          },
          {
            title: "Workspace security",
            description:
              "Company routes require an active membership and enforce server-side permissions.",
            value: "Enforced",
          },
        ]}
      />
    );
  if (selected === "integrations/email")
    return (
      <Rows
        rows={[
          {
            title: "Email delivery",
            description:
              "No company email server has been configured. Toro will not report this integration as connected.",
            value: "Not configured",
          },
        ]}
      />
    );
  if (selected === "integrations/calendar")
    return (
      <Rows
        rows={[
          {
            title: "Google Calendar",
            description:
              "No Google Calendar connection is configured for this company.",
            value: "Not connected",
          },
          {
            title: "Outlook Calendar",
            description:
              "No Outlook Calendar connection is configured for this company.",
            value: "Not connected",
          },
        ]}
      />
    );
  if (selected === "integrations/api")
    return (
      <Rows
        rows={[
          {
            title: "API access",
            description:
              "No company service accounts or webhook credentials are configured.",
            value: "Not configured",
          },
        ]}
      />
    );
  if (selected === "general")
    return (
      <Rows
        rows={[
          ...(canManageMembers
            ? [
                {
                  title: "Company",
                  description:
                    "Manage company identity and regional configuration.",
                  action: (
                    <LinkButton
                      href={`/workspace/${companyId}/settings/company`}
                    >
                      Manage
                    </LinkButton>
                  ),
                },
                {
                  title: "Users",
                  description: `${members.filter((member) => member.status === "active").length} active users in this company.`,
                  action: (
                    <LinkButton href={`/workspace/${companyId}/settings/users`}>
                      Manage
                    </LinkButton>
                  ),
                },
                {
                  title: "Permissions",
                  description: `${roles.length} active enterprise roles using Toro's permission engine.`,
                  action: (
                    <LinkButton
                      href={`/workspace/${companyId}/settings/permissions`}
                    >
                      Configure
                    </LinkButton>
                  ),
                },
                {
                  title: "Regional settings",
                  description: `${String(company.country ?? "—")} · ${String(company.currency ?? "—")} · ${String(company.timezone ?? "—")}`,
                  action: (
                    <LinkButton
                      href={`/workspace/${companyId}/settings/company`}
                    >
                      Edit
                    </LinkButton>
                  ),
                },
              ]
            : []),
          {
            title: "Applications",
            description: `${enabledModules.length} enabled applications.`,
            action: canManageApps ? (
              <LinkButton href={`/workspace/${companyId}/apps`}>
                Manage apps
              </LinkButton>
            ) : undefined,
          },
        ]}
      />
    );
  const appModule = MODULES.find((item) => item.key === selected);
  if (appModule) return <Rows rows={moduleRows(appModule.key, companyId)} />;
  return null;
}

function CompanyForm({
  companyId,
  company,
}: {
  companyId: string;
  company: Data;
}) {
  const router = useRouter();
  const fields = [
    "name",
    "businessCategory",
    "country",
    "city",
    "currency",
    "timezone",
    "email",
    "phone",
    "website",
    "address",
    "description",
  ] as const;
  const [form, setForm] = useState(
    Object.fromEntries(
      fields.map((field) => [field, String(company[field] ?? "")]),
    ),
  ) as [
    Record<string, string>,
    React.Dispatch<React.SetStateAction<Record<string, string>>>,
  ];
  const [initial, setInitial] = useState(form);
  const [status, setStatus] = useState("");
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    const beforeNavigation = (event: MouseEvent) => {
      const link = (event.target as Element).closest("a[href]");
      if (link && !window.confirm("You have unsaved changes. Discard them?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", beforeNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", beforeNavigation, true);
    };
  }, [dirty]);
  async function save() {
    setStatus("Saving...");
    const response = await fetch(`/api/companies/${companyId}/settings`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    const body = await response.json();
    if (!response.ok) return setStatus(body.error ?? "Save failed");
    setInitial(form);
    setStatus("Saved");
    router.refresh();
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      className="max-w-4xl"
    >
      <SectionTitle
        title="Company information"
        description="Identity and regional defaults used throughout this company."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => (
          <label
            key={field}
            className={
              field === "address" || field === "description"
                ? "sm:col-span-2"
                : ""
            }
          >
            <span className="label">{label(field)}</span>
            {field === "address" || field === "description" ? (
              <textarea
                className="input min-h-20"
                value={form[field]}
                onChange={(event) =>
                  setForm({ ...form, [field]: event.target.value })
                }
              />
            ) : (
              <input
                className="input"
                type={
                  field === "email"
                    ? "email"
                    : field === "website"
                      ? "url"
                      : "text"
                }
                value={form[field]}
                onChange={(event) =>
                  setForm({ ...form, [field]: event.target.value })
                }
              />
            )}
          </label>
        ))}
      </div>
      <div className="sticky bottom-4 mt-6 flex items-center justify-end gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 shadow-lg">
        <span
          className={`mr-auto text-sm ${status && status !== "Saved" && status !== "Saving..." ? "text-red-500" : "muted"}`}
        >
          {status || (dirty ? "Unsaved changes" : "No unsaved changes")}
        </span>
        <button
          type="button"
          disabled={!dirty}
          className="btn btn-secondary"
          onClick={() => {
            setForm(initial);
            setStatus("");
          }}
        >
          Discard
        </button>
        <button
          disabled={!dirty || status === "Saving..."}
          className="btn btn-primary"
        >
          Save
        </button>
      </div>
    </form>
  );
}

function UsersView({
  companyId,
  members,
}: {
  companyId: string;
  members: Data[];
}) {
  return (
    <>
      <div className="mb-4 flex justify-end">
        <LinkButton href={`/workspace/${companyId}/employees`}>
          Manage users
        </LinkButton>
      </div>
      <div className="overflow-x-auto border-y border-[var(--border)]">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead>
            <tr className="muted">
              {["Name", "Email", "User type", "Role", "Status"].map((x) => (
                <th className="px-3 py-3" key={x}>
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr
                className="border-t border-[var(--border)]"
                key={String(member.id)}
              >
                <td className="px-3 py-3 font-semibold">
                  {String(member.displayName ?? "Unnamed user")}
                </td>
                <td className="px-3 py-3">{String(member.email ?? "—")}</td>
                <td className="px-3 py-3 capitalize">
                  {String(member.userType ?? "internal")}
                </td>
                <td className="px-3 py-3 capitalize">
                  {String(member.role ?? "—")}
                </td>
                <td className="px-3 py-3 capitalize">
                  {String(member.status ?? "—")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function RolesView({ companyId, roles }: { companyId: string; roles: Data[] }) {
  return (
    <>
      <Rows
        rows={roles.map((role) => ({
          title: String(role.name),
          description: String(
            role.description ??
              (role.system ? "System role" : "Custom enterprise role"),
          ),
          value: role.system ? "System" : "Custom",
        }))}
      />
      {!roles.length && (
        <p className="py-8 text-sm muted">
          No active roles have been configured.
        </p>
      )}
      <div className="mt-5">
        <LinkButton href={`/workspace/${companyId}/employees`}>
          Assign roles to users
        </LinkButton>
      </div>
    </>
  );
}

function AuditView({ audits }: { audits: Data[] }) {
  return (
    <div className="overflow-x-auto border-y border-[var(--border)]">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead>
          <tr className="muted">
            <th className="px-3 py-3">Time</th>
            <th className="px-3 py-3">Actor</th>
            <th className="px-3 py-3">Action</th>
            <th className="px-3 py-3">Target</th>
            <th className="px-3 py-3">Result</th>
          </tr>
        </thead>
        <tbody>
          {audits.map((audit) => (
            <tr
              className="border-t border-[var(--border)]"
              key={String(audit.id)}
            >
              <td className="px-3 py-3">{formatDate(audit.timestamp)}</td>
              <td className="px-3 py-3">{String(audit.actorId ?? "System")}</td>
              <td className="px-3 py-3 font-semibold">
                {String(audit.action ?? "—").replaceAll(".", " ")}
              </td>
              <td className="px-3 py-3">
                {String(audit.entityType ?? "—")} ·{" "}
                {String(audit.entityId ?? "—")}
              </td>
              <td className="px-3 py-3 text-emerald-600">Succeeded</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!audits.length && (
        <p className="p-8 text-center text-sm muted">
          No audit events recorded.
        </p>
      )}
    </div>
  );
}

function Rows({
  rows,
}: {
  rows: {
    title: string;
    description: string;
    value?: string;
    action?: React.ReactNode;
  }[];
}) {
  return (
    <div className="max-w-5xl border-t border-[var(--border)]">
      {rows.map((row) => (
        <div
          key={row.title}
          className="flex gap-6 border-b border-[var(--border)] py-5"
        >
          <div className="min-w-0 flex-1">
            <h3 className="font-bold">{row.title}</h3>
            <p className="mt-1 text-sm leading-6 muted">{row.description}</p>
          </div>
          <div className="flex shrink-0 items-center">
            {row.action ?? (
              <span className="text-sm font-semibold">{row.value}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function moduleRows(moduleKey: ModuleKey, companyId: string) {
  const descriptions: Partial<Record<ModuleKey, string[]>> = {
    discuss: [
      "Messaging|Channels and messages are enabled for this company.",
      "Calls & meetings|Voice and video calls use the existing Discuss calling system.",
      "Notifications|Member notifications are delivered through Toro's notification center.",
    ],
    calendar: [
      "Company calendar|Meetings and schedules use the active company timezone.",
      "External calendars|Connection status is available under Calendar Integrations.",
    ],
    todo: [
      "Personal tasks|Tasks and stages use the existing company To-Do workflow.",
      "Permissions|Task creation, movement and assignment use Toro access rights.",
    ],
    contacts: [
      "Contact records|People and companies use the existing Contacts database.",
      "Access rights|Create and edit access is controlled by Toro permissions.",
    ],
    crm: [
      "Pipeline|Stages and opportunities use the existing CRM workflow.",
      "Lead management|CRM access and record scope use Toro's existing permission engine.",
    ],
    sales: [
      "Sales records|Quotations and orders use the existing Sales module.",
      "Permissions|Sales management is controlled by existing company roles.",
    ],
  };
  return (descriptions[moduleKey] ?? []).map((entry, index) => {
    const [title, description] = entry.split("|");
    return {
      title,
      description,
      action:
        index === 0 ? (
          <LinkButton href={`/workspace/${companyId}/${moduleKey}`}>
            Open {MODULES.find((item) => item.key === moduleKey)?.name}
          </LinkButton>
        ) : undefined,
    };
  });
}

function LinkButton({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link className="btn btn-secondary !py-2 text-sm" href={href}>
      {children}
      <ChevronRight size={14} />
    </Link>
  );
}
function SectionTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mb-5">
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="mt-1 text-sm muted">{description}</p>
    </div>
  );
}
function titleFor(id: string) {
  return (
    groups.flatMap((group) => group.items).find((item) => item.id === id)
      ?.label ?? "Settings"
  );
}
function label(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase());
}
function formatDate(value: unknown) {
  if (typeof value !== "string") return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}
