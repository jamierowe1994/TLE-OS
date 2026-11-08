"use client";

import { useEffect } from "react";
import { fileFromHref, openDocument } from "@/lib/doc-sheet";

/**
 * Mounted once in the OS layout (James, 8 Nov 2026: a file should open in
 * the OS, "not off of the OS ... we want this to be really slick"). Any
 * click on a link to a file - certificates, documents, the File Store -
 * opens the document sheet instead of a new tab, with Download there. A
 * cmd/ctrl/shift click still opens a tab for whoever wants one, and a link
 * marked `download` (or ?save=1) still downloads.
 *
 * window.open is caught the same way for the screens that open a file from
 * code rather than a link.
 */
export default function FileClickCatcher() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.hasAttribute("download") || a.dataset.leave === "1") return;
      const doc = fileFromHref(a.getAttribute("href") ?? "");
      if (!doc) return;
      e.preventDefault();
      e.stopPropagation();
      openDocument({ ...doc, label: a.dataset.label || doc.label, property: a.dataset.property || null });
    };
    document.addEventListener("click", onClick, true);

    const original = window.open.bind(window);
    window.open = ((url?: string | URL, target?: string, features?: string) => {
      const doc = url ? fileFromHref(String(url)) : null;
      if (doc) {
        openDocument(doc);
        return null;
      }
      return original(url, target, features);
    }) as typeof window.open;

    return () => {
      document.removeEventListener("click", onClick, true);
      window.open = original;
    };
  }, []);
  return null;
}
