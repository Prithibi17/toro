"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  CirclePlus,
  LoaderCircle,
  UserRound,
} from "lucide-react";
import { WorkspaceEntityInput } from "./workspace-entity-input";
import { cachedJson } from "@/lib/client-api-cache";
type Item = Record<string, unknown> & { id: string };
export function ContactsWorkspace({ companyId }: { companyId: string }) {
  const router = useRouter(),
    [records, setRecords] = useState<Item[]>([]),
    [loading, setLoading] = useState(true),
    [canCreate, setCanCreate] = useState(false),
    [query, setQuery] = useState(""),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await cachedJson<{ records: Item[]; canCreate: boolean }>(
        `/api/companies/${companyId}/contacts`,
      );
      setRecords(j.records ?? []);
      setCanCreate(j.canCreate);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load contacts");
    }
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
          <button
            className="btn btn-primary"
            onClick={() => router.push(`/workspace/${companyId}/contacts/new`)}
          >
            <CirclePlus size={17} />
            New Contact
          </button>
        )}
      </header>
      <WorkspaceEntityInput
        companyId={companyId}
        value={query}
        onChange={setQuery}
        placeholder="Search name, email, phone, company or tax ID"
        className="panel mb-5 p-3"
      />
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
    </>
  );
}
