"use client";

import { useState } from "react";
import Link from "next/link";
import PropertyPhoto from "@/components/PropertyPhoto";
import { DIARY, minutesOf } from "@/lib/diary";
import rexSample from "@/lib/rex-sample.json";

/**
 * The tenant's portal home — what Sophie sees, and ONLY what's hers.
 *
 * Her viewings (reschedulable), the homes we've picked for her, everything
 * we have available, and guides for the road ahead. No other tenant's
 * anything, ever. Brand red, clean type, no illustrations — this surface
 * belongs to thelettingexperts.co.uk, not to the OS.
 */

const RED = "#e31f36";
const ME = "Sophie Turner";

type Listing = {
  id: string; name: string; locality: string; rent: number | null;
  publicationStatus: string | null; letAgreed: boolean;
  availableFrom: string | null; image: string | null; imageCount: number;
};
const LISTINGS = rexSample.listings as Listing[];
const AVAILABLE = LISTINGS.filter((l) => !l.letAgreed);
/** The ones the agency attached to her record. */
const PICKED = AVAILABLE.slice(0, 2);

const GUIDES = [
  {
    title: "How renting with us works",
    blurb: "From first viewing to keys in hand — every step, in order, with no surprises.",
    body: "You view, you offer, we put it to the landlord. If they say yes, referencing starts — an online form that takes ten minutes. Then the tenancy agreement arrives to sign electronically, the deposit is protected in a government scheme, and we hand you the keys on move-in day.",
  },
  {
    title: "Getting reference-ready",
    blurb: "Three things sorted early make your application the easy yes.",
    body: "Have your last three payslips to hand, know your employer's HR contact, and tell your current landlord we might ring. If you're self-employed, an accountant's letter or two years of SA302s does the same job. Guarantors need the same documents — warn them early.",
  },
  {
    title: "The moving-day checklist",
    blurb: "What to sort in the last week so the day itself is just carrying boxes.",
    body: "Set up your energy account and give opening meter readings on day one. Redirect your post. Photograph every room against the inventory when you arrive — it protects your deposit when you leave. And keep our number handy: if something's wrong in the first week, we want to know that week.",
  },
];

function dayLabel(offset: number): string {
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

export default function TenantHome() {
  const myViewings = DIARY.filter((a) => a.kind === "viewing" && a.who === ME && a.day >= 0)
    .sort((a, b) => a.day - b.day || minutesOf(a.start) - minutesOf(b.start));
  const [rescheduling, setRescheduling] = useState<string | null>(null);
  const [reDay, setReDay] = useState<number | null>(null);
  const [reSlot, setReSlot] = useState<string | null>(null);
  const [requested, setRequested] = useState<Record<string, string>>({});
  const [offering, setOffering] = useState<Listing | null>(null);
  const [offerAmount, setOfferAmount] = useState("");
  const [offerNote, setOfferNote] = useState("");
  const [offered, setOffered] = useState<Set<string>>(new Set());
  const [openGuide, setOpenGuide] = useState<string | null>(null);

  const SLOT_CHOICES = ["09:30", "11:00", "12:30", "14:00", "15:30", "17:00", "18:30"];

  return (
    <div className="py-10">
      <h1 className="text-[24px] font-bold leading-tight">Hello, Sophie</h1>
      <p className="mt-1 text-[13.5px] text-black/60">
        Your viewings, the homes we think you&apos;ll like, and everything we have available.
      </p>

      {/* ── HER viewings — hers alone. ── */}
      <section className="mt-8">
        <h2 className="text-[15px] font-bold">Your viewings</h2>
        <div className="mt-3 space-y-3">
          {myViewings.map((v) => {
            const property = v.what.replace(/^[^—]+—\s*/, "");
            const req = requested[v.id];
            return (
              <div key={v.id} className="rounded-xl border border-black/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[14px] font-bold">{property}</p>
                    <p className="mt-0.5 text-[12.5px] text-black/60">
                      {dayLabel(v.day)} at {v.start} · {v.agent} from our team will meet you there
                    </p>
                    {req && (
                      <p className="mt-1 text-[12px] font-semibold" style={{ color: RED }}>
                        Move requested — {req}. We&apos;ll confirm shortly.
                      </p>
                    )}
                  </div>
                  {!req && (
                    <button
                      type="button"
                      onClick={() => { setRescheduling(v.id); setReDay(null); setReSlot(null); }}
                      className="rounded-lg border border-black/20 px-4 py-2 text-[12px] font-bold transition-colors hover:border-black"
                    >
                      Request a different time
                    </button>
                  )}
                </div>

                {rescheduling === v.id && (
                  <div className="mt-4 border-t border-black/10 pt-4">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-black/50">Pick a day</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setReDay(d)}
                          className={`rounded-lg border px-3 py-2 text-[12px] font-semibold transition-colors ${
                            reDay === d ? "text-white" : "border-black/15 hover:border-black/50"
                          }`}
                          style={reDay === d ? { backgroundColor: RED, borderColor: RED } : undefined}
                        >
                          {dayLabel(d)}
                        </button>
                      ))}
                    </div>
                    {reDay != null && (
                      <>
                        <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-black/50">And a time</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {SLOT_CHOICES.map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setReSlot(t)}
                              className={`rounded-lg border px-3 py-2 text-[12px] font-semibold transition-colors ${
                                reSlot === t ? "text-white" : "border-black/15 hover:border-black/50"
                              }`}
                              style={reSlot === t ? { backgroundColor: RED, borderColor: RED } : undefined}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    <button
                      type="button"
                      disabled={reDay == null || !reSlot}
                      onClick={() => {
                        setRequested((cur) => ({ ...cur, [v.id]: `${dayLabel(reDay!)} at ${reSlot}` }));
                        setRescheduling(null);
                      }}
                      className="mt-4 rounded-lg px-5 py-2.5 text-[12.5px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-30"
                      style={{ backgroundColor: RED }}
                    >
                      Request this time
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {!myViewings.length && (
            <p className="rounded-xl border border-dashed border-black/15 py-6 text-center text-[12.5px] text-black/50">
              No viewings booked yet — pick a home below and we&apos;ll arrange one.
            </p>
          )}
        </div>
      </section>

      {/* ── Picked for her. ── */}
      <section className="mt-10">
        <h2 className="text-[15px] font-bold">Picked for you</h2>
        <p className="mt-0.5 text-[12px] text-black/50">
          Homes our team attached to your search — tell us if we&apos;re close.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {PICKED.map((l) => (
            <div key={l.id} className="overflow-hidden rounded-xl border border-black/10">
              <PropertyPhoto src={l.image} className="h-40 w-full" />
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-bold">{l.name}</p>
                    <p className="text-[12px] text-black/50">{l.locality}</p>
                  </div>
                  <p className="shrink-0 text-[16px] font-bold">
                    £{l.rent?.toLocaleString("en-GB")}
                    <span className="text-[10px] font-medium text-black/40"> pcm</span>
                  </p>
                </div>
                <div className="mt-3 flex gap-2">
                  {offered.has(l.id) ? (
                    <p className="text-[12px] font-semibold" style={{ color: RED }}>
                      ✓ Offer sent — we&apos;ll be in touch
                    </p>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => { setOffering(l); setOfferAmount(String(l.rent ?? "")); setOfferNote(""); }}
                        className="rounded-lg px-4 py-2 text-[12px] font-bold text-white transition-opacity hover:opacity-90"
                        style={{ backgroundColor: RED }}
                      >
                        Make an offer
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-black/20 px-4 py-2 text-[12px] font-bold transition-colors hover:border-black"
                      >
                        Book a viewing
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Everything available. ── */}
      <section className="mt-10">
        <h2 className="text-[15px] font-bold">All our available homes</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          {AVAILABLE.map((l) => (
            <div key={l.id} className="overflow-hidden rounded-xl border border-black/10">
              <PropertyPhoto src={l.image} className="h-28 w-full" />
              <div className="p-3">
                <p className="truncate text-[12.5px] font-bold">{l.name}</p>
                <p className="text-[11px] text-black/50">{l.locality}</p>
                <p className="mt-1 text-[13px] font-bold">
                  £{l.rent?.toLocaleString("en-GB")}
                  <span className="text-[9.5px] font-medium text-black/40"> pcm</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── The guides. ── */}
      <section className="mt-10">
        <h2 className="text-[15px] font-bold">Guides for the road ahead</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          {GUIDES.map((g) => (
            <button
              key={g.title}
              type="button"
              onClick={() => setOpenGuide(openGuide === g.title ? null : g.title)}
              className="rounded-xl border border-black/10 p-4 text-left transition-colors hover:border-black/30"
            >
              <p className="text-[13px] font-bold">{g.title}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-black/60">
                {openGuide === g.title ? g.body : g.blurb}
              </p>
              <p className="mt-2 text-[11px] font-bold" style={{ color: RED }}>
                {openGuide === g.title ? "Close" : "Read →"}
              </p>
            </button>
          ))}
        </div>
      </section>

      {/* ── The profile nudge — the landlord-facing half. ── */}
      <section className="mt-10 rounded-xl p-5 text-white" style={{ backgroundColor: "#16181d" }}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[14px] font-bold">Make your application the easy yes</p>
            <p className="mt-1 max-w-md text-[12.5px] leading-relaxed text-white/70">
              A finished profile — photo, situation, income — is what landlords choose
              between offers. Yours is 20% done.
            </p>
          </div>
          <Link
            href="/tenant/profile"
            className="rounded-lg px-5 py-2.5 text-[12.5px] font-bold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: RED }}
          >
            Finish my profile
          </Link>
        </div>
      </section>

      {/* ── The offer modal. ── */}
      {offering && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6">
            <p className="text-[16px] font-bold">Make an offer — {offering.name}</p>
            <p className="mt-0.5 text-[12px] text-black/50">
              Asking £{offering.rent?.toLocaleString("en-GB")} pcm
            </p>
            <label className="mt-4 block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-black/50">
                Your offer, per month
              </span>
              <div className="flex items-center gap-2 rounded-lg border border-black/15 px-3.5 py-3">
                <span className="text-[13.5px] text-black/40">£</span>
                <input
                  value={offerAmount}
                  onChange={(e) => setOfferAmount(e.target.value.replace(/[^\d]/g, ""))}
                  className="w-full text-[13.5px] outline-none"
                />
              </div>
            </label>
            <label className="mt-3 block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-black/50">
                Anything we should pass on
              </span>
              <textarea
                value={offerNote}
                onChange={(e) => setOfferNote(e.target.value)}
                rows={3}
                placeholder="Move-in date you'd like, who's moving with you…"
                className="w-full resize-none rounded-lg border border-black/15 px-3.5 py-3 text-[13px] leading-relaxed outline-none"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOffering(null)}
                className="rounded-lg border border-black/20 px-4 py-2.5 text-[12.5px] font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setOffered((cur) => new Set(cur).add(offering.id));
                  setOffering(null);
                }}
                className="rounded-lg px-5 py-2.5 text-[12.5px] font-bold text-white"
                style={{ backgroundColor: RED }}
              >
                Send my offer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
