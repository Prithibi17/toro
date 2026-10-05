"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CirclePlus, LoaderCircle, Search, X } from "lucide-react";
type RecordItem = {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  amount: number;
  date: string;
  customerId?: string;
};
const config: Record<
  string,
  {
    title: string;
    description: string;
    singular: string;
    titleLabel: string;
    subtitleLabel: string;
    statuses: string[];
    amount: boolean;
    date: boolean;
  }
> = {
  discuss: {
    title: "Discuss",
    description: "Company channels and team conversations",
    singular: "channel",
    titleLabel: "Channel name",
    subtitleLabel: "Purpose",
    statuses: ["public", "private"],
    amount: false,
    date: false,
  },
  calendar: {
    title: "Calendar",
    description: "Meetings, deadlines and company events",
    singular: "event",
    titleLabel: "Event title",
    subtitleLabel: "Location or notes",
    statuses: ["confirmed", "tentative"],
    amount: false,
    date: true,
  },
  contacts: {
    title: "Contacts",
    description: "Customers, suppliers and business contacts",
    singular: "contact",
    titleLabel: "Contact name",
    subtitleLabel: "Email or company",
    statuses: ["customer", "supplier", "other"],
    amount: false,
    date: false,
  },
  sales: {
    title: "Sales",
    description: "Quotations and customer orders",
    singular: "sales order",
    titleLabel: "Order or quotation",
    subtitleLabel: "Customer",
    statuses: ["draft", "quotation", "confirmed"],
    amount: true,
    date: true,
  },
  pos: {
    title: "Point of Sale",
    description: "Retail orders and counter operations",
    singular: "POS order",
    titleLabel: "Order reference",
    subtitleLabel: "Customer or counter",
    statuses: ["open", "paid", "cancelled"],
    amount: true,
    date: true,
  },
  accounting: {
    title: "Accounting",
    description: "Invoices and financial documents",
    singular: "invoice",
    titleLabel: "Invoice reference",
    subtitleLabel: "Customer or vendor",
    statuses: ["draft", "posted", "paid"],
    amount: true,
    date: true,
  },
  purchase: {
    title: "Purchase",
    description: "Supplier requests and purchase orders",
    singular: "purchase order",
    titleLabel: "Order reference",
    subtitleLabel: "Supplier",
    statuses: ["draft", "sent", "confirmed"],
    amount: true,
    date: true,
  },
  inventory: {
    title: "Inventory",
    description: "Products and stock control",
    singular: "product",
    titleLabel: "Product name",
    subtitleLabel: "SKU or category",
    statuses: ["active", "archived"],
    amount: true,
    date: false,
  },
  manufacturing: {
    title: "Manufacturing",
    description: "Production orders and work planning",
    singular: "manufacturing order",
    titleLabel: "Production order",
    subtitleLabel: "Product",
    statuses: ["planned", "in-progress", "done"],
    amount: true,
    date: true,
  },
  "shop-floor": {
    title: "Shop Floor",
    description: "Operator work queue and production progress",
    singular: "operation",
    titleLabel: "Operation",
    subtitleLabel: "Work center",
    statuses: ["ready", "in-progress", "done"],
    amount: false,
    date: true,
  },
  barcode: {
    title: "Barcode",
    description: "Tracked receiving, picking and transfers",
    singular: "scan",
    titleLabel: "Barcode or reference",
    subtitleLabel: "Product or location",
    statuses: ["received", "picked", "transferred"],
    amount: false,
    date: true,
  },
};
export function OperationalModule({
  companyId,
  module,
}: {
  companyId: string;
  module: string;
}) {
  const searchParams = useSearchParams();
  const customerId = searchParams.get("customerId");
  const c = config[module];
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  async function load() {
    const r = await fetch(`/api/companies/${companyId}/records/${module}`);
    const j = await r.json();
    if (r.ok) setRecords(j.records);
    else setError(j.error);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const r = await fetch(`/api/companies/${companyId}/records/${module}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
    });
    const j = await r.json();
    if (r.ok) {
      setOpen(false);
      load();
    } else setError(j.error);
  }
  if (!c) return null;
  const visible = records.filter(
    (r) =>
      (!customerId || r.customerId === customerId) &&
      (r.title + r.subtitle).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-[var(--accent)]">
            Toro workspace
          </p>
          <h1 className="mt-1 text-3xl font-extrabold">{c.title}</h1>
          <p className="mt-2 muted">{c.description}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setOpen(true)}>
          <CirclePlus size={18} />
          New {c.singular}
        </button>
      </div>
      <div className="panel mb-5 flex items-center gap-2 p-3">
        <Search size={17} className="muted" />
        <input
          className="w-full bg-transparent outline-none"
          placeholder={`Search ${c.title.toLowerCase()}…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {error && <p className="mb-4 text-sm text-red-500">{error}</p>}
      {loading ? (
        <div className="grid min-h-64 place-items-center">
          <LoaderCircle className="animate-spin" />
        </div>
      ) : visible.length ? (
        <div className="panel overflow-hidden">
          <div className="grid grid-cols-[1.4fr_1fr_.7fr] border-b border-[var(--border)] px-5 py-3 text-xs font-bold uppercase tracking-wider muted">
            <span>{c.title}</span>
            <span>Status</span>
            <span className="text-right">{c.amount ? "Amount" : "Date"}</span>
          </div>
          {visible.map((r) => (
            <div
              key={r.id}
              role={module === "contacts" ? "link" : undefined}
              tabIndex={module === "contacts" ? 0 : undefined}
              onClick={() => {
                if (module === "contacts")
                  window.location.href = `/workspace/${companyId}/contacts/${r.id}`;
              }}
              onKeyDown={(event) => {
                if (module === "contacts" && event.key === "Enter")
                  window.location.href = `/workspace/${companyId}/contacts/${r.id}`;
              }}
              className={`grid grid-cols-[1.4fr_1fr_.7fr] items-center border-b border-[var(--border)] px-5 py-4 last:border-0 ${module === "contacts" ? "cursor-pointer hover:bg-[var(--soft)]" : ""}`}
            >
              <div>
                <b>{r.title}</b>
                <p className="mt-1 text-sm muted">{r.subtitle || "—"}</p>
              </div>
              <span>
                <i className="rounded-full bg-[var(--soft)] px-3 py-1 text-xs not-italic capitalize">
                  {r.status}
                </i>
              </span>
              <span className="text-right font-semibold">
                {c.amount
                  ? Number(r.amount || 0).toLocaleString()
                  : r.date || "—"}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="panel grid min-h-72 place-items-center text-center">
          <div>
            <CirclePlus className="mx-auto mb-3 muted" />
            <h2 className="font-bold">
              No {c.title.toLowerCase()} records yet
            </h2>
            <p className="mt-1 text-sm muted">
              Create the first {c.singular} to get started.
            </p>
          </div>
        </div>
      )}
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <form className="panel w-full max-w-lg p-6" onSubmit={create}>
            <div className="flex justify-between">
              <h2 className="text-xl font-extrabold">New {c.singular}</h2>
              <button type="button" onClick={() => setOpen(false)}>
                <X />
              </button>
            </div>
            <div className="mt-6 space-y-4">
              <label>
                <span className="label">{c.titleLabel}</span>
                <input className="input" name="title" required />
              </label>
              <label>
                <span className="label">{c.subtitleLabel}</span>
                <input className="input" name="subtitle" />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label>
                  <span className="label">Status</span>
                  <select className="input" name="status">
                    {c.statuses.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                {c.amount ? (
                  <label>
                    <span className="label">Amount</span>
                    <input
                      className="input"
                      name="amount"
                      type="number"
                      min="0"
                      defaultValue="0"
                    />
                  </label>
                ) : c.date ? (
                  <label>
                    <span className="label">Date</span>
                    <input className="input" name="date" type="date" />
                  </label>
                ) : null}
              </div>
              {c.amount && c.date && (
                <label>
                  <span className="label">Date</span>
                  <input className="input" name="date" type="date" />
                </label>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button className="btn btn-primary">Create</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
