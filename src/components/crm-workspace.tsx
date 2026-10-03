"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  CirclePlus,
  Filter,
  LoaderCircle,
  Search,
  Settings2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import type { CrmSection } from "@/lib/types";
type Item = Record<string, unknown> & { id: string };
type Pipeline = Item & { stages: Item[] };
const labels: Record<CrmSection, string> = {
  overview: "Overview",
  leads: "Leads",
  contacts: "Contacts",
  organizations: "Companies",
  opportunities: "Opportunities",
  activities: "Activities",
  pipelines: "Pipelines",
};
const all = Object.keys(labels) as CrmSection[];
export function CrmWorkspace({
  companyId,
  currency,
}: {
  companyId: string;
  currency: string;
}) {
  const [section, setSection] = useState<CrmSection>("overview"),
    [enabled, setEnabled] = useState<CrmSection[]>(all),
    [records, setRecords] = useState<Item[]>([]),
    [metrics, setMetrics] = useState<Record<string, number>>({}),
    [canCreate, setCanCreate] = useState(false),
    [canEdit, setCanEdit] = useState(false),
    [canMoveStage, setCanMoveStage] = useState(false),
    [pipelines, setPipelines] = useState<Pipeline[]>([]),
    [loading, setLoading] = useState(true),
    [open, setOpen] = useState(false),
    [settings, setSettings] = useState(false),
    [historyRecord, setHistoryRecord] = useState<Item | null>(null),
    [history, setHistory] = useState<Item[]>([]),
    [query, setQuery] = useState(""),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const r = await fetch(`/api/companies/${companyId}/crm/${section}`);
    const j = await r.json();
    if (r.ok) {
      if (j.enabledSections) setEnabled(j.enabledSections);
      setRecords(j.records ?? []);
      setMetrics(j.metrics ?? {});
      setCanCreate(Boolean(j.canCreate));
      setCanEdit(Boolean(j.canEdit));
      setCanMoveStage(Boolean(j.canMoveStage));
    } else setError(j.error ?? "Could not load CRM");
    setLoading(false);
  }, [companyId, section]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!enabled.includes("pipelines")) return;
    void fetch(`/api/companies/${companyId}/crm/pipelines`)
      .then((r) => (r.ok ? r.json() : { records: [] }))
      .then((j) => setPipelines(j.records ?? []));
  }, [companyId, enabled]);
  const visible = useMemo(
    () =>
      records.filter((r) =>
        JSON.stringify(r).toLowerCase().includes(query.toLowerCase()),
      ),
    [records, query],
  );
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      body: Record<string, unknown> = Object.fromEntries(f);
    if (body.dueAt === "") body.dueAt = null;
    else if (typeof body.dueAt === "string")
      body.dueAt = new Date(body.dueAt).toISOString();
    if (section === "pipelines")
      body.stages = [
        { name: "New", stageType: "OPEN", probability: 10 },
        { name: "Won", stageType: "WON", probability: 100 },
        { name: "Lost", stageType: "LOST", probability: 0 },
      ];
    const r = await fetch(`/api/companies/${companyId}/crm/${section}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (r.ok) {
      setOpen(false);
      await load();
    } else setError(j.error ?? "Could not create record");
  }
  async function saveSections() {
    const r = await fetch(`/api/companies/${companyId}/crm/settings`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabledSections: enabled }),
    });
    if (r.ok) {
      setSettings(false);
      await load();
    } else setError((await r.json()).error);
  }
  async function convertLead(record: Item) {
    const pipeline = pipelines[0],
      stage = pipeline?.stages?.find((s) => s.stageType === "OPEN");
    if (!pipeline || !stage) {
      setError(
        "Create an active pipeline with an open stage before converting a lead.",
      );
      return;
    }
    const r = await fetch(
      `/api/companies/${companyId}/crm/leads/${record.id}/convert`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          createContact: true,
          createOrganization: Boolean(record.organizationName),
          createOpportunity: true,
          opportunityTitle: String(record.name ?? "New opportunity"),
          pipelineId: pipeline.id,
          stageId: stage.id,
        }),
      },
    );
    const j = await r.json();
    if (r.ok) await load();
    else setError(j.error ?? "Could not convert lead");
  }
  async function moveOpportunity(recordId: string, stageId: string) {
    const r = await fetch(
      `/api/companies/${companyId}/crm/opportunities/${recordId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stageId }),
      },
    );
    if (r.ok) await load();
    else setError((await r.json()).error ?? "Could not move opportunity");
  }
  async function openHistory(record: Item) {
    setHistoryRecord(record);
    setHistory([]);
    const r = await fetch(
      `/api/companies/${companyId}/crm/${section}/${record.id}/timeline`,
    );
    const j = await r.json();
    if (r.ok) setHistory(j.events ?? []);
    else setError(j.error ?? "Could not load record history");
  }
  return (
    <>
      <header className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-semibold text-[var(--accent)]">
            Customer relationships
          </p>
          <h1 className="mt-1 text-3xl font-extrabold">CRM</h1>
          <p className="mt-2 muted">
            Manage relationships, opportunities and follow-up in one workspace.
          </p>
        </div>
        <div className="flex gap-2">
          {section === "pipelines" && (
            <button
              className="btn btn-secondary"
              onClick={() => setSettings(true)}
            >
              <Settings2 size={17} />
              CRM settings
            </button>
          )}
          {canCreate && section !== "overview" && (
            <button className="btn btn-primary" onClick={() => setOpen(true)}>
              <CirclePlus size={17} />
              New {labels[section].replace(/s$/, "")}
            </button>
          )}
        </div>
      </header>
      <nav className="mb-6 flex gap-1 overflow-x-auto rounded-2xl bg-[var(--soft)] p-1">
        {all
          .filter((s) => enabled.includes(s))
          .map((s) => (
            <button
              key={s}
              onClick={() => setSection(s)}
              className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold ${section === s ? "bg-[var(--panel)] shadow-sm" : "muted"}`}
            >
              {labels[s]}
            </button>
          ))}
      </nav>
      {error && (
        <p className="mb-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-500">
          {error}
        </p>
      )}
      {loading ? (
        <div className="grid min-h-80 place-items-center">
          <LoaderCircle className="animate-spin" />
        </div>
      ) : section === "overview" ? (
        <Overview metrics={metrics} currency={currency} />
      ) : (
        <>
          <div className="panel mb-5 flex items-center gap-2 p-3">
            <Search size={17} className="muted" />
            <input
              className="w-full bg-transparent outline-none"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${labels[section].toLowerCase()}…`}
            />
            <Filter size={17} className="muted" />
          </div>
          <RecordList
            section={section}
            records={visible}
            currency={currency}
            pipelines={pipelines}
            canEdit={canEdit}
            canMoveStage={canMoveStage}
            convertLead={convertLead}
            moveOpportunity={moveOpportunity}
            openHistory={openHistory}
          />
        </>
      )}
      {open && (
        <Modal
          title={`New ${labels[section].replace(/s$/, "")}`}
          close={() => setOpen(false)}
        >
          <EntityForm
            section={section}
            currency={currency}
            pipelines={pipelines}
            submit={create}
          />
        </Modal>
      )}
      {settings && (
        <Modal title="CRM sections" close={() => setSettings(false)}>
          <div className="space-y-2">
            {all
              .filter((s) => s !== "overview")
              .map((s) => (
                <label
                  key={s}
                  className="flex items-center gap-3 rounded-xl bg-[var(--soft)] p-3"
                >
                  <input
                    type="checkbox"
                    checked={enabled.includes(s)}
                    onChange={(e) =>
                      setEnabled((x) =>
                        e.target.checked ? [...x, s] : x.filter((v) => v !== s),
                      )
                    }
                  />
                  {labels[s]}
                </label>
              ))}
          </div>
          <button
            className="btn btn-primary mt-5 w-full"
            onClick={saveSections}
          >
            Save CRM sections
          </button>
        </Modal>
      )}
      {historyRecord && (
        <Modal title="Record history" close={() => setHistoryRecord(null)}>
          <div className="space-y-3">
            {history.map((event) => (
              <article
                key={event.id}
                className="rounded-xl bg-[var(--soft)] p-3"
              >
                <p className="font-semibold">
                  {String(event.eventType ?? "updated").replaceAll("_", " ")}
                </p>
                <p className="mt-1 text-xs muted">
                  {event.timestamp
                    ? new Date(String(event.timestamp)).toLocaleString()
                    : "Pending timestamp"}
                </p>
              </article>
            ))}
            {!history.length && (
              <p className="text-sm muted">No history recorded yet.</p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
function Overview({
  metrics,
  currency,
}: {
  metrics: Record<string, number>;
  currency: string;
}) {
  const money = (n = 0) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  const cards = [
    ["Open opportunities", metrics.openOpportunities],
    ["Pipeline value", money(metrics.pipelineValue)],
    ["Won value", money(metrics.wonValue)],
    ["Lost opportunities", metrics.lostOpportunities],
    ["New leads", metrics.newLeads],
    ["Qualified leads", metrics.qualifiedLeads],
    ["Activities due today", metrics.dueToday],
    ["Overdue activities", metrics.overdue],
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(([a, b]) => (
        <div className="panel p-5" key={String(a)}>
          <p className="text-sm muted">{a}</p>
          <p className="mt-2 text-2xl font-extrabold">{b ?? 0}</p>
        </div>
      ))}
    </div>
  );
}
function RecordList({
  section,
  records,
  currency,
  pipelines,
  canEdit,
  canMoveStage,
  convertLead,
  moveOpportunity,
  openHistory,
}: {
  section: CrmSection;
  records: Item[];
  currency: string;
  pipelines: Pipeline[];
  canEdit: boolean;
  canMoveStage: boolean;
  convertLead: (record: Item) => void;
  moveOpportunity: (recordId: string, stageId: string) => void;
  openHistory: (record: Item) => void;
}) {
  if (!records.length)
    return (
      <div className="panel grid min-h-64 place-items-center text-center">
        <div>
          <UsersRound className="mx-auto mb-3 muted" />
          <h2 className="font-bold">No {labels[section].toLowerCase()} yet</h2>
          <p className="mt-1 text-sm muted">
            Create the first record when you are ready.
          </p>
        </div>
      </div>
    );
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {records.map((r) => (
        <article className="panel p-5" key={r.id}>
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--soft)]">
              {section === "organizations" ? (
                <Building2 size={18} />
              ) : (
                <UserRound size={18} />
              )}
            </span>
            <div className="min-w-0">
              <h3 className="font-bold">
                {String(
                  r.name ??
                    [r.firstName, r.lastName].filter(Boolean).join(" ") ??
                    r.title ??
                    "Untitled",
                )}
              </h3>
              <p className="mt-1 text-sm muted">
                {String(r.email ?? r.industry ?? r.type ?? r.status ?? "")}
              </p>
              {r.value !== undefined && (
                <p className="mt-3 font-semibold text-[var(--accent)]">
                  {new Intl.NumberFormat(undefined, {
                    style: "currency",
                    currency,
                    maximumFractionDigits: 0,
                  }).format(Number(r.value))}
                </p>
              )}
              {section === "leads" &&
                canEdit &&
                String(r.status).toLowerCase() !== "converted" && (
                  <button
                    className="btn btn-secondary mt-4"
                    onClick={() => convertLead(r)}
                  >
                    Convert to opportunity
                  </button>
                )}
              {section === "opportunities" && canMoveStage && (
                <select
                  aria-label="Opportunity stage"
                  className="input mt-4 !py-2 text-sm"
                  value={String(r.stageId ?? "")}
                  onChange={(e) => moveOpportunity(r.id, e.target.value)}
                >
                  {pipelines
                    .find((p) => p.id === r.pipelineId)
                    ?.stages.map((stage) => (
                      <option key={stage.id} value={stage.id}>
                        {String(stage.name)}
                      </option>
                    ))}
                </select>
              )}
              {section !== "pipelines" && (
                <button
                  className="mt-4 text-sm font-semibold text-[var(--accent)]"
                  onClick={() => openHistory(r)}
                >
                  View history
                </button>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
function EntityForm({
  section,
  currency,
  pipelines,
  submit,
}: {
  section: CrmSection;
  currency: string;
  pipelines: Pipeline[];
  submit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={submit} className="space-y-4">
      <label>
        <span className="label">
          {section === "contacts"
            ? "First name"
            : section === "activities"
              ? "Title"
              : "Name"}
        </span>
        <input
          className="input"
          name={
            section === "contacts"
              ? "firstName"
              : section === "activities"
                ? "title"
                : "name"
          }
          required
        />
      </label>
      {section === "contacts" && (
        <label>
          <span className="label">Last name</span>
          <input className="input" name="lastName" />
        </label>
      )}
      {["leads", "contacts", "organizations"].includes(section) && (
        <>
          <label>
            <span className="label">Email</span>
            <input className="input" type="email" name="email" />
          </label>
          <label>
            <span className="label">Phone</span>
            <input className="input" name="phone" />
          </label>
        </>
      )}
      {section === "leads" && (
        <>
          <label>
            <span className="label">Status</span>
            <select className="input" name="status">
              <option>New</option>
              <option>Contacted</option>
              <option>Qualified</option>
              <option>Unqualified</option>
            </select>
          </label>
          <label>
            <span className="label">Estimated value</span>
            <input
              className="input"
              type="number"
              name="estimatedValue"
              min="0"
              defaultValue="0"
            />
          </label>
        </>
      )}
      {section === "organizations" && (
        <>
          <label>
            <span className="label">Industry</span>
            <input className="input" name="industry" />
          </label>
          <label>
            <span className="label">Website</span>
            <input className="input" type="url" name="website" />
          </label>
        </>
      )}
      {section === "opportunities" && (
        <>
          <label>
            <span className="label">Value ({currency})</span>
            <input
              className="input"
              type="number"
              name="value"
              min="0"
              required
            />
          </label>
          <input type="hidden" name="currency" value={currency} />
          <label>
            <span className="label">Pipeline</span>
            <select className="input" name="pipelineId" required>
              <option value="">Select pipeline</option>
              {pipelines.map((pipeline) => (
                <option key={pipeline.id} value={pipeline.id}>
                  {String(pipeline.name)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Initial stage</span>
            <select className="input" name="stageId" required>
              <option value="">Select stage</option>
              {pipelines.flatMap((pipeline) =>
                pipeline.stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {String(pipeline.name)} — {String(stage.name)}
                  </option>
                )),
              )}
            </select>
          </label>
        </>
      )}
      {section === "activities" && (
        <>
          <label>
            <span className="label">Type</span>
            <select className="input" name="type">
              <option value="call">Call</option>
              <option value="meeting">Meeting</option>
              <option value="email">Email</option>
              <option value="follow-up">Follow-up</option>
              <option value="task">Task</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            <span className="label">Related type</span>
            <select className="input" name="relatedType">
              <option value="lead">Lead</option>
              <option value="contact">Contact</option>
              <option value="organization">Company</option>
              <option value="opportunity">Opportunity</option>
            </select>
          </label>
          <label>
            <span className="label">Related record ID</span>
            <input className="input" name="relatedId" required />
          </label>
          <label>
            <span className="label">Due</span>
            <input className="input" type="datetime-local" name="dueAt" />
          </label>
        </>
      )}
      {section === "pipelines" && (
        <p className="text-sm muted">
          A new pipeline starts with Open, Won and Lost stages. Stage types
          determine outcome, not stage names.
        </p>
      )}
      <button className="btn btn-primary w-full">Create</button>
    </form>
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
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4">
      <section className="panel my-6 w-full max-w-lg p-6">
        <header className="mb-6 flex justify-between">
          <h2 className="text-xl font-extrabold">{title}</h2>
          <button onClick={close}>
            <X />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
