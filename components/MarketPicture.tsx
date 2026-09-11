"use client";

import { useEffect, useRef, useState } from "react";
import type { MarketPicture, MarketPictureScope, Sampled } from "@/lib/market-picture";

/**
 * The local lettings market, as an agent shows it to a landlord.
 *
 * ── WHAT THIS REPLACED, AND WHY ───────────────────────────────────────────
 *
 * The Market step used to be one five-column table of Homesearch area
 * statistics. It was true and it was thin: an average, a stock count and a
 * supply figure, with nothing about pace, size, mix or who the competition is.
 * A landlord asking "what is happening round here" got three numbers.
 *
 * Everything here is derived from the listings themselves rather than from a
 * statistics endpoint, because `area_statistics/lettings/` has exactly three
 * members and none of them is a time or a distribution. See lib/market-picture
 * for the measurement, and for the sales-contaminated endpoint that looks like
 * a shortcut and is not.
 *
 * ── THE TWO RULES THIS SCREEN OBEYS ───────────────────────────────────────
 *
 * 1. **A thin sample is labelled, never hidden.** Every median carries its `n`.
 *    NN5 4 has three 4-beds; drawn as a bar it looks exactly as solid as the
 *    forty-two 2-beds beside it, so the count is always on the page.
 * 2. **Absent is not zero.** A scope with nothing in it is dropped upstream, a
 *    failed fetch renders the error, and no chart is drawn from an empty set.
 *    A confident zero is the failure this codebase has shipped three times.
 */

const money = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;

/** Blocks the agent can push onto the landlord's slide. */
export const MARKET_BLOCKS = [
  { id: "pace", label: "How fast it moves" },
  { id: "bands", label: "How long stock sits" },
  { id: "rent", label: "Asking rent by size" },
  { id: "mix", label: "What is competing" },
  { id: "agents", label: "Who is letting it" },
] as const;

export type MarketBlockId = (typeof MARKET_BLOCKS)[number]["id"];

export interface MarketSelection {
  /** Which scope's figures travel — the area string, e.g. "NN5 4". */
  area: string;
  blocks: MarketBlockId[];
}

/* ── little instruments ───────────────────────────────────────────────────── */

/**
 * A horizontal bar row. Horizontal rather than vertical on purpose: the labels
 * here are words ("O'Riordan Bond", "29-84 days") and vertical columns turn
 * those into rotated text an agent has to tilt their head to read.
 */
function Bar({
  label,
  n,
  max,
  note,
  strong,
  wide,
}: {
  label: string;
  n: number;
  max: number;
  note?: string;
  strong?: boolean;
  /** Agency names are long and varied — "Lomond Investment Management" against
   *  "haart". At the band width they all truncate to porridge, and an agent
   *  cannot read out a competitor called "Northwood N…". */
  wide?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`${wide ? "w-[150px]" : "w-[92px]"} shrink-0 truncate text-[11.5px] ${strong ? "font-semibold" : "text-muted"}`}
        title={label}
      >
        {label}
      </span>
      <div className="relative h-5 flex-1 overflow-hidden rounded-md bg-box">
        <div
          className="h-full rounded-md transition-[width] duration-500"
          style={{
            /* A real zero must still be visibly zero, so it gets no bar at all
               rather than a minimum stub that reads as "a few". */
            width: max > 0 && n > 0 ? `${Math.max((n / max) * 100, 4)}%` : "0%",
            backgroundColor: strong ? "var(--brown)" : "var(--accent)",
          }}
        />
      </div>
      <span className="figures w-[34px] shrink-0 text-right text-[12px]">{n}</span>
      {note && <span className="w-[86px] shrink-0 text-right text-[10.5px] text-muted">{note}</span>}
    </div>
  );
}

/** A headline figure with its unit and a line of context beneath. */
/* A label ABOVE the figure. James, 11 Sep 2026: "you can't really tell what
   you're looking at" - the number was first and the explanation was a line
   of small grey under it, so three figures read as three numbers. Now each
   says what it is before it says how much. */
function Big({ label, value, unit, note }: { label: string; value: string; unit?: string; note: string }) {
  return (
    <div className="rounded-xl border border-line/70 bg-box/40 p-4">
      <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1.5 flex items-baseline gap-1.5">
        <span className="figures text-[28px] leading-none">{value}</span>
        {unit && <span className="text-[12px] text-muted">{unit}</span>}
      </p>
      <p className="mt-2 text-[11.5px] leading-snug text-muted">{note}</p>
    </div>
  );
}

/* A ring, for the two questions that are shares of a whole - what is
   competing and who is letting it. Bars said "how many"; a ring says "how
   much of it", which is the question a landlord is actually asking. Drawn
   by hand in SVG so it takes the palette and needs no library. */
const RING = ["var(--brown)", "var(--accent)", "var(--sage)", "#e7c9c4", "#d6d9cd", "#c9bdb8"];
function Donut({
  parts,
  centre,
  sub,
}: {
  parts: { label: string; n: number; strong?: boolean }[];
  centre: string;
  sub: string;
}) {
  const total = parts.reduce((a, b) => a + b.n, 0);
  const r = 40, c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg viewBox="0 0 100 100" className="h-[124px] w-[124px] shrink-0" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--line)" strokeWidth="14" />
        {total > 0 &&
          parts.map((p, i) => {
            const len = (p.n / total) * c;
            const el = (
              <circle
                key={p.label}
                cx="50" cy="50" r={r} fill="none"
                stroke={RING[i % RING.length]}
                strokeWidth="14"
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-acc}
                transform="rotate(-90 50 50)"
                className="transition-[stroke-dasharray] duration-500"
              />
            );
            acc += len;
            return el;
          })}
        <text x="50" y="47" textAnchor="middle" className="figures" fontSize="15" fontWeight="700" fill="var(--ink)">{centre}</text>
        <text x="50" y="60" textAnchor="middle" fontSize="7" fill="var(--muted)">{sub}</text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1">
        {parts.map((p, i) => (
          <li key={p.label} className="flex items-center gap-2.5 text-[12px]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: RING[i % RING.length] }} />
            <span className={`min-w-0 flex-1 truncate ${p.strong ? "font-semibold" : ""}`} title={p.label}>{p.label}</span>
            <span className="figures w-8 shrink-0 text-right">{p.n}</span>
            <span className="w-10 shrink-0 text-right text-[10.5px] text-muted">{total ? Math.round((p.n / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "n=3" said in words, so a thin median cannot be read as a firm one. */
function thin(s: Sampled | null): string | null {
  if (!s) return null;
  return s.n < 4 ? `only ${s.n}` : `${s.n} properties`;
}

function Section({
  id,
  title,
  hint,
  picked,
  onPick,
  children,
}: {
  id: MarketBlockId;
  title: string;
  hint?: string;
  picked: boolean;
  onPick: (id: MarketBlockId) => void;
  children: React.ReactNode;
}) {
  return (
    /* The title is a title now (James, 11 Sep 2026: "the titles aren't big,
       so you get eye fatigue... you can't really tell what you're looking
       at"), and "On slide" is a pill that fills when it is on rather than a
       checkbox in the corner. */
    <div className={`flex h-full flex-col rounded-2xl border p-4 sm:p-5 ${picked ? "border-[#56634a]/40 bg-[#f1f4ec]/60" : "border-line/70"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="hand text-[17px] leading-tight">{title}</h3>
          {hint && <p className="mt-1 text-[12px] leading-snug text-muted">{hint}</p>}
        </div>
        <button
          type="button"
          onClick={() => onPick(id)}
          aria-pressed={picked}
          className={`shrink-0 rounded-full border px-3 py-1 text-[11.5px] font-semibold transition-colors ${
            /* Green when it is on. James, 11 Sep 2026: "put on the slide,
               love this, and then the button turns to green." */
            picked ? "border-[#56634a] bg-[#56634a] text-white" : "border-line/80 text-muted hover:border-ink/40 hover:text-ink"
          }`}
        >
          {picked ? "On the slide ✓" : "Put on slide"}
        </button>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

/* ── the panel ────────────────────────────────────────────────────────────── */

export default function MarketPicturePanel({
  postcode,
  subjectBeds,
  selection,
  onSelectionChange,
  onLoaded,
}: {
  postcode: string;
  /** The appraisal property's own size, highlighted in the rent chart. */
  subjectBeds?: number | null;
  selection: MarketSelection | null;
  /**
   * A setState, not a plain setter, and that is load-bearing.
   *
   * MEASURED: ticking all five blocks in one batch left ALL FIVE unticked.
   * Each handler computed the next list from the `selection` prop of the
   * render it was created in, so five clicks in one batch each saw an empty
   * list, and the last write — of one block — was what survived. Spacing the
   * clicks out hid it completely, which is why it would have reached an agent
   * before it reached us.
   *
   * Reading the previous value inside the updater is the only version that is
   * correct regardless of how fast the boxes are ticked.
   */
  onSelectionChange: React.Dispatch<React.SetStateAction<MarketSelection | null>>;
  /**
   * Lifted so the deck is built from the SAME object this panel drew.
   *
   * The alternative was re-fetching at send time, and it is the worse one: the
   * agent would have ticked blocks against one reading of a live feed and the
   * landlord would receive another, taken minutes later. A slide must say what
   * was on screen when it was chosen.
   */
  onLoaded?: (d: MarketPicture) => void;
}) {
  const [d, setD] = useState<MarketPicture | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [areaPicked, setAreaPicked] = useState<string | null>(null);

  /* HELD IN A REF, NOT A DEPENDENCY. The parent passes this callback inline, so
     it is a new function on every render; naming it in the dep array below
     would re-run the fetch on each one, and the fetch calls it — a loop that
     hammers Homesearch until the tab is closed. The effect depends on the
     postcode alone, which is the only thing that changes what is fetched. */
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  useEffect(() => {
    let live = true;
    setD(null);
    setError(null);
    fetch(`/api/market-picture?postcode=${encodeURIComponent(postcode)}`)
      .then((r) => r.json())
      .then((j: MarketPicture & { error?: string }) => {
        if (!live) return;
        if (j.error) setError(j.error);
        else {
          setD(j);
          onLoadedRef.current?.(j);
        }
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [postcode]);

  if (error) {
    return (
      <div className="rounded-xl border border-accent-dark/40 bg-accent-soft/30 p-4">
        <p className="text-[12.5px] leading-relaxed">
          The market figures could not be pulled: {error}
        </p>
        <p className="mt-1.5 text-[11.5px] text-muted">
          Nothing is shown rather than a stale or zero figure. Try the step again in a moment.
        </p>
      </div>
    );
  }
  if (!d) {
    return (
      <div className="rounded-xl border border-line/70 p-4">
        <p className="text-[12.5px] text-muted">Reading the local market…</p>
      </div>
    );
  }
  if (!d.scopes.length) {
    return (
      <div className="rounded-xl border border-line/70 p-4">
        <p className="text-[12.5px] text-muted">
          Homesearch has no advertised rentals in {d.postcode} at all. That is an absence, not a
          quiet market — there is nothing here to show a landlord.
        </p>
      </div>
    );
  }

  /* Closest by default. The district is context; the sector is the answer, and
     on NN5 the two disagree by 39%. */
  const sc: MarketPictureScope =
    d.scopes.find((s) => s.area === areaPicked) ?? d.scopes[d.scopes.length - 1];

  const picked = selection?.area === sc.area ? selection.blocks : [];
  const togglePick = (id: MarketBlockId) => {
    onSelectionChange((prev) => {
      /* A selection held against a DIFFERENT scope is treated as empty, not
         merged: the blocks describe one area's figures, and carrying them
         across would attach a district's numbers to a sector's heading. */
      const was = prev?.area === sc.area ? prev.blocks : [];
      const next = was.includes(id) ? was.filter((b) => b !== id) : [...was, id];
      return next.length ? { area: sc.area, blocks: next } : null;
    });
  };

  const bands = [
    { label: "Under 2 weeks", n: sc.bands.newIn14 },
    { label: "2–4 weeks", n: sc.bands.days15to28 },
    { label: "1–3 months", n: sc.bands.days29to84 },
    { label: "Over 3 months", n: sc.bands.over84 },
  ];
  const bandMax = Math.max(1, ...bands.map((b) => b.n));
  const bedMax = Math.max(1, ...sc.beds.map((b) => b.n));
  const pct = (n: number) => Math.round((n / sc.advertised) * 100);

  return (
    <div className="space-y-3">
      {/* Scope switch. Both are real and they disagree, so which one is on
          screen must never be ambiguous — the label says the level in words. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {d.scopes.map((s) => (
          <button
            key={s.area}
            type="button"
            onClick={() => {
              setAreaPicked(s.area);
              /* Blocks are pinned to the scope they were picked in. Switching
                 area and keeping the ticks would send the landlord figures for
                 an area the agent had moved off. */
              if (selection && selection.area !== s.area) onSelectionChange(null);
            }}
            className={`rounded-lg border px-2.5 py-1 text-[11.5px] ${
              s.area === sc.area
                ? "border-accent-dark/50 bg-accent-soft/50 font-semibold"
                : "border-line/70 text-muted"
            }`}
          >
            {s.area}
            <span className="ml-1.5 text-[10px] font-normal text-muted">{s.level}</span>
          </button>
        ))}
        <span className="ml-auto text-[11px] text-muted">
          {sc.advertised} advertised · {sc.letAgreed} already agreed
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Big
          label="Median asking rent"
          value={sc.rent ? money(sc.rent.median) : "—"}
          unit={sc.rent ? "pcm" : undefined}
          note={
            sc.rent
              ? `Median asking rent across all sizes in ${sc.area}, from ${sc.rent.n} advertised properties.`
              : "No advertised rents to average."
          }
        />
        <Big
          label="Time on the market"
          value={sc.daysAdvertised ? String(sc.daysAdvertised.median) : "—"}
          unit={sc.daysAdvertised ? "days" : undefined}
          note={
            sc.daysAdvertised
              ? "Median time the stock advertised right now has been on the market. Not how long it took to let."
              : "No listing dates to measure."
          }
        />
        <Big
          label="Already reduced"
          value={`${pct(sc.reduced)}%`}
          note={`${sc.reduced} of ${sc.advertised} landlords here have already cut their asking rent.`}
        />
      </div>

      {/* Side by side. James, 11 Sep 2026: "stack these side by side, one pie
          chart and one bar chart per line... not spread it so much of a sweep
          downwards." Pace keeps the full width because it is two figures
          against each other; the other four pair up. */}
      <div className="grid gap-3 lg:grid-cols-2">
      <div className="lg:col-span-2">
      <Section
        id="pace"
        title="How fast it moves"
        hint="Two different questions, kept apart: how long the competition has been sitting, and how long we take."
        picked={picked.includes("pace")}
        onPick={togglePick}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-line/60 p-3">
            <p className="figures text-[20px] leading-none">
              {sc.daysAdvertised ? `${sc.daysAdvertised.median} days` : "—"}
            </p>
            <p className="mt-1.5 text-[11.5px] leading-snug text-muted">
              The market in {sc.area} — median time currently advertised.
            </p>
          </div>
          <div className="rounded-lg border border-accent-dark/40 bg-accent-soft/30 p-3">
            <p className="figures text-[20px] leading-none">
              {d.ourLetSpeed ? `${d.ourLetSpeed.median} days` : "—"}
            </p>
            <p className="mt-1.5 text-[11.5px] leading-snug text-muted">
              {d.ourLetSpeed ? (
                <>
                  Us — median advertised-to-let across our last {d.ourLetSpeed.n} lets in this
                  district, from our own book.
                </>
              ) : (
                <>
                  Too few completed lets in this district with both dates recorded to quote a
                  median, so there is nothing to compare against yet.
                </>
              )}
            </p>
          </div>
        </div>
        {/* The comparison is only fair if it is described honestly. One is a
            snapshot of unsold stock, the other is finished business — a
            landlord who spots that unaided stops trusting the rest. */}
        <p className="mt-2.5 text-[11px] leading-relaxed text-muted">
          These measure different things. The market figure is how long today&apos;s unlet stock has
          been sitting; ours is how long our completed lets actually took. Homesearch drops a
          property when it lets, so a like-for-like market figure needs our own daily capture, which
          began on 30 August.
        </p>
      </Section>
      </div>

      <Section
        id="bands"
        title="How long stock sits"
        hint="Everything advertised now, by how long it has been advertised. Bands do not overlap."
        picked={picked.includes("bands")}
        onPick={togglePick}
      >
        <div className="space-y-1.5">
          {bands.map((b) => (
            <Bar key={b.label} label={b.label} n={b.n} max={bandMax} note={`${pct(b.n)}%`} />
          ))}
        </div>
        {sc.bands.undated > 0 && (
          <p className="mt-2 text-[10.5px] text-muted">
            {sc.bands.undated} more carry no usable listing date and are left out of these bands
            rather than guessed into one.
          </p>
        )}
      </Section>

      <Section
        id="rent"
        title="Asking rent by size"
        hint="Median asking rent for each size advertised here, with the sample it rests on."
        picked={picked.includes("rent")}
        onPick={togglePick}
      >
        <div className="space-y-1.5">
          {sc.beds.map((b) => (
            <Bar
              key={b.beds}
              label={b.beds >= 5 ? "5+ bed" : `${b.beds} bed`}
              n={b.n}
              max={bedMax}
              strong={subjectBeds != null && Math.min(subjectBeds, 5) === b.beds}
              note={b.rent ? money(b.rent.median) : "—"}
            />
          ))}
        </div>
        {/* The spread, not just the middle. A landlord with a 2-bed wants to
            know the cheapest and dearest 2-bed on the market as much as the
            median - it is the range they will be placed within. */}
        {sc.rent && (
          <p className="mt-2.5 text-[11.5px] text-muted">
            Across every size the asking rents run from <span className="figures text-ink">{money(sc.rent.low)}</span> to{" "}
            <span className="figures text-ink">{money(sc.rent.high)}</span>
            {subjectBeds != null && (() => {
              const mine = sc.beds.find((b) => b.beds === Math.min(subjectBeds, 5));
              return mine?.rent ? (
                <> ; {mine.beds >= 5 ? "5+" : mine.beds}-beds like this one from <span className="figures text-ink">{money(mine.rent.low)}</span> to <span className="figures text-ink">{money(mine.rent.high)}</span></>
              ) : null;
            })()}
            .
          </p>
        )}
        {/* A median of two is still shown — an agent would rather have it than
            a blank — but it must not look like a median of forty. */}
        {sc.beds.some((b) => b.rent && b.rent.n < 4) && (
          <p className="mt-2 text-[10.5px] text-muted">
            Sizes with fewer than four advertised are indicative only:{" "}
            {sc.beds
              .filter((b) => b.rent && b.rent.n < 4)
              .map((b) => `${b.beds >= 5 ? "5+" : b.beds}-bed (${thin(b.rent)})`)
              .join(", ")}
            .
          </p>
        )}
      </Section>

      <Section
        id="mix"
        title="What is competing"
        hint="Houses against flats. The feed carries nothing finer — there is no detached or semi-detached split in it."
        picked={picked.includes("mix")}
        onPick={togglePick}
      >
        <Donut
          parts={[
            { label: "Houses", n: sc.houses },
            { label: "Flats", n: sc.flats },
          ]}
          centre={`${pct(sc.houses)}%`}
          sub="houses"
        />
      </Section>

      <Section
        id="agents"
        title="Who is letting it"
        hint="The agents a tenant is choosing between in this area, by how much they have advertised."
        picked={picked.includes("agents")}
        onPick={togglePick}
      >
        {/* The top six by share, the rest as "everyone else": a ring with
            fourteen slivers says nothing. Ours is always named when we are
            there at all. */}
        {(() => {
          const sorted = [...sc.agents].sort((a, b) => (b.ours ? 1 : 0) - (a.ours ? 1 : 0) || b.n - a.n);
          const top = sorted.slice(0, 5);
          const rest = sorted.slice(5).reduce((a, b) => a + b.n, 0);
          const parts = [
            ...top.map((a) => ({ label: a.ours ? `${a.agent} (us)` : a.agent, n: a.n, strong: a.ours })),
            ...(rest > 0 ? [{ label: `${sorted.length - 5} other agents`, n: rest }] : []),
          ];
          return <Donut parts={parts} centre={String(sc.agents.length)} sub="agents" />;
        })()}
        {/* When TLE has no stock here the panel says nothing about TLE. An "us:
            0" row beside a competitor on fourteen hands the landlord an
            argument against instructing. */}
        {!sc.agents.some((a) => a.ours) && (
          <p className="mt-2 text-[10.5px] text-muted">
            We have nothing advertised in {sc.area} today, so we are not in this list.
          </p>
        )}
      </Section>
      </div>

      <p className="text-[10.5px] leading-relaxed text-muted">
        Every figure above is the live Homesearch lettings book for {sc.area}, read{" "}
        {new Date(d.pulledAt).toLocaleString("en-GB", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })}
        . Withdrawn and fallen-through listings are excluded. Rent growth is not shown because no
        source we have holds lettings history — our own daily capture began on 30 August and will
        answer it in time.
      </p>
    </div>
  );
}
