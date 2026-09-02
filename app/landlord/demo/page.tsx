"use client";

import { useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import PropertyPhoto from "@/components/PropertyPhoto";
import { Pill } from "@/components/Wire";
import rexSample from "@/lib/rex-sample.json";

/**
 * THE SAMPLE. Raj Chauhan, two invented properties, every figure typed in.
 *
 * Kept, deliberately, for walking people through what the portal will do
 * once every section is live: offers to accept, upkeep to approve, rent
 * received, documents both ways. The live portal at /landlord shows a real
 * landlord only what is real today. This page is where Susan decides what
 * it should look like - so it is drawn in the OS's hand, the same tokens
 * and headings as the rest of the system, and nothing in it is a mock of
 * the OS's style. See app/landlord/layout.tsx.
 */

type Listing = { id: string; name: string; locality: string; rent: number | null; image: string | null };
const LISTINGS = rexSample.listings as Listing[];
const img = (name: string) => LISTINGS.find((l) => l.name.includes(name))?.image ?? null;

const LET_STAGES = ["Listed", "Viewings", "Offers", "Referencing", "Tenancy signed", "Moved in"];

const button = "rounded-full bg-accent-dark px-4 py-2 text-[12px] font-semibold text-white transition-opacity hover:opacity-90";
const quiet = "rounded-full border border-line/80 px-4 py-2 text-[12px] transition-colors hover:border-ink/40";
const label = "text-[10.5px] font-semibold uppercase tracking-wide text-muted";

export default function LandlordDemo() {
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
      <div className="fade-up">
        <h1 className="text-[30px] leading-tight">Hello, Raj</h1>
        <p className="mt-1.5 text-[13.5px] text-muted">
          Both your properties, everything happening on them, and every document in one place.
        </p>
      </div>

      {/* ══ THE LETTING IN FLIGHT ══ */}
      <section className="fade-up mt-8 overflow-hidden rounded-2xl border border-line/80 bg-panel">
        <div className="relative">
          <PropertyPhoto src={img("Recreation")} className="h-[220px] w-full object-cover sm:h-[280px]" />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-6 text-white">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide opacity-80">Being let</p>
            <h2 className="mt-1 text-[26px] leading-tight text-white">8 Recreation Terrace, Nottingham</h2>
            <p className="text-[13px] opacity-80">Asking £850 a month · Rent Collection</p>
          </div>
          <span className="absolute right-4 top-4">
            <Pill tone="accent">{offerState === "accepted" ? "Referencing" : "Offer in"}</Pill>
          </span>
        </div>

        <div className="border-t border-line/70 px-6 py-5">
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
            {LET_STAGES.map((s, i) => (
              <div key={s} className="min-w-0">
                <div className={`h-1.5 rounded-full ${i <= letStage ? "bg-accent-dark" : "bg-line/50"}`} />
                <p className={`mt-1.5 truncate text-[10.5px] ${i === letStage ? "font-semibold text-ink" : "text-muted"}`}>{s}</p>
              </div>
            ))}
          </div>
          <p className="mt-3.5 text-[13.5px]">
            3 viewings held, feedback logged on each.{" "}
            {offerState === "accepted"
              ? "You accepted the offer. Referencing has started, and we'll show every reference here as it returns."
              : "An offer is on the table. It's your decision, and here's everything you need to make it."}
          </p>

          {offerState !== "accepted" && (
            <div className="mt-4 rounded-2xl border border-line/70 bg-box p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="figures text-[18px]">£850 <span className="text-[12px] font-normal text-muted">a month · Applicant A</span></p>
                  <p className="mt-0.5 text-[12.5px] text-muted">
                    Working professional, full-time employed, no pets, non-smoker · references 2 of 3 already back
                  </p>
                  {offerState === "negotiating" && (
                    <p className="mt-1 text-[12.5px] font-semibold text-accent-dark">We&rsquo;re negotiating on your behalf. We&rsquo;ll ring you today.</p>
                  )}
                </div>
                {offerState === "open" && (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setOfferState("accepted")} className={button}>Accept the offer</button>
                    <button type="button" onClick={() => setOfferState("negotiating")} className={quiet}>Ask us to negotiate</button>
                  </div>
                )}
              </div>
            </div>
          )}
          {offerState === "accepted" && (
            <p className="mt-4 rounded-2xl border border-line/70 bg-box p-4 text-[12.5px]">
              Offer accepted. We&rsquo;ve told the applicant, viewings have stopped, and referencing is under way.
              Nothing needed from you until the tenancy agreement is ready to sign.
            </p>
          )}

          <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
            <Cert name="Electrical (EICR)" state="Expired, in hand" tone="accent" note="Electrician booked this week, no cost to confirm yet" />
            <Cert name="Gas safety" state="In date · 90 days left" tone="good" link />
            <Cert name="EPC" state="In date" tone="good" link />
          </div>
        </div>
      </section>

      {/* ══ THE TENANTED ONE ══ */}
      <section className="fade-up mt-6 overflow-hidden rounded-2xl border border-line/80 bg-panel">
        <div className="flex flex-wrap items-center gap-4 border-b border-line/70 p-4 [&>div]:min-w-[55%]">
          <PropertyPhoto src={img("Walesby")} className="h-16 w-24 shrink-0 rounded-xl object-cover" />
          <div className="min-w-0 flex-1">
            <h3 className="text-[17px]">183 Walesby Lane, New Ollerton</h3>
            <p className="text-[12px] text-muted">Tenanted · £750 a month · Fully managed</p>
          </div>
          <Pill tone="good">All in order</Pill>
        </div>

        <div className="grid gap-6 p-5 sm:grid-cols-2">
          <div>
            <p className={label}>Your tenant</p>
            <p className="mt-1.5 text-[14px] font-semibold">Dean Halliwell</p>
            <p className="text-[12.5px] text-muted">In since March 2024 · never missed a payment</p>

            <p className={`${label} mt-5`}>The rent</p>
            <p className="mt-1.5 text-[13px]">
              <span className="figures text-[16px]">£750</span> received 1 Aug · paid out to you 3 Aug
            </p>
            <p className="text-[12.5px] text-muted">Next due 1 September</p>
            <a href="#" className="mt-2 inline-block text-[12px] font-semibold text-accent-dark hover:underline">Download your August statement</a>
          </div>

          <div>
            <p className={label}>Compliance</p>
            <ul className="mt-1.5 space-y-1 text-[12.5px]">
              <li>Gas safety · in date, renews in 140 days</li>
              <li>Electrical (EICR) · in date</li>
              <li>EPC · in date</li>
            </ul>
            <a href="#" className="mt-1.5 inline-block text-[12px] font-semibold text-accent-dark hover:underline">Download all certificates</a>

            <p className={`${label} mt-5`}>Upkeep</p>
            {quoteApproved ? (
              <p className="mt-1.5 text-[12.5px] font-semibold">Guttering repair approved. Booked for next week.</p>
            ) : (
              <div className="mt-1.5 rounded-2xl border border-line/70 bg-box p-3.5">
                <p className="text-[12.5px] font-semibold">Guttering repair · quote £140</p>
                <p className="text-[11.5px] text-muted">Reported after the last inspection · photos on file</p>
                <div className="mt-2.5 flex gap-2">
                  <button type="button" onClick={() => setQuoteApproved(true)} className={button}>Approve</button>
                  <button type="button" className={quiet}>Ask a question</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ══ DOCUMENTS ══ */}
      <section className="fade-up mt-6 rounded-2xl border border-line/80 bg-panel p-5">
        <div className="flex items-center gap-2.5">
          <DoodleIcon name="folder" size={18} className="text-accent-dark" />
          <h2 className="text-[17px]">Your documents</h2>
        </div>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <div>
            <p className={label}>Signed and filed</p>
            <ul className="mt-2 space-y-2 text-[12.5px]">
              {[
                ["Terms of business · signed 12 May 2026", "Download"],
                ["Management agreement · 183 Walesby Lane", "Download"],
                ["ID verification · complete", null],
              ].map(([t, a]) => (
                <li key={t} className="flex items-center justify-between gap-3 rounded-xl border border-line/70 bg-box px-3.5 py-2.5">
                  <span>{t}</span>
                  {a ? (
                    <a href="#" className="shrink-0 text-[11.5px] font-semibold text-accent-dark hover:underline">{a}</a>
                  ) : (
                    <span className="text-[11px] text-muted">nothing to do</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className={label}>We still need</p>
            <div className="mt-2 rounded-2xl border border-dashed border-line p-4">
              <p className="text-[12.5px] font-semibold">Proof of ownership · 8 Recreation Terrace</p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">
                A title register or mortgage statement does it. Upload here and it files straight into your record.
              </p>
              <label className={`mt-3 inline-flex cursor-pointer items-center gap-2 ${button}`}>
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
              {uploadErr && <p className="mt-2 text-[11.5px] font-semibold text-accent-dark">{uploadErr}</p>}
              {uploads.map((u) => (
                <p key={u.url} className="mt-2 text-[12px] font-semibold">{u.name} · received, thank you</p>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══ What you're signed up for ══ */}
      <section className="fade-up mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-line/80 bg-panel p-5">
          <h3 className="text-[15px]">183 Walesby Lane · Fully managed</h3>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
            Rent collection, repairs, inspections, compliance renewals and the tenant&rsquo;s day-to-day, all ours.
            You approve anything over £150.
          </p>
        </div>
        <div className="rounded-2xl border border-line/80 bg-panel p-5">
          <h3 className="text-[15px]">8 Recreation Terrace · Rent collection</h3>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
            We find the tenant, run the tenancy paperwork and collect the rent; upkeep stays with you.
            Upgrade to fully managed any time, one click and we&rsquo;ll call.
          </p>
        </div>
      </section>
    </div>
  );
}

function Cert({ name, state, tone, note, link }: { name: string; state: string; tone: "good" | "accent"; note?: string; link?: boolean }) {
  return (
    <div className="rounded-2xl border border-line/70 bg-box p-3.5">
      <p className={label}>{name}</p>
      <p className={`mt-1 text-[12.5px] font-semibold ${tone === "accent" ? "text-accent-dark" : ""}`}>{state}</p>
      {note && <p className="mt-0.5 text-[11px] text-muted">{note}</p>}
      {link && <a href="#" className="mt-0.5 inline-block text-[11px] font-semibold text-accent-dark hover:underline">Download certificate</a>}
    </div>
  );
}
