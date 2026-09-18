"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import PropertyPhoto from "@/components/PropertyPhoto";
import { milesBetween, type MarketHomeDetail } from "@/lib/market-homes";
import { milesWords, rentWords, type Origin } from "@/components/tenant/HomesBrowser";

/**
 * One home on Find a home: every photo, the write-up the portals carry, and
 * the enquiry - which goes to the listing's agent and puts the home on the
 * tenant's own page (lib/tenant-find makeEnquiry). Nothing here leaves the
 * tenant area for the website.
 */

const card = "rounded-[22px] border border-line/60 bg-white";
const eyebrow = "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted";
const longDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null);

export default function HomeDetail({
  h,
  home,
  base,
  q = "",
  sample = false,
  asked,
  first,
  phone,
}: {
  h: MarketHomeDetail;
  home: Origin | null;
  base: string;
  q?: string;
  sample?: boolean;
  /** When they already asked about this one, and it is on their page. */
  asked: string | null;
  first: string;
  phone: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const photos = h.images;
  const miles = home && h.lat != null && h.lng != null ? milesBetween(home, { lat: h.lat, lng: h.lng }) : null;
  const available = h.availableFrom && new Date(h.availableFrom).getTime() > Date.now() ? `From ${longDate(h.availableFrom)}` : "Now";

  return (
    <div className="space-y-6">
      <Link href={`${base}/homes${q}`} className="inline-flex items-center gap-2 text-[13px] font-semibold text-muted hover:text-ink">
        <Chevron dir="left" size={14} /> All homes to rent
      </Link>

      {/* ── the photos ── */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <button type="button" onClick={() => photos.length && setOpen(0)} className="relative block overflow-hidden rounded-[22px]" aria-label="See the photos">
          <PropertyPhoto src={photos[0] ?? null} alt={h.name} className="h-[280px] w-full sm:h-[420px]" />
          {photos.length > 1 && (
            <span className="absolute bottom-4 right-4 flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-[13px] font-semibold text-ink shadow-sm">
              <DoodleIcon name="camera" size={14} /> See all {photos.length} photos
            </span>
          )}
        </button>
        {photos.length > 2 && (
          <div className="hidden grid-rows-2 gap-3 lg:grid">
            {photos.slice(1, 3).map((src, i) => (
              <button key={src} type="button" onClick={() => setOpen(i + 1)} className="overflow-hidden rounded-[22px]" aria-label={`Photo ${i + 2}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full max-h-[204px] w-full object-cover transition-transform duration-500 hover:scale-[1.02]" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* ── the home ── */}
        <div className="space-y-6">
          <div>
            <p className="text-[34px] font-bold leading-none">{rentWords(h)}</p>
            <h1 className="mt-3 text-[30px] leading-tight">{h.name}</h1>
            <p className="mt-1 text-[14px] text-muted">{h.locality}{h.postcode && !h.locality.includes(h.postcode) ? ` ${h.postcode}` : ""}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Fact icon="bed.png" label="Bedrooms" value={h.beds == null ? "Ask us" : h.beds === 0 ? "Studio" : String(h.beds)} />
            <Fact icon="sofa.png" label="Type" value={h.propertyType ?? "Ask us"} />
            <Fact icon="calendar" label="Available" value={available} />
            <Fact icon="target" label="From your home" value={miles == null ? "-" : milesWords(miles).replace(" away", "")} />
          </div>
          {(h.heading || h.body) && (
            <section className={`${card} p-6`}>
              <p className={eyebrow}>About this home</p>
              {h.heading && <h2 className="mt-2 text-[16.5px] font-semibold leading-relaxed">{h.heading}</h2>}
              {h.body && <p className="mt-3 whitespace-pre-line text-[14.5px] leading-relaxed text-ink/80">{h.body}</p>}
            </section>
          )}
        </div>

        {/* ── enquire ── */}
        <aside className="lg:sticky lg:top-6">
          <Enquire h={h} sample={sample} asked={asked} first={first} phone={phone} />
        </aside>
      </div>

      {open != null && <Viewer photos={photos} at={open} onMove={setOpen} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Fact({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className={`${card} px-4 py-3.5`}>
      <span className="flex items-center gap-2 text-muted"><DoodleIcon name={icon} size={14} /><span className="text-[11.5px]">{label}</span></span>
      <p className="mt-1 text-[15px] font-semibold leading-snug">{value}</p>
    </div>
  );
}

function Enquire({ h, sample, asked, first, phone: givenPhone }: { h: MarketHomeDetail; sample: boolean; asked: string | null; first: string; phone: string }) {
  const [message, setMessage] = useState(`Hi, I'd love to come and see ${h.name}. I'm free most evenings and weekends.`);
  const [phone, setPhone] = useState(givenPhone);
  const [state, setState] = useState<"idle" | "busy" | "sent" | "kept">("idle");
  const [err, setErr] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (sample) return setState("sent");
    setState("busy");
    const r = await fetch("/api/tenant/homes/enquire", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ listingId: h.id, message, phone }),
    }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) {
      setState("idle");
      return setErr(r?.error ?? "That didn't go through. Try again in a moment.");
    }
    setState(r.sentTo ? "sent" : "kept");
  }

  if (state === "sent" || state === "kept") {
    return (
      <div className="rounded-[22px] bg-accent-soft p-6">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-dark text-white">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <h2 className="mt-4 text-[21px] font-bold leading-tight">{state === "sent" ? "Your enquiry is in" : "We have your enquiry"}</h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink/70">
          {state === "sent"
            ? "The agent for this home has it now and will come back to you with times to view. It is on your home page too."
            : "It is saved, and the team will pick it up and come back to you with times to view."}
        </p>
        {sample && <p className="mt-3 text-[12px] text-muted">This is the sample, so nothing was sent.</p>}
      </div>
    );
  }

  return (
    <form onSubmit={send} className="rounded-[22px] bg-accent-soft p-6">
      <p className={eyebrow}>{asked ? "You asked about this" : "Like the look of it?"}</p>
      <h2 className="mt-2 text-[21px] font-bold leading-tight">{asked ? "Ask Something Else" : "Enquire About This Home"}</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-ink/70">
        {asked
          ? `You enquired on ${asked}. Add anything else here, or ask for a viewing time.`
          : `Your passport is ready, ${first}, so if it is the one you can apply in a tap after you have seen it.`}
      </p>
      <label className="mt-4 block">
        <span className="text-[12.5px] font-semibold">Your message</span>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} className="mt-1.5 w-full rounded-[12px] border border-line/80 bg-white px-3.5 py-2.5 text-[14px] leading-relaxed outline-none focus:border-accent-dark" />
      </label>
      <label className="mt-3 block">
        <span className="text-[12.5px] font-semibold">Best number to reach you</span>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className="mt-1.5 w-full rounded-[12px] border border-line/80 bg-white px-3.5 py-2.5 text-[14px] outline-none focus:border-accent-dark" />
      </label>
      {err && <p className="mt-2 text-[12.5px] text-[#9d4340]">{err}</p>}
      <button type="submit" disabled={state === "busy"} className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-accent-dark px-6 py-3 text-[14px] font-semibold text-white disabled:opacity-60">
        {state === "busy" ? "Sending…" : "Send my enquiry"} {state !== "busy" && <DoodleIcon name="trend-up" size={14} className="invert" />}
      </button>
      <p className="mt-3 text-[11.5px] leading-snug text-muted">Your name and email go with it, from your tenant area.</p>
    </form>
  );
}

/** Every photo, full screen: arrows, the keyboard, and a tap outside to close. */
function Viewer({ photos, at, onMove, onClose }: { photos: string[]; at: number; onMove: (i: number) => void; onClose: () => void }) {
  const go = useCallback((d: number) => onMove((at + d + photos.length) % photos.length), [at, photos.length, onMove]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", key);
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", key);
      document.body.style.overflow = was;
    };
  }, [go, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90" onClick={onClose} role="dialog" aria-label="Photos">
      <div className="flex items-center justify-between px-5 py-4 text-[13px] text-white/80">
        <span>{at + 1} of {photos.length}</span>
        <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Close">
          <DoodleIcon name="cross" size={14} className="invert" />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-6 sm:px-16">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={photos[at]} src={photos[at]} alt="" onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full rounded-lg object-contain" style={{ animation: "riseIn 260ms cubic-bezier(0.22,1,0.36,1) both" }} />
        {photos.length > 1 && (
          <>
            <button type="button" onClick={(e) => { e.stopPropagation(); go(-1); }} className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25" aria-label="Previous photo">
              <Chevron dir="left" size={18} />
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); go(1); }} className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25" aria-label="Next photo">
              <Chevron dir="right" size={18} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Chevron({ dir, size }: { dir: "left" | "right"; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d={dir === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
