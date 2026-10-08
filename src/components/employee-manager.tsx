"use client";
import { useState } from "react";
import {
  CirclePlus,
  Mail,
  MoreVertical,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";
import type { PermissionKey } from "@/lib/types";
import { ConfirmDialog } from "./confirm-dialog";
import { DepartmentManager } from "./department-manager";
type Member = {
  id: string;
  displayName?: string;
  email?: string;
  role: string;
  status: string;
  departmentIds?: string[];
  jobTitle?: string;
};
type Department = { id: string; name: string; workDays?: number[] };
type CompanyRole = { id: string; name: string; description?: string };
type Invitation = {
  id: string;
  email?: string;
  displayName?: string;
  role?: string;
  status: string;
};
const permissionOptions: {
  key: PermissionKey;
  label: string;
  description: string;
}[] = [
  {
    key: "members.manage",
    label: "Manage members",
    description: "Add and administer employees",
  },
  {
    key: "apps.manage",
    label: "Manage apps",
    description: "Enable company applications",
  },
  {
    key: "tasks.create",
    label: "Create tasks",
    description: "Add work to To-Do",
  },
  { key: "tasks.move", label: "Move tasks", description: "Change task stages" },
  {
    key: "tasks.assign",
    label: "Assign tasks",
    description: "Assign work to other members",
  },
  {
    key: "crm.manage",
    label: "Manage CRM",
    description: "Create opportunities",
  },
  {
    key: "contacts.manage",
    label: "Manage contacts",
    description: "Create business contacts",
  },
  {
    key: "sales.manage",
    label: "Manage sales",
    description: "Create quotations and orders",
  },
];
const crmSections = [
  "overview",
  "leads",
  "contacts",
  "organizations",
  "opportunities",
  "activities",
  "pipelines",
] as const;
export function EmployeeManager({
  companyId,
  companyName,
  initialInvitations,
  canManageDepartments,
  canInviteMembers,
  initialMembers,
  departments,
  roles,
}: {
  companyId: string;
  companyName: string;
  initialInvitations: Invitation[];
  canManageDepartments: boolean;
  canInviteMembers: boolean;
  initialMembers: Member[];
  departments: Department[];
  roles: CompanyRole[];
}) {
  const [members, setMembers] = useState(initialMembers);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("active");
  const [invitationToCancel, setInvitationToCancel] =
    useState<Invitation | null>(null);
  const [removal, setRemoval] = useState<{
    member: Member;
    counts?: {
      todos: number;
      opportunities: number;
      activities: number;
      meetings: number;
    };
  } | null>(null);
  const [mode, setMode] = useState<"leave" | "reassign">("leave"),
    [replacement, setReplacement] = useState(""),
    [memberSearch, setMemberSearch] = useState("");
  async function openRemoval(member: Member) {
    setMenu(null);
    setBusy(true);
    setError("");
    const response = await fetch(
      `/api/companies/${companyId}/members/${member.id}/removal`,
    );
    const result = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(result.error);
      return;
    }
    setRemoval({ member, counts: result.counts });
    setMode("leave");
    setReplacement("");
  }
  async function removeMember() {
    if (!removal) return;
    setBusy(true);
    setError("");
    const response = await fetch(
      `/api/companies/${companyId}/members/${removal.member.id}/removal`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode,
          reassignTo: mode === "reassign" ? replacement : undefined,
        }),
      },
    );
    const result = await response.json();
    if (response.ok) {
      setMembers((current) =>
        current.map((member) =>
          member.id === removal.member.id
            ? { ...member, status: "removed" }
            : member,
        ),
      );
      setRemoval(null);
    } else setError(result.error);
    setBusy(false);
  }
  async function cancelInvitation(invitation: Invitation) {
    setBusy(true);
    setError("");
    const response = await fetch(
      `/api/companies/${companyId}/invitations/${invitation.id}`,
      { method: "DELETE" },
    );
    const result = await response.json();
    if (response.ok)
      setInvitations((current) =>
        current.filter((item) => item.id !== invitation.id),
      );
    else setError(result.error);
    setInvitationToCancel(null);
    setBusy(false);
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const body = {
      email: f.get("email"),
      displayName: f.get("displayName"),
      role: f.get("role"),
      userType: f.get("userType"),
      roleIds: f.getAll("roleIds"),
      departmentIds: f.getAll("departmentIds"),
      permissions: f.getAll("permissions"),
      crmPermissions: Object.fromEntries(
        crmSections.map((section) => [
          section,
          {
            view: String(f.get(`crm.${section}.view`) || "none"),
            create: f.get(`crm.${section}.create`) === "on",
            edit: String(f.get(`crm.${section}.edit`) || "none"),
            delete: String(f.get(`crm.${section}.delete`) || "none"),
            assign: String(f.get(`crm.${section}.assign`) || "none"),
            moveStage: f.get(`crm.${section}.moveStage`) === "on",
            close: f.get(`crm.${section}.close`) === "on",
            manage: f.get(`crm.${section}.manage`) === "on",
          },
        ]),
      ),
    };
    const r = await fetch(`/api/companies/${companyId}/members`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (r.ok) location.reload();
    else {
      setError(j.error);
      setBusy(false);
    }
  }
  return (
    <>
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--accent)]">
            Company administration
          </p>
          <h1 className="mt-1 text-3xl font-extrabold">Employees</h1>
          <p className="mt-2 muted">
            Roles, departments and effective permissions for this company.
          </p>
        </div>
        {canInviteMembers && (
          <button className="btn btn-primary" onClick={() => setOpen(true)}>
            <CirclePlus size={18} />
            Add member
          </button>
        )}
      </div>
      {canManageDepartments && (
        <DepartmentManager companyId={companyId} initialDepartments={departments} />
      )}
      {error && !open && !removal && (
        <p className="mb-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-500">
          {error}
        </p>
      )}
      <div className="mb-4 flex justify-end">
        <label>
          <span className="label">Status</span>
          <select
            className="input !w-auto"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="active">Active</option>
            <option value="removed">Removed</option>
            <option value="all">All</option>
          </select>
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          icon={<Users />}
          label="Active members"
          value={String(members.filter((m) => m.status === "active").length)}
        />
        <Stat
          icon={<Mail />}
          label="Pending invitations"
          value={String(invitations.length)}
        />
        <Stat
          icon={<ShieldCheck />}
          label="Administrators"
          value={String(
            members.filter(
              (m) =>
                m.status === "active" && ["owner", "admin"].includes(m.role),
            ).length,
          )}
        />
      </div>
      {invitations.length > 0 && (
        <div className="panel mt-6 overflow-hidden">
          <div className="border-b border-[var(--border)] px-5 py-3 text-xs font-bold uppercase tracking-wider muted">
            Pending invitations
          </div>
          {invitations.map((invitation) => (
            <div
              className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4 last:border-0"
              key={invitation.id}
            >
              <div>
                <b>{invitation.displayName ?? invitation.email}</b>
                <p className="text-sm muted">
                  {invitation.email} · {invitation.role}
                </p>
              </div>
              <button
                className="btn btn-secondary text-red-500"
                disabled={busy}
                onClick={() => setInvitationToCancel(invitation)}
              >
                Cancel Invitation
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="panel mt-6 overflow-hidden">
        <div className="grid grid-cols-[1.4fr_1fr_.7fr_.35fr] border-b border-[var(--border)] px-5 py-3 text-xs font-bold uppercase tracking-wider muted">
          <span>Employee</span>
          <span>Role</span>
          <span>Status</span>
          <span className="text-right">Actions</span>
        </div>
        {members
          .filter(
            (member) =>
              statusFilter === "all" || member.status === statusFilter,
          )
          .map((m) => (
            <div
              key={m.id}
              className="grid grid-cols-[1.4fr_1fr_.7fr_.35fr] items-center border-b border-[var(--border)] px-5 py-4 last:border-0"
            >
              <div>
                <b>{m.displayName || m.email || "Unnamed member"}</b>
                <p className="mt-1 text-sm muted">{m.email}</p>
              </div>
              <span className="capitalize">{m.role}</span>
              <span className="capitalize text-emerald-500">{m.status}</span>
              <div className="relative justify-self-end">
                <button
                  className="rounded-lg p-2 hover:bg-[var(--soft)]"
                  aria-label={`Actions for ${m.displayName ?? m.email}`}
                  onClick={() => setMenu(menu === m.id ? null : m.id)}
                >
                  <MoreVertical size={18} />
                </button>
                {menu === m.id && (
                  <div className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-2 shadow-xl">
                    {m.role !== "owner" && (
                      <a
                        className="block rounded-lg px-3 py-2 text-sm hover:bg-[var(--soft)]"
                        href={`/workspace/${companyId}/employees/${m.id}/access`}
                      >
                        Manage access
                      </a>
                    )}
                    {m.status === "active" && m.role !== "owner" && (
                      <>
                        <div className="my-1 border-t border-[var(--border)]" />
                        <button
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-500 hover:bg-red-500/10"
                          onClick={() => void openRemoval(m)}
                        >
                          <Trash2 size={15} />
                          Remove from Workspace
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
      </div>
      {removal && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4">
          <section className="panel my-6 w-full max-w-xl p-6">
            <div className="flex justify-between gap-4">
              <div>
                <h2 className="text-xl font-extrabold">
                  Remove {removal.member.displayName ?? removal.member.email}{" "}
                  from {companyName}?
                </h2>
                <p className="mt-2 text-sm muted">
                  They will lose access to this workspace and company data.
                  Historical work, activities, CRM records, messages, and audit
                  history will remain.
                </p>
              </div>
              <button onClick={() => setRemoval(null)}>
                <X />
              </button>
            </div>
            {removal.counts && Object.values(removal.counts).some(Boolean) && (
              <div className="mt-5 rounded-xl bg-[var(--soft)] p-4">
                <b>Currently assigned active work</b>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <span>{removal.counts.todos} To-Dos</span>
                  <span>{removal.counts.opportunities} Opportunities</span>
                  <span>{removal.counts.activities} Activities</span>
                  <span>{removal.counts.meetings} Meetings</span>
                </div>
                <label className="mt-4 flex gap-2">
                  <input
                    type="radio"
                    checked={mode === "leave"}
                    onChange={() => setMode("leave")}
                  />
                  Leave assignments unchanged for later reassignment
                </label>
                <label className="mt-2 flex gap-2">
                  <input
                    type="radio"
                    checked={mode === "reassign"}
                    onChange={() => setMode("reassign")}
                  />
                  Reassign supported active work
                </label>
                {mode === "reassign" && (
                  <div className="mt-3">
                    <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3">
                      <Search size={15} />
                      <input
                        className="w-full bg-transparent py-2 outline-none"
                        placeholder="Search active members…"
                        value={memberSearch}
                        onChange={(event) =>
                          setMemberSearch(event.target.value)
                        }
                      />
                    </div>
                    <select
                      className="input mt-2"
                      value={replacement}
                      onChange={(event) => setReplacement(event.target.value)}
                    >
                      <option value="">Choose replacement</option>
                      {members
                        .filter(
                          (member) =>
                            member.status === "active" &&
                            member.id !== removal.member.id &&
                            (member.displayName ?? member.email ?? "")
                              .toLowerCase()
                              .includes(memberSearch.toLowerCase()),
                        )
                        .map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.displayName ?? member.email}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>
            )}
            <p className="mt-5 text-sm font-semibold text-red-500">
              This revokes access to this workspace only. It does not delete the
              Toro account.
            </p>
            {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => setRemoval(null)}
              >
                Cancel
              </button>
              <button
                className="btn bg-red-600 text-white hover:bg-red-700"
                disabled={busy || (mode === "reassign" && !replacement)}
                onClick={() => void removeMember()}
              >
                {busy ? "Removing…" : "Remove Employee"}
              </button>
            </div>
          </section>
        </div>
      )}
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4">
          <form onSubmit={submit} className="panel my-6 w-full max-w-2xl p-6">
            <div className="flex justify-between">
              <div>
                <h2 className="text-xl font-extrabold">Add company member</h2>
                <p className="mt-1 text-sm muted">
                  Existing Toro users are activated immediately; others receive
                  a pending invitation record.
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)}>
                <X />
              </button>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label>
                <span className="label">Full name</span>
                <input className="input" name="displayName" required />
              </label>
              <label>
                <span className="label">Email</span>
                <input className="input" name="email" type="email" required />
              </label>
              <label>
                <span className="label">User type</span>
                <select className="input" name="userType">
                  <option value="internal">Internal user</option>
                  <option value="portal">Portal user</option>
                </select>
              </label>
              <label>
                <span className="label">Role</span>
                <select className="input" name="role">
                  <option value="employee">Employee</option>
                  <option value="intern">Intern</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Company admin</option>
                </select>
              </label>
              <fieldset>
                <legend className="label">Enterprise roles</legend>
                <div className="max-h-28 space-y-2 overflow-auto rounded-xl border border-[var(--border)] p-3">
                  {roles.map((role) => (
                    <label className="flex gap-2 text-sm" key={role.id}>
                      <input type="checkbox" name="roleIds" value={role.id} />
                      <span>
                        <b className="block">{role.name}</b>
                        {role.description && (
                          <small className="muted">{role.description}</small>
                        )}
                      </span>
                    </label>
                  ))}
                  {!roles.length && (
                    <span className="text-sm muted">
                      No custom roles configured
                    </span>
                  )}
                </div>
              </fieldset>
              <fieldset>
                <legend className="label">Departments</legend>
                <div className="max-h-28 space-y-2 overflow-auto rounded-xl border border-[var(--border)] p-3">
                  {departments.map((d) => (
                    <label className="flex gap-2 text-sm" key={d.id}>
                      <input
                        type="checkbox"
                        name="departmentIds"
                        value={d.id}
                      />
                      {d.name}
                    </label>
                  ))}
                  {!departments.length && (
                    <span className="text-sm muted">
                      No departments configured
                    </span>
                  )}
                </div>
              </fieldset>
            </div>
            <fieldset className="mt-5">
              <legend className="label">Allowed actions</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {permissionOptions.map((p) => (
                  <label
                    className="flex gap-3 rounded-xl bg-[var(--soft)] p-3"
                    key={p.key}
                  >
                    <input type="checkbox" name="permissions" value={p.key} />
                    <span>
                      <b className="block text-sm">{p.label}</b>
                      <small className="muted">{p.description}</small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="mt-5">
              <legend className="label">CRM permissions</legend>
              <div className="space-y-3">
                {crmSections.map((section) => (
                  <details
                    className="rounded-xl bg-[var(--soft)] p-3"
                    key={section}
                  >
                    <summary className="cursor-pointer text-sm font-bold capitalize">
                      {section === "organizations" ? "Companies" : section}
                    </summary>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <CrmScope name={`crm.${section}.view`} label="View" />
                      <CrmScope name={`crm.${section}.edit`} label="Edit" />
                      <CrmScope name={`crm.${section}.delete`} label="Delete" />
                      <CrmScope name={`crm.${section}.assign`} label="Assign" />
                      <CrmToggle
                        name={`crm.${section}.create`}
                        label="Create"
                      />
                      <CrmToggle
                        name={`crm.${section}.moveStage`}
                        label="Move stage"
                      />
                      <CrmToggle
                        name={`crm.${section}.close`}
                        label="Mark Won/Lost"
                      />
                      <CrmToggle
                        name={`crm.${section}.manage`}
                        label="Manage"
                      />
                    </div>
                  </details>
                ))}
              </div>
            </fieldset>
            {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button disabled={busy} className="btn btn-primary">
                {busy ? "Adding…" : "Add member"}
              </button>
            </div>
          </form>
        </div>
      )}
      <ConfirmDialog
        open={invitationToCancel !== null}
        title="Cancel this invitation?"
        description={`This permanently removes the pending invitation for ${invitationToCancel?.email ?? "this person"}. It does not delete an existing Toro account.`}
        confirmLabel="Cancel Invitation"
        destructive
        busy={busy}
        onCancel={() => setInvitationToCancel(null)}
        onConfirm={() => {
          if (invitationToCancel) void cancelInvitation(invitationToCancel);
        }}
      />
    </>
  );
}
function CrmScope({ name, label }: { name: string; label: string }) {
  return (
    <label>
      <span className="label">{label}</span>
      <select className="input !py-2" name={name} defaultValue="none">
        <option value="none">None</option>
        <option value="own">Own</option>
        <option value="team">Sales team</option>
        <option value="department">Department</option>
        <option value="all">All</option>
      </select>
    </label>
  );
}
function CrmToggle({ name, label }: { name: string; label: string }) {
  return (
    <label className="flex items-center gap-2 pt-6 text-sm">
      <input type="checkbox" name={name} />
      {label}
    </label>
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
