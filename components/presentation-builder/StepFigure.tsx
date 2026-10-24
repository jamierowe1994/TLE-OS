"use client";

import type { MarketPicture, MarketPictureScope } from "@/lib/market-picture";
import type { MarketCard } from "./market";
import { Ic, Loading, TIME_TO_LET, milesText, money, pounds, readAt, type Draft, type Guide } from "./shared";
import type { Up } from "./Builder";

/**
 * 3. THE FIGURE. The asking rent from the picks (the median, rounded to £25,
 * between the 25th and 75th percentiles; rooms left out), nudged or typed;
 * whether the evidence holds up; the deposits; time to let. Then the local
 * market as six cards, four of them on to start with.
 */

export default function StepFigure({
  S,
  up,
  guide,
  go,
  weeks,
  ourDays,
  sc,
  pic,
  picErr,
  onPicRetry,
  cards,
  figureError,
  scottish,
}: {
  S: Draft;
  up: Up;
  guide: Guide | null;
  go: (k: number) => void;
  weeks: string | null;
  ourDays: { median: number; n: number } | null;
  sc: MarketPictureScope | null;
  pic: MarketPicture | null;
  picErr: string | null;
  onPicRetry: () => void;
  cards: MarketCard[];
  figureError: string | null;
  scottish: boolean;
  radius: number;
}) {
  if (!guide && !S.rmGuide) {
    return (
      <div className="pane">
        <div className="empty" style={{ padding: 50 }}>
          <h2 className="t">The figure needs comparables</h2>
          <p className="lede" style={{ margin: "6px auto 16px" }}>
            Pick three or more homes on the last step, or attach a Rightmove Best Price Guide.
          </p>
          <button type="button" className="btn primary" onClick={() => go(1)}>
            <Ic k="back" />
            Pick comparables
          </button>
        </div>
      </div>
    );
  }

  const P0 = S.picks.filter((c) => !c.room);
  const fromPicks = guide?.from === "picks";
  const rents = P0.map((c) => c.rent);
  const lo2 = Math.min(...rents, guide?.lo ?? Infinity) - 100;
  const hi2 = Math.max(...rents, guide?.hi ?? -Infinity) + 100;
  const at = (v: number) => `${(((v - lo2) / Math.max(1, hi2 - lo2)) * 100).toFixed(1)}%`;
  const strong = Boolean(guide && guide.n >= 3 && guide.let >= 2);
  const placed = P0.filter((c) => c.mi != null);
  const furthest = placed.length === P0.length && placed.length ? Math.max(...placed.map((c) => c.mi as number)) : null;

  /* A typed box, as whole pounds. The other two hold where they are. */
  function typed(which: "lo" | "ask" | "hi", raw: string) {
    const v = pounds(raw);
    up((s) => {
      const base = { ask: s.ask ?? guide?.ask ?? null, lo: s.lo ?? guide?.lo ?? null, hi: s.hi ?? guide?.hi ?? null };
      return { ...base, [which]: v };
    });
  }
  const box = (which: "lo" | "ask" | "hi", label: string, v: number | null | undefined) => (
    <label>
      {label}
      <input
        key={`${which}-${v ?? ""}`}
        className="num"
        inputMode="numeric"
        defaultValue={v != null ? money(v) : ""}
        placeholder="£"
        onBlur={(e) => {
          if ((pounds(e.target.value) ?? null) !== (v ?? null)) typed(which, e.target.value);
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
    </label>
  );

  const holding = guide ? (guide.ask * 12) / 52 : null;
  const read = pic ? readAt(pic.pulledAt) : "";
  const district = pic?.scopes.find((s) => s.level === "district") ?? null;
  const sector = pic?.scopes.find((s) => s.level === "sector") ?? null;
  const onCount = cards.filter((c) => c.ok && S.cards.includes(c.id)).length;

  return (
    <div className="pane">
      <div className="fig">
        <div className="fig-main">
          <div className="k">We&apos;d advertise at</div>
          <div className="fig-big">
            <span className="amt num">
              {guide ? money(guide.ask) : "Not set"}
              <small>pcm</small>
            </span>
            {guide && (
              <span className="nudge">
                <button type="button" aria-label="Lower" onClick={() => up({ ask: guide.ask - 25, lo: guide.lo, hi: guide.hi })}>
                  &minus;
                </button>
                <button type="button" aria-label="Higher" onClick={() => up({ ask: guide.ask + 25, lo: guide.lo, hi: guide.hi })}>
                  +
                </button>
              </span>
            )}
            {fromPicks && S.ask != null && (
              <button type="button" className="btn link" onClick={() => up({ ask: null, lo: null, hi: null })}>
                Back to the median
              </button>
            )}
          </div>
          <p className="fig-why">
            {fromPicks
              ? `The middle of your ${guide!.n} comparable${guide!.n === 1 ? "" : "s"}. ${S.ask != null || S.lo != null || S.hi != null ? "You've moved it by hand." : "Nudge it if you know something the numbers don't."}`
              : "From the Rightmove Best Price Guide. Type the low, the asking rent and the high below."}
          </p>
          {fromPicks && guide && (
            <div className="rng">
              <span className="ax" />
              <span className="band" style={{ left: at(guide.lo), width: `calc(${at(guide.hi)} - ${at(guide.lo)})` }} />
              {P0.map((c) => (
                <span key={c.key} className={`dot ${c.src === "let" ? "let" : c.src === "ours" ? "ours" : ""}`} style={{ left: at(c.rent) }} title={`${c.addr} ${money(c.rent)}`} />
              ))}
              <span className="you" style={{ left: at(guide.ask) }}>
                <span>{money(guide.ask)}</span>
                <i />
              </span>
              <span className="lab" style={{ left: at(guide.lo) }}>
                {money(guide.lo)}
              </span>
              <span className="lab" style={{ left: at(guide.hi) }}>
                {money(guide.hi)}
              </span>
            </div>
          )}
          <div className="lohi">
            {box("lo", "Low", guide?.lo ?? S.lo)}
            {box("ask", "Asking rent", guide?.ask ?? S.ask)}
            {box("hi", "High", guide?.hi ?? S.hi)}
          </div>
        </div>

        <div className="fig-side">
          <div className={`conf ${strong ? "good" : "weak"}`}>
            <Ic k={strong ? "shield" : "info"} />
            <span>
              {strong ? (
                <>
                  <b>Strong evidence.</b> {guide!.let} of your picks actually let{furthest != null ? `, all within ${milesText(furthest)} mi` : ""}.
                </>
              ) : (
                <>
                  <b>Light evidence.</b>{" "}
                  {!guide || guide.n < 3
                    ? `${guide?.n ? `Only ${guide.n} picked. ` : ""}Pick three or more homes so the range rests on more than one or two.`
                    : "Add homes that have actually let, not just advertised ones, so the figure holds up if the landlord pushes back."}
                </>
              )}
            </span>
          </div>
          {figureError && guide && (
            <div className="conf weak">
              <Ic k="info" />
              <span>{figureError}</span>
            </div>
          )}
          {!scottish && (
            <div className="row">
              <span>Holding deposit, one week</span>
              <b className="num">{holding != null ? money(holding) : "Not set"}</b>
            </div>
          )}
          <div className="row">
            <span>{scottish ? "Deposit, up to two months" : "Deposit, five weeks"}</span>
            <b className="num">{guide ? money(scottish ? guide.ask * 2 : (holding as number) * 5) : "Not set"}</b>
          </div>
          <div className="row">
            <span>A year&apos;s rent</span>
            <b className="num">{guide ? money(guide.ask * 12) : "Not set"}</b>
          </div>
          <div className="ttl">
            <span style={{ fontSize: 13.5, color: "var(--muted)" }}>Time to let</span>
            <div className="chips">
              {TIME_TO_LET.map((t) => (
                <button type="button" key={t} className={`fchip${weeks === t ? " on" : ""}`} onClick={() => up({ weeks: t })} aria-pressed={weeks === t}>
                  {t}
                </button>
              ))}
            </div>
            <span style={{ fontSize: 12, color: "var(--faint)", display: "block", marginTop: 6 }}>
              {ourDays
                ? `We let homes here in ${ourDays.median} days, the median of our last ${ourDays.n}.${S.weeks ? "" : " Picked from that until you choose."}`
                : sc?.daysAdvertised
                  ? `Advertised homes here have been up ${sc.daysAdvertised.median} days, the median.`
                  : "Pick how long it should take to let."}
            </span>
          </div>
        </div>
      </div>

      <div className="mkt-h">
        <div>
          <h2 className="t">The local market</h2>
          <p>The four most useful are on. Switch any off to leave it out of the deck.</p>
        </div>
        {district && sector && (
          <div className="seg area">
            <button type="button" className={sc?.level === "district" ? "on" : ""} onClick={() => up({ scope: "district" })}>
              {district.area} district
            </button>
            <button type="button" className={sc?.level === "sector" ? "on" : ""} onClick={() => up({ scope: "sector" })}>
              {sector.area} sector
            </button>
          </div>
        )}
      </div>

      {!pic ? (
        picErr ? (
          <div className="empty">
            {picErr} The cards stay out of the deck until the figures come.{" "}
            <button type="button" className="btn link" onClick={onPicRetry}>
              Try again
            </button>
          </div>
        ) : (
          <div className="empty">
            <Loading say="Reading the local market" />
          </div>
        )
      ) : !sc ? (
        <div className="empty">Nothing is advertised to let in this postcode district, so there&apos;s no market to show.</div>
      ) : (
        <>
          <div className="stats">
            {cards.map((c) => {
              const on = c.ok && S.cards.includes(c.id);
              return (
                <div key={c.id} className={`stat${on ? " on" : ""}`}>
                  <div className="top">
                    <span className="st-t">{c.title}</span>
                    <button
                      type="button"
                      className={`sw${on ? " on" : ""}`}
                      disabled={!c.ok}
                      aria-pressed={on}
                      aria-label={`Include ${c.title}`}
                      onClick={() => up((s) => ({ cards: s.cards.includes(c.id) ? s.cards.filter((x) => x !== c.id) : [...s.cards, c.id] }))}
                    />
                  </div>
                  {c.ok && <div className="head2">{c.head}</div>}
                  <div className="viz">{c.viz}</div>
                  {c.ok && (
                    <div className="say" title={`${c.src} · Homesearch, ${read}`}>
                      {c.say}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="foot-note">
            From the Homesearch lettings feed for {sc.area}, read {read}. Hover a card for its sample. {onCount ? `${onCount} on.` : "None on, so The Market slide is left out."}
          </p>
        </>
      )}
    </div>
  );
}
