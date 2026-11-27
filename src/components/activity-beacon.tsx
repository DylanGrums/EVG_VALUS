"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const ENDPOINT = "/api/ping";
const HEARTBEAT_MS = 60_000;
/** Sans interaction depuis ce délai, l'onglet laissé ouvert ne compte plus comme actif. */
const IDLE_MS = 15 * 60_000;

function send(t: "view" | "ping", p: string) {
  try {
    const body = JSON.stringify({ t, p });
    if (typeof fetch === "function") {
      void fetch(ENDPOINT, { method: "POST", body, keepalive: true, credentials: "same-origin", headers: { "content-type": "application/json" } }).catch(() => {});
    } else {
      navigator.sendBeacon?.(ENDPOINT, body);
    }
  } catch {
    // ignoré
  }
}

/**
 * Signal de navigation (layout racine) : une page vue à chaque changement de route (navigations client comprises),
 * puis un signe de vie par minute tant que l'onglet est visible et utilisé. Rien n'est affiché.
 */
export function ActivityBeacon() {
  const pathname = usePathname();
  const lastSent = useRef<string | null>(null);
  const current = useRef(pathname);
  const lastActive = useRef(0);

  useEffect(() => {
    current.current = pathname;
    if (!pathname || pathname === "/admin" || pathname.startsWith("/admin/")) {
      lastSent.current = null;
      return;
    }
    if (lastSent.current === pathname) return; // double effet du mode strict
    lastSent.current = pathname;
    lastActive.current = Date.now();
    send("view", pathname);
  }, [pathname]);

  useEffect(() => {
    const touch = () => {
      lastActive.current = Date.now();
    };
    const tracked = () => {
      const p = current.current;
      return !!p && p !== "/admin" && !p.startsWith("/admin/");
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !tracked()) return;
      touch();
      send("ping", current.current);
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && tracked() && Date.now() - lastActive.current < IDLE_MS) send("ping", current.current);
    }, HEARTBEAT_MS);
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, touch, { passive: true });
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      for (const e of events) window.removeEventListener(e, touch);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
