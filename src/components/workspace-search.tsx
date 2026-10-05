"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Hash, Search, UserRound } from "lucide-react";
type Entity = {
  id: string;
  name: string;
  subtitle?: string;
  type: "tag" | "contact" | "company" | "salesperson";
};
const labels: Record<string, string> = {
  tags: "Tags",
  contacts: "Contacts",
  companies: "Companies",
  people: "People / Salespersons",
};
export function WorkspaceSearch({
  companyId,
  hasCrm,
}: {
  companyId: string;
  hasCrm: boolean;
}) {
  const router = useRouter(),
    [value, setValue] = useState(""),
    [groups, setGroups] = useState<Record<string, Entity[]>>({}),
    [active, setActive] = useState(0),
    at = value.match(/(?:^|\s)@([^\s]*)$/),
    term = at?.[1] ?? "",
    open = hasCrm && Boolean(at);
  useEffect(() => {
    if (!open) {
      setGroups({});
      return;
    }
    const controller = new AbortController(),
      timer = setTimeout(
        () =>
          fetch(
            `/api/companies/${companyId}/crm/search/suggestions?q=${encodeURIComponent(term)}`,
            { signal: controller.signal },
          )
            .then((response) =>
              response.ok ? response.json() : { groups: {} },
            )
            .then((result) => {
              setGroups(result.groups ?? {});
              setActive(0);
            })
            .catch(() => {}),
        180,
      );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [companyId, open, term]);
  const flat = useMemo(() => Object.values(groups).flat(), [groups]);
  function select(entity: Entity) {
    setValue("");
    if (entity.type === "tag")
      router.push(
        `/workspace/${companyId}/crm?scope=all&tagIds=${encodeURIComponent(entity.id)}&tagMode=any`,
      );
    else if (entity.type === "salesperson")
      router.push(
        `/workspace/${companyId}/crm?scope=all&ownerId=${encodeURIComponent(entity.id)}`,
      );
    else router.push(`/workspace/${companyId}/contacts/${entity.id}`);
  }
  function submit() {
    const query = value.trim();
    if (!query) return;
    if (hasCrm)
      router.push(
        `/workspace/${companyId}/crm?scope=all&q=${encodeURIComponent(query)}`,
      );
    else
      router.push(
        `/workspace/${companyId}/contacts?q=${encodeURIComponent(query)}`,
      );
  }
  return (
    <div className="relative hidden max-w-xl flex-1 sm:block">
      <Search
        className="absolute left-3 top-1/2 -translate-y-1/2 muted"
        size={17}
      />
      <input
        className="input !pl-10"
        aria-label="Search this workspace"
        placeholder="Search this workspace… Type @ for entities"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (open) {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((index) => Math.min(flat.length - 1, index + 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((index) => Math.max(0, index - 1));
            } else if (event.key === "Enter" && flat[active]) {
              event.preventDefault();
              select(flat[active]);
            } else if (event.key === "Escape")
              setValue(value.replace(/@[^\s]*$/, "").trim());
          } else if (event.key === "Enter") submit();
        }}
      />
      {open && (
        <div className="absolute left-0 right-0 top-12 z-50 max-h-[70vh] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--panel)] p-2 shadow-2xl">
          {Object.entries(groups).map(([group, items]) =>
            items.length ? (
              <section key={group}>
                <h3 className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[.16em] muted">
                  {labels[group] ?? group}
                </h3>
                {items.map((item) => (
                  <button
                    type="button"
                    key={`${item.type}:${item.id}`}
                    onMouseEnter={() => setActive(flat.indexOf(item))}
                    onClick={() => select(item)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${flat[active] === item ? "bg-[var(--soft)]" : "hover:bg-[var(--soft)]"}`}
                  >
                    {item.type === "tag" ? (
                      <Hash size={16} />
                    ) : item.type === "company" ? (
                      <Building2 size={16} />
                    ) : (
                      <UserRound size={16} />
                    )}
                    <span className="min-w-0">
                      <b className="block truncate text-sm">{item.name}</b>
                      <small className="block truncate muted">
                        {item.type.toUpperCase()}
                        {item.subtitle ? ` · ${item.subtitle}` : ""}
                      </small>
                    </span>
                  </button>
                ))}
              </section>
            ) : null,
          )}
          {!flat.length && (
            <p className="p-5 text-center text-sm muted">
              No matching workspace entities
            </p>
          )}
        </div>
      )}
    </div>
  );
}
