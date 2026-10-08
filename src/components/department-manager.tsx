"use client";

import { useState } from "react";
import { Building2, Pencil, Plus, Trash2, X } from "lucide-react";
import { ConfirmDialog } from "./confirm-dialog";

type Department = { id: string; name: string; workDays?: number[] };
const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function DepartmentManager({
  companyId,
  initialDepartments,
}: {
  companyId: string;
  initialDepartments: Department[];
}) {
  const [departments, setDepartments] = useState(initialDepartments);
  const [editing, setEditing] = useState<Department | null | undefined>();
  const [removing, setRemoving] = useState<Department | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const body = {
      ...(editing ? { departmentId: editing.id } : {}),
      name: String(form.get("name") ?? ""),
      workDays: form.getAll("workDays").map(Number),
    };
    const response = await fetch(`/api/companies/${companyId}/departments`, {
      method: editing ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (response.ok) {
      if (editing)
        setDepartments((current) =>
          current.map((department) =>
            department.id === editing.id ? { ...department, ...body } : department,
          ),
        );
      else setDepartments((current) => [...current, result.department]);
      setEditing(undefined);
    } else setError(result.error ?? "Could not save department");
    setBusy(false);
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    const response = await fetch(`/api/companies/${companyId}/departments`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ departmentId: removing.id }),
    });
    const result = await response.json();
    if (response.ok) {
      setDepartments((current) => current.filter((department) => department.id !== removing.id));
      setRemoving(null);
      location.reload();
    } else setError(result.error ?? "Could not remove department");
    setBusy(false);
  }

  return (
    <section className="panel mt-6 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold">Departments</h2>
          <p className="mt-1 text-sm muted">Set teams and their scheduled working days.</p>
        </div>
        <button className="btn btn-secondary" onClick={() => setEditing(null)}>
          <Plus size={16} /> Add department
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {departments.map((department) => (
          <div className="rounded-xl border border-[var(--border)] p-4" key={department.id}>
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-[var(--soft)] p-2"><Building2 size={17} /></span>
              <div className="min-w-0 flex-1">
                <b>{department.name}</b>
                <p className="mt-1 text-xs muted">
                  {(department.workDays ?? [1, 2, 3, 4, 5, 6]).map((day) => days[day]).join(", ")}
                </p>
              </div>
              <button aria-label={`Edit ${department.name}`} className="p-1 muted hover:text-[var(--text)]" onClick={() => setEditing(department)}>
                <Pencil size={15} />
              </button>
              <button aria-label={`Remove ${department.name}`} className="p-1 text-red-500" onClick={() => setRemoving(department)}>
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
      {editing !== undefined && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <form className="panel w-full max-w-lg p-6" onSubmit={save}>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-extrabold">{editing ? "Edit department" : "New department"}</h2>
              <button type="button" onClick={() => setEditing(undefined)}><X /></button>
            </div>
            <label className="mt-5 block">
              <span className="label">Department name</span>
              <input className="input" name="name" defaultValue={editing?.name ?? ""} required />
            </label>
            <fieldset className="mt-5">
              <legend className="label">Working days</legend>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                {days.map((day, index) => (
                  <label className="flex flex-col items-center gap-2 rounded-lg bg-[var(--soft)] p-2 text-xs" key={day}>
                    <input
                      type="checkbox"
                      name="workDays"
                      value={index}
                      defaultChecked={(editing?.workDays ?? [1, 2, 3, 4, 5, 6]).includes(index)}
                    />
                    {day}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(undefined)}>Cancel</button>
              <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
            </div>
          </form>
        </div>
      )}
      <ConfirmDialog
        open={Boolean(removing)}
        title="Remove this department?"
        description={`${removing?.name ?? "This department"} will be removed and its members will become unassigned. Employee accounts and work records will remain.`}
        confirmLabel="Remove Department"
        destructive
        busy={busy}
        onCancel={() => setRemoving(null)}
        onConfirm={() => void remove()}
      />
    </section>
  );
}
