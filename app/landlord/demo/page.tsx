"use client";

import { useState } from "react";
import PropertyPhoto from "@/components/PropertyPhoto";
import rexSample from "@/lib/rex-sample.json";

/**
 * The landlord's home — everything they'd otherwise ring about, at every
 * stage: the letting's progress and its offers, the sitting tenant and the
 * rent, compliance with the actual certificates, upkeep with approvals,
 * and their documents — signed ones to download, missing ones to upload
 * (the upload is REAL: files land in the agency vault).
 */

const RED = "#e31f36";

type Listing = { id: string; name: string; locality: string; rent: number | null; image: string | null };
const LISTINGS = rexSample.listings as Listing[];
const img = (name: string) => LISTINGS.find((l) => l.name.includes(name))?.image ?? null;

const LET_STAGES = ["Listed", "Viewings", "Offers", "Referencing", "Tenancy signed", "Moved in"];

export default function LandlordHome() {
  const [offerState, setOfferState] = useState<"open" | "accepted" | "negotiating">("open");
  const [quoteApproved, setQuoteApproved] = useState(false);
  const [uploads, setUploads] = useState<{ name: string; url: string }[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadErr, setUploadErr] = useState("");

  async function upload(file: File) {
    setUploadBusy(true);
    setUploadErr("");
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("scope", "document");
      body.set("ref", "landlord-raj-chauhan");
      const res = await fetch("/api/r2/upload", { method: "POST", body });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error ?? "Upload failed");
      setUploads((cur) => [...cur, { name: j.name, url: j.url }]);
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadBusy(false);
    }
  }

  const letStage = offerState === "accepted" ? 3 : 2;

  return (
    <div className="py-10">
      <h1 className="text-[24px] font-bold leading-tight">Hello, Raj</h1>
      <p className="mt-1 text-[13.5px] text-black/60">
        Both your properties, everything happening on them, and every document in one place.
      </p>

      {/* ══ THE LETTING IN FLIGHT: 8 Recreation Terrace ══ */}
      <section className="mt-8 overflow-hidden rounded-xl border border-black/10">
        <div className="flex flex-wrap items-center gap-4 border-b border-black/10 bg-[#fafafa] p-4">
          <PropertyPhoto src={img("Recreation")} className="h-16 w-24 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold">8 Recreation Terrace, Nottingham</p>
            <p className="text-[12px] text-black/50">Being let · asking £850 pcm · Rent Collection service</p>
          </div>
          <span
            className="rounded-full px-3 py-1.5 text-[11px] font-bold text-white"
            style={{ backgroundColor: RED }}
          >
            {offerState === "accepted" ? "Referencing" : "Offer in"}
          </span>
        </div>

        <div className="p-5">
          {/* Where it is — the process, plainly. */}
          <div className="flex items-center gap-1.5">
            {LET_STAGES.map((s, i) => (
              <div key={s} className="flex-1">
                <div
                  className="h-1.5 rounded-full"
                  style={{ backgroundColor: i <= letStage ? RED : "rgba(0,0,0,0.08)" }}
                />
                <p className={`mt-1.5 text-[9.5px] font-bold ${i <= letStage ? "" : "text-black/35"}`}>
                  {s}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-black/60">
            3 viewings held, feedback logged on each. {offerState === "accepted"
              ? "You accepted the offer — referencing has started, and we'll show every reference here as it returns."
              : "An offer is on the table — it's your decision, and here's everything you need to make it."}
          </p>

          {/* The offer. */}
          {offerState !== "accepted" && (
            <div className="mt-4 rounded-xl border border-black/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[13px] font-bold">Applicant A — £850 per month</p>
                  <p className="mt-0.5 text-[12px] text-black/55">
                    Working professional, full-time employed, no pets, non-smoker ·
                    references 2 of 3 already back
                  </p>
                  {offerState === "negotiating" && (
                    <p className="mt-1 text-[12px] font-semibold" style={{ color: RED }}>
                      We&apos;re negotiating on your behalf — we&apos;ll ring you today.
                    </p>
                  )}
                </div>
                {offerState === "open" && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setOfferState("accepted")}
                      className="rounded-lg px-4 py-2.5 text-[12px] font-bold text-white transition-opacity hover:opacity-90"
                      style={{ backgroundColor: RED }}
                    >
                      Accept the offer
                    </button>
                    <button
                      type="button"
                      onClick={() => setOfferState("negotiating")}
                      className="rounded-lg border border-black/20 px-4 py-2.5 text-[12px] font-bold transition-colors hover:border-black"
                    >
                      Ask us to negotiate
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          {offerState === "accepted" && (
            <p className="mt-4 rounded-xl border border-black/10 bg-[#fafafa] p-4 text-[12.5px] font-semibold">
              ✓ Offer accepted — we&apos;ve told the applicant, viewings have stopped, and
              referencing is under way. Nothing needed from you until the tenancy
              agreement is ready to sign.
            </p>
          )}

          {/* Compliance on this one — the honest state, including the fix. */}
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-black/10 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-black/45">Electrical (EICR)</p>
              <p className="mt-1 text-[12px] font-bold" style={{ color: RED }}>Expired — in hand</p>
              <p className="text-[10.5px] text-black/50">Electrician booked this week, no cost to confirm yet</p>
            </div>
            <div className="rounded-lg border border-black/10 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-black/45">Gas safety</p>
              <p className="mt-1 text-[12px] font-bold">In date · 90 days left</p>
              <a href="#" className="text-[10.5px] underline" style={{ color: RED }}>Download certificate</a>
            </div>
            <div className="rounded-lg border border-black/10 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-black/45">EPC</p>
              <p className="mt-1 text-[12px] font-bold">In date</p>
              <a href="#" className="text-[10.5px] underline" style={{ color: RED }}>Download certificate</a>
            </div>
          </div>
        </div>
      </section>

      {/* ══ THE TENANTED ONE: 183 Walesby Lane — the management view. ══ */}
      <section className="mt-6 overflow-hidden rounded-xl border border-black/10">
        <div className="flex flex-wrap items-center gap-4 border-b border-black/10 bg-[#fafafa] p-4">
          <PropertyPhoto src={img("Walesby")} className="h-16 w-24 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold">183 Walesby Lane, New Ollerton</p>
            <p className="text-[12px] text-black/50">Tenanted · £750 pcm · Fully Managed</p>
          </div>
          <span className="rounded-full bg-black/80 px-3 py-1.5 text-[11px] font-bold text-white">
            All in order
          </span>
        </div>

        <div className="grid gap-5 p-5 sm:grid-cols-2">
          {/* The tenant + the money. */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-black/45">Your tenant</p>
            <p className="mt-1.5 text-[14px] font-bold">Dean Halliwell</p>
            <p className="text-[12px] text-black/55">In since March 2024 · never missed a payment</p>

            <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-black/45">The rent</p>
            <p className="mt-1.5 text-[13px]">
              <span className="font-bold">£750</span> received 1 Aug · paid out to you 3 Aug
            </p>
            <p className="text-[12px] text-black/55">Next due 1 September</p>
            <a href="#" className="mt-2 inline-block text-[11.5px] font-bold underline" style={{ color: RED }}>
              Download your August statement
            </a>
          </div>

          {/* Compliance + upkeep. */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-black/45">Compliance</p>
            <ul className="mt-1.5 space-y-1 text-[12px]">
              <li>✓ Gas safety — in date, renews in 140 days</li>
              <li>✓ Electrical (EICR) — in date</li>
              <li>✓ EPC — in date</li>
            </ul>
            <a href="#" className="mt-1.5 inline-block text-[11.5px] font-bold underline" style={{ color: RED }}>
              Download all certificates
            </a>

            <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-black/45">Upkeep</p>
            {quoteApproved ? (
              <p className="mt-1.5 text-[12.5px] font-semibold">
                ✓ Guttering repair approved — booked for next week
              </p>
            ) : (
              <div className="mt-1.5 rounded-lg border border-black/10 p-3">
                <p className="text-[12.5px] font-semibold">Guttering repair — quote £140</p>
                <p className="text-[11px] text-black/50">Reported after the last inspection · photos on file</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setQuoteApproved(true)}
                    className="rounded-lg px-3.5 py-2 text-[11.5px] font-bold text-white"
                    style={{ backgroundColor: RED }}
                  >
                    Approve
                  </button>
                  <button type="button" className="rounded-lg border border-black/20 px-3.5 py-2 text-[11.5px] font-bold">
                    Ask a question
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ══ DOCUMENTS — down what's signed, up what's missing. ══ */}
      <section className="mt-6 rounded-xl border border-black/10 p-5">
        <h2 className="text-[15px] font-bold">Your documents</h2>
        <div className="mt-3 grid gap-5 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-black/45">Signed &amp; filed</p>
            <ul className="mt-2 space-y-2 text-[12.5px]">
              <li className="flex items-center justify-between gap-3 rounded-lg border border-black/10 px-3 py-2.5">
                <span>Terms of business — signed 12 May 2026</span>
                <a href="#" className="shrink-0 text-[11px] font-bold underline" style={{ color: RED }}>Download</a>
              </li>
              <li className="flex items-center justify-between gap-3 rounded-lg border border-black/10 px-3 py-2.5">
                <span>Management agreement — 183 Walesby Lane</span>
                <a href="#" className="shrink-0 text-[11px] font-bold underline" style={{ color: RED }}>Download</a>
              </li>
              <li className="flex items-center justify-between gap-3 rounded-lg border border-black/10 px-3 py-2.5">
                <span>ID verification — complete ✓</span>
                <span className="text-[11px] text-black/40">nothing to do</span>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-black/45">We still need</p>
            <div className="mt-2 rounded-lg border border-dashed border-black/25 p-4">
              <p className="text-[12.5px] font-semibold">Proof of ownership — 8 Recreation Terrace</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-black/50">
                A title register or mortgage statement does it. Upload here and it files
                straight into your record.
              </p>
              <label
                className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2.5 text-[12px] font-bold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: RED }}
              >
                {uploadBusy ? "Uploading…" : "Upload a document"}
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  disabled={uploadBusy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(f);
                    e.target.value = "";
                  }}
                />
              </label>
              {uploadErr && (
                <p className="mt-2 text-[11.5px] font-semibold" style={{ color: RED }}>{uploadErr}</p>
              )}
              {uploads.map((u) => (
                <p key={u.url} className="mt-2 text-[12px] font-semibold">
                  ✓ {u.name} — received, thank you
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══ What you're signed up for. ══ */}
      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-black/10 p-4">
          <p className="text-[13px] font-bold">183 Walesby Lane — Fully Managed</p>
          <p className="mt-1 text-[12px] leading-relaxed text-black/55">
            Rent collection, repairs, inspections, compliance renewals and the tenant's
            day-to-day — all ours. You approve anything over £150.
          </p>
        </div>
        <div className="rounded-xl border border-black/10 p-4">
          <p className="text-[13px] font-bold">8 Recreation Terrace — Rent Collection</p>
          <p className="mt-1 text-[12px] leading-relaxed text-black/55">
            We find the tenant, run the tenancy paperwork and collect the rent; upkeep
            stays with you. Upgrade to Fully Managed any time — one click, we'll call.
          </p>
        </div>
      </section>
    </div>
  );
}
