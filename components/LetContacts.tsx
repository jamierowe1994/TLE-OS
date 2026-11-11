"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ContactBlock from "@/components/ContactBlock";

/**
 * EVERYONE ON THE LET, ONE PRESS AWAY (Sean McMahon, ticket 4171e58c,
 * 11 Nov 2026: "On the rental application page: ability to click through to
 * the listing and management pages; ability to email / WhatsApp tenants and
 * landlords from these pages").
 *
 * Each person could already be rung, WhatsApped and emailed - from the
 * People tab, a tab away from where the let opens - and the listing was a
 * line in the ... menu, with no way at all to the managed home's page. This
 * puts every tenant and landlord in one window from the top of the let, each
 * with Call, WhatsApp and Email (components/ContactBlock, the same buttons as
 * everywhere else, so an email is filed on their Activity), and the two pages
 * a click away. Changing their details stays on the People tab.
 */

export type LetContact = { key: string; name: string; email: string | null; phone: string | null; role: string };

export default function LetContacts({ open, onClose, address, tenants, landlords, listingHref, homeHref }: {
  open: boolean;
  onClose: () => void;
  address: string;
  tenants: LetContact[];
  landlords: LetContact[];
  listingHref: string | null;
  homeHref: string | null;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);
  if (!open || !mounted) return null;

  const group = (title: string, list: LetContact[], none: string) => (
    <section className="min-w-0">
      <p className="nl-compose-k">{title}</p>
      {list.length === 0 ? (
        <p className="mt-2 text-[12.5px] text-muted">{none}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2.5">
          {list.map((p) => (
            <li key={p.key} className="border border-line/80 bg-white px-4 py-3">
              <p className="text-[14px] font-medium">{p.name || "Name not recorded"}</p>
              <p className="text-[11.5px] text-muted">{p.role}</p>
              <ContactBlock
                showName={false}
                fixed
                role={p.role.toLowerCase().includes("landlord") ? "landlord" : "tenant"}
                person={{ name: p.name, email: p.email, phone: p.phone }}
                personRef={null}
                home={{ propertyAddress: address }}
                className="mt-2"
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return createPortal(
    <div data-look="new" className="nl-compose-wrap" style={{ zIndex: 420 }} onClick={onClose}>
      <aside className="nl-compose" style={{ height: "auto", maxHeight: "min(860px, calc(100dvh - 6vh))", width: "min(980px, 100%)" }} role="dialog" aria-label="Get in touch" onClick={(e) => e.stopPropagation()}>
        <header className="nl-compose-head">
          <div className="min-w-0">
            <p className="nl-compose-title">Get in Touch</p>
            <p className="nl-compose-to">{address}</p>
          </div>
          <button type="button" onClick={onClose} className="nl-compose-x" aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>
        <div className="grid min-h-0 gap-6 overflow-y-auto px-7 py-5 sm:grid-cols-2" data-let-contacts>
          {group(tenants.length > 1 ? `Tenants (${tenants.length})` : "Tenant", tenants, "No tenant on this let yet.")}
          {group(landlords.length > 1 ? `Landlords (${landlords.length})` : "Landlord", landlords, "No landlord named on this let yet. Add them on the People tab.")}
        </div>
        <div className="nl-compose-foot">
          <p className="text-[11px] leading-relaxed text-muted">Emails are filed on the person&apos;s Activity. Change their details on the People tab.</p>
          <span className="flex flex-wrap items-center gap-2">
            {listingHref && (
              <Link href={listingHref} className="nl-btn nl-btn--secondary nl-btn--sm">Open the Listing</Link>
            )}
            {homeHref && (
              <Link href={homeHref} className="nl-btn nl-btn--secondary nl-btn--sm">Open the Home&apos;s Page</Link>
            )}
          </span>
        </div>
      </aside>
    </div>,
    document.body
  );
}
