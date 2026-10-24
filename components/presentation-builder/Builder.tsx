"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useCaseState } from "@/lib/case-state";
import SaveChip, { SaveScopeProvider, useSaveScope } from "@/components/SaveChip";
import { NO_FACTS, withAgentFacts, type PropertyFacts } from "@/lib/agent-property-facts";
import type { MaResearch } from "@/lib/ma-research";
import type { MarketPicture } from "@/lib/market-picture";
import type { PropertyHistoryRow } from "@/app/api/property-history/route";
import type { MarketAppraisal } from "@/lib/market-appraisal";
import {
  APPRAISAL_DESIGN_SLIDES,
  MAX_FIXES,
  MAX_LOVES,
  checkFigure,
  cleanNotes,
  type DesignSlideId,
  type PresentBuilderPicks,
} from "@/lib/present";
import { isScottish } from "@/lib/property-flags";
import {
  BLANK,
  Ic,
  STEPS,
  candidatesFrom,
  guideOf,
  kindOf,
  median,
  money,
  padNotes,
  quantile,
  r25,
  sameHouse,
  score,
  sectorOf,
  weeksFor,
  type Cand,
  type Draft,
  type FactKey,
} from "./shared";
import { marketCards, marketPayload, scopeFor } from "./market";
import StepHome, { FACT_ROWS, factValues } from "./StepHome";
import StepComps from "./StepComps";
import StepFigure from "./StepFigure";
import StepDeck, { type SlideRow } from "./StepDeck";

/**
 * BUILD THE PRESENTATION, IN FOUR STEPS (James, 24 Oct 2026).
 *
 * Replaces the five-step builder on an appraisal (behind the "builder" switch
 * in Admin > Switches; off, components/PresentationBuilder as before). Built
 * from his design (.design-builder/presentation-builder.html), with the real
 * data in place of its samples:
 *
 *   1 The home        what Homesearch holds (Land Registry, EPC register,
 *                     VOA) with the agent's corrections, compliance as a list
 *                     of things to ask for, the street, a three-line history.
 *   2 Comparables     the market's let agreed, our own book and what's
 *                     advertised, as one list scored on how closely each
 *                     matches, with the radius search and the price-pin map.
 *   3 The figure      the rent from the picks, the evidence check, deposits,
 *                     time to let, and the six local market cards.
 *   4 The deck        the real appraisal deck, drawn live by the server from
 *                     exactly the body Create would save (POST
 *                     /api/presentations with preview), with the slides,
 *                     the loves and the jobs.
 *
 * A tray along the bottom keeps the picks and the rent range in view from
 * step 2 on. Everything the agent does is kept as a draft on the appraisal
 * (case-state "presentation-build"), and on the deck as builder.v2, so leaving
 * and coming back opens it where it was left.
 */

/** How long the research call gets before the screen gives up and offers Try again (as the old builder). */
const RESEARCH_PATIENCE = 20_000;
const NO_MATCH = { hsId: 0, label: "" };

type Saved = { token: string; url: string; builder: PresentBuilderPicks | null };

export default function PresentationBuilderV2(props: {
  address: string;
  postcode: string;
  landlord?: string;
  refId: string;
  appraisal?: MarketAppraisal | null;
  backHref?: string;
}) {
  /* The draft, the facts and the match all report to one chip, so a save
     tells the header rather than toasting on every keystroke. */
  const scope = useSaveScope(props.refId);
  return (
    <SaveScopeProvider scope={scope}>
      <Builder {...props} chip={<SaveChip scope={scope} />} />
    </SaveScopeProvider>
  );
}

function Builder({
  address,
  postcode,
  landlord,
  refId,
  appraisal,
  backHref,
  chip,
}: {
  address: string;
  postcode: string;
  landlord?: string;
  refId: string;
  appraisal?: MarketAppraisal | null;
  backHref?: string;
  chip: React.ReactNode;
}) {
  /* ── the records this screen shares with the rest of the appraisal ── */
  const [match, setMatch, matchStatus] = useCaseState<{ hsId: number; label: string }>("property-match", refId, NO_MATCH);
  const matchReady = matchStatus !== "loading";
  const [pf, setPf] = useCaseState<PropertyFacts>("appraisal-facts", refId, NO_FACTS);
  const [draft, setDraft, draftStatus] = useCaseState<Draft>("presentation-build", refId, BLANK);

  /* ── the builder's own state, hydrated once from the draft or the deck ── */
  const [S, setS] = useState<Draft>(BLANK);
  const [hydrated, setHydrated] = useState(false);
  const up = (patch: Partial<Draft> | ((s: Draft) => Partial<Draft>)) => setS((s) => ({ ...s, ...(typeof patch === "function" ? patch(s) : patch) }));

  /* The presentation this appraisal already has, if any: saving updates it
     behind the same link (James, 17 Sep 2026). Undefined while asking. */
  const [existing, setExisting] = useState<Saved | null | undefined>(undefined);
  useEffect(() => {
    let gone = false;
    fetch(`/api/presentations?ref=${encodeURIComponent(refId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; sent?: (Saved & { kind: string })[] }) => {
        if (gone) return;
        const mine = j.ok ? (j.sent ?? []).find((s) => s.kind === "appraisal") : null;
        setExisting(mine ? { token: mine.token, url: mine.url, builder: mine.builder ?? null } : null);
      })
      .catch(() => !gone && setExisting(null));
    return () => {
      gone = true;
    };
  }, [refId]);

  useEffect(() => {
    if (hydrated || draftStatus === "loading" || existing === undefined) return;
    let next: Draft = BLANK;
    const v2 = existing?.builder?.v2 as Partial<Draft> | undefined;
    if (draft.v === 2) next = { ...BLANK, ...draft };
    else if (v2 && v2.v === 2) next = { ...BLANK, ...v2, photo: null };
    else if (existing?.builder) {
      /* Made with the five-step builder: its figure, words and guide come across. */
      const b = existing.builder;
      next = {
        ...BLANK,
        ask: b.figure?.ask ?? null,
        lo: b.figure?.low ?? null,
        hi: b.figure?.high ?? null,
        weeks: b.figure?.weeks ?? null,
        loves: padNotes(b.loves, MAX_LOVES),
        fixes: padNotes(b.fixes, MAX_FIXES),
        rmGuide: b.rmGuide ?? null,
      };
    }
    setS({ ...next, loves: padNotes(next.loves, MAX_LOVES), fixes: padNotes(next.fixes, MAX_FIXES) });
    setHydrated(true);
  }, [hydrated, draftStatus, existing, draft]);

  /* Every change after that goes to the draft (debounced by useCaseState). */
  const mirrored = useRef(false);
  useEffect(() => {
    if (!hydrated) return;
    if (!mirrored.current) {
      mirrored.current = true;
      return;
    }
    setDraft({ ...S, v: 2 });
    // setDraft is stable for the record; S is the thing being saved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [S, hydrated]);

  /* ── the research: material, comparables and the radius search ── */
  const [d, setD] = useState<MaResearch | null>(null);
  const [researchErr, setResearchErr] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
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

  const material = useMemo(() => withAgentFacts(d?.material ?? null, pf), [d, pf]);
  const facts = useMemo(() => factValues(material, pf, S.facts), [material, pf, S.facts]);
  const beds = facts.beds != null && /^\d+$/.test(facts.beds) ? Number(facts.beds) : null;
  const type = facts.type;
  /* The beds the search is asked for. Remembered on the draft, so a home
     whose size the lookup knows is searched at that size from the first call. */
  const qBeds = S.bedsOnly ? (beds ?? S.seenBeds) : null;
  useEffect(() => {
    if (beds != null && beds !== S.seenBeds) up({ seenBeds: beds });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beds]);

  /** One research call at a time, aborting whichever was out (as the old builder's askResearch). */
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

  const [researchTry, setResearchTry] = useState(0);
  const lastRadius = useRef<number | null>(null);
  useEffect(() => {
    if (!hydrated || !matchReady) return;
    const q = new URLSearchParams({ address, postcode });
    if (match.hsId) {
      q.set("hsId", String(match.hsId));
      q.set("hsLabel", match.label);
    }
    q.set("radius", String(S.radius));
    if (qBeds) q.set("beds", String(qBeds));
    /* A dragged radius waits for the agent to stop: one search, not one per notch. */
    const wait = lastRadius.current != null && lastRadius.current !== S.radius ? 450 : 0;
    lastRadius.current = S.radius;
    const mine = ++reqSeq.current;
    researchCtl.current?.abort();
    window.clearTimeout(filterTimer.current);
    setLooking(true);
    setResearchErr(null);
    filterTimer.current = window.setTimeout(() => {
      void askResearch(q).then((j) => {
        if (mine !== reqSeq.current || !j) return;
        setLooking(false);
        if ("error" in j) setResearchErr(j.error);
        else setD(j);
      });
    }, wait);
    // askResearch reads only refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, matchReady, match.hsId, address, postcode, S.radius, qBeds, researchTry]);

  /* The galleries, after the cards are up (as the old builder: /api/ma-photos, aborted when the list changes). */
  const [photos, setPhotos] = useState<Record<string, { photos: string[]; advert: string | null }>>({});
  const photoIds = (d?.onMarketNearby ?? [])
    .map((l) => l.listingId)
    .filter((n): n is number => typeof n === "number" && !photos[String(n)])
    .join(",");
  useEffect(() => {
    if (!photoIds) return;
    const ctl = new AbortController();
    fetch(`/api/ma-photos?ids=${photoIds}`, { signal: ctl.signal })
      .then((r) => r.json())
      .then((j: { photos?: Record<string, string[]>; adverts?: Record<string, string | null> }) => {
        if (!j.photos) return;
        setPhotos((prev) => {
          const next = { ...prev };
          for (const id of photoIds.split(",")) next[id] = { photos: j.photos?.[id] ?? [], advert: j.adverts?.[id] ?? null };
          return next;
        });
      })
      /* A gallery that doesn't come costs a photo, never a home. */
      .catch(() => {});
    return () => ctl.abort();
  }, [photoIds]);

  /* ── the market, read once on arrival: step 1's story and step 3's cards ── */
  const [pic, setPic] = useState<MarketPicture | null>(null);
  const [picErr, setPicErr] = useState<string | null>(null);
  const [picTry, setPicTry] = useState(0);
  useEffect(() => {
    const ctl = new AbortController();
    setPicErr(null);
    fetch(`/api/market-picture?postcode=${encodeURIComponent(postcode)}`, { signal: ctl.signal })
      .then((r) => r.json())
      .then((j: MarketPicture & { error?: string }) => {
        if (j.error) setPicErr(j.error);
        else setPic(j);
      })
      .catch(() => !ctl.signal.aborted && setPicErr("The market figures could not be reached."));
    return () => ctl.abort();
  }, [postcode, picTry]);

  /* ── our own history of this address (REX, via /api/property-history) ── */
  const [history, setHistory] = useState<PropertyHistoryRow[] | null | undefined>(undefined);
  useEffect(() => {
    let gone = false;
    fetch(`/api/property-history?${new URLSearchParams({ address, postcode })}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { ok?: boolean; listings?: PropertyHistoryRow[] } | null) => !gone && setHistory(j?.ok && Array.isArray(j.listings) ? j.listings : null))
      .catch(() => !gone && setHistory(null));
    return () => {
      gone = true;
    };
  }, [address, postcode]);

  /* ── derived ── */
  const cands = useMemo(() => (d ? candidatesFrom(d, address, photos) : []), [d, address, photos]);
  const scoreOf = (c: Cand) => score(c, beds, type);
  const guide = guideOf(S);
  const sc = scopeFor(pic, S.scope);
  const ourDays = pic?.ourLetSpeed ?? null;
  const weeks = S.weeks ?? (ourDays ? weeksFor(ourDays.median) : null);
  const cards = sc ? marketCards(sc, beds, kindOf(type), guide?.ask ?? null, ourDays) : [];
  const scottish = isScottish(postcode, address);
  const live = d?.onMarketNearby.find((l) => sameHouse(address, l.address)) ?? null;
  /* The deck's photo of the home: the agent's own, else one from its advert or our book. */
  const foundPhoto = live?.image ?? history?.find((h) => h.image)?.image ?? history?.flatMap((h) => h.images)[0] ?? null;
  const photo = S.photo ?? foundPhoto;
  const area = d?.sector ?? sectorOf(postcode)?.sector ?? postcode;

  const figureCheck = checkFigure(guide ? { ask: guide.ask, low: guide.lo, high: guide.hi, weeks: weeks ?? "" } : null);
  const nonRoom = S.picks.filter((c) => !c.room);
  const cardsOn = cards.filter((c) => c.ok && S.cards.includes(c.id));

  /* The twelve slides, with what each still needs and where that is fixed. */
  const slides: SlideRow[] = APPRAISAL_DESIGN_SLIDES.map((sl) => {
    let blk: string | null = null;
    if (sl.id === "market") blk = !pic ? (picErr ? "The market figures didn't load." : "The market figures are still loading.") : !sc ? "Nothing advertised here to show." : cardsOn.length ? null : sl.needs!.why;
    if (sl.id === "comps") blk = (nonRoom.length >= 3 || S.rmGuide) && figureCheck.figure ? null : sl.needs!.why;
    if (sl.id === "figure") blk = figureCheck.figure ? null : sl.needs!.why;
    const step = sl.needs ? ({ home: 0, comparables: 1, figure: 2 } as const)[sl.needs.step] : null;
    return { id: sl.id, title: sl.title, fixed: sl.fixed, blk, fix: step, on: sl.fixed || (!blk && !S.off.includes(sl.id)) };
  });
  const shownSlides = slides.filter((s) => s.on);
  const startAt = Math.max(0, shownSlides.findIndex((s) => s.id === S.cur));

  /* ── the deck, as the server will receive it: the preview and Create send the same ── */
  const body = useMemo(() => {
    const byMatch = [...nonRoom].sort((a, b) => scoreOf(b) - scoreOf(a));
    const rents = byMatch.map((c) => c.rent);
    const gallery = (c: Cand) => (c.listingId ? photos[String(c.listingId)]?.photos ?? c.photos : c.photos);
    const sqft = /([\d,]+)\s*sq ?ft/i.exec(facts.size ?? "")?.[1];
    const epc = /^[A-G]\b/i.exec((material?.compliance.epcRating ?? "").trim())?.[0]?.toUpperCase() ?? null;
    const letN = byMatch.filter((c) => c.actuallyLet).length;
    return {
      kind: "appraisal" as const,
      ref: refId,
      recipientName: landlord ?? "",
      address,
      postcode,
      property: {
        beds,
        baths: facts.baths != null && /^\d+$/.test(facts.baths) ? Number(facts.baths) : null,
        propertyType: type,
        epc,
        image: photo,
        sqft: sqft ? Number(sqft.replace(/,/g, "")) : null,
      },
      /* The facts as they stand on The home, edits included, in the labels the deck reads. */
      material: FACT_ROWS.map((f) => ({ label: f.label === "Council tax" ? "Council tax band" : f.label, value: facts[f.key] ?? "" }))
        .concat(epc ? [{ label: "EPC rating", value: epc }] : [])
        .filter((r) => r.value.trim()),
      comparables: rents.length
        ? {
            guideLow: r25(quantile(rents, 0.25) as number),
            guideMid: r25(median(rents) as number),
            guideHigh: r25(quantile(rents, 0.75) as number),
            basedOn: rents.length,
            rows: byMatch.map((c) => ({
              name: c.addr,
              locality: c.pc,
              rent: c.rentText,
              days: c.days,
              letAgreed: c.actuallyLet,
              beds: c.beds,
              type: c.type,
              image: c.image,
              photos: gallery(c),
            })),
            caveat: letN < 2 ? "Most of these are asking rents, not agreed ones." : null,
          }
        : null,
      /* What was picked off the market, with its gallery, as the old builder sent it. */
      listings: byMatch
        .filter((c) => c.src !== "ours")
        .map((c) => ({
          address: c.addr,
          locality: c.pc,
          rent: c.rentText,
          beds: c.beds,
          type: c.type,
          image: c.image,
          photos: gallery(c),
          agent: c.agent,
          advert: c.advert,
          status: c.src === "let" ? ("let agreed" as const) : ("on market" as const),
          days: c.days,
          ours: false,
        })),
      rmGuide: S.rmGuide,
      market: marketPayload(pic, sc, cards, S.cards, beds),
      figure: figureCheck.figure,
      loves: cleanNotes(S.loves, MAX_LOVES),
      fixes: cleanNotes(S.fixes, MAX_FIXES),
      skip: slides.filter((s) => !s.on).map((s) => s.id),
    };
    // Everything it reads is listed; scoreOf reads beds and type.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [S, facts, material, photo, photos, pic, sc, beds, type, refId, landlord, address, postcode, figureCheck.figure?.ask, figureCheck.figure?.low, figureCheck.figure?.high, figureCheck.figure?.weeks, slides.map((s) => s.on).join()]);

  /* ── moving about ── */
  function go(k: number) {
    const step = Math.max(0, Math.min(3, k));
    up((s) => ({ step, max: Math.max(s.max, step), cur: step === 3 && !slides.find((x) => x.id === s.cur && x.on) ? "cover" : s.cur }));
    window.scrollTo({ top: 0 });
  }
  function togglePick(c: Cand) {
    up((s) => ({ picks: s.picks.some((p) => p.key === c.key) ? s.picks.filter((p) => p.key !== c.key) : [...s.picks, c], ask: null, lo: null, hi: null }));
  }
  function setFact(k: FactKey, raw: string) {
    const v = raw.trim();
    if (k === "type") return setPf({ ...pf, type: v || null });
    if (k === "beds" || k === "baths") {
      const n = Number(v.replace(/[^\d]/g, ""));
      return setPf({ ...pf, [k]: v && Number.isFinite(n) ? n : null });
    }
    up((s) => {
      const f = { ...s.facts };
      if (v) f[k] = v;
      else delete f[k];
      return { facts: f };
    });
  }

  /* ── Create presentation ── */
  const [made, setMade] = useState<null | "saving" | "done" | { error: string }>(null);
  async function create() {
    if (figureCheck.error && guide) {
      go(2);
      return;
    }
    setMade("saving");
    const builder: PresentBuilderPicks = {
      comparables: S.picks.filter((c) => c.key.startsWith("oc:")).map((c) => c.key.slice(3)),
      listings: S.picks.filter((c) => c.key.startsWith("hs:")).map((c) => c.key),
      market: body.market ? { area: body.market.area, blocks: body.market.blocks ?? [] } : null,
      hidden: [],
      rmGuide: S.rmGuide,
      figure: figureCheck.figure,
      loves: body.loves,
      fixes: body.fixes,
      v2: { ...S, v: 2, photo: null } as unknown as Record<string, unknown>,
    };
    try {
      const res = await fetch("/api/presentations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, builder, token: existing?.token }),
      });
      const j = (await res.json().catch(() => null)) as { ok?: boolean; url?: string; token?: string; error?: string } | null;
      if (j?.ok && j.url && j.token) {
        setExisting({ token: j.token, url: j.url, builder });
        setMade("done");
      } else setMade({ error: j?.error ?? "Couldn't save the presentation." });
    } catch (e) {
      setMade({ error: (e as Error).message || "Couldn't save the presentation." });
    }
  }
  const fullHref = existing ? `/present/${existing.token}/deck` : null;

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && made && made !== "saving" && setMade(null);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [made]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const street = address.split(",")[0];
  const first = (landlord ?? "").trim().split(/\s+/)[0] || "the landlord";
  const n = S.picks.length;

  if (!hydrated) {
    return (
      <div className="pbx">
        <div className="body">
          <p className="lede">Opening the builder&hellip;</p>
        </div>
      </div>
    );
  }

  const step = S.step;
  return (
    <div className="pbx">
      <header className="head">
        <div className="head-in">
          <div>
            {backHref ? (
              <Link href={backHref} className="crumb">
                &larr; Back to the appraisal
              </Link>
            ) : null}
            <h1>
              {street} <span>presentation</span>
            </h1>
          </div>
          <div className="acts">
            <span className="chip-slot">{chip}</span>
            {step > 0 && (
              <button type="button" className="btn" onClick={() => go(step - 1)}>
                <Ic k="back" />
                Back
              </button>
            )}
            {step < 3 ? (
              <button type="button" className="btn primary" onClick={() => go(step + 1)}>
                Next: {STEPS[step + 1].toLowerCase()} <Ic k="arrow" />
              </button>
            ) : (
              <button type="button" className="btn primary" onClick={() => void create()} disabled={made === "saving"}>
                <Ic k="spark" />
                {existing ? "Update presentation" : "Create presentation"}
              </button>
            )}
          </div>
          <nav className="steps" aria-label="Steps">
            {STEPS.map((s, k) => (
              <button type="button" key={s} onClick={() => go(k)} className={k === step ? "on" : k < step || k <= S.max ? "done" : ""} aria-current={k === step ? "step" : undefined}>
                <i>{k < step ? <Ic k="check" w={3} /> : k + 1}</i>
                <b>{s}</b>
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div className="body">
        {step === 0 && (
          <StepHome
            address={address}
            postcode={postcode}
            d={d}
            failed={researchErr}
            onRetry={() => setResearchTry((t) => t + 1)}
            material={material}
            pf={pf}
            facts={facts}
            ownFacts={S.facts}
            setFact={setFact}
            ignoreLookup={pf.ignoreLookup}
            match={match}
            setMatch={setMatch}
            busy={looking}
            scottish={scottish}
            photo={photo}
            ownPhoto={Boolean(S.photo)}
            setPhoto={(p) => up({ photo: p })}
            history={history}
            live={live}
            area={area}
            sc={sc}
          />
        )}
        {step === 1 && (
          <StepComps
            S={S}
            up={up}
            d={d}
            looking={looking}
            failed={researchErr}
            onRetry={() => setResearchTry((t) => t + 1)}
            cands={cands}
            scoreOf={scoreOf}
            beds={beds}
            togglePick={togglePick}
            refId={refId}
            street={street}
          />
        )}
        {step === 2 && (
          <StepFigure
            S={S}
            up={up}
            guide={guide}
            go={go}
            weeks={weeks}
            ourDays={ourDays}
            sc={sc}
            pic={pic}
            picErr={picErr}
            onPicRetry={() => setPicTry((t) => t + 1)}
            cards={cards}
            figureError={figureCheck.error}
            scottish={scottish}
            radius={S.radius}
          />
        )}
        {step === 3 && (
          <StepDeck
            S={S}
            up={up}
            go={go}
            slides={slides}
            body={body}
            startAt={startAt}
            first={first}
            fullHref={fullHref}
            facts={facts}
            material={material}
            scottish={scottish}
          />
        )}
      </div>

      {/* THE TRAY: the picks and the live rent range, from Comparables on. */}
      {step > 0 && (
        <div className="tray">
          <div className="tray-in">
            <div className="cnt">
              <b className="num">{n}</b>
              <span>
                comparables
                <br />
                {nonRoom.length >= 3 ? "picked" : `${3 - nonRoom.length} more for a rent guide`}
              </span>
            </div>
            <div className="picks">
              {n ? (
                S.picks.map((c) => (
                  <span className="pc" key={c.key}>
                    {c.addr.split(",")[0]} <b>{money(c.rent)}</b>
                    <button type="button" onClick={() => togglePick(c)} aria-label={`Remove ${c.addr}`}>
                      <Ic k="x" w={2.4} />
                    </button>
                  </span>
                ))
              ) : (
                <span className="hint">{S.rmGuide ? "Using the Rightmove Best Price Guide for the rent." : "Tap a home or a price on the map to add it."}</span>
              )}
            </div>
            <div className="trange">
              {guide ? (
                <>
                  <small>{guide.from === "picks" ? "Rent guide from your picks" : "Rent guide, as typed"}</small>
                  <b className="num">
                    {money(guide.lo)} <span>to</span> {money(guide.hi)}
                  </b>
                </>
              ) : (
                <>
                  <small>Rent guide</small>
                  <b style={{ color: "var(--faint)" }}>Not yet</b>
                </>
              )}
            </div>
            {step === 1 ? (
              <button type="button" className={`btn ${nonRoom.length >= 3 ? "primary" : ""}`} onClick={() => go(2)}>
                {nonRoom.length >= 3 ? "Set the figure" : "Skip for now"} <Ic k="arrow" />
              </button>
            ) : (
              <span />
            )}
          </div>
        </div>
      )}

      {mounted &&
        made &&
        createPortal(
          <div className="pbx pbx-portal">
            <div className="made on" role="dialog" aria-modal="true" aria-label={made === "done" ? "Presentation ready" : "Saving the presentation"}>
              <div className="made-in">
                {made === "saving" ? (
                  <>
                    <div className="stack">
                      <i />
                      <i />
                      <i>{guide ? money(guide.ask) : ""}</i>
                    </div>
                    <h3>{existing ? "Updating the presentation" : "Making the presentation"}</h3>
                    <p>This only takes a moment.</p>
                  </>
                ) : made === "done" ? (
                  <>
                    <div className="stack">
                      <i />
                      <i />
                      <i>{figureCheck.figure ? money(figureCheck.figure.ask) : <Ic k="check" w={2.4} />}</i>
                    </div>
                    <h3>Presentation ready.</h3>
                    <p>
                      {shownSlides.length} slides for {landlord?.trim() || "the landlord"}, saved to the appraisal&apos;s Presentation tab. Show it at the visit, or send it with the terms.
                    </p>
                    <div className="made-acts">
                      <button type="button" className="btn" onClick={() => setMade(null)}>
                        Keep editing
                      </button>
                      {fullHref && (
                        <a className="btn primary" href={fullHref} target="_blank" rel="noreferrer">
                          Open it full screen <Ic k="arrow" />
                        </a>
                      )}
                    </div>
                    {backHref && (
                      <p>
                        <Link href={backHref} className="btn link">
                          Back to the appraisal
                        </Link>
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <h3>That didn&apos;t save.</h3>
                    <p>{made.error} Nothing you picked has been lost.</p>
                    <div className="made-acts">
                      <button type="button" className="btn" onClick={() => setMade(null)}>
                        Back to editing
                      </button>
                      <button type="button" className="btn primary" onClick={() => void create()}>
                        Try again
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export type Up = (patch: Partial<Draft> | ((s: Draft) => Partial<Draft>)) => void;
export type { DesignSlideId };
