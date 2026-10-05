"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Plus,
  Paperclip,
} from "lucide-react";
import {
  Priority,
  Field,
  Modal,
  crmRequest,
  title,
  type Item,
} from "./crm-controls";
import { getActivityState, normalizePriority } from "@/lib/crm-query";
import { TagSelector, type SharedTag } from "./tag-selector";
type Permissions = {
  edit: boolean;
  move: boolean;
  close: boolean;
  assign: boolean;
  activity: boolean;
  note: boolean;
  quotation: boolean;
  tagManage: boolean;
};
export function OpportunityRecord({
  companyId,
  currency,
  timezone,
  opportunity,
  stages,
  members,
  teams,
  contacts,
  lostReasons,
  tags,
  events,
  activities,
  quotations,
  files,
  permissions,
}: {
  companyId: string;
  currency: string;
  timezone: string;
  opportunity: Item;
  stages: Item[];
  members: Item[];
  teams: Item[];
  contacts: Item[];
  lostReasons: Item[];
  tags: Item[];
  events: Item[];
  activities: Item[];
  quotations: Item[];
  files: Item[];
  permissions: Permissions;
}) {
  const router = useRouter(),
    params = useSearchParams(),
    base = `/api/companies/${companyId}/crm/opportunities/${opportunity.id}`;
  const [record, setRecord] = useState(opportunity),
    [form, setForm] = useState(opportunity),
    [editing, setEditing] = useState(false),
    [dialog, setDialog] = useState(
      params.get("action") === "lost" ? "lost" : "",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [note, setNote] = useState(""),
    [navigation, setNavigation] = useState<{
      ids: string[];
      returnUrl: string;
    }>({ ids: [], returnUrl: `/workspace/${companyId}/crm` }),
    [lines, setLines] = useState([
      { description: "", quantity: 1, unitPrice: 0, taxRate: 0, discount: 0 },
    ]);
  useEffect(() => {
    setRecord(opportunity);
    if (!editing) setForm(opportunity);
  }, [opportunity, editing]);
  useEffect(() => {
    try {
      const raw = JSON.parse(
        sessionStorage.getItem(`toro:crm:${companyId}:navigation`) ?? "null",
      );
      if (
        raw &&
        Array.isArray(raw.ids) &&
        String(raw.returnUrl).startsWith(`/workspace/${companyId}/crm`)
      )
        setNavigation(raw);
    } catch {}
  }, [companyId]);
  const dirty = editing && JSON.stringify(form) !== JSON.stringify(record);
  useEffect(() => {
    if (!dirty) return;
    const unload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    const click = (e: MouseEvent) => {
      if (
        (e.target as Element).closest("a[href]") &&
        !confirm("Discard unsaved changes?")
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
    };
  }, [dirty]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed");
    } finally {
      setBusy(false);
    }
  };
  const patch = async (updates: Record<string, unknown>) => {
    const result = await crmRequest(base, "PATCH", {
      ...updates,
      expectedVersion: Number(record.version ?? 0),
    });
    setRecord(result.record);
    setForm(result.record);
    router.refresh();
  };
  const money = (v: unknown) =>
    new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
      Number(v ?? 0),
    );
  const customer = contacts.find(
      (c) => c.id === (record.customerId ?? record.contactId),
    ),
    position = navigation.ids.indexOf(record.id);
  async function schedule(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fields = Object.fromEntries(new FormData(e.currentTarget));
    if (!fields.assigneeId) delete fields.assigneeId;
    if (fields.type !== "meeting") delete fields.endAt;
    await run(async () => {
      await crmRequest(`/api/companies/${companyId}/crm/activities`, "POST", {
        ...fields,
        relatedType: "opportunity",
        relatedId: record.id,
        dueAt: new Date(String(fields.dueAt)).toISOString(),
        ...(fields.type === "meeting"
          ? { endAt: new Date(String(fields.endAt)).toISOString() }
          : {}),
        ...(fields.assigneeId ? { assigneeId: fields.assigneeId } : {}),
      });
      setDialog("");
      router.refresh();
    });
  }
  const editable = [
    "name",
    "email",
    "phone",
    "value",
    "probability",
    "expectedCloseDate",
    "city",
    "country",
    "source",
    "medium",
    "campaign",
    "description",
  ];
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={navigation.returnUrl}
            className="flex items-center gap-1 text-sm text-[var(--accent)]"
          >
            <ArrowLeft size={15} />
            Pipeline
          </Link>
          <h1 className="mt-2 text-2xl font-extrabold">
            {String(record.name)}
          </h1>
        </div>
        <div className="flex gap-2">
          {position >= 0 && (
            <span className="py-2 text-sm muted">
              {position + 1} / {navigation.ids.length}
            </span>
          )}
          {[position - 1, position + 1].map((index, i) =>
            navigation.ids[index] ? (
              <Link
                key={i}
                aria-label={i ? "Next opportunity" : "Previous opportunity"}
                className="btn btn-secondary"
                href={`/workspace/${companyId}/crm/opportunities/${navigation.ids[index]}`}
              >
                {i ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              </Link>
            ) : null,
          )}
        </div>
      </header>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-500/10 p-3 text-sm text-red-500"
        >
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {permissions.quotation && (
          <button
            disabled={busy}
            className="btn btn-primary"
            onClick={() => setDialog("quotation")}
          >
            New quotation
          </button>
        )}
        {permissions.close && (
          <>
            <button
              disabled={busy || record.status === "won"}
              className="btn btn-secondary"
              onClick={() =>
                void run(async () => {
                  const stage = stages.find((s) => s.stageType === "WON");
                  if (!stage) throw new Error("Configure a Won stage first.");
                  await patch({ stageId: stage.id });
                })
              }
            >
              Won
            </button>
            <button
              disabled={busy || record.status === "lost"}
              className="btn btn-secondary"
              onClick={() => setDialog("lost")}
            >
              Lost
            </button>
            {["won", "lost"].includes(String(record.status)) && (
              <button
                disabled={busy}
                className="btn btn-secondary"
                onClick={() =>
                  void run(async () => {
                    const stage = stages.find((s) => s.stageType === "OPEN");
                    if (!stage)
                      throw new Error("Configure an open stage first.");
                    await patch({ stageId: stage.id });
                  })
                }
              >
                Reopen
              </button>
            )}
          </>
        )}
        {permissions.edit && (
          <button
            className="btn btn-secondary"
            disabled={busy || editing}
            onClick={() =>
              void run(() => patch({ archived: !record.archived }))
            }
          >
            {record.archived ? "Unarchive" : "Archive"}
          </button>
        )}
        {permissions.edit && (
          <button
            className="btn btn-secondary"
            onClick={() => {
              setForm(record);
              setEditing(true);
            }}
          >
            Edit
          </button>
        )}
        {permissions.activity && (
          <button
            className="btn btn-secondary"
            onClick={() => setDialog("activity")}
          >
            Schedule activity
          </button>
        )}
        <a className="btn btn-secondary" href="#quotations">
          Quotations {quotations.length}
        </a>
        <a className="btn btn-secondary" href="#activities">
          Activities {activities.filter((a) => a.status === "scheduled").length}
        </a>
      </div>
      <div className="flex gap-1 overflow-auto border-y border-[var(--border)] py-3">
        {stages.map((stage) => (
          <button
            key={stage.id}
            disabled={busy || !permissions.move}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold ${record.stageId === stage.id ? "bg-[var(--accent)] text-white" : "bg-[var(--soft)]"}`}
            onClick={() =>
              stage.stageType === "LOST"
                ? setDialog("lost")
                : void run(() => patch({ stageId: stage.id }))
            }
          >
            {title(stage)}
          </button>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="min-w-0 space-y-5">
          {editing ? (
            <form
              className="panel grid gap-4 p-5 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const updates = Object.fromEntries(
                    [
                      ...editable,
                      "customerId",
                      "ownerId",
                      "salesTeamId",
                      "tags",
                      "priority",
                    ]
                      .filter(
                        (key) =>
                          JSON.stringify(form[key]) !==
                          JSON.stringify(record[key]),
                      )
                      .map((key) => [key, form[key]]),
                  );
                  await patch(updates);
                  setEditing(false);
                });
              }}
            >
              {editable.map((key) => (
                <Field
                  key={key}
                  label={key === "value" ? "Expected revenue" : key}
                >
                  {key === "description" ? (
                    <textarea
                      className="input"
                      value={String(form[key] ?? "")}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, [key]: e.target.value }))
                      }
                    />
                  ) : (
                    <input
                      className="input"
                      value={String(form[key] ?? "")}
                      type={
                        ["value", "probability"].includes(key)
                          ? "number"
                          : key === "expectedCloseDate"
                            ? "date"
                            : key === "email"
                              ? "email"
                              : "text"
                      }
                      min={
                        ["value", "probability"].includes(key) ? 0 : undefined
                      }
                      max={key === "probability" ? 100 : undefined}
                      step="any"
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          [key]: ["value", "probability"].includes(key)
                            ? Number(e.target.value)
                            : e.target.value,
                        }))
                      }
                    />
                  )}
                </Field>
              ))}
              {(["customerId", "ownerId", "salesTeamId"] as const).map(
                (key) => (
                  <Field
                    key={key}
                    label={
                      key === "customerId"
                        ? "Contact"
                        : key === "ownerId"
                          ? "Salesperson"
                          : "Sales team"
                    }
                  >
                    <select
                      className="input"
                      disabled={key !== "customerId" && !permissions.assign}
                      value={String(form[key] ?? "")}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          [key]: e.target.value || null,
                        }))
                      }
                    >
                      <option value="">Unassigned</option>
                      {(key === "customerId"
                        ? contacts
                        : key === "ownerId"
                          ? members
                          : teams
                      ).map((r) => (
                        <option key={r.id} value={r.id}>
                          {title(r)}
                        </option>
                      ))}
                    </select>
                  </Field>
                ),
              )}
              <Field label="Tags">
                <TagSelector
                  companyId={companyId}
                  tags={tags as SharedTag[]}
                  value={(form.tags as string[]) ?? []}
                  canCreate={permissions.tagManage}
                  onChange={(tagIds) =>
                    setForm((current) => ({ ...current, tags: tagIds }))
                  }
                />
              </Field>
              <Field label="Priority">
                <Priority
                  value={form.priority}
                  onChange={(priority) => setForm((f) => ({ ...f, priority }))}
                />
              </Field>
              <div className="flex gap-2 sm:col-span-2">
                <button disabled={busy || !dirty} className="btn btn-primary">
                  Save
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditing(false)}
                >
                  Discard
                </button>
              </div>
            </form>
          ) : (
            <section className="panel grid gap-5 p-5 sm:grid-cols-2">
              <Value label="Expected revenue">{money(record.value)}</Value>
              <Value label="Probability">
                {String(record.probability ?? 0)}%
              </Value>
              <Value label="Contact">
                {customer ? (
                  <Link
                    className="text-[var(--accent)]"
                    href={`/workspace/${companyId}/contacts/${customer.id}`}
                  >
                    {title(customer)}
                  </Link>
                ) : (
                  "No contact"
                )}
              </Value>
              <Value label="Salesperson">
                {title(
                  members.find((m) => m.id === record.ownerId) ?? {
                    id: "Unassigned",
                  },
                )}
              </Value>
              <Value label="Email">
                {String(record.email || customer?.email || "—")}
              </Value>
              <Value label="Phone">
                {String(record.phone || customer?.phone || "—")}
              </Value>
              <Value label="Priority">
                <Priority
                  value={normalizePriority(record.priority)}
                  disabled={busy || !permissions.edit}
                  onChange={(priority) => void run(() => patch({ priority }))}
                />
              </Value>
              <Value label="Expected closing">
                {String(record.expectedCloseDate || "—")}
              </Value>
              <Value label="Sales team">
                {title(
                  teams.find((t) => t.id === record.salesTeamId) ?? {
                    id: "Unassigned",
                  },
                )}
              </Value>
              <Value label="Tags">
                <div className="flex flex-wrap gap-1">
                  {((record.tags as string[]) ?? []).map((id) => {
                    const tag = tags.find((item) => item.id === id);
                    return (
                      <span
                        className="rounded-md bg-[var(--soft)] px-2 py-1 text-xs"
                        key={id}
                      >
                        {String(tag?.name ?? id)}
                      </span>
                    );
                  })}
                  {!((record.tags as string[]) ?? []).length && "—"}
                </div>
              </Value>
              {["source", "medium", "campaign", "city", "country"].map(
                (key) => (
                  <Value label={key} key={key}>
                    {String(record[key] || "—")}
                  </Value>
                ),
              )}
              <div className="sm:col-span-2">
                <Value label="Notes">
                  <p className="whitespace-pre-wrap">
                    {String(record.description || "No notes")}
                  </p>
                </Value>
              </div>
              {record.status === "lost" && (
                <Value label="Lost reason">
                  {title(
                    lostReasons.find((r) => r.id === record.lostReasonId) ?? {
                      id: "—",
                    },
                  )}
                  <p>{String(record.lostNotes ?? "")}</p>
                </Value>
              )}
            </section>
          )}
          <section id="activities" className="panel p-5">
            <h2 className="mb-3 font-bold">Activities</h2>
            {activities.map((a) => (
              <div className="border-t border-[var(--border)] py-3" key={a.id}>
                <div className="flex justify-between gap-3">
                  <b>{String(a.title)}</b>
                  <span
                    className={
                      getActivityState(a, new Date(), timezone) === "overdue"
                        ? "text-red-500"
                        : "muted"
                    }
                  >
                    {getActivityState(a, new Date(), timezone)}
                  </span>
                </div>
                <p className="text-sm muted">
                  {String(a.type)} ·{" "}
                  {a.dueAt
                    ? new Date(String(a.dueAt)).toLocaleString()
                    : "No date"}
                </p>
                <p className="text-sm">{String(a.description ?? "")}</p>
                {Boolean(a.calendarEventId) && (
                  <Link
                    className="text-sm text-[var(--accent)]"
                    href={`/workspace/${companyId}/calendar`}
                  >
                    Open Calendar
                  </Link>
                )}
                {a.status === "scheduled" && a.canEdit === true && (
                  <div className="mt-2 flex gap-2">
                    {["completed", "cancelled"].map((status) => (
                      <button
                        key={status}
                        className="btn btn-secondary !py-1 text-xs"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await crmRequest(
                              `/api/companies/${companyId}/crm/activities/${a.id}`,
                              "PATCH",
                              {
                                status,
                                outcome:
                                  status === "completed"
                                    ? (prompt("Completion note (optional)") ??
                                      "")
                                    : "",
                              },
                            );
                            router.refresh();
                          })
                        }
                      >
                        {status === "completed" ? "Mark Done" : "Cancel"}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {!activities.length && (
              <p className="text-sm muted">No activities scheduled.</p>
            )}
          </section>
          <section id="quotations" className="panel p-5">
            <h2 className="mb-3 font-bold">Linked quotations</h2>
            {quotations.map((q) => (
              <details
                className="border-t border-[var(--border)] py-3"
                key={q.id}
              >
                <summary className="cursor-pointer">
                  {String(q.title)} · {money(q.amount)} · {String(q.status)}
                </summary>
                <div className="mt-3 text-sm">
                  {((q.lines as Record<string, unknown>[]) ?? []).map(
                    (line, i) => (
                      <p key={i}>
                        {String(line.description)} · {String(line.quantity)} ×{" "}
                        {money(line.unitPrice)}
                      </p>
                    ),
                  )}
                </div>
              </details>
            ))}
            {!quotations.length && (
              <p className="text-sm muted">No linked quotations.</p>
            )}
          </section>
        </main>
        <aside className="panel h-fit p-4">
          <h2 className="mb-3 font-bold">Chatter</h2>
          {permissions.note && (
            <form
              className="mb-4"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await crmRequest(base + "/timeline", "POST", {
                    body: note,
                    eventType: "note",
                  });
                  setNote("");
                  router.refresh();
                });
              }}
            >
              <Field label="Internal note">
                <textarea
                  className="input min-h-24"
                  required
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Visible to authorized internal users"
                />
              </Field>
              <button disabled={busy} className="btn btn-secondary mt-2">
                Log note
              </button>
            </form>
          )}
          <div className="mb-4 border-y border-[var(--border)] py-3">
            <b className="text-sm">Attachments</b>
            {files.map((file) => (
              <a
                key={file.id}
                className="mt-2 block truncate text-sm text-[var(--accent)]"
                href={base + "/files/" + file.id}
              >
                {String(file.name)}
              </a>
            ))}
            {permissions.note && (
              <label className="btn btn-secondary mt-2 text-sm">
                <Paperclip size={14} />
                Attach file
                <input
                  type="file"
                  className="hidden"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file)
                      void run(async () => {
                        const body = new FormData();
                        body.set("file", file);
                        const response = await fetch(base + "/files", {
                          method: "POST",
                          body,
                        });
                        const result = await response.json();
                        if (!response.ok) throw new Error(result.error);
                        router.refresh();
                      });
                  }}
                />
              </label>
            )}
          </div>
          <div className="space-y-3">
            {[...events]
              .sort((a, b) =>
                String(b.timestamp).localeCompare(String(a.timestamp)),
              )
              .map((event) => (
                <article
                  key={event.id}
                  className="rounded-lg bg-[var(--soft)] p-3"
                >
                  <p className="text-xs muted">
                    {String(event.actorName ?? event.actorId ?? "User")} ·{" "}
                    {event.timestamp
                      ? new Date(String(event.timestamp)).toLocaleString()
                      : ""}
                  </p>
                  <b className="mt-1 block text-sm capitalize">
                    {String(event.eventType).replaceAll("_", " ")}
                  </b>
                  <p className="mt-1 whitespace-pre-wrap text-sm">
                    {String(event.body ?? "")}
                  </p>
                  {Object.entries(
                    (event.changes as Record<
                      string,
                      { from?: unknown; to?: unknown }
                    >) ?? {},
                  ).map(([key, change]) => (
                    <p key={key} className="mt-1 break-words text-xs muted">
                      {key}: {JSON.stringify(change?.from ?? "—")} →{" "}
                      {JSON.stringify(change?.to ?? "—")}
                    </p>
                  ))}
                </article>
              ))}
          </div>
        </aside>
      </div>
      {dialog === "lost" && (
        <Modal title="Mark opportunity lost" close={() => setDialog("")}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const data = Object.fromEntries(new FormData(e.currentTarget));
              void run(async () => {
                const stage = stages.find((s) => s.stageType === "LOST");
                if (!stage) throw new Error("Configure a Lost stage first.");
                await patch({
                  stageId: stage.id,
                  lostReasonId: data.lostReasonId,
                  lostNotes: data.lostNotes,
                });
                setDialog("");
              });
            }}
          >
            <Field label="Lost reason">
              <select className="input" name="lostReasonId" required>
                <option value="">Select reason</option>
                {lostReasons.map((r) => (
                  <option key={r.id} value={r.id}>
                    {title(r)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Notes">
              <textarea className="input" name="lostNotes" />
            </Field>
            <button disabled={busy} className="btn btn-primary">
              Confirm lost
            </button>
            <Link
              className="ml-3 text-sm underline"
              href={`/workspace/${companyId}/crm?screen=configuration`}
            >
              Configure reasons and stages
            </Link>
          </form>
        </Modal>
      )}
      {dialog === "activity" && (
        <Modal title="Schedule activity" close={() => setDialog("")}>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={schedule}>
            <Field label="Type">
              <select className="input" name="type">
                {["call", "email", "meeting", "task", "document"].map(
                  (type) => (
                    <option key={type}>{type}</option>
                  ),
                )}
              </select>
            </Field>
            <Field label="Summary">
              <input className="input" name="title" required minLength={2} />
            </Field>
            <Field label="Due / meeting start">
              <input
                className="input"
                type="datetime-local"
                name="dueAt"
                required
              />
            </Field>
            <Field label="Meeting end">
              <input className="input" type="datetime-local" name="endAt" />
            </Field>
            <Field label="Assigned to">
              <select className="input" name="assigneeId">
                <option value="">Myself</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {title(m)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Notes">
              <textarea className="input" name="description" />
            </Field>
            <button disabled={busy} className="btn btn-primary">
              Save activity
            </button>
          </form>
        </Modal>
      )}
      {dialog === "quotation" && (
        <Modal title="New quotation" close={() => setDialog("")}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await crmRequest(base + "/quotations", "POST", { lines });
                setDialog("");
                router.refresh();
              });
            }}
          >
            <p className="text-sm muted">
              Customer: {customer ? title(customer) : "No contact selected"} ·{" "}
              {currency}
            </p>
            {lines.map((line, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-5">
                {Object.keys(line).map((key) => (
                  <Field key={key} label={key}>
                    <input
                      className="input"
                      required
                      type={key === "description" ? "text" : "number"}
                      min="0"
                      step="any"
                      value={line[key as keyof typeof line]}
                      onChange={(e) =>
                        setLines((current) =>
                          current.map((row, i) =>
                            i === index
                              ? {
                                  ...row,
                                  [key]:
                                    key === "description"
                                      ? e.target.value
                                      : Number(e.target.value),
                                }
                              : row,
                          ),
                        )
                      }
                    />
                  </Field>
                ))}
              </div>
            ))}
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() =>
                setLines((l) => [
                  ...l,
                  {
                    description: "",
                    quantity: 1,
                    unitPrice: 0,
                    taxRate: 0,
                    discount: 0,
                  },
                ])
              }
            >
              <Plus size={14} />
              Add line
            </button>
            <button disabled={busy} className="btn btn-primary ml-3">
              Save quotation
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
function Value({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide muted">{label}</p>
      <div className="mt-1 text-sm font-semibold">{children}</div>
    </div>
  );
}
