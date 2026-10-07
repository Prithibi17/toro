"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, Hash, Search, UserRound, X } from "lucide-react";
import { useOutsideDismiss } from "@/lib/use-outside-dismiss";
type Entity = {
  id: string;
  name: string;
  subtitle?: string;
  type: "tag" | "contact" | "company" | "salesperson";
};
type Item = Record<string, unknown> & { id: string };
const groupLabels: Record<string, string> = {
  tags: "Tags",
  contacts: "Contacts",
  companies: "Companies",
  people: "People / Salespersons",
};
export function CrmEntitySearch({
  companyId,
  value,
  onValue,
  tags,
  contacts,
  members,
}: {
  companyId: string;
  value: string;
  onValue: (value: string) => void;
  tags: Item[];
  contacts: Item[];
  members: Item[];
}) {
  const router = useRouter(),
    params = useSearchParams(),
    [groups, setGroups] = useState<Record<string, Entity[]>>({}),
    [active, setActive] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const at = value.match(/(?:^|\s)@([^\s]*)$/),
    term = at?.[1] ?? "",
    open = Boolean(at);
  const dismiss = useCallback(
    () => onValue(value.replace(/(?:^|\s)@[^\s]*$/, "").trim()),
    [onValue, value],
  );
  useOutsideDismiss(container, open, dismiss);
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
            .then((response) => response.json())
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
  const replace = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    Object.entries(changes).forEach(([key, val]) =>
      val ? next.set(key, val) : next.delete(key),
    );
    router.replace(`/workspace/${companyId}/crm?${next}`, { scroll: false });
  };
  function choose(entity: Entity) {
    if (entity.type === "tag") {
      const ids = new Set(
        (params.get("tagIds") ?? "").split(",").filter(Boolean),
      );
      ids.add(entity.id);
      replace({
        tagIds: [...ids].join(","),
        tagMode: params.get("tagMode") ?? "any",
      });
    } else if (entity.type === "salesperson")
      replace({ ownerId: entity.id, scope: "all", mine: null });
    else replace({ customerId: entity.id });
    onValue(value.replace(/(?:^|\s)@[^\s]*$/, "").trim());
    setGroups({});
  }
  const chips = [
    ...(params.get("tagIds") ?? "")
      .split(",")
      .filter(Boolean)
      .map((id) => ({
        key: "tag",
        id,
        label: String(tags.find((item) => item.id === id)?.name ?? id),
      })),
    ...(params.get("customerId")
      ? [
          {
            key:
              contacts.find((item) => item.id === params.get("customerId"))
                ?.contactType === "company"
                ? "company"
                : "contact",
            id: params.get("customerId")!,
            label: String(
              contacts.find((item) => item.id === params.get("customerId"))
                ?.displayName ?? "Contact",
            ),
          },
        ]
      : []),
    ...(params.get("ownerId")
      ? [
          {
            key: "salesperson",
            id: params.get("ownerId")!,
            label: String(
              members.find((item) => item.id === params.get("ownerId"))
                ?.displayName ?? "Salesperson",
            ),
          },
        ]
      : []),
  ];
  function remove(key: string, id: string) {
    if (key === "tag") {
      const ids = (params.get("tagIds") ?? "")
        .split(",")
        .filter((item) => item && item !== id);
      replace({
        tagIds: ids.join(","),
        tagMode: ids.length ? (params.get("tagMode") ?? "any") : null,
      });
    } else
      replace({
        [key === "salesperson" ? "ownerId" : "customerId"]: null,
      });
  }
  return (
    <div ref={container} className="relative flex h-10 min-w-48 flex-1 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 text-sm focus-within:border-[var(--accent)]">
      <Search size={16} />
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {chips.map((chip) => (
          <span
            key={`${chip.key}:${chip.id}`}
            className="flex shrink-0 items-center gap-1 rounded-md bg-[var(--soft)] px-2 py-1 text-xs"
          >
            <b className="capitalize">{chip.key}:</b>
            {chip.label}
            <button
              aria-label={`Remove ${chip.label}`}
              onClick={() => remove(chip.key, chip.id)}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          aria-label="Search opportunities"
          className="min-w-28 flex-1 bg-transparent py-2 outline-none"
          placeholder="Search or type @…"
          value={value}
          onChange={(event) => onValue(event.target.value)}
          onKeyDown={(event) => {
            if (!open) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((value) => Math.min(flat.length - 1, value + 1));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((value) => Math.max(0, value - 1));
            }
            if (event.key === "Enter" && flat[active]) {
              event.preventDefault();
              choose(flat[active]);
            }
            if (event.key === "Escape") onValue(value.replace(/@[^\s]*$/, ""));
          }}
        />
      </div>
      {open && (
        <div className="absolute left-0 right-0 top-12 z-50 max-h-96 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--panel)] p-2 shadow-xl">
          {Object.entries(groups).map(([group, items]) =>
            items.length ? (
              <section key={group}>
                <h3 className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider muted">
                  {groupLabels[group] ?? group}
                </h3>
                {items.map((item) => (
                  <button
                    type="button"
                    key={`${item.type}:${item.id}`}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${flat[active] === item ? "bg-[var(--soft)]" : "hover:bg-[var(--soft)]"}`}
                    onMouseEnter={() => setActive(flat.indexOf(item))}
                    onClick={() => choose(item)}
                  >
                    {item.type === "tag" ? (
                      <Hash size={16} />
                    ) : item.type === "company" ? (
                      <Building2 size={16} />
                    ) : (
                      <UserRound size={16} />
                    )}
                    <span>
                      <b className="block text-sm">{item.name}</b>
                      {item.subtitle && (
                        <small className="muted">{item.subtitle}</small>
                      )}
                    </span>
                  </button>
                ))}
              </section>
            ) : null,
          )}
          {!flat.length && (
            <p className="p-4 text-center text-sm muted">
              No matching CRM entities
            </p>
          )}
        </div>
      )}
    </div>
  );
}
