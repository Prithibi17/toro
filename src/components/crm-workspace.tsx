"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  RefreshCw,
  Download,
  Upload,
  CalendarClock,
  SlidersHorizontal,
  MoreHorizontal,
  Columns3,
  List,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  Priority,
  Field,
  Modal,
  crmRequest,
  title,
  type Item,
} from "./crm-controls";
import { getActivityState, sortCrmRecords } from "@/lib/crm-query";
import { CrmTransfer } from "./crm-transfer";
import { CrmEntitySearch } from "./crm-entity-search";
import {
  autofillOpportunityFromContact,
  blankOpportunityDraft,
} from "@/lib/crm-opportunity-autofill";
type Payload = {
  records: Item[];
  stages: Item[];
  contacts: Item[];
  members: Item[];
  teams: Item[];
  tags: Item[];
  lostReasons: Item[];
  favorites: Item[];
  userId: string;
  timezone: string;
  canCreate: boolean;
  canEdit: boolean;
  canMoveStage: boolean;
  canConfigure: boolean;
  canExport: boolean;
  canImport: boolean;
  canAssign: boolean;
  truncated: boolean;
  nextCursor: string | null;
};
const empty: Payload = {
  records: [],
  stages: [],
  contacts: [],
  members: [],
  teams: [],
  tags: [],
  lostReasons: [],
  favorites: [],
  userId: "",
  timezone: "UTC",
  canCreate: false,
  canEdit: false,
  canMoveStage: false,
  canConfigure: false,
  canExport: false,
  canImport: false,
  canAssign: false,
  truncated: false,
  nextCursor: null,
};
export function CrmWorkspace({
  companyId,
  currency,
}: {
  companyId: string;
  currency: string;
}) {
  const router = useRouter(),
    params = useSearchParams(),
    screen = params.get("screen") ?? "pipeline",
    view = params.get("view") ?? "kanban";
  const [data, setData] = useState<Payload>(empty),
    [rows, setRows] = useState<Item[]>([]),
    [busy, setBusy] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [stage, setStage] = useState<string | null>(null),
    [transfer, setTransfer] = useState<"import" | "export" | null>(null),
    [selection, setSelection] = useState<string[]>([]),
    [search, setSearch] = useState(params.get("q") ?? ""),
    [config, setConfig] = useState<Item | null>(null),
    [kind, setKind] = useState("stages"),
    [priority, setPriority] = useState(0),
    [opportunityDraft, setOpportunityDraft] = useState(() =>
      blankOpportunityDraft(),
    );
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const base = `/api/companies/${companyId}/crm`;
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadGeneration = useRef(0);
  const query = Object.fromEntries(
    [...params].filter(([key]) => !["screen", "view", "scope"].includes(key)),
  );
  if (
    !params.has("scope") &&
    !params.has("ownerId") &&
    !params.has("unassigned")
  )
    query.mine = "true";
  const queryString = new URLSearchParams(query).toString();
  const filterEntries = Object.entries(query).filter(
    ([key, value]) =>
      Boolean(value) &&
      !["sort", "groupBy", "direction", "mine", "q"].includes(key),
  );
  const labels: Record<string, string> = {
    stageId: "Stage",
    ownerId: "Salesperson",
    salesTeamId: "Sales team",
    lostReasonId: "Lost reason",
    createdAt: "Created date",
    updatedAt: "Last updated",
    expectedCloseDate: "Expected close",
    closedAt: "Closed date",
    dateFrom: "From",
    dateTo: "To",
    rottingDays: "No progress (days)",
    status: "Outcome",
    priority: "Priority",
    activity: "Activity",
    unassigned: "Unassigned",
    archived: "Archived",
  };
  const change = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      Object.entries(updates).forEach(([key, value]) =>
        value ? next.set(key, value) : next.delete(key),
      );
      router.replace(`/workspace/${companyId}/crm?${next}`, { scroll: false });
    },
    [params, router, companyId],
  );
  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setBusy(true);
    setError("");
    try {
      const payload = await crmRequest(`${base}/opportunities?${queryString}`);
      const extra = ["leads", "activities"].includes(screen)
        ? ((await crmRequest(`${base}/${screen}`)).records ?? [])
        : [];
      if (generation !== loadGeneration.current) return;
      setData(payload);
      setSelection([]);
      setRows(extra);
    } catch (e) {
      if (generation === loadGeneration.current)
        setError(e instanceof Error ? e.message : "Could not load CRM");
    } finally {
      if (generation === loadGeneration.current) setBusy(false);
    }
  }, [base, queryString, screen]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    setSearch(params.get("q") ?? "");
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [params]);
  const act = async (work: () => Promise<void>) => {
    setSaving(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed");
    } finally {
      setSaving(false);
    }
  };
  async function loadMore() {
    if (!data.nextCursor) return;
    const generation = loadGeneration.current;
    await act(async () => {
      const payload: Payload = await crmRequest(
        `${base}/opportunities?${queryString}&after=${encodeURIComponent(data.nextCursor!)}`,
      );
      if (generation !== loadGeneration.current) return;
      setData((current) => ({
        ...payload,
        records: sortCrmRecords(
          [
            ...new Map(
              [...current.records, ...payload.records].map((record) => [
                record.id,
                record,
              ]),
            ).values(),
          ],
          query,
        ),
      }));
    });
  }
  async function patch(record: Item, updates: Record<string, unknown>) {
    const before = record;
    setData((d) => ({
      ...d,
      records: d.records.map((r) =>
        r.id === record.id ? { ...r, ...updates } : r,
      ),
    }));
    try {
      const result = await crmRequest(
        `${base}/opportunities/${record.id}`,
        "PATCH",
        { ...updates, expectedVersion: Number(record.version ?? 0) },
      );
      setData((d) => ({
        ...d,
        records: d.records.map((r) => (r.id === record.id ? result.record : r)),
      }));
    } catch (e) {
      setData((d) => ({
        ...d,
        records: d.records.map((r) => (r.id === record.id ? before : r)),
      }));
      throw e;
    }
  }
  async function move(record: Item, to: Item) {
    if (to.stageType === "LOST") {
      router.push(
        `/workspace/${companyId}/crm/opportunities/${record.id}?action=lost`,
      );
      return;
    }
    await act(() => patch(record, { stageId: to.id }));
  }
  function open(record: Item) {
    sessionStorage.setItem(
      `toro:crm:${companyId}:navigation`,
      JSON.stringify({
        ids: data.records.map((r) => r.id),
        returnUrl: `/workspace/${companyId}/crm?${params}`,
      }),
    );
    router.push(`/workspace/${companyId}/crm/opportunities/${record.id}`);
  }
  const money = (value: unknown) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(Number(value ?? 0));
  const group = params.get("groupBy") ?? "stageId";
  const grouped =
    group === "stageId"
      ? data.stages.map((s) => ({
          key: s.id,
          label: title(s),
          stage: s,
          records: data.records.filter((r) => r.stageId === s.id),
        }))
      : Array.from(
          new Set(data.records.map((r) => String(r[group] ?? "Unassigned"))),
        ).map((key) => ({
          key,
          label:
            group === "ownerId"
              ? title(data.members.find((m) => m.id === key) ?? { id: key })
              : group === "salesTeamId"
                ? title(data.teams.find((m) => m.id === key) ?? { id: key })
                : key,
          stage: null,
          records: data.records.filter(
            (r) => String(r[group] ?? "Unassigned") === key,
          ),
        }));
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      body = Object.fromEntries(new FormData(form));
    const more =
      (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ===
      "edit";
    await act(async () => {
      const result = await crmRequest(`${base}/opportunities`, "POST", {
        ...body,
        customerId: body.customerId || null,
        ownerId: body.ownerId || null,
        stageId: stage,
        value: Number(body.value),
        priority,
        currency,
        email: opportunityDraft.email,
        phone: opportunityDraft.phone,
        city: opportunityDraft.city,
        country: opportunityDraft.country,
        tags: opportunityDraft.tags,
      });
      setStage(null);
      setOpportunityDraft(blankOpportunityDraft(data.userId));
      if (more) open(result.record);
      else await load();
    });
  }
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center gap-x-7 gap-y-2 border-b border-[var(--border)]">
        <h1 className="text-2xl font-extrabold">CRM</h1>
        <nav
          aria-label="CRM sections"
          className="flex min-w-0 gap-1 overflow-x-auto"
        >
          {[
            "pipeline",
            "leads",
            "activities",
            "customers",
            "teams",
            "reporting",
            ...(data.canConfigure ? ["configuration"] : []),
          ].map((s) => (
            <button
              key={s}
              onClick={() => change({ screen: s })}
              aria-current={screen === s ? "page" : undefined}
              className={`shrink-0 border-b-2 px-3 py-4 text-sm font-medium capitalize transition-colors ${screen === s ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"}`}
            >
              {s}
            </button>
          ))}
        </nav>
      </header>
      <div className="flex flex-wrap items-center gap-2">
        {screen === "pipeline" && data.canCreate && (
          <button
            className="btn btn-primary !h-10 !px-4 !py-0 text-sm"
            onClick={() => {
              setPriority(0);
              setOpportunityDraft(blankOpportunityDraft(data.userId));
              setStage(
                data.stages.find((s) => s.stageType === "OPEN")?.id ?? "",
              );
            }}
          >
            <Plus size={16} />
            New
          </button>
        )}
        {["pipeline", "reporting"].includes(screen) && (
          <select
            aria-label="Pipeline ownership"
            className="input !h-10 !w-auto !max-w-44 !py-0 text-sm"
            value={
              query.mine === "true"
                ? "mine"
                : query.unassigned === "true"
                  ? "unassigned"
                  : "all"
            }
            onChange={(e) =>
              change({
                scope: "all",
                mine: e.target.value === "mine" ? "true" : null,
                unassigned: e.target.value === "unassigned" ? "true" : null,
              })
            }
          >
            <option value="mine">My pipeline</option>
            <option value="all">All accessible</option>
            <option value="unassigned">Unassigned</option>
          </select>
        )}
        <CrmEntitySearch
          companyId={companyId}
          value={search}
          tags={data.tags}
          contacts={data.contacts}
          members={data.members}
          onValue={(value) => {
            setSearch(value);
            if (value.match(/(?:^|\s)@[^\s]*$/)) return;
            if (searchTimer.current) clearTimeout(searchTimer.current);
            searchTimer.current = setTimeout(() => change({ q: value }), 300);
          }}
        />
        {["pipeline", "reporting"].includes(screen) && (
          <button
            className="btn btn-secondary !h-10 !py-0 text-sm"
            onClick={() => setFiltersOpen(true)}
            aria-haspopup="dialog"
          >
            <SlidersHorizontal size={15} />
            Filters
            {filterEntries.length > 0 && (
              <span className="rounded bg-[var(--soft)] px-1.5 text-xs">
                {filterEntries.length}
              </span>
            )}
          </button>
        )}
        {screen === "pipeline" && (
          <div
            className="flex h-10 shrink-0 items-center rounded-lg border border-[var(--border)] bg-[var(--panel)] p-1"
            role="group"
            aria-label="Pipeline view"
          >
            {[
              { key: "kanban", label: "Board view", Icon: Columns3 },
              { key: "list", label: "List view", Icon: List },
            ].map(({ key, label, Icon }) => (
              <button
                key={key}
                aria-label={label}
                title={label}
                aria-pressed={view === key}
                onClick={() => change({ view: key })}
                className={`rounded-md p-1.5 ${view === key ? "bg-[var(--soft)] text-[var(--text)]" : "text-[var(--muted)]"}`}
              >
                <Icon size={17} />
              </button>
            ))}
          </div>
        )}
        <details
          className="group relative shrink-0"
          onKeyDown={(e) => {
            if (e.key === "Escape") e.currentTarget.removeAttribute("open");
          }}
        >
          <summary
            aria-label="More CRM actions"
            title="More actions"
            className="btn btn-secondary !h-10 !w-10 !p-0 list-none [&::-webkit-details-marker]:hidden"
          >
            <MoreHorizontal size={18} />
          </summary>
          <div
            className="panel absolute right-0 top-12 z-30 min-w-44 p-1.5 shadow-xl"
            onClick={(e) =>
              e.currentTarget.closest("details")?.removeAttribute("open")
            }
          >
            <button
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-[var(--soft)]"
              onClick={() => void load()}
            >
              <RefreshCw size={15} />
              Refresh
            </button>
            {data.canImport && (
              <button
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-[var(--soft)]"
                onClick={() => setTransfer("import")}
              >
                <Upload size={15} />
                Import
              </button>
            )}
            {data.canExport && (
              <button
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-[var(--soft)]"
                onClick={() => setTransfer("export")}
              >
                <Download size={15} />
                Export
              </button>
            )}
          </div>
        </details>
      </div>
      {filtersOpen && (
        <Modal
          title="Filters & saved views"
          close={() => setFiltersOpen(false)}
        >
          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 [&>select]:!w-full">
            <select
              aria-label="Ownership filter"
              className="input !w-auto !py-2"
              value={
                query.mine === "true"
                  ? "mine"
                  : query.unassigned === "true"
                    ? "unassigned"
                    : "all"
              }
              onChange={(e) =>
                change({
                  scope: "all",
                  mine: e.target.value === "mine" ? "true" : null,
                  unassigned: e.target.value === "unassigned" ? "true" : null,
                })
              }
            >
              <option value="mine">My Pipeline</option>
              <option value="all">All accessible</option>
              <option value="unassigned">Unassigned</option>
            </select>
            <select
              aria-label="Outcome"
              className="input !w-auto !py-2"
              value={query.status ?? ""}
              onChange={(e) => change({ status: e.target.value })}
            >
              <option value="">All outcomes</option>
              {["open", "won", "lost"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select
              aria-label="Priority filter"
              className="input !w-auto !py-2"
              value={query.priority ?? ""}
              onChange={(e) => change({ priority: e.target.value })}
            >
              <option value="">All priorities</option>
              <option value="2">High priority (2+)</option>
              <option value="3">Urgent (3)</option>
            </select>
            <select
              aria-label="Activity filter"
              className="input !w-auto !py-2"
              value={query.activity ?? ""}
              onChange={(e) => change({ activity: e.target.value })}
            >
              <option value="">All activities</option>
              {["overdue", "today", "future"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select
              aria-label="Add tag filter"
              className="input !w-auto !py-2"
              value=""
              onChange={(event) => {
                if (!event.target.value) return;
                const ids = new Set(
                  (params.get("tagIds") ?? "").split(",").filter(Boolean),
                );
                ids.add(event.target.value);
                change({
                  tagIds: [...ids].join(","),
                  tagMode: params.get("tagMode") ?? "any",
                });
              }}
            >
              <option value="">Filter by tag…</option>
              {data.tags
                .filter((tag) => tag.active !== false)
                .map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {String(tag.name ?? tag.id)}
                  </option>
                ))}
            </select>
            <select
              aria-label="Tag matching logic"
              className="input !w-auto !py-2"
              disabled={!query.tagIds}
              value={query.tagMode ?? "any"}
              onChange={(event) => change({ tagMode: event.target.value })}
            >
              <option value="any">Tags: Match ANY</option>
              <option value="all">Tags: Match ALL</option>
            </select>
            <select
              aria-label="Group by"
              className="input !w-auto !py-2"
              value={group}
              onChange={(e) => change({ groupBy: e.target.value })}
            >
              {[
                "stageId",
                "ownerId",
                "salesTeamId",
                "city",
                "country",
                "source",
                "medium",
                "campaign",
                "lostReasonId",
              ].map((s) => (
                <option key={s} value={s}>
                  Group: {labels[s] ?? s}
                </option>
              ))}
            </select>
            <select
              aria-label="Sort"
              className="input !w-auto !py-2"
              value={query.sort ?? "createdAt"}
              onChange={(e) => change({ sort: e.target.value })}
            >
              {[
                "createdAt",
                "value",
                "probability",
                "priority",
                "expectedCloseDate",
                "updatedAt",
              ].map((s) => (
                <option key={s} value={s}>
                  Sort: {labels[s] ?? s}
                </option>
              ))}
            </select>
            <details className="sm:col-span-2">
              <summary className="cursor-pointer py-2 text-sm font-medium muted">
                Advanced filters
              </summary>
              <div className="grid grid-cols-1 gap-3 rounded-lg bg-[var(--soft)] p-4 sm:grid-cols-2">
                {["ownerId", "salesTeamId"].map((field) => (
                  <Field
                    key={field}
                    label={field === "ownerId" ? "Salesperson" : "Sales team"}
                  >
                    <select
                      className="input"
                      value={query[field] ?? ""}
                      onChange={(e) =>
                        change({
                          [field]: e.target.value,
                          scope: "all",
                          mine: null,
                        })
                      }
                    >
                      <option value="">All</option>
                      {(field === "ownerId" ? data.members : data.teams).map(
                        (r) => (
                          <option key={r.id} value={r.id}>
                            {title(r)}
                          </option>
                        ),
                      )}
                    </select>
                  </Field>
                ))}
                {["city", "country", "tag"].map((f) => (
                  <Field key={f} label={f}>
                    <input
                      className="input"
                      defaultValue={query[f]}
                      onBlur={(e) => change({ [f]: e.target.value })}
                    />
                  </Field>
                ))}
                <Field label="No progress for days">
                  <input
                    className="input"
                    type="number"
                    min="1"
                    defaultValue={query.rottingDays}
                    onBlur={(e) => change({ rottingDays: e.target.value })}
                  />
                </Field>
                <select
                  aria-label="Date field"
                  className="input"
                  value={query.dateField ?? "createdAt"}
                  onChange={(e) => change({ dateField: e.target.value })}
                >
                  {["createdAt", "closedAt", "expectedCloseDate"].map((f) => (
                    <option key={f} value={f}>
                      {labels[f] ?? f}
                    </option>
                  ))}
                </select>
                {["dateFrom", "dateTo"].map((f) => (
                  <Field key={f} label={labels[f] ?? f}>
                    <input
                      className="input"
                      type="date"
                      value={query[f] ?? ""}
                      onChange={(e) => change({ [f]: e.target.value })}
                    />
                  </Field>
                ))}
              </div>
            </details>
            <select
              aria-label="Favorites"
              className="input !w-auto !py-2"
              value=""
              onChange={(e) => {
                const favorite = data.favorites.find(
                  (f) => f.id === e.target.value,
                );
                if (favorite)
                  router.replace(
                    `/workspace/${companyId}/crm?scope=all&${new URLSearchParams(favorite.query as Record<string, string>)}`,
                  );
              }}
            >
              <option value="">Saved views</option>
              {data.favorites.map((f) => (
                <option key={f.id} value={f.id}>
                  {title(f)}
                </option>
              ))}
            </select>
            <button
              className="btn btn-secondary !py-2"
              onClick={() => {
                const name = prompt("Name this search");
                if (name)
                  void act(async () => {
                    await crmRequest(`${base}/configuration`, "POST", {
                      kind: "favorites",
                      name,
                      query,
                    });
                    await load();
                  });
              }}
            >
              Save current view
            </button>
          </div>
          <div className="mt-5 flex items-center justify-between border-t border-[var(--border)] pt-4">
            <p className="text-xs muted">Filters apply as you change them.</p>
            <button
              className="btn btn-primary text-sm"
              onClick={() => setFiltersOpen(false)}
            >
              Done
            </button>
          </div>
        </Modal>
      )}
      {filterEntries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {filterEntries.map(([k, v]) => (
            <button
              className="rounded-full bg-[var(--soft)] px-3 py-1 text-xs"
              key={k}
              onClick={() => {
                if (k === "q") setSearch("");
                change({
                  [k]: null,
                  ...(k === "mine" ? { scope: "all" } : {}),
                });
              }}
            >
              {labels[k] ?? k}: {v} ×
            </button>
          ))}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-lg bg-red-500/10 p-3 text-sm text-red-500"
        >
          {error}
          <button className="ml-3 underline" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}
      {data.truncated && (
        <div className="flex items-center gap-3 text-sm text-amber-600">
          <p>
            {data.records.length} matching opportunities loaded. Counts and
            totals cover loaded records only.
          </p>
          <button
            className="btn btn-secondary"
            disabled={saving || busy}
            onClick={() => void loadMore()}
          >
            {saving ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
      {busy ? (
        <div className="animate-pulse space-y-3" aria-label="Loading CRM">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-20 rounded-xl bg-[var(--soft)]" />
          ))}
        </div>
      ) : screen === "pipeline" ? (
        view === "list" ? (
          <div className="overflow-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead>
                <tr>
                  {[
                    "Select",
                    "Opportunity",
                    "Customer",
                    "Revenue",
                    "Probability",
                    "Priority",
                    "Owner",
                    "Next activity",
                  ].map((h) => (
                    <th className="p-3" key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.records.map((r) => (
                  <tr key={r.id} className="border-t border-[var(--border)]">
                    <td className="p-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.name}`}
                        checked={selection.includes(r.id)}
                        onChange={(e) =>
                          setSelection((s) =>
                            e.target.checked
                              ? [...s, r.id]
                              : s.filter((id) => id !== r.id),
                          )
                        }
                      />
                    </td>
                    <td className="p-3">
                      <button
                        className="font-bold text-[var(--accent)]"
                        onClick={() => open(r)}
                      >
                        {String(r.name)}
                      </button>
                    </td>
                    <td className="p-3">{String(r.customerName ?? "")}</td>
                    <td className="p-3">{money(r.value)}</td>
                    <td className="p-3">{String(r.probability ?? 0)}%</td>
                    <td className="p-3">
                      <Priority
                        value={r.priority}
                        disabled={saving || !data.canEdit}
                        onChange={(priority) =>
                          void act(() => patch(r, { priority }))
                        }
                      />
                    </td>
                    <td className="p-3">
                      {String(r.ownerName ?? "Unassigned")}
                    </td>
                    <td className="p-3">
                      {String(r.nextActivityTitle ?? "—")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex items-start gap-3 overflow-x-auto pb-4">
            {grouped.map((g) => (
              <section
                key={g.key}
                className={`min-h-80 shrink-0 rounded-xl border border-[var(--border)] bg-[var(--soft)]/50 p-2.5 ${(folded[`${companyId}:${g.key}`] ?? Boolean(g.stage?.folded)) ? "w-44" : "w-[270px]"}`}
                onDragOver={(e) => {
                  if (data.canMoveStage && g.stage) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const r = data.records.find(
                    (r) => r.id === e.dataTransfer.getData("text/plain"),
                  );
                  if (r && g.stage) void move(r, g.stage);
                }}
              >
                <header className="mb-3 flex items-center gap-1 px-1 py-1">
                  <div className="min-w-0 flex-1">
                    <h2 className="flex items-center gap-2 text-sm font-semibold">
                      {g.label}{" "}
                      <span className="rounded-md bg-[var(--soft)] px-1.5 py-0.5 text-[11px] font-normal muted">
                        {g.records.length}
                      </span>
                    </h2>
                    <p className="mt-1 text-xs muted">
                      {money(
                        g.records.reduce((n, r) => n + Number(r.value ?? 0), 0),
                      )}
                    </p>
                  </div>
                  <button
                    className="rounded-md p-1.5 muted hover:bg-[var(--soft)]"
                    aria-label={`Toggle ${g.label} stage`}
                    title="Fold / expand stage"
                    aria-expanded={
                      !(
                        folded[`${companyId}:${g.key}`] ??
                        Boolean(g.stage?.folded)
                      )
                    }
                    onClick={() =>
                      setFolded((current) => ({
                        ...current,
                        [`${companyId}:${g.key}`]: !(
                          current[`${companyId}:${g.key}`] ??
                          Boolean(g.stage?.folded)
                        ),
                      }))
                    }
                  >
                    {(folded[`${companyId}:${g.key}`] ??
                    Boolean(g.stage?.folded)) ? (
                      <ChevronRight size={15} />
                    ) : (
                      <ChevronDown size={15} />
                    )}
                  </button>
                  {data.canCreate && g.stage && (
                    <button
                      aria-label={`Add to ${g.label}`}
                      className="rounded-md p-1.5 muted hover:bg-[var(--soft)]"
                      onClick={() => setStage(g.key)}
                    >
                      <Plus size={18} />
                    </button>
                  )}
                </header>
                <div className="space-y-3">
                  {!(
                    folded[`${companyId}:${g.key}`] ?? Boolean(g.stage?.folded)
                  ) &&
                    g.records.map((r) => (
                      <article
                        key={r.id}
                        draggable={data.canMoveStage && !saving}
                        onDragStart={(e) =>
                          e.dataTransfer.setData("text/plain", r.id)
                        }
                        className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3.5 shadow-sm transition-colors hover:border-[var(--muted)]"
                      >
                        <button
                          className="w-full text-left"
                          onClick={() => open(r)}
                          onPointerEnter={() =>
                            router.prefetch(
                              `/workspace/${companyId}/crm/opportunities/${r.id}`,
                            )
                          }
                          onFocus={() =>
                            router.prefetch(
                              `/workspace/${companyId}/crm/opportunities/${r.id}`,
                            )
                          }
                        >
                          <span className="line-clamp-2 text-sm font-semibold leading-5">
                            {String(r.name)}
                          </span>
                          {Boolean(r.customerName) && (
                            <p className="mt-1 truncate text-xs muted">
                              {String(r.customerName)}
                            </p>
                          )}
                          <p className="mt-3 text-sm font-medium">
                            {money(r.value)}{" "}
                            {Number(r.probability ?? 0) > 0 && (
                              <span className="text-xs font-normal muted">
                                · {String(r.probability ?? 0)}%
                              </span>
                            )}
                          </p>
                        </button>
                        {Array.isArray(r.tags) && r.tags.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1">
                            {((r.tags as string[]) ?? [])
                              .slice(0, 2)
                              .map((tagId) => (
                                <button
                                  type="button"
                                  key={tagId}
                                  className="rounded bg-[var(--soft)] px-2 text-xs"
                                  onClick={() => {
                                    const ids = new Set(
                                      (params.get("tagIds") ?? "")
                                        .split(",")
                                        .filter(Boolean),
                                    );
                                    ids.add(tagId);
                                    change({
                                      tagIds: [...ids].join(","),
                                      tagMode: params.get("tagMode") ?? "any",
                                    });
                                  }}
                                >
                                  {String(
                                    data.tags.find((tag) => tag.id === tagId)
                                      ?.name ?? tagId,
                                  )}
                                </button>
                              ))}
                            {((r.tags as string[]) ?? []).length > 2 && (
                              <span className="rounded bg-[var(--soft)] px-2 text-xs">
                                +{((r.tags as string[]) ?? []).length - 2}
                              </span>
                            )}
                          </div>
                        )}
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <Priority
                            value={r.priority}
                            disabled={saving || !data.canEdit}
                            onChange={(priority) =>
                              void act(() => patch(r, { priority }))
                            }
                          />
                          <span
                            className="max-w-28 truncate text-[11px] muted"
                            title={String(r.ownerName || "Unassigned")}
                          >
                            {String(r.ownerName || "Unassigned")}
                          </span>
                        </div>
                        {Boolean(r.nextActivityTitle) && (
                          <p
                            className={`mt-3 flex items-center gap-1.5 border-t border-[var(--border)] pt-2.5 text-[11px] ${getActivityState({ dueAt: r.nextActivityDueAt }, new Date(), data.timezone) === "overdue" ? "text-red-500" : "muted"}`}
                          >
                            <CalendarClock size={13} />
                            {String(r.nextActivityTitle ?? "No next activity")}
                          </p>
                        )}
                      </article>
                    ))}
                </div>
              </section>
            ))}
          </div>
        )
      ) : screen === "customers" ? (
        <div className="divide-y divide-[var(--border)]">
          {data.contacts.map((c) => (
            <Link
              key={c.id}
              className="flex justify-between py-4"
              href={`/workspace/${companyId}/contacts/${c.id}`}
            >
              <b>{title(c)}</b>
              <span className="muted">{String(c.email ?? c.phone ?? "")}</span>
            </Link>
          ))}
        </div>
      ) : screen === "reporting" ? (
        <div className="grid gap-4 md:grid-cols-3">
          {["open", "won", "lost"].map((status) => {
            const subset = data.records.filter(
              (r) => (r.status ?? "open") === status,
            );
            return (
              <section key={status} className="panel p-5">
                <h2 className="font-bold capitalize">{status}</h2>
                <p className="mt-2 text-2xl">{subset.length} opportunities</p>
                <p className="text-[var(--accent)]">
                  {money(subset.reduce((n, r) => n + Number(r.value ?? 0), 0))}
                </p>
              </section>
            );
          })}
        </div>
      ) : ["teams", "configuration"].includes(screen) ? (
        <div>
          <div className="mb-4 flex gap-2">
            {screen === "configuration" && (
              <select
                className="input !w-auto"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                {["stages", "teams", "tags", "lostReasons"].map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            )}
            {data.canConfigure && (
              <button
                className="btn btn-primary"
                onClick={() => setConfig({ id: "" })}
              >
                New {screen === "teams" ? "team" : kind}
              </button>
            )}
          </div>
          {(screen === "teams"
            ? data.teams
            : data[kind as "stages" | "teams" | "tags" | "lostReasons"]
          ).map((r) => (
            <div
              className="flex items-center justify-between border-b border-[var(--border)] py-3"
              key={r.id}
            >
              <span>
                {title(r)} {r.stageType ? String(r.stageType) : ""}
              </span>
              {data.canConfigure && (
                <button
                  className="btn btn-secondary"
                  onClick={() => setConfig(r)}
                >
                  Edit
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div>
          {screen === "leads" && (
            <button
              className="btn btn-primary mb-3"
              onClick={() => setConfig({ id: "lead" })}
            >
              New lead
            </button>
          )}
          {screen === "activities" && (
            <div className="mb-4 flex gap-4">
              {["overdue", "today", "future"].map((state) => (
                <span key={state}>
                  {state}:{" "}
                  {
                    rows.filter(
                      (r) =>
                        getActivityState(r, new Date(), data.timezone) ===
                          state && r.ownerId === data.userId,
                    ).length
                  }
                </span>
              ))}
            </div>
          )}
          {rows.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap justify-between gap-3 border-b border-[var(--border)] py-4"
            >
              <div>
                <b>{title(r)}</b>
                <p className="text-sm muted">
                  {String(r.description ?? r.email ?? "")}
                </p>
              </div>
              <span>
                {screen === "activities"
                  ? getActivityState(r, new Date(), data.timezone)
                  : String(r.status ?? "New")}
              </span>
              {screen === "activities" &&
                r.status === "scheduled" &&
                r.canEdit === true && (
                  <button
                    disabled={saving}
                    className="btn btn-secondary"
                    onClick={() =>
                      void act(async () => {
                        await crmRequest(
                          `${base}/activities/${r.id}`,
                          "PATCH",
                          {
                            status: "completed",
                          },
                        );
                        await load();
                      })
                    }
                  >
                    Mark Done
                  </button>
                )}
              {screen === "leads" && !r.convertedAt && (
                <button
                  className="btn btn-secondary"
                  disabled={saving}
                  onClick={() =>
                    void act(async () => {
                      const result = await crmRequest(
                        `${base}/leads/${r.id}/convert`,
                        "POST",
                        {
                          createContact: false,
                          createOrganization: false,
                          createOpportunity: true,
                          stageId: data.stages.find(
                            (s) => s.stageType === "OPEN",
                          )?.id,
                        },
                      );
                      if (result.opportunityId)
                        router.push(
                          `/workspace/${companyId}/crm/opportunities/${result.opportunityId}`,
                        );
                    })
                  }
                >
                  Convert
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {stage !== null && (
        <Modal title="New opportunity" close={() => setStage(null)}>
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
            <Field label="Opportunity">
              <input
                className="input"
                name="name"
                required
                minLength={2}
                placeholder="Example: 5 office chairs"
                value={opportunityDraft.name}
                onChange={(event) =>
                  setOpportunityDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </Field>
            <Field label="Contact / customer">
              <select
                className="input"
                name="customerId"
                value={opportunityDraft.customerId}
                onChange={(event) => {
                  const contact = data.contacts.find(
                    (item) => item.id === event.target.value,
                  );
                  setOpportunityDraft((current) =>
                    autofillOpportunityFromContact(current, contact),
                  );
                }}
              >
                <option value="">No contact</option>
                {data.contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {title(c)} · {c.contactType === "company" ? "Company" : "Person"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Salesperson">
              <select
                className="input"
                name="ownerId"
                value={opportunityDraft.ownerId}
                onChange={(event) =>
                  setOpportunityDraft((current) => ({
                    ...current,
                    ownerId: event.target.value,
                  }))
                }
                disabled={!data.canAssign}
              >
                <option value="">Unassigned</option>
                {data.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {title(m)}
                  </option>
                ))}
              </select>
              {!data.canAssign && (
                <input
                  type="hidden"
                  name="ownerId"
                  value={opportunityDraft.ownerId || data.userId}
                />
              )}
            </Field>
            <Field label="Expected revenue">
              <input
                className="input"
                type="number"
                min="0"
                step=".01"
                name="value"
                value={opportunityDraft.value}
                onChange={(event) =>
                  setOpportunityDraft((current) => ({
                    ...current,
                    value: event.target.value,
                  }))
                }
              />
            </Field>
            {["email", "phone"].map((f) => (
              <Field key={f} label={f}>
                <input
                  className="input"
                  name={f}
                  type={f === "email" ? "email" : "text"}
                  value={opportunityDraft[f as "email" | "phone"]}
                  onChange={(event) =>
                    setOpportunityDraft((current) => ({
                      ...current,
                      [f]: event.target.value,
                    }))
                  }
                />
                {opportunityDraft.customerId && (
                  <span className="mt-1 block text-xs text-emerald-600">
                    Filled from the selected contact
                  </span>
                )}
              </Field>
            ))}
            {opportunityDraft.customerId && (
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3 text-sm sm:col-span-2">
                <b className="text-emerald-700 dark:text-emerald-400">
                  Contact information linked
                </b>
                <p className="mt-1 muted">
                  Email, phone, location and tags available on this contact will
                  be copied into the opportunity.
                </p>
              </div>
            )}
            <Field label="Priority">
              <Priority value={priority} onChange={setPriority} />
            </Field>
            <div className="flex gap-2 sm:col-span-2">
              <button disabled={saving} className="btn btn-primary" value="add">
                Add
              </button>
              <button
                disabled={saving}
                className="btn btn-secondary"
                value="edit"
              >
                Add & edit details
              </button>
              <Link
                href={`/workspace/${companyId}/contacts`}
                className="btn btn-secondary"
              >
                Manage contacts
              </Link>
            </div>
          </form>
        </Modal>
      )}
      {config && (
        <Modal
          title={config.id === "lead" ? "New lead" : "Configuration"}
          close={() => setConfig(null)}
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const values = Object.fromEntries(formData);
              void act(async () => {
                if (config.id === "lead")
                  await crmRequest(`${base}/leads`, "POST", {
                    ...values,
                    email: values.email ?? "",
                  });
                else {
                  const currentKind = screen === "teams" ? "teams" : kind;
                  await crmRequest(
                    `${base}/configuration`,
                    config.id ? "PATCH" : "POST",
                    {
                      kind: currentKind,
                      ...(config.id ? { id: config.id } : {}),
                      ...values,
                      ...(currentKind === "teams"
                        ? {
                            memberIds: formData.getAll("memberIds").map(String),
                          }
                        : {}),
                      ...(currentKind === "stages"
                        ? {
                            sequence: Number(values.sequence),
                            probability: Number(values.probability),
                            folded: values.folded === "on",
                          }
                        : {}),
                    },
                  );
                }
                setConfig(null);
                await load();
              });
            }}
          >
            <Field label="Name">
              <input
                className="input"
                required
                name="name"
                defaultValue={String(config.name ?? "")}
              />
            </Field>
            {config.id === "lead" ? (
              <Field label="Email">
                <input className="input" type="email" name="email" />
              </Field>
            ) : screen === "teams" || kind === "teams" ? (
              <Field label="Team members (hold Ctrl or Command to select several)">
                <select
                  className="input"
                  name="memberIds"
                  multiple
                  defaultValue={(config.memberIds as string[]) ?? []}
                >
                  {data.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {title(m)}
                    </option>
                  ))}
                </select>
              </Field>
            ) : kind === "stages" ? (
              <>
                <Field label="Outcome">
                  <select
                    className="input"
                    name="stageType"
                    defaultValue={String(config.stageType ?? "OPEN")}
                  >
                    {["OPEN", "WON", "LOST"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Sequence">
                  <input
                    className="input"
                    name="sequence"
                    type="number"
                    min="0"
                    defaultValue={Number(config.sequence ?? 0)}
                  />
                </Field>
                <Field label="Default probability">
                  <input
                    className="input"
                    name="probability"
                    type="number"
                    min="0"
                    max="100"
                    defaultValue={Number(config.probability ?? 0)}
                  />
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="folded"
                    defaultChecked={Boolean(config.folded)}
                  />
                  Fold this stage by default
                </label>
              </>
            ) : null}
            <button disabled={saving} className="btn btn-primary">
              Save
            </button>
          </form>
        </Modal>
      )}
      {transfer && (
        <CrmTransfer
          companyId={companyId}
          mode={transfer}
          query={query}
          selectedIds={selection}
          close={() => setTransfer(null)}
          done={() => void load()}
        />
      )}
    </div>
  );
}
