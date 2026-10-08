"use client";

import { useEffect } from "react";
import { ExternalLink, X } from "lucide-react";
import type { IdFinderConnection } from "@/lib/id-finder";

const ID_FINDER = "https://go-repireo-employee-management.vercel.app";

export function IdFinderCardModal({
  connection,
  close,
}: {
  connection: IdFinderConnection;
  close: () => void;
}) {
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [close]);
  const url = `${ID_FINDER}/embed/id-card/${encodeURIComponent(connection.identifier)}`;
  return (
    <div
      className="fixed inset-0 z-[110] grid place-items-center overflow-y-auto bg-black/70 p-4"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section className="panel my-5 w-full max-w-lg overflow-hidden">
        <header className="flex items-center justify-between border-b border-[var(--border)] p-4">
          <div>
            <h2 className="font-extrabold">{connection.fullName}</h2>
            <p className="text-xs muted">
              {connection.identifier}
              {connection.designation ? ` · ${connection.designation}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <a
              className="rounded-lg p-2 hover:bg-[var(--soft)]"
              href={url}
              target="_blank"
              rel="noreferrer"
              title="Open ID card"
            >
              <ExternalLink size={17} />
            </a>
            <button
              className="rounded-lg p-2 hover:bg-[var(--soft)]"
              onClick={close}
              aria-label="Close ID card"
            >
              <X size={19} />
            </button>
          </div>
        </header>
        <iframe
          className="h-[min(720px,75vh)] w-full bg-white"
          src={url}
          title={`${connection.fullName} ID card`}
          loading="lazy"
          sandbox="allow-scripts allow-same-origin"
        />
      </section>
    </div>
  );
}
