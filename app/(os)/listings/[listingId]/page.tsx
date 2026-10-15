"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import ListingDrawer, { type Listing } from "@/components/ListingDrawer";
import { peekJson, readJson } from "@/lib/page-cache";
import { listingOrder } from "@/lib/listing-order";
import type { ArchiveReason } from "@/lib/listing-archive";

/**
 * One listing, the whole of it, on one page.
 *
 * James, 12 Oct 2026: Listings had "so many boxes" that nobody could tell
 * where to look, and Portfolio's property page draws the eye to what matters -
 * the photos and the home, the actions on the right, next up beside the
 * facts. So a listing opens here now, laid out the same way, instead of in
 * the slide-out. The record itself is components/ListingDrawer; this page
 * finds the listing in the same book the board reads and hands it over.
 *
 * Nothing is a sample: the book is the board's live read, and a listing that
 * is not in it is looked for in the archive before the page says it is gone.
 */

type Book = { ok?: boolean; live?: boolean; listings?: Listing[]; reason?: string };
type Found = { state: "loading" } | { state: "missing"; reason?: string } | { state: "ready"; listing: Listing };

export default function ListingPage() {
  const params = useParams<{ listingId: string }>();
  const listingId = decodeURIComponent(String(params.listingId ?? ""));
  const router = useRouter();

  /* The board's last good read paints at once (lib/page-cache). */
  const [found, setFound] = useState<Found>(() => {
    const held = peekJson<Book>("/api/listings");
    const hit = held?.listings?.find((l) => String(l.id) === listingId);
    return hit ? { state: "ready", listing: hit } : { state: "loading" };
  });
  /* Read once, so a link straight to ?tab=marketing lands on Marketing.
     From the router, not window.location: arriving by a client navigation
     (a row on Offers in, 15 Oct 2026) the page renders before the address
     bar changes, so window.location still held the board's own address. */
  const search = useSearchParams();
  const [initialTab] = useState<string | null>(() => search.get("tab"));
  /* One offer to open on the listing's Offers (?offer=, from Offers in). */
  const [initialOffer] = useState<string | null>(() => search.get("offer"));
  const [order, setOrder] = useState<string[]>([]);
  useEffect(() => setOrder(listingOrder()), []);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const j = await readJson<Book>("/api/listings", (r) => Boolean(r.ok && r.live && Array.isArray(r.listings)));
        const hit = j.listings?.find((l) => String(l.id) === listingId);
        if (hit) {
          if (live) setFound({ state: "ready", listing: hit });
          return;
        }
        /* Not in the working book: a withdrawn listing never was, so look in
           the archive before saying it is gone. */
        const a = await fetch("/api/listings/archive", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
        const old = (a?.listings as Listing[] | undefined)?.find((l) => String(l.id) === listingId);
        if (live) setFound(old ? { state: "ready", listing: old } : { state: "missing", reason: j.ok && j.live ? undefined : j.reason });
      } catch {
        if (live) setFound((f) => (f.state === "ready" ? f : { state: "missing", reason: "We couldn't read your listings just now. Nothing is lost - try again in a minute." }));
      }
    })();
    return () => {
      live = false;
    };
  }, [listingId]);

  /* An accepted offer hands the home to Applications: it reads as let agreed
     here, as it does on the board (6 Oct 2026). */
  const [accepted, setAccepted] = useState(false);
  useEffect(() => {
    let live = true;
    fetch("/api/activity", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => live && d.ok && setAccepted((d.accepted ?? []).map(String).includes(listingId)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [listingId]);

  /* Filing a draft away, or bringing it back - the board's call, made here. */
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const move = useCallback(async (id: string, action: "archive" | "restore") => {
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch("/api/listings/archive", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string; state?: { archived: boolean; reason: ArchiveReason | null; since: string | null; ageDays: number | null } };
      if (!j.ok) throw new Error(j.error ?? "That didn't save.");
      const st = j.state;
      if (st) setFound((f) => (f.state === "ready" ? { state: "ready", listing: { ...f.listing, archived: st.archived, archiveReason: st.reason, archivedSince: st.since, archiveAgeDays: st.ageDays } } : f));
    } catch (e) {
      setNote(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }, []);

  const listing = useMemo(() => {
    if (found.state !== "ready") return null;
    return accepted && !found.listing.letAgreed ? { ...found.listing, letAgreed: true } : found.listing;
  }, [found, accepted]);

  const at = order.indexOf(listingId);
  const step = useCallback(
    (d: number) => {
      if (at < 0 || order.length < 2) return;
      router.push(`/listings/${encodeURIComponent(order[(at + d + order.length) % order.length])}`);
    },
    [at, order, router]
  );

  if (found.state === "loading") {
    return (
      <p className="flex items-center gap-2 py-16 text-[12.5px] text-muted">
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />
        Opening the listing…
      </p>
    );
  }
  if (found.state === "missing" || !listing) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="hand text-[20px]">This listing isn&apos;t in your book</p>
        <p className="mt-2 text-[12.5px] text-muted">{(found.state === "missing" && found.reason) || "It may belong to another agent, or the link is wrong."}</p>
        <Link href="/listings" className="mt-4 inline-block text-[12.5px] underline">Back to Listings</Link>
      </div>
    );
  }

  return (
    <>
      {note && <p className="mb-3 rounded-xl border border-accent-dark/40 bg-accent-soft/40 px-4 py-2.5 text-[12.5px]">{note}</p>}
      <ListingDrawer
        key={listing.id}
        listing={listing}
        initialTab={initialTab}
        initialOffer={initialOffer}
        onArchive={(id, action) => void move(id, action)}
        archiveBusy={busy}
      />
    </>
  );
}
