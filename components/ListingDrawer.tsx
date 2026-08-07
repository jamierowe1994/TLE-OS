"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import PhotoBox from "@/components/PhotoBox";
import PropertyPhoto from "@/components/PropertyPhoto";
import EmailToTenants from "@/components/EmailToTenants";
import ViewingBooker, { type Person } from "@/components/ViewingBooker";
import { PressButton } from "@/components/Bits";
import { Pill } from "@/components/Wire";
import { landlordFor } from "@/lib/journey";
import { LEADS, leadSide } from "@/lib/leads-sample";

/**
 * The property record — the leads drawer's shape, aimed at a thing instead of
 * a person.
 *
 * Two actions sit above everything else because they are what an agent
 * actually does with a live listing: get it in front of people, and get people
 * through the door. Everything else on the page is reference.
 *
 * The process track is deliberately ABSENT rather than invented. Susan is
 * being asked what the stages of a listing are, and the track is the spine of
 * this page — guessing it and retrofitting is how you end up with a screen
 * that argues with the way the job is done.
 */

export type Listing = {
  id: string;
  name: string;
  locality: string;
  rent: number | null;
  letAgreed: boolean;
  publicationStatus: string | null;
  availableFrom: string | null;
  epcExpiry: string | null;
  daysOnMarket: number | null;
  lastUpdated: string | null;
  imageCount: number;
  image: string | null;
};

type TabKey = "overview" | "photos" | "viewings" | "applicants";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "photos", label: "Photos" },
  { key: "viewings", label: "Viewings" },
  { key: "applicants", label: "Applicants" },
];

const TYPES = ["Flat", "Terraced", "Semi-detached", "Detached", "Bungalow", "Maisonette", "HMO", "Room"];

function Card({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line/80 bg-panel p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2.5 text-[14px]">
          <DoodleIcon name={icon} size={17} className="text-accent-dark" />
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[12.5px]">{label}</span>
      <span className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-line/80 text-[13px] leading-none text-muted transition-colors hover:border-ink/40 hover:text-ink"
        >
          −
        </button>
        <span className="figures w-6 text-center text-[13px]">{value}</span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-line/80 text-[13px] leading-none text-muted transition-colors hover:border-ink/40 hover:text-ink"
        >
          +
        </button>
      </span>
    </div>
  );
}

const APPLICANTS: Person[] = LEADS.filter((l) => leadSide(l) === "tenant").map((l) => ({
  name: l.name,
  email: l.email,
  phone: l.phone,
}));

export default function ListingDrawer({
  listing,
  onClose,
  onStep,
}: {
  listing: Listing | null;
  onClose: () => void;
  onStep: (delta: number) => void;
}) {
  const [shown, setShown] = useState(false);
  const [tab, setTab] = useState<TabKey>("overview");
  const [emailing, setEmailing] = useState(false);
  const [booking, setBooking] = useState(false);

  const [type, setType] = useState("");
  const [beds, setBeds] = useState(0);
  const [baths, setBaths] = useState(0);
  const [receptions, setReceptions] = useState(0);
  const [furnished, setFurnished] = useState("");
  const [booked, setBooked] = useState<{ when: string; who: string }[]>([]);

  useEffect(() => {
    if (!listing) return;
    setTab("overview");
    setType(""); setBeds(0); setBaths(0); setReceptions(0); setFurnished("");
    setBooked([]);
  }, [listing]);

  useEffect(() => {
    if (!listing) { setShown(false); return; }
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [listing]);

  useEffect(() => {
    if (!listing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onStep(1);
      if (e.key === "ArrowLeft") onStep(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [listing, onClose, onStep]);

  if (!listing) return null;

  const ll = landlordFor(listing.id);
  const status = listing.letAgreed
    ? { label: "Let agreed", tone: "neutral" as const }
    : listing.publicationStatus === "published"
      ? { label: "Available", tone: "good" as const }
      : { label: "Draft", tone: "accent" as const };

  return (
    <div className="fixed inset-0 z-[120]">
      <button
        aria-label="Close"
        onClick={onClose}
        className={`absolute inset-0 cursor-default bg-ink/35 transition-opacity duration-300 ${
          shown ? "opacity-100" : "opacity-0"
        }`}
      />

      <aside
        className={`absolute inset-y-0 right-0 flex w-full flex-col bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] transition-transform duration-[420ms] lg:w-[76%] xl:w-[68%] ${
          shown ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-6 pt-5">
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted transition-colors hover:text-ink"
            title="Close (Esc)"
          >
            ✕
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onStep(-1)}
              className="rounded-full border border-line/80 px-4 py-2 text-[12px] text-muted transition-colors hover:text-ink"
            >
              ← Previous
            </button>
            <button
              type="button"
              onClick={() => onStep(1)}
              className="rounded-full border border-line/80 px-4 py-2 text-[12px] text-muted transition-colors hover:text-ink"
            >
              Next →
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-4">
          {/* ── Identity: the photo IS the identity of a property. ── */}
          <div className="rounded-3xl border border-line/80 bg-panel p-6">
            <div className="flex flex-wrap items-start gap-5">
              <PropertyPhoto src={listing.image} className="h-32 w-44 shrink-0 rounded-2xl" />

              <div className="min-w-0 flex-1">
                <h2 className="text-[24px] leading-tight">{listing.name}</h2>
                <p className="mt-1 text-[12.5px] text-muted">{listing.locality}</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <Pill tone={status.tone}>{status.label}</Pill>
                  <span className="figures text-[18px]">
                    £{listing.rent?.toLocaleString("en-GB")}
                    <span className="text-[11px] text-muted"> pcm</span>
                  </span>
                </div>

                {/* The two buttons that matter, before anything else. */}
                <div className="mt-5 flex flex-wrap gap-2.5">
                  <PressButton
                    onClick={() => setEmailing(true)}
                    className="press-ring flex items-center gap-2 rounded-full bg-accent-dark px-5 py-2.5 text-[12.5px] font-semibold text-page"
                  >
                    <DoodleIcon name="mail" size={14} />
                    Email to tenants
                  </PressButton>
                  <PressButton
                    onClick={() => setBooking(true)}
                    className="press-ring flex items-center gap-2 rounded-full border border-ink/25 px-5 py-2.5 text-[12.5px] font-semibold"
                  >
                    <DoodleIcon name="calendar" size={14} />
                    Arrange viewing
                  </PressButton>
                </div>
              </div>

              {/* The landlord, because the first question on any property is
                  "whose is it and can I ring them". */}
              <div className="hidden w-[210px] shrink-0 rounded-2xl border border-line/70 p-4 lg:block">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Landlord
                </p>
                <p className="hand mt-1.5 text-[14px]">{ll.name}</p>
                <p className="mt-2 flex items-center gap-2 text-[11.5px] text-muted">
                  <DoodleIcon name="call" size={13} /> {ll.phone}
                </p>
                <p className="mt-1 flex items-center gap-2 truncate text-[11.5px] text-muted">
                  <DoodleIcon name="mail" size={13} /> {ll.email}
                </p>
                <p className="mt-3 border-t border-line/60 pt-2.5 text-[10px] leading-relaxed text-muted">
                  Stand-in until the REX property record is joined in.
                </p>
              </div>
            </div>

            {/* Where the track will go once Susan says what the stages are. */}
            <div className="mt-6 rounded-xl border border-dashed border-line px-4 py-3 text-center">
              <p className="text-[11px] leading-relaxed text-muted">
                <span className="font-semibold text-ink">Listing process</span> — waiting on
                Susan for the real stages. It slots in here, same rail as the lead tracks.
              </p>
            </div>
          </div>

          {/* ── Tabs ── */}
          <div className="mt-5 flex gap-1 overflow-x-auto border-b border-line/80">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`hand relative whitespace-nowrap px-4 py-2.5 text-[13.5px] transition-colors ${
                  tab === t.key ? "text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {t.label}
                {t.key === "viewings" && booked.length > 0 && (
                  <span className="figures ml-1.5 text-[10.5px] text-muted">{booked.length}</span>
                )}
                {tab === t.key && (
                  <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent-dark" />
                )}
              </button>
            ))}
          </div>

          <div className="mt-5">
            {tab === "overview" && (
              <div className="grid gap-4 lg:grid-cols-2">
                <Card title="The property" icon="home">
                  <label className="mb-2 block">
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                      className="w-full rounded-lg border border-line/80 bg-transparent px-2.5 py-2 text-[12.5px] outline-none focus:border-ink"
                    >
                      <option value="">Property type…</option>
                      {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </label>
                  <div className="divide-y divide-line/40">
                    <Stepper label="Bedrooms" value={beds} onChange={setBeds} />
                    <Stepper label="Bathrooms" value={baths} onChange={setBaths} />
                    <Stepper label="Receptions" value={receptions} onChange={setReceptions} />
                  </div>
                  <label className="mt-2 block">
                    <select
                      value={furnished}
                      onChange={(e) => setFurnished(e.target.value)}
                      className="w-full rounded-lg border border-line/80 bg-transparent px-2.5 py-2 text-[12.5px] outline-none focus:border-ink"
                    >
                      <option value="">Furnishing…</option>
                      <option>Furnished</option>
                      <option>Part furnished</option>
                      <option>Unfurnished</option>
                    </select>
                  </label>
                  <p className="mt-3.5 border-t border-line/60 pt-2.5 text-[10px] leading-relaxed text-muted">
                    Bedroom counts aren&apos;t in REX&apos;s listing projection, which is why
                    the board column is blank. Captured here, they can be written back.
                  </p>
                </Card>

                <Card title="Marketing" icon="megaphone">
                  <dl className="space-y-2 text-[12.5px]">
                    {[
                      ["Status", status.label],
                      ["Rent", `£${listing.rent?.toLocaleString("en-GB")} pcm`],
                      ["Available from", listing.availableFrom ?? "Not set"],
                      ["Photos on file", String(listing.imageCount)],
                      ["EPC expires", listing.epcExpiry ?? "Not recorded"],
                      ["Age in REX", listing.daysOnMarket != null ? `${listing.daysOnMarket} days` : "—"],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-4 border-b border-line/40 pb-2 last:border-0 last:pb-0">
                        <dt className="text-muted">{k}</dt>
                        <dd className="text-right">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  {listing.imageCount === 0 && (
                    <p className="mt-3 rounded-lg bg-accent-soft/50 px-3 py-2 text-[11px] leading-relaxed text-accent-dark">
                      No photos. A listing without photos gets almost no portal traffic —
                      this is the single highest-value thing to fix on this record.
                    </p>
                  )}
                </Card>
              </div>
            )}

            {tab === "photos" && (
              <Card title="Photos" icon="folder">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {listing.image && (
                    <div className="overflow-hidden rounded-xl border border-line/60">
                      <PropertyPhoto src={listing.image} className="aspect-[4/3] w-full" />
                    </div>
                  )}
                  {Array.from({ length: 3 }, (_, i) => (
                    <PhotoBox
                      key={i}
                      refId={`listing-${listing.id}`}
                      label={i === 0 && !listing.image ? "Add the main photo" : "Add a photo"}
                    />
                  ))}
                </div>
                <p className="mt-4 border-t border-line/60 pt-3 text-[10.5px] leading-relaxed text-muted">
                  Drop a file on any box, or click it. Nothing is stored yet — photos need
                  the R2 bucket first, because they can&apos;t be pushed straight to REX;
                  they have to live somewhere with a URL before REX can be handed one.
                </p>
              </Card>
            )}

            {tab === "viewings" && (
              <Card
                title="Viewings"
                icon="calendar"
                action={
                  <PressButton
                    onClick={() => setBooking(true)}
                    className="press-ring flex items-center gap-2 rounded-full bg-accent-dark px-3.5 py-2 text-[11.5px] font-semibold text-page"
                  >
                    <DoodleIcon name="calendar" size={13} />
                    Book viewing
                  </PressButton>
                }
              >
                {booked.length ? (
                  <ul className="space-y-3">
                    {booked.map((v, i) => (
                      <li key={i} className="flex items-center gap-3 border-b border-line/40 pb-3 last:border-0 last:pb-0">
                        <span className="figures w-32 shrink-0 text-[12px] text-accent-dark">{v.when}</span>
                        <span className="min-w-0 flex-1 truncate text-[12.5px]">{v.who}</span>
                        <Pill tone="neutral">Booked</Pill>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-6 text-center text-[12px] text-muted">
                    Nothing booked on this property yet.
                  </p>
                )}
              </Card>
            )}

            {tab === "applicants" && (
              <Card
                title="Applicants"
                icon="user"
                action={
                  <PressButton
                    onClick={() => setEmailing(true)}
                    className="press-ring flex items-center gap-2 rounded-full bg-accent-dark px-3.5 py-2 text-[11.5px] font-semibold text-page"
                  >
                    <DoodleIcon name="mail" size={13} />
                    Email to tenants
                  </PressButton>
                }
              >
                <p className="text-[12.5px] leading-relaxed text-muted">
                  Applicants arrive here from the tenant book — a tenant stays a lead until
                  they apply, and becomes an application at that point. Emailing this
                  property out is what starts that.
                </p>
              </Card>
            )}
          </div>
        </div>
      </aside>

      <EmailToTenants open={emailing} onClose={() => setEmailing(false)} listing={listing} />

      <ViewingBooker
        open={booking}
        onClose={() => setBooking(false)}
        lead={null}
        applicants={APPLICANTS}
        properties={[listing]}
        agent="Kirstie"
        onBooked={(v) => setBooked((cur) => [{ when: v.when, who: v.who }, ...cur])}
      />
    </div>
  );
}
