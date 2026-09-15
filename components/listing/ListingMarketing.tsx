"use client";

import { useCallback, useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import DropZone from "@/components/listing/DropZone";
import PortalPreview, { PORTAL_TABS, type Portal } from "@/components/listing/PortalPreview";
import { CHANGE_WORDS, changesIn, draftFrom, fiveWeeks, money, orderedImages, type Draft } from "@/components/listing/listing-draft";
import type { ListingDetails } from "@/lib/listing-details";

/**
 * THE MARKETING TAB, READ LIVE FROM REX AND SAVED BACK TO IT (15 Sep 2026).
 *
 * What it replaced showed the rooms as blank pickers held only in the
 * browser, the rent and dates as read-only facts off a cached book, and
 * photos that went to our own storage and never reached REX. Everything here
 * is REX's own record, one listing at a time, and one Save writes the changes.
 *
 * "Preview on the portals" slides the form aside for Rightmove, OnTheMarket
 * and Zoopla drawn from the same draft, editable where you see it.
 */

interface Props {
  listingId: string;
  /** The drawer's own read of the same listing, so opening the tab is instant. */
  initial?: { details: ListingDetails; locks: Locks } | null;
  name: string;
  locality: string | null;
  /** The "Edit the advert into REX" switch allows this person to save. */
  canEdit: boolean;
  /** Said when they cannot. */
  lockedNote: string | null;
  /** The drawer keeps its readiness ticks and header in step with a save. */
  onSaved?: (d: ListingDetails) => void;
}

export type Locks = { listing: boolean; rooms: boolean; media: boolean };

const card = "rounded-[22px] border border-line/50 bg-white p-5";
const eyebrow = "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted";
const field = "w-full rounded-xl border border-line/70 bg-white px-3.5 py-2.5 text-[13.5px] outline-none focus:border-ink disabled:bg-page disabled:text-muted";

export default function ListingMarketing({ listingId, initial, name, locality, canEdit, lockedNote, onSaved }: Props) {
  const [details, setDetails] = useState<ListingDetails | null>(null);
  const [locks, setLocks] = useState<Locks | null>(null);
  const [draft, setDraftState] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [portal, setPortal] = useState<Portal>("rightmove");
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [drop, setDrop] = useState<"photos" | "floorplan" | null>(null);
  const [writing, setWriting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch(`/api/listings/details?id=${encodeURIComponent(listingId)}`, { cache: "no-store" });
      const j = (await r.json()) as { ok?: boolean; details?: ListingDetails; locks?: Locks; error?: string };
      if (!j.ok || !j.details) throw new Error(j.error ?? "REX did not answer.");
      setDetails(j.details);
      setLocks(j.locks ?? null);
      setDraftState(draftFrom(j.details));
    } catch (e) {
      setError(e instanceof Error ? e.message : "REX did not answer.");
    }
  }, [listingId]);
  const seeded = initial?.details.id === listingId ? initial : null;
  useEffect(() => {
    setPreviewing(false);
    if (seeded) {
      setDetails(seeded.details);
      setLocks(seeded.locks);
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
        <p className="hand text-[18px]">REX did not answer</p>
        <p className="mx-auto mt-1 max-w-md text-[12.5px] text-muted">{error} Nothing is shown rather than an old copy.</p>
        <button type="button" onClick={() => void load()} className="mt-4 rounded-full border border-line/60 px-4 py-2 text-[12.5px] font-semibold">Try again</button>
      </div>
    );
  }
  if (!details || !draft) {
    return (
      <div className={`${card} flex items-center gap-3 text-[12.5px] text-muted`}>
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent-dark" />
        Reading the advert from REX…
      </div>
    );
  }

  const changes = changesIn(details, draft);
  const changed = Object.keys(changes) as (keyof Draft)[];
  const images = orderedImages(details, draft);
  const blockers = [...new Set([...details.blockers.publish, ...details.blockers.portals])];
  const gaps = [
    ["council tax band", details.councilTaxBand],
    ["electricity", details.material.electricity],
    ["water", details.material.water],
    ["sewerage", details.material.sewerage],
    ["broadband", details.material.broadband],
    ["parking", details.parking],
  ].filter(([, v]) => !v).map(([k]) => k as string);

  async function save() {
    if (!details || !changed.length) return;
    setSaving(true);
    setNote(null);
    try {
      const r = await fetch("/api/listings/details", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: details.id, ...changes }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; details?: ListingDetails | null };
      if (j.details) {
        setDetails(j.details);
        /* Keep anything REX refused in the draft, so a locked half is not
           lost: only fields REX now agrees with drop out of "changed". */
        setDraftState((d) => (d && !j.ok ? d : draftFrom(j.details!)));
        onSaved?.(j.details);
      }
      setNote(j.ok ? { tone: "good", text: "Saved to REX - read back from the record. The portals update within about 10 minutes." } : { tone: "bad", text: j.error ?? "REX did not take it." });
    } catch {
      setNote({ tone: "bad", text: "The connection dropped. Nothing is lost here - try again." });
    } finally {
      setSaving(false);
    }
  }

  async function sendToRex(kind: "photo" | "floorplan", key?: string): Promise<string> {
    if (!key) return "Saved here, and could not be sent to REX.";
    const r = await fetch("/api/listings/media", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: details!.id, kind, key }),
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; details?: ListingDetails | null };
    if (j.ok && j.details) {
      const fresh = j.details;
      setDetails(fresh);
      /* New photos join the end of whatever order is being edited. */
      setDraftState((d) => (d ? { ...d, imageOrder: [...d.imageOrder, ...fresh.images.map((i) => i.id).filter((id) => !d.imageOrder.includes(id))] } : d));
      onSaved?.(fresh);
      return "In REX";
    }
    return j.error ?? "REX did not take it.";
  }

  async function writeForMe() {
    setWriting(true);
    try {
      const r = await fetch("/api/listings/describe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          locality,
          rent: draft!.rent,
          availableFrom: draft!.availableFrom,
          type: details!.propertyType,
          beds: draft!.beds,
          baths: draft!.baths,
          receptions: draft!.receptions,
          photos: images.slice(0, 4).map((i) => i.thumb),
          current: draft!.body,
        }),
      });
      const j = (await r.json()) as { ok?: boolean; heading?: string; body?: string; error?: string };
      if (!j.ok) throw new Error(j.error ?? "The writer did not answer.");
      setDraft((d) => ({ ...d, heading: (j.heading ?? d.heading).slice(0, 255), body: j.body ?? d.body }));
    } catch (e) {
      setNote({ tone: "bad", text: e instanceof Error ? e.message : "The writer did not answer." });
    } finally {
      setWriting(false);
    }
  }

  const stepper = (key: "beds" | "baths" | "receptions", label: string) => (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-[12.5px]">{label}</span>
      <span className="flex items-center gap-1">
        <button type="button" disabled={!canEdit} onClick={() => setDraft((d) => ({ ...d, [key]: Math.max(0, (d[key] ?? 0) - 1) }))} className="flex h-7 w-7 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted hover:border-ink/40 hover:text-ink disabled:opacity-40">−</button>
        <span className={`figures w-7 text-center text-[14px] font-semibold ${draft[key] == null ? "text-accent-dark" : ""}`}>{draft[key] ?? "?"}</span>
        <button type="button" disabled={!canEdit} onClick={() => setDraft((d) => ({ ...d, [key]: (d[key] ?? 0) + 1 }))} className="flex h-7 w-7 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted hover:border-ink/40 hover:text-ink disabled:opacity-40">+</button>
      </span>
    </div>
  );

  const editor = (
    <div className="space-y-5">
      {/* What REX itself says is stopping this, read with the record. */}
      <section className={`${card} ${blockers.length ? "border-accent/60 bg-accent-soft/30" : ""}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={eyebrow}>What REX needs</p>
            {blockers.length ? (
              <ul className="mt-2 space-y-1 text-[12.5px] text-accent-dark">
                {blockers.map((b) => <li key={b} className="flex gap-2"><span aria-hidden>•</span>{b}</li>)}
              </ul>
            ) : (
              <p className="mt-1.5 text-[12.5px]">Nothing - REX will publish it and every portal feed will take it.</p>
            )}
            {gaps.length > 0 && (
              <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
                The portals will say &quot;Ask agent&quot; for the {gaps.length > 1 ? `${gaps.slice(0, -1).join(", ")} and ${gaps.at(-1)}` : gaps[0]}. Not required to go live - filling these in is the next step.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setPreviewing(true)}
            className="press-ring flex shrink-0 items-center gap-2 rounded-full bg-[var(--brown)] px-5 py-2.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            <DoodleIcon name="megaphone" size={14} />
            Preview on the portals
          </button>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={card}>
          <p className={eyebrow}>The property</p>
          <p className="mt-2 text-[12.5px]">
            <span className="text-muted">Type </span>
            <span className="font-semibold">{details.propertyType ?? "Not set in REX"}</span>
          </p>
          <div className="mt-2 divide-y divide-line/40">
            {stepper("beds", "Bedrooms")}
            {stepper("baths", "Bathrooms")}
            {stepper("receptions", "Receptions")}
          </div>
          {locks?.rooms && (
            <p className="mt-2 border-t border-line/50 pt-2.5 text-[10.5px] leading-relaxed text-muted">REX keeps rooms on the property record; saving them needs Properties/update unlocking.</p>
          )}
        </section>

        <section className={card}>
          <p className={eyebrow}>The letting</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="block text-[11px] text-muted">
              Rent, pcm
              <div className="relative mt-1">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[13.5px] text-muted">£</span>
                <input type="number" min={0} disabled={!canEdit} value={draft.rent ?? ""} onChange={(e) => setDraft((d) => ({ ...d, rent: e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value))) }))} className={`${field} pl-7`} />
              </div>
            </label>
            <label className="block text-[11px] text-muted">
              Deposit
              <div className="relative mt-1">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[13.5px] text-muted">£</span>
                <input type="number" min={0} disabled={!canEdit} value={draft.deposit ?? ""} onChange={(e) => setDraft((d) => ({ ...d, deposit: e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value))) }))} className={`${field} pl-7`} />
              </div>
            </label>
            <label className="col-span-2 block text-[11px] text-muted sm:col-span-1">
              Available from
              <input type="date" disabled={!canEdit} value={draft.availableFrom ?? ""} onChange={(e) => setDraft((d) => ({ ...d, availableFrom: e.target.value || null }))} className={`${field} mt-1`} />
            </label>
            <div className="col-span-2 text-[11px] text-muted sm:col-span-1">
              Status
              <p className="mt-1 py-2.5 text-[13.5px] font-semibold text-ink">
                {details.status === "published" ? "Live on the portals" : details.status === "draft" ? "Draft" : details.status ?? "Unknown"}
              </p>
            </div>
          </div>
          {fiveWeeks(draft.rent) != null && draft.deposit != null && draft.deposit > fiveWeeks(draft.rent)! && (
            <p className="mt-2 text-[11.5px] text-accent-dark">That is more than five weeks&apos; rent ({money(fiveWeeks(draft.rent))}), the legal cap on this deposit.</p>
          )}
          <p className="mt-3 border-t border-line/50 pt-2.5 text-[10.5px] leading-relaxed text-muted">
            {[details.letType, details.service].filter(Boolean).join(" · ")}
            {details.modifiedAt && ` · updated in REX ${new Date(details.modifiedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}
          </p>
        </section>
      </div>

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={eyebrow}>Key features · {draft.highlights.filter((h) => h.trim()).length} of 10</p>
          {canEdit && draft.highlights.length < 10 && (
            <button type="button" onClick={() => setDraft((d) => ({ ...d, highlights: [...d.highlights, ""] }))} className="rounded-full border border-line/60 px-3.5 py-1.5 text-[12px] font-semibold hover:border-ink/40">Add one</button>
          )}
        </div>
        {draft.highlights.length ? (
          <ol className="mt-3 grid gap-2 sm:grid-cols-2">
            {draft.highlights.map((h, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="figures w-5 shrink-0 text-right text-[11px] text-muted">{i + 1}</span>
                <input maxLength={200} disabled={!canEdit} value={h} onChange={(e) => setDraft((d) => ({ ...d, highlights: d.highlights.map((x, k) => (k === i ? e.target.value : x)) }))} className={`${field} py-2 text-[13px]`} />
                {canEdit && (
                  <button type="button" aria-label={`Remove feature ${i + 1}`} onClick={() => setDraft((d) => ({ ...d, highlights: d.highlights.filter((_, k) => k !== i) }))} className="shrink-0 rounded-full px-2 text-muted hover:text-ink">✕</button>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-[12.5px] text-muted">None yet. These are the bullet points under the price on Rightmove.</p>
        )}
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={eyebrow}>The advert</p>
          {canEdit && (
            <button type="button" onClick={() => void writeForMe()} disabled={writing} className="flex items-center gap-2 rounded-full border border-line/60 px-4 py-2 text-[12.5px] font-semibold hover:border-ink/40 disabled:opacity-60">
              <DoodleIcon name="magic-wand" size={13} />
              {writing ? "Writing it…" : draft.body ? "Rewrite it for me" : "Write it for me"}
            </button>
          )}
        </div>
        <input maxLength={255} disabled={!canEdit} value={draft.heading} onChange={(e) => setDraft((d) => ({ ...d, heading: e.target.value }))} placeholder="Headline - the line the portals show first" className={`${field} mt-3 font-semibold`} />
        <p className="mt-1 text-right text-[10.5px] text-muted">{draft.heading.length}/255 - Zoopla refuses longer</p>
        <textarea rows={10} disabled={!canEdit} value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} placeholder="Where it is, what it's like, what's nearby…" className={`${field} mt-1 resize-y leading-relaxed`} />
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={eyebrow}>Photos · {images.length}</p>
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
          <p className="mt-3 text-[12.5px] text-accent-dark">No photos in REX. It will not publish without a main photo.</p>
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
          <p className="mt-2 text-[12.5px] text-muted">None yet. Rightmove shows a Floorplan button on the gallery when there is one.</p>
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
      <p className="text-[11.5px] text-muted">
        A close likeness of each portal&apos;s page, drawn from what we send.{canEdit ? " Click anything with a dashed outline to change it." : ""}
        {blockers.length ? ` REX still needs: ${blockers.join("; ")}.` : ""}
      </p>
      <PortalPreview portal={portal} details={details} draft={draft} setDraft={setDraft} canEdit={canEdit} onAddPhotos={() => setDrop("photos")} />
    </div>
  );

  return (
    <div className="relative">
      {!canEdit && lockedNote && (
        <p className="mb-4 rounded-2xl border border-line/60 bg-white px-4 py-2.5 text-[12px] text-muted">{lockedNote}</p>
      )}
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
            {changed.length > 0
              ? `Not saved: ${changed.map((k) => CHANGE_WORDS[k]).join(", ")}.${note?.tone === "bad" ? ` ${note.text}` : ""}`
              : note?.text}
          </p>
          {changed.length > 0 ? (
            <>
              <button type="button" disabled={saving} onClick={() => { setDraftState(draftFrom(details)); setNote(null); }} className="rounded-full border border-line/60 px-4 py-2 text-[12.5px] font-semibold disabled:opacity-50">
                Discard
              </button>
              <button type="button" disabled={saving || !canEdit} onClick={() => void save()} className="rounded-full bg-[var(--brown)] px-5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-60">
                {saving ? "Saving to REX…" : "Save to REX"}
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
          afterUpload={(f) => sendToRex(drop === "photos" ? "photo" : "floorplan", f.key)}
        />
      )}
    </div>
  );
}
