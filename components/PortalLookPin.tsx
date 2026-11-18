"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * The portals' half of the look switch (lib/portal-look decides on the server).
 *
 *  - `?look=new|old` pins this browser either way, `?look=auto` lets the
 *    switch decide again; the page is redrawn once if that changed anything.
 *  - Sheets and pop-ups are drawn straight onto <body>, outside the portal's
 *    own wrapper, so the answer is mirrored onto <html> for them too.
 */
const PIN = "os-portal-look";

export default function PortalLookPin({ on }: { on: boolean }) {
  const router = useRouter();

  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get("look");
    const had = document.cookie.match(new RegExp(`(?:^|; )${PIN}=([^;]*)`))?.[1] ?? null;
    let next = had;
    if (want === "new" || want === "old") next = want;
    if (want === "auto") next = null;
    if (next === had) return;
    document.cookie = next
      ? `${PIN}=${next}; path=/; max-age=${60 * 60 * 24 * 90}; samesite=lax`
      : `${PIN}=; path=/; max-age=0; samesite=lax`;
    router.refresh();
  }, [router]);

  useEffect(() => {
    const root = document.documentElement;
    if (on) root.setAttribute("data-portal-look", "new");
    else root.removeAttribute("data-portal-look");
    return () => root.removeAttribute("data-portal-look");
  }, [on]);

  return null;
}
