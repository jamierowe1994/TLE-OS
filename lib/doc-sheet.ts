"use client";

import { useSyncExternalStore } from "react";

/**
 * The document sheet: one place, page-wide, that shows a certificate.
 *
 * James, 6 Sep 2026: opening a file should not leave the screen. Click the
 * certificate and the drawer you were in slides off to the right while the
 * document comes up from the bottom; close it and the document goes back
 * down as the drawer slides in again. Every drawer reads `useDocumentOpen`
 * to know when to move aside; PropertyFile calls `openDocument`.
 */

export interface SheetDocument {
  /** The vault key: documents/compliance-<property>-<certKey>/<file>. */
  key: string;
  name: string;
  /** What it is: "Gas safety (CP12)". */
  label: string;
  /** The home it belongs to, when the caller knows it. */
  property?: string | null;
  /** Where to load it from (the signed redirect). */
  url: string;
}

let current: SheetDocument | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function openDocument(doc: SheetDocument) {
  current = doc;
  emit();
}

export function closeDocument() {
  current = null;
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};

export function useDocument(): SheetDocument | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

/** True while a document is up, so a drawer can slide out of the way. */
export function useDocumentOpen(): boolean {
  return useSyncExternalStore(subscribe, () => current != null, () => false);
}

/* ── Any file link opens here (James, 8 Nov 2026: "Anytime we're in
   compliance or documents or anything and we click a file, it should open
   up in the OS, not off of the OS") ─────────────────────────────────────── */

const FILE_EXT = /\.(pdf|png|jpe?g|gif|webp|heic|jfif|docx?|xlsx?|csv|txt)$/i;

/**
 * A link that is a file, as the sheet should show it; null for anything
 * else (a page, a map, a download someone asked for on purpose). Kept
 * narrow: our own signed-file routes, a stored-file host, or a path that
 * ends in a document's extension.
 */
export function fileFromHref(href: string): SheetDocument | null {
  let u: URL;
  try {
    u = new URL(href, window.location.href);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.searchParams.get("save") === "1" || u.searchParams.get("bytes") === "1") return null;
  const same = u.origin === window.location.origin;
  const ours =
    (same && (u.pathname === "/api/r2/file" || u.pathname.startsWith("/library/") || u.pathname === "/api/tools/learning/open" || u.pathname.startsWith("/api/my/property-files/") || u.pathname.startsWith("/api/tenant/documents/"))) ||
    /\.r2\.cloudflarestorage\.com$|\.r2\.dev$/.test(u.hostname);
  const last = decodeURIComponent(u.pathname.slice(u.pathname.lastIndexOf("/") + 1));
  if (!ours && !FILE_EXT.test(last)) return null;
  const key = same && u.pathname === "/api/r2/file" ? u.searchParams.get("key") ?? "" : "";
  const rawName = key ? key.slice(key.lastIndexOf("/") + 1) : last || "Document";
  const name = rawName.replace(/^\d{10,}-/, "");
  return { key, name, label: "Document", url: u.href };
}

/** Whether the sheet can draw this file itself, or only offer Download. */
export function canShow(name: string): boolean {
  return !/\.(docx?|xlsx?|csv)$/i.test(name);
}
