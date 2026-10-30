"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Tag } from "@/components/ListingTags";
import DoodleIcon from "@/components/DoodleIcon";
import type { OfferDetail } from "@/app/api/listings/[id]/offers/route";
import OfferPartsList from "@/components/offers/OfferPartsList";
import SendOfferToLandlord from "@/components/offers/SendOfferToLandlord";
import { CounterForm, NegotiationHistory } from "@/components/offers/OfferNegotiation";
import type { OfferCounter } from "@/lib/offer-counters";
import DeclineOtherOffers from "@/components/offers/DeclineOtherOffers";
import { Badge, Ico, type Tone } from "@/components/new-look/Parts";

/**
 * THE OFFERS ON ONE HOME (7 Oct 2026).
 *
 * James: an offer is not an application until it is accepted - the home is
 * still taking viewings until then - and the agent must be able to decline an
 * offer as well as accept it. So every offer on the listing is here, open
 * ones first, each with Accept and Decline. Accepting sends it to
 * Applications; declining keeps it here, greyed, and the home carries on.
 *
 * OPENED ON THE LISTING (James, 12 Oct 2026): "a lot of the time we take
 * someone to somewhere ... a lot of times they just want to go back to where
 * they were." An offer opens here - the list slides away and the offer slides
 * in, with Back to return - rather than jumping to Applications. Accepting it
 * is made a moment of: confetti, "Loading into Applications", then the agent
 * is told the home stays on Listings until the holding deposit and is asked
 * whether to go to Applications now.
 *
 * Decisions are kept in the OS (POST /api/offers/decide); REX is still marked
 * by hand, and the application's file says so. A test offer plays its own
 * test file's Accept/Decline. Nothing is sent to the tenant or landlord by
 * itself; Send to the landlord on an opened offer is the agent's own press,
 * with a preview first (components/offers/SendOfferToLandlord, 15 Oct 2026).
 *
 * COUNTER (James, 16 Oct 2026): an open offer can be countered, back and
 * forth, each round keyed in for the side that made it
 * (components/offers/OfferNegotiation). The newest figure is on the table,
 * and Accept agrees it.
 *
 * DECLINE OTHER OFFERS (James, 22 Oct 2026): once one is accepted, a button
 * over the list lets the held ones go - the hold rule said first, then a
 * "not this one" drafted for each to read and send
 * (components/offers/DeclineOtherOffers).
 *
 * DISCARD (James, 29 Oct 2026): a second offer from the same person is marked
 * Duplicate and offers Discard instead of Decline, which would have emailed
 * them a no while their other offer goes ahead. Discard emails nobody and
 * takes it off the list (POST /api/offers/discard); the listing's Activity
 * keeps who and when. An offer sent again by the same person joins their
 * first one (lib/offer-repeat), and says how many times it was sent.
 */

export type ListingOffer = {
  ref: string;
  kind: "os" | "rex" | "test";
  appId: string | null;
  name: string;
  amount: number | null;
  moveIn: string | null;
  at: string | null;
  via: string;
  status: "open" | "accepted" | "declined";
  decided: string | null;
  undoable: boolean;
  href: string;
  detail?: OfferDetail;
  /** When the agent last sent it to the landlord (ticket 0268fdcc). */
  landlordSent?: { at: string; by: string } | null;
  /** What was first offered, before any counter. */
  offered?: number | null;
  /** The back-and-forth, oldest first (16 Oct 2026). */
  counters?: OfferCounter[];
  /** Every time they sent it, oldest first, when more than once (29 Oct 2026). */
  tries?: { at: string; amount: number | null; moveIn: string | null; via: string }[];
  /** A second offer from the same person, and the one it repeats. */
  duplicateOf?: { ref: string; name: string; at: string | null } | null;
  /** Sent again after it was decided. */
  againAfter?: "accepted" | "declined" | null;
};

const isDup = (o: ListingOffer) => Boolean(o.duplicateOf);

/** "Offered 3 times, last 29 Oct", for an offer sent more than once. */
const triesWord = (o: ListingOffer) => (o.tries && o.tries.length > 1 ? `offered ${o.tries.length} times, last ${short(o.tries[o.tries.length - 1].at)}` : "");

const countered = (o: ListingOffer) => Boolean(o.counters?.length);

const short = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
const gbp = (n: number) => `£${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;

const ORDER = { open: 0, accepted: 1, declined: 2 } as const;

/** NEW LOOK (23 Oct 2026): this screen never names REX. The same words, its name taken out. */
function unRex(s: string): string {
  return s
    .replace(/\s*-\s*REX not updated yet/gi, "")
    .replace(/^\s*In REX\s*$/i, "")
    .replace(/\s+in REX\b/gi, "")
    .replace(/\bREX'?s?\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
const lower = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);

/** The new look's status word and tone, held ones included. */
function statusOf(o: ListingOffer, taken: ListingOffer | null): { word: string; tone: Tone } {
  if (isDup(o)) return { word: "Duplicate", tone: "warning" };
  if (o.status === "accepted") return { word: "Accepted", tone: "good" };
  if (o.status === "declined") return { word: "Declined", tone: "neutral" };
  if (taken) return { word: "Held", tone: "neutral" };
  if (countered(o)) return { word: "Negotiating", tone: "info" };
  if (o.landlordSent) return { word: "Landlord review", tone: "warning" };
  return { word: "Open", tone: "info" };
}

/** Everything an opened offer says, label and value, for either look. */
function offerFacts(o: ListingOffer, asking: number | null): Array<[string, string]> {
  const d = o.detail;
  const facts: Array<[string, string]> = [];
  /* Countered: the figure on the table, or the one agreed (16 Oct 2026). */
  const label = !countered(o) ? "Offer" : o.status === "accepted" ? "Agreed rent" : o.status === "open" ? "On the table" : "Last figure";
  if (o.amount != null) facts.push([label, `${gbp(o.amount)} a month${asking ? (o.amount >= asking ? " · the asking rent" : ` · ${gbp(asking - o.amount)} under the asking ${gbp(asking)}`) : ""}`]);
  if (o.moveIn) facts.push(["Moving in", short(o.moveIn)]);
  if (d?.people.length) facts.push(["Who would live there", d.people.join(", ")]);
  if (d && (d.adults != null || d.children != null)) facts.push(["Household", [d.adults != null ? `${d.adults} adult${d.adults === 1 ? "" : "s"}` : null, d.children ? `${d.children} child${d.children === 1 ? "" : "ren"}` : null].filter(Boolean).join(", ") || "-"]);
  if (d?.pets != null) facts.push(["Pets", d.pets ? d.petsNote || "Yes" : "None"]);
  if (d?.work) facts.push(["Work", d.work]);
  if (d?.income) facts.push(["Household income", `${gbp(d.income)} a year`]);
  if (d?.affordability) facts.push(["Affordability", `Rent is ${Math.round(d.affordability)}% of income`]);
  if (d?.guarantor != null) facts.push(["Guarantor", d.guarantor ? "Available" : "None"]);
  if (d?.email) facts.push(["Email", d.email]);
  if (d?.phone) facts.push(["Phone", d.phone]);
  return facts;
}

/** The application an accepted offer became: a REX one by its own id, an OS one as "os:<offer id>". */
function appHref(ref: string): string {
  return `/applications?open=${encodeURIComponent(ref.startsWith("rex:") ? ref.slice(4) : ref)}`;
}

export default function ListingOffers({
  offers,
  canOffer,
  onChanged,
  asking = null,
  home = "This home",
  listingId = null,
  initialOpen = null,
  rexUnread = false,
  look,
  className = "",
}: {
  offers: ListingOffer[] | null;
  canOffer: boolean;
  onChanged: () => void;
  /** The listing's rent, a month, to set an offer against. */
  asking?: number | null;
  /** The home's name, for the accepted moment. */
  home?: string;
  /** The listing, for Send to the landlord. */
  listingId?: string | null;
  /** An offer to open on arrival (?offer=, from Listings > Offers in, 15 Oct 2026). */
  initialOpen?: string | null;
  /** The applications from REX couldn't be read just now (22 Oct 2026). */
  rexUnread?: boolean;
  /** "new": the new look's Offers card (lib/new-look); otherwise as it always was. */
  look?: "new";
  /** For the parent to place the new look's card. */
  className?: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [err, setErr] = useState<{ ref: string; text: string } | null>(null);
  const [openRef, setOpenRef] = useState<string | null>(null);
  const [won, setWon] = useState<ListingOffer | null>(null);
  const [toLandlord, setToLandlord] = useState<ListingOffer | null>(null);
  /* The offer whose counter form is open (16 Oct 2026). */
  const [countering, setCountering] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);

  /* Opened straight from the Offers in list: once, when the offers arrive. */
  const [asked, setAsked] = useState(initialOpen);
  useEffect(() => {
    if (!asked || !offers) return;
    if (offers.some((o) => o.ref === asked)) setOpenRef(asked);
    setAsked(null);
  }, [asked, offers]);

  const sorted = useMemo(() => [...(offers ?? [])].sort((a, b) => ORDER[a.status] - ORDER[b.status]), [offers]);
  const open = sorted.find((o) => o.ref === openRef) ?? null;
  /* HELD (9 Oct 2026, James): once one offer is accepted the others are not
     declined - they wait, open, until that tenant's holding fee is paid, in
     case they drop out. The application file asks to let them go once it is. */
  const taken = sorted.find((o) => o.status === "accepted") ?? null;

  /* Discard a duplicate: asks once, emails nobody (29 Oct 2026). */
  async function discard(o: ListingOffer) {
    if (busy || !o.duplicateOf) return;
    if (confirming !== `dis:${o.ref}`) {
      setConfirming(`dis:${o.ref}`);
      return;
    }
    setConfirming(null);
    setBusy(o.ref);
    setErr(null);
    try {
      const r = await fetch("/api/offers/discard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ref: o.ref, listingId, duplicateOf: o.duplicateOf.ref, name: o.name }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!j.ok) setErr({ ref: o.ref, text: j.error ?? "That didn't save. Try again." });
      else {
        if (openRef === o.ref) setOpenRef(null);
        onChanged();
      }
    } catch {
      setErr({ ref: o.ref, text: "That didn't go through. Try again." });
    } finally {
      setBusy(null);
    }
  }

  /** What a duplicate says about itself, for either look. */
  const dupNote = (o: ListingOffer) =>
    o.duplicateOf
      ? confirming === `dis:${o.ref}`
        ? `Discard ${o.name}'s duplicate? It comes off this list and nobody is emailed. ${o.duplicateOf.at ? `Their offer from ${short(o.duplicateOf.at)}` : "Their other offer"} stays as it is.`
        : `Same person as ${o.duplicateOf.at ? `the offer from ${short(o.duplicateOf.at)}` : "another offer here"}. Discard it rather than decline it, so they aren't told no.`
      : "";
  /** A declined tenant who tried again, said as a repeat. */
  const againNote = (o: ListingOffer) =>
    o.againAfter === "declined" && o.tries?.length
      ? `Offered again ${short(o.tries[o.tries.length - 1].at)} after it was declined. It stays declined and nothing was sent to them.${o.undoable ? " Undo opens it again." : ""}`
      : o.againAfter === "accepted" && o.tries?.length
        ? `Sent again ${short(o.tries[o.tries.length - 1].at)} after it was accepted. The accepted figures stand.`
        : "";

  async function act(o: ListingOffer, what: "accepted" | "declined" | "undo") {
    if (busy) return;
    if (what === "declined" && confirming !== o.ref) {
      setConfirming(o.ref);
      return;
    }
    /* Accepting is for the landlord (James, 12 Oct 2026: most landlords aren't
       on the portal yet, so it's agreed with them on a call), so it asks once. */
    if (what === "accepted" && confirming !== `acc:${o.ref}`) {
      setConfirming(`acc:${o.ref}`);
      return;
    }
    setConfirming(null);
    setBusy(o.ref);
    setErr(null);
    try {
      const r =
        o.kind === "test"
          ? await fetch(`/api/applications/${encodeURIComponent(o.appId ?? "")}/test`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ action: what === "accepted" ? "accept" : "decline" }),
            })
          : await fetch("/api/offers/decide", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ ref: o.ref, decision: what }),
            });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!j.ok) setErr({ ref: o.ref, text: j.error ?? "That didn't save. Try again." });
      /* Accepted: the moment, then the choice of Applications (12 Oct 2026). */
      else if (what === "accepted" && o.kind !== "test") setWon(o);
      else onChanged();
    } catch {
      setErr({ ref: o.ref, text: "That didn't go through. Try again." });
    } finally {
      setBusy(null);
    }
  }

  /* THE NEW LOOK (23 Oct 2026): one card, rows on hairlines, the same
     decisions, confirmations, counter, held offers and opened offer. */
  if (look === "new") {
    const heldNew = taken && taken.kind !== "test" ? sorted.filter((o) => o.status === "open" && o.kind !== "test" && !isDup(o)) : [];

    const decideNew = (o: ListingOffer, big = false) => {
      const sm = big ? "" : " nl-btn--sm";
      if (o.duplicateOf) {
        return (
          <span className="nl-off-acts">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void discard(o)}
              onBlur={() => confirming === `dis:${o.ref}` && setConfirming(null)}
              className={`nl-btn ${confirming === `dis:${o.ref}` ? "nl-btn--danger" : "nl-btn--secondary"}${sm}`}
            >
              {busy === o.ref ? "Saving…" : confirming === `dis:${o.ref}` ? "Yes, discard it" : "Discard"}
            </button>
          </span>
        );
      }
      if (o.status === "open") {
        return (
          <span className="nl-off-acts">
            {/* One accepted at a time: undo or decline that one first. */}
            {!taken && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void act(o, "accepted")}
                onBlur={() => confirming === `acc:${o.ref}` && setConfirming(null)}
                className={`nl-btn nl-btn--primary${sm}`}
              >
                {busy === o.ref
                  ? "Saving…"
                  : countered(o) && o.amount != null
                    ? confirming === `acc:${o.ref}` ? `Yes, agree ${gbp(o.amount)}` : `Agree ${gbp(o.amount)}`
                    : confirming === `acc:${o.ref}` ? "Yes, the landlord accepts" : "Accept"}
              </button>
            )}
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void act(o, "declined")}
              onBlur={() => confirming === o.ref && setConfirming(null)}
              className={`nl-btn ${confirming === o.ref ? "nl-btn--danger" : "nl-btn--secondary"}${sm}`}
            >
              {confirming === o.ref ? "Yes, decline it" : "Decline"}
            </button>
            {/* The back-and-forth (16 Oct 2026): opens the offer with the form. */}
            {!taken && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => { setConfirming(null); setOpenRef(o.ref); setCountering(o.ref); }}
                aria-pressed={countering === o.ref}
                className={`nl-btn nl-btn--quiet${sm}`}
              >
                Counter
              </button>
            )}
          </span>
        );
      }
      if (o.undoable) {
        return (
          <span className="nl-off-acts">
            <button type="button" disabled={busy !== null} onClick={() => void act(o, "undo")} className={`nl-btn nl-btn--quiet${sm}`}>
              {busy === o.ref ? "Saving…" : "Undo"}
            </button>
          </span>
        );
      }
      return <span className="nl-off-acts" />;
    };

    const notesNew = (o: ListingOffer) => {
      const lines: React.ReactNode[] = [];
      if (o.status === "accepted" && o.kind !== "test") {
        lines.push(
          <p key="app" className="nl-meta">
            On Applications now.{" "}
            <a href={appHref(o.ref)} className="nl-link">
              Open the application and Push to Propoly <Ico name="arrow" size={13} />
            </a>
          </p>
        );
      }
      if (confirming === `acc:${o.ref}`) {
        lines.push(
          <p key="acc" className="nl-meta">
            {countered(o) && o.amount != null
              ? <>Both sides agree {gbp(o.amount)} a month? It goes onto Applications at that rent, ready to push to Propoly. The other offers are held until the holding fee is paid.</>
              : <>Accept {o.name}&apos;s offer on the landlord&apos;s behalf? It goes onto Applications, ready to push to Propoly. The other offers are held until the holding fee is paid.</>}
          </p>
        );
      }
      if (o.status === "open" && taken && !isDup(o)) {
        lines.push(
          <p key="held" className="nl-meta">
            Held until {taken.name}&apos;s holding fee is paid. The home keeps taking viewings meanwhile.
          </p>
        );
      }
      if (dupNote(o)) lines.push(<p key="dup" className="nl-meta">{dupNote(o)}</p>);
      if (againNote(o)) lines.push(<p key="again" className="nl-meta">{againNote(o)}</p>);
      if (err?.ref === o.ref) lines.push(<p key="err" className="nl-off-err" role="alert">{unRex(err.text) || "That didn't save. Try again."}</p>);
      return lines.length ? <div className="nl-off-sub">{lines}</div> : null;
    };

    const notice = rexUnread ? (
      <p role="status" className="nl-off-note">
        The application forms couldn&apos;t be read just now, so some offers may be missing. Try again in a minute.
      </p>
    ) : null;

    return (
      <section className={`nl-cell nl-off-card ${className}`.trim()}>
        <h3 className="nl-block-title">Offers</h3>
        {notice}
        {offers === null ? (
          <p className="nl-off-wait nl-meta">
            <span aria-hidden className="nl-off-spin" />
            Reading the offers&hellip;
          </p>
        ) : !offers.length ? (
          !rexUnread && (
            <p className="nl-meta">
              No offers on this home yet.{canOffer ? " Press Make New Offer to put one forward, or share the offer link." : ""}
            </p>
          )
        ) : (
          <>
            {/* Held offers on a home with one accepted: let them go from here (22 Oct 2026). */}
            {heldNew.length > 0 && listingId && !open && (
              <div className="nl-off-held">
                <span className="nl-meta">
                  <span className="nl-strong" style={{ fontSize: 12 }}>{taken!.name}&apos;s offer is accepted.</span>{" "}
                  {heldNew.length} other {heldNew.length === 1 ? "offer is" : "offers are"} still open on this home.
                </span>
                <button type="button" onClick={() => setDeclining(true)} className="nl-btn nl-btn--secondary nl-btn--sm">
                  <Ico name="mail" size={14} />
                  Decline Other Offers
                </button>
              </div>
            )}
            <div className="nl-off-slide">
              <div className={`nl-off-track${open ? " is-open" : ""}`}>
                <div aria-hidden={Boolean(open)} inert={open ? true : undefined}>
                  <ul className="nl-off-rows">
                    {sorted.map((o) => {
                      const last = o.counters?.[o.counters.length - 1] ?? null;
                      const made = o.at ? `Made ${short(o.at)}` : "";
                      const meta = [
                        made,
                        o.moveIn ? `moving in ${short(o.moveIn)}` : "",
                        o.decided ? unRex(o.decided) : "",
                        o.landlordSent ? `sent to the landlord ${short(o.landlordSent.at)}` : "",
                        triesWord(o),
                        unRex(o.via),
                      ].filter(Boolean).map((x, i) => (i === 0 ? x[0].toUpperCase() + x.slice(1) : lower(x))).join(" · ");
                      const talk = last && o.status === "open" ? `${last.side === "landlord" ? "Landlord" : "Tenant"} countered${o.offered != null ? `, first offer ${gbp(o.offered)}` : ""}` : null;
                      const st = statusOf(o, taken);
                      return (
                        <li key={o.ref} className={o.status === "declined" && !isDup(o) ? "is-faded" : undefined}>
                          <div className="nl-off-row">
                            <button type="button" className="nl-off-main" title="Open the offer" onClick={() => { setConfirming(null); setOpenRef(o.ref); }}>
                              <span className="nl-strong">{o.name}</span>
                              {meta && <span className="nl-meta" title={meta}>{meta}</span>}
                              {talk && <span className="nl-off-talk">{talk}</span>}
                            </button>
                            <span className="nl-off-rent nl-strong">{o.amount != null ? `${gbp(o.amount)} pcm` : ""}</span>
                            <Badge tone={st.tone} bare>{st.word}</Badge>
                            {decideNew(o)}
                          </div>
                          {notesNew(o)}
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div aria-hidden={!open} inert={open ? undefined : true}>
                  {open && (
                    <OfferOpenedNew
                      o={open}
                      asking={asking}
                      status={statusOf(open, taken)}
                      onBack={() => { setConfirming(null); setOpenRef(null); setCountering(null); }}
                      decide={decideNew(open, true)}
                      notes={notesNew(open)}
                      negotiation={
                        <>
                          <NegotiationHistory o={open} canTakeBack={open.status === "open" && !taken && countering !== open.ref} onChanged={onChanged} />
                          {countering === open.ref && open.status === "open" && (
                            <CounterForm
                              key={`${open.ref}:${open.counters?.length ?? 0}`}
                              o={open}
                              asking={asking}
                              onCancel={() => setCountering(null)}
                              onSaved={() => { setCountering(null); onChanged(); }}
                            />
                          )}
                        </>
                      }
                      onSendToLandlord={listingId && open.status !== "declined" ? () => setToLandlord(open) : null}
                    />
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {toLandlord && listingId && (
          <SendOfferToLandlord
            offerRef={toLandlord.ref}
            listingId={listingId}
            name={toLandlord.name}
            onClose={() => setToLandlord(null)}
            onSent={onChanged}
          />
        )}

        {declining && listingId && taken && (
          <DeclineOtherOffers listingId={listingId} home={home} acceptedName={taken.name} onClose={() => setDeclining(false)} onDone={onChanged} />
        )}

        {won && (
          <OfferWon
            o={won}
            home={home}
            onStay={() => { setWon(null); setOpenRef(null); onChanged(); }}
          />
        )}
      </section>
    );
  }

  if (offers === null) {
    return (
      <p className="flex items-center justify-center gap-2 py-6 text-[12px] text-muted">
        <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
        Reading the offers&hellip;
      </p>
    );
  }
  /* Said rather than shown as none (22 Oct 2026): through the REX outage an
     applicant's form looked lost when it was only not readable yet. */
  const unread = rexUnread ? (
    <p role="status" className="mb-3 rounded-xl bg-accent-soft px-3.5 py-2.5 text-[12px] leading-relaxed text-accent-dark">
      The application forms couldn&apos;t be read just now, so some offers may be missing. Try again in a minute.
    </p>
  ) : null;
  if (!offers.length) {
    return (
      <>
        {unread}
        {!rexUnread && (
          <p className="py-6 text-center text-[12px] leading-relaxed text-muted">
            No offers on this home yet.{canOffer ? " Press Make New Offer to put one forward, or share the offer link below." : ""}
          </p>
        )}
      </>
    );
  }

  /* The decision buttons, the same on the list and on the opened offer. */
  const decide = (o: ListingOffer, big = false) => {
    const pad = big ? "px-4 py-2.5 text-[12.5px]" : "px-3 py-1.5 text-[11.5px]";
    if (o.duplicateOf) {
      return (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void discard(o)}
          onBlur={() => confirming === `dis:${o.ref}` && setConfirming(null)}
          className={`shrink-0 rounded-full border font-semibold disabled:opacity-50 ${pad} ${
            confirming === `dis:${o.ref}` ? "border-accent-dark bg-accent-dark text-white" : "border-line text-ink hover:border-ink/50"
          }`}
        >
          {busy === o.ref ? "Saving…" : confirming === `dis:${o.ref}` ? "Yes, discard it" : "Discard"}
        </button>
      );
    }
    if (o.status === "open") {
      return (
        <span className="flex shrink-0 flex-wrap items-center gap-1.5">
          {/* One accepted at a time: undo or decline that one first. */}
          {!taken && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void act(o, "accepted")}
              onBlur={() => confirming === `acc:${o.ref}` && setConfirming(null)}
              className={`rounded-full bg-[var(--brown)] font-semibold text-white disabled:opacity-50 ${pad}`}
            >
              {busy === o.ref
                ? "Saving…"
                : countered(o) && o.amount != null
                  ? confirming === `acc:${o.ref}` ? `Yes, agreed at ${gbp(o.amount)}` : `Agree at ${gbp(o.amount)}`
                  : confirming === `acc:${o.ref}` ? "Yes, the landlord accepts" : "Accept for the landlord"}
            </button>
          )}
          {/* The back-and-forth (16 Oct 2026): opens the offer with the form. */}
          {!taken && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => { setConfirming(null); setOpenRef(o.ref); setCountering(o.ref); }}
              className={`rounded-full border font-semibold disabled:opacity-50 ${pad} ${
                countering === o.ref ? "border-accent-dark bg-accent-soft text-ink" : "border-line text-ink hover:border-accent hover:bg-accent-soft"
              }`}
            >
              Counter
            </button>
          )}
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void act(o, "declined")}
            onBlur={() => confirming === o.ref && setConfirming(null)}
            className={`rounded-full border font-semibold disabled:opacity-50 ${pad} ${
              confirming === o.ref ? "border-accent-dark bg-accent-dark text-white" : "border-line text-muted hover:border-ink/50 hover:text-ink"
            }`}
          >
            {confirming === o.ref ? "Yes, decline it" : "Decline"}
          </button>
        </span>
      );
    }
    if (o.undoable) {
      return (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void act(o, "undo")}
          className={`shrink-0 rounded-full font-semibold text-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-50 ${pad}`}
        >
          {busy === o.ref ? "Saving…" : "Undo"}
        </button>
      );
    }
    return null;
  };

  const notes = (o: ListingOffer) => (
    <>
      {o.status === "accepted" && o.kind !== "test" && (
        <p className="mt-1.5 text-[11px] leading-snug text-muted">
          On Applications now.{" "}
          <a href={appHref(o.ref)} className="font-semibold text-ink underline-offset-2 hover:underline">
            Open the application and Push to Propoly →
          </a>
        </p>
      )}
      {confirming === `acc:${o.ref}` && (
        <p className="mt-1.5 text-[11px] leading-snug text-muted">
          {countered(o) && o.amount != null
            ? <>Both sides agree {gbp(o.amount)} a month? It goes onto Applications at that rent, ready to push to Propoly. The other offers are held until the holding fee is paid.</>
            : <>Accept {o.name}&apos;s offer on the landlord&apos;s behalf? It goes onto Applications, ready to push to Propoly. The other offers are held until the holding fee is paid.</>}
        </p>
      )}
      {dupNote(o) && <p className="mt-1.5 text-[11px] leading-snug text-muted">{dupNote(o)}</p>}
      {againNote(o) && <p className="mt-1.5 text-[11px] leading-snug text-muted">{againNote(o)}</p>}
      {o.status === "open" && taken && !isDup(o) && (
        <p className="mt-1.5 text-[11px] leading-snug text-muted">
          Held until {taken.name}&apos;s holding fee is paid. The home keeps taking viewings meanwhile.
        </p>
      )}
      {err?.ref === o.ref && <p className="mt-1.5 text-[11.5px] text-accent-dark">{err.text}</p>}
    </>
  );

  /* Held offers on a home with one accepted: let them go from here (22 Oct 2026). */
  const heldOnes = taken && taken.kind !== "test" ? sorted.filter((o) => o.status === "open" && o.kind !== "test" && !isDup(o)) : [];

  return (
    <>
      {unread}
      {heldOnes.length > 0 && listingId && !open && (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-line/50 bg-page px-3.5 py-3">
          <span className="min-w-0 flex-1 basis-[220px] text-[12px] leading-snug text-muted">
            <span className="font-semibold text-ink">{taken!.name}&apos;s offer is accepted.</span>{" "}
            {heldOnes.length} other {heldOnes.length === 1 ? "offer is" : "offers are"} still open on this home.
          </span>
          <button
            type="button"
            onClick={() => setDeclining(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-[12px] font-semibold text-ink transition-colors hover:border-accent hover:bg-accent-soft"
          >
            <DoodleIcon name="mail" size={14} />
            Decline Other Offers
          </button>
        </div>
      )}
      {/* The list and one offer side by side, sliding (12 Oct 2026). */}
      <div className="overflow-hidden">
        <div className={`flex w-[200%] items-start transition-transform duration-300 ease-out motion-reduce:transition-none ${open ? "-translate-x-1/2" : "translate-x-0"}`}>
          <div className="w-1/2 min-w-0 pr-1" aria-hidden={Boolean(open)} inert={open ? true : undefined}>
            <ul className="divide-y divide-line/40">
              {sorted.map((o) => {
                const last = o.counters?.[o.counters.length - 1] ?? null;
                const sub = [
                  o.via,
                  o.at ? `made ${short(o.at)}` : "",
                  o.moveIn ? `moving in ${short(o.moveIn)}` : "",
                  o.landlordSent ? `sent to the landlord ${short(o.landlordSent.at)}` : "",
                  triesWord(o),
                ].filter(Boolean).join(" · ");
                const talk = last && o.status === "open" ? `${last.side === "landlord" ? "Landlord" : "Tenant"} countered${o.offered != null ? `, first offer ${gbp(o.offered)}` : ""}` : null;
                return (
                  <li key={o.ref} className={`py-3 ${o.status === "declined" && !isDup(o) ? "opacity-60" : ""}`}>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <button
                        type="button"
                        onClick={() => { setConfirming(null); setOpenRef(o.ref); }}
                        title="Open the offer"
                        className="group -mx-2 min-w-0 flex-1 basis-[220px] rounded-xl px-2 py-1 text-left transition-colors hover:bg-accent-soft/50"
                      >
                        <span className="hand block truncate text-[13.5px] group-hover:text-accent-dark group-hover:underline group-hover:underline-offset-2">{o.name}</span>
                        <span className="block truncate text-[10.5px] text-muted">{sub}</span>
                        {talk && <span className="block truncate text-[10.5px] font-semibold text-accent-dark">{talk}</span>}
                        {o.decided && <span className="block truncate text-[10.5px] text-muted">{o.decided}</span>}
                      </button>
                      <Tag tone={isDup(o) ? "neutral" : o.status === "accepted" ? "good" : o.status === "declined" ? "neutral" : "accent"}>
                        {isDup(o) ? "Duplicate" : o.status === "accepted" ? "Accepted" : o.status === "declined" ? "Declined" : taken ? "Held" : countered(o) ? "Negotiating" : "Open"}
                      </Tag>
                      {o.amount != null && <span className="figures whitespace-nowrap text-[13px]">{gbp(o.amount)}</span>}
                      {decide(o)}
                    </div>
                    {notes(o)}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="w-1/2 min-w-0 pl-1" aria-hidden={!open} inert={open ? undefined : true}>
            {open && (
              <OfferOpened
                o={open}
                asking={asking}
                onBack={() => { setConfirming(null); setOpenRef(null); setCountering(null); }}
                decide={decide(open, true)}
                notes={notes(open)}
                negotiation={
                  <>
                    <NegotiationHistory o={open} canTakeBack={open.status === "open" && !taken && countering !== open.ref} onChanged={onChanged} />
                    {countering === open.ref && open.status === "open" && (
                      <CounterForm
                        key={`${open.ref}:${open.counters?.length ?? 0}`}
                        o={open}
                        asking={asking}
                        onCancel={() => setCountering(null)}
                        onSaved={() => { setCountering(null); onChanged(); }}
                      />
                    )}
                  </>
                }
                onSendToLandlord={listingId && open.status !== "declined" ? () => setToLandlord(open) : null}
              />
            )}
          </div>
        </div>
      </div>

      {toLandlord && listingId && (
        <SendOfferToLandlord
          offerRef={toLandlord.ref}
          listingId={listingId}
          name={toLandlord.name}
          onClose={() => setToLandlord(null)}
          onSent={onChanged}
        />
      )}

      {declining && listingId && taken && (
        <DeclineOtherOffers listingId={listingId} home={home} acceptedName={taken.name} onClose={() => setDeclining(false)} onDone={onChanged} />
      )}

      {won && (
        <OfferWon
          o={won}
          home={home}
          onStay={() => { setWon(null); setOpenRef(null); onChanged(); }}
        />
      )}
    </>
  );
}

/** One offer, opened on the listing: everything it says, and the same decision. */
function OfferOpened({
  o,
  asking,
  onBack,
  decide,
  notes,
  onSendToLandlord,
  negotiation,
}: {
  o: ListingOffer;
  asking: number | null;
  onBack: () => void;
  decide: React.ReactNode;
  notes: React.ReactNode;
  /** The back-and-forth and the counter form (16 Oct 2026). */
  negotiation?: React.ReactNode;
  /** Null where it can't be sent (a declined offer, no listing). */
  onSendToLandlord: (() => void) | null;
}) {
  const d = o.detail;
  const facts = offerFacts(o, asking);
  return (
    <div>
      <button type="button" onClick={onBack} className="-ml-1 flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold text-muted transition-colors hover:bg-page hover:text-ink">
        <span aria-hidden>‹</span> All offers
      </button>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="hand text-[20px] leading-tight">{o.name}</h3>
          <p className="mt-0.5 text-[11.5px] text-muted">{[o.via, o.at ? `made ${short(o.at)}` : ""].filter(Boolean).join(" · ")}</p>
          {o.decided && <p className="text-[11.5px] text-muted">{o.decided}</p>}
        </div>
        <Tag tone={o.status === "accepted" ? "good" : o.status === "declined" ? "neutral" : "accent"}>
          {o.status === "accepted" ? "Accepted" : o.status === "declined" ? "Declined" : countered(o) ? "Negotiating" : "Open"}
        </Tag>
      </div>
      <dl className="mt-4 divide-y divide-line/40 rounded-2xl border border-line/50 bg-white">
        {facts.map(([k, v]) => (
          <div key={k} className="flex gap-3 px-3.5 py-2.5 text-[12.5px]">
            <dt className="w-24 shrink-0 text-muted sm:w-36">{k}</dt>
            <dd className="min-w-0 flex-1 break-words">{v}</dd>
          </div>
        ))}
      </dl>
      {negotiation}
      {d?.parts?.length ? <OfferPartsList parts={d.parts} /> : null}
      {d?.works.length ? (
        <div className="mt-3 rounded-2xl border border-line/50 bg-white px-3.5 py-3 text-[12.5px]">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">Asked for before moving in</p>
          <ul className="mt-1.5 list-disc pl-4">{d.works.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      ) : null}
      {d?.note && (
        <div className="mt-3 rounded-2xl border border-line/50 bg-white px-3.5 py-3 text-[12.5px] leading-relaxed">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">In their words</p>
          <p className="mt-1.5 whitespace-pre-line">{d.note}</p>
        </div>
      )}
      {onSendToLandlord && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-line/50 bg-white px-3.5 py-3">
          <span className="min-w-0 flex-1 basis-[200px] text-[12px] leading-snug text-muted">
            {o.landlordSent
              ? `Sent to the landlord ${short(o.landlordSent.at)} by ${o.landlordSent.by}.`
              : "The landlord hasn't been told about this offer by email yet."}
          </span>
          <button
            type="button"
            onClick={onSendToLandlord}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-[12px] font-semibold text-ink transition-colors hover:border-accent hover:bg-accent-soft"
          >
            <DoodleIcon name="mail" size={14} />
            {o.landlordSent ? "Send again" : "Send to the landlord"}
          </button>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {decide}
        <a href={o.href} className="text-[11.5px] text-muted underline-offset-2 hover:text-ink hover:underline">Open the full record ›</a>
      </div>
      {notes}
    </div>
  );
}

/** One offer, opened, in the new look: the same facts and actions as OfferOpened. */
function OfferOpenedNew({
  o,
  asking,
  status,
  onBack,
  decide,
  notes,
  onSendToLandlord,
  negotiation,
}: {
  o: ListingOffer;
  asking: number | null;
  status: { word: string; tone: Tone };
  onBack: () => void;
  decide: React.ReactNode;
  notes: React.ReactNode;
  negotiation?: React.ReactNode;
  onSendToLandlord: (() => void) | null;
}) {
  const d = o.detail;
  const facts = offerFacts(o, asking);
  const made = [unRex(o.via), o.at ? `made ${short(o.at)}` : ""].filter(Boolean).join(" · ");
  const decided = o.decided ? unRex(o.decided) : "";
  return (
    <div>
      <button type="button" onClick={onBack} className="nl-link">
        <Ico name="back" size={14} />
        All offers
      </button>
      <div className="nl-off-ohead">
        <div className="min-w-0">
          <h3 className="nl-off-oname">{o.name}</h3>
          {made && <p className="nl-meta">{made[0].toUpperCase() + made.slice(1)}</p>}
          {decided && <p className="nl-meta">{decided}</p>}
        </div>
        <Badge tone={status.tone}>{status.word}</Badge>
      </div>
      {facts.length > 0 && (
        <dl className="nl-off-facts">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {negotiation}
      {d?.parts?.length ? <OfferPartsList parts={d.parts} /> : null}
      {d?.works.length ? (
        <div className="nl-off-box">
          <p className="nl-off-eyebrow">Asked for before moving in</p>
          <ul>{d.works.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      ) : null}
      {d?.note && (
        <div className="nl-off-box">
          <p className="nl-off-eyebrow">In their words</p>
          <p className="whitespace-pre-line">{d.note}</p>
        </div>
      )}
      {onSendToLandlord && (
        <div className="nl-off-box nl-off-send">
          <span className="nl-meta">
            {o.landlordSent
              ? `Sent to the landlord ${short(o.landlordSent.at)} by ${o.landlordSent.by}.`
              : "The landlord hasn't been told about this offer by email yet."}
          </span>
          <button type="button" onClick={onSendToLandlord} className="nl-btn nl-btn--secondary nl-btn--sm">
            <Ico name="mail" size={14} />
            {o.landlordSent ? "Send again" : "Send to the landlord"}
          </button>
        </div>
      )}
      <div className="nl-off-ofoot">
        {decide}
        <a href={o.href} className="nl-link" style={{ fontSize: 12 }}>
          Open the full record <Ico name="arrow" size={13} />
        </a>
      </div>
      {notes}
    </div>
  );
}

const CONFETTI = ["#A8574F", "#E8B4AA", "#56634A", "#C9D3B8", "#E0A54A", "#3B2A25"];

/**
 * ACCEPTED (James, 12 Oct 2026): "we'll make a big deal out of it ... some
 * confetti". Then "Loading into Applications" - nothing to wait for, but it
 * marks the move - and the choice: the home stays on Listings until the
 * holding deposit, go to Applications now, or stay on the listing.
 */
function OfferWon({ o, home, onStay }: { o: ListingOffer; home: string; onStay: () => void }) {
  const [phase, setPhase] = useState<"won" | "loading" | "ask">("won");
  useEffect(() => {
    const a = setTimeout(() => setPhase("loading"), 1700);
    const b = setTimeout(() => setPhase("ask"), 3000);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);
  const pieces = useMemo(
    () => Array.from({ length: 70 }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.6,
      dur: 1.8 + Math.random() * 1.4,
      size: 6 + Math.random() * 6,
      turn: Math.random() * 720 - 360,
      color: CONFETTI[i % CONFETTI.length],
      round: i % 3 === 0,
    })),
    []
  );
  if (typeof document === "undefined") return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Offer accepted" className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden">
        {pieces.map((p, i) => (
          <span
            key={i}
            className="offer-confetti absolute -top-4 block"
            style={{
              left: `${p.left}%`,
              width: p.size,
              height: p.round ? p.size : p.size * 0.45,
              borderRadius: p.round ? "50%" : 2,
              background: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.dur}s`,
              ["--turn" as string]: `${p.turn}deg`,
            }}
          />
        ))}
      </div>
      <div className="fade-up relative w-full max-w-md rounded-3xl border border-line/70 bg-page p-7 text-center shadow-[0_30px_80px_-24px_rgba(0,0,0,0.45)]">
        {phase === "won" && (
          <>
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#56634a] text-[24px] text-white">✓</span>
            <h2 className="mt-4 text-[24px] leading-tight">Offer accepted</h2>
            <p className="mt-1.5 text-[13.5px] text-muted">{o.name}{o.amount != null ? `, ${gbp(o.amount)} a month` : ""}, at {home}.</p>
          </>
        )}
        {phase === "loading" && (
          <>
            <span aria-hidden className="mx-auto block h-10 w-10 animate-spin rounded-full border-[3px] border-line border-t-accent-dark" />
            <h2 className="mt-4 text-[20px] leading-tight">Loading into Applications…</h2>
          </>
        )}
        {phase === "ask" && (
          <>
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#56634a] text-[24px] text-white">✓</span>
            <h2 className="mt-4 text-[21px] leading-tight">It&apos;s on Applications</h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
              {home} stays on Listings until the holding deposit is paid, and keeps taking viewings until then. Go to Applications now to push it to Propoly?
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={onStay} className="rounded-full border border-line/80 px-4 py-2.5 text-[12.5px] font-semibold text-muted hover:text-ink">
                Stay on the listing
              </button>
              <button type="button" onClick={() => window.location.assign(appHref(o.ref))} className="rounded-full bg-[var(--brown)] px-5 py-2.5 text-[12.5px] font-semibold text-white">
                Go to Applications
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
