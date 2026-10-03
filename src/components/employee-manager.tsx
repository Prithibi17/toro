"use client";
import { useState } from "react";
import { CirclePlus, Mail, ShieldCheck, Users, X } from "lucide-react";
import type { PermissionKey } from "@/lib/types";
type Member = {
  id: string;
  displayName?: string;
  email?: string;
  role: string;
  status: string;
};
type Department = { id: string; name: string };
type CompanyRole = { id: string; name: string; description?: string };
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
  isOwner,
  initialMembers,
  departments,
  pending,
  roles,
}: {
  companyId: string;
  isOwner: boolean;
  initialMembers: Member[];
  departments: Department[];
  pending: number;
  roles: CompanyRole[];
}) {
  const [members] = useState(initialMembers);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
        {isOwner && (
          <button className="btn btn-primary" onClick={() => setOpen(true)}>
            <CirclePlus size={18} />
            Add member
          </button>
        )}
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
          value={String(pending)}
        />
        <Stat
          icon={<ShieldCheck />}
          label="Administrators"
          value={String(
            members.filter((m) => ["owner", "admin"].includes(m.role)).length,
          )}
        />
      </div>
      <div className="panel mt-6 overflow-hidden">
        <div className="grid grid-cols-[1.4fr_1fr_.7fr] border-b border-[var(--border)] px-5 py-3 text-xs font-bold uppercase tracking-wider muted">
          <span>Employee</span>
          <span>Role</span>
          <span>Status</span>
        </div>
        {members.map((m) => (
          <div
            key={m.id}
            className="grid grid-cols-[1.4fr_1fr_.7fr] items-center border-b border-[var(--border)] px-5 py-4 last:border-0"
          >
            <div>
              <b>{m.displayName || m.email || "Unnamed member"}</b>
              <p className="mt-1 text-sm muted">{m.email}</p>
            </div>
            <span className="capitalize">{m.role}</span>
            <span className="capitalize text-emerald-500">{m.status}</span>
          </div>
        ))}
      </div>
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
