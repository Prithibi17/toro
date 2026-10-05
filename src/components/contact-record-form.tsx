"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  CalendarDays,
  ChevronLeft,
  FileText,
  Plus,
  Save,
  StickyNote,
  UserRound,
} from "lucide-react";
import { Field, Modal, crmRequest, type Item } from "./crm-controls";
import { TagSelector, type SharedTag } from "./tag-selector";

type Props = {
  companyId: string;
  contact?: Item;
  draft?: Partial<Item>;
  companies: Item[];
  members: Item[];
  sharedTags?: Item[];
  enabledModules: string[];
  canManage: boolean;
  canViewAccounting: boolean;
  address?: Record<string, unknown>;
  related?: Item[];
  events?: Item[];
  activities?: Item[];
  metrics?: {
    opportunities: number;
    pipelineValue: number;
    meetings: number;
    sales: number;
    salesValue: number;
  };
  currency: string;
};
const empty = {
  contactType: "company",
  displayName: "",
  parentContactId: "",
  email: "",
  phone: "",
  mobile: "",
  jobTitle: "",
  website: "",
  industry: "",
  tags: [],
  gstTreatment: "",
  gstin: "",
  isCustomer: false,
  isVendor: false,
  isPartner: false,
  ownerId: "",
  notes: "",
};
export function ContactRecordForm({
  companyId,
  contact,
  draft,
  companies,
  members,
  sharedTags = [],
  enabledModules,
  canManage,
  canViewAccounting,
  address = {},
  related = [],
  events = [],
  activities = [],
  metrics = {
    opportunities: 0,
    pipelineValue: 0,
    meetings: 0,
    sales: 0,
    salesValue: 0,
  },
  currency,
}: Props) {
  const router = useRouter(),
    isNew = !contact;
  const [form, setForm] = useState<Record<string, unknown>>({
    ...empty,
    ...draft,
    ...contact,
    parentContactId: contact?.parentContactId ?? draft?.parentContactId ?? "",
    tags: contact?.tags ?? draft?.tags ?? [],
  });
  const [addressForm, setAddress] = useState<Record<string, unknown>>({
    type: "main",
    street: "",
    street2: "",
    city: "",
    postalCode: "",
    state: "",
    country: "",
    ...address,
  });
  const initial = useRef(JSON.stringify({ form, addressForm }));
  const [tab, setTab] = useState("contacts"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [duplicates, setDuplicates] = useState<Item[]>([]),
    [dialog, setDialog] = useState(""),
    [note, setNote] = useState(""),
    [photoVersion, setPhotoVersion] = useState(0),
    [hasPhoto, setHasPhoto] = useState(Boolean(contact?.photoPath));
  const dirty = initial.current !== JSON.stringify({ form, addressForm });
  useEffect(() => {
    if (!dirty) return;
    const fn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [dirty]);
  const set = (key: string, value: unknown) =>
    setForm((current) => ({ ...current, [key]: value }));
  const initials = String(form.displayName || "New contact")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const money = (value: number) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  const tabs = [
    { id: "contacts", label: "Contacts" },
    ...(enabledModules.includes("sales")
      ? [{ id: "sales", label: "Sales & Purchase" }]
      : []),
    ...(canViewAccounting ? [{ id: "accounting", label: "Accounting" }] : []),
    { id: "notes", label: "Notes" },
  ];
  async function save(allowDuplicate = false) {
    if (!String(form.displayName ?? "").trim()) {
      setError("Name is required");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const body = {
        ...form,
        parentContactId:
          form.contactType === "person" ? form.parentContactId || null : null,
        tags: Array.isArray(form.tags)
          ? form.tags
          : String(form.tags ?? "")
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
        address: addressForm,
        allowDuplicate,
      };
      const response = await fetch(
        isNew
          ? `/api/companies/${companyId}/contacts`
          : `/api/companies/${companyId}/contacts/${contact.id}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const result = await response.json();
      if (response.status === 409 && result.duplicates) {
        setDuplicates(result.duplicates);
        return;
      }
      if (!response.ok)
        throw new Error(result.error ?? "Could not save contact");
      setDuplicates([]);
      initial.current = JSON.stringify({ form, addressForm });
      if (isNew)
        router.replace(`/workspace/${companyId}/contacts/${result.id}`);
      else router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save contact");
    } finally {
      setBusy(false);
    }
  }
  function discard() {
    if (!dirty || confirm("Discard unsaved contact changes?"))
      router.push(`/workspace/${companyId}/contacts`);
  }
  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await crmRequest(
        `/api/companies/${companyId}/contacts/${contact!.id}/timeline`,
        "POST",
        { body: note },
      );
      setNote("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save note");
    } finally {
      setBusy(false);
    }
  }
  async function uploadPhoto(file?: File) {
    if (!file || isNew) return;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch(
        `/api/companies/${companyId}/contacts/${contact.id}/photo`,
        { method: "POST", body },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Could not upload photo");
      setHasPhoto(true);
      setPhotoVersion((value) => value + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not upload photo");
    } finally {
      setBusy(false);
    }
  }
  async function schedule(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError("");
    try {
      const dueAt = new Date(String(values.dueAt)).toISOString();
      await crmRequest(`/api/companies/${companyId}/crm/activities`, "POST", {
        type: values.type,
        title: values.title,
        description: values.description,
        relatedType: "contact",
        relatedId: contact!.id,
        assigneeId: values.assigneeId || undefined,
        dueAt,
        ...(values.type === "meeting"
          ? { endAt: new Date(String(values.endAt)).toISOString() }
          : {}),
        status: "scheduled",
      });
      setDialog("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not schedule activity");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
        <div>
          <Link
            href={`/workspace/${companyId}/contacts`}
            className="flex items-center gap-1 text-sm muted"
          >
            <ChevronLeft size={15} />
            Contacts
          </Link>
          <h1 className="mt-1 text-xl font-bold">
            {isNew
              ? "New contact"
              : String(contact.displayName ?? contact.title)}
          </h1>
        </div>
        <div className="flex gap-2">
          <button
            className="btn btn-primary"
            disabled={busy || !canManage}
            onClick={() => void save()}
          >
            <Save size={16} />
            {busy ? "Saving…" : "Save"}
          </button>
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={discard}
          >
            Discard
          </button>
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
      {duplicates.length > 0 && (
        <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <b>Possible duplicate contacts found</b>
          <div className="mt-2 flex flex-wrap gap-2">
            {duplicates.map((item) => (
              <Link
                className="btn btn-secondary text-sm"
                key={item.id}
                href={`/workspace/${companyId}/contacts/${item.id}`}
              >
                {String(item.displayName ?? item.title)}
              </Link>
            ))}
          </div>
          <button
            className="btn btn-primary mt-3 text-sm"
            disabled={busy}
            onClick={() => void save(true)}
          >
            Create anyway
          </button>
        </section>
      )}
      {!isNew && (
        <div className="flex flex-wrap gap-2">
          {enabledModules.includes("crm") && (
            <Link
              className="btn btn-secondary"
              href={`/workspace/${companyId}/crm?scope=all&customerId=${contact.id}`}
            >
              <Building2 size={16} />
              <span>
                Opportunities <b>{metrics.opportunities}</b>
              </span>
            </Link>
          )}
          {enabledModules.includes("sales") && (
            <Link
              className="btn btn-secondary"
              href={`/workspace/${companyId}/sales?customerId=${contact.id}`}
            >
              <FileText size={16} />
              <span>
                Sales <b>{metrics.sales}</b> · {money(metrics.salesValue)}
              </span>
            </Link>
          )}
          {enabledModules.includes("calendar") && (
            <Link
              className="btn btn-secondary"
              href={`/workspace/${companyId}/calendar?relatedId=${contact.id}`}
            >
              <CalendarDays size={16} />
              <span>
                Meetings <b>{metrics.meetings}</b>
              </span>
            </Link>
          )}
        </div>
      )}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <main className="panel overflow-hidden">
          <section className="p-5 sm:p-6">
            <div className="mb-6 flex gap-4">
              <label
                className={`relative grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--soft)] text-2xl font-bold ${!isNew && canManage ? "cursor-pointer" : ""}`}
                title={!isNew && canManage ? "Upload contact image" : undefined}
              >
                {hasPhoto ? (
                  <Image
                    fill
                    unoptimized
                    className="object-cover"
                    alt="Contact image"
                    src={`/api/companies/${companyId}/contacts/${contact!.id}/photo?v=${photoVersion}`}
                  />
                ) : (
                  initials || <UserRound />
                )}
                {!isNew && canManage && (
                  <input
                    className="sr-only"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={busy}
                    onChange={(event) =>
                      void uploadPhoto(event.target.files?.[0])
                    }
                  />
                )}
              </label>
              <div className="min-w-0 flex-1">
                <input
                  className="w-full border-b-2 border-[var(--border)] bg-transparent pb-2 text-2xl font-semibold outline-none focus:border-[var(--accent)]"
                  aria-label="Name (company or person)"
                  placeholder="Name (company or person) *"
                  required
                  value={String(form.displayName ?? "")}
                  onChange={(e) => set("displayName", e.target.value)}
                />
                <div className="mt-3 flex gap-4 text-sm">
                  <label>
                    <input
                      type="radio"
                      checked={form.contactType === "company"}
                      onChange={() => set("contactType", "company")}
                    />{" "}
                    Company
                  </label>
                  <label>
                    <input
                      type="radio"
                      checked={form.contactType === "person"}
                      onChange={() => set("contactType", "person")}
                    />{" "}
                    Person
                  </label>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {form.contactType === "person" && (
                    <Field label="Company / Employer">
                      <select
                        className="input"
                        value={String(form.parentContactId ?? "")}
                        onChange={(e) => set("parentContactId", e.target.value)}
                      >
                        <option value="">No company</option>
                        {companies.map((company) => (
                          <option key={company.id} value={company.id}>
                            {String(company.displayName ?? company.title)}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  <Field label="Email">
                    <input
                      className="input"
                      type="email"
                      value={String(form.email ?? "")}
                      onChange={(e) => set("email", e.target.value)}
                    />
                  </Field>
                  <Field label="Phone">
                    <input
                      className="input"
                      type="tel"
                      value={String(form.phone ?? "")}
                      onChange={(e) => set("phone", e.target.value)}
                    />
                  </Field>
                </div>
              </div>
            </div>
            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <section className="space-y-3">
                <h2 className="text-sm font-bold uppercase tracking-wide muted">
                  Address
                </h2>
                {[
                  ["street", "Street"],
                  ["street2", "Street 2"],
                ].map(([key, label]) => (
                  <Field key={key} label={label}>
                    <input
                      className="input"
                      value={String(addressForm[key] ?? "")}
                      onChange={(e) =>
                        setAddress((a) => ({ ...a, [key]: e.target.value }))
                      }
                    />
                  </Field>
                ))}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="City">
                    <input
                      className="input"
                      value={String(addressForm.city ?? "")}
                      onChange={(e) =>
                        setAddress((a) => ({ ...a, city: e.target.value }))
                      }
                    />
                  </Field>
                  <Field label="ZIP / Postal code">
                    <input
                      className="input"
                      value={String(addressForm.postalCode ?? "")}
                      onChange={(e) =>
                        setAddress((a) => ({
                          ...a,
                          postalCode: e.target.value,
                        }))
                      }
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="State">
                    <input
                      className="input"
                      value={String(addressForm.state ?? "")}
                      onChange={(e) =>
                        setAddress((a) => ({ ...a, state: e.target.value }))
                      }
                    />
                  </Field>
                  <Field label="Country">
                    <input
                      className="input"
                      value={String(addressForm.country ?? "")}
                      onChange={(e) =>
                        setAddress((a) => ({ ...a, country: e.target.value }))
                      }
                    />
                  </Field>
                </div>
              </section>
              <section className="space-y-3">
                <h2 className="text-sm font-bold uppercase tracking-wide muted">
                  Business details
                </h2>
                {form.contactType === "person" && (
                  <Field label="Job position">
                    <input
                      className="input"
                      value={String(form.jobTitle ?? "")}
                      onChange={(e) => set("jobTitle", e.target.value)}
                    />
                  </Field>
                )}
                <Field label="Website">
                  <input
                    className="input"
                    placeholder="https://example.com"
                    value={String(form.website ?? "")}
                    onChange={(e) => set("website", e.target.value)}
                  />
                </Field>
                <Field label="Tags">
                  <TagSelector
                    companyId={companyId}
                    tags={sharedTags as SharedTag[]}
                    value={
                      Array.isArray(form.tags) ? form.tags.map(String) : []
                    }
                    canCreate={canManage}
                    onChange={(ids) => set("tags", ids)}
                  />
                </Field>
                <Field label="GST Treatment">
                  <select
                    className="input"
                    value={String(form.gstTreatment ?? "")}
                    onChange={(e) => set("gstTreatment", e.target.value)}
                  >
                    <option value="">Not set</option>
                    <option value="registered">Registered business</option>
                    <option value="unregistered">Unregistered business</option>
                    <option value="consumer">Consumer</option>
                    <option value="overseas">Overseas</option>
                    <option value="special-economic-zone">
                      Special economic zone
                    </option>
                    <option value="deemed-export">Deemed export</option>
                  </select>
                </Field>
                <Field label="GSTIN">
                  <input
                    className="input uppercase"
                    maxLength={15}
                    value={String(form.gstin ?? "")}
                    onChange={(e) => set("gstin", e.target.value.toUpperCase())}
                  />
                </Field>
              </section>
            </div>
          </section>
          <nav className="flex overflow-x-auto border-y border-[var(--border)] px-4">
            {tabs.map((item) => (
              <button
                className={`shrink-0 border-b-2 px-4 py-3 text-sm ${tab === item.id ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent muted"}`}
                onClick={() => setTab(item.id)}
                key={item.id}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <section className="min-h-44 p-5 sm:p-6">
            {tab === "contacts" && (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="font-bold">Related contacts</h2>
                  {!isNew && form.contactType === "company" && canManage && (
                    <Link
                      className="btn btn-secondary text-sm"
                      href={`/workspace/${companyId}/contacts/new?parentContactId=${contact.id}&type=person`}
                    >
                      <Plus size={15} />
                      Add related contact
                    </Link>
                  )}
                </div>
                {isNew ? (
                  <p className="mt-5 text-sm muted">
                    Save the company before adding related people or addresses.
                  </p>
                ) : (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {related.map((item) => (
                      <Link
                        className="rounded-lg border border-[var(--border)] p-3"
                        key={item.id}
                        href={`/workspace/${companyId}/contacts/${item.id}`}
                      >
                        <b>{String(item.displayName ?? item.title)}</b>
                        <p className="text-sm muted">
                          {String(item.jobTitle ?? item.email ?? "")}
                        </p>
                      </Link>
                    ))}
                    {!related.length && (
                      <p className="text-sm muted">No related contacts.</p>
                    )}
                  </div>
                )}
              </>
            )}
            {tab === "sales" && (
              <div className="grid gap-4 sm:grid-cols-3">
                <Summary
                  label="Salesperson"
                  value={
                    members.find((m) => m.id === form.ownerId)?.displayName ??
                    "Not assigned"
                  }
                />
                <Summary
                  label="Customer"
                  value={form.isCustomer ? "Yes" : "No"}
                />
                <Summary
                  label="Supplier"
                  value={form.isVendor ? "Yes" : "No"}
                />
                {canManage && (
                  <div className="flex gap-4 sm:col-span-3">
                    <label>
                      <input
                        type="checkbox"
                        checked={Boolean(form.isCustomer)}
                        onChange={(e) => set("isCustomer", e.target.checked)}
                      />{" "}
                      Customer
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={Boolean(form.isVendor)}
                        onChange={(e) => set("isVendor", e.target.checked)}
                      />{" "}
                      Supplier
                    </label>
                  </div>
                )}
              </div>
            )}
            {tab === "accounting" && (
              <p className="text-sm muted">
                Accounting details remain protected in the Accounting module. No
                sensitive values are duplicated here.
              </p>
            )}
            {tab === "notes" && (
              <textarea
                className="input min-h-32"
                placeholder="Persistent internal information about this contact"
                value={String(form.notes ?? "")}
                onChange={(e) => set("notes", e.target.value)}
              />
            )}
          </section>
        </main>
        <aside className="panel h-fit min-h-80 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Chatter</h2>
            {!isNew && enabledModules.includes("crm") && (
              <button
                className="btn btn-secondary !p-2"
                aria-label="Schedule activity"
                onClick={() => setDialog("activity")}
              >
                <CalendarDays size={16} />
              </button>
            )}
          </div>
          {isNew ? (
            <div className="mt-10 text-center">
              <StickyNote className="mx-auto muted" />
              <p className="mt-3 text-sm font-medium">
                Chatter starts after the first save
              </p>
              <p className="mt-1 text-xs muted">
                History is never fabricated for unsaved records.
              </p>
            </div>
          ) : (
            <>
              <form className="mt-4" onSubmit={addNote}>
                <textarea
                  className="input min-h-20"
                  placeholder="Log an internal note…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <button
                  className="btn btn-secondary mt-2 text-sm"
                  disabled={busy || !canManage}
                >
                  <StickyNote size={15} />
                  Log note
                </button>
              </form>
              <div className="mt-5 space-y-3">
                {[...activities, ...events]
                  .sort((a, b) =>
                    String(b.dueAt ?? b.timestamp).localeCompare(
                      String(a.dueAt ?? a.timestamp),
                    ),
                  )
                  .map((event) => (
                    <article
                      className="rounded-lg bg-[var(--soft)] p-3"
                      key={event.id}
                    >
                      <p className="text-xs muted">
                        {String(event.actorName ?? event.type ?? "Activity")}
                      </p>
                      <b className="mt-1 block text-sm capitalize">
                        {String(
                          event.title ?? event.eventType ?? "Update",
                        ).replaceAll("_", " ")}
                      </b>
                      {Boolean(event.body ?? event.description) && (
                        <p className="mt-1 whitespace-pre-wrap text-sm">
                          {String(event.body ?? event.description)}
                        </p>
                      )}
                    </article>
                  ))}
                {!activities.length && !events.length && (
                  <p className="text-sm muted">No contact activity yet.</p>
                )}
              </div>
            </>
          )}
        </aside>
      </div>
      {dialog === "activity" && (
        <Modal title="Schedule contact activity" close={() => setDialog("")}>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={schedule}>
            <Field label="Type">
              <select className="input" name="type">
                <option value="call">Call</option>
                <option value="email">Email reminder</option>
                <option value="meeting">Meeting</option>
                <option value="document">Document</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Assigned to">
              <select className="input" name="assigneeId">
                <option value="">Me</option>
                {members.map((member) => (
                  <option value={member.id} key={member.id}>
                    {String(member.displayName ?? member.email)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Summary">
              <input className="input" name="title" required />
            </Field>
            <Field label="Due">
              <input
                className="input"
                type="datetime-local"
                name="dueAt"
                required
              />
            </Field>
            <Field label="Meeting end (meetings only)">
              <input className="input" type="datetime-local" name="endAt" />
            </Field>
            <Field label="Notes">
              <textarea className="input" name="description" />
            </Field>
            <div className="sm:col-span-2">
              <button className="btn btn-primary" disabled={busy}>
                Schedule
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
function Summary({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide muted">{label}</p>
      <p className="mt-1">{String(value ?? "—")}</p>
    </div>
  );
}
