"use client";

import { useEffect } from "react";

/**
 * A file opened on screen, for Recent in Search (lib/search-recent, 15 Oct
 * 2026). The ref is search's own row id: "lead:<id>", "home:<listing id>",
 * "listing:<id>", "app:<id>", "deal:<id>", "ma:<id>", "cert:<property id>",
 * "insp:<id>", "inv:<id>", "wo:<id>".
 *
 * Fire and forget: a visit that fails to save never gets in the way of the
 * file. The same file again inside half a minute (a drawer re-rendering, a
 * tab change on the page) is not sent twice.
 */

let last = { ref: "", at: 0 };

export function noteVisit(ref: string | null | undefined) {
  if (!ref) return;
  const now = Date.now();
  if (last.ref === ref && now - last.at < 30_000) return;
  last = { ref, at: now };
  fetch("/api/search/recent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ref }),
    keepalive: true,
  }).catch(() => {});
}

/** Note a visit whenever this ref is on screen. */
export function useNoteVisit(ref: string | null | undefined) {
  useEffect(() => {
    noteVisit(ref);
  }, [ref]);
}

/** The files that are pages of their own, read off the address. */
export function refFromPath(pathname: string | null): string | null {
  if (!pathname) return null;
  const seg = pathname.split("/").filter(Boolean).map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });
  if (seg[0] === "portfolio" && seg.length === 2) return `home:${seg[1]}`;
  if (seg[0] === "listings" && seg.length === 2) return `listing:${seg[1]}`;
  if (seg[0] === "applications" && seg.length === 2 && seg[1] !== "flatfair" && seg[1] !== "updates") return `app:${seg[1]}`;
  if (seg[0] === "market-appraisals" && seg.length >= 2) return `ma:${seg[1]}`;
  if (seg[0] === "maintenance" && seg[1] === "invoices" && seg.length === 3) return `inv:${seg[2]}`;
  return null;
}
