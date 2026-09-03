"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * Today - Bond's front page, after James's sketch of 3 Sep 2026.
 *
 * Warm, hand-drawn and a little playful: pastel badges on the tiles, a
 * gauge and a stacked column drawn by hand in SVG, the dog and the house
 * keeping the feed company until there is something to show. Every figure
 * on it is counted from the tables for the person's patch; nothing here is
 * an estimate dressed as a fact, which is why the cards say "advertised
 * rent" and "condition score" rather than "portfolio value".
 */

export interface TodaySummary {
  flagged: number;
  newToday: number;
  workedThisWeek: number;
  appraisalsBooked: number;
  ownersFound: number;
  postcardsSent: number;
  anniversariesSoon: number;
  nudgesOpen: number;
  lastSweep: string | null;
  districts: number;
}
export interface TodayPicture {
  opportunity: {
    landlords: number;
    landlordsEstimate: number | null;
    doorsSeen: number;
    avgScore: number | null;
    score: number | null;
    parts: { strong: number; timing: number; contactable: number; warm: number };
    counts: { strong: number; timing: number; contactable: number; warm: number };
    bands: { very_high: number; high: number; medium: number; low: number };
    rentRoll: number;
    rentDoors: number;
    flagged: number;
  };
  condition: { score: number | null; doors: number; excellent: number; average: number; poor: number };
  top: Array<{ property_key: string; address: string; postcode: string; score: number; band: "Very high" | "High" | "Medium" | "Low"; market: "let" | "sale"; rent: number | null; asking_price: number | null; photo: string | null }>;
}
export interface TodayActivity {
  id: number;
  actor: string;
  kind: string;
  property_key: string | null;
  address: string;
  detail: string;
  at: string;
}
export interface TodayData {
  summary: TodaySummary;
  picture: TodayPicture;
  activity: TodayActivity[];
  name: string | null;
  providers: { owner: { connected: boolean; name: string | null }; postcard: { connected: boolean; name: string | null } };
}

type Room = "today" | "nudges" | "map" | "prospects" | "landlords" | "competitors" | "lookup" | "campaigns" | "owners" | "postcards";

const RECENT_KEY = "bond.recent";
export function rememberSearch(term: string) {
  try {
    const cur = (JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[]).filter((t) => t.toLowerCase() !== term.toLowerCase());
    localStorage.setItem(RECENT_KEY, JSON.stringify([term, ...cur].slice(0, 4)));
  } catch {
    /* no memory in this browser */
  }
}

const KIND_ICON: Record<string, string> = {
  stage: "checklist",
  note: "note",
  assigned: "user",
  appraisal: "calendar",
  address: "home",
  owner: "key",
  postcard: "mail",
  nudge: "call",
};

/* The pastels, paired: a wash for the badge and an ink for the icon. */
const TONES = {
  peach: { wash: "var(--bond-peach)", ink: "var(--bond-peach-ink)" },
  lilac: { wash: "var(--bond-lilac)", ink: "var(--bond-lilac-ink)" },
  butter: { wash: "var(--bond-butter)", ink: "var(--bond-butter-ink)" },
  mint: { wash: "var(--bond-mint)", ink: "var(--bond-mint-ink)" },
  sky: { wash: "var(--bond-sky)", ink: "var(--bond-sky-ink)" },
  rose: { wash: "var(--bond-rose)", ink: "var(--bond-rose-ink)" },
} as const;
type Tone = keyof typeof TONES;

const BAND_TONE: Record<string, Tone> = { "Very high": "peach", High: "peach", Medium: "butter", Low: "lilac" };

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "yesterday" : `${d} days ago`;
}
function when(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
const pounds = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;
/** Big sums read better short: £2.16m. The exact figure sits in the tooltip. */
const short = (n: number) => (n >= 1_000_000 ? `£${(n / 1_000_000).toFixed(2)}m` : n >= 100_000 ? `£${Math.round(n / 1000)}k` : pounds(n));

export default function BondToday({
  data,
  error,
  quick,
  setQuick,
  search,
  go,
}: {
  data: TodayData | null;
  error: string | null;
  quick: string;
  setQuick: (v: string) => void;
  search: (term: string) => void;
  go: (r: Room) => void;
}) {
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    try {
      setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[]);
    } catch {
      /* fine */
    }
  }, [data]);

  if (error) {
    return (
      <div className="rounded-2xl border border-dashed border-line p-6 text-[12.5px]">
        <p>Bond could not read its data.</p>
        <p className="mt-1 text-muted">{error}</p>
      </div>
    );
  }

  const s = data?.summary;
  const pic = data?.picture;

  return (
    <div className="w-full pb-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (quick.trim()) search(quick.trim());
        }}
        className="fade-up"
      >
        <label className="flex items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-3 shadow-[0_1px_0_rgba(0,0,0,0.02)] focus-within:border-ink">
          <DoodleIcon name="search" size={16} className="shrink-0 text-muted" />
          <input
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            placeholder="Where are you prospecting today? A postcode or an address..."
            className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-muted/70"
          />
          <button type="submit" className="press-wobble shrink-0 rounded-full bg-ink px-4 py-1.5 text-[12px] font-semibold text-page">
            Show me
          </button>
        </label>
        {recent.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5 pl-2">
            {recent.map((t) => (
              <button key={t} type="button" onClick={() => search(t)} className="rounded-lg border border-line bg-panel px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-ink hover:text-ink">
                {t}
              </button>
            ))}
          </div>
        )}
      </form>

      {/* The tiles. */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">
        <Tile tone="peach" icon="call" label="Nudges" value={s ? s.nudgesOpen : null} hint="to call today" onClick={() => go("nudges")} />
        <Tile tone="rose" icon="target" label="Flagged" value={s ? s.flagged : null} hint={s ? `across ${s.districts} districts` : ""} onClick={() => go("map")} />
        <Tile tone="butter" icon="star" label="New today" value={s ? s.newToday : null} hint={s?.lastSweep ? `swept ${when(s.lastSweep)}` : "not swept yet"} onClick={() => go("prospects")} />
        <Tile tone="lilac" icon="calendar" label="Anniversaries" value={s ? s.anniversariesSoon : null} hint="in the next 60 days" onClick={() => go("prospects")} />
        <Tile tone="mint" icon="home" label="Worked this week" value={s ? s.workedThisWeek : null} hint="properties touched" />
        <Tile tone="sky" icon="checklist" label="Appraisals booked" value={s ? s.appraisalsBooked : null} hint="from Bond" />
      </div>

      {/* The picture. */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-[1.08fr_0.9fr_1.22fr]">
        <Card title="Opportunity" icon="magic-wand" delay="0.3s">
          {pic ? <Gauge o={pic.opportunity} /> : <Loading />}
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Mini
              tone="lilac"
              label={pic?.opportunity.landlordsEstimate != null ? "Landlords (est.)" : "Landlords"}
              value={pic ? (pic.opportunity.landlordsEstimate ?? pic.opportunity.landlords).toLocaleString("en-GB") : "…"}
              hint={
                pic?.opportunity.landlordsEstimate != null
                  ? `estimate: ${pic.opportunity.doorsSeen.toLocaleString("en-GB")} doors seen to let in two years, about three each${pic.opportunity.landlords ? `; ${pic.opportunity.landlords.toLocaleString("en-GB")} known by name` : ""}`
                  : "known by name in the patch"
              }
            />
            <Mini tone="mint" label="Advertised rent" value={pic ? short(pic.opportunity.rentRoll) : "…"} hint={pic ? `pcm across ${pic.opportunity.rentDoors.toLocaleString("en-GB")} lets` : ""} />
            <Mini tone="butter" label="Doors flagged" value={pic ? pic.opportunity.flagged.toLocaleString("en-GB") : "…"} hint="in the patch" />
          </div>
        </Card>

        <Card title="Portfolio condition" icon="link" delay="0.38s">
          {pic ? <Condition c={pic.condition} /> : <Loading />}
        </Card>

        <Card title="Top opportunities" icon="star" delay="0.46s">
          {!pic ? (
            <Loading />
          ) : pic.top.length === 0 ? (
            <p className="text-[12.5px] text-muted">Nothing flagged in the patch yet. The sweep runs every morning.</p>
          ) : (
            <ul className="space-y-1">
              {pic.top.map((t) => (
                <li key={t.property_key} className="min-w-0">
                  <button type="button" onClick={() => search(t.address)} className="flex w-full min-w-0 items-center gap-3 rounded-xl px-1.5 py-1.5 text-left transition-colors hover:bg-box">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl" style={{ background: TONES.peach.wash }}>
                      {t.photo ? <img src={t.photo} alt="" className="h-full w-full object-cover" /> : <DoodleIcon name="home-1" size={20} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold">{t.address.replace(new RegExp(`,?\\s*${t.postcode}$`, "i"), "")}</span>
                      <span className="mt-1 flex items-center gap-2">
                        <span className="shrink-0 text-[11px] text-muted">{t.postcode}</span>
                        <Pill tone={BAND_TONE[t.band] ?? "lilac"}>{t.band}</Pill>
                        <span className="figures ml-auto shrink-0 whitespace-nowrap text-[12.5px]">
                          {t.market === "sale" ? (t.asking_price != null ? pounds(t.asking_price) : "-") : t.rent != null ? `${pounds(t.rent)} pcm` : "-"}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => go("prospects")} className="mt-3 w-full rounded-xl border border-line py-2 text-[12px] text-muted transition-colors hover:border-ink hover:text-ink">
            View all opportunities
          </button>
        </Card>
      </div>

      {/* The feed, with company. */}
      <section className="fade-up mt-4 min-w-0 overflow-hidden rounded-2xl border border-line bg-panel" style={{ animationDelay: "0.55s" }}>
        <div className="grid lg:grid-cols-[1fr_260px]">
          <div className="p-6">
            <h2 className="hand flex items-center gap-2 text-[17px]">
              <DoodleIcon name="magic-wand" size={16} />
              What has happened
            </h2>
            {!data ? (
              <Loading />
            ) : data.activity.length === 0 ? (
              <p className="mt-3 max-w-md text-[12.5px] leading-relaxed text-muted">
                Nothing yet. Open a property from the map or the list, set its stage or write a note, and it shows here for everyone.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-line/70">
                {data.activity.slice(0, 12).map((a) => (
                  <li key={a.id} className="flex items-start gap-3 py-2.5 text-[12.5px]">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: TONES.sky.wash, color: TONES.sky.ink }}>
                      <DoodleIcon name={KIND_ICON[a.kind] ?? "note"} size={13} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p>
                        <span className="font-semibold">{a.actor}</span>
                        <span className="text-muted"> · {a.address}</span>
                      </p>
                      <p className="text-muted">{a.detail}</p>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted">{ago(a.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="relative hidden min-h-[180px] items-end justify-center lg:flex">
            <img src="/bond/dog-and-house.png" alt="" className="bond-float mb-1 h-[230px] w-[230px] object-contain" />
          </div>
        </div>
      </section>
    </div>
  );
}

function Loading() {
  return (
    <p className="flex items-center gap-3 py-6 text-[12.5px] text-muted">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />
      Counting...
    </p>
  );
}

function Card({ title, icon, delay, children }: { title: string; icon: string; delay: string; children: React.ReactNode }) {
  return (
    <section className="fade-up min-w-0 rounded-2xl border border-line bg-panel p-6" style={{ animationDelay: delay }}>
      <h2 className="hand flex items-center gap-2 text-[17px]">
        <DoodleIcon name={icon} size={16} />
        {title}
      </h2>
      <div className="mt-4 min-w-0">{children}</div>
    </section>
  );
}

function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className="shrink-0 rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold" style={{ background: TONES[tone].wash, color: TONES[tone].ink }}>
      {children}
    </span>
  );
}

function Tile({ tone, icon, label, value, hint, onClick }: { tone: Tone; icon: string; label: string; value: number | null; hint?: string; onClick?: () => void }) {
  const inner = (
    <>
      <div className="flex min-w-0 flex-col items-start gap-2 2xl:flex-row 2xl:items-center 2xl:gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: TONES[tone].wash, color: TONES[tone].ink }}>
          <DoodleIcon name={icon} size={16} />
        </span>
        <p className="hand line-clamp-2 min-w-0 text-[13.5px] leading-tight">{label}</p>
      </div>
      <p className="figures mt-3 text-[34px] leading-none">
        {value == null ? <span className="inline-block h-7 w-12 animate-pulse rounded bg-box" /> : value.toLocaleString("en-GB")}
      </p>
      {hint ? <p className="mt-2 text-[11.5px] leading-snug text-muted">{hint}</p> : null}
    </>
  );
  const cls = "bond-tile fade-up min-w-0 rounded-2xl border border-line bg-panel p-4 text-left 2xl:p-5 transition-[transform,border-color] hover:-translate-y-0.5 hover:border-ink";
  return onClick ? (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

function Mini({ tone, label, value, hint }: { tone: Tone; label: string; value: string; hint: string }) {
  return (
    <div className="min-w-0 rounded-xl px-3 py-3 2xl:px-3.5" style={{ background: TONES[tone].wash }}>
      <p className="truncate text-[10.5px] font-semibold" style={{ color: TONES[tone].ink }}>{label}</p>
      <p className="figures mt-1.5 truncate text-[19px] leading-none 2xl:text-[22px]" title={value}>{value}</p>
      {hint && <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-muted">{hint}</p>}
    </div>
  );
}

/* ── The gauge ────────────────────────────────────────────────────────────── */

const polar = (cx: number, cy: number, r: number, deg: number) => {
  const a = ((deg - 180) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
};
/** An arc along the top half: 0 is the left end, 100 the right. */
function arc(from: number, to: number, r = 78, cx = 100, cy = 96): string {
  const [x1, y1] = polar(cx, cy, r, (from / 100) * 180);
  const [x2, y2] = polar(cx, cy, r, (to / 100) * 180);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function Gauge({ o }: { o: TodayPicture["opportunity"] }) {
  const score = o.score;
  const at = Math.max(0, Math.min(100, score ?? 0));
  const [mx, my] = polar(100, 96, 78, (at / 100) * 180);
  return (
    <div className="relative mx-auto max-w-[360px]">
      <svg viewBox="0 0 200 110" className="w-full">
        <path d={arc(0, 100, 62)} fill="none" stroke="var(--line)" strokeWidth="1" strokeDasharray="2 4" />
        <path d={arc(0, 34)} fill="none" stroke="var(--bond-lilac-ink)" strokeOpacity="0.55" strokeWidth="18" strokeLinecap="round" className="bond-draw" pathLength={1} />
        <path d={arc(34, 68)} fill="none" stroke="var(--bond-coral)" strokeWidth="18" className="bond-draw" pathLength={1} style={{ animationDelay: "0.25s" }} />
        <path d={arc(68, 100)} fill="none" stroke="var(--bond-butter-ink)" strokeOpacity="0.45" strokeWidth="18" strokeLinecap="round" className="bond-draw" pathLength={1} style={{ animationDelay: "0.5s" }} />
        {score != null && (
          <g>
            <circle cx={mx} cy={my} r="7" fill="var(--panel)" stroke="var(--ink)" strokeWidth="2" />
            <circle cx={mx} cy={my} r="2.5" fill="var(--ink)" />
          </g>
        )}
        <circle cx="100" cy="96" r="30" fill="var(--box)" />
        <text x="100" y="104" textAnchor="middle" className="figures" fontSize="22" fill="var(--ink)">
          {score == null ? "-" : score}
        </text>
      </svg>
      <div className="-mt-3 flex items-center justify-between px-3 text-[11px] text-muted">
        <span>Low</span>
        <span className="whitespace-nowrap rounded-full border border-line bg-panel px-2.5 py-0.5 text-[10.5px] text-ink">Patch opportunity</span>
        <span>High</span>
      </div>
      {score == null ? (
        <p className="mt-1.5 text-center text-[10.5px] text-muted">Nothing flagged in the patch yet</p>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted">
          <Part label="Strong doors" got={o.parts.strong} of={40} n={o.counts.strong} />
          <Part label="Right timing" got={o.parts.timing} of={20} n={o.counts.timing} />
          <Part label="Contactable" got={o.parts.contactable} of={20} n={o.counts.contactable} />
          <Part label="Warm calls" got={o.parts.warm} of={20} n={o.counts.warm} />
        </ul>
      )}
    </div>
  );
}

function Part({ label, got, of, n }: { label: string; got: number; of: number; n: number }) {
  return (
    <li className="flex items-center justify-between gap-2" title={`${n.toLocaleString("en-GB")} doors`}>
      <span className="truncate">{label}</span>
      <span className="figures shrink-0 text-ink">
        {got}
        <span className="text-muted">/{of}</span>
      </span>
    </li>
  );
}

/* ── The condition column ─────────────────────────────────────────────────── */

function Condition({ c }: { c: TodayPicture["condition"] }) {
  const blocks = 10;
  const total = c.doors || 1;
  let ex = Math.round((c.excellent / total) * blocks);
  let po = Math.round((c.poor / total) * blocks);
  let av = c.doors ? Math.max(0, blocks - ex - po) : 0;
  if (!c.doors) ex = po = av = 0;
  const grey = blocks - ex - av - po;
  const stack: Array<{ tone: string }> = [
    ...Array.from({ length: grey }, () => ({ tone: "var(--box)" })),
    ...Array.from({ length: ex }, () => ({ tone: "var(--bond-lilac-ink)" })),
    ...Array.from({ length: av }, () => ({ tone: "var(--bond-coral)" })),
    ...Array.from({ length: po }, () => ({ tone: "var(--bond-butter-ink)" })),
  ];
  return (
    <div>
      <div className="flex items-stretch gap-5">
        <div className="relative flex w-24 flex-col justify-between gap-2">
          {stack.map((b, i) => (
            <span key={i} className="fade-up h-5 rounded-md" style={{ background: b.tone, opacity: b.tone.includes("box") ? 1 : 0.75, animationDelay: `${0.05 * i}s` }} />
          ))}
        </div>
        <div className="flex flex-col justify-between py-0.5 text-[10.5px] text-muted">
          <span>100</span>
          <span>0</span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-[11px] text-muted">Condition score</p>
          <p className="figures mt-2 text-[64px] leading-none">{c.score == null ? "-" : c.score}</p>
          <p className="mt-2 text-[10.5px] text-muted">{c.doors ? `${c.doors.toLocaleString("en-GB")} doors with a certificate` : "no certificates matched yet"}</p>
        </div>
      </div>
      <ul className="mt-4 space-y-1.5 text-[11.5px] text-muted">
        <Legend colour="var(--bond-lilac-ink)" label="Excellent" n={c.excellent} />
        <Legend colour="var(--bond-coral)" label="Average" n={c.average} />
        <Legend colour="var(--bond-butter-ink)" label="Poor" n={c.poor} />
      </ul>
    </div>
  );
}

function Legend({ colour, label, n }: { colour: string; label: string; n: number }) {
  return (
    <li className="flex items-center gap-2">
      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colour, opacity: 0.8 }} />
      <span className="w-20">{label}</span>
      <span className="figures text-ink">{n.toLocaleString("en-GB")}</span>
    </li>
  );
}
