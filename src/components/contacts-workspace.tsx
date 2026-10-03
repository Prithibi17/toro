"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  CirclePlus,
  LoaderCircle,
  Search,
  UserRound,
  X,
} from "lucide-react";
type Item = Record<string, unknown> & { id: string };
export function ContactsWorkspace({ companyId }: { companyId: string }) {
  const router = useRouter(),
    [records, setRecords] = useState<Item[]>([]),
    [loading, setLoading] = useState(true),
    [canCreate, setCanCreate] = useState(false),
    [query, setQuery] = useState(""),
    [open, setOpen] = useState(false),
    [kind, setKind] = useState<"person" | "company">("company"),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`/api/companies/${companyId}/contacts`),
      j = await r.json();
    if (r.ok) {
      setRecords(j.records ?? []);
      setCanCreate(j.canCreate);
    } else setError(j.error);
    setLoading(false);
  }, [companyId]);
  useEffect(() => {
    void load();
  }, [load]);
  const visible = useMemo(
    () =>
      records.filter((r) =>
        JSON.stringify(r).toLowerCase().includes(query.toLowerCase()),
      ),
    [records, query],
  );
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget),
      body: Record<string, unknown> = Object.fromEntries(form);
    body.contactType = kind;
    if (!body.parentContactId) body.parentContactId = null;
    body.isCustomer = form.get("isCustomer") === "on";
    body.isVendor = form.get("isVendor") === "on";
    body.tags = [];
    body.address = {
      type: "main",
      city: form.get("city") ?? "",
      state: form.get("state") ?? "",
      country: form.get("country") ?? "",
      street: form.get("street") ?? "",
    };
    const r = await fetch(`/api/companies/${companyId}/contacts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      j = await r.json();
    if (r.ok) router.push(`/workspace/${companyId}/contacts/${j.id}`);
    else
      setError(
        j.error +
          (j.duplicates?.length
            ? ` Existing: ${j.duplicates.map((d: Item) => d.title).join(", ")}`
            : ""),
      );
  }
  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--accent)]">
            Master identity
          </p>
          <h1 className="mt-1 text-3xl font-extrabold">Contacts</h1>
          <p className="mt-2 muted">
            People, companies and their business relationships.
          </p>
        </div>
        {canCreate && (
          <button className="btn btn-primary" onClick={() => setOpen(true)}>
            <CirclePlus size={17} />
            New Contact
          </button>
        )}
      </header>
      <div className="panel mb-5 flex items-center gap-2 p-3">
        <Search size={17} />
        <input
          className="w-full bg-transparent outline-none"
          placeholder="Search name, email, phone, company or tax ID"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {error && (
        <p className="mb-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-500">
          {error}
        </p>
      )}
      {loading ? (
        <div className="grid min-h-72 place-items-center">
          <LoaderCircle className="animate-spin" />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((r) => (
            <button
              key={r.id}
              className="panel p-5 text-left transition hover:border-[var(--accent)]"
              onClick={() =>
                router.push(`/workspace/${companyId}/contacts/${r.id}`)
              }
            >
              <div className="flex gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--soft)]">
                  {r.contactType === "person" ? (
                    <UserRound size={19} />
                  ) : (
                    <Building2 size={19} />
                  )}
                </span>
                <div className="min-w-0">
                  <h2 className="truncate font-bold">
                    {String(r.displayName ?? r.title)}
                  </h2>
                  <p className="mt-1 truncate text-sm muted">
                    {String(r.jobTitle ?? r.industry ?? r.email ?? "")}
                  </p>
                  <p className="mt-3 text-xs muted">
                    {String(r.phone ?? r.mobile ?? "")}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4">
          <form onSubmit={create} className="panel my-6 w-full max-w-2xl p-6">
            <div className="flex justify-between">
              <div>
                <h2 className="text-xl font-extrabold">New Contact</h2>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className={`btn ${kind === "company" ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setKind("company")}
                  >
                    Company
                  </button>
                  <button
                    type="button"
                    className={`btn ${kind === "person" ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setKind("person")}
                  >
                    Person
                  </button>
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)}>
                <X />
              </button>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Field label={kind === "company" ? "Company name" : "Full name"}>
                <input className="input" name="displayName" required />
              </Field>
              {kind === "person" && (
                <Field label="Parent company">
                  <select
                    className="input"
                    name="parentContactId"
                    defaultValue=""
                  >
                    <option value="">No company</option>
                    {records
                      .filter((r) => r.contactType === "company")
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {String(r.displayName ?? r.title)}
                        </option>
                      ))}
                  </select>
                </Field>
              )}
              <Field label="Email">
                <input className="input" type="email" name="email" />
              </Field>
              <Field label="Phone">
                <input className="input" name="phone" />
              </Field>
              {kind === "person" ? (
                <Field label="Job position">
                  <input className="input" name="jobTitle" />
                </Field>
              ) : (
                <>
                  <Field label="Website">
                    <input className="input" name="website" />
                  </Field>
                  <Field label="Industry">
                    <input className="input" name="industry" />
                  </Field>
                  <Field label="Tax ID">
                    <input className="input" name="taxId" />
                  </Field>
                </>
              )}
              <Field label="Street">
                <input className="input" name="street" />
              </Field>
              <Field label="City">
                <input className="input" name="city" />
              </Field>
              <Field label="State">
                <input className="input" name="state" />
              </Field>
              <Field label="Country">
                <input className="input" name="country" />
              </Field>
            </div>
            <div className="mt-4 flex gap-5 text-sm">
              <label>
                <input type="checkbox" name="isCustomer" /> Customer
              </label>
              <label>
                <input type="checkbox" name="isVendor" /> Vendor
              </label>
            </div>
            <button className="btn btn-primary mt-6 w-full">
              Save Contact
            </button>
          </form>
        </div>
      )}
    </>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
