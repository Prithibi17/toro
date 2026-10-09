"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Plus, Search, X } from "lucide-react";
import { MODULES, type ModuleKey } from "@/lib/types";
import {
  SIMPLE_PERMISSIONS,
  basePermissionAllowed,
} from "@/lib/permission-catalog";
import { memberRoleLabel } from "@/lib/member-role";

type Member = Record<string, unknown> & { id: string };

export function MemberAccessEditor({
  companyId,
  member,
  departments,
  enabledModules,
  isOwner,
}: {
  companyId: string;
  member: Member;
  departments: Array<{ id: string; name: string }>;
  enabledModules: ModuleKey[];
  isOwner: boolean;
}) {
  const router = useRouter();
  const [role, setRole] = useState(String(member.role ?? "employee"));
  const [departmentIds, setDepartmentIds] = useState<string[]>(
    (member.departmentIds as string[] | undefined) ?? [],
  );
  const [apps, setApps] = useState<Record<string, "none" | "user">>(
    Object.fromEntries(
      enabledModules.map((app) => [
        app,
        (member.appAccess as Record<string, string> | undefined)?.[app] ===
        "none"
          ? "none"
          : "user",
      ]),
    ),
  );
  const [overrides, setOverrides] = useState<Record<string, "allow" | "deny">>(
    (member.permissionOverrides as Record<string, "allow" | "deny">) ?? {},
  );
  const [picker, setPicker] = useState<"allow" | "deny" | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const availableRoles = isOwner
    ? ["admin", "manager", "employee", "intern"]
    : ["manager", "employee", "intern"];
  const visiblePermissions = useMemo(
    () =>
      SIMPLE_PERMISSIONS.filter((permission) =>
        `${permission.group} ${permission.label} ${permission.description}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [search],
  );

  async function save() {
    setStatus("Saving…");
    const response = await fetch(`/api/companies/${companyId}/members`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: member.id,
        role,
        departmentIds,
        appAccess: apps,
        permissionOverrides: overrides,
      }),
    });
    const result = await response.json();
    if (!response.ok) return setStatus(result.error ?? "Could not save access");
    setStatus("Saved");
    router.refresh();
  }

  const custom = (effect: "allow" | "deny") =>
    SIMPLE_PERMISSIONS.filter(
      (permission) => overrides[permission.key] === effect,
    );

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href={`/workspace/${companyId}/employees`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--accent)]"
      >
        <ArrowLeft size={15} /> Employees
      </Link>
      <header className="border-b border-[var(--border)] pb-5">
        <h1 className="text-2xl font-extrabold">
          {String(member.displayName ?? member.email ?? "Member")}
        </h1>
        <p className="mt-1 text-sm muted">{String(member.email ?? "")}</p>
      </header>

      <section className="grid gap-5 border-b border-[var(--border)] py-6 sm:grid-cols-2">
        <label>
          <span className="label">Role</span>
          <select
            className="input capitalize"
            value={role}
            disabled={member.role === "owner"}
            onChange={(event) => setRole(event.target.value)}
          >
            {member.role === "owner" && <option value="owner">Owner</option>}
            {availableRoles.map((item) => (
              <option key={item} value={item}>
                {memberRoleLabel(item)}
              </option>
            ))}
          </select>
          <small className="muted">Defines this person’s authority.</small>
        </label>
        <label>
          <span className="label">Department</span>
          <select
            className="input"
            value={departmentIds[0] ?? ""}
            onChange={(event) =>
              setDepartmentIds(event.target.value ? [event.target.value] : [])
            }
          >
            <option value="">No department</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
          <small className="muted">Defines where this person works.</small>
        </label>
      </section>

      <section className="border-b border-[var(--border)] py-6">
        <h2 className="font-bold">Apps</h2>
        <p className="mt-1 text-sm muted">Choose where this person can work.</p>
        <div className="mt-4 divide-y divide-[var(--border)]">
          {MODULES.filter((module) => enabledModules.includes(module.key)).map(
            (module) => (
              <label
                className="flex items-center justify-between gap-4 py-3"
                key={module.key}
              >
                <span>
                  <b className="block text-sm">{module.name}</b>
                  <small className="muted">{module.description}</small>
                </span>
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-[var(--accent)]"
                  checked={apps[module.key] !== "none"}
                  onChange={(event) =>
                    setApps((current) => ({
                      ...current,
                      [module.key]: event.target.checked ? "user" : "none",
                    }))
                  }
                />
              </label>
            ),
          )}
        </div>
      </section>

      <section className="py-6">
        <h2 className="font-bold">Custom access</h2>
        <p className="mt-1 text-sm muted">
          Most members need no exceptions. Add only what differs from the role.
        </p>
        <AccessList
          title="Can"
          icon={<Check size={15} />}
          permissions={custom("allow")}
          empty="No additional access"
          remove={(key) =>
            setOverrides((current) => {
              const next = { ...current };
              delete next[key];
              return next;
            })
          }
        />
        <button
          className="btn btn-secondary mt-2 !py-2"
          onClick={() => setPicker("allow")}
        >
          <Plus size={15} /> Add Access
        </button>
        <AccessList
          title="Cannot"
          icon={<X size={15} />}
          permissions={custom("deny")}
          empty="No custom restrictions"
          remove={(key) =>
            setOverrides((current) => {
              const next = { ...current };
              delete next[key];
              return next;
            })
          }
        />
        <button
          className="btn btn-secondary mt-2 !py-2"
          onClick={() => setPicker("deny")}
        >
          <Plus size={15} /> Add Restriction
        </button>
      </section>

      {status && (
        <p
          className={`mb-3 text-sm ${status === "Saved" ? "text-emerald-500" : status === "Saving…" ? "muted" : "text-red-500"}`}
        >
          {status}
        </p>
      )}
      <div className="sticky bottom-4 flex justify-end gap-2 border border-[var(--border)] bg-[var(--panel)] p-3 shadow-lg">
        <Link
          className="btn btn-secondary"
          href={`/workspace/${companyId}/employees`}
        >
          Cancel
        </Link>
        <button className="btn btn-primary" onClick={() => void save()}>
          Save
        </button>
      </div>

      {picker && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <section className="panel max-h-[80vh] w-full max-w-xl overflow-hidden">
            <header className="flex items-start justify-between border-b border-[var(--border)] p-5">
              <div>
                <h2 className="text-xl font-extrabold">
                  {picker === "allow" ? "Add Access" : "Add Restriction"}
                </h2>
                <p className="mt-1 text-sm muted">
                  What should {String(member.displayName ?? "this person")}{" "}
                  {picker === "allow"
                    ? "be allowed to do?"
                    : "NOT be allowed to do?"}
                </p>
              </div>
              <button onClick={() => setPicker(null)}>
                <X />
              </button>
            </header>
            <div className="m-4 flex items-center gap-2 rounded-lg border border-[var(--border)] px-3">
              <Search size={16} />
              <input
                autoFocus
                className="w-full bg-transparent py-3 outline-none"
                placeholder="Search permissions…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="max-h-[55vh] overflow-y-auto px-4 pb-4">
              {[...new Set(visiblePermissions.map((item) => item.group))].map(
                (group) => (
                  <div key={group}>
                    <p className="pb-1 pt-3 text-xs font-bold uppercase tracking-wider muted">
                      {group}
                    </p>
                    {visiblePermissions
                      .filter((permission) => permission.group === group)
                      .map((permission) => {
                        const selected = overrides[permission.key] === picker;
                        const inherited = basePermissionAllowed(
                          role as
                            | "owner"
                            | "admin"
                            | "manager"
                            | "employee"
                            | "intern",
                          permission.key,
                        );
                        return (
                          <button
                            type="button"
                            key={permission.key}
                            className={`flex w-full gap-3 rounded-lg p-3 text-left hover:bg-[var(--soft)] ${selected ? "bg-[var(--soft)]" : ""}`}
                            onClick={() =>
                              setOverrides((current) => ({
                                ...current,
                                [permission.key]: picker,
                              }))
                            }
                          >
                            <span
                              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border ${selected ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)]"}`}
                            >
                              {selected && <Check size={13} />}
                            </span>
                            <span>
                              <b className="block text-sm">
                                {permission.label}
                              </b>
                              <small className="muted">
                                {permission.description}
                              </small>
                              {inherited && picker === "deny" && (
                                <small className="mt-1 block text-amber-500">
                                  Normally allowed by the {role} role
                                </small>
                              )}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                ),
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function AccessList({
  title,
  icon,
  permissions,
  empty,
  remove,
}: {
  title: string;
  icon: React.ReactNode;
  permissions: typeof SIMPLE_PERMISSIONS;
  empty: string;
  remove: (key: string) => void;
}) {
  return (
    <div className="mt-5">
      <h3 className="text-sm font-bold">{title}</h3>
      <div className="mt-2 divide-y divide-[var(--border)] border-y border-[var(--border)]">
        {permissions.map((permission) => (
          <div className="flex items-center gap-3 py-3" key={permission.key}>
            <span
              className={title === "Can" ? "text-emerald-500" : "text-red-500"}
            >
              {icon}
            </span>
            <span className="min-w-0 flex-1">
              <b className="block text-sm">{permission.label}</b>
              <small className="muted">{permission.description}</small>
            </span>
            <button
              aria-label={`Remove ${permission.label}`}
              onClick={() => remove(permission.key)}
            >
              <X size={15} />
            </button>
          </div>
        ))}
        {!permissions.length && <p className="py-3 text-sm muted">{empty}</p>}
      </div>
    </div>
  );
}
