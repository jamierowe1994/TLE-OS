"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import PropertyPhoto from "@/components/PropertyPhoto";
import { DIARY, minutesOf } from "@/lib/diary";
import rexSample from "@/lib/rex-sample.json";

/**
 * The tenant's portal — rebuilt as an app, after the Dribbble references:
 * a search bar across the top, a left rail that takes you to exactly one
 * thing at a time, and "My agent" — headshot, cut out, human — pinned to
 * the story throughout.
 *
 * The rail is STAGE-AWARE: sections that aren't relevant yet are locked
 * with an honest line about when they open. Sophie is at the viewings
 * stage, so Referencing and Documents sit locked until an offer is
 * accepted. One process, shown one step at a time.
 *
 * Still brand red, corporate type, no illustrations — the customer surface.
 */

const RED = "#e31f36";
const ME = "Sophie Turner";

/** Her agent — the attached owner of her record. Headshot is a cutout
 *  (no background) so it sits on the tinted card like the references. */
const AGENT = {
  name: "Rhiannon Carter",
  role: "Your lettings agent",
  phone: "0115 824 3310",
  mobile: "07922 415 780",
  email: "rhiannon@thelettingexperts.co.uk",
  photo: "/portal/agent-rhiannon.png",
};

/** Where Sophie is in the journey — drives which rail sections are open. */
const STAGES = ["Looking", "Viewings", "Offer made", "Referencing", "Signing", "Moved in"] as const;
const MY_STAGE = 1; // viewings

type SectionKey = "home" | "viewings" | "properties" | "offers" | "referencing" | "documents" | "guides";

const SECTIONS: {
  key: SectionKey;
  label: string;
  /** first stage index at which this section unlocks */
  opensAt: number;
  locked?: string; // the honest line shown while locked
}[] = [
  { key: "home", label: "Overview", opensAt: 0 },
  { key: "properties", label: "Properties for you", opensAt: 0 },
  { key: "viewings", label: "My viewings", opensAt: 0 },
  { key: "offers", label: "Offers made", opensAt: 1 },
  { key: "referencing", label: "Referencing", opensAt: 3, locked: "Opens when an offer is accepted" },
  { key: "documents", label: "Documents", opensAt: 3, locked: "Opens with referencing" },
  { key: "guides", label: "Guides", opensAt: 0 },
];

type Listing = {
  id: string; name: string; locality: string; rent: number | null;
  publicationStatus: string | null; letAgreed: boolean;
  availableFrom: string | null; image: string | null; imageCount: number;
};
const LISTINGS = rexSample.listings as Listing[];
const AVAILABLE = LISTINGS.filter((l) => !l.letAgreed);
/** The ones the agency attached to her record — "interested in". */
const PICKED = AVAILABLE.slice(0, 4);

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

const SLOT_CHOICES = ["09:30", "11:00", "12:30", "14:00", "15:30", "17:00", "18:30"];

export default function TenantHome() {
  const [section, setSection] = useState<SectionKey>("home");
  const [query, setQuery] = useState("");

  const myViewings = DIARY.filter((a) => a.kind === "viewing" && a.who === ME && a.day >= 0)
    .sort((a, b) => a.day - b.day || minutesOf(a.start) - minutesOf(b.start));

  const [rescheduling, setRescheduling] = useState<string | null>(null);
  const [reDay, setReDay] = useState<number | null>(null);
  const [reSlot, setReSlot] = useState<string | null>(null);
  const [requested, setRequested] = useState<Record<string, string>>({});
  const [offering, setOffering] = useState<Listing | null>(null);
  const [offerAmount, setOfferAmount] = useState("");
  const [offerNote, setOfferNote] = useState("");
  const [offered, setOffered] = useState<Record<string, string>>({}); // id -> amount
  const [openGuide, setOpenGuide] = useState<string | null>(null);

  // The search bar is real: it filters homes and jumps you to the results.
  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return AVAILABLE.filter(
      (l) => l.name.toLowerCase().includes(q) || l.locality.toLowerCase().includes(q)
    );
  }, [query]);

  const offersMade = Object.entries(offered);

  function Locked({ note }: { note: string }) {
    return (
      <div className="rounded-2xl border border-dashed border-black/15 px-6 py-14 text-center">
        <p className="text-[15px] font-bold text-black/60">🔒 Not yet — and that&apos;s fine</p>
        <p className="mx-auto mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-black/50">{note}.
          We&apos;ll open it the moment it matters, and email you when we do.</p>
      </div>
    );
  }

  function ListingCard({ l, big }: { l: Listing; big?: boolean }) {
    return (
      <div className="overflow-hidden rounded-2xl border border-black/10 bg-white transition-shadow hover:shadow-[0_10px_30px_-18px_rgba(0,0,0,0.35)]">
        <PropertyPhoto src={l.image} className={`${big ? "h-40" : "h-28"} w-full`} />
        <div className={big ? "p-4" : "p-3"}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={`truncate font-bold ${big ? "text-[14px]" : "text-[12.5px]"}`}>{l.name}</p>
              <p className="text-[11px] text-black/50">{l.locality}</p>
            </div>
            <p className={`shrink-0 font-bold ${big ? "text-[16px]" : "text-[13px]"}`}>
              £{l.rent?.toLocaleString("en-GB")}
              <span className="text-[9.5px] font-medium text-black/40"> pcm</span>
            </p>
          </div>
          {big && (
            <div className="mt-3 flex gap-2">
              {offered[l.id] ? (
                <p className="text-[12px] font-semibold" style={{ color: RED }}>
                  ✓ Offer of £{Number(offered[l.id]).toLocaleString("en-GB")} sent
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
          )}
        </div>
      </div>
    );
  }

  function ViewingRow({ v }: { v: (typeof myViewings)[number] }) {
    const property = v.what.replace(/^[^—]+—\s*/, "");
    const req = requested[v.id];
    return (
      <div className="rounded-2xl border border-black/10 bg-white p-4">
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
              onClick={() => { setRescheduling(rescheduling === v.id ? null : v.id); setReDay(null); setReSlot(null); }}
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
  }

  /** "My agent" — the human at the top, per the references: cutout headshot
   *  on a soft tinted card, name, and the two ways to reach her. */
  function AgentCard() {
    return (
      <div className="overflow-hidden rounded-2xl border border-black/10 bg-[#f6f4f1]">
        <div className="flex items-end gap-4 px-5 pt-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={AGENT.photo} alt={AGENT.name} className="h-28 w-24 shrink-0 object-contain object-bottom" />
          <div className="pb-4">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.12em]" style={{ color: RED }}>
              My agent
            </p>
            <p className="mt-0.5 text-[16px] font-bold leading-tight">{AGENT.name}</p>
            <p className="text-[11.5px] text-black/50">{AGENT.role}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-black/10 bg-white p-3">
          <a
            href={`tel:${AGENT.mobile.replace(/\s/g, "")}`}
            className="rounded-lg py-2 text-center text-[12px] font-bold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: RED }}
          >
            📞 Call
          </a>
          <a
            href={`mailto:${AGENT.email}`}
            className="rounded-lg border border-black/15 py-2 text-center text-[12px] font-bold transition-colors hover:border-black"
          >
            ✉️ Email
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-8 py-8">
      {/* ══ The left rail — one place at a time, locked where it isn't time yet. ══ */}
      <aside className="w-52 shrink-0">
        <nav className="space-y-1">
          {SECTIONS.map((s) => {
            const locked = MY_STAGE < s.opensAt;
            const on = section === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => { if (!locked) { setSection(s.key); setQuery(""); } }}
                title={locked ? s.locked : undefined}
                className={`flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-[13px] font-semibold transition-colors ${
                  on ? "text-white" : locked ? "cursor-default text-black/30" : "text-black/70 hover:bg-black/[0.04] hover:text-black"
                }`}
                style={on ? { backgroundColor: "#16181d" } : undefined}
              >
                {s.label}
                {locked && <span className="text-[11px]">🔒</span>}
              </button>
            );
          })}
        </nav>

        {/* Where she is — quiet, under the rail. */}
        <div className="mt-6 rounded-xl border border-black/10 p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-black/40">Where you are</p>
          <ol className="mt-2 space-y-1.5">
            {STAGES.map((st, i) => (
              <li key={st} className="flex items-center gap-2 text-[11.5px]">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${i > MY_STAGE ? "border border-black/20" : ""}`}
                  style={i <= MY_STAGE ? { backgroundColor: RED } : undefined}
                />
                <span className={i === MY_STAGE ? "font-bold" : i < MY_STAGE ? "text-black/60" : "text-black/35"}>
                  {st}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </aside>

      {/* ══ The main pane. ══ */}
      <div className="min-w-0 flex-1">
        {/* The search bar — top of everything, like the references. */}
        <div className="flex items-center gap-3 rounded-full border border-black/10 bg-white px-5 py-3 shadow-[0_6px_20px_-14px_rgba(0,0,0,0.3)]">
          <span className="text-[14px] text-black/35">🔍</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search our homes — a road, an area, anything…"
            className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-black/35"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} className="text-[12px] font-bold text-black/40 hover:text-black">
              Clear
            </button>
          )}
        </div>

        {/* Search results take over the pane while a query is live. */}
        {searched ? (
          <section className="mt-6">
            <h2 className="text-[15px] font-bold">
              {searched.length ? `${searched.length} home${searched.length === 1 ? "" : "s"} matching "${query}"` : `Nothing matching "${query}" — yet`}
            </h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {searched.map((l) => <ListingCard key={l.id} l={l} big />)}
            </div>
            {!searched.length && (
              <p className="mt-2 max-w-md text-[12.5px] leading-relaxed text-black/50">
                Tell {AGENT.name.split(" ")[0]} what you&apos;re after and we&apos;ll flag anything
                that fits the moment it comes on.
              </p>
            )}
          </section>
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_260px]">
            {/* ── Section content, left. ── */}
            <div className="min-w-0">
              {section === "home" && (
                <>
                  <h1 className="text-[22px] font-bold leading-tight">Hello, Sophie</h1>
                  <p className="mt-1 text-[13px] text-black/60">
                    You&apos;re at the viewings stage — {myViewings.length} booked, and{" "}
                    {PICKED.length} homes picked for you.
                  </p>
                  {myViewings[0] && (
                    <div className="mt-5">
                      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-black/45">Next up</p>
                      <ViewingRow v={myViewings[0]} />
                    </div>
                  )}
                  <div className="mt-6">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-black/45">Picked for you</p>
                      <button type="button" onClick={() => setSection("properties")} className="text-[11.5px] font-bold" style={{ color: RED }}>
                        See all →
                      </button>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {PICKED.slice(0, 2).map((l) => <ListingCard key={l.id} l={l} big />)}
                    </div>
                  </div>
                </>
              )}

              {section === "properties" && (
                <>
                  <h1 className="text-[20px] font-bold">Properties for you</h1>
                  <p className="mt-1 text-[12.5px] text-black/55">
                    The homes we&apos;ve attached to your search — tell us if we&apos;re close.
                  </p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {PICKED.map((l) => <ListingCard key={l.id} l={l} big />)}
                  </div>
                  <h2 className="mt-8 text-[14px] font-bold">Everything else we have</h2>
                  <div className="mt-3 grid gap-4 sm:grid-cols-3">
                    {AVAILABLE.filter((l) => !PICKED.includes(l)).map((l) => <ListingCard key={l.id} l={l} />)}
                  </div>
                </>
              )}

              {section === "viewings" && (
                <>
                  <h1 className="text-[20px] font-bold">My viewings</h1>
                  <div className="mt-4 space-y-3">
                    {myViewings.map((v) => <ViewingRow key={v.id} v={v} />)}
                    {!myViewings.length && (
                      <p className="rounded-xl border border-dashed border-black/15 py-6 text-center text-[12.5px] text-black/50">
                        No viewings booked yet — pick a home and we&apos;ll arrange one.
                      </p>
                    )}
                  </div>
                </>
              )}

              {section === "offers" && (
                <>
                  <h1 className="text-[20px] font-bold">Offers made</h1>
                  {offersMade.length ? (
                    <div className="mt-4 space-y-3">
                      {offersMade.map(([id, amount]) => {
                        const l = LISTINGS.find((x) => x.id === id);
                        return (
                          <div key={id} className="flex items-center justify-between rounded-2xl border border-black/10 bg-white p-4">
                            <div>
                              <p className="text-[14px] font-bold">{l?.name}</p>
                              <p className="text-[12px] text-black/50">
                                £{Number(amount).toLocaleString("en-GB")} pcm — with the landlord now
                              </p>
                            </div>
                            <span className="rounded-full px-3 py-1 text-[10.5px] font-bold text-white" style={{ backgroundColor: "#c9a24c" }}>
                              Awaiting reply
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-4 rounded-xl border border-dashed border-black/15 py-6 text-center text-[12.5px] text-black/50">
                      No offers yet — when you find the one, it&apos;s two clicks from the property card.
                    </p>
                  )}
                </>
              )}

              {section === "referencing" && (
                MY_STAGE >= 3 ? <p>Referencing form…</p> : <Locked note="Referencing starts once a landlord accepts your offer" />
              )}
              {section === "documents" && (
                MY_STAGE >= 3 ? <p>Documents…</p> : <Locked note="There's nothing to sign or upload until referencing begins" />
              )}

              {section === "guides" && (
                <>
                  <h1 className="text-[20px] font-bold">Guides for the road ahead</h1>
                  <div className="mt-4 space-y-3">
                    {GUIDES.map((g) => (
                      <button
                        key={g.title}
                        type="button"
                        onClick={() => setOpenGuide(openGuide === g.title ? null : g.title)}
                        className="block w-full rounded-2xl border border-black/10 bg-white p-4 text-left transition-colors hover:border-black/30"
                      >
                        <p className="text-[13.5px] font-bold">{g.title}</p>
                        <p className="mt-1 text-[12.5px] leading-relaxed text-black/60">
                          {openGuide === g.title ? g.body : g.blurb}
                        </p>
                        <p className="mt-2 text-[11px] font-bold" style={{ color: RED }}>
                          {openGuide === g.title ? "Close" : "Read →"}
                        </p>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* ── The right rail: her agent, then the profile nudge. ── */}
            <div className="space-y-4">
              <AgentCard />
              <div className="rounded-2xl p-4 text-white" style={{ backgroundColor: "#16181d" }}>
                <p className="text-[13px] font-bold">Make your application the easy yes</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-white/70">
                  A finished profile is what landlords choose between offers. Yours is 20% done.
                </p>
                <Link
                  href="/tenant/profile"
                  className="mt-3 inline-block rounded-lg px-4 py-2 text-[12px] font-bold text-white transition-opacity hover:opacity-90"
                  style={{ backgroundColor: RED }}
                >
                  Finish my profile
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

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
                  setOffered((cur) => ({ ...cur, [offering.id]: offerAmount || String(offering.rent ?? "") }));
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
