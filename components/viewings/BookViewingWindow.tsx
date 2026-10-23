"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ConfirmEditor, { payloadOf, type ConfirmDraft, type ConfirmEditorHandle, type ConfirmTarget, type ViewingBookingInput } from "@/components/ConfirmEditor";
import { NO_ACCESS, type Access, type AccessKind } from "@/components/listing/AccessRequest";
import type { BookedResult, ViewingBookerProps } from "@/components/ViewingBooker";
import { accessKeyFor } from "@/lib/access-key";
import { type Appt } from "@/lib/diary";
import { useDiary } from "@/lib/diary-store";
import { fetchMe } from "@/lib/me";

/**
 * BOOK A VIEWING, REBUILT (James's Claude Design, 24 Oct 2026).
 *
 * One window that stays the same size from start to finish: the booking builds
 * up on the left as a ticket, each step fills the right. Home, Time, Access,
 * Messages, Book. Behind the "Book a viewing" switch in Admin > Switches; with
 * it off, every booker is the one before (components/ViewingBooker).
 *
 * Nothing new is written anywhere. The booking itself is the caller's, exactly
 * as the old booker hands it over (onBooked: /api/viewings/book, the agent's
 * Outlook, the applicant's confirmation through /api/confirmations). After it:
 * the landlord's email is the same reviewed "viewing-landlord" one, the
 * tenant's notice goes the way every agent's own email goes (/api/messages/
 * send), and how we get in is the home's own access record (os_case_state
 * "access", the record the listing and the viewing sheet read).
 *
 * Every message is shown, editable, before Book, and nothing goes that the
 * agent switched off (17 Sep 2026: booking confirmations are reviewed).
 */

type Home = { id: string; name: string; locality: string; rent: number | null; image: string | null; propertyId?: string | null; heldNote?: string | null };
type Person = { name: string; email: string; phone: string };
type Ev = { s: number; len: number; title: string; type: "diary" | "out" | "view"; here: boolean; who: string; where: string };
type Item = { key: string; label: string; state: "wait" | "go" | "ok" | "fail"; detail?: string };

/* Usual hours, for a warning only - a booking outside them still goes. No hours are kept anywhere in the OS yet. */
const HOURS: Record<number, [number, number] | null> = { 0: null, 6: [540, 840] };
const dayHours = (d: Date): [number, number] | null => (d.getDay() in HOURS ? HOURS[d.getDay()] : [480, 1140]);

const DAYN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longDate = (d: Date) => `${DAYN[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
const shortDate = (d: Date) => `${DAYN[d.getDay()].slice(0, 3)} ${d.getDate()} ${MON[d.getMonth()].slice(0, 3)}`;
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const ampm = (m: number) => {
  const h = Math.floor(m / 60), mm = m % 60;
  return `${((h + 11) % 12) + 1}${mm ? ":" + String(mm).padStart(2, "0") : ""}${h < 12 ? "am" : "pm"}`;
};
const money = (n: number | null) => (n == null ? "Rent to be set" : `£${n.toLocaleString("en-GB")} pcm`);
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const first = (n: string) => n.trim().split(/\s+/)[0] ?? "";
const initials = (n: string) => n.split(/\s+/).filter(Boolean).map((w) => w[0]!.toUpperCase()).slice(0, 2).join("");
const minsOf = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
/* "7 (flat 2) Fettes Row, Edinburgh" -> "7 (flat 2) fettes row": the part a diary entry carries. */
const street = (name: string) => name.split(",")[0].trim().toLowerCase();

const PATHS: Record<string, string> = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z", cal: "M4 6h16v14H4zM4 10h16M9 3v4M15 3v4", clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  key: "M15.5 12.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12.3 11.7 4 20M7 17l2 2M9.5 14.5l2 2", mail: "M4 6h16v12H4zM4 7l8 6 8-6", user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  arrow: "M5 12h14M13 6l6 6-6 6", back: "M19 12H5M11 6l-6 6 6 6", check: "M5 12.5l4.5 4.5L19 7.5", warn: "M12 9v4M12 17h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5", lock: "M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3", door: "M6 21V4h12v17M4 21h16M14 12h.01",
  people: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20a7 7 0 0 1 14 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 13.5a6 6 0 0 1 4 6", walk: "M13 4a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM9 21l2-6 3 3v3M8 11l3-4 3 2 2 3M11 7l-1 5",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z", bell: "M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0",
  star: "M12 3l2.6 5.6 6 .7-4.5 4.1 1.3 6L12 16.4 6.6 19.4l1.3-6L3.4 9.3l6-.7z", x: "M6 6l12 12M18 6 6 18",
};
function Ic({ k, sw, size }: { k: string; sw?: number; size?: number }) {
  return (
    <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw ?? 1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={size ? { width: size, height: size } : undefined}>
      <path d={PATHS[k]} />
    </svg>
  );
}

/* A drawn house until a photo is wired in, coloured from the id so each home keeps its own. */
const PAL = [["#e3e3d3", "#2e3829", "#f5e3c7"], ["#e3dacc", "#aa4a2b", "#f5e3c7"], ["#f5e3c7", "#66785b", "#ffffff"], ["#f0f0ee", "#141413", "#f5e3c7"], ["#f9e2d9", "#2e3829", "#ffffff"]];
function Thumb({ home }: { home: Home }) {
  if (home.image) return <img src={home.image} alt="" loading="lazy" />;
  const h = [...home.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const [bg, body, win] = PAL[h % PAL.length];
  const flat = /flat|apartment|room|studio/i.test(home.name);
  return (
    <svg viewBox="0 0 160 110" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="160" height="110" fill={bg} />
      <rect y="96" width="160" height="14" fill={body} opacity=".12" />
      {flat ? (
        <>
          <rect x="44" y="18" width="72" height="80" rx="3" fill={body} />
          {[0, 1, 2, 3].flatMap((r) => [0, 1, 2, 3].map((c) => <rect key={`${r}${c}`} x={51 + c * 16} y={26 + r * 17} width="10" height="12" rx="2" fill={win} />))}
        </>
      ) : (
        <>
          <path d="M30 54 l25 -24 25 24 v44 h-50z M80 54 l25 -24 25 24 v44 h-50z" fill={body} />
          {[40, 58, 90, 108].map((x) => <rect key={x} x={x} y="62" width="12" height="12" rx="2" fill={win} />)}
          <rect x="50" y="80" width="10" height="18" rx="5" fill={win} />
          <rect x="100" y="80" width="10" height="18" rx="5" fill={win} />
        </>
      )}
    </svg>
  );
}

const STEPS: [string, string, string][] = [["Home", "Which home?", "’s viewing"], ["Time", "When can", " come?"], ["Access", "How will", "you get in?"], ["Messages", "Who we’ll", "tell"], ["Book", "Check", "and book"]];
const LENS = [15, 30, 45, 60];
const ACCESS: { id: AccessKind; icon: string; label: string; sub: string }[] = [
  { id: "vacant", icon: "key", label: "Office keys", sub: "Nobody lives there. Sign the keys out of the office." },
  { id: "lockbox", icon: "lock", label: "Key safe", sub: "The code from the home’s access record, for your team only." },
  { id: "tenant", icon: "door", label: "The tenant lets us in", sub: "Someone living there opens the door." },
  { id: "landlord", icon: "people", label: "The landlord meets us", sub: "They’ll be there with their own keys." },
];

export default function BookViewingWindow(props: ViewingBookerProps) {
  const { open, onClose, lead, properties, agent, occupant = null, onBooked, firstId = null, leadId = null, skipProperty = false, onAddAnother } = props;
  const who = lead as Person;
  const whoFirst = first(who?.name ?? "") || "They";
  const [now, setNow] = useState(() => new Date());
  const today = useMemo(() => startOfDay(now), [now]);
  const DAYS = useMemo(() => Array.from({ length: 63 }, (_, k) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + k)), [today]);

  /* ── the homes: the caller's, then the whole live book, held homes saying why ── */
  const [book, setBook] = useState<Home[] | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    Promise.all([
      fetch("/api/listings", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/listings/held", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    ])
      .then(([j, h]) => {
        if (!live || !j?.ok || !Array.isArray(j.listings)) return setBook((b) => b ?? []);
        const held = (h?.ok ? h.held : {}) as Record<string, { words: string }>;
        setBook(
          (j.listings as Array<Home & { letAgreed?: boolean }>)
            .filter((l) => !l.letAgreed || held[String(l.id)])
            .map((l) => ({ id: String(l.id), name: l.name, locality: l.locality, rent: l.rent, image: l.image, propertyId: l.propertyId ?? null, heldNote: held[String(l.id)]?.words ?? null }))
        );
      })
      .catch(() => live && setBook((b) => b ?? []));
    return () => {
      live = false;
    };
  }, [open]);
  const homes = useMemo(() => {
    const seen = new Set<string>();
    return [...properties, ...(book ?? [])].filter((h) => (seen.has(String(h.id)) ? false : (seen.add(String(h.id)), true))).map((h) => ({ ...h, id: String(h.id) }));
  }, [properties, book]);

  /* ── state ── */
  const [step, setStep] = useState(0);
  const [max, setMax] = useState(0);
  const [homeId, setHomeId] = useState<string>("");
  const [q, setQ] = useState("");
  const [off, setOff] = useState(0);
  const [day, setDay] = useState<Date>(today);
  const [start, setStart] = useState<number | null>(null);
  const [len, setLen] = useState(30);
  const [self, setSelf] = useState(false);
  const [access, setAccess] = useState<AccessKind | null>(null);
  const [code, setCode] = useState("");
  const [tell, setTell] = useState({ applicant: true, landlord: true, tenant: true });
  const [tab, setTab] = useState<"applicant" | "landlord" | "tenant">("applicant");
  const [notice, setNotice] = useState<{ subject: string; body: string; touched: boolean }>({ subject: "", body: "", touched: false });
  const [items, setItems] = useState<Item[] | null>(null);
  const [done, setDone] = useState<{ said: string; viewingId: string | null; failed: boolean } | null>(null);
  const paneRef = useRef<HTMLElement>(null);
  const [pane, setPane] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!open) return;
    const el = paneRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPane({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  });
  const paneW = pane.w;
  const appEd = useRef<ConfirmEditorHandle>(null);
  const llEd = useRef<ConfirmEditorHandle>(null);
  const [appDraft, setAppDraft] = useState<ConfirmDraft | null>(null);
  const [llDraft, setLlDraft] = useState<ConfirmDraft | null>(null);

  /* The first day with time left in it: today until the last half hour, else the next open day. */
  const openDayFrom = (n: Date) => {
    const t = startOfDay(n);
    for (let k = 0; k < 14; k++) {
      const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() + k), h = dayHours(d);
      if (h && (k > 0 || n.getHours() * 60 + n.getMinutes() < h[1] - 30)) return d;
    }
    return t;
  };

  /* Reset on open. Starting from a listing, the home is chosen: open on the time. */
  useEffect(() => {
    if (!open) return;
    const startHome = firstId ?? properties[0]?.id ?? "";
    setHomeId(String(startHome));
    const jump = Boolean(skipProperty && firstId);
    setStep(jump ? 1 : 0);
    setMax(jump ? 1 : 0);
    setQ("");
    setOff(0);
    const n = new Date();
    setNow(n);
    setDay(openDayFrom(n));
    setStart(null);
    setLen(30);
    setSelf(false);
    setAccess(null);
    setCode("");
    setTell({ applicant: true, landlord: true, tenant: true });
    setTab("applicant");
    setNotice({ subject: "", body: "", touched: false });
    setItems(null);
    setDone(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && !items && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose, items]);

  const home: Home | null = homes.find((h) => h.id === homeId) ?? null;

  /* ── who lives there, the landlord, the keys and how we get in: read for the chosen home ── */
  const [people, setPeople] = useState<{ tenant: Person | null; landlord: string | null; known: boolean } | null>(null);
  const [keys, setKeys] = useState<string | null>(null);
  const [record, setRecord] = useState<Access | null>(null);
  const accessKey = home ? accessKeyFor({ listingId: home.id, propertyId: home.propertyId }) : null;
  useEffect(() => {
    if (!open || !home) return;
    let live = true;
    setPeople(null);
    setKeys(null);
    setRecord(null);
    const fromCaller = home.id === String(firstId) && occupant ? { name: occupant.name, email: occupant.email, phone: occupant.phone } : null;
    if (home.propertyId) {
      fetch(`/api/property/people?id=${encodeURIComponent(home.propertyId)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j: { ok?: boolean; tenants?: Person[]; landlord?: { name?: string } | null }) => {
          if (!live) return;
          const t = Array.isArray(j?.tenants) && j.tenants.length ? j.tenants[0] : null;
          setPeople({ tenant: fromCaller ?? (t ? { name: t.name, email: t.email ?? "", phone: t.phone ?? "" } : null), landlord: j?.landlord?.name ?? null, known: Boolean(j?.ok) });
        })
        .catch(() => live && setPeople({ tenant: fromCaller, landlord: null, known: false }));
      const qs = new URLSearchParams({ property: home.propertyId, listing: home.id });
      fetch(`/api/property/keys?${qs}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { keys?: { label: string }[] } | null) => live && setKeys(j?.keys?.[0]?.label ?? null))
        .catch(() => undefined);
    } else {
      setPeople({ tenant: fromCaller, landlord: null, known: false });
    }
    if (accessKey) {
      fetch(`/api/case-state?kind=access&id=${encodeURIComponent(accessKey)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j: { payload?: Access | null; stored?: boolean }) => {
          if (!live) return;
          const a = j?.payload ? { ...NO_ACCESS, ...j.payload } : { ...NO_ACCESS };
          setRecord(j?.stored === false ? null : a);
          if (a.kind) setAccess((cur) => cur ?? a.kind);
          if (a.lockboxCode) setCode((c) => c || a.lockboxCode || "");
        })
        .catch(() => live && setRecord(null));
    }
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, home?.id]);
  const tenant = people?.tenant ?? null;

  /* ── the diary: the booking agent's own day, as the old booker reads it ── */
  const { appts: allAppts, everything, loading: diaryLoading, outlook } = useDiary();
  const [meName, setMeName] = useState("");
  useEffect(() => {
    if (!open) return;
    let live = true;
    fetchMe().then((j) => live && j?.user?.name && setMeName(j.user.name)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [open]);
  const agentName = agent.trim() || meName.trim() || "You";
  const appts = useMemo(() => {
    if (!everything) return allAppts;
    const want = (agent.trim() || meName.trim()).toLowerCase();
    if (!want) return allAppts;
    const f = want.split(" ")[0];
    return allAppts.filter((a) => {
      const w = (a.agent ?? "").trim().toLowerCase();
      return w ? w === want || w.split(" ")[0] === f : false;
    });
  }, [allAppts, everything, agent, meName]);

  const offsetOf = (d: Date) => Math.round((startOfDay(d).getTime() - today.getTime()) / 86400000);
  const isHere = (a: Appt, h: Home | null) => Boolean(h && a.kind === "viewing" && `${a.where} ${a.what}`.toLowerCase().includes(street(h.name)));
  const evs = (d: Date): Ev[] =>
    appts
      .filter((a) => a.day === offsetOf(d) && /^\d{1,2}:\d{2}$/.test(a.start))
      .map((a) => ({
        s: minsOf(a.start),
        len: Math.max(5, a.mins || 30),
        title: a.what || "Busy",
        type: a.kind === "viewing" || a.kind === "slot" ? "view" : /^busy$/i.test((a.what ?? "").trim()) ? "out" : "diary",
        here: isHere(a, home),
        who: a.who || "",
        where: a.where || a.what || "",
      }));
  const dayObj = day;
  const whenDate = start == null ? null : new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(start / 60), start % 60);
  const startsAt = whenDate ? whenDate.toISOString() : null;

  const clashes = () => (start == null ? [] : evs(dayObj).filter((e) => start < e.s + e.len && e.s < start + len));
  const issues = (): string[] => {
    const out: string[] = [];
    if (start == null || !whenDate) return out;
    const hrs = dayHours(dayObj);
    if (whenDate < now) out.push("That time has already gone. Book it anyway if the visit happened.");
    if (!hrs) out.push("The office is closed on Sundays. You can still book it if you’re happy to go.");
    else if (start < hrs[0] || start + len > hrs[1]) out.push(`Outside the usual hours (${hm(hrs[0])} to ${hm(hrs[1])}).`);
    clashes().forEach((e) => out.push(`Clashes with ${e.type === "view" ? `a viewing${e.where ? " at " + e.where : ""}` : e.type === "out" ? "time marked busy" : e.title}, ${hm(e.s)} to ${hm(e.s + e.len)}.`));
    if (tenant && tell.tenant && whenDate > now && whenDate.getTime() - now.getTime() < 24 * 3600e3) out.push(`Less than 24 hours’ notice for ${tenant.name}, who lives there. Pick a later time, or check they’re happy with it first.`);
    return out;
  };

  const freeStarts = (d: Date, l: number) => {
    const hrs = dayHours(d);
    if (!hrs) return [] as number[];
    const e = evs(d), out: number[] = [];
    for (let m = hrs[0]; m + l <= hrs[1]; m += 30) {
      const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(m / 60), m % 60);
      if (at <= now) continue;
      if (e.some((x) => m < x.s + x.len && x.s < m + l)) continue;
      out.push(m);
    }
    return out;
  };
  const suggestions = (d: Date) => {
    const e = evs(d);
    const scored = freeStarts(d, len).map((m) => {
      let score = 0, why = "";
      e.forEach((x) => {
        if (x.type !== "view") return;
        const touching = x.s + x.len === m || m + len === x.s;
        if (touching && x.here) {
          score += 6;
          why = `${x.s + x.len === m ? "Straight after" : "Just before"} ${x.who ? x.who + "’s" : "a"} viewing here`;
        } else if (touching && home && x.where.toLowerCase().includes(home.locality.split(/[ ,]/)[0].toLowerCase())) {
          score += 2;
          why = why || `Next to your viewing at ${x.where}`;
        }
      });
      if (m >= 1020) {
        score += 1;
        why = why || "After work, easier for most renters";
      }
      return { m, score, why: why || "Your diary is clear either side" };
    });
    scored.sort((a, b) => b.score - a.score || a.m - b.m);
    return scored.slice(0, 3).sort((a, b) => a.m - b.m);
  };
  const groupChance = () => {
    for (const d of DAYS) {
      for (const v of evs(d).filter((x) => x.type === "view" && x.here)) {
        const m = v.s + v.len;
        const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(m / 60), m % 60);
        if (at <= now) continue;
        if (tenant && at.getTime() - now.getTime() < 24 * 3600e3) continue;
        if (freeStarts(d, len).includes(m)) return { d, m, who: v.who };
      }
    }
    return null;
  };
  const upcomingHere = (h: Home) => appts.filter((a) => a.day >= 0 && isHere(a, h)).length;

  /* ── the messages ── */
  const booking: ViewingBookingInput | null =
    startsAt && leadId && home && who
      ? { leadId, listingId: home.id, applicantName: who.name, applicantEmail: who.email, address: home.name, startsAt, minutes: len, unaccompanied: self }
      : null;
  const appTarget: ConfirmTarget | null = booking ? { kind: "viewing", booking } : null;
  const llTarget: ConfirmTarget | null = booking ? { kind: "viewing-landlord", booking } : null;
  const appOk = Boolean(appDraft?.ok && appDraft.to && !appDraft.blocked);
  const llOk = Boolean(llDraft?.ok && llDraft.to && !llDraft.blocked);
  const tenantOk = Boolean(tenant?.email && tenant.email.includes("@"));
  const llNeeded = access === "landlord";
  const sendApp = tell.applicant && appOk;
  const sendLl = (tell.landlord || llNeeded) && llOk;
  const sendTenant = Boolean(tenant) && tenantOk && tell.tenant;
  const llName = people?.landlord || (llOk ? llDraft?.toName : "") || "";
  /* Things only the messages can tell us: the way in needs somebody we can't write to. */
  const reach: string[] = [
    ...(access === "landlord" && llDraft && !llOk ? ["The landlord meets us, but there’s no landlord on file to ask. Ring them yourself, or pick another way in."] : []),
    ...(access === "tenant" && tenant && !tenantOk ? [`${tenant.name} lets us in, but we have no email for them. Ring them yourself.`] : []),
  ];

  /* The tenant's notice, drafted from the booking until the agent edits it. */
  useEffect(() => {
    if (!tenant || !whenDate || notice.touched) return;
    const when = `${longDate(whenDate)} at ${ampm(start!)}`;
    const asked = access === "tenant";
    setNotice({
      touched: false,
      subject: asked ? `Could you let us in on ${shortDate(whenDate)}?` : `Notice of a viewing on ${shortDate(whenDate)}`,
      body:
        `Hi ${first(tenant.name) || "there"},\n\n` +
        `This is your notice that we’d like to show your home to someone on ${when}, for about ${len} minutes.\n\n` +
        (asked
          ? `Could you be in to let ${self ? "them" : first(agentName)} in? Reply to say yes, or tell us a time that suits you better.\n\n`
          : `${self ? "They’ll let themselves in." : `${agentName} will knock first, and let themselves in if you’re out.`} If the time doesn’t work for you, reply and we’ll move it.\n\n`) +
        `Thank you for helping.\n\n${self ? "The Letting Experts" : `${agentName}\nThe Letting Experts`}`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.name, startsAt, len, access, self, agentName]);

  /* ── moving about ── */
  const canNext = () => (step === 0 ? Boolean(home) : step === 1 ? start != null : step === 2 ? Boolean(access) && !(access === "lockbox" && !code.trim()) : step === 3 ? !(appTarget && tell.applicant && appDraft === null) : true);
  const go = (n: number) => {
    if (n < 0 || n > max + 1 || (n >= 1 && !home)) return;
    setStep(n);
    setMax((m) => Math.max(m, n));
  };

  /* ── book it: the caller books and confirms, then the landlord, the tenant and the access record ── */
  async function bookIt() {
    if (!home || !startsAt || !whenDate || items) return;
    const appSubject = appEd.current?.subject;
    const appHtml = appEd.current?.html();
    const llSubject = llEd.current?.subject;
    const llHtml = llEd.current?.html();
    const list: Item[] = [
      { key: "book", label: "Booked into the diary", state: "go" },
      ...(sendApp ? [{ key: "app", label: `Confirmation to ${whoFirst}`, state: "wait" as const }] : []),
      ...(sendLl ? [{ key: "ll", label: `Email to ${llName || "the landlord"}`, state: "wait" as const }] : []),
      ...(sendTenant ? [{ key: "tenant", label: `${access === "tenant" ? "Notice and access request" : "Notice"} to ${tenant!.name}`, state: "wait" as const }] : []),
      ...(accessKey ? [{ key: "access", label: "How we get in, saved to the home", state: "wait" as const }] : []),
    ];
    const set = (k: string, state: Item["state"], detail?: string) => setItems((cur) => (cur ?? list).map((i) => (i.key === k ? { ...i, state, detail } : i)));
    setItems(list);
    let res: BookedResult | void;
    try {
      res = await onBooked({
        when: `${shortDate(whenDate)} · ${hm(start!)}`,
        property: home.name,
        locality: home.locality,
        who: who.name,
        whenPretty: `${longDate(whenDate)} at ${ampm(start!)}`,
        startsAt,
        minutes: len,
        propertyId: home.propertyId ?? null,
        listingId: home.id,
        ...(self ? { unaccompanied: true } : {}),
        confirmation: sendApp ? { send: true, subject: appSubject, html: appHtml, again: Boolean(appDraft?.alreadySent) } : { send: false },
      });
    } catch (e) {
      res = { said: (e as Error)?.message ?? "The booking did not go through.", failed: true };
    }
    const said = res?.said ?? "";
    if (res?.failed) {
      set("book", "fail", said || "The booking did not go through.");
      setDone({ said, viewingId: null, failed: true });
      return;
    }
    /* The caller's first sentence is the calendar's answer: "In your Outlook calendar." or why not. */
    const cal = said.split(/(?<=\.)\s+/)[0] ?? "";
    set("book", "ok", /outlook calendar/i.test(cal) ? undefined : cal || undefined);
    if (sendApp) {
      const bad = /did not send|didn't send|not sent/i.test(said);
      set("app", bad ? "fail" : "ok", bad ? said.match(/The confirmation did not send[^.]*\.?/i)?.[0] ?? "It did not send. Send it from the lead." : undefined);
    }
    const viewingId = res?.viewingId ?? null;
    const requests = { ...(record?.requests ?? {}) };
    if (sendLl && llTarget) {
      set("ll", "go");
      const r = await fetch("/api/confirmations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "send", ...payloadOf(llTarget), subject: llSubject, html: llHtml, again: Boolean(llDraft?.alreadySent) }),
      })
        .then((x) => x.json() as Promise<{ sent?: boolean; detail?: string; error?: string }>)
        .catch(() => null);
      set("ll", r?.sent ? "ok" : "fail", r?.sent ? undefined : String(r?.detail ?? r?.error ?? "The connection dropped."));
      if (r?.sent && viewingId && access === "landlord") requests[viewingId] = { viewingId, when: startsAt, to: llDraft?.to ?? "", requestedAt: new Date().toISOString(), grantedAt: null };
    }
    if (sendTenant && tenant) {
      set("tenant", "go");
      const r = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: tenant.email, subject: notice.subject, body: notice.body, intent: "send" }),
      })
        .then((x) => x.json() as Promise<{ sent?: boolean; reason?: string; error?: string }>)
        .catch(() => null);
      set("tenant", r?.sent ? "ok" : "fail", r?.sent ? undefined : String(r?.reason ?? r?.error ?? "The connection dropped."));
      if (r?.sent && viewingId && access === "tenant") requests[viewingId] = { viewingId, when: startsAt, to: tenant.email, requestedAt: new Date().toISOString(), grantedAt: null };
    }
    if (accessKey && access) {
      set("access", "go");
      const base = record ?? { ...NO_ACCESS };
      const from = access === "tenant" ? tenant : null;
      const payload: Access = {
        ...base,
        kind: access,
        name: access === "tenant" ? from?.name ?? base.name : access === "landlord" ? people?.landlord ?? base.name : base.name,
        email: access === "tenant" ? from?.email ?? base.email : base.email,
        phone: access === "tenant" ? from?.phone ?? base.phone : base.phone,
        ...(access === "lockbox" ? { lockboxCode: code.trim() } : {}),
        requests,
      };
      /* A record that could not be read is never written over: it may hold a real one. */
      const r = record
        ? await fetch("/api/case-state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "access", id: accessKey, payload }) })
            .then((x) => x.ok)
            .catch(() => false)
        : false;
      set("access", r ? "ok" : "fail", r ? undefined : record ? "It didn’t save. Set it on the listing." : "The home’s access record couldn’t be read, so it wasn’t changed.");
    }
    setDone({ said, viewingId, failed: false });
  }

  if (!open || !who) return null;
  const sending = Boolean(items && !done);
  const finished = Boolean(done);
  const st = STEPS[step];
  const title = sending ? (
    <>Booking <span>it in</span></>
  ) : finished ? (
    done!.failed ? <>Not <span>booked</span></> : <>Viewing <span>booked</span></>
  ) : step === 0 ? (
    <>{st[1]} <span>{whoFirst}{st[2]}</span></>
  ) : step === 1 ? (
    <>{st[1]} <span>{whoFirst}{st[2]}</span></>
  ) : (
    <>{st[1]} <span>{st[2]}</span></>
  );
  const iss = [...issues(), ...(step >= 3 ? reach : [])];
  const accessLabel = access ? ACCESS.find((a) => a.id === access)?.label ?? "" : null;
  const telling = [sendApp && whoFirst, sendLl && "the landlord", sendTenant && tenant?.name].filter(Boolean).join(", ") || "Nobody";

  return createPortal(
    <div className="bvw">
      <div className="bv open" role="dialog" aria-modal="true" aria-label="Book a viewing">
        <div className="bv-scrim" onClick={() => !sending && onClose()} />
        <div className="bv-box">
          <header className="bv-head">
            <h2>{title}</h2>
            <nav className="steps" aria-label="Booking steps">
              {STEPS.map((s, k) => (
                <span key={s[0]} style={{ display: "contents" }}>
                  {k ? <span className="ln" /> : null}
                  <button className={`${finished || k < step ? "done" : ""}${k === step && !finished ? " on" : ""}`} disabled={k > max || finished || sending} onClick={() => go(k)}>
                    <i>{finished || k < step ? "✓" : k + 1}</i>
                    <span>{s[0]}</span>
                  </button>
                </span>
              ))}
            </nav>
            <button className="x" aria-label="Close" onClick={() => !sending && onClose()}>
              <Ic k="x" sw={2} />
            </button>
          </header>

          <div className="bv-body">
            <aside className="tk" aria-label="The booking so far">
              {home ? (
                <div className="tk-home">
                  <div className="ph"><Thumb home={home} /></div>
                  <div>
                    <b>{home.name}</b>
                    <span>{home.locality} · {money(home.rent)}</span>
                  </div>
                </div>
              ) : null}
              <div className="tk-who">
                <span className="av">{initials(who.name)}</span>
                <div>
                  <b>{who.name}</b>
                  <span>{who.phone || who.email || "No contact details"}</span>
                </div>
              </div>
              <div className="tk-rows">
                {(
                  [
                    ["cal", "When", whenDate ? `${longDate(whenDate)}, ${ampm(start!)}` : null],
                    ["clock", "Length", start != null ? `${len} minutes · ${hm(start)} to ${hm(start + len)}` : null],
                    ["user", "Going", start != null ? (self ? `${whoFirst} on their own` : agentName) : null],
                    ["key", "Getting in", accessLabel],
                    ["mail", "Telling", max >= 3 ? telling : null],
                  ] as [string, string, string | null][]
                ).map((r) => (
                  <div key={r[1]} className={`tk-row${r[2] ? " set" : ""}`}>
                    <Ic k={r[0]} />
                    <div>
                      <small>{r[1]}</small>
                      <b className={r[2] ? "" : "empty"}>{r[2] ?? "Not yet"}</b>
                    </div>
                  </div>
                ))}
              </div>
              {iss.length && step > 1 && !finished ? (
                <div className="wn">
                  <Ic k="warn" />
                  <span>{iss.length === 1 ? "One thing to check" : `${iss.length} things to check`} before you book.</span>
                </div>
              ) : null}
            </aside>

            <section className="pane" ref={paneRef}>
              <div className={`pane-in${finished || sending ? " full" : ""}`} key={finished ? "done" : sending ? "sending" : step}>
                {sending || finished ? (
                  <Progress items={items!} done={done} whenDate={whenDate!} start={start!} whoFirst={whoFirst} home={home!} />
                ) : step === 0 ? (
                  paneHome()
                ) : step === 1 ? (
                  paneTime()
                ) : step === 2 ? (
                  paneAccess()
                ) : step === 4 ? (
                  paneBook()
                ) : null}
                {/* Kept mounted from the first visit to the end, hidden off its step: Book reads the edited emails out of it. */}
                {max >= 3 && !sending && !finished ? <div hidden={step !== 3}>{paneMsgs()}</div> : null}
              </div>
            </section>
          </div>

          <footer className="bv-foot">{foot()}</footer>
        </div>
      </div>
    </div>,
    document.body
  );

  /* ════════════════════ the panes ════════════════════ */

  function paneHome() {
    const enq = firstId ? homes.find((h) => h.id === String(firstId)) ?? null : null;
    const ql = q.trim().toLowerCase();
    const list = homes.filter((h) => h.id !== enq?.id && (!ql || `${h.name} ${h.locality}`.toLowerCase().includes(ql)));
    const area = enq ? enq.locality.split(/[ ,]/)[0] : "";
    const near = area ? list.filter((h) => h.locality.toLowerCase().startsWith(area.toLowerCase())) : [];
    const rest = list.filter((h) => !near.includes(h));
    const row = (h: Home) => (
      <button key={h.id} className={`hm${homeId === h.id ? " sel" : ""}`} onClick={() => setHomeId(h.id)}>
        <span className="ph"><Thumb home={h} /></span>
        <span style={{ minWidth: 0 }}>
          <b>{h.name}</b>
          <span>{h.locality} · {money(h.rent)}</span>
          {h.heldNote ? <span className="w">{h.heldNote}</span> : null}
        </span>
        <span className="radio" />
      </button>
    );
    return (
      <>
        <p className="lede">{enq ? `${whoFirst} asked about this one. Book it, or pick another home if they’d like to see something else too.` : `Pick the home ${whoFirst} is going to see.`}</p>
        {enq ? (
          <button className={`feature${homeId === enq.id ? " sel" : ""}`} onClick={() => setHomeId(enq.id)}>
            <span className="ph"><Thumb home={enq} /></span>
            <span className="in">
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="pill coral">From their enquiry</span>
                <span className="radio chk" />
              </span>
              <b>{enq.name}</b>
              <span style={{ color: "var(--muted)" }}>{enq.locality} · {money(enq.rent)}</span>
              <span className="meta">
                {homeId === enq.id && people ? (
                  tenant ? <span className="pill man">{tenant.name} lives here</span> : people.known ? <span className="pill sage">Nobody living there on file</span> : null
                ) : null}
                {homeId === enq.id && people?.landlord ? <span className="pill">Landlord: {people.landlord}</span> : null}
                <span className="pill">{(() => { const n = upcomingHere(enq); return n ? `${n} other viewing${n > 1 ? "s" : ""} booked` : "No other viewings yet"; })()}</span>
              </span>
            </span>
          </button>
        ) : null}
        <div className="find">
          <h3>{enq ? "Or a different home" : "Homes on the market"}</h3>
          <label className="search">
            <Ic k="search" />
            <input autoFocus={!enq} placeholder="Street, area or postcode" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search homes" />
          </label>
        </div>
        {book === null ? <p className="lede loading">Reading the homes on the market…</p> : null}
        {near.length ? (
          <>
            <div className="k grp">Near the home they asked about · {area}</div>
            <div className="homes">{near.map(row)}</div>
          </>
        ) : null}
        {rest.length ? (
          <>
            <div className="k grp">{near.length ? "Everywhere else" : "All homes"}</div>
            <div className="homes">{rest.slice(0, ql ? 60 : 40).map(row)}</div>
          </>
        ) : null}
        {book !== null && !list.length && ql ? <p className="lede" style={{ marginTop: 14 }}>No homes match that. Try a postcode.</p> : null}
      </>
    );
  }

  function paneTime() {
    const d = dayObj, sug = suggestions(d), gc = groupChance();
    const n = paneW && paneW < 760 ? 7 : 14;
    const win = DAYS.slice(off, off + n);
    const gcOther = gc && keyOf(gc.d) !== keyOf(d) ? gc : null;
    const sugs = gcOther ? sug.slice(0, 2) : sug;
    return (
      <>
        <div className="strip">
          <button className="nav" disabled={!off} aria-label="Earlier" onClick={() => setOff(Math.max(0, off - 7))}><Ic k="back" /></button>
          <div className="days" role="tablist" aria-label="Days" style={{ ["--n" as string]: n }}>
            {win.map((x) => {
              const hrs = dayHours(x), isToday = keyOf(x) === keyOf(today);
              const gone = isToday && hrs != null && now.getHours() * 60 + now.getMinutes() >= hrs[1];
              const busy = hrs ? evs(x).reduce((a, e) => a + e.len, 0) / (hrs[1] - hrs[0]) : 1;
              const here = evs(x).some((e) => e.type === "view" && e.here);
              return (
                <button key={keyOf(x)} className={`day${keyOf(x) === keyOf(d) ? " on" : ""}${!hrs || gone ? " off" : ""}`} onClick={() => { setDay(x); if (start != null && !freeStarts(x, len).includes(start)) setStart(null); }}>
                  {here ? <span className="here" title="A viewing is already booked here" /> : null}
                  <small>{isToday ? "Today" : DAYN[x.getDay()].slice(0, 3)}</small>
                  <b>{x.getDate()}</b>
                  <span className="cap"><i style={{ width: `${Math.round(Math.min(1, busy) * 100)}%` }} /></span>
                  <span className="tag">{!hrs ? "Closed" : gone ? "Gone" : `${freeStarts(x, len).length} free`}</span>
                </button>
              );
            })}
          </div>
          <button className="nav" disabled={off + n >= DAYS.length} aria-label="Later" onClick={() => setOff(Math.min(DAYS.length - n, off + 7))}><Ic k="arrow" /></button>
        </div>
        <div className="tgrid">
          <div>
            <div className="dayhead">
              <b>
                {longDate(d)}
                {off ? <button className="today" onClick={() => { setOff(0); setDay(openDayFrom(new Date())); }}>Back to today</button> : null}
              </b>
              <span className="legend">
                <span><i style={{ background: "var(--coral)" }} />{whoFirst}</span>
                <span><i style={{ background: "var(--sage-soft)", border: "1px solid var(--sage)" }} />Viewing here</span>
                <span><i style={{ background: "var(--oat)" }} />Other viewing</span>
                <span><i style={{ background: "var(--well)" }} />Busy</span>
              </span>
            </div>
            {diaryLoading ? <p className="lede loading" style={{ margin: "0 0 8px" }}>Reading your diary…</p> : null}
            {outlook && outlook.state !== "connected" ? <p className="lede" style={{ margin: "0 0 8px", fontSize: 12.5 }}>Your Outlook isn’t drawn in, so times only blocked out there won’t show here.</p> : null}
            <Timeline
              key={keyOf(d)}
              d={d}
              today={today}
              now={now}
              row={rowFor(d)}
              start={start}
              len={len}
              evs={evs(d)}
              label={`${whoFirst} · ${self ? "self-guided" : `with ${first(agentName)}`}`}
              aria={who.name}
              onPick={setStart}
              onDrag={(s2, l2) => {
                setStart(s2);
                setLen(l2);
              }}
            />
          </div>
          <div className="side-col">
            <div className="box">
              <h4>Suggested for {keyOf(d) === keyOf(today) ? "today" : DAYN[d.getDay()]}<span className="k" style={{ letterSpacing: ".06em" }}>{len} min</span></h4>
              {gcOther ? (
                <button className="sug grp" onClick={() => pick(gcOther.d, gcOther.m)}>
                  <b>{shortDate(gcOther.d)}, {hm(gcOther.m)}</b>
                  <span>Straight after {gcOther.who ? `${gcOther.who}’s` : "a"} viewing here. One trip, two viewings.</span>
                  <i><Ic k="arrow" /></i>
                </button>
              ) : null}
              {sugs.length ? (
                sugs.map((x) => (
                  <button key={x.m} className={`sug${start === x.m ? " on" : ""}${x.score >= 6 ? " grp" : ""}`} onClick={() => pick(d, x.m)}>
                    <b>{hm(x.m)} to {hm(x.m + len)}</b>
                    <span>{x.why}</span>
                    <i>{start === x.m ? <Ic k="check" sw={2.2} /> : <Ic k="arrow" />}</i>
                  </button>
                ))
              ) : (
                <p className="lede" style={{ margin: 0, fontSize: 13 }}>{dayHours(d) ? "No free time left on this day." : "The office is closed. Pick another day, or click the diary to book anyway."}</p>
              )}
            </div>
            <div className="box">
              <h4>The viewing</h4>
              <div className="fld">
                <span className="k2">Starts</span>
                <div className="tpick">
                  <button aria-label="15 minutes earlier" onClick={() => nudge(-15)}><Ic k="back" /></button>
                  <div className={`t${start == null ? " empty" : ""}`}>{start == null ? <b>Pick a time</b> : <><b className="num">{hm(start)}</b><span>until {hm(start + len)}</span></>}</div>
                  <button aria-label="15 minutes later" onClick={() => nudge(15)}><Ic k="arrow" /></button>
                </div>
              </div>
              <div className="fld">
                <span>How long</span>
                <div className="seg">{LENS.map((l) => <button key={l} className={len === l ? "on" : ""} onClick={() => setLen(l)}>{l} min</button>)}</div>
              </div>
              <div className="fld">
                <span className="k2">Who’s showing them round</span>
                <div className="agents" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <button className={!self ? "on" : ""} onClick={() => setSelf(false)}><span className="av">{initials(agentName)}</span>{first(agentName)}</button>
                  <button className={self ? "on" : ""} onClick={() => setSelf(true)}><span className="av"><Ic k="walk" /></span>Self-guided</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  /* Rows tall enough that the whole day fits the window on a desktop; 30px on a phone. */
  function rowFor(d: Date) {
    const hrs = dayHours(d) ?? [540, 1020];
    const slots = (Math.max(1140, hrs[1]) - Math.min(480, hrs[0])) / 30;
    if (typeof window === "undefined" || window.innerWidth <= 1000 || !pane.h) return 30;
    return Math.max(20, Math.min(44, Math.floor((pane.h - 230) / slots)));
  }
  function pick(d: Date, m: number) {
    setDay(d);
    setStart(m);
    const i = DAYS.findIndex((x) => keyOf(x) === keyOf(d)), n = paneW && paneW < 760 ? 7 : 14;
    if (i >= 0 && (i < off || i >= off + n)) setOff(Math.max(0, Math.min(DAYS.length - n, i - (i % 7))));
  }
  function nudge(by: number) {
    if (start == null) {
      const fs = freeStarts(dayObj, len);
      setStart(fs[0] ?? 600);
      return;
    }
    setStart(Math.max(420, Math.min(1200 - len, start + by)));
  }

  function paneAccess() {
    const list = ACCESS.filter((a) => a.id !== "tenant" || tenant);
    return (
      <>
        {tenant ? (
          <div className="note">
            <Ic k="bell" />
            <div>
              <b>{tenant.name} lives here.</b>
              <p>The law asks for 24 hours’ written notice before you show the home.{tenantOk ? " It’s in the next step." : " We have no email for them, so give notice yourself."}</p>
            </div>
          </div>
        ) : people && !people.known ? (
          <div className="note">
            <Ic k="bell" />
            <div>
              <b>We couldn’t check who lives there.</b>
              <p>If the home is let, give the tenant 24 hours’ written notice yourself.</p>
            </div>
          </div>
        ) : null}
        <p className="lede">This goes on the home’s access record, the same one the listing shows. {whoFirst} never sees it.{record?.kind ? " It’s set to what the listing already says." : ""}</p>
        <div className="opts">
          {list.map((a) => (
            <button key={a.id} className={`opt${access === a.id ? " sel" : ""}`} onClick={() => setAccess(a.id)}>
              <span className="oi"><Ic k={a.icon} /></span>
              <span>
                <b>{a.label}</b>
                <span>{a.sub}{a.id === "vacant" && keys ? ` Keys: ${keys}.` : ""}</span>
              </span>
              <span className="radio" />
            </button>
          ))}
        </div>
        <div className="extra">
          {access === "lockbox" ? (
            <div className="box">
              <h4>Key safe code</h4>
              <label className="fld" style={{ marginTop: 0 }}>
                <input className="code" value={code} autoComplete="off" placeholder="e.g. 4821" onChange={(e) => setCode(e.target.value.slice(0, 40))} />
              </label>
              <p className="lede" style={{ margin: "8px 0 0", fontSize: 12 }}>{self ? `Saved to the home for your team. It isn’t sent to ${whoFirst}: text it to them yourself.` : "Saved to the home. Only your team sees it."}</p>
            </div>
          ) : access === "vacant" ? (
            <div className="box">
              <h4>Keys</h4>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {keys ? <span className="pill sage">{keys}</span> : <span style={{ fontSize: 13, color: "var(--muted)" }}>No key numbers on the home’s key register.</span>}
              </div>
            </div>
          ) : access === "landlord" ? (
            <div className="box">
              <h4>The landlord</h4>
              <p className="lede" style={{ margin: 0, fontSize: 13 }}>{people?.landlord ? `${people.landlord} gets an email asking them to meet ${self ? whoFirst : first(agentName)} there. You’ll see it in the next step.` : "We have no landlord on file for this home, so nobody can be asked. Ring them yourself."}</p>
            </div>
          ) : access === "tenant" ? (
            <div className="box">
              <h4>The tenant</h4>
              <p className="lede" style={{ margin: 0, fontSize: 13 }}>{tenantOk ? `${tenant!.name}’s notice asks them to be in. You’ll see it in the next step.` : "We have no email for them, so ask them yourself."}</p>
            </div>
          ) : (
            <div className="box">
              <h4>Getting in</h4>
              <p className="lede" style={{ margin: 0, fontSize: 13 }}>Pick an option to see the details.</p>
            </div>
          )}
          {self ? (
            <div className="box">
              <h4>Self-guided</h4>
              <p className="lede" style={{ margin: 0, fontSize: 13 }}>Nobody from us goes. {whoFirst}’s confirmation says they’ll let themselves in, and the viewing goes in the diary as unaccompanied.</p>
            </div>
          ) : null}
        </div>
      </>
    );
  }

  function paneMsgs() {
    const list: { id: "applicant" | "landlord" | "tenant"; k: string; name: string; sub: string; needed: boolean; can: boolean; why?: string }[] = [
      { id: "applicant", k: "The applicant", name: who.name, sub: "Confirmation and calendar invite", needed: false, can: appDraft === null || appOk, why: appDraft && !appOk ? appDraft.blocked ?? appDraft.error ?? "No email address on file." : undefined },
      { id: "landlord", k: "The landlord", name: llName || "The landlord", sub: llNeeded ? "Asking them to meet you there" : "So they know it’s happening", needed: llNeeded, can: llDraft === null || llOk, why: llDraft && !llOk ? llDraft.blocked ?? llDraft.error ?? "No landlord on file." : undefined },
      ...(tenant ? [{ id: "tenant" as const, k: "Living there now", name: tenant.name, sub: access === "tenant" ? "Notice, and asking them to let you in" : "24 hours’ written notice", needed: tenantOk, can: tenantOk, why: tenantOk ? undefined : "No email on file. Give notice yourself." }] : []),
    ];
    const nE = [sendApp, sendLl, sendTenant].filter(Boolean).length;
    const on = tab === "applicant" ? tell.applicant : tab === "landlord" ? tell.landlord || llNeeded : tell.tenant;
    return (
      <>
        <div className="allgo">
          <Ic k="mail" />
          <span><b>{nE} email{nE === 1 ? "" : "s"}</b> go out together when you book. Pick a person to read or change their message.{!self && who.phone ? " The text reminder goes on its own, about an hour before." : ""}</span>
        </div>
        <div className="mgrid">
          <div className="rcps">
            {list.map((w) => (
              <div key={w.id} className={`rcp${tab === w.id ? " on" : ""}`}>
                <div className="k">{w.k}</div>
                <div className={`who${tab === w.id ? " on" : ""}`} role="button" tabIndex={0} onClick={() => setTab(w.id)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setTab(w.id))}>
                  <span className="av">{initials(w.name)}</span>
                  <span>
                    <b>{w.name}</b>
                    <span>{w.why ?? w.sub}</span>
                  </span>
                  {!w.can ? (
                    <span className="pill">Can’t send</span>
                  ) : w.needed ? (
                    <span className="pill sage">Needed</span>
                  ) : (
                    <button
                      className={`sw${tell[w.id] ? " on" : ""}`}
                      aria-label={`Send to ${w.name}`}
                      aria-pressed={tell[w.id]}
                      onClick={(e) => {
                        e.stopPropagation();
                        setTell((t) => ({ ...t, [w.id]: !t[w.id] }));
                      }}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
          <div>
            <div className={`mail${on ? "" : " off"}`} hidden={tab !== "applicant"}>
              {appTarget ? <div className="ce"><ConfirmEditor ref={appEd} target={appTarget} onDraft={setAppDraft} fill /></div> : <p className="lede" style={{ padding: 18 }}>There’s no lead to write from, so no confirmation can be drafted. Tell {whoFirst} yourself.</p>}
            </div>
            <div className={`mail${on ? "" : " off"}`} hidden={tab !== "landlord"}>
              {llTarget ? <div className="ce"><ConfirmEditor ref={llEd} target={llTarget} onDraft={setLlDraft} fill /></div> : null}
            </div>
            {tenant ? (
              <div className={`mail${on ? "" : " off"}`} hidden={tab !== "tenant"}>
                <div className="mail-h">
                  <span>To</span>
                  <b style={{ fontWeight: 500 }}>{tenant.name}{tenant.email ? ` · ${tenant.email}` : ""}</b>
                  <span>Subject</span>
                  <input value={notice.subject} aria-label="Subject" onChange={(e) => setNotice({ ...notice, subject: e.target.value, touched: true })} />
                </div>
                <textarea className="mail-t" value={notice.body} aria-label="The notice" onChange={(e) => setNotice({ ...notice, body: e.target.value, touched: true })} />
              </div>
            ) : null}
          </div>
        </div>
      </>
    );
  }

  function paneBook() {
    const will: [string, string, string, boolean][] = [
      ["cal", "Booked into the diary and Outlook", `${hm(start!)} to ${hm(start! + len)}${self ? ", as unaccompanied" : ""}`, true],
      ["mail", `${whoFirst} gets the confirmation`, "With a calendar invite", sendApp],
      ["people", `${llName || "The landlord"} is told`, llNeeded ? "Asked to meet you there, by email" : "The landlord, by email", sendLl],
      ...(tenant ? [["bell", `${tenant.name} gets notice`, "Written notice, by email", sendTenant] as [string, string, string, boolean]] : []),
      ["key", "How we get in is saved to the home", accessLabel ?? "", Boolean(accessKey && access)],
    ];
    return (
      <div className="review">
        <div>
          <div className="big-when">
            <small className="k" style={{ color: "rgba(255,255,255,.55)" }}>Viewing</small>
            <b>{longDate(whenDate!)}<br />at {ampm(start!)}</b>
            <span>{home!.name}, {home!.locality}</span>
            <div className="chips">
              <span className="pill">{len} minutes</span>
              <span className="pill">{self ? "Self-guided" : `With ${agentName}`}</span>
              {accessLabel ? <span className="pill">{accessLabel}</span> : null}
            </div>
          </div>
          {iss.length ? (
            <div className="warns" style={{ marginTop: 14 }}>
              {iss.map((i) => (
                <div key={i} className="wn">
                  <Ic k="warn" />
                  <span>{i} <a href="#" style={{ color: "inherit" }} onClick={(e) => { e.preventDefault(); go(1); }}>Change the time</a></span>
                </div>
              ))}
            </div>
          ) : (
            <div className="wn ok" style={{ marginTop: 14 }}>
              <Ic k="check" />
              <span>No clashes, enough notice, and inside the usual hours.</span>
            </div>
          )}
        </div>
        <div>
          <div className="k" style={{ marginBottom: 8 }}>When you book</div>
          <ul className="will">
            {will.map((w) => (
              <li key={w[1]} className={w[3] ? "" : "skip"}>
                <i>{w[3] ? <Ic k={w[0]} /> : <Ic k="back" />}</i>
                <span>
                  <b>{w[1]}</b>
                  <span>{w[3] ? w[2] : "Not sending"}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  function foot() {
    if (sending) return <><span className="msg">Booking it in now. This only takes a moment.</span><button className="btn primary" disabled>Booking…</button></>;
    if (finished) {
      return (
        <>
          <span className="msg">{done!.failed ? <><Ic k="warn" />Nothing was booked.</> : <><Ic k="check" />Saved to the record, under Viewings.</>}</span>
          {!done!.failed && onAddAnother && done!.viewingId && home && startsAt ? (
            <button className="btn" onClick={() => { onAddAnother({ viewingId: done!.viewingId!, listingId: home.id, property: home.name, locality: home.locality, startsAt, minutes: len, unaccompanied: self, who: who.name }); onClose(); }}>Add another viewing after</button>
          ) : null}
          {done!.failed ? <button className="btn" onClick={() => { setItems(null); setDone(null); setStep(4); }}>Try again</button> : null}
          <button className="btn primary" onClick={onClose}>Back to {whoFirst} <Ic k="arrow" /></button>
        </>
      );
    }
    const next = ["Next: pick a time", "Next: getting in", "Next: who we’ll tell", "Next: check it", "Book the viewing"][step];
    const warn = iss[0];
    const msg =
      step === 0 ? (home?.heldNote ? <span className="msg warn"><Ic k="warn" />{home.heldNote}. You can still book a viewing.</span> : <span className="msg">Pick the home {whoFirst} is going to see.</span>)
      : step === 1 ? (start == null ? <span className="msg">Tap a suggested time, or any free space in the diary.</span> : warn ? <span className="msg warn"><Ic k="warn" />{warn}{iss.length > 1 ? <b style={{ fontWeight: 500, whiteSpace: "nowrap" }}> +{iss.length - 1} more</b> : null}</span> : <span className="msg"><Ic k="check" />{longDate(dayObj)}, {hm(start)} to {hm(start + len)}. Nothing clashes.</span>)
      : step === 2 ? <span className="msg">{access === "lockbox" && !code.trim() ? "Add the key safe code." : access ? "Saved to the home when you book. Only your team sees it." : "Choose how you’ll get in."}</span>
      : step === 3 ? <span className="msg">{appTarget && tell.applicant && appDraft === null ? "Getting the emails ready…" : "Click into any message to change the words."}</span>
      : <span className="msg">{iss.length ? <span style={{ color: "var(--clay)", display: "flex", gap: 8, alignItems: "center" }}><Ic k="warn" />{iss.length} thing{iss.length > 1 ? "s" : ""} to check above</span> : "Everything looks right."}</span>;
    return (
      <>
        {step ? <button className="btn" onClick={() => go(step - 1)}><Ic k="back" />Back</button> : null}
        {msg}
        <button className="btn primary" disabled={!canNext()} onClick={() => (step === 4 ? void bookIt() : go(step + 1))}>
          {step === 4 ? <Ic k="check" /> : null}
          {next}
          {step < 4 ? <Ic k="arrow" /> : null}
        </button>
      </>
    );
  }
}

/* The sending list, ticking through what really happened, then what was done. */
function Progress({ items, done, whenDate, start, whoFirst, home }: { items: Item[]; done: { said: string; failed: boolean } | null; whenDate: Date; start: number; whoFirst: string; home: Home }) {
  if (done && !done.failed && items.every((i) => i.state === "ok" && !i.detail)) {
    return (
      <div className="done-pane">
        <div>
          <div className="tick"><Ic k="check" sw={2.4} size={34} /></div>
          <h3>{longDate(whenDate)}, <span>{ampm(start)}.</span></h3>
          <p>{whoFirst} is booked in to see {home.name}. {items.some((i) => i.key === "app") ? "The confirmation is on its way." : "No confirmation was sent."}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="sending">
      <div>
        <h3>{done ? (done.failed ? "Not booked" : items.some((i) => i.state === "fail") ? "Booked, with a problem" : "Booked") : <>Booking it in<span style={{ color: "var(--faint)" }}>…</span></>}</h3>
        <ul>
          {items.map((x) => (
            <li key={x.key} className={x.state === "ok" ? "ok" : x.state === "go" ? "go" : x.state === "fail" ? "fail" : ""}>
              <i>{x.state === "ok" ? <Ic k="check" sw={2.6} /> : x.state === "fail" ? <Ic k="x" sw={2.6} /> : null}</i>
              <span>{x.label}{x.detail ? <small className={x.state === "ok" ? "soft" : ""}>{x.detail}</small> : null}</span>
            </li>
          ))}
        </ul>
        {done?.failed && done.said ? <p className="lede" style={{ textAlign: "center", marginTop: 14 }}>{done.said}</p> : null}
      </div>
    </div>
  );
}

/* The day's diary: entries, the shading for closed and gone, and the booking you drag. */
function Timeline({ d, today, now, row: ROW, start, len, evs, label, aria, onPick, onDrag }: {
  d: Date; today: Date; now: Date; row: number; start: number | null; len: number; evs: Ev[]; label: string; aria: string;
  onPick: (m: number) => void; onDrag: (start: number, len: number) => void;
}) {
  const hrs = dayHours(d) ?? [540, 1020];
  const from = Math.min(480, hrs[0]), to = Math.max(1140, hrs[1]);
  const y = (m: number) => ((m - from) / 30) * ROW;
  const lane = useRef<HTMLDivElement>(null);
  const [ghost, setGhost] = useState<number | null>(null);
  const drag = useRef<{ mode: "move" | "size"; y0: number; s0: number; l0: number } | null>(null);
  const [live, setLive] = useState<{ s: number; l: number } | null>(null);
  const rows: number[] = [];
  for (let m = from; m < to; m += 30) rows.push(m);
  const nm = now.getHours() * 60 + now.getMinutes();
  const isToday = keyOf(d) === keyOf(today);
  const slotAt = (clientY: number) => {
    const r = lane.current!.getBoundingClientRect();
    return Math.min(to - len, Math.max(from, from + Math.floor((clientY - r.top) / ROW) * 30));
  };
  const s = live?.s ?? start, l = live?.l ?? len;
  const clash = s != null && evs.some((e) => s < e.s + e.len && e.s < s + l);
  return (
    <div className="tl" style={{ ["--row" as string]: `${ROW}px` }}>
      {rows.map((m) => (
        <div key={m} className={`tl-row${m % 60 ? " half" : ""}`}>
          <span>{m % 60 ? "" : hm(m)}</span>
          <div />
        </div>
      ))}
      <div
        className="tl-lane"
        ref={lane}
        onMouseMove={(e) => setGhost((e.target as HTMLElement).closest(".bk") ? null : slotAt(e.clientY))}
        onMouseLeave={() => setGhost(null)}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest(".bk")) return;
          onPick(slotAt(e.clientY));
        }}
      >
        {!dayHours(d) ? (
          <div className="tl-shade" style={{ top: 0, bottom: 0 }}><em>Closed</em></div>
        ) : (
          <>
            {hrs[0] > from ? <div className="tl-shade" style={{ top: 0, height: y(hrs[0]) }} /> : null}
            {hrs[1] < to ? <div className="tl-shade" style={{ top: y(hrs[1]), bottom: 0 }}><em>Out of hours</em></div> : null}
          </>
        )}
        {isToday ? (
          <>
            <div className="tl-shade" style={{ top: 0, height: Math.min(y(to), Math.max(0, y(nm))) }}><em>Gone</em></div>
            {nm < to && nm > from ? <div className="now-ln" style={{ top: y(nm) }} /> : null}
          </>
        ) : null}
        {evs.map((e, k) => (
          <div key={k} className={`ev ${e.type === "out" ? "out" : e.type === "view" ? (e.here ? "here" : "view") : ""}`} style={{ top: y(e.s) + 1, height: Math.max(12, (e.len / 30) * ROW - 3) }}>
            <small>{hm(e.s)}</small>
            <span>{e.type === "view" ? (e.here ? <><b>Viewing here</b>{e.who ? ` · ${e.who}` : ""}</> : `Viewing · ${e.where}`) : e.type === "out" ? "Busy" : e.title}</span>
          </div>
        ))}
        {ghost != null ? <div className="tl-ghost" style={{ display: "block", top: y(ghost) + 1, height: (len / 30) * ROW - 3 }}>+ {hm(ghost)}</div> : null}
        {s != null ? (
          <div
            className={`bk${clash ? " clash" : ""}${live ? " drag" : ""}`}
            style={{ top: y(s) + 1, height: (l / 30) * ROW - 3 }}
            role="button"
            aria-label={`${aria}, ${hm(s)} to ${hm(s + l)}. Drag to move.`}
            onPointerDown={(e) => {
              drag.current = { mode: (e.target as HTMLElement).classList.contains("grip") ? "size" : "move", y0: e.clientY, s0: s, l0: l };
              try {
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              } catch {
                /* a synthetic pointer has nothing to capture */
              }
              e.preventDefault();
            }}
            onPointerMove={(e) => {
              const g = drag.current;
              if (!g) return;
              const steps = Math.round((e.clientY - g.y0) / (ROW / 2));
              setLive(g.mode === "move" ? { s: Math.min(to - g.l0, Math.max(from, g.s0 + steps * 15)), l: g.l0 } : { s: g.s0, l: Math.min(120, Math.max(15, g.l0 + steps * 15)) });
            }}
            onPointerUp={() => {
              if (!drag.current) return;
              drag.current = null;
              if (live) onDrag(live.s, live.l);
              setLive(null);
            }}
          >
            <b>{label}</b>
            <span>{hm(s)} to {hm(s + l)}</span>
            <i className="grip" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
