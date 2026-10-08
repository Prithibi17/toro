"use client";

import { useEffect } from "react";

export function AttendanceHeartbeat({ companyId }: { companyId: string }) {
  useEffect(() => {
    let lastActive = Date.now();
    const activity = () => {
      lastActive = Date.now();
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((event) => window.addEventListener(event, activity, { passive: true }));
    const ping = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastActive > 120_000) return;
      void fetch(`/api/companies/${companyId}/attendance`, { method: "POST" });
    };
    ping();
    const interval = window.setInterval(ping, 60_000);
    return () => {
      window.clearInterval(interval);
      events.forEach((event) => window.removeEventListener(event, activity));
    };
  }, [companyId]);
  return null;
}
