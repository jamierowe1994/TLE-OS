"use client";

import type { ReactNode } from "react";
import type { MarketPicture, MarketPictureScope } from "@/lib/market-picture";
import { MARKET_BLOCKS, type MarketBlock, type PresentMarket } from "@/lib/present";
import { money } from "./shared";

/**
 * THE LOCAL MARKET, AS SIX CARDS (James's builder, 24 Oct 2026).
 *
 * Each card is a plain-English headline, one picture and one line on what it
 * means for the landlord, all from the Homesearch lettings feed for the sector
 * or the district (/api/market-picture). A card whose figure can't be read
 * says so and can't be switched on: the deck never gets a made-up number, and
 * never a zero standing in for "we don't know".
 */

export type MarketCard = {
  id: MarketBlock;
  title: string;
  /** False when this scope can't answer it. The card says why instead. */
  ok: boolean;
  head: ReactNode;
  viz: ReactNode;
  say: string;
  /** The sample, for the hover. */
  src: string;
};

/** The scope the switch is on, or the closest one held when that level has nothing. */
export function scopeFor(pic: MarketPicture | null, level: "sector" | "district"): MarketPictureScope | null {
  if (!pic?.scopes.length) return null;
  return pic.scopes.find((s) => s.level === level) ?? pic.scopes[pic.scopes.length - 1];
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const bedBand = (beds: number | null) => (beds == null ? null : Math.min(Math.max(beds, 1), 5));
const bedLabel = (b: number) => (b >= 5 ? "5+ bed" : `${b} bed`);
/** In a sentence: "2-bed homes". */
const bedProse = (b: number) => (b >= 5 ? "5+ bed" : `${b}-bed`);

const BAND_LABELS = ["Under 2 weeks", "2 to 4 weeks", "1 to 3 months", "Over 3 months"];
const bandsOf = (sc: MarketPictureScope) => [sc.bands.newIn14, sc.bands.days15to28, sc.bands.days29to84, sc.bands.over84];

const nope = (why: string) => <p className="st-t">{why}</p>;

export function marketCards(sc: MarketPictureScope, beds: number | null, kind: "flat" | "house" | "room" | null, ask: number | null, ourDays: { median: number; n: number } | null): MarketCard[] {
  const adv = sc.advertised;
  const B = bedBand(beds);
  const mine = B != null ? sc.beds.find((b) => b.beds === B) ?? null : null;
  const bands = bandsOf(sc);
  const dated = bands.reduce((a, b) => a + b, 0);
  const share = pct(sc.letAgreed, adv);
  const topRent = Math.max(0, ...sc.beds.map((b) => b.rent?.median ?? 0));
  const typed = sc.houses + sc.flats;
  const flatsMost = sc.flats >= sc.houses;

  const demand: MarketCard = adv
    ? {
        id: "demand",
        title: "Demand",
        ok: true,
        head: (
          <>
            <b>
              {sc.letAgreed} of {adv}
            </b>{" "}
            homes advertised here are already let agreed.
          </>
        ),
        viz: (
          <div className="gauge">
            <span className="n num">
              {share}
              <small>%</small>
            </span>
            <div className="scale">
              <div className="tr">
                <i style={{ left: `${Math.min(97, Math.max(3, share))}%` }} />
              </div>
              <div>
                <span>Plenty to choose from</span>
                <span>Snapped up</span>
              </div>
            </div>
          </div>
        ),
        say:
          share >= 40
            ? "Tenants are taking homes as fast as they come on, so the wait for a tenant is short."
            : share >= 20
              ? "A steady market: priced right, the right tenant comes along."
              : "Tenants have plenty to choose from, so the price and the photos have to be right.",
        src: `${adv} advertised now, ${sc.letAgreed} of them let agreed`,
      }
    : { id: "demand", title: "Demand", ok: false, head: "Demand", viz: nope("Nothing advertised here to read demand from."), say: "", src: "" };

  const pace: MarketCard =
    dated && sc.daysAdvertised
      ? {
          id: "pace",
          title: "Pace",
          ok: true,
          head: (
            <>
              Advertised homes have been up for <b>{sc.daysAdvertised.median} days</b>, the median.
            </>
          ),
          viz: (
            <div className="bars">
              {bands.map((n, i) => (
                <div key={BAND_LABELS[i]}>
                  <span>{BAND_LABELS[i]}</span>
                  <i style={{ ["--w" as string]: `${(n / Math.max(1, ...bands)) * 100}%` }} />
                  <b>{n}</b>
                </div>
              ))}
            </div>
          ),
          say: `${bands[0]} came on in the last two weeks${bands[3] ? `, and ${bands[3]} ${bands[3] === 1 ? "has" : "have"} sat for over three months` : ""}.${ourDays ? ` We let in ${ourDays.median} days, the median of our last ${ourDays.n}.` : ""}`,
          src: `${dated} advertised homes with a listing date`,
        }
      : { id: "pace", title: "Pace", ok: false, head: "Pace", viz: nope("The feed carries no listing dates here, so the pace can't be read."), say: "", src: "" };

  const rent: MarketCard = sc.beds.some((b) => b.rent)
    ? {
        id: "rent",
        title: "Rent by size",
        ok: true,
        head:
          mine?.rent && B != null ? (
            <>
              {bedProse(B)} homes here are advertised at <b>{money(mine.rent.median)}</b>.
            </>
          ) : (
            "Advertised rent, by number of bedrooms."
          ),
        viz: (
          <div className="bars">
            {sc.beds
              .filter((b) => b.rent)
              .map((b) => (
                <div key={b.beds}>
                  <span>{bedLabel(b.beds)}</span>
                  <i className={b.beds === B ? "you" : ""} style={{ ["--w" as string]: `${((b.rent?.median ?? 0) / Math.max(1, topRent)) * 100}%` }} />
                  <b>{money(b.rent?.median ?? 0)}</b>
                </div>
              ))}
          </div>
        ),
        say:
          ask != null && mine?.rent && B != null
            ? `Our ${money(ask)} sits ${ask >= mine.rent.median ? "at or above" : ask >= mine.rent.median * 0.95 ? "just under" : "below"} the typical ${bedProse(B)} asking rent.`
            : "Where their home sits against the rest.",
        src: mine && B != null ? `${mine.n} ${bedProse(B)} homes advertised${mine.n < 4 ? ", a small sample" : ""}` : `${adv} homes advertised`,
      }
    : { id: "rent", title: "Rent by size", ok: false, head: "Rent by size", viz: nope("No asking rents by size in the feed here."), say: "", src: "" };

  const cuts: MarketCard = adv
    ? {
        id: "cuts",
        title: "Price cuts",
        ok: true,
        head: (
          <>
            <b>
              {sc.reduced} of {adv}
            </b>{" "}
            landlords here have already cut their rent.
          </>
        ),
        viz:
          adv <= 60 ? (
            <div className="dots10" aria-label={`${sc.reduced} of ${adv}`}>
              {Array.from({ length: adv }, (_, i) => (
                <i key={i} className={i < sc.reduced ? "on" : ""} />
              ))}
            </div>
          ) : (
            <div className="split" aria-label={`${pct(sc.reduced, adv)}% reduced`}>
              <div style={{ width: `${Math.max(pct(sc.reduced, adv), 4)}%`, background: "var(--clay)" }}>{pct(sc.reduced, adv)}%</div>
              <div style={{ flex: 1, background: "var(--well)" }} />
            </div>
          ),
        say: "Over-pricing costs time. Starting at the right figure avoids a reduction later.",
        src: `${pct(sc.reduced, adv)}% of ${adv} advertised reduced`,
      }
    : { id: "cuts", title: "Price cuts", ok: false, head: "Price cuts", viz: nope("Nothing advertised here to read price cuts from."), say: "", src: "" };

  const competing: MarketCard = typed
    ? {
        id: "competing",
        title: "What's competing",
        ok: true,
        head: (
          <>
            <b>{pct(flatsMost ? sc.flats : sc.houses, typed)}%</b> of what&apos;s advertised here is {flatsMost ? "a flat" : "a house"}.
          </>
        ),
        viz: (
          <>
            <div className="split">
              <div style={{ width: `${pct(sc.flats, typed)}%`, background: "var(--coral)", color: "var(--ink)" }}>{sc.flats ? `Flats ${sc.flats}` : ""}</div>
              <div style={{ flex: 1, background: "var(--ink)" }}>{sc.houses || ""}</div>
            </div>
            <div className="lg">
              <span>Flats</span>
              <span>Houses</span>
            </div>
          </>
        ),
        say:
          (kind === "flat" && flatsMost) || (kind === "house" && !flatsMost)
            ? `Tenants have plenty of ${flatsMost ? "flats" : "houses"} to choose from, so presentation and photos matter.`
            : `Most of the competition is ${flatsMost ? "flats" : "houses"}, so a ${kind === "flat" ? "flat" : kind === "house" ? "house" : "home like this"} stands out.`,
        src: `${typed} of ${adv} advertised with a type`,
      }
    : { id: "competing", title: "What's competing", ok: false, head: "What's competing", viz: nope("The feed doesn't say which are flats and which are houses here."), say: "", src: "" };

  const top = sc.agents[0];
  const agents: MarketCard = top
    ? {
        id: "agents",
        title: "Who's letting",
        ok: true,
        head: (
          <>
            <b>{top.agent}</b> has the most homes advertised here, with {top.n}.
          </>
        ),
        viz: (
          <div className="whoag">
            {/* Never an "us" row at zero: see OUR_AGENT_NAMES in lib/market-picture. */}
            {sc.agents.slice(0, 5).map((a) => (
              <div key={a.agent} className={a.ours ? "us" : ""}>
                <span>{a.agent}</span>
                <b>{a.n}</b>
              </div>
            ))}
          </div>
        ),
        say: "Useful if the landlord is comparing agents. Leave it out if not.",
        src: "The busiest agents with homes advertised now",
      }
    : { id: "agents", title: "Who's letting", ok: false, head: "Who's letting", viz: nope("The feed names no agents here."), say: "", src: "" };

  return [demand, pace, rent, cuts, competing, agents];
}

/** The slide's opening sentence, from the first card that's on. No dashes: a landlord reads it. */
export function leadFor(sc: MarketPictureScope, on: MarketBlock[], beds: number | null): string | null {
  const first = on[0];
  const at = `In ${sc.area}`;
  const B = bedBand(beds);
  const mine = B != null ? sc.beds.find((b) => b.beds === B) : null;
  const typed = sc.houses + sc.flats;
  switch (first) {
    case "demand":
      return `${at}, ${sc.letAgreed} of the ${sc.advertised} homes advertised are already let agreed.`;
    case "pace":
      return sc.daysAdvertised ? `${at}, the homes advertised today have been up for ${sc.daysAdvertised.median} days, the median.` : null;
    case "rent":
      return mine?.rent && B != null ? `${at}, ${bedProse(B)} homes are advertised at around ${money(mine.rent.median)} a month.` : sc.rent ? `${at}, the typical home is advertised at around ${money(sc.rent.median)} a month.` : null;
    case "cuts":
      return `${at}, ${sc.reduced} of the ${sc.advertised} landlords advertising have already cut their rent.`;
    case "competing":
      return typed ? `${at}, ${pct(Math.max(sc.flats, sc.houses), typed)}% of what's advertised is ${sc.flats >= sc.houses ? "flats" : "houses"}.` : null;
    case "agents":
      return sc.agents[0] ? `${at}, ${sc.agents[0].agent} has the most homes advertised, with ${sc.agents[0].n}.` : null;
    default:
      return null;
  }
}

/**
 * The market as the deck keeps it: only the cards that are on AND readable,
 * in the builder's order, each block's figures and nothing of the others.
 */
export function marketPayload(pic: MarketPicture | null, sc: MarketPictureScope | null, cards: MarketCard[], on: MarketBlock[], beds: number | null): PresentMarket | null {
  if (!pic || !sc) return null;
  const ok = new Set(cards.filter((c) => c.ok).map((c) => c.id));
  const blocks = MARKET_BLOCKS.map((b) => b.id).filter((id) => on.includes(id) && ok.has(id));
  if (!blocks.length) return null;
  const has = (b: MarketBlock) => blocks.includes(b);
  const bands = bandsOf(sc);
  return {
    area: sc.area,
    level: sc.level,
    advertised: sc.advertised,
    medianRent: sc.rent?.median ?? null,
    marketDays: has("pace") ? (sc.daysAdvertised?.median ?? null) : null,
    ourDays: has("pace") ? (pic.ourLetSpeed?.median ?? null) : null,
    ourLets: has("pace") ? (pic.ourLetSpeed?.n ?? null) : null,
    bands: has("pace") ? BAND_LABELS.map((label, i) => ({ label, n: bands[i] })) : null,
    rentByBed: has("rent") ? sc.beds.map((b) => ({ label: bedLabel(b.beds), n: b.n, rent: b.rent?.median ?? null })) : null,
    mix: has("competing") ? { houses: sc.houses, flats: sc.flats } : null,
    agents: has("agents") ? sc.agents : null,
    reduced: has("cuts") ? sc.reduced : null,
    letAgreed: has("demand") ? sc.letAgreed : null,
    pulledAt: pic.pulledAt,
    blocks,
    lead: leadFor(sc, blocks, beds),
  };
}
