"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MODULES, type ModuleKey } from "@/lib/types";
export function AppsManager({
  companyId,
  initialEnabled,
  isOwner,
}: {
  companyId: string;
  initialEnabled: ModuleKey[];
  isOwner: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState<ModuleKey | null>(null);
  const [, startTransition] = useTransition();
  async function toggle(key: ModuleKey) {
    if (!isOwner) return;
    const next = enabled.includes(key)
      ? enabled.filter((x) => x !== key)
      : [...enabled, key];
    setEnabled(next);
    setSaving(key);
    const r = await fetch(`/api/companies/${companyId}/modules`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ modules: next }),
    });
    if (!r.ok) setEnabled(enabled);
    else startTransition(() => router.refresh());
    setSaving(null);
  }
  return (
    <>
      <div className="mb-8">
        <p className="text-sm font-semibold text-[var(--accent)]">
          Company administration
        </p>
        <h1 className="mt-1 text-3xl font-extrabold">Application launcher</h1>
        <p className="mt-2 muted">
          {isOwner
            ? "Open apps or enable and disable them for the company."
            : "Open the applications enabled by the company owner."}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {MODULES.map((m) => {
          const on = enabled.includes(m.key);
          return (
            <div key={m.key} className={`panel p-5 ${!on && "opacity-55"}`}>
              <Link href={on ? `/workspace/${companyId}/${m.key}` : "#"}>
                <div className="mb-7 grid h-11 w-11 place-items-center rounded-xl bg-[var(--soft)] font-bold">
                  {m.name[0]}
                </div>
                <h2 className="font-bold">{m.name}</h2>
                <p className="mt-1 min-h-10 text-sm muted">{m.description}</p>
              </Link>
              {isOwner ? (
                <button
                  disabled={saving === m.key}
                  className={`mt-4 rounded-full px-3 py-1 text-xs font-bold ${on ? "bg-emerald-500/15 text-emerald-600" : "bg-[var(--soft)] muted"}`}
                  onClick={() => toggle(m.key)}
                >
                  {on ? "ENABLED" : "ENABLE"}
                </button>
              ) : (
                <p
                  className={`mt-4 text-xs font-bold ${on ? "text-emerald-500" : "muted"}`}
                >
                  {on ? "ENABLED" : "DISABLED"}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
