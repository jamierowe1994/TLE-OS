"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import LineIcon from "@/components/LineIcon";
import DropZone from "@/components/listing/DropZone";
import PortalPreview, { PORTAL_TABS, type Portal } from "@/components/listing/PortalPreview";
import { CHANGE_WORDS, fiveWeeks, longDate, money, type Draft, type FactField } from "@/components/listing/listing-draft";
import type { ListingDetails } from "@/lib/listing-details";
import type { Locks } from "@/components/listing/ListingMarketing";
import GuideButton from "@/components/GuideButton";
import SteveFace from "@/components/SteveFace";
import { Ico } from "@/components/new-look/Parts";
import { OPTIONS, RECOMMENDED, isRequired, type RequirementInput } from "@/lib/listing-requirements";
import { useAdvertDraft } from "./useAdvertDraft";
import OsAddressLine from "@/components/OsAddressLine";

/**
 * EDIT THE ADVERT, in the new look (lib/new-look "advert", 23 Oct 2026).
 *
 * The design's EditAdvert: a wide drawer from the right, Steve's Fill it in
 * for me at the top, then the advert as six steps, one open at a time, each
 * with a tick when what the portals need from it is in. Saving and pushing
 * live sit in the foot.
 *
 * Every field and button of the old Marketing editor
 * (components/listing/ListingMarketing) is here, on the same reads and
 * writes (./useAdvertDraft). Nothing leaves the drawer until Save; Save is
 * the same one PATCH; Push to the portals is the listing page's own push.
 */

export type AdvertPublish = {
  /** True when the listing page would push it now. */
  ready: boolean;
  /** "the EPC is filed", for "Not until ..." */
  why: string;
  onPress: () => void;
};

type StepId = "home" | "let" | "bills" | "epc" | "advert" | "photos";

const STEP_NAMES: Record<StepId, string> = {
  home: "The home",
  let: "The let",
  bills: "Bills and services",
  epc: "EPC",
  advert: "The advert",
  photos: "Photos and floor plans",
};

/** What the portals need from each step: the step is ticked when these are in. */
const STEP_NEEDS: Record<StepId, (keyof RequirementInput)[]> = {
  home: ["propertyType", "beds", "baths"],
  let: ["rent", "deposit", "availableFrom"],
  bills: ["councilTaxBand"],
  epc: ["epcBand", "landlordRegistration", "agentLarn"],
  advert: ["heading", "body"],
  photos: ["photos"],
};

const ORDER: StepId[] = ["home", "let", "bills", "epc", "advert", "photos"];

export default function EditAdvert({
  listingId,
  address,
  propertyId,
  onAddress,
  initial,
  canEdit,
  lockedNote,
  onSaved,
  onClose,
  live,
  publish,
}: {
  listingId: string;
  /** The eyebrow over the title: the home's address. */
  address: string;
  /** The home behind it, so the address can be changed from here (27 Oct 2026). */
  propertyId?: string | null;
  onAddress?: (a: { name: string; locality: string }) => void;
  initial?: { details: ListingDetails; locks: Locks } | null;
  canEdit: boolean;
  lockedNote: string | null;
  onSaved?: (d: ListingDetails) => void;
  onClose: () => void;
  /** Already on the portals. */
  live: boolean;
  /** Push to the portals, where the listing page offers it. */
  publish: AdvertPublish | null;
}) {
  const a = useAdvertDraft({ listingId, initial, canEdit, onSaved });
  const { details, draft, setDraft } = a;

  const [closing, setClosing] = useState(false);
  const close = useCallback(() => {
    setClosing(true);
    window.setTimeout(onClose, 260);
  }, [onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      /* A pop-up opened from inside (the photo drop, a guide) closes first. */
      if (document.querySelectorAll('[role="dialog"]').length > 1) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const [open, setOpen] = useState<StepId | null>(null);
  const opened = useRef(false);
  const [previewing, setPreviewing] = useState(false);
  const [portal, setPortal] = useState<Portal>("rightmove");
  const [drop, setDrop] = useState<"photos" | "floorplan" | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  /* Moving on folds the step you were on away while the next one opens, and
     the next one's heading glides up to the top: one continuous move. */
  const [leaving, setLeaving] = useState<StepId | null>(null);
  const glideTo = useRef<StepId | null>(null);
  const goStep = (s: StepId | null) => {
    const was = open;
    if (was && was !== s) {
      setLeaving(was);
      window.setTimeout(() => setLeaving((l) => (l === was ? null : l)), 620);
    }
    glideTo.current = s;
    setOpen(s);
  };
  useEffect(() => {
    const s = glideTo.current;
    glideTo.current = null;
    const body = bodyRef.current;
    const li = s && s === open ? body?.querySelector<HTMLElement>(`[data-step="${s}"]`) : null;
    if (!body || !li) return;
    const off = () => li.getBoundingClientRect().top - body.getBoundingClientRect().top;
    const from = off();
    const to = 8;
    if (Math.abs(from - to) < 4) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      body.scrollTop += from - to;
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const stop = () => cancelAnimationFrame(raf);
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / 600);
      const want = from + (to - from) * (1 - Math.pow(1 - k, 3));
      body.scrollTop += off() - want;
      if (k < 1) raf = requestAnimationFrame(tick);
      else body.removeEventListener("wheel", stop);
    };
    raf = requestAnimationFrame(tick);
    // A reader who scrolls mid-glide takes over.
    body.addEventListener("wheel", stop, { once: true, passive: true });
    body.addEventListener("touchstart", stop, { once: true, passive: true });
    return () => {
      stop();
      body.removeEventListener("wheel", stop);
      body.removeEventListener("touchstart", stop);
    };
  }, [open]);

  const input = a.input;
  const stepDone = (s: StepId) => (input ? STEP_NEEDS[s].every((k) => a.okFor(k)) : false);
  /* Opens on the first step that still needs something, once it has loaded. */
  useEffect(() => {
    if (opened.current || !input) return;
    opened.current = true;
    setOpen(ORDER.find((s) => !STEP_NEEDS[s].every((k) => a.okFor(k))) ?? "home");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  const doneN = ORDER.filter(stepDone).length;
  const togo = ORDER.length - doneN;

  /* ── the pieces ──────────────────────────────────────────────────────── */

  const sparkle = (id: string) =>
    a.filledBy[id] ? (
      <span className="nl-adv-filled" title={`Filled in from ${a.filledBy[id]}`}>
        <Ico name="check" size={11} /> filled in
      </span>
    ) : null;
  const label = (id: string, text: ReactNode) => (
    <span className="nl-adv-label">
      {text}
      {isRequired(id) && <i className="nl-adv-req" aria-label="required">*</i>}
      {sparkle(id)}
    </span>
  );
  const missing = (id: string) => isRequired(id) && !a.okFor(id as keyof RequirementInput);

  const select = (id: FactField, text: string) =>
    draft && (
      <label className={`nl-adv-field${missing(id) ? " is-missing" : ""}`}>
        {label(id, text)}
        <select disabled={!canEdit} value={draft[id] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [id]: e.target.value || null }))} className={draft[id] ? "" : "is-empty"}>
          <option value="">Choose…</option>
          {(OPTIONS[id] as readonly string[]).map((o) => (
            <option key={o} value={o}>{id === "councilTaxBand" && o !== "Exempt" ? `Band ${o}` : o}</option>
          ))}
        </select>
      </label>
    );

  const stepper = (key: "beds" | "baths" | "receptions", text: string) =>
    draft && (
      <div className={`nl-adv-field${missing(key) ? " is-missing" : ""}`}>
        {label(key, text)}
        <div className="nl-adv-stepper">
          <button type="button" disabled={!canEdit} aria-label={`Fewer ${text.toLowerCase()}`} onClick={() => setDraft((d) => ({ ...d, [key]: Math.max(0, (d[key] ?? 1) - 1) }))}>−</button>
          <b>{draft[key] ?? "-"}</b>
          <button type="button" disabled={!canEdit} aria-label={`More ${text.toLowerCase()}`} onClick={() => setDraft((d) => ({ ...d, [key]: (d[key] ?? 0) + 1 }))}>+</button>
        </div>
      </div>
    );

  const pounds = (key: "rent" | "deposit", text: string, extra?: ReactNode, bad = false) =>
    draft && (
      <label className={`nl-adv-field${missing(key) || bad ? " is-missing" : ""}`}>
        {label(key, text)}
        <span className="nl-adv-money">
          <i aria-hidden>£</i>
          <input type="number" min={0} disabled={!canEdit} value={draft[key] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value))) }))} />
        </span>
        {extra}
      </label>
    );

  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

  /* ── what each step says when it is shut ─────────────────────────────── */

  const summary = (s: StepId): string => {
    if (!details || !draft) return "";
    if (s === "home") {
      return [a.typeLabel, draft.beds != null ? `${draft.beds} bed` : null, draft.baths != null ? `${draft.baths} bath` : null, draft.furnishing?.toLowerCase()].filter(Boolean).join(" · ") || "Nothing filled in yet";
    }
    if (s === "let") {
      const cap = fiveWeeks(draft.rent);
      return [
        draft.rent != null ? `${money(draft.rent)} pcm` : "Rent not set",
        draft.deposit != null ? `deposit ${money(draft.deposit)}${cap != null && draft.deposit > cap ? " (over the cap)" : ""}` : "deposit not set",
        draft.availableFrom ? `from ${longDate(draft.availableFrom)}` : null,
      ].filter(Boolean).join(" · ");
    }
    if (s === "bills") {
      const tax = draft.councilTaxBand ? (draft.councilTaxBand === "Exempt" ? "Council tax exempt" : `Council tax band ${draft.councilTaxBand}`) : "Council tax missing";
      return [tax, draft.heating].filter(Boolean).join(" · ");
    }
    if (s === "epc") {
      const scot = details.record?.scotland;
      return [
        draft.epcBand ? `Band ${draft.epcBand}` : "EPC rating missing",
        draft.epcCurrent != null ? `score ${draft.epcCurrent}` : null,
        scot && (!draft.landlordRegistration || !draft.agentLarn) ? "registration numbers missing" : null,
      ].filter(Boolean).join(" · ");
    }
    if (s === "advert") return draft.heading.trim() || "No headline yet";
    return `${plural(a.images.length, "photo")} · ${a.plans.length ? plural(a.plans.length, "floor plan") : "no floor plan"}`;
  };

  /* ── each step's fields ──────────────────────────────────────────────── */

  const body = (s: StepId): ReactNode => {
    if (!details || !draft) return null;
    if (s === "home") {
      return (
        <div className="nl-adv-grid">
          {/* Pickable here: a listing can arrive with no type, and the portals refuse it. */}
          <label className={`nl-adv-field${missing("propertyType") ? " is-missing" : ""}`}>
            {label("propertyType", "Property type")}
            <select disabled={!canEdit} value={draft.propertyTypeId ?? ""} onFocus={() => void a.loadTypes()} onChange={(e) => setDraft((d) => ({ ...d, propertyTypeId: e.target.value || null }))} className={draft.propertyTypeId ? "" : "is-empty"}>
              <option value="">{a.types === null && !draft.propertyTypeId ? "Loading the types…" : "Choose…"}</option>
              {draft.propertyTypeId && !(a.types ?? []).some((t) => t.id === draft.propertyTypeId) && <option value={draft.propertyTypeId}>{details.propertyType ?? "Current type"}</option>}
              {(a.types ?? []).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>
          {stepper("beds", "Bedrooms")}
          {stepper("baths", "Bathrooms")}
          {stepper("receptions", "Receptions")}
          {select("furnishing", "Furnishing")}
          {select("pets", "Pets")}
          {select("outsideSpace", "Outside space")}
          <label className="nl-adv-field">
            {label("floorAreaSqft", "Floor area, sq ft")}
            <input type="number" min={0} disabled={!canEdit} value={draft.floorAreaSqft ?? ""} onChange={(e) => setDraft((d) => ({ ...d, floorAreaSqft: e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value))) }))} />
          </label>
        </div>
      );
    }
    if (s === "let") {
      const cap = fiveWeeks(draft.rent);
      const over = cap != null && draft.deposit != null && draft.deposit > cap;
      return (
        <>
          <div className="nl-adv-grid">
            {pounds("rent", "Rent, pcm")}
            {pounds(
              "deposit",
              "Deposit",
              over ? <small className="is-bad">More than five weeks&apos; rent ({money(cap)}), the legal cap on this deposit.</small> : cap != null && draft.deposit != null ? <small className="is-good">Within the five-week cap ({money(cap)}).</small> : null,
              over
            )}
            <label className={`nl-adv-field${missing("availableFrom") ? " is-missing" : ""}`}>
              {label("availableFrom", "Available from")}
              <input type="date" disabled={!canEdit} value={draft.availableFrom ?? ""} onChange={(e) => setDraft((d) => ({ ...d, availableFrom: e.target.value || null }))} />
            </label>
            <div className="nl-adv-field">
              <span className="nl-adv-label">Status</span>
              <p className="nl-adv-static">{details.status === "published" ? "Live on the portals" : "Draft"}</p>
            </div>
          </div>
          {(details.letType || details.service) && <p className="nl-meta nl-adv-aside">{[details.letType, details.service].filter(Boolean).join(" · ")}</p>}
        </>
      );
    }
    if (s === "bills") {
      return (
        <div className="nl-adv-grid">
          {select("councilTaxBand", "Council tax")}
          {select("heating", "Heating")}
          {select("parking", "Parking")}
          {select("broadband", "Broadband")}
          {select("electricity", "Electricity")}
          {select("water", "Water")}
          {select("sewerage", "Sewerage")}
        </div>
      );
    }
    if (s === "epc") {
      const scot = details.record?.scotland;
      return (
        <div data-steve="listing.marketing.epc">
          <div className="nl-adv-grid">
            <label className={`nl-adv-field${missing("epcBand") ? " is-missing" : ""}`}>
              {label("epcBand", "EPC rating")}
              <select disabled={!canEdit} value={draft.epcBand ?? ""} onChange={(e) => setDraft((d) => ({ ...d, epcBand: e.target.value || null }))} className={draft.epcBand ? "" : "is-empty"}>
                <option value="">Choose…</option>
                {["A", "B", "C", "D", "E", "F", "G"].map((b) => <option key={b} value={b}>Band {b}</option>)}
              </select>
            </label>
            <label className="nl-adv-field">
              {label("epcCurrent", "Score now")}
              <input type="number" min={1} max={120} disabled={!canEdit} value={draft.epcCurrent ?? ""} placeholder="e.g. 68" onChange={(e) => setDraft((d) => ({ ...d, epcCurrent: e.target.value === "" ? null : Math.max(1, Math.min(120, Math.round(Number(e.target.value)))) }))} />
            </label>
            <label className="nl-adv-field">
              {label("epcPotential", "Potential score")}
              <input type="number" min={1} max={120} disabled={!canEdit} value={draft.epcPotential ?? ""} placeholder="e.g. 79" onChange={(e) => setDraft((d) => ({ ...d, epcPotential: e.target.value === "" ? null : Math.max(1, Math.min(120, Math.round(Number(e.target.value)))) }))} />
            </label>
            <label className="nl-adv-field">
              {label("epcLodged", "Date on the EPC")}
              <input type="date" max={new Date().toISOString().slice(0, 10)} disabled={!canEdit} value={draft.epcLodged ?? ""} onChange={(e) => setDraft((d) => ({ ...d, epcLodged: e.target.value || null }))} />
            </label>
            {scot && (
              <label className={`nl-adv-field${missing("landlordRegistration") ? " is-missing" : ""}`}>
                {label("landlordRegistration", "Landlord registration number")}
                <input disabled={!canEdit} value={draft.landlordRegistration ?? ""} placeholder="e.g. 123456/230/12345" onChange={(e) => setDraft((d) => ({ ...d, landlordRegistration: e.target.value.replace(/\s+/g, " ").slice(0, 40) || null }))} />
              </label>
            )}
            {scot && (
              <label className={`nl-adv-field${missing("agentLarn") ? " is-missing" : ""}`}>
                {label("agentLarn", "Your letting agent registration number")}
                <input disabled={!canEdit} value={draft.agentLarn ?? ""} placeholder="e.g. LARN1902034" onChange={(e) => setDraft((d) => ({ ...d, agentLarn: e.target.value.toUpperCase().replace(/\s+/g, "").slice(0, 16) || null }))} />
              </label>
            )}
          </div>
          {canEdit && details.epc.fileUrl && (
            <button type="button" onClick={() => void a.readEpc(details.id)} disabled={a.epcReading} className="nl-btn nl-btn--secondary nl-btn--sm nl-adv-gap">
              {a.epcReading ? <span className="nl-adv-spin" aria-hidden /> : <Wand size={14} />}
              {a.epcReading ? "Reading the EPC…" : "Read it from the EPC"}
            </button>
          )}
          <p className="nl-meta nl-adv-aside">
            {a.epcNote ??
              (draft.epcCurrent != null && draft.epcPotential == null
                ? "Add the potential score too and the rating goes to the portals with the advert. Until then it is kept here."
                : draft.epcCurrent != null && draft.epcPotential != null && !draft.epcLodged
                  ? "Add the date on the EPC and the rating goes to the portals with the advert. Until then it is kept here, and the rest of the advert still saves."
                  : "Every advert has to show the EPC rating.")}
            {scot && " In Scotland the landlord's registration number and your letting agent registration number (LARN) have to be on the advert as well, so saving adds both as the last lines of the description. Your LARN is remembered for your other Scottish listings."}
          </p>
        </div>
      );
    }
    if (s === "advert") {
      const n = draft.highlights.filter((h) => h.trim()).length;
      return (
        <div className="nl-adv-stack">
          <label className={`nl-adv-field${missing("heading") ? " is-missing" : ""}`}>
            {label("heading", "Headline")}
            <input maxLength={255} disabled={!canEdit} value={draft.heading} placeholder="What it is and where - the line the portals show first" onChange={(e) => setDraft((d) => ({ ...d, heading: e.target.value }))} />
          </label>
          <label className={`nl-adv-field${missing("body") ? " is-missing" : ""}`}>
            {label("body", "Description")}
            <textarea rows={10} disabled={!canEdit} value={draft.body} placeholder="Where it is, what it's like, what's nearby…" onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} />
          </label>
          {canEdit && (
            <button type="button" onClick={() => void a.fill("copy")} disabled={a.filling !== null} className="nl-btn nl-btn--secondary nl-btn--sm">
              {a.filling === "copy" ? <span className="nl-adv-spin" aria-hidden /> : <Wand size={14} />}
              {a.filling === "copy" ? "Writing…" : draft.body ? "Rewrite it with Steve" : "Write it with Steve"}
            </button>
          )}
          <div className="nl-adv-feat-head">
            <span className="nl-adv-label">
              Key features · {n} of 10
              {isRequired("highlights") && <i className="nl-adv-req">*</i>}
              {sparkle("highlights")}
            </span>
            {canEdit && draft.highlights.length < 10 && (
              <button type="button" className="nl-btn nl-btn--quiet nl-btn--sm" onClick={() => setDraft((d) => ({ ...d, highlights: [...d.highlights, ""] }))}>
                <Ico name="plus" size={14} /> Add one
              </button>
            )}
          </div>
          {draft.highlights.length ? (
            <ol className="nl-adv-feats">
              {draft.highlights.map((h, i) => (
                <li key={i}>
                  <span className="nl-mono">{i + 1}</span>
                  <input maxLength={200} disabled={!canEdit} value={h} aria-label={`Key feature ${i + 1}`} onChange={(e) => setDraft((d) => ({ ...d, highlights: d.highlights.map((x, k) => (k === i ? e.target.value : x)) }))} />
                  {canEdit && (
                    <button type="button" className="nl-iconbtn nl-iconbtn--sm" aria-label={`Remove feature ${i + 1}`} onClick={() => setDraft((d) => ({ ...d, highlights: d.highlights.filter((_, k) => k !== i) }))}>
                      <LineIcon name="trash" size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="nl-meta">The bullet points under the price. Fill it in for me writes them from the photos and the facts.</p>
          )}
        </div>
      );
    }
    /* Photos and floor plans. */
    const images = a.images;
    return (
      <div className="nl-adv-stack">
        {a.draft!.removedImages.length > 0 && <Removed count={a.draft!.removedImages.length} onUndo={a.putPhotosBack} />}
        <div className="nl-adv-photos">
          {images.map((img, i) => {
            const isPicked = picked === img.id;
            const isTarget = dragOver === img.id && dragging !== img.id;
            return (
              <div
                key={img.id}
                draggable={canEdit}
                onDragStart={(e) => {
                  if (!canEdit) return;
                  setDragging(img.id);
                  setPicked(null);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/x-photo", img.id);
                }}
                onDragOver={(e) => {
                  if (!dragging) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOver !== img.id) setDragOver(img.id);
                }}
                onDrop={(e) => {
                  if (!dragging) return;
                  e.preventDefault();
                  a.movePhoto(dragging, img.id);
                  setDragging(null);
                  setDragOver(null);
                }}
                onDragEnd={() => {
                  setDragging(null);
                  setDragOver(null);
                }}
                onClick={() => {
                  if (!canEdit || images.length < 2) return;
                  if (!picked) setPicked(img.id);
                  else if (picked === img.id) setPicked(null);
                  else {
                    a.movePhoto(picked, img.id);
                    setPicked(null);
                  }
                }}
                className={`nl-adv-ph${canEdit && images.length > 1 ? " is-movable" : ""}${isPicked ? " is-picked" : ""}${isTarget ? " is-target" : ""}${dragging === img.id ? " is-dragging" : ""}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.thumb} alt="" draggable={false} />
                <span className="nl-adv-ph-tag">{i === 0 ? "Main" : i + 1}</span>
                {i !== 0 && canEdit && !picked && (
                  <button type="button" className="nl-adv-ph-main" onClick={(e) => { e.stopPropagation(); a.makeMain(img.id); }}>
                    Make main photo
                  </button>
                )}
                {canEdit && !picked && (
                  <button type="button" className="nl-adv-ph-x" title="Remove this photo" aria-label={`Remove photo ${i + 1}`} onClick={(e) => { e.stopPropagation(); setPicked(null); a.removePhoto(img.id); }}>
                    <LineIcon name="trash" size={13} />
                  </button>
                )}
                {isPicked && <span className="nl-adv-ph-moving">Moving</span>}
              </div>
            );
          })}
          {canEdit && (
            <button type="button" className="nl-adv-ph-add" onClick={() => setDrop("photos")}>
              <Ico name="plus" size={18} />
              Add photos
            </button>
          )}
        </div>
        <p className="nl-meta">
          {!images.length
            ? "No photos yet. The first one you add is the main photo on every portal."
            : canEdit && images.length > 1
              ? picked
                ? "Now tap where it should go. Tap it again to leave it where it is."
                : "Drag a photo to move it, or tap one and then tap where it should go. The first is the main photo on every portal."
              : "The first is the main photo on every portal."}
        </p>

        <div className="nl-adv-sub">
          <span className="nl-adv-label">Floor plans · {a.plans.length} of 5</span>
        </div>
        {a.draft!.removedFloorplans.length > 0 && <Removed noun="floor plan" count={a.draft!.removedFloorplans.length} onUndo={a.putPlansBack} />}
        <div className="nl-adv-photos">
          {a.plans.map((f, i) => (
            <div key={f.id} className="nl-adv-ph nl-adv-ph--plan">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.thumb} alt="" />
              {canEdit && (
                <button type="button" className="nl-adv-ph-x" title="Remove this floor plan" aria-label={`Remove floor plan ${i + 1}`} onClick={() => a.removePlan(f.id)}>
                  <LineIcon name="trash" size={13} />
                </button>
              )}
            </div>
          ))}
          {canEdit && details.floorplans.length < 5 && (
            <button type="button" className="nl-adv-ph-add" onClick={() => setDrop("floorplan")}>
              <Ico name="plus" size={18} />
              Add floor plan
            </button>
          )}
        </div>
        {!a.plans.length && <p className="nl-meta">No floor plan yet. Rightmove shows a Floorplan button on the gallery when there is one.</p>}
      </div>
    );
  };

  /* ── the drawer ──────────────────────────────────────────────────────── */

  const allIn = doneN === ORDER.length;
  const ring = (
    <span className="nl-adv-ring" style={{ ["--p" as string]: input ? doneN / ORDER.length : 0 }} role="img" aria-label={input ? `${doneN} of ${ORDER.length} steps done` : "Loading"}>
      <b>{input ? `${doneN}/${ORDER.length}` : "-"}</b>
    </span>
  );

  const changed = a.changed;
  const note = a.note;
  const footText =
    changed.length > 0
      ? `Not saved yet: ${changed.map((k: keyof Draft) => CHANGE_WORDS[k]).join(", ")}.${note && (note.tone === "bad" || changed.every((k) => String(k).startsWith("epc"))) ? ` ${note.text}` : ""}`
      : note
        ? note.text
        : !input
          ? ""
          : live
            ? "Live on Rightmove, OnTheMarket and Zoopla"
            : allIn
              ? publish && !publish.ready
                ? `Not until ${publish.why}.`
                : "Ready to go"
              : `${plural(togo, "step")} to go`;

  return (
    <div className={`nl-adv-wrap${closing ? " is-closing" : ""}`} data-look="new">
      <button type="button" className="nl-adv-scrim" aria-label="Close" tabIndex={-1} onClick={close} />
      <aside className="nl-adv-drawer" role="dialog" aria-label="Edit the Advert">
        <header className="nl-adv-head">
          <div className="nl-adv-headtext">
            <div className="nl-eyebrow">{address}</div>
            {propertyId && <OsAddressLine compact propertyId={propertyId} listingId={listingId} shown={address} onChanged={onAddress} />}
            <h2 className="nl-adv-title">Edit the Advert</h2>
            <p className="nl-meta">The facts, the advert and the photos. What a tenant sees, one step at a time.</p>
          </div>
          {ring}
          <button type="button" className="nl-iconbtn nl-iconbtn--sm nl-adv-x" aria-label="Close" title="Close (Esc)" onClick={close}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className="nl-adv-body" ref={bodyRef}>
          {!canEdit && lockedNote && <p className="nl-adv-locked"><Ico name="lock" size={15} /> {lockedNote}</p>}

          {a.error && !details ? (
            <div className="nl-adv-state">
              <b>The listing did not load</b>
              <p className="nl-meta">Nothing is shown rather than an old copy.</p>
              <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm" onClick={() => void a.load()}>Try again</button>
            </div>
          ) : !details || !draft ? (
            <div className="nl-adv-state is-loading">
              <span className="nl-adv-spin" aria-hidden />
              <span className="nl-meta">Loading the listing…</span>
            </div>
          ) : previewing ? (
            <div className="nl-adv-preview">
              <div className="nl-adv-preview-bar">
                <div className="nl-toggle" role="tablist" aria-label="Portal">
                  {PORTAL_TABS.map((t) => (
                    <button key={t.id} type="button" role="tab" aria-selected={portal === t.id} className={portal === t.id ? "is-on" : ""} onClick={() => setPortal(t.id)}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={t.logo} alt="" />
                      {t.label}
                    </button>
                  ))}
                </div>
                <p className="nl-meta">A close likeness of each portal&apos;s page.{canEdit ? " Click anything with a dashed outline to change it." : ""}</p>
              </div>
              <PortalPreview portal={portal} details={details} draft={draft} setDraft={setDraft} canEdit={canEdit} onAddPhotos={() => setDrop("photos")} />
            </div>
          ) : (
            <>
              <section className="nl-adv-fill">
                <SteveFace size={40} mood={a.filling === "all" ? "thinking" : allIn ? "happy" : "idle"} />
                <div className="nl-adv-fill-text">
                  <b>{a.filling === "all" ? "Reading the photos, the last listing and the EPC…" : allIn ? "Ready for the portals" : "Let Steve fill this in"}</b>
                  <span className="nl-meta">
                    {allIn
                      ? `Everything the portals need is here${a.recDone < RECOMMENDED.length ? `, and ${a.recDone} of ${RECOMMENDED.length} of the nice-to-haves` : ""}. Preview it, then push it live.`
                      : "From the photos, the last listing, the landlord's answers and the local market. Photos and floor plans are yours."}
                  </span>
                </div>
                <div className="nl-adv-fill-acts">
                  {canEdit && (
                    <button type="button" className="nl-btn nl-btn--primary" onClick={() => void a.fill("all")} disabled={a.filling !== null}>
                      {a.filling === "all" ? <span className="nl-adv-spin" aria-hidden /> : <Wand size={15} />}
                      {a.filling === "all" ? "Looking it all up…" : "Fill it in for me"}
                    </button>
                  )}
                  <GuideButton id="listings" />
                </div>
                {a.fillNote && <p className="nl-adv-fill-note">{a.fillNote}</p>}
              </section>

              <ol className="nl-adv-steps">
                {ORDER.map((s, i) => {
                  const isOpen = open === s;
                  const done = stepDone(s);
                  const next = ORDER[i + 1];
                  return (
                    <li key={s} data-step={s} className={`nl-adv-step${isOpen ? " is-open" : ""}${done ? " is-done" : ""}`}>
                      <button type="button" className="nl-adv-step-head" aria-expanded={isOpen} onClick={() => goStep(isOpen ? null : s)}>
                        <span className="nl-adv-tick">{done ? <Ico name="check" size={13} /> : i + 1}</span>
                        <span className="nl-adv-step-name">{STEP_NAMES[s]}</span>
                        <span className="nl-adv-step-sum">{summary(s)}</span>
                        <svg className="nl-adv-caret" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M9 6l6 6-6 6" />
                        </svg>
                      </button>
                      <div className={`nl-collapse${isOpen ? " is-open" : ""}`}>
                        <div>
                          {(isOpen || leaving === s) && (
                            <div className="nl-adv-step-body">
                              {body(s)}
                              {next && (
                                <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm nl-adv-next" onClick={() => goStep(next)}>
                                  Next: {STEP_NAMES[next]}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </div>

        {details && draft && (
          <footer className="nl-adv-foot">
            <button type="button" className="nl-btn nl-btn--quiet" onClick={() => { setPreviewing((p) => !p); bodyRef.current?.scrollTo({ top: 0 }); }}>
              {previewing ? <Ico name="back" /> : <Ico name="arrow" />}
              {previewing ? "Back to the advert" : "Preview on the portals"}
            </button>
            <span className={`nl-adv-foot-text${note?.tone === "bad" ? " is-bad" : ""}`}>{footText}</span>
            {changed.length > 0 ? (
              <span className="nl-adv-foot-acts">
                <button type="button" className="nl-btn nl-btn--secondary" disabled={a.saving} onClick={a.discard}>Discard</button>
                <button type="button" className="nl-btn nl-btn--primary" disabled={a.saving || !canEdit} onClick={() => void a.save()}>
                  {a.saving ? "Saving…" : "Save"}
                </button>
              </span>
            ) : (
              <span className="nl-adv-foot-acts">
                {note && <button type="button" className="nl-btn nl-btn--quiet nl-btn--sm" onClick={() => a.setNote(null)}>Dismiss</button>}
                {publish && !live && (
                  <button type="button" data-steve-never className="nl-btn nl-btn--primary" disabled={!publish.ready} title={publish.ready ? "Goes to Rightmove, OnTheMarket and Zoopla." : `Not until ${publish.why}.`} onClick={publish.onPress}>
                    <Ico name="megaphone" /> Push to the portals
                  </button>
                )}
              </span>
            )}
          </footer>
        )}
      </aside>

      {drop && details && (
        <DropZone
          kind={drop}
          refId={`listing-${details.id}`}
          propertyId={details.propertyId}
          address={details.address}
          onClose={() => setDrop(null)}
          afterUpload={(f) => a.sendToListing(drop === "photos" ? "photo" : "floorplan", f.key)}
        />
      )}
    </div>
  );
}

/** Said once over the grid while photos wait to come off: nothing leaves the listing until Save. */
function Removed({ count, onUndo, noun = "photo" }: { count: number; onUndo: () => void; noun?: string }) {
  return (
    <p className="nl-meta nl-adv-removed">
      <span>{count === 1 ? `1 ${noun} comes` : `${count} ${noun}s come`} off the listing when you press Save.</span>
      <button type="button" className="nl-link" onClick={onUndo}>Put {count === 1 ? "it" : "them"} back</button>
    </p>
  );
}

/** The design's wand: Steve's lookups. */
function Wand({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 20 15 9M14 5l1-2 1 2 2 1-2 1-1 2-1-2-2-1zM19 12l.6-1.2L21 10l-1.4-.8L19 8l-.6 1.2L17 10l1.4.8z" />
    </svg>
  );
}
