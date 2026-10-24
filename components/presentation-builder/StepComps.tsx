"use client";

import { useMemo, useState } from "react";
import MarketMap from "@/components/MarketMap";
import RmGuidePanel from "@/components/RmGuidePanel";
import type { MaResearch, MarketListing } from "@/lib/ma-research";
import { Ic, Loading, furtherOut, isClose, matchWord, milesText, money, type Cand, type Draft, type Src } from "./shared";
import type { Up } from "./Builder";

/**
 * 2. COMPARABLES. One list, grouped: let recently (the best evidence), ours,
 * and advertised now, each sorted by how closely it matches. The radius is the
 * real search (Homesearch's box, asked again when it moves) and then a true
 * circle on the distances; ours are shown wherever they are, flagged when
 * they're further out. The map has a price pin for each one it can place:
 * hover a card and its pin lights, tap either to pick it.
 */

type Pin = MarketListing & { _k: string; _t: "let" | "ours" | null };

const GROUPS: { src: Src; title: string; why: string }[] = [
  { src: "let", title: "Let recently", why: "The best evidence: what tenants actually agreed to pay" },
  { src: "ours", title: "Ours", why: "Let by us, so you can talk about them first-hand" },
  { src: "adv", title: "Advertised now", why: "The competition the landlord will see on Rightmove" },
];

export default function StepComps({
  S,
  up,
  d,
  looking,
  failed,
  onRetry,
  cands,
  scoreOf,
  beds,
  togglePick,
  refId,
  street,
}: {
  S: Draft;
  up: Up;
  d: MaResearch | null;
  looking: boolean;
  failed: string | null;
  onRetry: () => void;
  cands: Cand[];
  scoreOf: (c: Cand) => number;
  beds: number | null;
  togglePick: (c: Cand) => void;
  refId: string;
  street: string;
}) {
  const [hl, setHl] = useState<string | null>(null);
  const picked = new Set(S.picks.map((p) => p.key));
  const bedsOnly = S.bedsOnly && beds != null;

  /* What passes the radius and the beds, whatever the source tab. Ours pass the
     radius always (flagged instead); a source that doesn't record beds passes
     "same beds only" and says so on the card. */
  const passes = (c: Cand) => (c.src === "ours" || c.mi == null || c.mi <= S.radius) && (!bedsOnly || c.beds == null || c.beds === beds);
  const inView = cands.filter(passes);
  const count = (s: Src) => inView.filter((c) => c.src === s).length;
  const all = inView.filter((c) => S.src === "all" || c.src === S.src).sort((a, b) => scoreOf(b) - scoreOf(a));

  /* The pins: everything shown that has a place and sits inside the ring. */
  const pins = useMemo<Pin[]>(
    () =>
      all
        .filter((c) => c.lat != null && c.lon != null && (c.mi == null || c.mi <= S.radius))
        .map((c) => ({
          _k: c.key,
          _t: c.src === "let" ? "let" : c.src === "ours" ? "ours" : null,
          address: c.addr,
          postcode: c.pc,
          beds: c.beds,
          type: c.type,
          rent: c.rent,
          image: c.image,
          photos: c.photos,
          advert: c.advert,
          status: c.src === "adv" ? "on market" : "let agreed",
          listingId: c.listingId,
          listedOn: null,
          daysListed: c.days,
          agent: c.agent,
          reducedAt: null,
          lat: c.lat,
          lon: c.lon,
        })),
    // The list only changes when its keys or the ring do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all.map((c) => c.key).join(), S.radius]
  );
  const offMap = all.filter((c) => c.src === "ours" && !pins.some((p) => p._k === c.key)).length;

  function card(c: Cand) {
    const s = scoreOf(c);
    const on = picked.has(c.key);
    const far = furtherOut(c, S.radius);
    const where = c.mi != null ? `${milesText(c.mi)} mi` : c.near === "sector" ? "same sector" : c.near === "district" ? "same district" : "further out";
    const when = c.days == null ? null : c.daysAre === "up" ? `${c.days} days up` : c.daysAre === "live" ? "letting now" : `let in ${c.days} days`;
    const what = [c.beds != null ? `${c.beds} bed` : "beds not recorded", c.type ? c.type.toLowerCase() : null].filter(Boolean).join(" ");
    return (
      <button
        type="button"
        key={c.key}
        className={`card${on ? " picked" : ""}${hl === c.key ? " hl" : ""}`}
        onClick={() => togglePick(c)}
        onMouseEnter={() => setHl(c.key)}
        onMouseLeave={() => setHl((h) => (h === c.key ? null : h))}
        aria-pressed={on}
      >
        <span className="th">
          {c.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.image} alt="" loading="lazy" />
          ) : (
            <span className="th-none">
              <Ic k="home" />
            </span>
          )}
        </span>
        <span>
          <span className="r">
            <b className="num">{money(c.rent)}</b>
            <span>
              {c.rentText.includes("pw") ? `pcm, from ${c.rentText}` : "pcm"}
              {c.reduced ? " · reduced" : ""}
            </span>
          </span>
          <span className="a">
            {isClose(s) && <i className="cm" title={matchWord(s)} />}
            {c.addr}
          </span>
          <span className="m" style={{ display: "block" }}>
            {[what, where, when, c.agent].filter(Boolean).join(" · ")}
            {far && <em className="far"> · further out</em>}
          </span>
          {c.src === "ours" && <span className="m st-ours">{c.status}</span>}
        </span>
        <span className="add">{on ? <Ic k="check" w={2.6} /> : <Ic k="plus" w={2} />}</span>
      </button>
    );
  }

  const groups = S.src === "all" ? GROUPS.map((g) => ({ ...g, rows: all.filter((c) => c.src === g.src) })) : [{ src: S.src, title: "", why: "", rows: all }];

  return (
    <div className="pane">
      <div className="cbar">
        <div className="seg" role="tablist" aria-label="Source">
          {(
            [
              ["all", "All", null],
              ["let", "Let recently", count("let")],
              ["ours", "Ours", count("ours")],
              ["adv", "Advertised now", count("adv")],
            ] as const
          ).map(([k, label, n]) => (
            <button type="button" key={k} className={S.src === k ? "on" : ""} onClick={() => up({ src: k })} aria-pressed={S.src === k}>
              {label}
              {n != null && d ? <em>{n}</em> : null}
            </button>
          ))}
        </div>
        {beds != null && (
          <button type="button" className={`fchip${S.bedsOnly ? " on" : ""}`} onClick={() => up({ bedsOnly: !S.bedsOnly })} aria-pressed={S.bedsOnly}>
            {beds} bed only
          </button>
        )}
        <label className="rad">
          Within{" "}
          <input
            type="range"
            min={0.25}
            max={2}
            step={0.25}
            value={S.radius}
            onChange={(e) => up({ radius: Number(e.target.value) })}
            aria-label="Search radius in miles"
          />
          <b className="num" style={{ color: "var(--ink)", fontWeight: 500 }}>
            {S.radius} mi
          </b>
        </label>
        {looking && d && <Loading say="Looking" />}
        {failed && d && !looking && (
          <button type="button" className="btn link" onClick={onRetry} title={failed}>
            Didn&apos;t refresh. Try again
          </button>
        )}
        <span className="sp" />
        <button
          type="button"
          className="btn link"
          disabled={!d}
          onClick={() => {
            /* The three best matches on screen, rooms left out, added to whatever is picked. */
            const best = all.filter((c) => !c.room).slice(0, 3);
            up((s) => ({ picks: [...s.picks, ...best.filter((c) => !s.picks.some((p) => p.key === c.key))], ask: null, lo: null, hi: null }));
          }}
        >
          Pick the 3 closest for me
        </button>
      </div>

      <div className="cgrid">
        <div className="clist">
          {!d ? (
            failed ? (
              <div className="empty">
                {failed}{" "}
                <button type="button" className="btn link" onClick={onRetry}>
                  Try again
                </button>
              </div>
            ) : (
              <div className="empty">
                <Loading say={`Finding homes near ${street}`} />
              </div>
            )
          ) : all.length ? (
            groups.map((g) =>
              g.rows.length || !g.title ? (
                <div key={g.src} className="cgroup-w">
                  {g.title && (
                    <div className="cgroup" title={g.why}>
                      <b>{g.title}</b>
                      <span>{g.rows.length}</span>
                    </div>
                  )}
                  {g.rows.map(card)}
                </div>
              ) : g.src === "ours" ? (
                <div className="cgroup" key={g.src}>
                  <b>Ours</b>
                  <span>None in our book near here</span>
                </div>
              ) : null
            )
          ) : (
            <div className="empty">
              Nothing matches. Try a wider radius{bedsOnly ? `, or turn off “${beds} bed only”` : ""}.
            </div>
          )}
          <div className="rmg2">
            <RmGuidePanel refId={refId} value={S.rmGuide} onChange={(g) => up({ rmGuide: g })} />
          </div>
        </div>

        <div className="mapw">
          <div className="map">
            <MarketMap
              look="builder"
              listings={pins}
              centre={d?.subjectPoint ?? null}
              selected={S.picks.map((p) => p.key)}
              radiusMiles={S.radius}
              keyFor={(l) => (l as Pin)._k}
              tone={(l) => (l as Pin)._t}
              highlight={hl}
              onHover={setHl}
              onSelect={(k) => {
                const c = all.find((x) => x.key === k);
                if (c) togglePick(c);
              }}
            />
            {offMap > 0 && (
              <span className="note show">
                {offMap} of ours {offMap === 1 ? "has" : "have"} no map position or {offMap === 1 ? "is" : "are"} further out, so {offMap === 1 ? "it's" : "they're"} only in the list
              </span>
            )}
            <div className="legend">
              <span>
                <i style={{ background: "#fff" }} />
                Advertised
              </span>
              <span>
                <i style={{ background: "#fdf3ee" }} />
                Let agreed
              </span>
              <span>
                <i style={{ background: "var(--ink)" }} />
                Ours
              </span>
              <span>
                <i style={{ background: "var(--coral)" }} />
                Picked
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
