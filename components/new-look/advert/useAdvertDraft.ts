"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { changesIn, draftFrom, orderedImages, shownFloorplans, type Draft } from "@/components/listing/listing-draft";
import type { ListingDetails } from "@/lib/listing-details";
import { toast } from "@/lib/toast";
import { useSaveReporter } from "@/components/SaveChip";
import { MIN_FEATURES, RECOMMENDED, REQUIREMENTS, type RequirementInput } from "@/lib/listing-requirements";
import type { Locks } from "@/components/listing/ListingMarketing";

/**
 * Edit the advert's workings, for the new look (lib/new-look "advert").
 *
 * The same reads and writes as components/listing/ListingMarketing, line for
 * line: the listing read from /api/listings/details, Fill it in for me from
 * /api/listings/autofill, Read it from the EPC, photos and floor plans onto
 * the listing through /api/listings/media, and the one PATCH Save. The server
 * passes the words through lib/no-dashes on that save, as before. Kept apart
 * from the old editor so the old one is never touched while this is behind
 * its switch; only the markup around it is new.
 */

const SOURCE_WORDS: Record<string, string> = {
  homesearch: "the property records",
  epc: "the EPC register",
  landlord: "the landlord's answers",
  "last-listing": "the last listing",
  appraisal: "the appraisal",
  market: "the local market",
  photos: "the photos",
};

export function useAdvertDraft({
  listingId,
  initial,
  canEdit,
  onSaved,
}: {
  listingId: string;
  initial?: { details: ListingDetails; locks: Locks } | null;
  canEdit: boolean;
  onSaved?: (d: ListingDetails) => void;
}) {
  const [details, setDetails] = useState<ListingDetails | null>(null);
  const [draft, setDraftState] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  /** Which fields the magic button filled, and from where. */
  const [filledBy, setFilledBy] = useState<Record<string, string>>({});
  const [filling, setFilling] = useState<"all" | "copy" | null>(null);
  const [fillNote, setFillNote] = useState<string | null>(null);
  const [sources, setSources] = useState<Record<string, string>>({});
  const [types, setTypes] = useState<{ id: string; label: string }[] | null>(null);
  const typesAsked = useRef(false);
  const loadTypes = useCallback(async () => {
    if (typesAsked.current) return;
    typesAsked.current = true;
    try {
      const j = (await fetch("/api/listings/create?lists=1", { cache: "no-store" }).then((r) => r.json())) as { ok?: boolean; types?: { id: string; label: string }[] };
      setTypes(j.ok ? j.types ?? [] : []);
    } catch {
      typesAsked.current = false;
      setTypes([]);
    }
  }, []);
  const [epcReading, setEpcReading] = useState(false);
  const [epcNote, setEpcNote] = useState<string | null>(null);

  /* The advert is the one thing the save chip never sends: its Save writes to
     the live portals. An edited advert still stops the chip saying all is
     saved (the same as the old editor). */
  const reporter = useSaveReporter();
  const sendWaiting = useRef<(() => boolean) | null>(null);
  useEffect(() => reporter.waiting(() => sendWaiting.current?.() ?? false), [reporter]);
  sendWaiting.current = null;

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
    setEpcNote(null);
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

  /** Read the band and both scores off the EPC on the listing. */
  const readEpc = useCallback(async (id: string, quiet = false) => {
    setEpcReading(true);
    setEpcNote(null);
    try {
      const r = await fetch(`/api/listings/epc-read?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; band?: string | null; current?: number | null; potential?: number | null; lodged?: string | null };
      if (!j.ok) throw new Error(j.error ?? "The EPC could not be read.");
      const marks: Record<string, string> = {};
      setDraft((d) => {
        const next = { ...d };
        if (j.band) { next.epcBand = j.band; marks.epcBand = "the EPC"; }
        if (j.current != null) { next.epcCurrent = j.current; marks.epcCurrent = "the EPC"; }
        if (j.potential != null) { next.epcPotential = j.potential; marks.epcPotential = "the EPC"; }
        if (j.lodged) { next.epcLodged = j.lodged; marks.epcLodged = "the EPC"; }
        return next;
      });
      setFilledBy((m) => ({ ...m, ...marks }));
      setEpcNote(Object.keys(marks).length ? "Read from the EPC. Check it, then Save." : quiet ? null : "Nothing could be read off that EPC - fill it in from the certificate.");
    } catch (e) {
      if (!quiet) setEpcNote(e instanceof Error ? e.message : "The EPC could not be read.");
    } finally {
      setEpcReading(false);
    }
  }, [setDraft]);

  useEffect(() => {
    if (draft && !draft.propertyTypeId && canEdit) void loadTypes();
  }, [draft, canEdit, loadTypes]);

  /* Read the EPC on its own when a band or score is missing and there is a
     certificate to read. Once per listing. */
  const epcTried = useRef<string | null>(null);
  useEffect(() => {
    if (!details || !draft || !canEdit || !details.epc.fileUrl || epcTried.current === details.id) return;
    if (draft.epcBand && draft.epcCurrent != null && draft.epcPotential != null && draft.epcLodged) return;
    epcTried.current = details.id;
    void readEpc(details.id, true);
  }, [details, draft, canEdit, readEpc]);

  const ready = details && draft ? { details, draft } : null;
  const changes = ready ? changesIn(ready.details, ready.draft) : {};
  const changed = Object.keys(changes) as (keyof Draft)[];
  const images = ready ? orderedImages(ready.details, ready.draft) : [];
  const plans = ready ? shownFloorplans(ready.details, ready.draft) : [];
  const typeLabel = ready?.draft.propertyTypeId
    ? (types?.find((t) => t.id === ready.draft.propertyTypeId)?.label ?? ready.details.propertyType ?? ready.draft.propertyTypeId)
    : null;
  const input: RequirementInput | null = ready
    ? {
        rent: ready.draft.rent, deposit: ready.draft.deposit, availableFrom: ready.draft.availableFrom, beds: ready.draft.beds, baths: ready.draft.baths,
        propertyType: typeLabel, heading: ready.draft.heading, body: ready.draft.body, highlights: ready.draft.highlights, photos: images.length,
        councilTaxBand: ready.draft.councilTaxBand, parking: ready.draft.parking, electricity: ready.draft.electricity, water: ready.draft.water,
        sewerage: ready.draft.sewerage, broadband: ready.draft.broadband, heating: ready.draft.heating, furnishing: ready.draft.furnishing,
        epcBand: ready.draft.epcBand, landlordRegistration: ready.draft.landlordRegistration, agentLarn: ready.draft.agentLarn, scotland: ready.details.record?.scotland ?? false,
      }
    : null;
  const okFor = (id: keyof RequirementInput) => (input ? REQUIREMENTS.find((r) => r.id === id)?.ok(input) ?? true : true);
  const recDone = input ? RECOMMENDED.filter((r) => r.ok(input)).length : 0;

  /** Take one photo out and put it where another one is, the rest closing up behind it. */
  const movePhoto = (id: string, to: string) => {
    if (id === to) return;
    const order = images.map((x) => x.id);
    const from = order.indexOf(id);
    const at = order.indexOf(to);
    if (from < 0 || at < 0) return;
    order.splice(from, 1);
    order.splice(at, 0, id);
    setDraft((d) => ({ ...d, imageOrder: order }));
  };
  const makeMain = (id: string) => setDraft((d) => ({ ...d, imageOrder: [id, ...images.map((x) => x.id).filter((x) => x !== id)] }));
  const removePhoto = (id: string) => setDraft((d) => ({ ...d, removedImages: [...d.removedImages, id] }));
  const putPhotosBack = () => setDraft((d) => ({ ...d, removedImages: [] }));
  const removePlan = (id: string) => setDraft((d) => ({ ...d, removedFloorplans: [...d.removedFloorplans, id] }));
  const putPlansBack = () => setDraft((d) => ({ ...d, removedFloorplans: [] }));
  const discard = () => {
    if (!details) return;
    setDraftState(draftFrom(details));
    setFilledBy({});
    setNote(null);
  };

  async function save() {
    if (!details || !changed.length) return;
    setSaving(true);
    setNote(null);
    const settle = reporter.begin("Advert");
    try {
      const r = await fetch("/api/listings/details", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: details.id, ...changes, sources }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; note?: string; epcHeld?: boolean; details?: ListingDetails | null };
      if (j.details) {
        setDetails(j.details);
        setDraftState((d) =>
          d && !j.ok
            ? d
            : d && j.epcHeld
              ? { ...draftFrom(j.details!), epcBand: d.epcBand, epcCurrent: d.epcCurrent, epcPotential: d.epcPotential, epcLodged: d.epcLodged }
              : draftFrom(j.details!)
        );
        onSaved?.(j.details);
      }
      if (j.ok) {
        setFilledBy({});
        setSources({});
      }
      setNote(j.ok ? { tone: "good", text: j.note && j.note !== "Saved." ? j.note : "Saved. Live adverts update within about 10 minutes." } : { tone: "bad", text: j.error ?? "That did not save." });
      settle(j.ok ? { ok: true } : { ok: false, problem: j.error ?? "That did not save." });
    } catch {
      setNote({ tone: "bad", text: "The connection dropped. Nothing is lost here - try again." });
      settle({ ok: false, problem: "The connection dropped. Nothing is lost here." });
    } finally {
      setSaving(false);
    }
  }

  sendWaiting.current =
    canEdit && changed.length > 0 && !saving
      ? () => {
          toast("The advert is not saved yet - check it, then press Save in Edit the Advert.", "bad");
          return true;
        }
      : null;

  /** The magic button. "all" fills only what is empty; "copy" rewrites the advert. */
  async function fill(mode: "all" | "copy") {
    if (!details || !draft) return;
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
      const next = { ...draft } as Draft & Record<string, unknown>;
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

  /** A photo or floor plan just uploaded, put on the listing. */
  async function sendToListing(kind: "photo" | "floorplan", key?: string): Promise<{ ok: boolean; note: string }> {
    if (!key || !details) return { ok: false, note: "Saved here, and could not be added to the listing." };
    const r = await fetch("/api/listings/media", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: details.id, kind, key }),
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; details?: ListingDetails | null };
    if (r.ok && j.ok && j.details) {
      const fresh = j.details;
      setDetails(fresh);
      setDraftState((d) => (d ? { ...d, imageOrder: [...d.imageOrder, ...fresh.images.map((i) => i.id).filter((id) => !d.imageOrder.includes(id))] } : d));
      onSaved?.(fresh);
      return { ok: true, note: "Added" };
    }
    return { ok: false, note: j.error ?? "It did not go on the listing." };
  }

  return {
    details, draft, error, load, setDraft, types, loadTypes, typeLabel,
    epcReading, epcNote, readEpc,
    filledBy, filling, fillNote, fill,
    saving, note, setNote, save, discard,
    changes, changed, images, plans, input, okFor, recDone,
    movePhoto, makeMain, removePhoto, putPhotosBack, removePlan, putPlansBack, sendToListing,
  };
}
