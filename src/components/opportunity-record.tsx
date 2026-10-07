"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CalendarClock,
  FileText,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Paperclip,
  StickyNote,
  Trash2,
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
import { ConfirmDialog } from "./confirm-dialog";
type Permissions = {
  edit: boolean;
  delete: boolean;
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
    [archiveConfirm, setArchiveConfirm] = useState(false),
    [deleteConfirm, setDeleteConfirm] = useState(false),
    [dialog, setDialog] = useState(
      params.get("action") === "lost" ? "lost" : "",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [note, setNote] = useState(""),
    [recordTab, setRecordTab] = useState<"notes" | "extra">("notes"),
    [relatedPanel, setRelatedPanel] = useState<
      "" | "activities" | "quotations"
    >(""),
    [chatterMode, setChatterMode] = useState<"message" | "note" | "">(""),
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
  async function deleteOpportunity() {
    setBusy(true);
    setError("");
    try {
      await crmRequest(base, "DELETE");
      router.push(`/workspace/${companyId}/crm`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete opportunity");
      setDeleteConfirm(false);
      setBusy(false);
    }
  }
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
  const humanChange = (key: string, value: unknown) => {
    if (value === null || value === undefined || value === "") return "—";
    const id = String(value);
    if (key === "stageId")
      return title(stages.find((stage) => stage.id === id) ?? { id: "Stage" });
    if (["ownerId", "assignedUserId"].includes(key))
      return title(
        members.find((member) => member.id === id) ?? { id: "Former Member" },
      );
    if (["contactId", "customerId"].includes(key))
      return title(
        contacts.find((contact) => contact.id === id) ?? {
          id: "Unavailable contact",
        },
      );
    if (key === "priority") return priorityStars(value);
    if (typeof value === "object") return "Updated";
    return String(value);
  };
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
    <div>
      <header className="flex flex-wrap items-end justify-between gap-3 pb-3">
        <div className="min-w-0">
          <Link
            href={navigation.returnUrl}
            className="flex items-center gap-1 text-sm text-[var(--accent)]"
          >
            <ArrowLeft size={15} />
            Pipeline
          </Link>
          <h1 className="mt-1 truncate text-2xl font-extrabold">
            {String(record.name)}
          </h1>
        </div>
        <div className="flex items-center gap-1">
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
                className="btn btn-secondary !p-2"
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
      <section className="border border-[var(--border)] bg-[var(--panel)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] p-2">
          <div className="flex flex-wrap gap-2">
            {permissions.quotation && (
              <button
                disabled={busy}
                className="btn btn-primary !py-2"
                onClick={() => setDialog("quotation")}
              >
                New quotation
              </button>
            )}
            {permissions.close && (
              <>
                <button
                  disabled={busy || record.status === "won"}
                  className="btn btn-secondary !py-2"
                  onClick={() =>
                    void run(async () => {
                      const stage = stages.find((s) => s.stageType === "WON");
                      if (!stage)
                        throw new Error("Configure a Won stage first.");
                      await patch({ stageId: stage.id });
                    })
                  }
                >
                  Won
                </button>
                <button
                  disabled={busy || record.status === "lost"}
                  className="btn btn-secondary !py-2"
                  onClick={() => setDialog("lost")}
                >
                  Lost
                </button>
              </>
            )}
            <details className="relative">
              <summary className="btn btn-secondary cursor-pointer list-none !py-2">
                <MoreHorizontal size={16} /> Actions
              </summary>
              <div className="absolute left-0 top-11 z-30 w-44 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-1 shadow-xl">
                {permissions.edit && (
                  <>
                    <button
                      className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-[var(--soft)]"
                      onClick={() => {
                        setForm(record);
                        setEditing(true);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-[var(--soft)]"
                      onClick={() => {
                        if (record.archived)
                          void run(() => patch({ archived: false }));
                        else setArchiveConfirm(true);
                      }}
                    >
                      {record.archived ? "Restore from Archive" : "Move to Archive"}
                    </button>
                  </>
                )}
                {permissions.activity && (
                  <button
                    className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-[var(--soft)]"
                    onClick={() => setDialog("activity")}
                  >
                    Schedule activity
                  </button>
                )}
              </div>
            </details>
            {permissions.delete && (
              <button
                className="btn bg-red-600 text-white hover:bg-red-700 !py-2"
                onClick={() => setDeleteConfirm(true)}
              >
                <Trash2 size={16} /> Delete
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              className="btn btn-secondary !py-2"
              onClick={() =>
                setRelatedPanel((value) =>
                  value === "activities" ? "" : "activities",
                )
              }
            >
              <CalendarClock size={16} />
              Activities{" "}
              {activities.filter((a) => a.status === "scheduled").length}
            </button>
            <button
              className="btn btn-secondary !py-2"
              onClick={() =>
                setRelatedPanel((value) =>
                  value === "quotations" ? "" : "quotations",
                )
              }
            >
              <FileText size={16} />
              Quotations {quotations.length}
            </button>
          </div>
        </div>
        <div className="flex overflow-auto border-b border-[var(--border)] p-2">
          {stages.map((stage) => (
            <button
              key={stage.id}
              disabled={busy || !permissions.move}
              className={`relative min-w-28 shrink-0 border-y border-r border-[var(--border)] px-4 py-2 text-sm font-semibold first:border-l ${record.stageId === stage.id ? "bg-[var(--accent)] text-white" : "bg-[var(--soft)]"}`}
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
        <div className="grid xl:grid-cols-[minmax(0,68fr)_minmax(340px,32fr)]">
          <main className="min-w-0 border-r border-[var(--border)]">
            {editing ? (
              <form
                className="grid gap-4 p-5 sm:grid-cols-2"
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
                    onChange={(priority) =>
                      setForm((f) => ({ ...f, priority }))
                    }
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
              <section className="grid gap-x-10 gap-y-4 p-5 sm:grid-cols-2">
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
                <div className="mt-2 border-t border-[var(--border)] pt-3 sm:col-span-2">
                  <div className="flex gap-1 border-b border-[var(--border)]">
                    {(["notes", "extra"] as const).map((tab) => (
                      <button
                        type="button"
                        key={tab}
                        className={`border-b-2 px-4 py-2 text-sm font-semibold capitalize ${recordTab === tab ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent muted"}`}
                        onClick={() => setRecordTab(tab)}
                      >
                        {tab === "extra" ? "Extra Info" : "Notes"}
                      </button>
                    ))}
                  </div>
                  {recordTab === "notes" ? (
                    <p className="min-h-32 whitespace-pre-wrap px-2 py-4 text-sm leading-6">
                      {String(record.description || "No notes")}
                    </p>
                  ) : (
                    <div className="grid gap-x-10 gap-y-4 px-2 py-4 sm:grid-cols-2">
                      {["source", "medium", "campaign", "city", "country"].map(
                        (key) => (
                          <Value label={key} key={key}>
                            {String(record[key] || "—")}
                          </Value>
                        ),
                      )}
                    </div>
                  )}
                </div>
              </section>
            )}
            {relatedPanel === "activities" && (
              <section
                id="activities"
                className="border-t border-[var(--border)] p-5"
              >
                <h2 className="mb-3 font-bold">Activities</h2>
                {activities.map((a) => (
                  <div
                    className="border-t border-[var(--border)] py-3"
                    key={a.id}
                  >
                    <div className="flex justify-between gap-3">
                      <b>{String(a.title)}</b>
                      <span
                        className={
                          getActivityState(a, new Date(), timezone) ===
                          "overdue"
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
                                        ? (prompt(
                                            "Completion note (optional)",
                                          ) ?? "")
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
            )}
            {relatedPanel === "quotations" && (
              <section
                id="quotations"
                className="border-t border-[var(--border)] p-5"
              >
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
                            {String(line.description)} · {String(line.quantity)}{" "}
                            × {money(line.unitPrice)}
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
            )}
          </main>
          <aside className="min-h-[560px] p-4">
            <div className="mb-3 flex flex-wrap gap-1 border-b border-[var(--border)] pb-3">
              {permissions.note && (
                <>
                  <button
                    className={`btn !py-2 ${chatterMode === "message" ? "btn-primary" : "btn-secondary"}`}
                    onClick={() =>
                      setChatterMode((mode) =>
                        mode === "message" ? "" : "message",
                      )
                    }
                  >
                    <MessageSquare size={15} /> Send Message
                  </button>
                  <button
                    className={`btn !py-2 ${chatterMode === "note" ? "btn-primary" : "btn-secondary"}`}
                    onClick={() =>
                      setChatterMode((mode) => (mode === "note" ? "" : "note"))
                    }
                  >
                    <StickyNote size={15} /> Log Note
                  </button>
                </>
              )}
              {permissions.activity && (
                <button
                  className="btn btn-secondary !py-2"
                  onClick={() => setDialog("activity")}
                >
                  <CalendarClock size={15} /> Activity
                </button>
              )}
            </div>
            {permissions.note && chatterMode && (
              <form
                className="mb-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    await crmRequest(base + "/timeline", "POST", {
                      body: note,
                      eventType: chatterMode === "message" ? "message" : "note",
                    });
                    setNote("");
                    router.refresh();
                  });
                }}
              >
                <Field
                  label={
                    chatterMode === "message" ? "Message" : "Internal note"
                  }
                >
                  <textarea
                    className="input min-h-24"
                    required
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={
                      chatterMode === "message"
                        ? "Write a message…"
                        : "Visible to authorized internal users"
                    }
                  />
                </Field>
                <button disabled={busy} className="btn btn-secondary mt-2">
                  {chatterMode === "message" ? "Send" : "Log note"}
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
            <div>
              {[...events]
                .sort((a, b) =>
                  String(b.timestamp).localeCompare(String(a.timestamp)),
                )
                .map((event) => (
                  <article
                    key={event.id}
                    className="border-t border-[var(--border)] py-4 first:border-0"
                  >
                    <div className="flex gap-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--soft)] text-xs font-bold">
                        {initials(String(event.actorName ?? "Former Member"))}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs muted">
                          {String(event.actorName ?? "Former Member")} ·{" "}
                          {event.timestamp
                            ? new Date(String(event.timestamp)).toLocaleString()
                            : ""}
                        </p>
                        <b className="mt-1 block text-sm capitalize">
                          {eventTitle(String(event.eventType))}
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
                          <p
                            key={key}
                            className="mt-1 break-words text-xs muted"
                          >
                            {changeLabel(key)}: {humanChange(key, change?.from)}{" "}
                            → {humanChange(key, change?.to)}
                          </p>
                        ))}
                      </div>
                    </div>
                  </article>
                ))}
            </div>
          </aside>
        </div>
      </section>
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
      <ConfirmDialog
        open={archiveConfirm}
        title="Move this opportunity to the archive?"
        description="This does not delete the opportunity. It will be removed from active CRM views, while its details and history remain stored."
        confirmLabel="Move to Archive"
        busy={busy}
        onCancel={() => setArchiveConfirm(false)}
        onConfirm={() => {
          setArchiveConfirm(false);
          void run(() => patch({ archived: true }));
        }}
      />
      <ConfirmDialog
        open={deleteConfirm}
        title="Permanently delete this opportunity?"
        description="This permanently deletes the CRM opportunity, its timeline, activities, and attachments. Linked sales records are preserved. This action cannot be undone."
        confirmLabel="Delete Permanently"
        destructive
        busy={busy}
        onCancel={() => setDeleteConfirm(false)}
        onConfirm={() => void deleteOpportunity()}
      />
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

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function eventTitle(eventType: string) {
  const labels: Record<string, string> = {
    created: "Opportunity created",
    opportunity_created: "Opportunity created",
    stage_changed: "Stage changed",
    priority_changed: "Priority changed",
    note: "Internal note",
    message: "Message sent",
    updated: "Opportunity updated",
  };
  return labels[eventType] ?? eventType.replaceAll("_", " ");
}

function changeLabel(key: string) {
  const labels: Record<string, string> = {
    stageId: "Stage",
    customerId: "Contact",
    contactId: "Contact",
    ownerId: "Salesperson",
    assignedUserId: "Assigned user",
    expectedCloseDate: "Expected closing",
    value: "Expected revenue",
    salesTeamId: "Sales team",
  };
  return labels[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function priorityStars(value: unknown) {
  const count = normalizePriority(value);
  return `${"★".repeat(count)}${"☆".repeat(3 - count)}`;
}
