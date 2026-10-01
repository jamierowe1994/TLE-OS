"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import MaterialInfoPanel from "@/components/MaterialInfoPanel";
import SubjectStory from "@/components/appraisal/SubjectStory";
import StreetView from "@/components/appraisal/StreetView";
import AddressPicker from "@/components/appraisal/AddressPicker";
import { useCaseState } from "@/lib/case-state";
import MarketMap from "@/components/MarketMap";
import MarketPicturePanel, {
  MARKET_BLOCKS,
  type MarketBlockId,
  type MarketSelection,
} from "@/components/MarketPicture";
import type { MarketPicture } from "@/lib/market-picture";
import PresentDeck from "@/components/PresentDeck";
import RmGuidePanel from "@/components/RmGuidePanel";
import type { RmGuide } from "@/lib/rm-guide";
import {
  SECTIONS,
  STANDARD_FEES,
  defaultBio,
  firstNameOf,
  slideHasContent,
  slidesFor,
  slidesInKind,
  type DeckKind,
  type SlideId,
  type PresentAgent,
  type PresentDeck as Deck,
} from "@/lib/present";
import { SERVICE_LEVELS, type MarketAppraisal } from "@/lib/market-appraisal";
import { Pill } from "@/components/Wire";
import {
  BUILD_STEPS,
  defaultSelection,
  type BuildStepId,
} from "@/lib/presentation-builder";
import type { MaResearch, MarketListing } from "@/lib/ma-research";
import { buildGuide, guideReach } from "@/lib/ma-guide";
import { knownCompliance, OUTSTANDING_AT_APPRAISAL } from "@/lib/appraisal-compliance";
import { listingKey } from "@/lib/listing-key";
import { fetchMe } from "@/lib/me";
import GuideButton from "@/components/GuideButton";

/**
 * Build the presentation.
 *
 * Called "Build presentation", not "Research" — James, 23 Aug, and he is
 * right: the agent is not browsing data, they are making the thing they will
 * put in front of a landlord. Naming it after the output is what makes the
 * button obvious at 8am.
 *
 * Five steps, not F&C's six. Buyer matches is dropped: a landlord does not
 * care who is looking, they care what it lets for and how fast.
 *
 * Every step can be empty and the wizard still finishes — see canAdvance in
 * lib/presentation-builder for why gating on "pick a comparable" would just
 * make agents stop using it.
 */

const money = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;

/**
 * One map tile, for the little circle on the Map button.
 *
 * ── Why not Google, given we have a key ───────────────────────────────────
 *
 * Because Google is what produced the thing on screen. Static Maps answers a
 * key problem — billing not enabled, API not switched on — with HTTP 200 and
 * an IMAGE THAT SAYS SO. Not an error status: a picture of an apology, which
 * the proxy passed through and the circle displayed. Any check on the response
 * code would have called that a success.
 *
 * The map beside it never needed a key. CARTO tiles are public URLs, which is
 * why the main panel has worked all along. So the button uses the same tiles
 * as the map it opens: one image, no key, no billing, nothing to enable, and
 * it cannot fail by drawing words on the screen.
 *
 * The arithmetic is the standard slippy-map projection — longitude linear,
 * latitude through Mercator. Zoom 14 puts a street or two in a 44px circle,
 * which reads as "a map" without becoming a puzzle.
 */
/** How long the research call gets before the screen gives up on it and
 *  offers Try again. Under the watchdog's 25 seconds on purpose. */
const RESEARCH_PATIENCE = 20_000;

function tileUrl(lat: number, lon: number, z = 15): string {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  /* STREET, not the grey canvas. At 36px across, a light-grey basemap is a
     grey disc — you cannot tell it from a placeholder, and the whole point of
     this button is that it LOOKS like a map before you press it. The street
     tile carries road colour and green space, which reads as a map at any size.

     Same family as the map beside it — see the note in MarketMap for why it is
     not CARTO or OSM, and why the Google key never leaves the server. */
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${z}/${y}/${x}`;
}

const NO_MATCH = { hsId: 0, label: "" };

export default function PresentationBuilder({
  address,
  postcode,
  landlord,
  refId,
  kind = "appraisal",
  appraisal,
  fullPage = false,
  backHref,
  nextHref,
  onClose,
}: {
  address: string;
  postcode: string;
  landlord?: string;
  refId?: string;
  /**
   * WHICH DECK this wizard is building. Defaults to the appraisal deck, which
   * is what it has always built and what every existing caller means.
   *
   * On "post-appraisal" the same five steps run — the research and the
   * comparables are identical — and two extra things travel: the agreed
   * figure and the terms. See marketPayload's sibling, offerPayload.
   */
  kind?: DeckKind;
  /**
   * The appraisal record, for the figure the post-appraisal deck states.
   *
   * Passed in rather than fetched: this component already has a slow first
   * paint, and the page above it has the record in hand. Optional, so the
   * two callers that mint a pre-appraisal deck are unaffected.
   */
  appraisal?: MarketAppraisal | null;
  /** Rendered as a page rather than a modal — see the build route for why. */
  fullPage?: boolean;
  backHref?: string;
  /** Where the agent goes once it is built, when the deck has a next step of
   *  its own: a post-appraisal goes straight on to be sent with the terms
   *  (Howard, 1 Oct 2026). Absent, the done screen waits for them. */
  nextHref?: string;
  onClose?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [d, setD] = useState<MaResearch | null>(null);
  /* THE AGENT'S OWN MATCH (Howard, 24 Sep 2026). When Homesearch cannot find
     the address, the agent picks the property from what it does hold, and the
     pick is kept on the record so the next visit, and the deck, use it too.
     hsId 0 is "none": the store refuses an empty payload. */
  const [match, setMatch, matchStatus] = useCaseState<{ hsId: number; label: string }>(
    "property-match",
    refId ?? null,
    NO_MATCH
  );
  const matchReady = !refId || matchStatus !== "loading";
  const [pickerOpen, setPickerOpen] = useState(false);
  const [rematching, setRematching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  /* Slides switched off on the Review step. Written onto the deck as
     `hidden`, which slidesFor honours in the preview, the minted deck and
     the booklet alike. */
  const [hidden, setHidden] = useState<SlideId[]>([]);
  /* Review step: a slide row clicked (goes to the preview, `n` so clicking
     the same row twice still fires) and the slide the preview is showing. */
  const [previewGo, setPreviewGo] = useState<{ i: number; n: number } | null>(null);
  const [previewAt, setPreviewAt] = useState(0);
  /* A Rightmove Best Price Guide in place of the comparables (lib/rm-guide). */
  const [rmGuide, setRmGuide] = useState<RmGuide | null>(null);
  const [making, setMaking] = useState(false);
  /* THE PRESENTATION THIS APPRAISAL ALREADY HAS, if any (James, 17 Sep 2026:
     "rather than saying create presentation, it should always be update
     presentation"). Undefined while asking. When there is one, the builder
     opens with the agent's own ticks and saving changes that deck behind
     the same link, so nobody is ever stuck with one they cannot edit. */
  const [existing, setExisting] = useState<SavedDeck | null | undefined>(refId ? undefined : null);
  /* The build screen: ticks while it saves, then the four things to do next. */
  const [progress, setProgress] = useState<null | "building" | "done" | "error">(null);
  const [updatingRun, setUpdatingRun] = useState(false);
  const seeded = useRef(false);
  /* The appraisal deck's own picks, for a post-appraisal deck being built for
     the first time (Susan, 19 Sep 2026: the post-appraisal showed different
     comparables from the ones the agent chose for the visit). Only seeds the
     ticks - saving still makes the post-appraisal deck its own. */
  const [inherited, setInherited] = useState<SavedDeck["builder"]>(null);
  /* The market picture is loaded by its own panel on its own step, and lifted
     here so the deck is built from exactly the object that was on screen when
     the agent ticked the blocks. See MarketPicturePanel's onLoaded. */
  const [marketPic, setMarketPic] = useState<MarketPicture | null>(null);
  const [marketSel, setMarketSel] = useState<MarketSelection | null>(null);
  /* EVERY SECTION IN, BY DEFAULT. Howard, 30 Sep 2026: "most agents will
     just click through without adding them". So once the figures arrive,
     a deck with no market choice yet gets every block for the closest area
     (the sector), and the agent unticks what they do not want. A saved
     choice wins: the seeding effect below overwrites this whichever lands
     first, and unticking everything is kept as an empty list rather than
     null so it is not re-filled next time. */
  const marketDefaulted = useRef(false);
  useEffect(() => {
    if (marketDefaulted.current || !marketPic?.scopes.length) return;
    marketDefaulted.current = true;
    const closest = marketPic.scopes[marketPic.scopes.length - 1];
    setMarketSel((prev) => prev ?? { area: closest.area, blocks: MARKET_BLOCKS.map((b) => b.id) });
  }, [marketPic]);

  /**
   * The ticked market blocks, reduced to the figures the landlord will see.
   *
   * Only what was ticked travels. A block the agent left alone is `null` rather
   * than an empty array, so the slide can tell "not chosen" from "chosen and
   * empty" and draw neither a heading nor a bar for it.
   */
  function marketPayload() {
    if (!marketPic || !marketSel?.blocks.length) return null;
    const sc = marketPic.scopes.find((s) => s.area === marketSel.area);
    if (!sc) return null;
    const on = (b: MarketBlockId) => marketSel.blocks.includes(b);

    return {
      area: sc.area,
      level: sc.level,
      advertised: sc.advertised,
      medianRent: sc.rent?.median ?? null,
      /* Pace carries BOTH halves or neither. Sending the market's days without
         ours turns a comparison into a bare statistic about the competition,
         which is not what the agent ticked. */
      marketDays: on("pace") ? (sc.daysAdvertised?.median ?? null) : null,
      ourDays: on("pace") ? (marketPic.ourLetSpeed?.median ?? null) : null,
      ourLets: on("pace") ? (marketPic.ourLetSpeed?.n ?? null) : null,
      bands: on("bands")
        ? [
            { label: "Under 2 weeks", n: sc.bands.newIn14 },
            { label: "2–4 weeks", n: sc.bands.days15to28 },
            { label: "1–3 months", n: sc.bands.days29to84 },
            { label: "Over 3 months", n: sc.bands.over84 },
          ]
        : null,
      rentByBed: on("rent")
        ? sc.beds.map((b) => ({
            label: b.beds >= 5 ? "5+ bed" : `${b.beds} bed`,
            n: b.n,
            rent: b.rent?.median ?? null,
          }))
        : null,
      mix: on("mix") ? { houses: sc.houses, flats: sc.flats } : null,
      agents: on("agents") ? sc.agents : null,
      reduced: sc.reduced,
      pulledAt: marketPic.pulledAt,
    };
  }

  /**
   * THE OFFER — post-appraisal only, and only when there is a figure.
   *
   * Returns an EMPTY OBJECT rather than nulls for the other two decks, so the
   * body carries no `valuation` key at all and the server's own gate never has
   * to reason about a deliberate null on a deck that could not have one.
   *
   * The figure comes from the appraisal record, which is the single home for
   * it — the same record the lead drawer and the valuation form both write to.
   * Nothing is re-entered here: an agent who has already typed 1,300 once
   * should not be asked for it again on the way to sending it.
   */
  async function offerPayload() {
    if (kind !== "post-appraisal" || !appraisal?.valuation) return {};
    /* Best effort. A signing session that cannot be opened must not stop a
       deck being built — the offer is still worth sending. */
    /* NO SIGNING LINK ON THE DECK (17 Sep 2026). This used to draw up the
       contract here and freeze the session it got back into the deck - but
       that session is the AGENT's (they build the deck, they sign first), so
       a landlord pressing Sign from the booklet opened James Rowe's half,
       "already signed". The landlord's own session is found for them in
       their file (app/api/landlord/sign). */
    const signUrl: string | null = null;
    const level = SERVICE_LEVELS.find((s) => s.id === appraisal.serviceLevel);
    return {
      valuation: {
        rent: appraisal.valuation,
        /* Humanised HERE, not on the slide. The deck is a snapshot, and a
           stored Propoly key would need this lookup again every time it is
           rendered — including after somebody renames a label. */
        serviceLevel: level?.label ?? null,
        feePct: appraisal.feePct ?? null,
        setupFee: appraisal.setupFee ?? null,
        note: appraisal.valuationNote ?? null,
      },
      /* THE SIGNING LINK GOES ON THE DECK ITSELF. James, 1 Sep: opening the
         post-appraisal deck should put the contract one button away, so the
         landlord reads the offer and signs in the same sitting rather than
         waiting for an agent to open something on their behalf.

         Minted at build time and frozen into the deck like everything else
         here. A DocuSeal submission costs nothing until it is signed, so a
         deck that is never opened has cost nothing either.

         Null when DocuSeal is not connected or the session could not be
         opened, and the slide's no-button branch explains instead — a dead
         "sign here" in front of a landlord is worse than none. */
      terms: { signUrl: signUrl ?? null, summary: null },
    };
  }

  /**
   * Mint the deck.
   *
   * Only the TICKED comparables travel, and only the figures they produce —
   * the deck is a snapshot, so the range a landlord opens on Sunday is the one
   * the agent approved on Friday. Sending the whole research packet would let
   * the numbers move underneath them.
   */
  /* THE DECK, AS THE SERVER WILL RECEIVE IT.

     One function for both the real send and the preview on the Review step
     (James, 11 Sep 2026: "we've got no preview, so they can't see what it
     would look like"), so the two cannot differ: what the preview shows is
     the payload create() posts, field for field. The offer (valuation and
     the signing link) is added at send time only - see offerPayload, which
     opens a DocuSeal session and must not run for a preview. */
  function deckBody() {
    if (!d) return null;
    const picked = d.comparables.filter((c) => chosen.includes(c.id));
    /* Recomputed from what the agent CHOSE, not copied from the research.
       Ticking three of eight must move the range, or the deck quotes a
       number the chosen properties do not support. The caveat is recomputed
       too: the research's caveat described a different sample. */
    const guide = buildGuide(picked);
    return {
      ref: refId ?? "",
      /* THIS BUILDER MAKES THE APPRAISAL DECK, not the pre-appraisal one.
         The pre-appraisal is short, automatic and needs no building — it
         is minted from the lead drawer the day before. What is assembled
         here is the full research the agent takes with them and sends
         afterwards, which is why it is the only one with a five-step
         wizard in front of it. */
      kind,
      recipientName: landlord ?? "",
      address,
      postcode,
      comparables: guide
        ? {
            guideLow: guide.low,
            guideMid: guide.mid,
            guideHigh: guide.high,
            basedOn: guide.basedOn,
            rows: picked.map((c) => ({
              name: c.name,
              locality: c.locality,
              rent: c.rentDisplay,
              days: c.daysOnMarket,
              letAgreed: c.letAgreed,
            })),
            caveat: guide.caveat,
          }
        : null,
      rmGuide,
      hidden,
      market: marketPayload(),
      /* WHAT THE AGENT PICKED ON THE AVAILABLE STEP, snapshotted with its
         photographs. Until now the wizard let somebody choose these and
         then threw the choice away at send: the slide existed, the type
         existed, and nothing ever reached a real deck.

         `picks` is already the resolved MarketListing, so the photographs
         and the advert that /api/ma-photos folded back onto it travel with
         it. If that fetch has not returned yet the row still goes, with
         just its lead image - which is the difference between a row that
         opens a gallery and one that does not, never the difference
         between a row and no row. */
      listings: picks.map((l) => ({
        address: l.address,
        locality: l.postcode,
        rent: l.rent != null ? `£${Math.round(l.rent).toLocaleString("en-GB")} pcm` : "",
        beds: l.beds,
        type: l.type,
        image: l.image,
        photos: l.photos ?? [],
        /* Homesearch DOES carry the agency, and it is worth having: a
           landlord recognises the names on their own street, and a list of
           competitors with nobody's name on it reads as invented. Null
           where the feed has none, which the row handles. */
        agent: l.agent ?? null,
        advert: l.advert ?? null,
        status: l.status,
        days: l.daysListed ?? null,
        /* These come from the whole local market, not our book. Anything
           of ours in the list is there because a tenant would see it too,
           so it is not flagged as ours - see the Listings slide. */
        ours: false,
      })),
      /* The headline fields only. The material panel an AGENT reads runs to
         thirty rows across five groups; a landlord is being asked to
         correct what goes on the listing, and a thirty-row form is one
         nobody corrects. */
      material: (d.material?.groups ?? [])
        .flatMap((g) => g.fields)
        .filter((f) => f.headline)
        .slice(0, 8)
        .map((f) => ({ label: f.label, value: f.value })),
    };
  }

  async function create() {
    const body = deckBody();
    if (!body) return;
    setMaking(true);
    setError(null);
    setProgress("building");
    setUpdatingRun(Boolean(existing));
    const builder = { comparables: chosen, listings: pickedNearby, market: marketSel, hidden, rmGuide };
    try {
      const res = await fetch("/api/presentations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, ...(await offerPayload()), builder, token: existing?.token }),
      });
      const j = (await res.json()) as { ok?: boolean; url?: string; token?: string; error?: string };
      if (j.ok && j.url && j.token) {
        setExisting({ token: j.token, url: j.url, builder });
        setProgress("done");
      } else {
        setError(j.error ?? "Couldn't save the presentation.");
        setProgress("error");
      }
    } catch (e) {
      setError((e as Error).message);
      setProgress("error");
    } finally {
      setMaking(false);
    }
  }

  useEffect(() => {
    if (!refId) return;
    let gone = false;
    fetch(`/api/presentations?ref=${encodeURIComponent(refId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; sent?: (SavedDeck & { kind: string })[] }) => {
        if (gone) return;
        const mine = j.ok ? (j.sent ?? []).find((s) => s.kind === kind) : null;
        if (!mine && kind === "post-appraisal") {
          const visit = (j.sent ?? []).find((s) => s.kind === "appraisal" && s.builder);
          /* The picks, not which slides were switched off: the two decks have different slides. */
          setInherited(visit?.builder ? { ...visit.builder, hidden: [] } : null);
        }
        setExisting(mine ? { token: mine.token, url: mine.url, builder: mine.builder ?? null } : null);
      })
      .catch(() => !gone && setExisting(null));
    return () => {
      gone = true;
    };
  }, [refId, kind]);

  /* Their own ticks back, once the research is in: only ids that still name
     something on screen, so a comparable that has since gone just drops. */
  useEffect(() => {
    if (seeded.current || !d || existing === undefined) return;
    seeded.current = true;
    const b = existing?.builder ?? inherited;
    if (!b) return;
    const ids = new Set(d.comparables.map((c) => c.id));
    setChosen(b.comparables.filter((id) => ids.has(id)));
    setPickedNearby(b.listings);
    if (b.market) setMarketSel({ area: b.market.area, blocks: b.market.blocks as MarketBlockId[] });
    setHidden(b.hidden);
    setRmGuide(b.rmGuide ?? null);
  }, [d, existing, inherited]);

  const opened = useRef(false);
  /* A research call that failed or timed out, said inline with a Try again
     beside it. Kept apart from `error`, which belongs to saving the deck. */
  const [researchFailed, setResearchFailed] = useState<string | null>(null);
  const [researchTry, setResearchTry] = useState(0);
  useEffect(() => {
    /* Waits for the saved match, so a picked property opens as itself rather
       than flashing "couldn't find" and then changing under the agent. */
    if (!matchReady) return;
    /* NO beds. The filter starts on "Any beds", so the first list must be any
       size too — sending 2 here meant the screen opened already filtered to
       two-bed while the control said Any, and setting the control BACK to Any
       changed nothing because it sent 2 as well. A new pick keeps whatever
       the agent has filtered to since. */
    const q = researchQuery(opened.current ? filtersRef.current : null);
    const mine = ++reqSeq.current;
    setRematching(opened.current);
    setResearchFailed(null);
    void askResearch(q).then((j) => {
      /* Somebody has already filtered. This is the opening list, and it is
         now the wrong one — see reqSeq. */
      if (mine !== reqSeq.current || !j) return;
      setRematching(false);
      if ("error" in j) return setResearchFailed(j.error);
      setD(j);
      // Only same-sector start ticked — a pre-ticked box is a recommendation.
      // Once only: a new pick changes the property's facts, not the comparables.
      if (!opened.current) setChosen(defaultSelection(j.comparables));
      opened.current = true;
    });
    // researchQuery reads address, postcode and the match, all listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, postcode, matchReady, match.hsId, researchTry]);

  /* Homesearch's live market — the whole sector including other agents'
     stock, and the only source that carries photographs. Picked separately
     from our own book because they are different evidence. */
  const all = d?.onMarketNearby ?? [];
  /**
   * TWO DIFFERENT QUESTIONS, SO TWO LISTS.
   *
   * "On the market" is what a tenant can take today. "Let agreed" is what has
   * already gone — somebody accepted a figure — which makes it evidence of
   * what the market PAYS rather than what it asks, and it belongs on the
   * Recently let step beside our own lets.
   *
   * They used to sit in one grid with a badge, which made the on-market count
   * an overstatement of a landlord's competition: NN5 4 reads as 21 available
   * when 11 of them are already taken.
   */
  const nearby = useMemo(() => all.filter((l) => l.status === "on market"), [all]);
  const letAgreed = useMemo(() => all.filter((l) => l.status === "let agreed"), [all]);
  const [pickedNearby, setPickedNearby] = useState<string[]>([]);
  /* THE FILTER BAR. Radius defaults to 0 — the sector — because widening
     should be something an agent chooses, not something that happened to them.
     See MarketFilters in lib/ma-research for why F&C's 2-mile default is right
     for sales and wrong for lettings. */
  const [filters, setFilters] = useState<{ radius: number; beds: number; minRent: number; maxRent: number; type: "" | "H" | "F" }>(
    { radius: 0, beds: 0, minRent: 0, maxRent: 0, type: "" }
  );
  const [refiltering, setRefiltering] = useState(false);
  /* The split view. Off by default: most of the time an agent is skimming
     cards, and a map that is always there costs half the width for a question
     they have not asked yet. */
  /* Open from the start. James, 11 Sep 2026: "always start the view on maps
     and give them the option of clicking off" - the map is the easier way to
     search, so it is the default and the circle button closes it. */
  /* The signed-in agent, for the preview only. The real deck asks REX for
     the title, phone and photo at send time; the preview uses what the OS
     already knows, which is enough to see the slide. */
  const [me, setMe] = useState<PresentAgent | null>(null);
  useEffect(() => {
    let gone = false;
    fetchMe()
      .then((j) => {
        const u = j?.user;
        if (gone || !u) return;
        const name = u.name ?? "";
        setMe({
          name,
          firstName: firstNameOf(name),
          title: "",
          email: u.email ?? "",
          phone: "",
          photo: u.photo ?? null,
          bio: defaultBio(firstNameOf(name)),
        });
      })
      .catch(() => {});
    return () => { gone = true; };
  }, []);
  const [mapOpen, setMapOpen] = useState(true);
  const [oursOpen, setOursOpen] = useState(false);
  const [oursWide, setOursWide] = useState(false);
  /* The map is kept MOUNTED for the length of its own exit, so it can slide
     back into the corner it came from instead of vanishing. `mapIn` drives the
     classes; `mapMounted` decides whether it exists at all. Two flags rather
     than one because a thing cannot animate out after it has been unmounted. */
  const [mapMounted, setMapMounted] = useState(false);
  const [mapIn, setMapIn] = useState(false);
  useEffect(() => {
    if (mapOpen) {
      setMapMounted(true);
      const f = requestAnimationFrame(() => setMapIn(true));
      return () => cancelAnimationFrame(f);
    }
    setMapIn(false);
    const t = setTimeout(() => setMapMounted(false), 320);
    return () => clearTimeout(t);
  }, [mapOpen]);
  /* The last pin (or rail face) clicked. The card is scrolled into view and
     outlined for a moment, where it already sits. It used to jump to the top
     of the list, and Howard (30 Sep 2026) watched the grid shuffle under his
     cursor: "they jump around. keep them in place". */
  const [focused, setFocused] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (!focused) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-card="${CSS.escape(focused)}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const t = window.setTimeout(() => setFocused(null), 1800);
    return () => window.clearTimeout(t);
  }, [focused]);

  /**
   * Tick, or untick. IN PLACE.
   *
   * Picking used to fly the card out of the grid and into the rail at the
   * top, and every card after it shuffled up a slot. Howard, 30 Sep 2026: "it
   * is not clear if/what has been selected and when they are they jump
   * around. keep them in place and highlight selected in line". So the grid
   * never reorders and never loses a card; a picked one is ringed, badged and
   * labelled where it stands. The rail stays as the summary of the deck.
   */
  function pick(k: string) {
    setPickedNearby((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]));
  }
  /**
   * WHICH PHOTOGRAPH EACH CARD IS SHOWING.
   *
   * Keyed by the card's own key rather than by index, so paging through a
   * property's pictures survives the list re-sorting under it when a pin is
   * clicked. Keyed by index it would have looked like the photographs jumped
   * between houses.
   */
  const [slide, setSlide] = useState<Record<string, number>>({});

  /**
   * The galleries, fetched AFTER the cards are up.
   *
   * One upstream call per listing, so this deliberately does not block the
   * research request — see /api/ma-photos. The results are folded back onto
   * the listing objects themselves, which means the map's popup card gets
   * them too without a second piece of plumbing.
   *
   * `ids` is a string rather than an array so the effect fires when the LIST
   * changes and not on every render — a dependency array holding a fresh
   * array literal never compares equal, and this would have refetched the
   * whole gallery set forever.
   */
  const photoIds = (d?.onMarketNearby ?? [])
    .map((l) => l.listingId)
    .filter((n): n is number => typeof n === "number")
    .join(",");
  useEffect(() => {
    if (!photoIds) return;
    let live = true;
    /* Aborted, not just ignored, when the list changes. A widened radius
       used to leave the old gallery call running beside the new one, and a
       call nobody is waiting for still counts against the 25-second watch. */
    const ctl = new AbortController();
    fetch(`/api/ma-photos?ids=${photoIds}`, { signal: ctl.signal })
      .then((r) => r.json())
      .then((j: { photos?: Record<string, string[]>; adverts?: Record<string, string | null> }) => {
        if (!live || !j.photos) return;
        setD((prev) =>
          prev
            ? {
                ...prev,
                onMarketNearby: prev.onMarketNearby.map((l) =>
                  l.listingId
                    ? {
                        ...l,
                        photos: j.photos![String(l.listingId)] ?? [],
                        advert: j.adverts?.[String(l.listingId)] ?? null,
                      }
                    : l
                ),
              }
            : prev
        );
      })
      /* No error state. Every card already has its lead photograph; a gallery
         that does not arrive costs an arrow, not a property. */
      .catch(() => {});
    return () => {
      live = false;
      ctl.abort();
    };
  }, [photoIds]);

  /**
   * LAST REQUEST WINS, AND ONLY THE LAST ONE.
   *
   * This is why the beds filter "didn't work". Homesearch takes a second or
   * two, the first unfiltered load is in flight while the screen is already
   * usable, and whichever response arrived LAST used to win. Pick 3 bed early
   * and the opening request lands afterwards and quietly puts the whole list
   * back — the control had moved, the list had not, and nothing looked broken.
   *
   * The counter decides which answer is listened to. Since 1 Oct 2026 the
   * stale request is ALSO aborted (askResearch): Howard dragged the radius,
   * every half-mile notch fired its own 8-second research call, they piled up
   * behind Homesearch's rate limit, and the watchdog put "A screen that would
   * not finish" over the page. Aborted calls do not count against the watch.
   */
  const reqSeq = useRef(0);
  const researchCtl = useRef<AbortController | null>(null);
  const filterTimer = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      researchCtl.current?.abort();
      window.clearTimeout(filterTimer.current);
    },
    []
  );
  const [refilterFailed, setRefilterFailed] = useState<string | null>(null);

  /**
   * ONE RESEARCH CALL AT A TIME, AND NEVER LONGER THAN WE WILL WAIT.
   *
   * Starting one aborts whichever was still out. Past RESEARCH_PATIENCE it
   * gives up and says so, so the screen offers Try again instead of turning
   * forever. Never throws: an answer, an `{ error }` for the screen to show,
   * or null when a newer call took over and this one has nothing to say.
   */
  async function askResearch(q: URLSearchParams): Promise<MaResearch | { error: string } | null> {
    researchCtl.current?.abort();
    const ctl = new AbortController();
    researchCtl.current = ctl;
    let late = false;
    const t = window.setTimeout(() => {
      late = true;
      ctl.abort();
    }, RESEARCH_PATIENCE);
    try {
      const r = await fetch(`/api/ma-research?${q}`, { signal: ctl.signal });
      const j = (await r.json().catch(() => null)) as (MaResearch & { error?: string }) | null;
      if (!j) return { error: `The search came back with an error (${r.status}).` };
      if (j.error) return { error: j.error };
      return j;
    } catch {
      if (late) return { error: "The search took too long to answer." };
      if (ctl.signal.aborted) return null;
      return { error: "The search could not be reached." };
    } finally {
      window.clearTimeout(t);
    }
  }
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  /** The research request: the address, the agent's pick if any, and the filters. */
  function researchQuery(f: typeof filters | null): URLSearchParams {
    const q = new URLSearchParams({ address, postcode });
    if (match.hsId) {
      q.set("hsId", String(match.hsId));
      q.set("hsLabel", match.label);
    }
    if (f?.radius) q.set("radius", String(f.radius));
    if (f?.beds) q.set("beds", String(f.beds));
    if (f?.minRent) q.set("minRent", String(f.minRent));
    if (f?.maxRent) q.set("maxRent", String(f.maxRent));
    if (f?.type) q.set("type", f.type);
    return q;
  }

  /**
   * A filter changed. The control moves at once; the search waits `wait` ms
   * for the agent to stop, so a slider dragged across six notches asks once
   * rather than six times. The list on screen stays up until the new one
   * lands, and a failure leaves it up with a Try again beside it.
   */
  function applyFilters(next: typeof filters, wait = 0) {
    setFilters(next);
    setRefiltering(true);
    setRefilterFailed(null);
    /* Whatever is already out is stale from this moment, not from when the
       next call starts. */
    const mine = ++reqSeq.current;
    researchCtl.current?.abort();
    window.clearTimeout(filterTimer.current);
    filterTimer.current = window.setTimeout(() => {
      void askResearch(researchQuery(next)).then((j) => {
        if (mine !== reqSeq.current || !j) return;
        setRefiltering(false);
        setRematching(false);
        if ("error" in j) setRefilterFailed(j.error);
        else setD(j);
      });
    }, wait);
  }
  /* Shared with the map, so a pin and a card agree on which house they are.
     See listingKey for why it is not the address. */
  const keyOf = listingKey;

  /**
   * ONE SET OF CONTROLS, RENDERED IN ONE OF TWO PLACES.
   *
   * With the map open they float over it; with the map shut they sit on the
   * line above the cards. Never both — the same `filters` and the same
   * applyFilters either way, because two knobs for one value is how a screen
   * starts lying to itself.
   *
   * Every control is the SAME height and the same shape. They were a slider, a
   * bare select and two naked number boxes at four different sizes, which read
   * as four unrelated things rather than one filter bar.
   */
  function controlsFor(onMap: boolean) {
    const skin = onMap
      ? "border-line/60 bg-page/95 shadow-md backdrop-blur"
      : "border-line/70 bg-panel shadow-sm";
    const ctl = `inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[12px] transition-colors hover:border-ink/40 ${skin}`;
    const sel = "appearance-none bg-transparent pr-4 text-[12px] outline-none";
    const caret = (
      <span className="pointer-events-none -ml-3.5 text-[9px] text-muted">&#9662;</span>
    );
    return (
      <>
        {/* Radius first and widest, because it is the one whose effect you can
            SEE: drag it and the ring on the map moves with it. That is the
            whole argument for putting these on the map rather than above it. */}
        <label className={ctl} title="How far out to search">
          <span className="text-muted">Within</span>
          <input
            type="range"
            min={0}
            max={10}
            step={0.5}
            value={filters.radius}
            /* Waits for the drag to settle: one search, not one per notch. */
            onChange={(e) => applyFilters({ ...filters, radius: Number(e.target.value) }, 450)}
            className="w-24 accent-[#56423e]"
            aria-label="Search radius in miles"
          />
          <span className="figures w-[52px] shrink-0 text-[11.5px]">
            {filters.radius ? `${filters.radius} mi` : d?.sector ?? "sector"}
          </span>
        </label>

        <span className={ctl}>
          <select
            value={filters.beds}
            onChange={(e) => applyFilters({ ...filters, beds: Number(e.target.value) })}
            aria-label="Bedrooms"
            className={sel}
          >
            <option value={0}>Any beds</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} bed
              </option>
            ))}
          </select>
          {caret}
        </span>

        <span className={ctl}>
          <select
            value={filters.type}
            onChange={(e) => applyFilters({ ...filters, type: e.target.value as "" | "H" | "F" })}
            aria-label="Property type"
            className={sel}
          >
            <option value="">Any type</option>
            <option value="H">Houses</option>
            <option value="F">Flats</option>
          </select>
          {caret}
        </span>

        <span className={ctl} title="Rent per month">
          <span className="text-muted">&pound;</span>
          <input
            type="number"
            placeholder="min"
            aria-label="Minimum rent"
            value={filters.minRent || ""}
            onChange={(e) => setFilters({ ...filters, minRent: Number(e.target.value) })}
            onBlur={() => applyFilters(filters)}
            className="w-12 bg-transparent text-[12px] outline-none"
          />
          <span className="text-muted">&ndash;</span>
          <input
            type="number"
            placeholder="max"
            aria-label="Maximum rent"
            value={filters.maxRent || ""}
            onChange={(e) => setFilters({ ...filters, maxRent: Number(e.target.value) })}
            onBlur={() => applyFilters(filters)}
            className="w-12 bg-transparent text-[12px] outline-none"
          />
        </span>

        {(filters.radius || filters.beds || filters.type || filters.minRent || filters.maxRent) ? (
          <button
            type="button"
            onClick={() => applyFilters({ radius: 0, beds: 0, minRent: 0, maxRent: 0, type: "" })}
            className={`${ctl} text-muted`}
          >
            Clear
          </button>
        ) : null}

        {/* Said out loud, because a filtered map that is still fetching looks
            exactly like a filtered map that found nothing. */}
        {refiltering && (
          <span className={`${ctl} text-muted`}>
            <span className="block h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
            Looking&hellip;
          </span>
        )}
        {/* The list on screen is the last good one; say the new one did not
            come, and offer it again, rather than leaving the agent guessing. */}
        {refilterFailed && !refiltering && (
          <button
            type="button"
            onClick={() => applyFilters(filters)}
            title={refilterFailed}
            className={`${ctl} font-semibold text-accent-dark`}
          >
            Did not refresh - Try again
          </button>
        )}
      </>
    );
  }
  const mapControls = controlsFor(true);

  /**
   * ONE CARD, TWO GRIDS.
   *
   * "On the market" and "Recently let" show the same object — a property from
   * the Homesearch feed with photographs, a rent and an agent. They were about
   * to be two hand-written cards, which is how two views of one thing start
   * disagreeing about what a tick means or which photo is showing. This is the
   * card; the grids differ only in what they filter.
   */
  function propertyCard(l: MarketListing) {
    const k = keyOf(l);
    const on = pickedNearby.includes(k);
    /* The lead photograph FIRST, then the gallery. The two
       sources overlap — `image` is usually also in `images` —
       so the lead one is deduped out rather than shown twice. */
    const shots = l.photos?.length
      ? [l.image, ...l.photos.filter((u) => u !== l.image)].filter(
          (u): u is string => Boolean(u)
        )
      : l.image
        ? [l.image]
        : [];
    const at = shots.length ? ((slide[k] ?? 0) % shots.length + shots.length) % shots.length : 0;
    const step = (e: React.MouseEvent, by: number) => {
      e.stopPropagation();
      setSlide((m) => ({ ...m, [k]: (m[k] ?? 0) + by }));
    };
    return (
      <li key={k} data-card={k}>
        {/* NO BOX. James, 29 Aug: "I like the fact that they
            don't have white boxes underneath like we do. We've
            got the photo, and then we've got our connecting line
            to make it into a tile."

            He is right, and the reason is that the border was
            doing no work. It drew a container around a
            photograph that is already a rectangle, and the line
            under the picture split one property into two halves.
            The photo has a shape of its own; the words belong to
            it by sitting underneath, not by being fenced in with
            it. Selection is shown on the tick and a ring on the
            PHOTO instead — the border was carrying that meaning
            and losing it in the process. */}
        {/* THE WHOLE CARD IS THE TICK (Howard, 30 Sep 2026). The little
            button on the photo was the only thing that picked, and a click
            anywhere else just shuffled the card to the top. Now a click
            anywhere picks or unpicks, and the card stays put. */}
        <div
          role="button"
          tabIndex={0}
          aria-pressed={on}
          onClick={() => pick(k)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              pick(k);
            }
          }}
          className={`group cursor-pointer rounded-[20px] outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ink/30 ${
            focused === k ? "ring-2 ring-ink/25 ring-offset-4 ring-offset-page" : ""
          }`}
        >
          <div className="relative">
            {/* Plain img, not next/image: these are third-party
                S3 URLs, and a remote-image allowlist for a feed
                whose host may change is config that breaks
                silently the day it does. */}
            {shots.length ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={shots[at]}
                alt=""
                loading="lazy"
                /* 4:3 keeps a terrace whole. h-32 cropped these
                   to a letterbox and cut the roofline off every
                   one — a property photo with no property in it. */
                className={`aspect-[4/3] w-full rounded-2xl bg-line/30 object-cover transition-all ${
                  on ? "ring-[3px] ring-[#56634a] ring-offset-2 ring-offset-page" : "group-hover:brightness-[0.96]"
                }`}
              />
            ) : (
              <div
                className={`flex aspect-[4/3] w-full items-center justify-center rounded-2xl bg-line/20 text-[11px] text-muted ${
                  on ? "ring-[3px] ring-[#56634a] ring-offset-2 ring-offset-page" : ""
                }`}
              >
                No photograph
              </div>
            )}

            {/* The tick sits ON the photo, like the heart in the
                reference. It was a checkbox in the row of text,
                which put the one deliberate action on the card
                in the least deliberate place. */}
            <button
              type="button"
              aria-label={on ? "Remove from the deck" : "Add to the deck"}
              onClick={(e) => {
                e.stopPropagation();
                pick(k);
              }}
              /* Filled green with a tick when it is in; an empty circle with
                 a plus when it is not. Both used to show a tick, one pale and
                 one dark, which is why nobody could tell. The same green as
                 the Market step's "On the slide". */
              className={`absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full text-[14px] font-bold shadow-sm transition-transform hover:scale-110 ${
                on ? "bg-[#56634a] text-white" : "border border-line/80 bg-page/90 text-muted"
              }`}
            >
              {on ? <>&#10003;</> : "+"}
            </button>
            {/* Top left, stacked: clear of the photo dots along the
                bottom and of the tick on the right. */}
            {(on || l.status === "let agreed") && (
              <span className="pointer-events-none absolute left-2 top-2 flex flex-col items-start gap-1">
                {l.status === "let agreed" && (
                  <span className="rounded-full bg-page/95 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-accent-dark shadow-sm">
                    Let agreed
                  </span>
                )}
                {on && (
                  <span className="rounded-full bg-[#56634a] px-2.5 py-1 text-[10.5px] font-semibold text-white shadow-sm">
                    In the presentation
                  </span>
                )}
              </span>
            )}

            {/* THE REAL ADVERT, bottom right and out of the
                gallery arrows' way. This existed before and
                pointed at Homesearch's bearer-token API URL — a
                401 in front of a landlord. `current_listings/
                <id>/url` resolves the actual Rightmove or
                OnTheMarket page; 19 of 21 rows have one, and the
                arrow is simply absent on the two that do not. */}
            {l.advert && (
              <a
                href={l.advert}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                aria-label="Open the advert"
                title="Open the advert"
                className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-page/90 text-[13px] text-ink opacity-0 shadow-sm transition-all hover:scale-110 group-hover:opacity-100"
              >
                &#8599;
              </a>
            )}

            {/* PAGE THE PHOTOGRAPHS WITHOUT LEAVING THE LIST.
                James, 29 Aug: "as we hover over to see the
                photos, the arrow should pop up in the middle of
                the right-hand side... every time we click the
                button it will then show us a different photo."

                This arrow used to open "the advert", which was
                really Homesearch's bearer-token API URL — a 401
                in front of a landlord. Now it does the thing it
                always looked like it did.

                Only when there IS more than one: an arrow that
                returns you to the same picture is worse than no
                arrow, because you press it twice to find out. */}
            {shots.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => step(e, -1)}
                  aria-label="Previous photograph"
                  className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-page/90 text-[13px] text-ink opacity-0 shadow-sm transition-all hover:scale-110 group-hover:opacity-100"
                >
                  &#8249;
                </button>
                <button
                  type="button"
                  onClick={(e) => step(e, 1)}
                  aria-label="Next photograph"
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-page/90 text-[13px] text-ink opacity-0 shadow-sm transition-all hover:scale-110 group-hover:opacity-100"
                >
                  &#8250;
                </button>

                {/* How many, and where you are in them. Without
                    this the arrows are a loop with no end and no
                    sense of how much there is left to see. */}
                <span className="pointer-events-none absolute inset-x-0 bottom-2 flex items-center justify-center gap-1">
                  {shots.slice(0, 6).map((_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 w-1.5 rounded-full transition-all ${
                        i === Math.min(at, 5) ? "bg-white" : "bg-white/55"
                      }`}
                    />
                  ))}
                  {shots.length > 6 && (
                    <span className="ml-0.5 text-[9px] font-semibold text-white/90">
                      {at + 1}/{shots.length}
                    </span>
                  )}
                </span>
              </>
            )}
          </div>

          {/* Floating underneath, on the page. No panel, no line. */}
          <div className="px-0.5 pt-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="figures text-[13.5px]">
                {l.rent ? money(l.rent) : "\u2014"}
                <span className="text-[10.5px] text-muted"> pcm</span>
              </span>
              {l.daysListed != null && (
                <span className="text-[10.5px] text-muted">{l.daysListed}d listed</span>
              )}
            </div>
            <p className="mt-0.5 truncate text-[12px]">{l.address}</p>
            <p className="truncate text-[10.5px] text-muted">
              {[l.beds ? `${l.beds} bed` : null, l.type, l.postcode]
                .filter(Boolean)
                .join(" \u00b7 ")}
            </p>
            {l.agent && (
              <p className="truncate text-[10.5px] text-muted">{l.agent}</p>
            )}
          </div>
        </div>
      </li>
    );
  }

  const available = useMemo(() => (d?.comparables ?? []).filter((c) => !c.letAgreed), [d]);
  /* THE TICK LIST. Everything of ours still letting, PLUS every comparable
     that starts ticked or is ticked. Same-sector comparables are ticked by
     default whether or not they are let agreed (defaultSelection), and this
     list used to be `available` alone - so a let-agreed one went into the
     deck with no box on screen to untick it. Keyed on the default as well as
     the current ticks so a let-agreed row does not vanish the moment it is
     unticked, which would leave no way to put it back. */
  const oursTickable = useMemo(
    () =>
      (d?.comparables ?? []).filter(
        (c) => !c.letAgreed || c.nearness === "sector" || chosen.includes(c.id)
      ),
    [d, chosen]
  );
  /* The ticked comparables that still exist in the research, and the guide
     the deck will carry from them. */
  const pickedComps = useMemo(
    () => (d?.comparables ?? []).filter((c) => chosen.includes(c.id)),
    [d, chosen]
  );
  const deckGuide = useMemo(() => buildGuide(pickedComps), [pickedComps]);

  const toggle = (id: string) =>
    setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const here = BUILD_STEPS[step].id as BuildStepId;

  /**
   * A CIRCLE SHOWING A MAP — and it stays a map when you press it.
   *
   * James, 29 Aug: "the map icon should clearly look like a map, and as we
   * click on it, it shouldn't turn into a different colour. It should still
   * show us a map." So the old accent wash and the word "Map" printed across
   * it are gone: on is a ring, off is no ring, and the picture never changes.
   *
   * It lives on the step line, hard right, in line with Review. That is the
   * only row on this screen that is always there, and it buys back the entire
   * filter box the button used to sit in.
   *
   * The picture is a real static map of this property, drawn by /api/map-thumb
   * so the Google key stays on the server. No key means no picture and the
   * circle falls back to the pin — the button still works, it just is not a map.
   */
  /**
   * THE DECK, AS A ROW OF FACES.
   *
   * James, 30 Aug: "when we select a property, pop that property on map view
   * at the top in line with the review button... circle icons the same size as
   * the map... as we hover they turn back into squares and enlarge, giving us
   * the choice to remove them, or see the photo again."
   *
   * It answers the question the grid could not: what is actually going in this
   * landlord's presentation, without counting ticks across twenty cards. The
   * order is PICK order, not the list's — the rail is a record of what the
   * agent chose and when, and re-sorting it would lose that.
   *
   * The hover panel grows downward from the circle rather than in place, so
   * nothing on the step line ever moves. Circles that shove their neighbours
   * aside on hover make a row of them unusable.
   */
  /* From either list: the let-agreed step picks the same way the market
     step does now (James, 11 Sep 2026), so a tick on either lands here. */
  /* A PICK OUTLIVES THE SEARCH THAT FOUND IT. Homesearch returns the newest
     48, so widening the radius pushed older picks out of the list - and,
     because picks were only looked up in the current list, out of the deck
     too, without a word (found 1 Oct 2026 chasing Howard's radius ticket:
     three picked, widen to 2.5 miles, one left). Every picked listing seen
     is remembered here, and the deck reads from that when the list no longer
     carries it. Written during render on purpose: it only ever adds what is
     on screen, so it is idempotent. */
  const pickedSeen = useRef(new Map<string, MarketListing>());
  for (const l of all) {
    const k = keyOf(l);
    if (pickedNearby.includes(k)) pickedSeen.current.set(k, l);
  }
  const picks = pickedNearby
    .map(
      (k) =>
        nearby.find((l) => keyOf(l) === k) ??
        letAgreed.find((l) => keyOf(l) === k) ??
        pickedSeen.current.get(k)
    )
    .filter((l): l is MarketListing => Boolean(l));
  /* The list the split view is showing on this step. */
  const listHere: MarketListing[] = here === "let" ? letAgreed : nearby;
  const splitStep = here === "available" || here === "let";
  /* How many are picked from each grid, for the line above it and the step
     tabs. Recently let also counts our own lets ticked, which feed the guide. */
  const pickedAvail = picks.filter((l) => l.status !== "let agreed").length;
  const pickedLet = picks.filter((l) => l.status === "let agreed").length;
  const pickedHere = here === "let" ? pickedLet : pickedAvail;
  /* Picked, still in the deck, but not in the list on screen (see pickedSeen). */
  const pickedAway = pickedHere - listHere.filter((l) => pickedNearby.includes(keyOf(l))).length;
  const stepCount: Partial<Record<BuildStepId, number>> = {
    available: pickedAvail,
    let: pickedLet + pickedComps.length,
  };
  /* The rent guide and the What's letting nearby slide need three of our own
     lets ticked. Said on Recently let, where the ticking happens (Howard,
     30 Sep 2026: "i dont think this is clear on the previous steps") rather
     than only on Review after the fact. Same floor as slideHasContent. */
  const GUIDE_FLOOR = 3;
  const guideMet = pickedComps.length >= GUIDE_FLOOR;

  /* OUR OWN LETS, folded up. What we let (with time on the market, which
     only our book can say) and what we are letting now, as one line above
     the market's let-agreed stock. Open when there is something to read;
     the checkboxes decide which of ours reach the deck's comparables. It
     replaces the long lists that used to be this step, with their doubled
     rules under every address. */
  const oursStrip = d ? (
    <div className="mb-3 shrink-0">
      <div
        className={`mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border px-3 py-2 text-[12.5px] leading-snug ${
          guideMet ? "border-[#56634a]/40 bg-[#f1f4ec]/70" : "border-accent-dark/35 bg-accent-soft/35"
        }`}
      >
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
            guideMet ? "bg-[#56634a] text-white" : "bg-accent-dark text-white"
          }`}
          aria-hidden
        >
          {guideMet ? <>&#10003;</> : "!"}
        </span>
        <span className="min-w-0 flex-1">
          {guideMet ? (
            <>
              The rent guide and the <span className="font-semibold">What&apos;s letting nearby</span> slide are in, from{" "}
              <span className="figures">{pickedComps.length}</span> of our lets ticked.
            </>
          ) : (
            <>
              Tick at least {GUIDE_FLOOR} of our lets for the rent guide and the{" "}
              <span className="font-semibold">What&apos;s letting nearby</span> slide{" "}
              <span className="figures">({pickedComps.length} ticked)</span>.
            </>
          )}
        </span>
        {!oursOpen && (
          <button
            type="button"
            onClick={() => setOursOpen(true)}
            className="shrink-0 rounded-full border border-ink/25 bg-page px-3 py-1 text-[11.5px] font-semibold transition-colors hover:border-ink/50"
          >
            {guideMet ? "See our lets" : "Tick our lets"}
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOursOpen((o) => !o)}
          aria-expanded={oursOpen}
          className={`rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
            oursOpen ? "border-brown bg-brown text-page" : "border-line/80 text-muted hover:border-ink/40 hover:text-ink"
          }`}
        >
          What we&apos;ve let {oursOpen ? "▴" : "▾"}
        </button>
        <span className="text-[11.5px] text-muted">
          {d.recentlyLet.length} let by us in {d.postcode.split(" ")[0]} &middot; {available.length} of ours letting now
        </span>
        {oursOpen && (
          /* Wider: every let of ours the research carries, not just this
             district. James, 11 Sep 2026: "the ability to pull out the search
             a bit wider if we want to show other things that we've let". */
          <button
            type="button"
            onClick={() => setOursWide((w) => !w)}
            aria-pressed={oursWide}
            className={`ml-auto rounded-full border px-3 py-1 text-[11.5px] transition-colors ${
              oursWide ? "border-brown bg-brown text-page" : "border-line/80 text-muted hover:border-ink/40 hover:text-ink"
            }`}
          >
            {oursWide ? "Showing everything of ours" : "Show ours further out"}
          </button>
        )}
      </div>
      {oursOpen && (
        <div className="fade-up mt-2.5 grid gap-x-6 gap-y-3 rounded-2xl border border-line/70 p-4 sm:grid-cols-2">
          <div>
            <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">Let by us, most recent first</p>
            {(() => {
              const district = d.postcode.split(" ")[0];
              const rows = oursWide ? d.recentlyLet : d.recentlyLet.filter((l) => !l.postcode || l.postcode.split(" ")[0] === district);
              return rows.length === 0 ? (
                <p className="mt-1.5 text-[11.5px] text-muted">Nothing let in this district yet{oursWide ? "" : " - try further out"}.</p>
              ) : (
                <ul className="mt-1.5 max-h-52 overflow-y-auto">
                  {rows.map((l, i) => (
                    <li key={`${l.address}-${i}`} className="flex items-baseline justify-between gap-2 py-1.5 text-[12.5px]">
                      <span className="min-w-0 truncate">
                        {l.address}
                        <span className="ml-1.5 text-[10.5px] text-muted">{[l.beds ? `${l.beds} bed` : null, l.postcode].filter(Boolean).join(" \u00b7 ")}</span>
                      </span>
                      <span className="shrink-0 text-muted">
                        {l.rent ? <span className="figures text-ink">{money(l.rent)}</span> : "\u2014"}
                        {l.daysToLet != null ? ` \u00b7 let in ${l.daysToLet}d` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </div>
          <div>
            <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">Ours nearby - tick 3 or more for the rent guide</p>
            {oursTickable.length === 0 ? (
              <p className="mt-1.5 text-[11.5px] text-muted">Nothing of ours near this postcode.</p>
            ) : (
              <ul className="mt-1.5 max-h-52 overflow-y-auto">
                {oursTickable.map((c) => (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-center gap-2.5 py-1.5 text-[12.5px]">
                      <input type="checkbox" checked={chosen.includes(c.id)} onChange={() => toggle(c.id)} className="h-3.5 w-3.5 accent-[#56423e]" />
                      <span className="min-w-0 flex-1 truncate">
                        {c.name}
                        <span className="ml-1.5 text-[10.5px] text-muted">{c.locality}</span>
                      </span>
                      {c.letAgreed && (
                        <span className="shrink-0 rounded-full border border-line/80 px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wider text-muted">
                          Let agreed
                        </span>
                      )}
                      <span className="figures shrink-0">{c.rentDisplay}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  ) : null;

  const deckRail = splitStep && picks.length > 0 ? (
    <div className="flex items-center gap-1.5">
      {picks.map((l) => {
        const k = keyOf(l);
        /* The same shots and the same slide index the card uses, so paging
           here and paging there are the same act — not two galleries of the
           same house disagreeing about which picture is showing. */
        const shots = l.photos?.length
          ? [l.image, ...l.photos.filter((u) => u !== l.image)].filter(
              (u): u is string => Boolean(u)
            )
          : l.image
            ? [l.image]
            : [];
        const at = shots.length
          ? (((slide[k] ?? 0) % shots.length) + shots.length) % shots.length
          : 0;
        const shot = shots[at] ?? null;
        return (
          <div key={k} className="group relative">
            <button
              type="button"
              onClick={() => setFocused(k)}
              title={l.address}
              aria-label={l.address}
              className="deck-land relative block h-10 w-10 overflow-hidden rounded-full border border-accent-dark/50 shadow-sm ring-2 ring-accent-dark/25 transition-transform duration-200 group-hover:scale-105"
            >
              {shot ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shot} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-line/30 text-[9px] text-muted">
                  {l.beds ?? "?"}b
                </span>
              )}
            </button>

            {/* The circle, grown into a square. Same origin, same photograph,
                so it reads as one object opening rather than a tooltip. */}
            <div className="pointer-events-none absolute left-1/2 top-0 z-40 w-[190px] origin-top -translate-x-1/2 scale-[0.2] rounded-2xl border border-line/70 bg-page opacity-0 shadow-[0_20px_44px_-14px_rgba(0,0,0,0.4)] transition-all duration-200 ease-[cubic-bezier(0.34,1.4,0.64,1)] group-hover:pointer-events-auto group-hover:scale-100 group-hover:opacity-100">
              <div className="relative">
                {shot ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={shot} alt="" className="h-[124px] w-full rounded-t-2xl object-cover" />
                ) : (
                  <div className="flex h-[124px] w-full items-center justify-center rounded-t-2xl bg-line/20 text-[11px] text-muted">
                    No photograph
                  </div>
                )}
                {shots.length > 1 && (
                  <>
                    <button
                      type="button"
                      aria-label="Previous photograph"
                      onClick={() => setSlide((m) => ({ ...m, [k]: (m[k] ?? 0) - 1 }))}
                      className="absolute left-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-page/90 text-[12px] shadow-sm transition-transform hover:scale-110"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      aria-label="Next photograph"
                      onClick={() => setSlide((m) => ({ ...m, [k]: (m[k] ?? 0) + 1 }))}
                      className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-page/90 text-[12px] shadow-sm transition-transform hover:scale-110"
                    >
                      ›
                    </button>
                    <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-ink/55 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                      {at + 1}/{shots.length}
                    </span>
                  </>
                )}
              </div>
              <div className="px-3 py-2">
                <p className="figures text-[13px] leading-none">
                  {l.rent ? money(l.rent) : "\u2014"}
                  <span className="text-[10px] text-muted"> pcm</span>
                </p>
                <p className="mt-1 truncate text-[11.5px]">{l.address}</p>
                <p className="truncate text-[10.5px] text-muted">
                  {[l.beds ? `${l.beds} bed` : null, l.type, l.postcode].filter(Boolean).join(" \u00b7 ")}
                </p>
                {/* Remove, and nothing else. There is no public advert URL in
                    this feed — see MarketListing.listingId — so the second
                    action is the photographs, and they are on the picture
                    where you would reach for them. */}
                <button
                  type="button"
                  onClick={() => pick(k)}
                  className="mt-2 w-full rounded-full border border-line/80 px-2 py-1 text-[11px] text-muted transition-colors hover:border-accent-dark hover:text-accent-dark"
                >
                  Remove from the deck
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  ) : null;

  const mapToggle = splitStep && listHere.length > 0 ? (
    <button
      type="button"
      onClick={() => setMapOpen((m) => !m)}
      aria-pressed={mapOpen}
      aria-label={mapOpen ? "Hide the map" : "Show the map"}
      title={mapOpen ? "Hide the map" : "Show the map"}
      className={`relative hidden h-10 w-10 shrink-0 overflow-hidden rounded-full border transition-all hover:scale-105 active:scale-95 lg:block ${
        mapOpen
          ? "border-accent-dark ring-2 ring-accent-dark/35"
          : "border-line/80 hover:border-ink/40"
      }`}
    >
      {/* No geocode means no tile, and the button falls back to a plain
          circle. It still opens the map — losing the picture must not lose
          the feature. */}
      {d?.subjectPoint ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={tileUrl(d.subjectPoint.lat, d.subjectPoint.lon)}
          alt=""
          className="h-full w-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : null}
      {/* The property, in the middle of its own map. Without it the circle is
          a picture of a town; with it, it is a picture of THIS one. */}
      <span className="pointer-events-none absolute left-1/2 top-1/2 h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-dark ring-2 ring-white/90" />
    </button>
  ) : null;

  const walk = (
    <>
      <button
        type="button"
        onClick={() => setStep((s) => Math.max(0, s - 1))}
        disabled={step === 0}
        className="rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] transition-colors hover:border-ink/40 disabled:opacity-40"
      >
        ← Back
      </button>
      {step < BUILD_STEPS.length - 1 ? (
        <button
          type="button"
          onClick={() => setStep((s) => s + 1)}
          className="rounded-full bg-accent-dark px-3.5 py-1.5 text-[12px] font-semibold text-white"
        >
          Next →
        </button>
      ) : (
        <button
          type="button"
          onClick={create}
          disabled={making || !d || existing === undefined}
          className="rounded-full bg-accent-dark px-3.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
        >
          {existing ? "Update presentation" : "Create presentation"}
        </button>
      )}
    </>
  );

  /* The preview deck: the same payload the server would receive, given a
     stand-in agent and the standing fees, so it is the landlord's deck as it
     would be minted right now. Recomputed as picks and ticks change. */
  const draftDeck = useMemo<Deck | null>(() => {
    const b = deckBody();
    if (!b) return null;
    const level = SERVICE_LEVELS.find((sl) => sl.id === appraisal?.serviceLevel);
    return {
      kind,
      recipientName: landlord ?? "",
      property: {
        address,
        postcode,
        image: null,
        beds: d?.material?.bedrooms ?? null,
        baths: null,
        sqft: null,
        propertyType: null,
        epc: null,
      },
      whenPretty: "",
      startsAt: appraisal?.appointmentAt ?? null,
      minutes: 45,
      /* A stand-in until the agent loads. The draft also drives the Review
         list, which must not wait on who is signed in; the preview does. */
      agent: me ?? { name: "", firstName: "", title: "", email: "", phone: "", photo: null, bio: "" },
      comparables: b.comparables && b.comparables.rows.length >= 3 ? b.comparables : null,
      rmGuide: b.rmGuide,
      market: b.market && b.market.area ? b.market : null,
      listings: b.listings.length ? (b.listings as Deck["listings"]) : null,
      material: b.material.length ? b.material : null,
      fees: STANDARD_FEES,
      valuation:
        kind === "post-appraisal" && appraisal?.valuation
          ? {
              rent: appraisal.valuation,
              serviceLevel: level?.label ?? null,
              feePct: appraisal.feePct ?? null,
              setupFee: appraisal.setupFee ?? null,
              note: appraisal.valuationNote ?? null,
            }
          : null,
      /* The signing link is only minted at send, but the terms slide goes out
         whenever there is a figure, so the draft carries an empty one: the
         slide's no-link branch, which is what it shows until DocuSeal answers. */
      terms: kind === "post-appraisal" && appraisal?.valuation ? { signUrl: null, summary: null } : null,
      hidden: b.hidden,
      createdAt: new Date().toISOString(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, me, chosen, picks, marketSel, marketPic, kind, landlord, address, postcode, appraisal, hidden, rmGuide]);
  const previewDeck = me ? draftDeck : null;

  const body = (
    <>
        {/* THE TITLE AT THE OS'S OWN SIZE. James, 11 Sep 2026: "the title is
            really small, and the name of the property is really small". It
            was a 17px line with the address in 11.5px under it - a modal's
            title, kept when this became a page. Every other screen opens
            with a 30-42px title in the house face, and the appraisal file
            this came from sets the address at 30/34. So: the same title
            scale, and the address as a real second line rather than a
            caption. Tight underneath, because space here is at a premium. */}
        <div className="flex shrink-0 flex-wrap items-end justify-between gap-x-6 gap-y-2 px-0 pb-3 pt-5">
          <div className="min-w-0">
            <h1 className="hand text-[30px] leading-[1.05] sm:text-[38px]">{existing ? "Edit the Presentation" : "Build the Presentation"}</h1>
            <p className="mt-1.5 truncate text-[16px] leading-snug sm:text-[18px]">
              {address}
              {/* Some records carry the postcode inside the address already;
                  saying it twice on the title line looked like a typo. */}
              {!address.toUpperCase().includes(postcode.toUpperCase()) && (
                <span className="ml-2 text-[13px] text-muted">{postcode}</span>
              )}
            </p>
          </div>
          {/* BACK AND NEXT LIVE UP HERE NOW. James, 29 Aug: "move the next
              button and the back button up there and into that space."

              They were a footer, and a footer is a bar the screen has to pay
              for on every step whether or not anything else needs the room.
              On the title line they cost nothing — the line was already there
              and half empty — and the map gets the height back. */}
          <div className="flex shrink-0 items-center gap-2">
            {/* The best-price guide explained, over this screen, so an agent
                does not lose their ticks going to read it. */}
            <GuideButton
              id="appraisals"
              className="mr-1 flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-semibold text-muted transition-colors hover:text-ink"
            />
            {/* Once it exists: look at it, or have it in your inbox. */}
            {existing && (
              <>
                <a
                  href={existing.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] font-semibold transition-colors hover:border-ink/40"
                >
                  View presentation
                </a>
                <a
                  href={`${existing.url.split("?")[0]}/print`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] font-semibold transition-colors hover:border-ink/40"
                >
                  Download PDF
                </a>
                <SendToMe token={existing.token} appraisalId={appraisal?.id ?? null} compact />
              </>
            )}
            {walk}
            {onClose && (
              <button type="button" onClick={onClose} className="ml-1 text-[18px] leading-none text-muted hover:text-ink">
                ✕
              </button>
            )}
          </div>
        </div>

        {/* The five steps, clickable — an agent who wants to change one thing
            shouldn't have to walk the whole wizard again. */}
        <nav className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line/70 px-0 py-2.5">
          {BUILD_STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(i)}
              title={s.blurb}
              className={`rounded-full border px-3.5 py-1.5 text-[12px] transition-colors ${
                i === step ? "border-brown bg-brown font-semibold text-page" : "border-line/80 text-muted hover:border-ink/40 hover:text-ink"
              }`}
            >
              <span className="mr-1 opacity-50">{i + 1}</span>
              {s.label}
              {/* What is picked on this step, visible from every step. */}
              {stepCount[s.id] ? (
                <span
                  className="figures ml-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#56634a] px-1 text-[10.5px] font-semibold text-white"
                  title={`${stepCount[s.id]} picked`}
                >
                  {stepCount[s.id]}
                </span>
              ) : null}
            </button>
          ))}
          {(deckRail || mapToggle) && (
            <div className="ml-auto flex items-center gap-2 pl-3">
              {deckRail}
              {deckRail && mapToggle && <span className="h-5 w-px bg-line/70" />}
              {mapToggle}
            </div>
          )}
        </nav>

        {/* WHEREVER THE PAGE ENDS IS WHERE THE MAP ENDS. James, 29 Aug.

            With the map open this stops being the scroller and becomes a
            column: the map takes whatever height is left after the title line
            and the steps, and the CARDS are the only thing that moves. No
            calc(100vh - a-number-I-guessed) — that number was wrong on every
            screen except the one it was measured on. */}
        <div
          className={
            mapMounted && splitStep
              ? "flex min-h-0 flex-1 flex-col overflow-hidden px-0 py-3"
              : "min-h-0 flex-1 overflow-y-auto px-0 py-3"
          }
        >
          {error && <p className="text-[12.5px] text-accent-dark">{error}</p>}
          {researchFailed && (
            <p className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-accent-dark/35 bg-accent-soft/35 px-3 py-2 text-[12.5px]">
              <span className="min-w-0 flex-1">
                {d ? "The property's facts did not refresh. " : "The research did not load. "}
                <span className="text-muted">{researchFailed}</span>
              </span>
              <button
                type="button"
                onClick={() => setResearchTry((n) => n + 1)}
                className="shrink-0 rounded-full border border-ink/25 bg-page px-3 py-1 text-[11.5px] font-semibold hover:border-ink/50"
              >
                Try again
              </button>
            </p>
          )}
          {!d && !error && !researchFailed && (
            <p className="flex items-center gap-2 text-[12.5px] text-muted">
              <span className="block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
              Pulling the research…
            </p>
          )}

          {/* TIDY. James, 11 Sep 2026: "space is at a premium, so anything
              that doesn't need to be shown, we don't have to show. Key
              property details." The step's blurb is gone (the tab already
              says Property), the panel runs compact - six facts in a row,
              the long list behind one button - and compliance below is one
              line per item rather than a card each. */}
          {d && here === "property" && (
            <div className="space-y-3">
              {d.addressWarning && (
                <p className="rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3 text-[12px] leading-relaxed">
                  {d.addressWarning}
                </p>
              )}
              {d.subject?.picked && !pickerOpen && (
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line/70 bg-card p-3 text-[12px] leading-relaxed">
                  <span className="min-w-0 flex-1">
                    Matched by hand to <span className="font-semibold">{d.subject.label}</span>. Check it is the landlord&apos;s
                    home before you quote anything from it.
                  </span>
                  <button type="button" onClick={() => setPickerOpen(true)} className="text-[11.5px] font-semibold text-accent-dark hover:underline">
                    Change
                  </button>
                  <button type="button" onClick={() => setMatch(NO_MATCH)} className="text-[11.5px] text-muted hover:text-ink">
                    Undo
                  </button>
                </p>
              )}
              {(pickerOpen || (!d.subject && d.addressWarning)) && (
                <AddressPicker
                  postcode={postcode}
                  asked={address}
                  busy={rematching}
                  onPick={(a) => {
                    setPickerOpen(false);
                    setMatch(a);
                  }}
                  onCancel={d.subject?.picked ? () => setPickerOpen(false) : undefined}
                />
              )}
              {rematching && (
                <p className="flex items-center gap-2 text-[12px] text-muted">
                  <span className="block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
                  Loading the property&apos;s facts…
                </p>
              )}
              {/* The same panel the appraisal file shows. One component rather
                  than two, so the deck an agent builds can never disagree with
                  the file they built it from. "Confirmed: Yes" used to live
                  here as a standalone box; it is now the panel's Matched pill,
                  which says the same thing next to the evidence for it. */}
              {/* The address is already in the header two lines up, and the
                  panel repeats property type. James spotted the duplication:
                  "you've got them in the boxes above". One or the other. */}
              {/* BULKED UP. James, 11 Sep 2026: the slimmed step was "too
                  thin... make it bigger and more visual". Facts on the left
                  at a size you can read across a table; on the right the
                  property on its map and its story - advertised now, through
                  our hands before, and any photographs either turns up. */}
              <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <MaterialInfoPanel material={d.material} warning={d.addressWarning} hideVerbose compact />
                <div className="space-y-5">
                  {d.subjectPoint && (
                    /* The front door from the street, with the flat map as
                       the fallback when there is no panorama or no key. */
                    <StreetView
                      point={d.subjectPoint}
                      caption={`${address.split(",")[0]} · from the street`}
                      fallback={
                        <div className="relative overflow-hidden rounded-2xl border border-line/70 bg-box">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={tileUrl(d.subjectPoint.lat, d.subjectPoint.lon, 16)}
                            alt=""
                            className="aspect-[16/9] w-full object-cover"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                          />
                          <span className="pointer-events-none absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brown ring-[3px] ring-white shadow" />
                          <span className="absolute bottom-2 left-2 rounded-full bg-page/95 px-2.5 py-1 text-[11px] shadow-sm">{postcode}</span>
                        </div>
                      }
                    />
                  )}
                  <SubjectStory address={address} postcode={postcode} live={[...nearby, ...letAgreed]} />
                </div>
              </div>
            </div>
          )}

          {/* COMPLIANCE, AT APPRAISAL TIME.

              James, 30 Aug: capture the EPC and put it on file, show what we
              can get at and what is outstanding.

              Everything in the top half is DERIVED from the EPC register via
              Homesearch — nothing is invented, and a missing input renders as
              "unknown" rather than a guess. The arithmetic is worth the trouble:
              an EPC lasts ten years, and 12 Dover Close was assessed on
              10 August 2015, so it expired over a year ago. That is a real
              finding on a real property from inputs we already held.

              The bottom half is deliberately NOT drawn as failures. The
              property is not on our book, so the landlord may well hold every
              one of them. A red cross against "gas safety" would be telling a
              landlord they are non-compliant on the strength of us not having
              looked. */}
          {d && here === "property" && (
            <div className="mt-4 border-t border-line/70 pt-4">
              <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">Compliance</p>
              {(() => {
                const items = knownCompliance(d.material ?? null);
                const dot = (st: string) =>
                  st === "fail"
                    ? "bg-accent-dark"
                    : st === "warn"
                      ? "bg-ink/45"
                      : st === "ok"
                        ? "bg-ink/20"
                        : "bg-line";
                return (
                  <>
                    {items.length === 0 ? (
                      <p className="mt-2 text-[12px] leading-relaxed text-muted">
                        Nothing on the EPC register for this address yet &mdash; a genuine gap, or
                        the address not matching. Check before telling a landlord they have no
                        certificate.
                      </p>
                    ) : (
                      /* One line each: the dot says the state, the label says
                         what, the detail says why, and the source rides at the
                         end in small type. It was a card per item with three
                         lines in it, which cost the screen half its height. */
                      <ul className="mt-2 divide-y divide-line/50">
                        {items.map((it) => (
                          <li
                            key={it.label}
                            className={`flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 text-[12.5px] ${it.state === "fail" ? "text-accent-dark" : ""}`}
                            title={it.source}
                          >
                            <span className={`relative top-[-1px] inline-block h-2 w-2 shrink-0 rounded-full ${dot(it.state)}`} />
                            <span className="font-semibold">{it.label}</span>
                            <span className="min-w-0 flex-1 text-muted">{it.detail}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* What to ask the landlord for: chips, not a grid of cards.
                        The reason for each one is on hover; the list itself is
                        what an agent needs to see, and it fits on one line. */}
                    <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
                      To ask the landlord for &mdash; nothing here is on a public register, so
                      this is a list to ask, not a list of failures.
                    </p>
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {OUTSTANDING_AT_APPRAISAL.map((o) => (
                        <li
                          key={o.label}
                          title={o.why}
                          className="rounded-full border border-dashed border-line px-2.5 py-1 text-[11.5px] text-muted"
                        >
                          {o.label}
                        </li>
                      ))}
                    </ul>
                  </>
                );
              })()}
            </div>
          )}

          {d && here === "let" && (
            <RmGuidePanel refId={refId ?? address} value={rmGuide} onChange={setRmGuide} />
          )}

          {/* ONE VIEW FOR BOTH. James, 11 Sep 2026: Recently let "should be exactly
              the same page as On the market... have a map on there so they can
              pick their things." So the split view below serves both steps,
              fed by whichever list the step is about; only the strip of our
              own lets at the top is particular to Recently let. */}
          {d && splitStep && listHere.length > 0 && (
            <div className={mapMounted ? "flex min-h-0 flex-1 flex-col" : "mb-5"}>
              {here === "let" && oursStrip}
              {/* NO BOX. The filter row is the row — a bordered, tinted panel
                  around four controls was a container drawn for its own sake,
                  and it cost the screen the vertical space that made the map
                  and the cards not fit together.

                  With the map open the same controls are floating ON it, so
                  this row folds away rather than duplicating them. It COLLAPSES
                  rather than disappears, so the cards rise into the space
                  instead of jumping. */}
              <div
                className={`overflow-hidden transition-[max-height,opacity,margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  mapOpen ? "mb-0 max-h-0 opacity-0" : "mb-3 max-h-24 opacity-100"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">{controlsFor(false)}</div>
                {/* How far out, said in words. The slider's own number says
                    "3 mi"; this says three miles OF WHERE, which is the bit an
                    agent is actually being asked to defend. */}
                <p className="mt-2 text-[11px] leading-relaxed text-muted">
                  {refiltering
                    ? "Searching\u2026"
                    : filters.radius
                      ? `${listHere.length} ${here === "let" ? "let agreed" : "on the market"} within ${filters.radius} ${filters.radius === 1 ? "mile" : "miles"} of ${postcode} \u2014 every agent's stock, not just ours.`
                      : `${listHere.length} ${here === "let" ? "let agreed" : "on the market"} in ${d.sector} only \u2014 every agent's stock, not just ours. Drag the slider to reach further out.`}
                </p>
              </div>

              {/* SPLIT VIEW. Cards left, map right, both scrolling in their own
                  right — the Airbnb shape, and it works for the same reason:
                  you point at somewhere on the map and read about it without
                  either half moving out from under you.

                  The map is STICKY rather than scrolling with the list. A map
                  that leaves the screen while you scroll the results is a map
                  you have to keep scrolling back to. */}
              {/* HOW MANY ARE IN, said where the picking happens. The filter
                  line folds away with the map open, so this sits outside it. */}
              <p className="mt-1 flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
                <span
                  className={`figures rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${
                    pickedHere ? "bg-[#56634a] text-white" : "border border-line/80 text-muted"
                  }`}
                >
                  {pickedHere} picked
                </span>
                <span className="text-muted">
                  {pickedAway > 0
                    ? `${pickedAway} of them ${pickedAway === 1 ? "is" : "are"} outside this search and still in the presentation - remove from the circles at the top.`
                    : pickedHere
                    ? "Ringed in green below. Click a card again to take it out."
                    : here === "let"
                      ? "Click a card to put it on the What's on the market slide."
                      : "Click a card to put it in the presentation."}
                </span>
                {/* Said here as well as in the filter bar: with the map open
                    the bar lives on the map, and with no map key it is not
                    drawn at all. */}
                {refilterFailed && !refiltering && (
                  <button
                    type="button"
                    onClick={() => applyFilters(filters)}
                    title={refilterFailed}
                    className="ml-auto rounded-full border border-accent-dark/40 px-3 py-0.5 text-[11.5px] font-semibold text-accent-dark hover:border-accent-dark"
                  >
                    The list did not refresh - Try again
                  </button>
                )}
              </p>
              <div className={mapMounted ? "mt-2 flex min-h-0 flex-1 gap-4" : "mt-2"}>
                {/* WITH THE MAP OPEN THE LIST IS THE ONLY THING THAT SCROLLS.
                    James, 29 Aug: "if we scroll, it only scrolls the properties
                    on the left. If we do scroll on the right, it just moves the
                    map in and out."

                    So the column takes the height of the screen and scrolls
                    inside itself, and the map beside it never moves. The height
                    is measured from the viewport rather than fixed in pixels,
                    because this panel sits at different depths on a laptop and
                    a large monitor and a hardcoded 560px is right on neither. */}
                <ul
                  ref={listRef}
                  className={
                    mapMounted
                      /* Wider gaps than a boxed grid needs. With no border
                         the whitespace IS the separation — tight gaps make two
                         properties read as one, because nothing else says
                         where the first one stops. */
                      /* Padded all round so the green ring on a picked
                         card is not clipped by the scroller's edge. */
                      ? "grid min-h-0 flex-1 grid-cols-1 content-start gap-x-4 gap-y-6 overflow-y-auto p-2 xl:grid-cols-2"
                      : "grid gap-x-4 gap-y-6 p-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                  }
                >
                {/* THE FEED'S ORDER, ALWAYS. Picked cards used to leave the
                    grid for the rail and a clicked one jumped to the top, so
                    the list reshuffled under the agent's cursor on every click
                    (Howard, 30 Sep 2026). Nothing is filtered or sorted on a
                    pick now: the card is ringed where it stands. */}
                {listHere.map((l) => propertyCard(l))}
                </ul>

                {/* Three quarters of the width was asked for; 58% is what that
                    means once the two-column card grid beside it still has to
                    hold a photograph and a price without wrapping.

                    IT SLIDES OUT OF THE CORNER IT WAS SUMMONED FROM. The width
                    animates, so the cards reflow with it rather than snapping;
                    `min-w` on the inner panel keeps the map its own size while
                    the column narrows, so it slides behind the edge instead of
                    being squashed into it. */}
                {mapMounted && (
                  <div
                    className={`hidden h-full shrink-0 overflow-hidden transition-[width,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:block ${
                      mapIn ? "w-[58%] opacity-100" : "w-0 opacity-0"
                    }`}
                  >
                    <div className="h-full min-w-[440px]">
                      <MarketMap
                        listings={listHere}
                        centre={d.subjectPoint}
                        selected={pickedNearby}
                        radiusMiles={filters.radius}
                        controls={mapControls}
                        /* Clicking a price scrolls to that card and outlines
                           it where it sits. It used to move it to the top. */
                        onOpen={(k) => setFocused(k)}
                        /* Ticking now happens on the card that pops out of the
                           map, where the photo and the rent are visible. It
                           used to fire on the same click as opening, which made
                           adding a competitor's property to a landlord's deck a
                           side effect of pointing at it. */
                        onSelect={(k) => pick(k)}
                      />
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* Nothing let agreed on these filters: the strip of our own lets
              still shows, and the filters stay reachable to widen the search. */}
          {d && here === "let" && listHere.length === 0 && (
            <div className="mb-5">
              {oursStrip}
              <div className="flex flex-wrap items-center gap-2">{controlsFor(false)}</div>
              <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
                Nothing let agreed nearby on these filters. Widen the radius or clear the bed
                and rent filters &mdash; there is far less let-agreed stock than there is on the
                market, so a narrow search empties this quickly.
              </p>
            </div>
          )}

          {/* MOUNTED FROM THE START, SHOWN ON ITS OWN STEP. Every section of
              the market slide is in by default now (Howard, 30 Sep 2026), so
              the figures have to be read even by an agent who never opens
              this step - otherwise "in by default" would quietly mean "in if
              you happened to look". Hidden, not unmounted, for the same
              reason. */}
          {d && (
            <div className={here === "market" ? "space-y-3" : "hidden"}>
              <p className="text-[12.5px] leading-relaxed text-muted">{BUILD_STEPS[3].blurb}</p>

              {/* THE MARKET AT THREE SCOPES.
              
                  There is no lettings version of this screen anywhere to copy.
                  F&C's Market Insights has seven panels and five of them are
                  switched off in lettings mode — competition, market balance,
                  the Land Registry slice, price bands and the neighbourhood
                  profile are all sales-only. So this is built rather than
                  borrowed.
              
                  All three scopes are shown, and the reason is a measurement:
                  on 30 Aug the NN5 district asked an average of £1,006 while
                  the NN5 4 sector asked £725. Quote the district figure at a
                  NN5 4 landlord and you have overpriced their house by 39%.
                  The closest scope is highlighted; the wider ones are context,
                  not the answer.
              
                  A scope Homesearch holds nothing for is DROPPED upstream
                  rather than drawn as a row of zeroes — see marketScopes.

                  THE RENT COLUMN WAS REMOVED FROM THIS TABLE, deliberately.
                  It carried `avg_price_on_market`, and the panel below carries
                  the median of the listings themselves. Measured on NN5 4 on
                  31 Aug they said £725 and £1,150 — the same screen quoting a
                  landlord two rents for their own sector, 59% apart. That is
                  the exact defect the comment at the foot of this step already
                  describes, reintroduced one row higher up.

                  The listings median wins because it can be defended property
                  by property: it is the middle of twenty adverts we can name.
                  The statistic cannot be taken apart, and is documented as
                  disagreeing with the feed by up to 40%. What this table keeps
                  is what only it can answer — twelve-month let volume, and the
                  supply that falls out of it. */}
              {d.marketScopes.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-line/70">
                  <table className="w-full text-[12.5px]">
                    <thead>
                      <tr className="border-b border-line/70 bg-box/60 text-[10px] uppercase tracking-wide text-muted">
                        <th className="px-3 py-2 text-left font-semibold">Area</th>
                        <th className="px-3 py-2 text-right font-semibold">Advertised now</th>
                        <th className="px-3 py-2 text-right font-semibold">Let in 12 months</th>
                        <th className="px-3 py-2 text-right font-semibold">Months of supply</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.marketScopes.map((sc, i) => {
                        const closest = i === d.marketScopes.length - 1;
                        return (
                          <tr
                            key={`${sc.level}-${sc.area}`}
                            className={`border-b border-line/40 last:border-0 ${closest ? "bg-accent-soft/25" : ""}`}
                          >
                            <td className="px-3 py-2">
                              <span className={closest ? "font-semibold" : ""}>{sc.area}</span>
                              <span className="ml-1.5 text-[10px] text-muted">{sc.level}</span>
                            </td>
                            {/* Every cell is an em dash when the figure is
                                absent. A blank reads as zero and a zero is a
                                claim we cannot make. */}
                            <td className="figures px-3 py-2 text-right">
                              {sc.toLetNow != null ? sc.toLetNow.toLocaleString("en-GB") : <span className="text-muted">&mdash;</span>}
                            </td>
                            <td className="figures px-3 py-2 text-right">
                              {sc.letLast12m != null ? sc.letLast12m.toLocaleString("en-GB") : <span className="text-muted">&mdash;</span>}
                            </td>
                            <td className="figures px-3 py-2 text-right">
                              {sc.monthsOfSupply != null ? (
                                <span className={sc.monthsOfSupply < 1 ? "font-semibold text-accent-dark" : ""}>
                                  {sc.monthsOfSupply}
                                </span>
                              ) : (
                                <span className="text-muted">&mdash;</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Months of supply is the number worth saying out loud, so it
                  gets said in words as well as in a column. Under one month
                  means the area lets its entire available stock faster than it
                  replaces it — which is the argument for pricing confidently,
                  and it is a measurement rather than an opinion. */}
              {(() => {
                const closest = d.marketScopes[d.marketScopes.length - 1];
                if (!closest) return null;
                const size = d.scopeBeds ? `${d.scopeBeds}-bed` : "all sizes";
                return (
                  <p className="text-[12px] leading-relaxed text-muted">
                    {closest.monthsOfSupply != null ? (
                      <>
                        {closest.area} has <span className="figures text-ink">{closest.toLetNow}</span>{" "}
                        advertised now against{" "}
                        <span className="figures text-ink">{closest.letLast12m?.toLocaleString("en-GB")}</span> let over twelve
                        months &mdash; about{" "}
                        <span className="figures text-ink">{closest.monthsOfSupply}</span> month
                        {closest.monthsOfSupply === 1 ? "" : "s"} of supply.{" "}
                        {closest.monthsOfSupply < 1
                          ? "The area lets its stock faster than it replaces it."
                          : closest.monthsOfSupply > 3
                            ? "That is a lot of choice for a tenant — price to be taken, not to be admired."
                            : "Broadly balanced."}
                      </>
                    ) : (
                      <>Homesearch has no letting volume for {closest.area}, so months of supply cannot be worked out.</>
                    )}{" "}
                    Supply covers <span className="font-semibold">{size}</span>.{" "}
                    {/* The old copy said "set a bed count on the market step",
                        and there has never been one on this step — the control
                        lives on On the market and Recently let. It now points
                        at the per-size breakdown below, which is the thing that
                        actually answers it. */}
                    &ldquo;Advertised&rdquo; counts let-agreed stock as well as available, so
                    supply reads a little high. Rent by size is broken out below.
                  </p>
                );
              })()}

              {/* EVERYTHING BELOW THE SUPPLY TABLE IS DERIVED FROM THE
                  LISTINGS, not from area statistics — pace, size, mix and the
                  competition, none of which `area_statistics/lettings/` can
                  answer, because it has exactly three members. This is also the
                  only part of the Market step that can reach the landlord: the
                  blocks carry "On slide" ticks and travel through
                  marketPayload() into the deck. See lib/market-picture. */}
              <MarketPicturePanel
                postcode={postcode}
                subjectBeds={d.scopeBeds ?? d.material?.bedrooms ?? null}
                selection={marketSel}
                onSelectionChange={setMarketSel}
                onLoaded={setMarketPic}
              />

              {/* TWO FIGURES, NAMED, because they are two different samples.
                  This box used to print the research guide (every comparable
                  we found) while the deck recalculated from the TICKED ones,
                  so an agent could read £1,250 here and send a landlord
                  £1,400 without either number being wrong or either being
                  labelled. The deck's figure leads, because it is the one the
                  landlord sees; everything we found sits underneath when it
                  differs. Same function for both - lib/ma-guide. */}
              {d.guide ? (
                <div className="rounded-xl border border-line/70 p-4">
                  <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">Rent guide in the presentation</p>
                  {deckGuide && pickedComps.length >= 3 ? (
                    <>
                      <p className="figures mt-2 text-[22px] leading-none">{money(deckGuide.mid)} pcm</p>
                      <p className="mt-1 text-[12px] text-muted">
                        {money(deckGuide.low)}-{money(deckGuide.high)} &middot; from the {deckGuide.basedOn} comparables ticked on Recently let &middot;{" "}
                        {guideReach(deckGuide, d.sector, d.sector?.split(" ")[0] ?? null)}
                      </p>
                      {deckGuide.caveat && (
                        <p className="mt-2 text-[11.5px] leading-relaxed text-accent-dark">{deckGuide.caveat}</p>
                      )}
                    </>
                  ) : (
                    <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
                      {rmGuide
                        ? "No range from our comparables. The Rightmove price guide attached on Recently let goes in instead, as a button on What's letting nearby."
                        : `No rent guide goes in yet. Tick at least 3 of our lets on Recently let${pickedComps.length ? ` (${pickedComps.length} ticked so far)` : ""}, or attach a Rightmove price guide there.`}
                    </p>
                  )}
                  {(!deckGuide ||
                    pickedComps.length < 3 ||
                    deckGuide.mid !== d.guide.mid ||
                    deckGuide.low !== d.guide.low ||
                    deckGuide.high !== d.guide.high ||
                    deckGuide.basedOn !== d.guide.basedOn) && (
                    <div className="mt-3 border-t border-line/60 pt-3">
                      <p className="text-[11.5px] text-muted">
                        All {d.guide.basedOn} comparable{d.guide.basedOn === 1 ? "" : "s"} we found:{" "}
                        <span className="figures text-ink">{money(d.guide.mid)} pcm</span> &middot;{" "}
                        {money(d.guide.low)}-{money(d.guide.high)} &middot;{" "}
                        {guideReach(d.guide, d.sector, d.sector?.split(" ")[0] ?? null)}
                      </p>
                      {d.guide.caveat && (
                        <p className="mt-1 text-[11px] leading-relaxed text-accent-dark">{d.guide.caveat}</p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="rounded-xl border border-line/70 p-4 text-[12.5px] text-muted">
                  No guide. Nothing in our book near this postcode.
                </p>
              )}
              {/* The old single-sector, fixed-2-bed average lived here and it
                  CONTRADICTED the table above it: the scopes query asks about
                  all sizes and got £725 for NN5 4, while this line asked about
                  2-beds only, got null, and printed "Homesearch has no average
                  for this sector" directly underneath the £725. Two figures
                  from one source disagreeing on one screen is the exact bug
                  this project keeps being bitten by. The table supersedes it. */}
            </div>
          )}

          {here === "review" && (
            /* A QUARTER FOR THE LIST, THE REST FOR THE PREVIEW. James, 11 Sep
               2026: "we've got no preview, so they can't see what it would
               look like... quarter the size of these tabs and then have a
               massive preview on the right-hand side, so as they change it,
               it will change in real time." The preview is the real deck
               renderer, scaled to the box, fed the same payload the send
               uses - so what they see is what the landlord gets. */
            <div className="grid gap-5 lg:grid-cols-[minmax(220px,1fr)_minmax(0,3fr)]">
              <div className="min-w-0">
                {(() => {
                  /* THE DECK'S REAL SLIDES, grouped by the chapters the
                     landlord sees. This list used to be eight made-up
                     "sections" whose switches and arrows reached nothing -
                     see lib/presentation-builder. Now each switch writes
                     `hidden`, and the preview beside it redraws. */
                  const all = slidesInKind(kind);
                  const shown = draftDeck ? slidesFor(draftDeck) : [];
                  const why = (id: SlideId): string | null => {
                    if (!draftDeck || slideHasContent(draftDeck, id)) return null;
                    switch (id) {
                      case "comparables":
                        return `Tick 3 of our lets on Recently let (${pickedComps.length} ticked)`;
                      case "market":
                        return "Nothing ticked on the Market step";
                      case "listings":
                        return "No properties picked on the On the market step";
                      case "material":
                        return "Nothing on record for this address";
                      case "testimonial":
                        return "No review to show yet";
                      case "valuation":
                      case "terms":
                        return "Needs the agreed rent on the appraisal";
                      default:
                        return "Nothing to show on this one";
                    }
                  };
                  const toggleSlide = (id: SlideId) =>
                    setHidden((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));
                  return (
                    <>
                      <p className="text-[12px] leading-relaxed text-muted">
                        {shown.length} slides, {pickedComps.length} comparable{pickedComps.length === 1 ? "" : "s"}.
                        Click a slide to see it. Switch one off to leave it out.
                      </p>
                      <div className="mt-2.5 space-y-3">
                        {SECTIONS.map((sec) => {
                          const inSec = all.filter((sl) => sl.section === sec.id);
                          if (!inSec.length) return null;
                          return (
                            <div key={sec.id}>
                              <p className="mb-1.5 text-[9.5px] font-bold uppercase tracking-wider text-muted">
                                {sec.label || "Opening"}
                              </p>
                              <ol className="space-y-1.5">
                                {inSec.map((sl) => {
                                  const missing = why(sl.id);
                                  const on = !missing && !(sl.removable && hidden.includes(sl.id));
                                  const at = shown.findIndex((x) => x.id === sl.id);
                                  return (
                                    /* A card per slide (James, 11 Sep 2026: "make
                                       the sections a little bit nicer"): its
                                       place in the deck, its title, and a switch.
                                       Off is faded, not hidden - the landlord will
                                       not see it, but the agent should, with the
                                       reason when there is nothing to show. */
                                    /* CLICK A SLIDE TO SEE IT (Howard, 30 Sep
                                       2026: "rather than going through the
                                       whole deck to find one slide"). The row
                                       sends the preview to that slide, and the
                                       one on screen is outlined here. A slide
                                       that is off is not in the deck, so there
                                       is nothing to jump to. */
                                    <li
                                      key={sl.id}
                                      role={at >= 0 ? "button" : undefined}
                                      tabIndex={at >= 0 ? 0 : undefined}
                                      title={at >= 0 ? "Show this slide in the preview" : undefined}
                                      onClick={() => at >= 0 && setPreviewGo({ i: at, n: Date.now() })}
                                      onKeyDown={(e) => {
                                        if (at >= 0 && (e.key === "Enter" || e.key === " ")) {
                                          e.preventDefault();
                                          setPreviewGo({ i: at, n: Date.now() });
                                        }
                                      }}
                                      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 transition-colors ${
                                        on ? "border-line/70 bg-card" : "border-dashed border-line/60 opacity-60"
                                      } ${at >= 0 ? "cursor-pointer hover:border-ink/40" : ""} ${
                                        at >= 0 && at === previewAt ? "!border-brown ring-1 ring-brown" : ""
                                      }`}
                                    >
                                      <span
                                        className={`figures flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold ${
                                          on ? "bg-brown text-page" : "bg-line/60 text-muted"
                                        }`}
                                      >
                                        {at >= 0 ? at + 1 : "-"}
                                      </span>
                                      <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[12.5px] font-semibold leading-tight">{sl.title}</span>
                                        {missing && (
                                          <span className="block text-[10.5px] leading-snug text-muted">{missing}</span>
                                        )}
                                      </span>
                                      {!sl.removable ? (
                                        <span className="shrink-0 text-[9.5px] font-bold uppercase tracking-wider text-muted">Fixed</span>
                                      ) : (
                                        <button
                                          type="button"
                                          role="switch"
                                          aria-checked={on}
                                          aria-label={`${sl.title} ${on ? "on" : "off"}`}
                                          disabled={Boolean(missing)}
                                          onClick={(e) => {
                                            /* The switch is not a request to look. */
                                            e.stopPropagation();
                                            toggleSlide(sl.id);
                                          }}
                                          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40 ${on ? "bg-[#56634a]" : "bg-line"}`}
                                        >
                                          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] ${on ? "left-[18px]" : "left-0.5"}`} />
                                        </button>
                                      )}
                                    </li>
                                  );
                                })}
                              </ol>
                            </div>
                          );
                        })}
                      </div>
                      <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
                        The order is fixed. It follows the chapters the deck lists at the start.
                      </p>
                    </>
                  );
                })()}
              </div>

              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">
                    Preview - what the landlord opens
                  </p>
                  {previewDeck && (
                    <span className="text-[11px] text-muted">
                      {slidesFor(previewDeck).length} slides &middot; scroll sideways, or use the arrows
                    </span>
                  )}
                </div>
                {previewDeck ? (
                  <DeckPreview deck={previewDeck} goTo={previewGo} onAt={setPreviewAt} />
                ) : (
                  <div className="flex aspect-[16/10] items-center justify-center rounded-2xl border border-dashed border-line text-[12.5px] text-muted">
                    Building the preview&hellip;
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {progress && (
          <BuildProgress
            phase={progress}
            updating={updatingRun}
            error={error}
            url={existing?.url ?? null}
            token={existing?.token ?? null}
            appraisalId={appraisal?.id ?? null}
            backHref={backHref ?? null}
            nextHref={nextHref ?? null}
            onEdit={() => setProgress(null)}
            onRetry={() => void create()}
          />
        )}
    </>
  );

  /* A page fills the screen and keeps its own scroll; a modal has to be
     portalled and capped. Same content either way — only the frame differs. */
  if (fullPage) {
    return (
      /* FULL BLEED. The negative margins cancel the Shell's own page padding
         (px-5 / lg:px-10 / 2xl:px-14, py-8) and a slimmer gutter is put back,
         so this screen gets the window rather than the content column.

         It is worth the trick because of what this page has to hold at once:
         a step line, a filter row, a two-up card grid and a map beside it. In
         the padded column that stack ran off the bottom, and an agent stood in
         a landlord's hallway scrolling to find the map. `overflow-hidden` and
         a fixed viewport height mean the page itself never scrolls — only the
         card column inside it does. */
      <div className="-mx-5 -my-8 flex h-[100dvh] flex-col overflow-hidden px-5 lg:-mx-10 lg:px-8 2xl:-mx-14 2xl:px-8">
        {backHref && (
          <Link href={backHref} className="mt-10 inline-block shrink-0 text-[12px] text-muted underline">
            ← Back to the appraisal
          </Link>
        )}
        {/* NO PANEL. James, 29 Aug: "where we've got the container box for
            build a presentation, I think we should just get rid of it."

            Same reasoning as the cards. As a modal the box was the thing that
            made it a modal — it had to end somewhere. As a PAGE it is a box
            drawn around the whole page, so the border traces the window and
            the tint separates the screen from nothing. It also cost the map
            its edges: a full-bleed map inside a rounded panel is a map with a
            frame around it, which is precisely the look this screen has been
            trying to lose. */}
        <div className="flex min-h-0 flex-1 flex-col">{body}</div>
      </div>
    );
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-ink/45 p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-page shadow-2xl">
        {body}
      </div>
    </div>,
    document.body
  );
}

/**
 * The deck at a laptop's proportions, scaled to whatever width the Review
 * step can give it. The renderer lays out at 1280 x 800 and is scaled with a
 * transform, so type, spacing and the slide count are exactly the landlord's;
 * only the size differs.
 *
 * Its own Back and Next, underneath (James, 19 Sep 2026: the preview was
 * "getting carved"). The deck's arrows are the landlord's and do not show in
 * an embedded deck, so the only way through was a sideways scroll. And the
 * frame grows to the slide on screen: seven slides are taller than 800, and
 * at a quarter size scrolling inside one to see its foot is nobody's idea of
 * checking it.
 */
const PREVIEW_W = 1280;
const PREVIEW_H = 800;

function DeckPreview({
  deck,
  goTo,
  onAt,
}: {
  deck: Deck;
  /** A slide picked from the list beside it. `n` changes on every click. */
  goTo?: { i: number; n: number } | null;
  /** Which slide is showing, so the list can outline it. */
  onAt?: (i: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [at, setAt] = useState(0);
  const onAtRef = useRef(onAt);
  onAtRef.current = onAt;
  useEffect(() => onAtRef.current?.(at), [at]);
  const [tall, setTall] = useState(PREVIEW_H);
  const slides = useMemo(() => slidesFor(deck), [deck]);
  const scroller = () => box.current?.querySelector<HTMLElement>("[data-index]")?.parentElement ?? null;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / PREVIEW_W);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* Which slide is showing, however it got there - these buttons, a swipe,
     or the deck's own chapter rail. */
  useEffect(() => {
    let row: HTMLElement | null = null;
    let raf = 0;
    const onScroll = () => {
      if (!row) return;
      setAt(Math.round(row.scrollLeft / Math.max(1, row.clientWidth)));
    };
    const hook = () => {
      row = scroller();
      if (!row) return void (raf = requestAnimationFrame(hook));
      row.addEventListener("scroll", onScroll, { passive: true });
    };
    hook();
    return () => {
      cancelAnimationFrame(raf);
      row?.removeEventListener("scroll", onScroll);
    };
  }, [deck]);

  /* The frame to the slide: back to 800 first, then measured, so a short
     slide after a tall one shrinks the frame again rather than keeping it. */
  useEffect(() => {
    setTall(PREVIEW_H);
    const raf = requestAnimationFrame(() => {
      const cell = scroller()?.children[at] as HTMLElement | undefined;
      if (cell) setTall(Math.max(PREVIEW_H, Math.min(cell.scrollHeight, PREVIEW_H * 2.5)));
    });
    return () => cancelAnimationFrame(raf);
  }, [at, deck]);

  const go = (i: number) => {
    const row = scroller();
    if (!row) return;
    const to = Math.max(0, Math.min(slides.length - 1, i));
    row.scrollTo({ left: to * row.clientWidth, behavior: "smooth" });
  };

  /* Straight to the slide clicked in the list. Instant rather than smooth:
     a smooth run from slide 2 to slide 19 is a slideshow nobody asked for.
     On a phone the list sits above the preview, so bring it into view too. */
  useEffect(() => {
    if (!goTo) return;
    const row = scroller();
    if (!row) return;
    const to = Math.max(0, Math.min(slides.length - 1, goTo.i));
    row.scrollTo({ left: to * row.clientWidth, behavior: "instant" as ScrollBehavior });
    setAt(to);
    const r = box.current?.getBoundingClientRect();
    if (r && (r.top < 0 || r.top > window.innerHeight - 120)) {
      box.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
    // Only a new click moves it; the deck redrawing must not jump back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goTo?.n]);

  return (
    <div>
      <div
        ref={box}
        className="relative w-full overflow-hidden rounded-2xl border border-line/70 bg-box shadow-sm transition-[height] duration-300"
        style={{ height: Math.round(tall * scale) }}
      >
        <div className="absolute left-0 top-0 w-[1280px] origin-top-left" style={{ height: tall, transform: `scale(${scale})` }}>
          <PresentDeck token="preview" deck={deck} slides={slides} embedded />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <span className="mr-1 text-[11.5px] text-muted">
          Slide {Math.min(at + 1, slides.length)} of {slides.length}
        </span>
        {([["Back", -1], ["Next", 1]] as const).map(([label, dir]) => {
          const can = dir < 0 ? at > 0 : at < slides.length - 1;
          return (
            <button
              key={label}
              type="button"
              onClick={() => go(at + dir)}
              disabled={!can}
              className="rounded-full border border-line/70 bg-white px-4 py-1.5 text-[12px] font-semibold transition-colors hover:border-ink/40 disabled:opacity-40"
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type SavedDeck = {
  token: string;
  url: string;
  builder: { comparables: string[]; listings: string[]; market: { area: string; blocks: string[] } | null; hidden: SlideId[]; rmGuide?: RmGuide | null } | null;
};

/** "Send presentation to my email" - the builder's header and the build screen both use it. */
function SendToMe({ token, appraisalId, compact = false }: { token: string; appraisalId: string | null; compact?: boolean }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [note, setNote] = useState<string | null>(null);
  async function send() {
    setState("sending");
    setNote(null);
    try {
      const r = await fetch("/api/presentations/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, appraisalId }),
      });
      const j = (await r.json()) as { ok?: boolean; to?: string; error?: string };
      if (!j.ok) throw new Error(j.error ?? "It didn't send.");
      setNote(`Sent to ${j.to}`);
      setState("sent");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "It didn't send.");
      setState("error");
    }
  }
  const label = state === "sending" ? "Sending…" : state === "sent" ? "Sent to your email" : compact ? "Send to my email" : "Send presentation to my email";
  if (compact) {
    return (
      <button
        type="button"
        onClick={() => void send()}
        disabled={state === "sending"}
        title={note ?? undefined}
        className="rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] font-semibold transition-colors hover:border-ink/40 disabled:opacity-50"
      >
        {state === "error" ? "Didn't send - try again" : label}
      </button>
    );
  }
  return (
    <div>
      <button type="button" onClick={() => void send()} disabled={state === "sending"} className={CHOICE}>
        <ChoiceIcon d="M4 6.5h16v11H4z M4.5 7l7.5 6 7.5-6" />
        <span className="min-w-0 flex-1 text-left">
          <span className="block text-[14px] font-semibold">{label}</span>
          <span className="block text-[12px] text-muted">{note ?? "Have it in your inbox for the day."}</span>
        </span>
        {state === "sending" && <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent-dark" />}
        {state === "sent" && <Tick />}
      </button>
    </div>
  );
}

const CHOICE =
  "flex w-full items-center gap-3.5 rounded-2xl border border-line/80 bg-white px-4 py-3.5 transition-[border-color,transform] hover:-translate-y-px hover:border-ink/35 disabled:opacity-60";

function ChoiceIcon({ d }: { d: string }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
      <svg viewBox="0 0 24 24" aria-hidden className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d={d} />
      </svg>
    </span>
  );
}

function Tick({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/**
 * Building the presentation, shown (James, 17 Sep 2026).
 *
 * "When they click Create Presentation, we should show a loading page ...
 * go through a few tick things ... then it will say brilliant,
 * congratulations, your presentation is built", with four things to do
 * next: view it, edit it, send it to myself, report a bug.
 *
 * The ticks are paced so each can be read, and the last one waits for the
 * save itself: nothing says built until it is. Edit presentation closes this
 * and leaves the agent in the builder with everything as they had it, and
 * from then on the button says Update presentation.
 */
const BUILD_TICKS = [
  "Gathering the comparables you picked",
  "Adding what's on the market nearby",
  "Putting every slide in the right order",
  "Checking the photos and the figures",
];

function BuildProgress({
  phase,
  updating,
  error,
  url,
  token,
  appraisalId,
  backHref,
  nextHref,
  onEdit,
  onRetry,
}: {
  phase: "building" | "done" | "error";
  updating: boolean;
  error: string | null;
  url: string | null;
  token: string | null;
  appraisalId: string | null;
  backHref: string | null;
  nextHref: string | null;
  onEdit: () => void;
  onRetry: () => void;
}) {
  const steps = [...BUILD_TICKS, updating ? "Saving your changes" : "Saving your presentation"];
  /* How many are ticked. Paced at a readable 650ms, and the last one only
     ticks when the save has come back. */
  const [ticked, setTicked] = useState(0);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (phase !== "building") return;
    setTicked(0);
    setShown(false);
    const t = window.setInterval(() => setTicked((n) => Math.min(n + 1, BUILD_TICKS.length)), 650);
    return () => window.clearInterval(t);
  }, [phase]);
  useEffect(() => {
    if (phase !== "done") return;
    /* The save may beat the ticks. Finish them first, then the good news. */
    if (ticked < steps.length) {
      const t = window.setTimeout(() => setTicked((n) => n + 1), 380);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => setShown(true), 450);
    return () => window.clearTimeout(t);
  }, [phase, ticked, steps.length]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const done = phase === "done" && shown;

  /* Built, and the deck has a next step: a beat on the good news, then on to
     it. location rather than the router, so the send screen reads the deck
     that has just been saved rather than a cached page. */
  useEffect(() => {
    if (!done || !nextHref) return;
    const t = window.setTimeout(() => window.location.assign(nextHref), 1400);
    return () => window.clearTimeout(t);
  }, [done, nextHref]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-page/85 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-label={done ? "Your presentation is built" : "Building the presentation"}>
      <style>{`
        @keyframes build-tick-in { from { transform: scale(0.2) rotate(-25deg); opacity: 0 } to { transform: none; opacity: 1 } }
        .build-tick-in { display: flex; animation: build-tick-in 360ms cubic-bezier(0.2, 0.9, 0.3, 1.4) both }
        @keyframes build-done-in { from { transform: translateY(10px); opacity: 0 } to { transform: none; opacity: 1 } }
        .build-done-in { animation: build-done-in 420ms cubic-bezier(0.2, 0.9, 0.3, 1) both }
        .build-done-in > * { animation: build-done-in 420ms cubic-bezier(0.2, 0.9, 0.3, 1) both }
        .build-done-in > :nth-child(2) { animation-delay: 60ms } .build-done-in > :nth-child(3) { animation-delay: 110ms } .build-done-in > :nth-child(4) { animation-delay: 170ms }
      `}</style>
      <div className="popout-in max-h-full w-full max-w-[520px] overflow-y-auto rounded-[28px] border border-line/70 bg-page p-6 shadow-2xl sm:p-8">
        {!done ? (
          <>
            <h2 className="hand text-[26px] leading-tight sm:text-[30px]">
              {phase === "error" ? "That Didn't Save" : updating ? "Updating the Presentation" : "Building the Presentation"}
            </h2>
            <p className="mt-1.5 text-[13px] text-muted">
              {phase === "error" ? error ?? "Something went wrong saving it. Nothing you picked has been lost." : "This only takes a moment."}
            </p>
            <ul className="mt-6 space-y-3">
              {steps.map((s, i) => {
                const isDone = i < ticked;
                const isNow = i === ticked && phase !== "error";
                return (
                  <li key={s} className="flex items-center gap-3 text-[14px]" style={{ opacity: i <= ticked ? 1 : 0.4, transition: "opacity 300ms" }}>
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-300 ${
                        isDone ? "border-accent-dark bg-accent-dark text-white" : "border-line"
                      }`}
                    >
                      {isDone ? (
                        <span className="build-tick-in">
                          <Tick size={14} />
                        </span>
                      ) : isNow ? (
                        <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-accent-dark" />
                      ) : null}
                    </span>
                    <span className={isDone ? "" : "text-muted"}>{s}</span>
                  </li>
                );
              })}
            </ul>
            {phase === "error" && (
              <div className="mt-6 flex flex-wrap gap-2">
                <button type="button" onClick={onRetry} className="rounded-full bg-accent-dark px-5 py-2.5 text-[13px] font-semibold text-white">
                  Try again
                </button>
                <button type="button" onClick={onEdit} className="rounded-full border border-line/80 px-5 py-2.5 text-[13px] font-semibold hover:border-ink/40">
                  Back to editing
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="build-done-in">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-dark text-white shadow-[0_12px_30px_-12px_rgba(0,0,0,0.35)]">
              <Tick size={26} />
            </span>
            <h2 className="hand mt-5 text-[28px] leading-tight sm:text-[32px]">
              {updating ? "Brilliant, Your Presentation Is Updated" : "Brilliant, Your Presentation Is Built"}
            </h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
              {nextHref
                ? "Taking you to send it with the terms. You check it through as they will see it, sign your half, then send."
                : updating
                  ? "The same link opens the new version, so anyone who already has it sees your changes."
                  : "Congratulations. Have a look through it, and change anything you like, as often as you like."}
            </p>
            <div className="mt-6 space-y-2.5">
              {nextHref && (
                <a href={nextHref} className={CHOICE}>
                  <ChoiceIcon d="M4 12h14 M13 6l6 6-6 6" />
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block text-[14px] font-semibold">Send it with the terms</span>
                    <span className="block text-[12px] text-muted">On its way now - press if it has not moved.</span>
                  </span>
                </a>
              )}
              {url && (
                <a href={url} target="_blank" rel="noreferrer" className={CHOICE}>
                  <ChoiceIcon d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z" />
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block text-[14px] font-semibold">View presentation</span>
                    <span className="block text-[12px] text-muted">Opens exactly as the landlord will see it.</span>
                  </span>
                </a>
              )}
              {url && (
                <a href={`${url.split("?")[0]}/print`} target="_blank" rel="noreferrer" className={CHOICE}>
                  <ChoiceIcon d="M12 3v12 M7 10l5 5 5-5 M4 19h16" />
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block text-[14px] font-semibold">Download PDF</span>
                    <span className="block text-[12px] text-muted">Every slide, one to a page, to have with you at the appointment.</span>
                  </span>
                </a>
              )}
              <button type="button" onClick={onEdit} className={CHOICE}>
                <ChoiceIcon d="M4 20h4L19 9l-4-4L4 16v4z M13.5 6.5l4 4" />
                <span className="min-w-0 flex-1 text-left">
                  <span className="block text-[14px] font-semibold">Edit presentation</span>
                  <span className="block text-[12px] text-muted">Back into the builder, with everything as you left it.</span>
                </span>
              </button>
              {token && <SendToMe token={token} appraisalId={appraisalId} />}
              <button
                type="button"
                onClick={() => {
                  onEdit();
                  window.dispatchEvent(new CustomEvent("os-help-dock", { detail: { open: true, tab: "feedback" } }));
                }}
                className={CHOICE}
              >
                <ChoiceIcon d="M12 8v5 M12 16.5v.01 M10.3 3.9L2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
                <span className="min-w-0 flex-1 text-left">
                  <span className="block text-[14px] font-semibold">Report a bug</span>
                  <span className="block text-[12px] text-muted">Something not look right? Tell us and we&apos;ll fix it.</span>
                </span>
              </button>
            </div>
            {backHref && (
              <Link href={backHref} className="mt-5 inline-block text-[12.5px] text-muted underline underline-offset-2 hover:text-ink">
                Back to the appraisal
              </Link>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
