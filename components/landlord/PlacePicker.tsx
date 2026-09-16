"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";
import type { LandlordPlace } from "@/lib/landlord-account";

/**
 * WHICH PROPERTY, at the top of the phone's menu.
 *
 * James, 16 Sep 2026: "if a landlord has multiple properties ... when we click
 * the navigation bar and the things slide out across the top of it, it will
 * show the name of the property. They can click that if they have multiple,
 * and then it will give a dropdown. They can select their property, and it
 * will launch them into that property. If they don't have multiple properties,
 * then keep it blank."
 *
 * The last sentence is the whole design. A landlord with one property is the
 * common case by a distance, and for them a chooser is a control that offers a
 * choice they do not have - so there is nothing there at all, not a disabled
 * pill or a list of one.
 *
 * ── Why it lives in the menu and not on the page ───────────────────────────
 *
 * Because the property is not a property of the PAGE. Home, Journey, Documents
 * and Maintenance are four views of the same one, and a switcher repeated on
 * each is four controls that have to agree. In the menu it sits above the
 * four things it governs, which is also where it reads as governing them.
 *
 * ── Why the address bar and not a cookie ───────────────────────────────────
 *
 * The choice rides in ?p=, so the back button, a reload and a shared link all
 * say the same thing. A landlord who sends their spouse the link to "the
 * Bristol flat" sends them the Bristol flat.
 */
export default function PlacePicker({ places }: { places: LandlordPlace[] }) {
  const router = useRouter();
  const path = usePathname() ?? "/landlord";
  const params = useSearchParams();
  const [open, setOpen] = useState(false);

  /* One property, or none: nothing to choose between, so nothing to show. */
  if (places.length < 2) return null;

  /* Straight off the address bar. Falling back to the first in the list is
     not a guess: landlordPlaces orders it the way loadLandlordHome picks, so
     with no ?p= the two agree by construction. */
  const here = places.find((p) => p.key === params?.get("p")) ?? places[0];

  const go = (key: string) => {
    const next = new URLSearchParams(params?.toString() ?? "");
    next.set("p", key);
    setOpen(false);
    /* The same page, the other property - not home. Somebody comparing the
       documents on two flats should stay on documents. */
    router.push(`${path}?${next.toString()}`);
  };

  return (
    <div className="mb-5 ml-auto w-[62%] text-right">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-accent-dark/55">Your property</p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-1 flex w-full items-start justify-end gap-2 text-right"
      >
        <span className="min-w-0 text-[15px] font-bold leading-tight">{here.name}</span>
        <span
          aria-hidden
          className="mt-[3px] shrink-0 transition-transform"
          style={{ transform: open ? "rotate(180deg)" : undefined }}
        >
          <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]">
            <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {open && (
        <ul className="mt-3 space-y-1 rounded-2xl bg-white/70 p-2">
          {places.map((p) => {
            const on = p.key === here.key;
            return (
              <li key={p.key}>
                <button
                  type="button"
                  onClick={() => go(p.key)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left ${
                    on ? "bg-accent-soft" : ""
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold leading-snug">{p.name}</span>
                    <span className="block truncate text-[11px] text-muted">
                      {p.locality}
                      {p.kind === "appraisal" ? " · being set up" : ""}
                    </span>
                  </span>
                  {on && (
                    <span className="shrink-0 text-accent-dark">
                      <DoodleIcon name="checklist" size={14} />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
