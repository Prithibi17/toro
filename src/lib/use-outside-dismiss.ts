"use client";
import { useEffect, type RefObject } from "react";

export function useOutsideDismiss<T extends HTMLElement>(
  ref: RefObject<T | null>,
  active: boolean,
  dismiss: () => void,
) {
  useEffect(() => {
    if (!active) return;
    const outside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) dismiss();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [active, dismiss, ref]);
}
