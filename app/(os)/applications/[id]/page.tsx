"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import ApplicationDrawer from "@/components/ApplicationDrawer";
import HandoffPanel from "@/components/HandoffPanel";
import { peekJson, readJson } from "@/lib/page-cache";
import { applicationOrder } from "@/lib/application-order";
import { checksFor, isLet, toAppRecord } from "@/lib/application-record";
import type { Application } from "@/lib/applications";
import type { PreTenancyDeal } from "@/app/api/pretenancy/deals/route";

/**
 * One let, the whole of it, on one page (James, 12 Oct 2026): clicking a let
 * on the Applications board - at the holding fee or anywhere else - opened a
 * small pop-out saying where it was up to; now it opens here, laid out like a
 * Portfolio home and a listing, with room for a complicated one.
 *
 * The id is an application's (REX's, or the OS's own os:/swap: offer), or a
 * Propoly deal's for a home let through Propoly alone. The application comes
 * from the same book the board reads; Kirstie's deal is matched to it the way
 * the board matches its cards, and arrives after (Propoly is the slow read).
 */

type AppsAnswer = { applications?: Application[]; error?: string };
const APPS_URL = "/api/applications?limit=200";
type Loaded<T> = { state: "loading" } | { state: "ready"; data: T } | { state: "failed"; error: string };

/** The board's own match, from the other side: this application's deal. */
function dealFor(a: Application, deals: PreTenancyDeal[]): PreTenancyDeal | null {
  if (!isLet(a)) return null;
  const name = a.property.trim().toLowerCase();
  return (
    deals.find((d) => a.listingId != null && d.app.listingId != null && Number(d.app.listingId) === a.listingId) ??
    deals.find((d) => d.app.propertyName.trim().toLowerCase() === name) ??
    null
  );
}

export default function LetPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(String(params.id ?? ""));
  const router = useRouter();

  /* The board's last good read paints at once (lib/page-cache). */
  const [apps, setApps] = useState<Loaded<Application[]>>(() => {
    const held = peekJson<AppsAnswer>(APPS_URL)?.applications;
    return held ? { state: "ready", data: held } : { state: "loading" };
  });
  const [deals, setDeals] = useState<Loaded<PreTenancyDeal[]>>({ state: "loading" });
  const [initialTab] = useState<string | null>(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("tab")));
  const [order, setOrder] = useState<string[]>([]);
  useEffect(() => setOrder(applicationOrder()), []);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const j = await readJson<AppsAnswer>(APPS_URL, (r) => !r.error && Array.isArray(r.applications));
        let list = j.applications ?? [];
        /* Asked for by name but not on the board (a let whose move-in has
           passed is cut from it): fetch that one too. */
        if (!list.some((a) => String(a.id) === id)) {
          const more = await fetch(`${APPS_URL}&include=${encodeURIComponent(id)}&tests=0`, { cache: "no-store" })
            .then((r) => r.json() as Promise<AppsAnswer>)
            .catch(() => null);
          const hit = more?.applications?.find((a) => String(a.id) === id);
          if (hit) list = [...list, hit];
        }
        if (live) setApps(j.error && !list.length ? { state: "failed", error: j.error } : { state: "ready", data: list });
      } catch {
        if (live) setApps((cur) => (cur.state === "ready" ? cur : { state: "failed", error: "The applications didn't load. Try again in a minute." }));
      }
    })();
    return () => {
      live = false;
    };
  }, [id]);

  /* Kirstie's deals, as the board reads them. A cold Propoly cache answers
     null: ask again rather than say there is no deal. */
  useEffect(() => {
    let gone = false;
    const load = (attempt: number) =>
      fetch("/api/pretenancy/deals?mine=1", { cache: "no-store" })
        .then((r) => r.json())
        .then((j: { deals?: PreTenancyDeal[] | null; error?: string }) => {
          if (gone) return;
          if (Array.isArray(j.deals)) setDeals({ state: "ready", data: j.deals });
          else if (j.deals === null && attempt < 4) setTimeout(() => load(attempt + 1), 4000);
          else setDeals({ state: "failed", error: j.error ?? "Propoly didn't answer." });
        })
        .catch(() => { if (!gone) setDeals({ state: "failed", error: "Propoly didn't answer." }); });
    load(0);
    return () => {
      gone = true;
    };
  }, []);

  const appRaw = apps.state === "ready" ? apps.data.find((a) => String(a.id) === id) ?? null : null;
  const dealList = deals.state === "ready" ? deals.data : [];
  const deal = useMemo(
    () => (appRaw ? dealFor(appRaw, dealList) : dealList.find((d) => d.app.id === id) ?? null),
    [appRaw, dealList, id]
  );
  /* A deal opened by its own id that has an application: show the application's page. */
  const appForDeal = useMemo(() => {
    if (appRaw || !deal || apps.state !== "ready") return null;
    return apps.data.find((a) => dealFor(a, [deal]) === deal) ?? null;
  }, [appRaw, deal, apps]);
  useEffect(() => {
    if (appForDeal) router.replace(`/applications/${encodeURIComponent(String(appForDeal.id))}`);
  }, [appForDeal, router]);

  const app = useMemo(() => (appRaw ? toAppRecord(appRaw) : null), [appRaw]);
  const checklist = useMemo(() => (appRaw ? checksFor(appRaw) : []), [appRaw]);

  const at = order.indexOf(id);
  const step = useCallback(
    (d: number) => {
      if (at < 0 || order.length < 2) return;
      router.push(`/applications/${encodeURIComponent(order[(at + d + order.length) % order.length])}`);
    },
    [at, order, router]
  );

  const waiting = apps.state === "loading" || (!appRaw && deals.state === "loading") || Boolean(appForDeal);
  if (!app && !deal && waiting) {
    return (
      <p className="flex items-center gap-2 py-16 text-[12.5px] text-muted">
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />
        Opening the let…
      </p>
    );
  }
  if (!app && !deal) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="hand text-[20px]">This let isn&apos;t on your book</p>
        <p className="mt-2 text-[12.5px] text-muted">
          {apps.state === "failed" ? apps.error : "It may belong to another agent, or the link is wrong."}
        </p>
        <Link href="/applications" className="mt-4 inline-block text-[12.5px] underline">Back to Applications</Link>
      </div>
    );
  }

  return (
    <ApplicationDrawer
      key={id}
      app={app}
      deal={deal}
      checklist={checklist}
      /* Only once the offer is accepted - in REX or here. Before that there
         is nothing to push, and offering it invites somebody to jump the gun. */
      aside={appRaw && isLet(appRaw) ? <HandoffPanel applicationId={String(appRaw.id)} /> : undefined}
      initialTab={initialTab}
    />
  );
}
