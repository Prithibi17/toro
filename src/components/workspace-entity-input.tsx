"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Hash, Search, UserRound } from "lucide-react";
import { useOutsideDismiss } from "@/lib/use-outside-dismiss";

type Entity = {
  id: string;
  name: string;
  subtitle?: string;
  type: "tag" | "contact" | "company" | "salesperson";
};

export function WorkspaceEntityInput({
  companyId,
  value,
  onChange,
  placeholder,
  className = "",
}: {
  companyId: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  const router = useRouter();
  const [groups, setGroups] = useState<Record<string, Entity[]>>({});
  const [active, setActive] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const match = value.match(/(?:^|\s)@([^\s]*)$/);
  const term = match?.[1] ?? "";
  const open = Boolean(match);
  const dismiss = useCallback(
    () => onChange(value.replace(/(?:^|\s)@[^\s]*$/, "").trim()),
    [onChange, value],
  );
  useOutsideDismiss(container, open, dismiss);
  useEffect(() => {
    if (!open) {
      setGroups({});
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(
        `/api/companies/${companyId}/crm/search/suggestions?q=${encodeURIComponent(term)}`,
        { signal: controller.signal },
      )
        .then((response) => (response.ok ? response.json() : { groups: {} }))
        .then((payload) => {
          setGroups(payload.groups ?? {});
          setActive(0);
        })
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [companyId, open, term]);
  const entities = useMemo(() => Object.values(groups).flat(), [groups]);
  function choose(entity: Entity) {
    onChange("");
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
  return (
    <div ref={container} className={`relative flex items-center gap-2 ${className}`}>
      <Search size={16} />
      <input
        className="w-full bg-transparent py-2.5 text-sm outline-none"
        placeholder={`${placeholder} · Type @ for entities`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (!open) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((index) => Math.min(entities.length - 1, index + 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => Math.max(0, index - 1));
          } else if (event.key === "Enter" && entities[active]) {
            event.preventDefault();
            choose(entities[active]);
          } else if (event.key === "Escape")
            onChange(value.replace(/@[^\s]*$/, "").trim());
        }}
      />
      {open && (
        <div className="absolute left-0 right-0 top-12 z-50 max-h-96 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--panel)] p-2 shadow-2xl">
          {entities.map((entity, index) => (
            <button
              type="button"
              key={`${entity.type}:${entity.id}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(entity)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${active === index ? "bg-[var(--soft)]" : "hover:bg-[var(--soft)]"}`}
            >
              {entity.type === "tag" ? (
                <Hash size={16} />
              ) : entity.type === "company" ? (
                <Building2 size={16} />
              ) : (
                <UserRound size={16} />
              )}
              <span className="min-w-0">
                <b className="block truncate text-sm">{entity.name}</b>
                <small className="block truncate muted">
                  {entity.type}{entity.subtitle ? ` · ${entity.subtitle}` : ""}
                </small>
              </span>
            </button>
          ))}
          {!entities.length && (
            <p className="p-4 text-center text-sm muted">No matching entities</p>
          )}
        </div>
      )}
    </div>
  );
}
