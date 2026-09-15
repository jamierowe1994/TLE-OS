"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import type { LandlordView } from "@/lib/landlord-view";

/**
 * EVERYTHING ABOUT THE PROPERTY, IN A SHEET. Phone only.
 *
 * James, 15 Sep 2026: "it should literally just say the house, and then we
 * should have a View Property Details button ... it should have a bottom
 * footer that will reveal all the info ... we can keep that hidden within the
 * property footer rather than trying to force it into a position like that."
 *
 * Right, and the card was doing the forcing: a photograph, an address, three
 * facts, two figures with a divider between them and a button, stacked into a
 * column four inches wide. On a phone the card should say WHICH HOUSE, and
 * everything else is an answer to a question nobody has asked yet.
 *
 * The snapshot comes with it - readiness, the service, both fees, marketing -
 * because it is the same question. Two cards on the home page asking a
 * landlord to remember which one held which number is one card too many.
 */
export default function PropertySheet({ v }: { v: LandlordView }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const had = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = had;
    };
  }, [open]);

  /* The property's own lines first, then the snapshot's - minus anything it
     has already said. Both carry the rent, so without this the sheet listed
     "Asking rent" twice, in two different wordings, a row apart. */
  const head: Array<[string, string]> = [
    ...(v.property.facts.length ? ([["The property", v.property.facts.join(" · ")]] as Array<[string, string]>) : []),
    ...(v.property.rent.figure
      ? ([[v.property.rent.caption, `${v.property.rent.figure} ${v.property.rent.unit}`]] as Array<[string, string]>)
      : []),
    ...(v.property.valuedOn ? ([["Valued on", v.property.valuedOn]] as Array<[string, string]>) : []),
  ];
  const said = new Set(head.map(([k]) => k.toLowerCase()));
  const rows: Array<[string, string]> = [...head, ...v.snapshot.lines.filter(([k]) => !said.has(k.toLowerCase()))];

  return (
    <div className="sm:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-5 inline-flex items-center gap-2 rounded-full border border-line/70 px-4 py-2.5 text-[12.5px] font-semibold"
      >
        View property details <span aria-hidden>→</span>
      </button>

      <div
        onClick={() => setOpen(false)}
        className="fixed inset-0 z-[57] bg-[#2b201d]/45 transition-opacity duration-300"
        style={{ opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none" }}
        aria-hidden
      />

      <div
        className="fixed inset-x-0 bottom-0 z-[58] max-h-[86vh] overflow-y-auto rounded-t-[26px] bg-white px-5 pt-3"
        style={{
          transform: open ? "translateY(0)" : "translateY(106%)",
          /**
           * THE SHADOW ONLY EXISTS WHEN THE SHEET DOES.
           *
           * It is cast UPWARDS, and the sheet parks just below the fold - so a
           * closed sheet was painting a band of shadow back across the bottom
           * of the screen. James, 15 Sep 2026: "where the phone cuts off, the
           * bottom section seems to have a bit of a shadow on the bottom,
           * which looks a little bit silly."
           */
          boxShadow: open ? "0 -24px 60px -28px rgba(40, 25, 20, 0.55)" : "none",
          transition: "transform 460ms cubic-bezier(0.22, 1, 0.36, 1)",
          paddingBottom: "calc(28px + env(safe-area-inset-bottom))",
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Property details"
        aria-hidden={!open}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="mx-auto mb-4 block h-1.5 w-11 rounded-full bg-line"
        />

        <h2 className="text-[19px] leading-tight">{v.property.address}</h2>
        {v.property.postcode && <p className="mt-0.5 text-[12.5px] text-muted">{v.property.postcode}</p>}

        <dl className="mt-5 divide-y divide-line/50">
          {rows.map(([k, val]) => (
            <div key={k} className="flex items-baseline justify-between gap-4 py-2.5 text-[13px]">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right font-semibold">{val}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-accent-soft/70 px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/80 text-accent-dark">
            <DoodleIcon name="home" size={15} />
          </span>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold">{v.snapshot.readinessPct}% ready</p>
            <p className="text-[11.5px] leading-snug text-muted">{v.snapshot.note}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
