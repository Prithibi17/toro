"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarClock,
  CirclePlus,
  GripVertical,
  LoaderCircle,
  Search,
  X,
} from "lucide-react";
type Item = Record<string, unknown> & { id: string };
type Screen = "pipeline" | "leads" | "activities" | "customers";
const screens: Array<[Screen, string]> = [
  ["pipeline", "My Pipeline"],
  ["leads", "Leads"],
  ["activities", "Activities"],
  ["customers", "Customers"],
];

export function CrmWorkspace({
  companyId,
  currency,
}: {
  companyId: string;
  currency: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerFilter = searchParams.get("customerId");
  const [screen, setScreen] = useState<Screen>("pipeline"),
    [records, setRecords] = useState<Item[]>([]),
    [stages, setStages] = useState<Item[]>([]),
    [contacts, setContacts] = useState<Item[]>([]),
    [canCreate, setCanCreate] = useState(false),
    [canMove, setCanMove] = useState(false),
    [loading, setLoading] = useState(true),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [createStage, setCreateStage] = useState<string | null>(null);
  const section = screen === "pipeline" ? "opportunities" : screen;
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const url =
      screen === "customers"
        ? `/api/companies/${companyId}/records/contacts`
        : `/api/companies/${companyId}/crm/${section}`;
    const r = await fetch(url),
      j = await r.json();
    if (r.ok) {
      setRecords(j.records ?? []);
      setCanCreate(Boolean(j.canCreate));
      if (screen === "pipeline") {
        setStages(j.stages ?? []);
        setContacts(j.contacts ?? []);
        setCanMove(Boolean(j.canMoveStage));
      }
    } else setError(j.error ?? "Could not load CRM");
    setLoading(false);
  }, [companyId, screen, section]);
  useEffect(() => {
    void load();
  }, [load]);
  const visible = useMemo(
    () =>
      records.filter(
        (r) =>
          (!customerFilter || r.customerId === customerFilter) &&
          (!query ||
            JSON.stringify(r).toLowerCase().includes(query.toLowerCase())),
      ),
    [customerFilter, records, query],
  );
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body: Record<string, unknown> = Object.fromEntries(
      new FormData(e.currentTarget),
    );
    if (!body.customerId) body.customerId = null;
    const r = await fetch(`/api/companies/${companyId}/crm/opportunities`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      j = await r.json();
    if (r.ok) {
      setRecords((current) => [j.record, ...current]);
      setCreateStage(null);
    } else setError(j.error ?? "Could not create opportunity");
  }
  async function move(id: string, stageId: string) {
    const before = records;
    setRecords((x) => x.map((r) => (r.id === id ? { ...r, stageId } : r)));
    const r = await fetch(
      `/api/companies/${companyId}/crm/opportunities/${id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stageId }),
      },
    );
    if (!r.ok) {
      setRecords(before);
      setError((await r.json()).error);
    }
  }
  const firstStage = String(
    stages.find((s) => s.stageType === "OPEN")?.id ?? stages[0]?.id ?? "",
  );
  return (
    <>
      <header className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold">
            CRM / {screens.find((x) => x[0] === screen)?.[1]}
          </h1>
          <nav className="flex gap-1 rounded-xl bg-[var(--soft)] p-1">
            {screens.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setScreen(key)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${screen === key ? "bg-[var(--panel)] shadow-sm" : "muted"}`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex gap-2">
          <div className="flex min-w-56 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3">
            <Search size={16} />
            <input
              className="w-full bg-transparent py-2.5 text-sm outline-none"
              placeholder="Search CRM"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {screen === "pipeline" && canCreate && firstStage && (
            <button
              className="btn btn-primary"
              onClick={() => setCreateStage(firstStage)}
            >
              <CirclePlus size={17} />
              New
            </button>
          )}
        </div>
      </header>
      {error && (
        <p className="mb-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-500">
          {error}
        </p>
      )}
      {loading ? (
        <div className="grid min-h-80 place-items-center">
          <LoaderCircle className="animate-spin" />
        </div>
      ) : screen === "pipeline" ? (
        <Board
          records={visible}
          stages={stages}
          contacts={contacts}
          currency={currency}
          canCreate={canCreate}
          canMove={canMove}
          add={setCreateStage}
          move={move}
          open={(record) =>
            router.push(
              `/workspace/${companyId}/crm/opportunities/${record.id}`,
            )
          }
        />
      ) : (
        <Table screen={screen} records={visible} currency={currency} />
      )}
      {createStage && (
        <Modal title="New opportunity" close={() => setCreateStage(null)}>
          <form className="space-y-4" onSubmit={create}>
            <Field label="Opportunity">
              <input className="input" name="name" required minLength={2} />
            </Field>
            <Field label="Customer">
              <select className="input" name="customerId" defaultValue="">
                <option value="">No customer selected</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {String(c.title ?? c.name ?? "Contact")}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Expected revenue">
              <input
                className="input"
                name="value"
                type="number"
                min="0"
                defaultValue="0"
                required
              />
            </Field>
            <input type="hidden" name="stageId" value={createStage} />
            <input type="hidden" name="currency" value={currency} />
            <button className="btn btn-primary w-full">Add opportunity</button>
          </form>
        </Modal>
      )}
    </>
  );
}

function Board({
  records,
  stages,
  contacts,
  currency,
  canCreate,
  canMove,
  add,
  move,
  open,
}: {
  records: Item[];
  stages: Item[];
  contacts: Item[];
  currency: string;
  canCreate: boolean;
  canMove: boolean;
  add: (id: string) => void;
  move: (id: string, stage: string) => void;
  open: (r: Item) => void;
}) {
  const money = (n: number) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  const active = stages.filter((s) => s.stageType !== "WON");
  return (
    <div className="flex min-h-[68vh] gap-4 overflow-x-auto pb-4">
      {active.map((stage) => {
        const deals = records.filter(
            (r) => r.stageId === stage.id && r.status !== "lost",
          ),
          total = deals.reduce((n, r) => n + Number(r.value || 0), 0);
        return (
          <section
            key={stage.id}
            className="w-80 shrink-0 rounded-2xl bg-[var(--soft)] p-3"
            onDragOver={(e) => canMove && e.preventDefault()}
            onDrop={(e) => {
              if (canMove) {
                const id = e.dataTransfer.getData("text/plain");
                if (id) void move(id, stage.id);
              }
            }}
          >
            <header className="mb-3 px-1">
              <div className="flex justify-between">
                <b>{String(stage.name)}</b>
                <span className="rounded-full bg-[var(--panel)] px-2 text-xs">
                  {deals.length}
                </span>
              </div>
              <p className="mt-1 text-sm font-semibold text-[var(--accent)]">
                {money(total)}
              </p>
            </header>
            <div className="space-y-3">
              {deals.map((deal) => {
                const customer = contacts.find(
                  (c) => c.id === (deal.customerId ?? deal.organizationId),
                );
                return (
                  <article
                    key={deal.id}
                    draggable={canMove}
                    onDragStart={(e) =>
                      e.dataTransfer.setData("text/plain", deal.id)
                    }
                    onClick={() => open(deal)}
                    className="panel cursor-pointer p-4"
                  >
                    <div className="flex gap-2">
                      {canMove && (
                        <GripVertical size={16} className="mt-1 muted" />
                      )}
                      <div className="min-w-0 flex-1">
                        <b>{String(deal.name)}</b>
                        <p className="mt-1 truncate text-sm muted">
                          {String(
                            customer?.title ?? customer?.name ?? "No customer",
                          )}
                        </p>
                        <p className="mt-3 font-semibold">
                          {money(Number(deal.value || 0))}
                        </p>
                        <div className="mt-3 flex justify-between text-xs muted">
                          <span>
                            {deal.priority === "high" ||
                            deal.priority === "urgent"
                              ? "High priority"
                              : "Normal"}
                          </span>
                          {deal.nextActivityTitle ? (
                            <span className="flex gap-1">
                              <CalendarClock size={13} />
                              {String(deal.nextActivityTitle)}
                            </span>
                          ) : (
                            <span>No next activity</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
              {canCreate && (
                <button
                  className="w-full rounded-xl border border-dashed border-[var(--border)] p-3 text-sm font-semibold muted"
                  onClick={() => add(stage.id)}
                >
                  + Add
                </button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Table({
  screen,
  records,
  currency,
}: {
  screen: Exclude<Screen, "pipeline">;
  records: Item[];
  currency: string;
}) {
  if (!records.length)
    return (
      <div className="panel grid min-h-72 place-items-center text-center">
        <div>
          <h2 className="font-bold">No {screen} yet</h2>
          <p className="mt-1 text-sm muted">
            Records appear here as sales work progresses.
          </p>
        </div>
      </div>
    );
  return (
    <div className="panel overflow-hidden">
      {records.map((r) => (
        <article
          key={r.id}
          className="grid grid-cols-[1.5fr_1fr_.7fr] border-b border-[var(--border)] px-5 py-4 last:border-0"
        >
          <div>
            <b>{String(r.name ?? r.title ?? "Untitled")}</b>
            <p className="text-sm muted">
              {String(r.email ?? r.subtitle ?? r.type ?? "")}
            </p>
          </div>
          <span className="capitalize">{String(r.status ?? "active")}</span>
          <span className="text-right">
            {r.value !== undefined
              ? new Intl.NumberFormat(undefined, {
                  style: "currency",
                  currency,
                  maximumFractionDigits: 0,
                }).format(Number(r.value))
              : ""}
          </span>
        </article>
      ))}
    </div>
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
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <section className="panel w-full max-w-lg p-6">
        <header className="mb-6 flex justify-between">
          <h2 className="text-xl font-extrabold">{title}</h2>
          <button onClick={close} aria-label="Close">
            <X />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
