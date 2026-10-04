"use client";
import { Star, X } from "lucide-react";
import { normalizePriority } from "@/lib/crm-query";
import { useEffect, useRef } from "react";
export type Item = Record<string, unknown> & { id: string };
export async function crmRequest(url: string, method = "GET", body?: unknown) {
  const response = await fetch(url, {
    method,
    ...(body
      ? {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Request failed");
  return data;
}
export function Priority({
  value,
  onChange,
  disabled = false,
}: {
  value: unknown;
  onChange?: (value: number) => void;
  disabled?: boolean;
}) {
  const current = normalizePriority(value);
  return (
    <span className="inline-flex gap-1" aria-label={`Priority ${current} of 3`}>
      {[1, 2, 3].map((n) => (
        <button
          type="button"
          key={n}
          disabled={disabled || !onChange}
          aria-label={`Set priority ${current === n ? 0 : n}`}
          aria-pressed={current >= n}
          onClick={(e) => {
            e.stopPropagation();
            onChange?.(current === n ? 0 : n);
          }}
        >
          <Star
            size={17}
            className={
              current >= n
                ? "fill-amber-400 text-amber-400"
                : "text-[var(--muted)]"
            }
          />
        </button>
      ))}
    </span>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
}) {
  const container = useRef<HTMLElement>(null);
  const onClose = useRef(close);
  onClose.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const getFocusable = () =>
      Array.from(
        container.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
        ) ?? [],
      );
    getFocusable()[0]?.focus();
    const keydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose.current();
      }
      if (e.key !== "Tab") return;
      const elements = getFocusable(),
        first = elements[0],
        last = elements.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, []);
  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-black/60 p-4">
      <section
        ref={container}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="panel mx-auto my-8 w-full max-w-3xl p-5"
      >
        <header className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-bold">{title}</h2>
          <button type="button" aria-label="Close" onClick={close}>
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export const title = (r: Item) =>
  String(r.displayName ?? r.name ?? r.title ?? r.email ?? r.id);
