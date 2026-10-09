"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PinMap, type Pin } from "./map";
import { Sheet } from "../bits";
import { searchMatches } from "@/lib/search-match";

/**
 * THE MATCH FLOW (3 Oct 2026). James: "it should feel like, when they click on
 * it, we're entering into a bit of an experience ... a bit of a workflow", from
 * his "Create, Find and Join your circle" screenshots. One flow, two ways
 * round:
 *
 *   Email the Database   a home -> the people who would want it (people pins)
 *   Find a Home          a tenant -> the live homes around them (photo pins)
 *
 * Four steps over the whole screen, above the app's own bar:
 *   1 Intro   coral, the circle of pins, "Get Started"
 *   2 Map     the pins around the subject; distance chips; cards at the foot
 *   3 List    "+ Add" each, or Add All, like the reference's Invite Friends
 *   4 Draft   the real email, rendered by the server, then Send
 *
 * Nothing is sent until Send on the Draft step, and the send is the desk's own
 * route with all its checks - the customer email switch decides whether
 * anything leaves at all.
 */

export interface MatchItem {
  id: string;
  title: string;
  /** Second line: what they asked about, or where the home is. */
  line: string;
  /** Third line: rent, when, how far. */
  meta: string;
  lat: number | null;
  lng: number | null;
  miles: number | null;
  image?: string | null;
  /** Within a fifth of the rent, where that is known. */
  similar?: boolean | null;
}

export interface MatchSubject {
  title: string;
  line: string;
  lat: number | null;
  lng: number | null;
  image?: string | null;
}

type Step = "intro" | "map" | "list" | "draft" | "sent";
const MILES = [1, 3, 5, 10];
const CORAL = "var(--m-coral)";

const initials = (s: string) =>
  s
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

export default function MatchFlow({
  kind,
  subject,
  items,
  error,
  intro,
  noun,
  max,
  onPreview,
  onSend,
  onClose,
}: {
  kind: "people" | "homes";
  subject: MatchSubject | null;
  items: MatchItem[] | null;
  error: string | null;
  intro: { title: string; line: string };
  /** ["person", "people"] or ["home", "homes"] */
  noun: [string, string];
  /** At most this many in one send. */
  max: number;
  onPreview: (ids: string[]) => Promise<{ subject: string; html: string } | { error: string }>;
  onSend: (ids: string[]) => Promise<{ ok: boolean; said: string }>;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("intro");
  const [miles, setMiles] = useState(3);
  const [similarOnly, setSimilarOnly] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<string | null>(null);
  const [custom, setCustom] = useState(false);
  const top = useRef<HTMLDivElement | null>(null);
  const [padTop, setPadTop] = useState(150);
  useLayoutEffect(() => {
    const el = top.current;
    if (el) setPadTop(Math.round(el.getBoundingClientRect().bottom) + 22);
  }, [step]);
  const [sentSaid, setSentSaid] = useState("");

  /* The whole screen is the flow: the page under it stays still. */
  useEffect(() => {
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = was;
    };
  }, []);

  const word = (n: number) => `${n} ${n === 1 ? noun[0] : noun[1]}`;

  /* In range: within the ring, or unplaced (they are still a match - the list
     shows them, the map cannot). */
  const inRange = useMemo(
    () => (items ?? []).filter((i) => (i.miles == null || i.miles <= miles) && (!similarOnly || i.similar !== false)).sort((a, b) => (a.miles ?? 99) - (b.miles ?? 99)),
    [items, miles, similarOnly]
  );
  const pins: Pin[] = useMemo(
    () =>
      inRange
        .filter((i) => i.lat != null && i.lng != null)
        .map((i) => ({ id: i.id, lat: i.lat!, lng: i.lng!, name: i.title, label: kind === "people" ? initials(i.title) : "", image: kind === "homes" ? i.image : null, on: picked.has(i.id) })),
    [inRange, picked, kind]
  );

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  /* A pin tapped on the map pops its card up; tapping the map lets it go. */
  const showCard = (id: string) => setFocus((f) => (f === id ? null : id));
  const focused = focus ? inRange.find((i) => i.id === focus) ?? null : null;

  const chosen = (items ?? []).filter((i) => picked.has(i.id));

  return (
    <div className="fixed inset-0 z-[70] overflow-hidden" style={{ background: "var(--m-bg)" }}>
      <style>{`
        @keyframes mf-up { from { opacity: 0; transform: translateY(24px) } to { opacity: 1; transform: none } }
        @keyframes mf-pop { 0% { opacity: 0; transform: scale(0.6) } 70% { transform: scale(1.06) } 100% { opacity: 1; transform: scale(1) } }
        @keyframes mf-spin { to { transform: rotate(360deg) } }
        @keyframes mf-card { from { opacity: 0; transform: translateY(40px) scale(0.98) } to { opacity: 1; transform: none } }
        @media (prefers-reduced-motion: reduce) { .mf-anim { animation: none !important } }
      `}</style>

      {step === "intro" && (
        <Intro
          kind={kind}
          subject={subject}
          items={items}
          error={error}
          intro={intro}
          countLine={items ? (items.length ? `${word(items.length)} to choose from.` : `Nobody fits yet.`) : null}
          onStart={() => setStep("map")}
          onClose={onClose}
        />
      )}

      {step !== "intro" && subject && subject.lat != null && subject.lng != null && (
        <PinMap
          centre={{ lat: subject.lat, lng: subject.lng }}
          centreImage={kind === "people" ? subject.image : null}
          centreIcon={kind === "people" ? "home" : "person"}
          pins={pins}
          miles={miles}
          onPin={(id) => (step === "map" ? showCard(id) : toggle(id))}
          onBlank={() => setFocus(null)}
          padTop={padTop}
          padBottom={130}
        />
      )}
      {step !== "intro" && subject && (subject.lat == null || subject.lng == null) && (
        <div className="absolute inset-0 flex items-center justify-center px-8 text-center text-[14px] text-muted">This one has no place on the map, so the list is the way in.</div>
      )}

      {step !== "intro" && step !== "sent" && (
        <>
          {/* Top: where, and the way out. */}
          <div ref={top} className="absolute inset-x-0 top-0 z-10 px-4 pt-[calc(env(safe-area-inset-top)+12px)]">
            <div className="flex items-center gap-2.5">
              <div className="flex h-[52px] min-w-0 flex-1 items-center gap-2.5 rounded-full px-4 shadow-[0_10px_30px_-14px_rgba(80,50,40,0.45)]" style={{ background: "var(--m-card)" }}>
                <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5 shrink-0" style={{ color: CORAL }} fill="currentColor">
                  <path d="M12 2.5a7 7 0 0 0-7 7c0 5 7 12 7 12s7-7 7-12a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" />
                </svg>
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{subject?.title ?? ""}</span>
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full shadow-[0_10px_30px_-14px_rgba(80,50,40,0.45)]" style={{ background: "var(--m-card)" }}>
                <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            {/* Clear of the box above (James, 3 Oct 2026); Similar Rent went into the +. */}
            <div className="m-rail mt-4 !gap-2 pb-1">
              {MILES.map((m) => (
                <Chip key={m} on={miles === m} onClick={() => setMiles(m)}>
                  {m} {m === 1 ? "mile" : "mi"}
                </Chip>
              ))}
              {!MILES.includes(miles) && (
                <Chip on onClick={() => setCustom(true)}>
                  {miles} miles
                </Chip>
              )}
              <button
                type="button"
                onClick={() => setCustom(true)}
                aria-label="Your own distance and filters"
                className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-[0_8px_20px_-12px_rgba(80,50,40,0.45)]"
                style={{ background: "var(--m-card)", color: CORAL }}
              >
                <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                {similarOnly && <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white" style={{ background: CORAL }} />}
              </button>
            </div>
          </div>

          {/* Foot: the nearest as cards, then the bar. */}
          {step === "map" && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 pb-[calc(env(safe-area-inset-bottom)+14px)]">
              {/* Only the bar and the map (James, 3 Oct 2026): a pin, tapped,
                  pops its home up here, and the little circle adds it. */}
              {focused ? (
                <Preview key={focused.id} kind={kind} item={focused} on={picked.has(focused.id)} onToggle={() => toggle(focused.id)} onClose={() => setFocus(null)} />
              ) : (
                <p className="mf-anim mx-auto mb-3 w-fit rounded-full px-4 py-2 text-center text-[13.5px] font-medium shadow-[0_8px_20px_-12px_rgba(80,50,40,0.45)]" style={{ background: "var(--m-card)", animation: "mf-up 320ms ease-out both" }}>
                  {inRange.length
                    ? `${inRange.length} ${inRange.length === 1 ? noun[0] : noun[1]} - tap one to see it`
                    : items?.length
                      ? `Nobody within ${miles} ${miles === 1 ? "mile" : "miles"} - try further out`
                      : "Nobody fits yet"}
                </p>
              )}
              <div className="pointer-events-auto">
              <Bar step={step} count={picked.size} onMap={() => setStep("map")} onList={() => setStep("list")} onDraft={() => setStep("draft")} />
              </div>
            </div>
          )}

          {custom && (
            <CustomSheet
              miles={miles}
              setMiles={setMiles}
              rent={(items ?? []).some((i) => i.similar != null)}
              similarOnly={similarOnly}
              setSimilarOnly={setSimilarOnly}
              onClose={() => setCustom(false)}
            />
          )}
        </>
      )}

      {step === "list" && (
        <Card onClose={() => setStep("map")} title={kind === "people" ? "Add People" : "Add Homes"} count={`${picked.size}/${inRange.length}`}>
          <ListStep kind={kind} items={inRange} picked={picked} toggle={toggle} setPicked={setPicked} />
          <button type="button" disabled={!picked.size} onClick={() => setStep("draft")} className="mt-4 h-[54px] w-full shrink-0 rounded-full text-[16px] font-semibold text-white disabled:opacity-40" style={{ background: "#141210" }}>
            {picked.size ? `Draft Email to ${word(picked.size)}` : "Add someone first"}
          </button>
        </Card>
      )}

      {step === "draft" && (
        <Card onClose={() => setStep(picked.size ? "list" : "map")} title="Draft Email" count={word(chosen.length)}>
          <Draft kind={kind} chosen={chosen} max={max} noun={noun} onPreview={onPreview} onSend={onSend} onBack={() => setStep("list")} onSent={(said) => {
              setSentSaid(said);
              setStep("sent");
            }} />
        </Card>
      )}

      {step === "sent" && <Sent said={sentSaid} onDone={onClose} />}
    </div>
  );
}

function Intro({
  kind,
  subject,
  items,
  error,
  intro,
  countLine,
  onStart,
  onClose,
}: {
  kind: "people" | "homes";
  subject: MatchSubject | null;
  items: MatchItem[] | null;
  error: string | null;
  intro: { title: string; line: string };
  countLine: string | null;
  onStart: () => void;
  onClose: () => void;
}) {
  /* Five faces round the circle - the nearest, as the reference shows. */
  const faces = (items ?? []).slice(0, 5);
  const spots = [
    { x: 50, y: 14, s: 74 },
    { x: 86, y: 26, s: 54 },
    { x: 14, y: 50, s: 60 },
    { x: 84, y: 72, s: 62 },
    { x: 38, y: 86, s: 56 },
  ];
  return (
    <div className="absolute inset-0 flex flex-col px-6 pb-[calc(env(safe-area-inset-bottom)+22px)] pt-[calc(env(safe-area-inset-top)+12px)]" style={{ background: "linear-gradient(180deg, #f2b496 0%, #ee9a82 55%, #e98a76 100%)" }}>
      <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full text-white" style={{ background: "rgba(255,255,255,0.18)" }}>
        <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>

      <div className="relative mx-auto mt-4 aspect-square w-full max-w-[340px]">
        {/* The overlapping rings. */}
        {[
          [0, 0],
          [8, 6],
          [-6, 8],
        ].map(([dx, dy], i) => (
          <span key={i} className="absolute inset-[2%] rounded-full" style={{ border: "1px solid rgba(255,255,255,0.55)", transform: `translate(${dx}%, ${dy}%)` }} />
        ))}
        {/* The circle: the subject's own photo for a home, a soft map for a tenant. */}
        <span className="mf-anim absolute inset-[14%] overflow-hidden rounded-full" style={{ background: "#f4f1ec", animation: "mf-pop 600ms cubic-bezier(0.34,1.56,0.64,1) both" }}>
          {kind === "people" && subject?.image ? (
            <img src={subject.image} alt="" className="h-full w-full object-cover" />
          ) : (
            <svg viewBox="0 0 100 100" aria-hidden className="h-full w-full">
              <path d="M-5 30 L105 18 M-5 62 L105 70 M30 -5 L38 105 M70 -5 L60 105 M-5 88 L60 40 L105 52" stroke="#fff" strokeWidth="5" fill="none" />
              <path d="M78 -5 C70 40 92 60 80 105" stroke="#f7e7c3" strokeWidth="6" fill="none" />
              <circle cx="22" cy="78" r="12" fill="#dcecd2" />
            </svg>
          )}
        </span>
        {faces.map((f, i) => {
          const s = spots[i]!;
          return (
            <span
              key={f.id}
              className="mf-anim absolute flex flex-col items-center"
              style={{ left: `${s.x}%`, top: `${s.y}%`, transform: "translate(-50%, -50%)", animation: `mf-pop 520ms ${180 + i * 110}ms cubic-bezier(0.34,1.56,0.64,1) both` }}
            >
              <span className="flex items-center justify-center overflow-hidden rounded-full bg-white text-[15px] font-semibold shadow-[0_8px_20px_-8px_rgba(120,50,30,0.5)]" style={{ width: s.s, height: s.s, border: "4px solid #fff", color: CORAL }}>
                {kind === "homes" ? (
                  f.image ? (
                    <img src={f.image} alt="" className="h-full w-full rounded-full object-cover" />
                  ) : (
                    <svg viewBox="0 0 24 24" aria-hidden className="h-[42%] w-[42%]" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3.5 10.5 12 4l8.5 6.5M5.5 9v10.5h13V9M10 19.5v-5.5h4v5.5" />
                    </svg>
                  )
                ) : (
                  initials(f.title)
                )}
              </span>
              <span aria-hidden className="-mt-[3px] h-0 w-0 border-x-[7px] border-t-[9px] border-x-transparent border-t-white" />
            </span>
          );
        })}
        {!items && !error && (
          <span className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white/40 border-t-white" style={{ animation: "mf-spin 0.9s linear infinite" }} />
        )}
      </div>

      <div className="mf-anim mt-auto text-center text-white" style={{ animation: "mf-up 520ms 120ms cubic-bezier(0.22,1,0.36,1) both" }}>
        <h1 className="m-title text-[32px] leading-[1.08]">{intro.title}</h1>
        <p className="mx-auto mt-3 max-w-[320px] text-[15px] leading-snug text-white/90">{error ?? intro.line}</p>
        {countLine && !error && <p className="mt-2 text-[14px] font-semibold text-white">{countLine}</p>}
      </div>

      <button
        type="button"
        onClick={error ? onClose : onStart}
        disabled={!items && !error}
        className="mf-anim mt-7 h-[60px] w-full shrink-0 rounded-full text-[16.5px] font-semibold text-white shadow-[0_18px_30px_-14px_rgba(0,0,0,0.6)] disabled:opacity-60"
        style={{ background: "#141210", animation: "mf-up 520ms 220ms cubic-bezier(0.22,1,0.36,1) both" }}
      >
        {error ? "Back" : items ? "Get Started" : kind === "people" ? "Finding people..." : "Finding homes..."}
      </button>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="flex h-10 shrink-0 items-center whitespace-nowrap rounded-full px-3 text-[13.5px] font-medium shadow-[0_8px_20px_-12px_rgba(80,50,40,0.45)]"
      style={on ? { background: CORAL, color: "#fff" } : { background: "var(--m-card)" }}
    >
      {children}
    </button>
  );
}

function Face({ kind, item }: { kind: "people" | "homes"; item: MatchItem }) {
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full text-[15px] font-semibold" style={{ background: "var(--m-pink-wash)", color: CORAL }}>
      {kind === "homes" ? (
        item.image ? (
          <img src={item.image} alt="" className="h-full w-full object-cover" />
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.5 10.5 12 4l8.5 6.5M5.5 9v10.5h13V9M10 19.5v-5.5h4v5.5" />
          </svg>
        )
      ) : (
        initials(item.title)
      )}
    </span>
  );
}

function AddRound({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={on ? `Take ${label} off` : `Add ${label}`}
      aria-pressed={on}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition-colors"
      style={{ background: on ? "#141210" : CORAL }}
    >
      <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {on ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <path d="M12 5v14M5 12h14" />}
      </svg>
    </button>
  );
}

/** The black pill (map, list) and the coral envelope with the count. */
function Bar({ step, count, onMap, onList, onDraft }: { step: Step; count: number; onMap: () => void; onList: () => void; onDraft: () => void }) {
  const icon = (on: boolean) => ({ color: on ? "#fff" : "rgba(255,255,255,0.5)" });
  return (
    <div className="flex items-center gap-3 px-4">
      <div className="flex h-[62px] flex-1 items-center justify-around rounded-full shadow-[0_18px_30px_-14px_rgba(0,0,0,0.6)]" style={{ background: "#141210" }}>
        <button type="button" onClick={onMap} aria-label="Map" className="flex h-12 w-14 items-center justify-center" style={icon(step === "map")}>
          <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.5 8.5l-2 5-5 2 2-5z" />
          </svg>
        </button>
        <button type="button" onClick={onList} aria-label="List" className="flex h-12 w-14 items-center justify-center" style={icon(step === "list")}>
          <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M8.5 6.5h11M8.5 12h11M8.5 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />
          </svg>
        </button>
        <button type="button" onClick={onDraft} aria-label="Draft email" className="flex h-12 w-14 items-center justify-center" style={icon(false)}>
          <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6.5h16v11H4zM4 7l8 6 8-6" />
          </svg>
        </button>
      </div>
      <button
        type="button"
        onClick={onDraft}
        aria-label={`Draft email to ${count}`}
        className="relative flex h-[62px] w-[62px] shrink-0 items-center justify-center rounded-full text-white shadow-[0_14px_26px_-10px_rgba(222,124,112,0.95)]"
        style={{ background: "linear-gradient(180deg, #f0a08c, #de7c70)" }}
      >
        <svg viewBox="0 0 24 24" aria-hidden className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 6.5h16v11H4zM4 7l8 6 8-6" />
        </svg>
        {count > 0 && (
          <span className="mf-anim absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[12px] font-bold" style={{ background: "#141210", animation: "mf-pop 300ms both" }}>
            {count}
          </span>
        )}
      </button>
    </div>
  );
}

/** A white card up from the foot over the dimmed map (the reference's Invite Friends). */
function Card({ title, count, onClose, children }: { title: string; count: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 flex items-end justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-[calc(env(safe-area-inset-top)+70px)]" style={{ background: "rgba(244,241,236,0.72)" }} onClick={onClose}>
      <div
        className="mf-anim flex max-h-full w-full max-w-[540px] flex-col rounded-[30px] p-5 shadow-[0_30px_60px_-24px_rgba(60,40,30,0.5)]"
        style={{ background: "var(--m-card)", animation: "mf-card 380ms cubic-bezier(0.22,1,0.36,1) both" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex shrink-0 items-start justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold" style={{ color: CORAL }}>
              {count}
            </p>
            <h2 className="m-title text-[26px] leading-tight">{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 flex h-10 w-10 items-center justify-center text-muted">
            <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ListStep({
  kind,
  items,
  picked,
  toggle,
  setPicked,
}: {
  kind: "people" | "homes";
  items: MatchItem[];
  picked: Set<string>;
  toggle: (id: string) => void;
  setPicked: (s: Set<string>) => void;
}) {
  const [needle, setNeedle] = useState("");
  const n = needle.trim();
  const shown = n ? items.filter((i) => searchMatches(n, i.title, i.line, i.meta)) : items;
  const allOn = shown.length > 0 && shown.every((i) => picked.has(i.id));
  return (
    <>
      <label className="flex h-[50px] shrink-0 items-center gap-3 rounded-full px-4" style={{ background: "var(--m-fill)" }}>
        <svg viewBox="0 0 24 24" aria-hidden className="h-[18px] w-[18px] text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5 20 20" />
        </svg>
        <input
          type="search"
          value={needle}
          onChange={(e) => setNeedle(e.target.value)}
          placeholder={kind === "people" ? "Find someone..." : "Find a home..."}
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
        />
      </label>
      <div className="mt-3 flex shrink-0 items-center justify-between px-1">
        <span className="text-[13.5px] text-muted">{shown.length} in range</span>
        {shown.length > 0 && (
          <button
            type="button"
            onClick={() => {
              const next = new Set(picked);
              for (const i of shown) allOn ? next.delete(i.id) : next.add(i.id);
              setPicked(next);
            }}
            className="text-[14px] font-semibold"
            style={{ color: CORAL }}
          >
            {allOn ? "Take All Off" : "Add All"}
          </button>
        )}
      </div>
      <ul className="-mx-1 mt-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1">
        {shown.map((i) => {
          const on = picked.has(i.id);
          return (
            <li key={i.id} className="flex items-center gap-3 py-2.5">
              <Face kind={kind} item={i} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15.5px] font-medium">{i.title}</span>
                <span className="block truncate text-[12.5px] text-muted">{i.line}</span>
                <span className="block truncate text-[12.5px] text-muted">{i.meta}</span>
              </span>
              <button
                type="button"
                onClick={() => toggle(i.id)}
                aria-pressed={on}
                className="h-9 shrink-0 rounded-full px-4 text-[13.5px] font-semibold transition-colors"
                style={on ? { background: "var(--m-fill)", color: "var(--m-muted)" } : { background: "#141210", color: "#fff" }}
              >
                {on ? "Added" : "+ Add"}
              </button>
            </li>
          );
        })}
        {shown.length === 0 && <li className="py-6 text-center text-[14px] text-muted">{n ? `Nothing matches "${needle.trim()}".` : "Nobody in range. Try a wider distance."}</li>}
      </ul>
    </>
  );
}

function Draft({
  kind,
  chosen,
  max,
  noun,
  onPreview,
  onSend,
  onBack,
  onSent,
}: {
  kind: "people" | "homes";
  chosen: MatchItem[];
  max: number;
  noun: [string, string];
  onPreview: (ids: string[]) => Promise<{ subject: string; html: string } | { error: string }>;
  onSend: (ids: string[]) => Promise<{ ok: boolean; said: string }>;
  onBack: () => void;
  onSent: (said: string) => void;
}) {
  const [mail, setMail] = useState<{ subject: string; html: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const ids = chosen.map((c) => c.id);
  const key = ids.join(",");
  const tooMany = chosen.length > max;

  useEffect(() => {
    if (!ids.length) return;
    setMail(null);
    setErr(null);
    void onPreview(ids).then((r) => ("error" in r ? setErr(r.error) : setMail(r)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!chosen.length) {
    return (
      <>
        <p className="py-4 text-[14.5px] text-muted">Nobody added yet. Add {noun[1]} from the map or the list first.</p>
        <button type="button" onClick={onBack} className="h-[52px] w-full rounded-full text-[15.5px] font-semibold" style={{ background: "var(--m-fill)" }}>
          Back to the List
        </button>
      </>
    );
  }

  const send = async () => {
    setSending(true);
    setSaid(null);
    const r = await onSend(ids);
    setSending(false);
    if (r.ok) onSent(r.said);
    else setSaid(r.said);
  };

  return (
    <>
      <p className="text-[13px] font-semibold text-muted">{kind === "people" ? "To, each on their own" : "The homes"}</p>
      <div className="mt-1.5 flex shrink-0 flex-wrap gap-1.5">
        {chosen.slice(0, 6).map((c) => (
          <span key={c.id} className="max-w-[160px] truncate rounded-full px-3 py-1.5 text-[13px] font-medium" style={{ background: "var(--m-pink-wash)", color: CORAL }}>
            {c.title}
          </span>
        ))}
        {chosen.length > 6 && (
          <span className="rounded-full px-3 py-1.5 text-[13px] font-medium" style={{ background: "var(--m-fill)" }}>
            +{chosen.length - 6} more
          </span>
        )}
      </div>

      <p className="mt-4 text-[13px] font-semibold text-muted">Subject</p>
      <p className="mt-1 shrink-0 text-[15.5px] font-medium">{mail?.subject ?? (err ? "-" : "Writing it...")}</p>

      <div className="relative mt-3 min-h-[180px] flex-1 overflow-hidden rounded-[20px]" style={{ background: "var(--m-fill)" }}>
        {mail ? (
          <iframe title="The email" srcDoc={mail.html} sandbox="" className="absolute left-0 top-0 h-[200%] w-[200%] origin-top-left scale-50 border-0 bg-white" />
        ) : err ? (
          <p className="p-4 text-[14px] text-muted">{err}</p>
        ) : (
          <span className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-black/10 border-t-black/50" style={{ animation: "mf-spin 0.9s linear infinite" }} />
        )}
      </div>

      {tooMany && (
        <p className="mt-3 text-[13.5px] font-medium" style={{ color: CORAL }}>
          That is {chosen.length}. Send {max} at most at a time - take some off first.
        </p>
      )}
      {said && <p className="mt-3 text-[13.5px] font-medium" style={{ color: CORAL }}>{said}</p>}

      <button
        type="button"
        onClick={send}
        disabled={sending || tooMany || !mail}
        className="mt-4 h-[54px] w-full shrink-0 rounded-full text-[16px] font-semibold text-white disabled:opacity-40"
        style={{ background: "#141210" }}
      >
        {sending ? "Sending..." : kind === "people" ? `Send to ${chosen.length} ${chosen.length === 1 ? noun[0] : noun[1]}` : `Send ${chosen.length} ${chosen.length === 1 ? noun[0] : noun[1]}`}
      </button>
      <button type="button" onClick={onBack} className="mt-2.5 h-[52px] w-full shrink-0 rounded-full text-[15.5px] font-semibold" style={{ background: "var(--m-fill)" }}>
        Back
      </button>
    </>
  );
}

function Sent({ said, onDone }: { said: string; onDone: () => void }) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center px-8 text-center text-white" style={{ background: "linear-gradient(180deg, #f2b496 0%, #e98a76 100%)" }}>
      <span className="mf-anim flex h-24 w-24 items-center justify-center rounded-full bg-white" style={{ animation: "mf-pop 560ms cubic-bezier(0.34,1.56,0.64,1) both" }}>
        <svg viewBox="0 0 24 24" aria-hidden className="h-11 w-11" fill="none" stroke={CORAL} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
      <h1 className="m-title mt-6 text-[32px]">Sent</h1>
      <p className="mt-2 max-w-[300px] text-[15px] text-white/90">{said}</p>
      <button type="button" onClick={onDone} className="mt-8 h-[58px] w-full max-w-[340px] rounded-full text-[16px] font-semibold text-white" style={{ background: "#141210" }}>
        Done
      </button>
    </div>
  );
}

/** The home (or person) behind a tapped pin, sprung up above the bar, with the little circle that adds it. */
function Preview({ kind, item, on, onToggle, onClose }: { kind: "people" | "homes"; item: MatchItem; on: boolean; onToggle: () => void; onClose: () => void }) {
  return (
    <div className="mf-anim pointer-events-auto mx-4 mb-3 overflow-hidden rounded-[28px] shadow-[0_24px_50px_-20px_rgba(60,30,20,0.55)]" style={{ background: "var(--m-card)", animation: "m-sheet-in 560ms cubic-bezier(0.22, 0.9, 0.3, 1) both" }}>
      {kind === "homes" && item.image ? (
        <div className="relative h-[150px]">
          <img src={item.image} alt="" className="h-full w-full object-cover" />
          <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full" style={{ background: "rgba(255,255,255,0.92)" }}>
            <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      ) : null}
      <div className="flex items-center gap-3 p-4">
        {!(kind === "homes" && item.image) && <Face kind={kind} item={item} />}
        <span className="min-w-0 flex-1">
          <span className="m-title block truncate text-[19px] leading-tight">{item.title}</span>
          {item.line && <span className="block truncate text-[13px] text-muted">{item.line}</span>}
          <span className="mt-0.5 block truncate text-[13.5px] font-medium">{item.meta}</span>
        </span>
        <AddRound on={on} onClick={onToggle} label={item.title} />
      </div>
    </div>
  );
}

/** "+": your own distance, and (for homes) only those at a similar rent. */
function CustomSheet({
  miles,
  setMiles,
  rent,
  similarOnly,
  setSimilarOnly,
  onClose,
}: {
  miles: number;
  setMiles: (n: number) => void;
  rent: boolean;
  similarOnly: boolean;
  setSimilarOnly: (b: boolean) => void;
  onClose: () => void;
}) {
  return (
    <Sheet label="Your own search" onClose={onClose}>
      <h2 className="m-title mb-1 px-1 text-[24px]">Your Own Search</h2>
      <p className="mb-5 px-1 text-[14px] text-muted">Pick any distance, and narrow it down.</p>
      <div className="rounded-[22px] p-5" style={{ background: "var(--m-card)" }}>
        <div className="flex items-baseline justify-between">
          <span className="text-[14px] font-semibold text-muted">Distance</span>
          <span className="m-guide-num text-[36px] leading-none">
            {miles}
            <span className="ml-1 text-[16px] font-semibold text-muted">{miles === 1 ? "mile" : "miles"}</span>
          </span>
        </div>
        <input type="range" min={1} max={30} step={1} value={miles} onChange={(e) => setMiles(Number(e.target.value))} className="mt-4 w-full accent-[var(--m-coral)]" />
        <div className="mt-1 flex justify-between text-[12px] text-muted">
          <span>1</span>
          <span>30 miles</span>
        </div>
      </div>
      {rent && (
        <button type="button" onClick={() => setSimilarOnly(!similarOnly)} className="mt-3 flex w-full items-center justify-between rounded-[22px] px-5 py-4 text-left" style={{ background: "var(--m-card)" }}>
          <span>
            <span className="block text-[15.5px] font-semibold">Similar Rent Only</span>
            <span className="block text-[13px] text-muted">Within a fifth of what they pay.</span>
          </span>
          <span className="relative inline-flex h-[30px] w-[50px] shrink-0 items-center rounded-full transition-colors" style={{ background: similarOnly ? CORAL : "var(--m-fill)" }}>
            <span className="absolute left-[2px] h-[26px] w-[26px] rounded-full bg-white shadow transition-transform" style={{ transform: similarOnly ? "translateX(20px)" : "none" }} />
          </span>
        </button>
      )}
      <button type="button" onClick={onClose} className="mt-4 h-[54px] w-full rounded-full text-[16px] font-semibold text-white" style={{ background: "#141210" }}>
        Show on the Map
      </button>
    </Sheet>
  );
}
