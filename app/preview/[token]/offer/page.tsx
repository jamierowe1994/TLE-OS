"use client";

import { useState } from "react";
import AgentOfferRecorder, { type OfferHome, type OfferTenant } from "@/components/offers/AgentOfferRecorder";
import Toaster from "@/components/Toaster";
import { SOPHIE_PASSPORT } from "@/lib/tenant-sample";

/**
 * Putting an offer forward, the agent's screen, for the Showroom (1 Oct 2026).
 *
 * The real component (components/offers/AgentOfferRecorder) in its sample
 * mode: nothing is saved or sent. Sophie has a finished passport, so it all
 * arrives filled in; Tom has none, so it is asked as it goes. A preview page
 * rather than the OS one, so it opens on a phone from the Showroom's code
 * without signing in.
 */

const HOME: OfferHome = { id: "sample", address: "8 Recreation Terrace", locality: "Nottingham NG2", askingPcm: 850, beds: 2, photo: "/brand/photo/property.jpg" };
const TENANTS: OfferTenant[] = [
  { id: "sophie", name: "Sophie Turner", email: "sophie.sample@example.com", passport: SOPHIE_PASSPORT, passportDoneOn: "28 Sept 2026" },
  { id: "tom", name: "Tom Bradley", email: "tom.sample@example.com", passport: null, passportDoneOn: null },
];

export default function PreviewOffer() {
  const [who, setWho] = useState(TENANTS[0].id);
  const [run, setRun] = useState(0);
  const tenant = TENANTS.find((t) => t.id === who)!;
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">The agent&apos;s screen</p>
      <h1 className="mt-1 text-[26px] font-bold leading-tight">Putting an Offer Forward</h1>
      <p className="mt-1.5 max-w-2xl text-[13.5px] text-muted">On the phone or sitting down together, from what the tenant&apos;s passport already knows. Nothing here is saved or sent.</p>
      <div className="mb-4 mt-5 flex flex-wrap items-center gap-2 text-[13px]">
        <span className="text-muted">Tenant:</span>
        {TENANTS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setWho(t.id);
              setRun((n) => n + 1);
            }}
            className={`rounded-full border px-3 py-1.5 ${who === t.id ? "border-ink bg-ink text-white" : "border-line/80 bg-card"}`}
          >
            {t.name} · {t.passport ? "passport done" : "no passport"}
          </button>
        ))}
      </div>
      <AgentOfferRecorder key={`${who}-${run}`} tenant={tenant} home={HOME} agentName="Sam Whitaker" sample />
      <Toaster />
    </main>
  );
}
