"use client";

import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import AgentOfferRecorder, { type OfferHome, type OfferTenant } from "@/components/offers/AgentOfferRecorder";
import { SOPHIE_PASSPORT } from "@/lib/tenant-sample";

/**
 * The offer harness (1 Oct 2026, James after a call with Rhiannon).
 *
 * Two ways an offer gets made, side by side, so the process can be walked
 * slowly and made slick before anything is wired to save:
 *
 *   Agent      the agent puts it forward for the tenant, on the phone or
 *              sitting down together. Sophie has a finished passport, so
 *              nothing is re-asked; Tom has none, so the agent asks as they
 *              go and it lands in his passport.
 *   Tenant     the real tenant area, on Sophie's sample, at "viewed", where
 *              she presses Make an offer. Desktop or phone.
 *
 * Nothing on this page saves or sends.
 */

const HOME: OfferHome = {
  id: "sample-8-recreation",
  address: "8 Recreation Terrace",
  locality: "Nottingham NG2",
  askingPcm: 850,
  beds: 2,
  photo: "/brand/photo/property.jpg",
};

const TENANTS: OfferTenant[] = [
  { id: "sophie", name: "Sophie Turner", email: "sophie.sample@example.com", passport: SOPHIE_PASSPORT, passportDoneOn: "28 Sept 2026" },
  { id: "tom", name: "Tom Bradley", email: "tom.sample@example.com", passport: null, passportDoneOn: null },
];

type Tab = "agent" | "tenant";
type Device = "desktop" | "phone";

const TENANT_START = "/tenant/demo/stage?to=viewed&back=%2Ftenant%2Fdemo";

export default function OfferHarness() {
  const [tab, setTab] = useState<Tab>("agent");
  const [who, setWho] = useState(TENANTS[0].id);
  const [device, setDevice] = useState<Device>("phone");
  const [run, setRun] = useState(0);
  const tenant = TENANTS.find((t) => t.id === who)!;

  const pill = (on: boolean) =>
    `rounded-full border px-4 py-2 text-[13px] font-semibold transition-colors ${on ? "border-accent-dark bg-accent-dark text-white" : "border-line/80 bg-card"}`;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
      <PageHeader
        title="Making an Offer"
        blurb="Both ways an offer gets made, to walk through and get right. Nothing here saves or sends."
      />

      <div className="mt-6 flex flex-wrap items-center gap-2" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "agent"} onClick={() => setTab("agent")} className={pill(tab === "agent")}>
          Agent puts it forward
        </button>
        <button type="button" role="tab" aria-selected={tab === "tenant"} onClick={() => setTab("tenant")} className={pill(tab === "tenant")}>
          Tenant makes the offer
        </button>
      </div>

      {tab === "agent" ? (
        <div className="mt-6">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-[13px]">
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
        </div>
      ) : (
        <div className="mt-6">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-muted">Screen:</span>
            {(["phone", "desktop"] as Device[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDevice(d)}
                className={`rounded-full border px-3 py-1.5 ${device === d ? "border-ink bg-ink text-white" : "border-line/80 bg-card"}`}
              >
                {d === "phone" ? "Phone" : "Desktop"}
              </button>
            ))}
            <button type="button" onClick={() => setRun((n) => n + 1)} className="ml-auto rounded-full border border-line/80 bg-card px-3 py-1.5">
              Start again
            </button>
          </div>
          <p className="mb-4 max-w-2xl text-[13px] text-muted">
            Sophie&apos;s tenant area, the day after her viewing, with her passport already filled in. Press Make an offer
            to walk it. This is the real screen on sample data.
          </p>
          <div className={device === "phone" ? "flex justify-center" : ""}>
            <iframe
              key={`${device}-${run}`}
              title="Sophie's tenant area"
              src={TENANT_START}
              className={
                device === "phone"
                  ? "h-[844px] w-[390px] rounded-[36px] border-[10px] border-ink bg-white shadow-[0_30px_70px_-30px_rgba(0,0,0,0.45)]"
                  : "h-[860px] w-full rounded-[18px] border border-line/70 bg-white"
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
