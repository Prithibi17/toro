"use client";

import { AlertTriangle, X } from "lucide-react";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section
        aria-describedby="confirm-dialog-description"
        aria-labelledby="confirm-dialog-title"
        aria-modal="true"
        className="panel w-full max-w-md p-6 shadow-2xl"
        role="alertdialog"
      >
        <div className="flex items-start gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-amber-500/10 text-amber-500">
            <AlertTriangle size={21} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-extrabold" id="confirm-dialog-title">
              {title}
            </h2>
            <p
              className="mt-2 text-sm leading-6 muted"
              id="confirm-dialog-description"
            >
              {description}
            </p>
          </div>
          <button
            aria-label="Close confirmation"
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            <X size={19} />
          </button>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className={
              destructive
                ? "btn bg-red-600 text-white hover:bg-red-700"
                : "btn btn-primary"
            }
            disabled={busy}
            onClick={onConfirm}
            type="button"
          >
            {busy ? "Please wait…" : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
