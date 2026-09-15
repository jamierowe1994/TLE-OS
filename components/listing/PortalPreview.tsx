"use client";

import { useState, type ReactNode } from "react";
import type { ListingDetails } from "@/lib/listing-details";
import { fiveWeeks, longDate, money, orderedImages, perWeek, type Draft } from "@/components/listing/listing-draft";

/**
 * THE ADVERT AS EACH PORTAL WILL SHOW IT (James, 15 Sep 2026).
 *
 * Rightmove, OnTheMarket and Zoopla, each drawn close to its own listing page
 * - their colours, their order of things, their "Ask agent" where a field is
 * empty - from the same draft the Marketing tab edits. Click a part of the
 * advert to change it there: the main photo, the price, the key features,
 * the description, the rooms.
 *
 * It is a likeness, not their code: the portals restyle their pages without
 * telling anybody, so this shows what WE send and roughly where it lands, not
 * a pixel promise. What the portal fills in itself (Rightmove's broadband
 * estimate, nearest stations) is shown as theirs, not ours.
 */

export type Portal = "rightmove" | "onthemarket" | "zoopla";

export const PORTAL_TABS: { id: Portal; label: string; logo: string }[] = [
  { id: "rightmove", label: "Rightmove", logo: "/brand/rightmove.png" },
  { id: "onthemarket", label: "OnTheMarket", logo: "/brand/onthemarket.png" },
  { id: "zoopla", label: "Zoopla", logo: "/brand/zoopla.png" },
];

type Spot = "photo" | "price" | "deposit" | "available" | "rooms" | "features" | "heading" | "body";

interface Props {
  portal: Portal;
  details: ListingDetails;
  draft: Draft;
  setDraft: (fn: (d: Draft) => Draft) => void;
  canEdit: boolean;
  onAddPhotos: () => void;
}

const ASK = "Ask agent";

function typeWord(d: ListingDetails, style: "rightmove" | "short") {
  const t = (d.propertyType ?? "property").toLowerCase();
  if (style === "short") return /apartment|flat/.test(t) ? "flat" : t;
  return t;
}

export default function PortalPreview({ portal, details, draft, setDraft, canEdit, onAddPhotos }: Props) {
  const [editing, setEditing] = useState<Spot | null>(null);
  const [picking, setPicking] = useState(false);
  const images = orderedImages(details, draft);
  const district = details.postcode.split(" ")[0] ?? "";

  /** A part of the advert you can click to change. */
  const editable = (spot: Spot, label: string, view: ReactNode, editor: ReactNode, className = "") =>
    !canEdit ? (
      <div className={className}>{view}</div>
    ) : editing === spot ? (
      <div className={`relative rounded-lg bg-white p-2 shadow-[0_0_0_2px_var(--accent-dark)] ${className}`}>
        {editor}
        <div className="mt-2 flex justify-end">
          <button type="button" onClick={() => setEditing(null)} className="rounded-full bg-[var(--brown)] px-3.5 py-1.5 text-[11.5px] font-semibold text-white">
            Done
          </button>
        </div>
      </div>
    ) : (
      <div
        role="button"
        tabIndex={0}
        onClick={() => setEditing(spot)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setEditing(spot))}
        className={`group relative cursor-pointer rounded-lg outline-offset-4 transition-[outline-color] hover:outline hover:outline-2 hover:outline-dashed hover:outline-[var(--accent-dark)] ${className}`}
      >
        {view}
        <span className="pointer-events-none absolute -top-3 right-1 rounded-full bg-[var(--accent-dark)] px-2 py-0.5 text-[10px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
          Edit {label}
        </span>
      </div>
    );

  const inputCls = "w-full rounded-md border border-[#d9d9de] px-2.5 py-1.5 text-[13px] text-[#262637] outline-none focus:border-[#262637]";
  const numberEditor = (key: "rent" | "deposit", hint?: string | null) => (
    <label className="block text-[11.5px] text-[#6b6b76]">
      {key === "rent" ? "Rent, per calendar month" : "Deposit"}
      <input
        type="number"
        min={0}
        autoFocus
        value={draft[key] ?? ""}
        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value))) }))}
        className={`${inputCls} mt-1`}
      />
      {hint && <span className="mt-1 block">{hint}</span>}
    </label>
  );
  const availableEditor = (
    <label className="block text-[11.5px] text-[#6b6b76]">
      Available from
      <input type="date" autoFocus value={draft.availableFrom ?? ""} onChange={(e) => setDraft((d) => ({ ...d, availableFrom: e.target.value || null }))} className={`${inputCls} mt-1`} />
    </label>
  );
  const roomsEditor = (
    <div className="grid grid-cols-3 gap-2">
      {(["beds", "baths", "receptions"] as const).map((k) => (
        <label key={k} className="block text-[11.5px] text-[#6b6b76]">
          {k === "beds" ? "Bedrooms" : k === "baths" ? "Bathrooms" : "Receptions"}
          <input
            type="number"
            min={0}
            max={50}
            value={draft[k] ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value === "" ? null : Math.max(0, Math.min(50, Math.round(Number(e.target.value)))) }))}
            className={`${inputCls} mt-1`}
          />
        </label>
      ))}
    </div>
  );
  const featuresEditor = (
    <div>
      <p className="mb-1 text-[11.5px] text-[#6b6b76]">One per line - the portals show up to 10.</p>
      <textarea
        autoFocus
        rows={Math.min(10, Math.max(4, draft.highlights.length + 1))}
        value={draft.highlights.join("\n")}
        onChange={(e) => setDraft((d) => ({ ...d, highlights: e.target.value.split("\n").slice(0, 10) }))}
        className={`${inputCls} leading-relaxed`}
      />
    </div>
  );
  const headingEditor = (
    <div>
      <input autoFocus maxLength={255} value={draft.heading} onChange={(e) => setDraft((d) => ({ ...d, heading: e.target.value }))} className={inputCls} />
      <p className="mt-1 text-right text-[10.5px] text-[#6b6b76]">{draft.heading.length}/255</p>
    </div>
  );
  const bodyEditor = (
    <textarea autoFocus rows={12} value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} className={`${inputCls} leading-relaxed`} />
  );

  const main = images[0];
  const photoSpot = (className: string, tag: ReactNode) => (
    <div className={`group relative min-h-0 overflow-hidden bg-[#eceef1] ${className}`}>
      {main ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={main.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center text-[13px] text-[#6b6b76]">No photos - REX will not publish without one</div>
      )}
      {tag}
      {canEdit && (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/95 px-4 py-2 text-[12.5px] font-semibold text-[#262637] opacity-0 shadow-lg transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
        >
          Change main photo
        </button>
      )}
    </div>
  );
  const thumb = (i: number, className: string) => (
    <div className={`relative min-h-0 overflow-hidden bg-[#eceef1] ${className}`}>
      {images[i] && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={images[i].thumb} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
    </div>
  );

  const rent = draft.rent;
  const beds = draft.beds;
  const features = draft.highlights.map((h) => h.trim()).filter(Boolean);
  const depositHint = fiveWeeks(rent) != null ? `Five weeks' rent is ${money(fiveWeeks(rent))} - the most a deposit can be here.` : null;
  const orAsk = (v: string | null | undefined) => v ?? ASK;
  const askMark = (v: string | null | undefined) => (v ? "" : "text-[#9a4b43]");

  const picker = picking && (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={() => setPicking(false)}>
      <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[15px] font-semibold text-[#262637]">Pick the main photo</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setPicking(false); onAddPhotos(); }} className="rounded-full border border-[#d9d9de] px-3.5 py-1.5 text-[12px] font-semibold">
              Add photos
            </button>
            <button type="button" onClick={() => setPicking(false)} className="rounded-full border border-[#d9d9de] px-3 py-1.5 text-[12px]">
              Close
            </button>
          </div>
        </div>
        <p className="mt-1 text-[12px] text-[#6b6b76]">The first photo is the one every portal shows in its search results.</p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => {
                setDraft((d) => ({ ...d, imageOrder: [img.id, ...orderedImages(details, d).map((x) => x.id).filter((x) => x !== img.id)] }));
                setPicking(false);
              }}
              className={`relative overflow-hidden rounded-lg border-2 ${i === 0 ? "border-[#262637]" : "border-transparent hover:border-[#9aa0a6]"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.thumb} alt="" className="aspect-[4/3] w-full object-cover" />
              {i === 0 && <span className="absolute left-1.5 top-1.5 rounded bg-[#262637] px-1.5 py-0.5 text-[10px] font-semibold text-white">Main photo</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const floorplan = details.floorplans[0];
  const epcChart = details.epc.chartUrl;

  /* ── Rightmove ─────────────────────────────────────────────────────── */
  if (portal === "rightmove") {
    const title = `${beds ?? "?"} bedroom ${typeWord(details, "rightmove")} for rent`;
    return (
      <div className="overflow-hidden rounded-xl border border-[#e3e3e8] bg-white text-[#262637]" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
        {picker}
        <div className="flex items-center gap-2 border-b border-[#e3e3e8] px-4 py-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/rightmove.png" alt="" className="h-6 w-6 rounded" />
          <span className="text-[17px] font-bold tracking-tight">rightmove</span>
          <span className="ml-auto text-[11px] text-[#6b6b76]">To rent</span>
        </div>
        <div className="grid h-[260px] grid-cols-3 grid-rows-1 gap-1 overflow-hidden sm:h-[320px]">
          {photoSpot("col-span-2 h-full", (
            <span className="absolute bottom-2 left-2 flex gap-1.5 text-[11px] font-bold">
              <span className="rounded bg-black/70 px-2 py-1 text-white">1/{images.length}</span>
              {floorplan && <span className="rounded bg-white px-2 py-1">Floorplan</span>}
            </span>
          ))}
          <div className="grid h-full min-h-0 grid-rows-2 gap-1">
            {thumb(1, "h-full")}
            {thumb(2, "h-full")}
          </div>
        </div>
        <div className="grid gap-6 p-4 sm:p-5 lg:grid-cols-[1fr_240px]">
          <div className="min-w-0 space-y-5">
            <div>
              <p className="text-[13px] text-[#6b6b76]">{title}</p>
              <p className="text-[18px] font-bold leading-snug">{[details.streetName, details.town, district].filter(Boolean).join(", ")}</p>
              {editable(
                "price",
                "rent",
                <p className="mt-1 text-[26px] font-bold">
                  {money(rent) ?? "Price on application"} <span className="text-[15px]">pcm</span>
                  {rent != null && <span className="ml-2 text-[13px] font-normal text-[#6b6b76]">{money(perWeek(rent))} pw</span>}
                </p>,
                numberEditor("rent"),
                "inline-block"
              )}
            </div>
            {editable(
              "rooms",
              "rooms",
              <div className="grid grid-cols-3 gap-x-4 border-y border-[#e3e3e8] py-3 text-[10.5px] sm:text-[12px]">
                <div className="min-w-0"><p className="leading-tight text-[#6b6b76]">PROPERTY TYPE</p><p className="mt-1 text-[15px] font-bold">{details.propertyType ?? ASK}</p></div>
                <div className="min-w-0"><p className="leading-tight text-[#6b6b76]">BEDROOMS</p><p className="mt-1 text-[15px] font-bold">×{beds ?? "?"}</p></div>
                <div className="min-w-0"><p className="leading-tight text-[#6b6b76]">BATHROOMS</p><p className="mt-1 text-[15px] font-bold">×{draft.baths ?? "?"}</p></div>
              </div>,
              roomsEditor
            )}
            <section>
              <h3 className="text-[18px] font-bold">Letting details</h3>
              <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
                <div>{editable("available", "date", <><dt className="text-[#6b6b76]">Let available date:</dt><dd className="font-bold">{draft.availableFrom ? new Date(`${draft.availableFrom}T00:00:00`).toLocaleDateString("en-GB") : "Now"}</dd></>, availableEditor)}</div>
                <div>{editable("deposit", "deposit", <><dt className="text-[#6b6b76]">Deposit:</dt><dd className="font-bold">{money(draft.deposit) ?? ASK}</dd></>, numberEditor("deposit", depositHint))}</div>
                <div><dt className="text-[#6b6b76]">Min. Tenancy:</dt><dd className="font-bold">{ASK}</dd></div>
                <div><dt className="text-[#6b6b76]">Let type:</dt><dd className="font-bold">{details.letType ?? ASK}</dd></div>
                <div><dt className="text-[#6b6b76]">Furnish type:</dt><dd className="font-bold">{ASK}</dd></div>
                <div><dt className="text-[#6b6b76]">Council Tax:</dt><dd className={`font-bold ${askMark(details.councilTaxBand)}`}>{details.councilTaxBand ? `Band ${details.councilTaxBand}` : ASK}</dd></div>
              </dl>
            </section>
            {editable(
              "features",
              "key features",
              <section>
                <h3 className="text-[18px] font-bold">Key features</h3>
                {features.length ? (
                  <ul className="mt-2 grid gap-x-6 gap-y-1.5 text-[13.5px] sm:grid-cols-2">
                    {features.map((f, i) => <li key={i} className="flex gap-2"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#262637]" />{f}</li>)}
                  </ul>
                ) : (
                  <p className="mt-2 text-[13px] text-[#9a4b43]">No key features - Rightmove leaves this section out.</p>
                )}
              </section>,
              featuresEditor
            )}
            {editable(
              "body",
              "description",
              <section>
                <h3 className="text-[18px] font-bold">Property description</h3>
                <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed">{draft.body || "No description."}</p>
              </section>,
              bodyEditor
            )}
            {floorplan && (
              <section>
                <h3 className="text-[18px] font-bold">Floorplan</h3>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={floorplan.url} alt="" className="mt-2 max-h-72 rounded border border-[#e3e3e8] object-contain" />
              </section>
            )}
            <section>
              <h3 className="text-[18px] font-bold">Utilities, rights and restrictions</h3>
              <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
                {[
                  ["Electricity", details.material.electricity],
                  ["Water", details.material.water],
                  ["Heating", details.material.gas === "No" ? "No gas supply" : details.material.gas === "Yes" ? "Gas" : null],
                  ["Sewerage", details.material.sewerage],
                  ["Broadband", details.material.broadband],
                  ["Parking", details.parking],
                ].map(([k, v]) => (
                  <div key={k as string}><dt className="text-[#6b6b76]">{k}</dt><dd className={`font-bold ${askMark(v)}`}>{orAsk(v)}</dd></div>
                ))}
              </dl>
              <p className="mt-2 text-[11px] text-[#6b6b76]">Rightmove adds its own broadband speed estimate and nearest stations from the postcode.</p>
            </section>
            {epcChart && (
              <section>
                <h3 className="text-[18px] font-bold">Energy performance certificate (EPC)</h3>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={epcChart} alt="" className="mt-2 max-h-56 rounded border border-[#e3e3e8] object-contain" />
              </section>
            )}
          </div>
          <aside className="h-fit rounded-lg border border-[#e3e3e8] p-4 text-[13px]">
            <p className="text-[11px] text-[#6b6b76]">MARKETED BY</p>
            <p className="mt-1 font-bold">The Letting Experts</p>
            <button type="button" className="mt-3 w-full rounded bg-[#00deb6] py-2.5 text-[13px] font-bold text-[#262637]">Request details</button>
            <button type="button" className="mt-2 w-full rounded border border-[#262637] py-2.5 text-[13px] font-bold">Call agent</button>
          </aside>
        </div>
      </div>
    );
  }

  /* ── OnTheMarket ───────────────────────────────────────────────────── */
  if (portal === "onthemarket") {
    const title = `${beds ?? "?"} bedroom ${typeWord(details, "short")} to rent`;
    return (
      <div className="overflow-hidden rounded-xl border border-[#e6e1dc] bg-white text-[#1c2a39]" style={{ fontFamily: "Helvetica, Arial, sans-serif" }}>
        {picker}
        <div className="flex items-center gap-2 bg-[#1c2a39] px-4 py-2.5 text-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/onthemarket.png" alt="" className="h-6 w-6 object-contain" />
          <span className="text-[16px] font-bold">OnTheMarket</span>
        </div>
        {photoSpot("h-[260px] sm:h-[340px]", (
          <span className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-white">{images.length} photos{floorplan ? " · Floorplan" : ""}</span>
        ))}
        <div className="flex gap-1 overflow-x-auto bg-[#f6f3f0] p-1">
          {images.slice(1, 7).map((img) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={img.id} src={img.thumb} alt="" className="h-14 w-20 shrink-0 object-cover" />
          ))}
        </div>
        <div className="grid gap-6 p-4 sm:p-5 lg:grid-cols-[1fr_240px]">
          <div className="min-w-0 space-y-5">
            <div>
              {editable("price", "rent", <p className="text-[28px] font-bold">{money(rent) ?? "POA"} pcm <span className="text-[14px] font-normal text-[#5c6b7a]">({money(perWeek(rent))} pw)</span></p>, numberEditor("rent"), "inline-block")}
              {editable("rooms", "rooms", <p className="mt-1 text-[17px] font-semibold">{title}</p>, roomsEditor)}
              <p className="text-[14px] text-[#5c6b7a]">{[details.streetName, details.town, details.postcode].filter(Boolean).join(", ")}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
                <span className="rounded-full bg-[#f6f3f0] px-3 py-1">{beds ?? "?"} bed</span>
                <span className="rounded-full bg-[#f6f3f0] px-3 py-1">{draft.baths ?? "?"} bath</span>
                {draft.receptions ? <span className="rounded-full bg-[#f6f3f0] px-3 py-1">{draft.receptions} reception</span> : null}
                {editable("available", "date", <span className="rounded-full bg-[#f6f3f0] px-3 py-1">Available {longDate(draft.availableFrom) ?? "now"}</span>, availableEditor, "inline-block")}
              </div>
            </div>
            {editable(
              "features",
              "key features",
              <section>
                <h3 className="text-[17px] font-bold">Key features</h3>
                <ol className="mt-2 space-y-1.5 text-[13.5px]">
                  {features.map((f, i) => <li key={i} className="flex gap-2.5"><span className="w-5 shrink-0 font-bold text-[#e5594b]">{i + 1}.</span>{f}</li>)}
                  {!features.length && <li className="text-[#9a4b43]">None sent.</li>}
                </ol>
              </section>,
              featuresEditor
            )}
            {editable("heading", "headline", <p className="text-[16px] font-semibold leading-snug">{draft.heading || "No headline"}</p>, headingEditor)}
            {editable("body", "description", <section><h3 className="text-[17px] font-bold">Description</h3><p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed">{draft.body || "No description."}</p></section>, bodyEditor)}
            <section>
              <h3 className="text-[17px] font-bold">Letting details</h3>
              <dl className="mt-2 divide-y divide-[#eee7e1] text-[13px]">
                {[
                  ["Deposit", money(draft.deposit)],
                  ["Council tax band", details.councilTaxBand],
                  ["Parking", details.parking],
                  ["Broadband", details.material.broadband],
                  ["Water", details.material.water],
                  ["Sewerage", details.material.sewerage],
                ].map(([k, v]) => (
                  <div key={k as string} className="flex justify-between py-1.5">
                    <dt>{k}</dt>
                    <dd className={`font-semibold ${askMark(v)}`}>
                      {k === "Deposit" && canEdit ? editable("deposit", "deposit", <span>{orAsk(v)}</span>, numberEditor("deposit", depositHint), "inline-block") : orAsk(v)}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-[11px] text-[#5c6b7a]">OnTheMarket adds its own broadband and mobile coverage from Ofcom.</p>
            </section>
            {floorplan && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={floorplan.url} alt="" className="max-h-72 rounded border border-[#eee7e1] object-contain" />
            )}
          </div>
          <aside className="h-fit rounded-lg bg-[#f6f3f0] p-4 text-[13px]">
            <p className="font-bold">The Letting Experts</p>
            <button type="button" className="mt-3 w-full rounded-full bg-[#e5594b] py-2.5 text-[13px] font-bold text-white">Email agent</button>
            <button type="button" className="mt-2 w-full rounded-full border border-[#1c2a39] py-2.5 text-[13px] font-bold">Call agent</button>
          </aside>
        </div>
      </div>
    );
  }

  /* ── Zoopla ────────────────────────────────────────────────────────── */
  return (
    <div className="overflow-hidden rounded-xl border border-[#e7e3f3] bg-white text-[#1d1b3a]" style={{ fontFamily: "Helvetica, Arial, sans-serif" }}>
      {picker}
      <div className="flex items-center gap-2 border-b border-[#e7e3f3] px-4 py-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/zoopla.png" alt="" className="h-6 w-6 rounded object-contain" />
        <span className="text-[17px] font-bold text-[#8046f1]">Zoopla</span>
      </div>
      <div className="grid h-[260px] grid-cols-4 grid-rows-2 gap-1 overflow-hidden sm:h-[320px]">
        {photoSpot("col-span-2 row-span-2 h-full", (
          <span className="absolute bottom-2 left-2 rounded-md bg-white px-2 py-1 text-[11px] font-semibold">{images.length} photos</span>
        ))}
        {thumb(1, "h-full")}
        {thumb(2, "h-full")}
        {thumb(3, "h-full")}
        {thumb(4, "h-full")}
      </div>
      <div className="grid gap-6 p-4 sm:p-5 lg:grid-cols-[1fr_240px]">
        <div className="min-w-0 space-y-5">
          <div>
            {editable("price", "rent", <p className="text-[28px] font-bold">{money(rent) ?? "POA"} pcm</p>, numberEditor("rent"), "inline-block")}
            <p className="text-[13px] text-[#5d5a78]">{money(perWeek(rent))} pw</p>
            {editable("rooms", "rooms", (
              <div>
                <p className="mt-2 text-[17px] font-semibold">{beds ?? "?"} bed {typeWord(details, "short")} to rent</p>
                <p className="mt-2 flex flex-wrap gap-x-2 text-[13px] text-[#5d5a78]">
                  <span>{beds ?? "?"} bed</span><span aria-hidden>·</span>
                  <span>{draft.baths ?? "?"} bath</span>
                  {draft.receptions ? <><span aria-hidden>·</span><span>{draft.receptions} reception</span></> : null}
                </p>
              </div>
            ), roomsEditor)}
            <p className="mt-1 text-[14px] text-[#5d5a78]">{[details.streetName, details.town, details.postcode].filter(Boolean).join(", ")}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-[12px]">
            {editable("available", "date", <span className="rounded-md bg-[#f1ecfd] px-2.5 py-1 font-semibold text-[#5b2bc4]">Available from {longDate(draft.availableFrom) ?? "now"}</span>, availableEditor, "inline-block")}
            {editable("deposit", "deposit", <span className="rounded-md bg-[#f1ecfd] px-2.5 py-1 font-semibold text-[#5b2bc4]">Deposit {money(draft.deposit) ?? ASK}</span>, numberEditor("deposit", depositHint), "inline-block")}
          </div>
          {editable("heading", "headline", <p className="text-[16px] font-semibold leading-snug">{draft.heading || "No headline"}</p>, headingEditor)}
          {editable(
            "features",
            "features",
            <section>
              <h3 className="text-[17px] font-bold">Features</h3>
              <ul className="mt-2 flex flex-wrap gap-2 text-[12.5px]">
                {features.map((f, i) => <li key={i} className="rounded-full border border-[#e7e3f3] px-3 py-1">{f}</li>)}
                {!features.length && <li className="text-[#9a4b43]">None sent.</li>}
              </ul>
            </section>,
            featuresEditor
          )}
          {editable("body", "description", <section><h3 className="text-[17px] font-bold">About this property</h3><p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed">{draft.body || "No description."}</p></section>, bodyEditor)}
          <section>
            <h3 className="text-[17px] font-bold">Material information</h3>
            <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
              {[
                ["Council tax", details.councilTaxBand ? `Band ${details.councilTaxBand}` : null],
                ["Electricity", details.material.electricity],
                ["Water", details.material.water],
                ["Sewerage", details.material.sewerage],
                ["Broadband", details.material.broadband],
                ["Parking", details.parking],
                ["EPC rating", details.epc.rating],
              ].map(([k, v]) => (
                <div key={k as string}><dt className="text-[#5d5a78]">{k}</dt><dd className={`font-semibold ${askMark(v)}`}>{orAsk(v)}</dd></div>
              ))}
            </dl>
          </section>
          {floorplan && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={floorplan.url} alt="" className="max-h-72 rounded border border-[#e7e3f3] object-contain" />
          )}
        </div>
        <aside className="h-fit rounded-xl border border-[#e7e3f3] p-4 text-[13px]">
          <p className="font-bold">The Letting Experts</p>
          <button type="button" className="mt-3 w-full rounded-lg bg-[#8046f1] py-2.5 text-[13px] font-bold text-white">Contact agent</button>
          <button type="button" className="mt-2 w-full rounded-lg border border-[#1d1b3a] py-2.5 text-[13px] font-bold">Call</button>
        </aside>
      </div>
    </div>
  );
}
