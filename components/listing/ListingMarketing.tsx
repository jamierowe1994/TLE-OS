"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import DropZone from "@/components/listing/DropZone";
import PortalPreview, { PORTAL_TABS, type Portal } from "@/components/listing/PortalPreview";
import { CHANGE_WORDS, changesIn, draftFrom, fiveWeeks, money, orderedImages, type Draft, type FactField } from "@/components/listing/listing-draft";
import type { ListingDetails } from "@/lib/listing-details";
import { MIN_FEATURES, OPTIONS, REQUIREMENTS, isRequired, type RequirementInput } from "@/lib/listing-requirements";

/**
 * THE MARKETING TAB (15 Sep 2026, second pass after James saw the first).
 *
 * "The first thing you see is a load of negatives" - so it opens on one
 * button, Fill it in for me, and a count of what is done. Everything the
 * portals need is a field, marked Required, and the listing cannot be pushed
 * live until they are all in; there is no list of problems. The magic button
 * looks everything up (lib/listing-autofill) and fills whatever is empty,
 * then the agent checks it and presses Save. Only photos and floor plans are
 * theirs to add.
 *
 * Agents never see the name of the system underneath. Preview on the portals
 * slides the form aside for Rightmove, OnTheMarket and Zoopla.
 */

export type Locks = { listing: boolean; rooms: boolean; media: boolean };

interface Props {
  listingId: string;
  /** The drawer's own read of the same listing, so opening the tab is instant. */
  initial?: { details: ListingDetails; locks: Locks } | null;
  name: string;
  locality: string | null;
  canEdit: boolean;
  lockedNote: string | null;
  onSaved?: (d: ListingDetails) => void;
}

const card = "rounded-[22px] border border-line/50 bg-white p-5";
const eyebrow = "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted";
const fieldCls = "w-full rounded-xl border bg-white px-3.5 py-2.5 text-[13.5px] outline-none transition-colors focus:border-ink disabled:bg-page disabled:text-muted";

const SOURCE_WORDS: Record<string, string> = {
  homesearch: "the property records",
  epc: "the EPC register",
  landlord: "the landlord's answers",
  "last-listing": "the last listing",
  appraisal: "the appraisal",
  market: "the local market",
  photos: "the photos",
};

export default function ListingMarketing({ listingId, initial, canEdit, lockedNote, onSaved }: Props) {
  const [details, setDetails] = useState<ListingDetails | null>(null);
  const [draft, setDraftState] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [portal, setPortal] = useState<Portal>("rightmove");
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [drop, setDrop] = useState<"photos" | "floorplan" | null>(null);
  /** Which fields the magic button filled, and from where. */
  const [filledBy, setFilledBy] = useState<Record<string, string>>({});
  const [filling, setFilling] = useState<"all" | "copy" | null>(null);
  const [fillNote, setFillNote] = useState<string | null>(null);
  const [sources, setSources] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch(`/api/listings/details?id=${encodeURIComponent(listingId)}`, { cache: "no-store" });
      const j = (await r.json()) as { ok?: boolean; details?: ListingDetails; error?: string };
      if (!j.ok || !j.details) throw new Error(j.error ?? "The listing did not load.");
      setDetails(j.details);
      setDraftState(draftFrom(j.details));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The listing did not load.");
    }
  }, [listingId]);
  const seeded = initial?.details.id === listingId ? initial : null;
  useEffect(() => {
    setPreviewing(false);
    setFilledBy({});
    setFillNote(null);
    setSources({});
    if (seeded) {
      setDetails(seeded.details);
      setDraftState(draftFrom(seeded.details));
      return;
    }
    setDetails(null);
    setDraftState(null);
    void load();
    // Seeded once per listing: a later save updates `initial` and must not
    // wipe a draft in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, listingId, Boolean(seeded)]);

  const setDraft = useCallback((fn: (d: Draft) => Draft) => setDraftState((d) => (d ? fn(d) : d)), []);

  if (error && !details) {
    return (
      <div className={`${card} text-center`}>
        <p className="hand text-[18px]">The listing did not load</p>
        <p className="mx-auto mt-1 max-w-md text-[12.5px] text-muted">Nothing is shown rather than an old copy.</p>
        <button type="button" onClick={() => void load()} className="mt-4 rounded-full border border-line/60 px-4 py-2 text-[12.5px] font-semibold">Try again</button>
      </div>
    );
  }
  if (!details || !draft) {
    return (
      <div className={`${card} flex items-center gap-3 text-[12.5px] text-muted`}>
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent-dark" />
        Loading the listing…
      </div>
    );
  }

  const changes = changesIn(details, draft);
  const changed = Object.keys(changes) as (keyof Draft)[];
  const images = orderedImages(details, draft);
  const input: RequirementInput = {
    rent: draft.rent, deposit: draft.deposit, availableFrom: draft.availableFrom, beds: draft.beds, baths: draft.baths,
    propertyType: details.propertyType, heading: draft.heading, body: draft.body, highlights: draft.highlights, photos: images.length,
    councilTaxBand: draft.councilTaxBand, parking: draft.parking, electricity: draft.electricity, water: draft.water,
    sewerage: draft.sewerage, broadband: draft.broadband, heating: draft.heating, furnishing: draft.furnishing,
  };
  const done = REQUIREMENTS.filter((r) => r.ok(input)).length;
  const total = REQUIREMENTS.length;
  const okFor = (id: keyof RequirementInput) => REQUIREMENTS.find((r) => r.id === id)?.ok(input) ?? true;

  async function save() {
    if (!details || !changed.length) return;
    setSaving(true);
    setNote(null);
    try {
      const r = await fetch("/api/listings/details", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: details.id, ...changes, sources }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; details?: ListingDetails | null };
      if (j.details) {
        setDetails(j.details);
        setDraftState((d) => (d && !j.ok ? d : draftFrom(j.details!)));
        onSaved?.(j.details);
      }
      if (j.ok) {
        setFilledBy({});
        setSources({});
      }
      setNote(j.ok ? { tone: "good", text: "Saved. Live adverts update within about 10 minutes." } : { tone: "bad", text: j.error ?? "That did not save." });
    } catch {
      setNote({ tone: "bad", text: "The connection dropped. Nothing is lost here - try again." });
    } finally {
      setSaving(false);
    }
  }

  /** The magic button. "all" fills only what is empty; "copy" rewrites the advert. */
  async function fill(mode: "all" | "copy") {
    if (!details) return;
    setFilling(mode);
    setFillNote(null);
    try {
      const r = await fetch("/api/listings/autofill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: details.id }),
      });
      const j = (await r.json()) as {
        ok?: boolean; error?: string; facts?: Record<string, string | number>; sources?: Record<string, string>;
        heading?: string | null; body?: string | null; highlights?: string[]; looked?: string[]; notes?: string[];
      };
      if (!j.ok) throw new Error(j.error ?? "The lookup did not finish.");
      const marks: Record<string, string> = {};
      const src: Record<string, string> = {};
      const base = draft!;
      const next = { ...base } as Draft & Record<string, unknown>;
      if (mode === "all") {
        for (const [k, v] of Object.entries(j.facts ?? {})) {
          if (!(k in next) || v == null || j.sources?.[k] === "agent") continue;
          if (next[k] == null || next[k] === "") {
            next[k] = v;
            marks[k] = SOURCE_WORDS[j.sources?.[k] ?? ""] ?? "the lookup";
            if (j.sources?.[k]) src[k] = j.sources[k];
          }
        }
      }
      const rewrite = mode === "copy";
      if (j.heading && (rewrite || !next.heading.trim())) { next.heading = j.heading; marks.heading = "the photos and the facts"; }
      if (j.body && (rewrite || next.body.trim().length < 80)) { next.body = j.body; marks.body = "the photos and the facts"; }
      if (j.highlights?.length && (rewrite || next.highlights.filter((h) => h.trim()).length < MIN_FEATURES)) {
        next.highlights = j.highlights;
        marks.highlights = "the photos and the facts";
      }
      setDraftState(next);
      setFilledBy((m) => ({ ...m, ...marks }));
      setSources((s) => ({ ...s, ...src }));
      const n = Object.keys(marks).length;
      const from = (j.looked ?? []).map((w) => (w === "Homesearch" ? "the property records" : w));
      setFillNote(
        n
          ? `Filled in ${n} thing${n === 1 ? "" : "s"}${from.length ? ` from ${from.length > 1 ? `${from.slice(0, -1).join(", ")} and ${from.at(-1)}` : from[0]}` : ""}. Check them, then Save.`
          : "Everything we could find was already filled in."
      );
    } catch (e) {
      setFillNote(e instanceof Error ? e.message : "The lookup did not finish.");
    } finally {
      setFilling(null);
    }
  }

  async function sendToListing(kind: "photo" | "floorplan", key?: string): Promise<string> {
    if (!key) return "Saved here, and could not be added to the listing.";
    const r = await fetch("/api/listings/media", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: details!.id, kind, key }),
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; details?: ListingDetails | null };
    if (j.ok && j.details) {
      const fresh = j.details;
      setDetails(fresh);
      setDraftState((d) => (d ? { ...d, imageOrder: [...d.imageOrder, ...fresh.images.map((i) => i.id).filter((id) => !d.imageOrder.includes(id))] } : d));
      onSaved?.(fresh);
      return "Added";
    }
    return j.error ?? "It did not go on the listing.";
  }

  /* ── pieces ────────────────────────────────────────────────────────── */

  const sparkle = (id: string) =>
    filledBy[id] ? (
      <span title={`Filled in from ${filledBy[id]}`} className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-accent-soft px-1.5 py-px align-middle text-[9.5px] font-semibold normal-case tracking-normal text-accent-dark">
        <DoodleIcon name="magic-wand" size={9} /> filled in
      </span>
    ) : null;

  const label = (id: string, children: ReactNode) => (
    <span className="flex items-center text-[11px] text-muted">
      {children}
      {isRequired(id) && <span aria-label="required" className="ml-0.5 text-accent-dark">*</span>}
      {sparkle(id)}
    </span>
  );

  /* An empty required field is a soft blush edge, not a red error. */
  const edge = (id: string) => (isRequired(id) && !okFor(id as keyof RequirementInput) ? "border-accent/45" : "border-line/70");

  const select = (id: FactField, text: string) => (
    <label className="block min-w-0">
      {label(id, text)}
      <select
        disabled={!canEdit}
        value={draft[id] ?? ""}
        onChange={(e) => setDraft((d) => ({ ...d, [id]: e.target.value || null }))}
        className={`${fieldCls} mt-1 appearance-none bg-[length:11px] bg-[right_13px_center] bg-no-repeat pr-8 ${edge(id)} ${draft[id] ? "" : "text-muted"}`}
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%23888' stroke-width='1.6'/%3E%3C/svg%3E\")" }}
      >
        <option value="">Choose…</option>
        {(OPTIONS[id] as readonly string[]).map((o) => <option key={o} value={o}>{id === "councilTaxBand" && o !== "Exempt" ? `Band ${o}` : o}</option>)}
      </select>
    </label>
  );

  const stepper = (key: "beds" | "baths" | "receptions", text: string) => (
    <div className="flex items-center justify-between gap-3 py-2">
      {label(key, <span className="text-[12.5px] text-ink">{text}</span>)}
      <span className="flex items-center gap-1">
        <button type="button" disabled={!canEdit} aria-label={`Fewer ${text.toLowerCase()}`} onClick={() => setDraft((d) => ({ ...d, [key]: Math.max(0, (d[key] ?? 1) - 1) }))} className="flex h-7 w-7 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted hover:border-ink/40 hover:text-ink disabled:opacity-40">−</button>
        <span className="figures w-7 text-center text-[14px] font-semibold">{draft[key] ?? "–"}</span>
        <button type="button" disabled={!canEdit} aria-label={`More ${text.toLowerCase()}`} onClick={() => setDraft((d) => ({ ...d, [key]: (d[key] ?? 0) + 1 }))} className="flex h-7 w-7 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted hover:border-ink/40 hover:text-ink disabled:opacity-40">+</button>
      </span>
    </div>
  );

  const pounds = (key: "rent" | "deposit", text: string) => (
    <label className="block min-w-0">
      {label(key, text)}
      <div className="relative mt-1">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[13.5px] text-muted">£</span>
        <input type="number" min={0} disabled={!canEdit} value={draft[key] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value))) }))} className={`${fieldCls} pl-7 ${edge(key)}`} />
      </div>
    </label>
  );

  const ring = (
    <div className="relative h-14 w-14 shrink-0" role="img" aria-label={`${done} of ${total} done`}>
      <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90">
        <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3" className="text-line/50" />
        <circle cx="18" cy="18" r="15.5" fill="none" stroke="#56634a" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(done / total) * 97.4} 97.4`} className="transition-[stroke-dasharray] duration-700" />
      </svg>
      <span className="figures absolute inset-0 flex items-center justify-center text-[12px] font-semibold">{done}/{total}</span>
    </div>
  );

  /* ── the form ──────────────────────────────────────────────────────── */

  const editor = (
    <div className="space-y-5">
      <section className={`${card} bg-linear-to-r from-white to-accent-soft/40`}>
        <div className="flex flex-wrap items-center gap-4">
          {ring}
          <div className="min-w-0 flex-1 basis-60">
            <p className="hand text-[18px] leading-tight">{done === total ? "Ready for the portals" : "Let us fill this in"}</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
              {done === total
                ? "Everything the portals need is here. Preview it, then push it live."
                : "We read the photos, the last listing, the landlord's answers and the local market, and fill in everything we can. Photos and floor plans are yours."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <button
                type="button"
                onClick={() => void fill("all")}
                disabled={filling !== null}
                className="press-ring flex items-center gap-2 rounded-full bg-[var(--brown)] px-5 py-2.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-70"
              >
                {filling === "all" ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <DoodleIcon name="magic-wand" size={14} />}
                {filling === "all" ? "Looking it all up…" : "Fill it in for me"}
              </button>
            )}
            <button type="button" onClick={() => setPreviewing(true)} className="flex items-center gap-2 rounded-full border border-line/60 bg-white px-4 py-2.5 text-[12.5px] font-semibold hover:border-ink/40">
              <DoodleIcon name="megaphone" size={13} />
              Preview on the portals
            </button>
          </div>
        </div>
        {fillNote && <p className="mt-3 border-t border-line/40 pt-2.5 text-[12px] text-muted">{fillNote}</p>}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={card}>
          <p className={eyebrow}>The home</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            {label("propertyType", <span className="text-[12.5px] text-ink">Property type</span>)}
            <span className="text-[13px] font-semibold">{details.propertyType ?? "–"}</span>
          </div>
          <div className="mt-1 divide-y divide-line/40">
            {stepper("beds", "Bedrooms")}
            {stepper("baths", "Bathrooms")}
            {stepper("receptions", "Receptions")}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {select("furnishing", "Furnishing")}
            {select("outsideSpace", "Outside space")}
            {select("pets", "Pets")}
            <label className="block min-w-0">
              {label("floorAreaSqft", "Floor area, sq ft")}
              <input type="number" min={0} disabled={!canEdit} value={draft.floorAreaSqft ?? ""} onChange={(e) => setDraft((d) => ({ ...d, floorAreaSqft: e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value))) }))} className={`${fieldCls} mt-1 border-line/70`} />
            </label>
          </div>
        </section>

        <section className={card}>
          <p className={eyebrow}>The let</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {pounds("rent", "Rent, pcm")}
            {pounds("deposit", "Deposit")}
            <label className="block min-w-0">
              {label("availableFrom", "Available from")}
              <input type="date" disabled={!canEdit} value={draft.availableFrom ?? ""} onChange={(e) => setDraft((d) => ({ ...d, availableFrom: e.target.value || null }))} className={`${fieldCls} mt-1 ${edge("availableFrom")}`} />
            </label>
            <div className="min-w-0">
              <span className="text-[11px] text-muted">Status</span>
              <p className="mt-1 py-2.5 text-[13.5px] font-semibold">{details.status === "published" ? "Live on the portals" : "Draft"}</p>
            </div>
          </div>
          {fiveWeeks(draft.rent) != null && draft.deposit != null && draft.deposit > fiveWeeks(draft.rent)! && (
            <p className="mt-2 text-[11.5px] text-accent-dark">More than five weeks&apos; rent ({money(fiveWeeks(draft.rent))}), the legal cap on this deposit.</p>
          )}
          {(details.letType || details.service) && (
            <p className="mt-3 border-t border-line/50 pt-2.5 text-[10.5px] text-muted">{[details.letType, details.service].filter(Boolean).join(" · ")}</p>
          )}
        </section>
      </div>

      <section className={card}>
        <p className={eyebrow}>Bills and services</p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {select("councilTaxBand", "Council tax")}
          {select("heating", "Heating")}
          {select("parking", "Parking")}
          {select("broadband", "Broadband")}
          {select("electricity", "Electricity")}
          {select("water", "Water")}
          {select("sewerage", "Sewerage")}
        </div>
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={eyebrow}>The advert</p>
          {canEdit && (
            <button type="button" onClick={() => void fill("copy")} disabled={filling !== null} className="flex items-center gap-1.5 rounded-full border border-line/60 px-3.5 py-1.5 text-[12px] font-semibold hover:border-ink/40 disabled:opacity-60">
              {filling === "copy" ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-line border-t-accent-dark" /> : <DoodleIcon name="magic-wand" size={12} />}
              {filling === "copy" ? "Writing…" : draft.body ? "Rewrite the advert" : "Write the advert"}
            </button>
          )}
        </div>
        <label className="mt-3 block">
          {label("heading", "Headline")}
          <input maxLength={255} disabled={!canEdit} value={draft.heading} onChange={(e) => setDraft((d) => ({ ...d, heading: e.target.value }))} placeholder="What it is and where - the line the portals show first" className={`${fieldCls} mt-1 font-semibold ${edge("heading")}`} />
        </label>
        <label className="mt-3 block">
          {label("body", "Description")}
          <textarea rows={10} disabled={!canEdit} value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} placeholder="Where it is, what it's like, what's nearby…" className={`${fieldCls} mt-1 resize-y leading-relaxed ${edge("body")}`} />
        </label>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center text-[11px] text-muted">
            Key features · {draft.highlights.filter((h) => h.trim()).length} of 10
            {isRequired("highlights") && <span className="ml-0.5 text-accent-dark">*</span>}
            {sparkle("highlights")}
          </p>
          {canEdit && draft.highlights.length < 10 && (
            <button type="button" onClick={() => setDraft((d) => ({ ...d, highlights: [...d.highlights, ""] }))} className="rounded-full border border-line/60 px-3 py-1 text-[11.5px] font-semibold hover:border-ink/40">Add one</button>
          )}
        </div>
        {draft.highlights.length ? (
          <ol className="mt-2 grid gap-2 sm:grid-cols-2">
            {draft.highlights.map((h, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="figures w-5 shrink-0 text-right text-[11px] text-muted">{i + 1}</span>
                <input maxLength={200} disabled={!canEdit} value={h} onChange={(e) => setDraft((d) => ({ ...d, highlights: d.highlights.map((x, k) => (k === i ? e.target.value : x)) }))} className={`${fieldCls} border-line/70 py-2 text-[13px]`} />
                {canEdit && (
                  <button type="button" aria-label={`Remove feature ${i + 1}`} onClick={() => setDraft((d) => ({ ...d, highlights: d.highlights.filter((_, k) => k !== i) }))} className="shrink-0 rounded-full px-2 text-muted hover:text-ink">✕</button>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-[12px] text-muted">The bullet points under the price. Fill it in for me writes them from the photos and the facts.</p>
        )}
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={`${eyebrow} flex items-center`}>Photos · {images.length}{isRequired("photos") && <span className="ml-0.5 text-accent-dark">*</span>}</p>
          {canEdit && (
            <button type="button" onClick={() => setDrop("photos")} className="flex items-center gap-2 rounded-full bg-[var(--brown)] px-4 py-2 text-[12.5px] font-semibold text-white hover:opacity-90">
              <DoodleIcon name="upload" size={13} />
              Add photos
            </button>
          )}
        </div>
        {images.length ? (
          <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-6">
            {images.map((img, i) => (
              <div key={img.id} className="group relative overflow-hidden rounded-xl border border-line/50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.thumb} alt="" className="aspect-[4/3] w-full object-cover" />
                {i === 0 ? (
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-ink/80 px-2 py-0.5 text-[10px] font-semibold text-white">Main photo</span>
                ) : (
                  canEdit && (
                    <button type="button" onClick={() => setDraft((d) => ({ ...d, imageOrder: [img.id, ...images.map((x) => x.id).filter((x) => x !== img.id)] }))} className="absolute inset-x-1.5 bottom-1.5 rounded-full bg-white/95 py-1 text-[10.5px] font-semibold opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100">
                      Make main photo
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
        ) : (
          <button type="button" disabled={!canEdit} onClick={() => setDrop("photos")} className="mt-4 flex w-full flex-col items-center rounded-2xl border-2 border-dashed border-line/70 bg-page px-6 py-8 text-center hover:border-accent-dark/60">
            <span className="hand text-[16px]">Drop the photos here</span>
            <span className="mt-1 text-[12px] text-muted">The first one is the main photo on every portal.</span>
          </button>
        )}
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={eyebrow}>Floor plans · {details.floorplans.length} of 5</p>
          {canEdit && details.floorplans.length < 5 && (
            <button type="button" onClick={() => setDrop("floorplan")} className="flex items-center gap-2 rounded-full border border-line/60 px-4 py-2 text-[12.5px] font-semibold hover:border-ink/40">
              <DoodleIcon name="upload" size={13} />
              Add floor plan
            </button>
          )}
        </div>
        {details.floorplans.length ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {details.floorplans.map((f) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={f.id} src={f.thumb} alt="" className="aspect-square w-full rounded-xl border border-line/50 bg-white object-contain" />
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[12.5px] text-muted">Rightmove shows a Floorplan button on the gallery when there is one.</p>
        )}
      </section>
    </div>
  );

  const preview = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => setPreviewing(false)} className="flex items-center gap-2 rounded-full border border-line/60 bg-white px-4 py-2 text-[12.5px] font-semibold hover:border-ink/40">
          <span aria-hidden>←</span> Back to marketing
        </button>
        <div role="tablist" aria-label="Portal" className="flex overflow-hidden rounded-full border border-line/70 bg-white p-1">
          {PORTAL_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={portal === t.id}
              onClick={() => setPortal(t.id)}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${portal === t.id ? "bg-ink text-page" : "text-muted hover:text-ink"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.logo} alt="" className="h-4 w-4 rounded-sm object-contain" />
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[11.5px] text-muted">A close likeness of each portal&apos;s page.{canEdit ? " Click anything with a dashed outline to change it." : ""}</p>
      <PortalPreview portal={portal} details={details} draft={draft} setDraft={setDraft} canEdit={canEdit} onAddPhotos={() => setDrop("photos")} />
    </div>
  );

  return (
    <div className="relative">
      {!canEdit && lockedNote && <p className="mb-4 rounded-2xl border border-line/60 bg-white px-4 py-2.5 text-[12px] text-muted">{lockedNote}</p>}
      {/* The two faces share one cell, so the slide never jumps the page. */}
      <div className="grid overflow-hidden">
        <div
          aria-hidden={previewing}
          className={`[grid-area:1/1] transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${previewing ? "pointer-events-none -translate-x-[12%] opacity-0" : "translate-x-0 opacity-100"}`}
          style={previewing ? { visibility: "hidden", transitionProperty: "transform, opacity, visibility", transitionDelay: "0s, 0s, 500ms" } : undefined}
        >
          {editor}
        </div>
        <div
          aria-hidden={!previewing}
          className={`[grid-area:1/1] transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${previewing ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-[12%] opacity-0"}`}
          style={!previewing ? { visibility: "hidden", height: 0, overflow: "hidden" } : undefined}
        >
          {previewing && preview}
        </div>
      </div>

      {(changed.length > 0 || note) && (
        <div className="sticky bottom-3 z-10 mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-line/60 bg-white/95 px-4 py-3 shadow-[0_18px_40px_-20px_rgba(0,0,0,0.35)] backdrop-blur">
          <p className={`min-w-0 flex-1 text-[12px] leading-snug ${note?.tone === "bad" ? "text-accent-dark" : "text-muted"}`}>
            {changed.length > 0 ? `Not saved yet: ${changed.map((k) => CHANGE_WORDS[k]).join(", ")}.${note?.tone === "bad" ? ` ${note.text}` : ""}` : note?.text}
          </p>
          {changed.length > 0 ? (
            <>
              <button type="button" disabled={saving} onClick={() => { setDraftState(draftFrom(details)); setFilledBy({}); setNote(null); }} className="rounded-full border border-line/60 px-4 py-2 text-[12.5px] font-semibold disabled:opacity-50">
                Discard
              </button>
              <button type="button" disabled={saving || !canEdit} onClick={() => void save()} className="rounded-full bg-[var(--brown)] px-5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-60">
                {saving ? "Saving…" : "Save"}
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setNote(null)} className="rounded-full px-3 py-1 text-[12px] text-muted hover:text-ink">Dismiss</button>
          )}
        </div>
      )}

      {drop && (
        <DropZone
          kind={drop}
          refId={`listing-${details.id}`}
          propertyId={details.propertyId}
          address={details.address}
          onClose={() => setDrop(null)}
          afterUpload={(f) => sendToListing(drop === "photos" ? "photo" : "floorplan", f.key)}
        />
      )}
    </div>
  );
}
