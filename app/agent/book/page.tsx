"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import AppIcon from "@/components/app/AppIcon";
import type { Appt } from "@/lib/diary";
import type { ScoredMatch } from "@/lib/contact-match";
import { OS_LEAD_PREFIX } from "@/lib/contacts-as-leads";
import type { ViewingPerson } from "@/app/api/viewings/people/route";
import { ErrorLine, SearchBox, Segmented, Sheet, Spinner } from "../bits";
import { endOf, loadDiary } from "../diary-bits";

/**
 * BOOK A VIEWING FROM THE APP (Kirstie Mulholland, ticket fe8ebdad, 16 Oct
 * 2026: "an option to book a viewing and send a rental passport via the app").
 *
 * The desk's Book a viewing, a screen at a time: who, which home, when, then
 * a check of what will happen before anything does. The same roads as the
 * desk and nothing new on the server:
 *
 *   who      /api/viewings/people (their own tenants on file), or someone new
 *            saved as the desk saves one (/api/contacts, after /api/contacts/match)
 *   home     /api/listings, the homes on the market (held ones say so)
 *   book     /api/viewings/book - their Outlook, the diary, the silent mirror
 *   tell     /api/confirmations - the confirmation, only if ticked, as drafted
 *   passport /api/tenant/passport/invite - only if ticked
 *
 * Booking sends nothing by itself (lib/viewing-confirm); the two ticks are the
 * agent pressing Send.
 */

type Step = "who" | "home" | "when" | "check" | "done";
type Home = { id: string; name: string; locality: string; rent: number | null; propertyId: string | null; held: string | null };
type Draft = { ok?: boolean; to?: string | null; subject?: string; html?: string; blocked?: string; alreadySent?: { at: string } | null; error?: string };

const LENGTHS = [15, 30, 45, 60];
const TIMES = Array.from({ length: (20 - 8) * 4 + 1 }, (_, i) => {
  const m = 8 * 60 + i * 15;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** Whole days from today to a yyyy-mm-dd, on the phone's clock. */
function offsetOf(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date();
  return Math.round((new Date(y, m - 1, d, 12).getTime() - new Date(t.getFullYear(), t.getMonth(), t.getDate(), 12).getTime()) / 86400000);
}
function prettyDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const off = offsetOf(day);
  if (off === 0) return "Today";
  if (off === 1) return "Tomorrow";
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}
const money = (n: number | null) => (n ? `£${Math.round(n).toLocaleString("en-GB")} pcm` : "");

export default function PhoneBookViewing() {
  const [step, setStep] = useState<Step>("who");
  const [dir, setDir] = useState<1 | -1>(1);
  const [person, setPerson] = useState<ViewingPerson | null>(null);
  const [home, setHome] = useState<Home | null>(null);
  const [day, setDay] = useState(isoDay(new Date()));
  const [time, setTime] = useState("10:00");
  const [mins, setMins] = useState(30);
  const [unaccompanied, setUnaccompanied] = useState(false);
  const [seed, setSeed] = useState<{ q: string; listing: string }>({ q: "", listing: "" });

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setSeed({ q: sp.get("q") ?? "", listing: sp.get("listing") ?? "" });
    /* The next quarter hour, so "today" never offers a time already gone. */
    const n = new Date();
    const m = Math.min(Math.max(Math.ceil((n.getHours() * 60 + n.getMinutes() + 1) / 15) * 15, 8 * 60), 20 * 60);
    setTime(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }, []);

  const go = (next: Step, d: 1 | -1 = 1) => {
    setDir(d);
    setStep(next);
    window.scrollTo({ top: 0 });
  };
  const back: Record<Step, Step | null> = { who: null, home: "who", when: "home", check: "when", done: null };
  const n = { who: 1, home: 2, when: 3, check: 4, done: 4 }[step];

  return (
    <main>
      {/* The round back button steps back through the booking, then out to
          Viewings - the app's own header, with the step above the title. */}
      <header className="mb-4">
        <div className="flex h-12 items-center">
          {back[step] ? (
            <button type="button" aria-label="Back" onClick={() => go(back[step]!, -1)} className="m-round m-press">
              <BackArrow />
            </button>
          ) : (
            <Link href="/agent/viewings" aria-label="Back" className="m-round m-press">
              <BackArrow />
            </Link>
          )}
        </div>
        {step !== "done" && <p className="m-eyebrow mt-3">Step {n} of 4</p>}
        <h1 className="m-title mt-1 text-[32px] leading-[1.1]">{step === "done" ? "Booked" : "Book a Viewing"}</h1>
      </header>

      {/* "done" keeps the check step mounted: it holds what was sent. */}
      {/* Fill "backwards", not the global classes' "both": a transform kept on
          this wrapper after the slide would hold every Sheet inside it rather
          than over the screen (the 3 Oct rule in app/agent/m.css). */}
      <div
        key={step === "done" ? "check" : step}
        style={{ animation: `${dir === 1 ? "step-in-next" : "step-in-back"} 340ms cubic-bezier(0.22, 1, 0.36, 1) backwards` }}
      >
        {step === "who" && (
          <Who
            seed={seed.q}
            onPick={(p) => {
              setPerson(p);
              go("home");
            }}
          />
        )}
        {step === "home" && (
          <WhichHome
            seed={seed.listing}
            onPick={(h) => {
              setHome(h);
              go("when");
            }}
          />
        )}
        {step === "when" && (
          <When
            day={day}
            setDay={setDay}
            time={time}
            setTime={setTime}
            mins={mins}
            setMins={setMins}
            unaccompanied={unaccompanied}
            setUnaccompanied={setUnaccompanied}
            onNext={() => go("check")}
          />
        )}
        {(step === "check" || step === "done") && person && home && (
          <Check
            person={person}
            home={home}
            day={day}
            time={time}
            mins={mins}
            unaccompanied={unaccompanied}
            onDone={() => setStep("done")}
            onAgain={() => {
              setPerson(null);
              setHome(null);
              go("who", -1);
            }}
          />
        )}
      </div>
    </main>
  );
}

/* ── Who ─────────────────────────────────────────────────────────────── */

function Who({ seed, onPick }: { seed: string; onPick: (p: ViewingPerson) => void }) {
  const [needle, setNeedle] = useState(seed);
  const [people, setPeople] = useState<ViewingPerson[] | null>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => setNeedle(seed), [seed]);

  useEffect(() => {
    const q = needle.trim();
    if (q.length < 3) {
      setPeople([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setPeople(null);
      setProblem(null);
      fetch(`/api/viewings/people?q=${encodeURIComponent(q)}`, { cache: "no-store", signal: ctrl.signal })
        .then((r) => r.json())
        .then((j: { ok?: boolean; people?: ViewingPerson[]; error?: string }) => {
          if (ctrl.signal.aborted) return;
          if (j.ok) setPeople(j.people ?? []);
          else {
            setPeople([]);
            setProblem(j.error ?? "The search didn't answer. Try again.");
          }
        })
        .catch(() => {
          if (!ctrl.signal.aborted) {
            setPeople([]);
            setProblem("The search didn't answer. Try again.");
          }
        });
    }, 400);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [needle]);

  if (adding) return <SomeoneNew seed={needle.trim()} onPick={onPick} onCancel={() => setAdding(false)} />;

  const q = needle.trim();
  return (
    <>
      <p className="mb-3 px-1 text-[15px] text-muted">Who is coming to see it?</p>
      <SearchBox value={needle} onChange={setNeedle} placeholder="Name, email or mobile" autoFocus={!seed} />
      {people === null ? (
        <Spinner label="Looking" className="py-6" />
      ) : problem ? (
        <div className="mt-3">
          <ErrorLine text={problem} />
        </div>
      ) : people.length > 0 ? (
        <ul className="m-group mt-3">
          {people.map((p) => (
            <li key={p.leadId} className="m-row">
              <button type="button" onClick={() => onPick(p)} className="m-press flex w-full items-center gap-3 px-4 py-3.5 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-semibold">{p.name}</span>
                  <span className="block truncate text-[13.5px] text-muted">{[p.phone, p.email].filter(Boolean).join(" · ") || "No contact details"}</span>
                </span>
                <Chevron />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-5 text-center text-[14.5px] text-muted">
          {q.length >= 3 ? "Nobody on file matches that." : "Type three letters or more."}
        </p>
      )}
      <button type="button" onClick={() => setAdding(true)} className="m-btn m-press mt-3 w-full">
        <AppIcon name="user" size={17} /> Someone New
      </button>
    </>
  );
}

function SomeoneNew({ seed, onPick, onCancel }: { seed: string; onPick: (p: ViewingPerson) => void; onCancel: () => void }) {
  const looksEmail = seed.includes("@");
  const looksPhone = /^[+\d\s()-]{6,}$/.test(seed);
  const [name, setName] = useState(!looksEmail && !looksPhone ? seed : "");
  const [email, setEmail] = useState(looksEmail ? seed : "");
  const [mobile, setMobile] = useState(looksPhone ? seed : "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [matches, setMatches] = useState<ScoredMatch[] | null>(null);

  const ready = Boolean(name.trim() && mobile.trim()) && !busy;

  /** Save them as a tenant contact, carrying on a record already on file when picked. */
  async function save(rexId: string | null) {
    setBusy(true);
    setProblem(null);
    try {
      if (rexId) {
        const known = await fetch(`/api/leads/by-contact?ids=${encodeURIComponent(rexId)}`, { cache: "no-store" })
          .then((r) => r.json() as Promise<{ leads?: Record<string, string> }>)
          .catch(() => null);
        const leadId = known?.leads?.[rexId];
        if (leadId) return onPick({ leadId, name: name.trim(), email: email.trim(), phone: mobile.trim(), contactId: rexId, note: "On file" });
      }
      const r = await fetch("/api/contacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "tenant", name: name.trim(), email: email.trim(), mobile: mobile.trim(), enquiry: "Viewing", rexId }),
      });
      const j = (await r.json().catch(() => ({}))) as { contact?: { id?: string; rexId?: string | null }; error?: string };
      if (!r.ok || !j.contact?.id) return setProblem(j.error ?? "That didn't save. Nothing you typed has been lost.");
      onPick({ leadId: OS_LEAD_PREFIX + j.contact.id, name: name.trim(), email: email.trim(), phone: mobile.trim(), contactId: j.contact.rexId ?? null, note: "Added just now" });
    } catch {
      setProblem("That didn't save - the connection dropped. Nothing you typed has been lost.");
    } finally {
      setBusy(false);
    }
  }

  /* Already somewhere on the books? Asked once, on Continue, as Add new lead asks. */
  async function next() {
    if (!ready) return;
    setBusy(true);
    const j = await fetch("/api/contacts/match", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email, mobile }),
    })
      .then((r) => r.json() as Promise<{ matches?: ScoredMatch[] }>)
      .catch(() => null);
    setBusy(false);
    const close = (j?.matches ?? []).filter((m) => m.score >= 50).slice(0, 3);
    if (close.length) setMatches(close);
    else void save(null);
  }

  const input = "h-12 w-full rounded-2xl border px-4 text-[16px] outline-none";
  const inputStyle = { background: "var(--m-card)", borderColor: "var(--m-line)" };
  return (
    <>
      <p className="mb-3 px-1 text-[15px] text-muted">Someone new. They are saved as a tenant, the same as Add new lead.</p>
      <div className="space-y-3">
        <label className="block">
          <span className="m-eyebrow mb-1.5 block px-1">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" placeholder="Their full name" className={input} style={inputStyle} />
        </label>
        <label className="block">
          <span className="m-eyebrow mb-1.5 block px-1">Mobile</span>
          <input value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="tel" autoComplete="off" placeholder="07..." className={input} style={inputStyle} />
        </label>
        <label className="block">
          <span className="m-eyebrow mb-1.5 block px-1">Email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" autoComplete="off" placeholder="For the confirmation and passport" className={input} style={inputStyle} />
        </label>
      </div>
      {problem && (
        <div className="mt-3">
          <ErrorLine text={problem} />
        </div>
      )}
      <button type="button" onClick={() => void next()} disabled={!ready} className="m-btn m-btn-primary m-press mt-5 w-full disabled:opacity-50">
        {busy ? "Checking" : "Continue"}
      </button>
      <button type="button" onClick={onCancel} className="m-btn m-press mt-2 w-full">
        Search Instead
      </button>

      {matches && (
        <Sheet label="Already on file?" onClose={() => setMatches(null)}>
          <h2 className="m-title text-[26px] leading-tight">Already on file?</h2>
          <p className="mt-1 text-[14.5px] text-muted">Use their record rather than starting a second one.</p>
          <ul className="m-group mt-4">
            {matches.map((m) => (
              <li key={m.id} className="m-row">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (m.name) setName(m.name);
                    if (m.email) setEmail(m.email);
                    if (m.mobile) setMobile(m.mobile);
                    setMatches(null);
                    void save(m.id);
                  }}
                  className="m-press flex w-full items-center gap-3 px-4 py-3.5 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold">{m.name || "No name"}</span>
                    <span className="block truncate text-[13.5px] text-muted">{[m.mobile, m.email].filter(Boolean).join(" · ")}</span>
                  </span>
                  <Chevron />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              setMatches(null);
              void save(null);
            }}
            className="m-btn m-press mt-3 w-full"
          >
            No, Someone New
          </button>
        </Sheet>
      )}
    </>
  );
}

/* ── Which home ──────────────────────────────────────────────────────── */

function WhichHome({ seed, onPick }: { seed: string; onPick: (h: Home) => void }) {
  const [homes, setHomes] = useState<Home[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needle, setNeedle] = useState("");
  const picked = useRef(false);

  const load = () => {
    setError(null);
    setHomes(null);
    /* The homes on the market, and the let-agreed ones still being shown
       until the holding fee is in - the desk booker's own list. */
    Promise.all([
      fetch("/api/listings", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/listings/held", { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => null),
    ])
      .then(([j, h]) => {
        if (!j?.ok || !Array.isArray(j.listings)) throw new Error(j?.error ?? "The homes did not load.");
        const held = (h?.ok ? h.held : {}) as Record<string, { words: string }>;
        const rows = (j.listings as Array<{ id: string | number; name: string; locality: string; rent: number | null; propertyId?: string | null; letAgreed?: boolean }>)
          .filter((l) => !l.letAgreed || held[String(l.id)])
          .map((l) => ({ id: String(l.id), name: l.name, locality: l.locality, rent: l.rent, propertyId: l.propertyId ?? null, held: held[String(l.id)]?.words ?? null }));
        setHomes(rows);
      })
      .catch((e: Error) => setError(e.message || "The homes did not load."));
  };
  useEffect(load, []);

  /* Opened from a home: straight on. */
  useEffect(() => {
    if (!seed || !homes || picked.current) return;
    const h = homes.find((x) => x.id === seed);
    if (h) {
      picked.current = true;
      onPick(h);
    }
  }, [seed, homes, onPick]);

  const shown = useMemo(() => {
    const q = needle.trim().toLowerCase();
    return (homes ?? []).filter((h) => !q || `${h.name} ${h.locality}`.toLowerCase().includes(q)).slice(0, 60);
  }, [homes, needle]);

  return (
    <>
      <p className="mb-3 px-1 text-[15px] text-muted">Which home?</p>
      <SearchBox value={needle} onChange={setNeedle} placeholder="Street or town" />
      {error ? (
        <div className="mt-3">
          <ErrorLine text={error} onRetry={load} />
        </div>
      ) : !homes ? (
        <Spinner label="Loading the homes on the market" className="py-6" />
      ) : shown.length === 0 ? (
        <p className="py-5 text-center text-[14.5px] text-muted">No home on the market matches that.</p>
      ) : (
        <ul className="m-group mt-3">
          {shown.map((h) => (
            <li key={h.id} className="m-row">
              <button type="button" onClick={() => onPick(h)} className="m-press flex w-full items-center gap-3 px-4 py-3.5 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-semibold">{h.name}</span>
                  <span className="block truncate text-[13.5px] text-muted">{[h.locality, money(h.rent)].filter(Boolean).join(" · ")}</span>
                  {h.held && <span className="mt-0.5 block text-[12.5px]" style={{ color: "var(--m-coral)" }}>{h.held}</span>}
                </span>
                <Chevron />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/* ── When ────────────────────────────────────────────────────────────── */

function When(p: {
  day: string;
  setDay: (v: string) => void;
  time: string;
  setTime: (v: string) => void;
  mins: number;
  setMins: (v: number) => void;
  unaccompanied: boolean;
  setUnaccompanied: (v: boolean) => void;
  onNext: () => void;
}) {
  const [diary, setDiary] = useState<Appt[] | null>(null);
  const [diaryError, setDiaryError] = useState<string | null>(null);
  useEffect(() => {
    loadDiary()
      .then(({ appts }) => setDiary(appts))
      .catch((e: Error) => setDiaryError(e.message));
  }, []);

  const off = offsetOf(p.day);
  const that = (diary ?? []).filter((a) => a.day === off && !a.allDay).sort((a, b) => a.start.localeCompare(b.start));
  const [h, m] = p.time.split(":").map(Number);
  const s = h * 60 + m;
  const clash = that.find((a) => {
    const [ah, am] = a.start.split(":").map(Number);
    const as = ah * 60 + am;
    return s < as + a.mins && as < s + p.mins && a.kind !== "travel";
  });
  const past = off === 0 && s <= new Date().getHours() * 60 + new Date().getMinutes();

  const select = "h-12 w-full rounded-2xl border px-4 text-[16px] outline-none";
  const selectStyle = { background: "var(--m-card)", borderColor: "var(--m-line)", color: "var(--m-ink)" };
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="m-eyebrow mb-1.5 block px-1">Day</span>
          <input type="date" min={isoDay(new Date())} value={p.day} onChange={(e) => e.target.value && p.setDay(e.target.value)} className={select} style={selectStyle} />
        </label>
        <label className="block">
          <span className="m-eyebrow mb-1.5 block px-1">Time</span>
          <select value={p.time} onChange={(e) => p.setTime(e.target.value)} className={select} style={selectStyle}>
            {TIMES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>

      <p className="m-eyebrow mb-1.5 mt-4 px-1">How Long</p>
      <Segmented value={String(p.mins)} onChange={(v) => p.setMins(Number(v))} options={LENGTHS.map((l) => ({ value: String(l), label: `${l} min` }))} />

      <p className="m-eyebrow mb-1.5 mt-4 px-1">Who Goes</p>
      <Segmented
        value={p.unaccompanied ? "un" : "acc"}
        onChange={(v) => p.setUnaccompanied(v === "un")}
        options={[
          { value: "acc", label: "I'm Going" },
          { value: "un", label: "Unaccompanied" },
        ]}
      />

      <p className="m-eyebrow mb-2 mt-6 px-1">Your Day · {prettyDay(p.day)}</p>
      <div className="m-group p-4">
        {diaryError ? (
          <p className="text-[13.5px] text-muted">Your diary didn&apos;t load, so check for clashes yourself.</p>
        ) : !diary ? (
          <Spinner label="Loading your diary" />
        ) : that.length === 0 ? (
          <p className="text-[14.5px] text-muted">Nothing else in your diary that day.</p>
        ) : (
          <ul className="space-y-2">
            {that.map((a) => (
              <li key={a.id} className="flex gap-3 text-[14.5px]">
                <span className="w-[108px] shrink-0 whitespace-nowrap tabular-nums text-muted">
                  {a.start} - {endOf(a)}
                </span>
                <span className="min-w-0 flex-1 truncate">{a.who ? `${a.what} · ${a.who}` : a.what}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {clash && (
        <p className="mt-2 px-1 text-[13.5px]" style={{ color: "var(--m-coral)" }}>
          That overlaps {clash.what} at {clash.start}.
        </p>
      )}
      {past && (
        <p className="mt-2 px-1 text-[13.5px]" style={{ color: "var(--m-coral)" }}>
          That time has already gone today.
        </p>
      )}

      <button type="button" onClick={p.onNext} disabled={past} className="m-btn m-btn-primary m-press mt-6 w-full disabled:opacity-50">
        Continue
      </button>
    </>
  );
}

/* ── Check, book and tell ────────────────────────────────────────────── */

function Check({
  person,
  home,
  day,
  time,
  mins,
  unaccompanied,
  onDone,
  onAgain,
}: {
  person: ViewingPerson;
  home: Home;
  day: string;
  time: string;
  mins: number;
  unaccompanied: boolean;
  onDone: () => void;
  onAgain: () => void;
}) {
  const startsAt = useMemo(() => {
    const [y, mo, d] = day.split("-").map(Number);
    const [h, m] = time.split(":").map(Number);
    return new Date(y, mo - 1, d, h, m, 0, 0).toISOString();
  }, [day, time]);
  const booking = useMemo(
    () => ({
      leadId: person.leadId,
      listingId: home.id,
      applicantName: person.name,
      applicantEmail: person.email || null,
      address: home.name,
      startsAt,
      minutes: mins,
      unaccompanied,
    }),
    [person, home, startsAt, mins, unaccompanied]
  );
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirm, setConfirm] = useState(Boolean(person.email));
  const [passport, setPassport] = useState(false);
  const [passportState, setPassportState] = useState<{ sent: boolean; done: boolean } | null>(null);
  const [looking, setLooking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<Array<{ ok: boolean; text: string }> | null>(null);

  /* The confirmation as it would go, and where their passport stands. */
  useEffect(() => {
    if (!person.email) {
      setDraft({ ok: true, blocked: `${person.name} has no email address, so no confirmation or passport can go. Ring them.` });
      setConfirm(false);
      return;
    }
    fetch("/api/confirmations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "draft", kind: "viewing", booking }),
    })
      .then((r) => r.json() as Promise<Draft>)
      .then((j) => {
        setDraft(j);
        if (!j.ok || j.blocked) setConfirm(false);
      })
      .catch(() => {
        setDraft({ ok: false, error: "The confirmation didn't load." });
        setConfirm(false);
      });
    const qs = new URLSearchParams({ email: person.email, home: home.id });
    fetch(`/api/tenant/passport/invite?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; sent?: boolean; done?: boolean }) => j.ok && setPassportState({ sent: Boolean(j.sent), done: Boolean(j.done) }))
      .catch(() => undefined);
  }, [booking, person, home.id]);

  async function book() {
    if (busy) return;
    setBusy(true);
    const lines: Array<{ ok: boolean; text: string }> = [];
    const j = await fetch("/api/viewings/book", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...booking, contactId: person.contactId }),
    })
      .then((r) => r.json() as Promise<{ ok?: boolean; said?: string; outlook?: { ok?: boolean; detail?: string } }>)
      .catch(() => null);
    if (!j?.ok) {
      setBusy(false);
      setSaid([{ ok: false, text: j?.said ?? "That didn't book - the connection dropped. Check your diary before trying again." }]);
      return;
    }
    lines.push({ ok: true, text: j.outlook?.ok ? "Booked and in your Outlook calendar." : j.outlook?.detail ?? j.said ?? "Booked." });

    if (confirm && draft?.ok && !draft.blocked) {
      const c = await fetch("/api/confirmations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "send", kind: "viewing", booking, subject: draft.subject, html: draft.html, again: Boolean(draft.alreadySent) }),
      })
        .then((r) => r.json() as Promise<{ sent?: boolean; detail?: string; error?: string }>)
        .catch(() => null);
      lines.push(c?.sent ? { ok: true, text: /^sent to /i.test(c.detail ?? "") ? `Confirmation ${c.detail!.replace(/^S/, "s")}` : "Confirmation sent." } : { ok: false, text: `The confirmation didn't send: ${String(c?.detail ?? c?.error ?? "the connection dropped").replace(/\.+$/, "")}.` });
    } else {
      lines.push({ ok: true, text: "No confirmation sent." });
    }

    if (passport && person.email) {
      const p = await fetch("/api/tenant/passport/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: person.name, email: person.email, again: Boolean(passportState?.sent), home: home.id, address: `${home.name}, ${home.locality}` }),
      })
        .then((r) => r.json() as Promise<{ ok?: boolean; error?: string; alreadySent?: boolean }>)
        .catch(() => null);
      lines.push(p?.ok ? { ok: true, text: p.alreadySent ? "Their rental passport had already gone." : "Rental passport sent." } : { ok: false, text: `The passport didn't send: ${String(p?.error ?? "the connection dropped").replace(/\.+$/, "")}.` });
    }
    setBusy(false);
    setSaid(lines);
    onDone();
  }

  const when = `${prettyDay(day)}, ${time} for ${mins} min`;

  if (said && said[0]?.ok) {
    return (
      <>
        <div className="m-group p-4">
          <p className="text-[17px] font-semibold">{person.name}</p>
          <p className="mt-0.5 text-[14.5px] text-muted">{home.name}</p>
          <p className="mt-0.5 text-[14.5px] text-muted">{when}</p>
        </div>
        <ul className="mt-4 space-y-2 px-1">
          {said.map((l) => (
            <li key={l.text} className="flex gap-2 text-[14.5px]" style={{ color: l.ok ? "var(--m-ink)" : "var(--m-coral)" }}>
              <span aria-hidden>{l.ok ? "✓" : "!"}</span>
              <span>{l.text}</span>
            </li>
          ))}
        </ul>
        <Link href="/agent/viewings" className="m-btn m-btn-primary m-press mt-6 w-full">
          <AppIcon name="calendar" size={17} /> Your Viewings
        </Link>
        <button type="button" onClick={onAgain} className="m-btn m-press mt-2 w-full">
          Book Another
        </button>
      </>
    );
  }

  const blocked = draft?.blocked ?? (draft && !draft.ok ? draft.error ?? "The confirmation didn't load." : null);
  return (
    <>
      <div className="m-group">
        <Line label="Who" value={person.name} sub={[person.phone, person.email].filter(Boolean).join(" · ")} />
        <Line label="Home" value={home.name} sub={home.locality} />
        <Line label="When" value={when} sub={unaccompanied ? "Unaccompanied" : "You're going"} />
      </div>

      <p className="m-eyebrow mb-2 mt-6 px-1">What Goes to {person.name.split(/\s+/)[0] || "Them"}</p>
      <div className="m-group">
        <Tick
          on={confirm}
          disabled={!draft || Boolean(blocked)}
          onChange={setConfirm}
          title="Email the confirmation"
          sub={!draft ? "Getting it ready" : blocked ? blocked : draft.alreadySent ? `To ${draft.to}. One has gone for this time already.` : `To ${draft.to}`}
        >
          {draft?.html && !blocked && (
            <button type="button" onClick={() => setLooking(true)} className="mt-1 text-[13.5px] font-semibold underline underline-offset-2">
              See the email
            </button>
          )}
        </Tick>
        <Tick
          on={passport}
          disabled={!person.email || Boolean(passportState?.done)}
          onChange={setPassport}
          title="Send their rental passport"
          sub={
            !person.email
              ? "No email address."
              : passportState?.done
                ? "They have finished it already."
                : passportState?.sent
                  ? "Sent before. Tick to send it again."
                  : "Their details, once - income, pets, right to rent."
          }
        />
      </div>
      <p className="mt-2 px-1 text-[13px] text-muted">Nothing goes until you press Book. Untick both and only your diary changes.</p>

      {said && !said[0]?.ok && (
        <div className="mt-3">
          <ErrorLine text={said[0].text} />
        </div>
      )}
      <button type="button" onClick={() => void book()} disabled={busy || !draft} className="m-btn m-btn-primary m-press mt-5 w-full !h-[52px] disabled:opacity-50">
        <AppIcon name="calendar" size={17} /> {busy ? "Booking" : "Book the Viewing"}
      </button>

      {looking && draft?.html && (
        <Sheet label="The confirmation" onClose={() => setLooking(false)}>
          <p className="m-eyebrow px-1">The Confirmation</p>
          <p className="mt-1 px-1 text-[16px] font-semibold">{draft.subject}</p>
          <iframe title="The confirmation" srcDoc={draft.html} sandbox="" className="mt-3 h-[60dvh] w-full rounded-2xl border bg-white" style={{ borderColor: "var(--m-line)" }} />
        </Sheet>
      )}
    </>
  );
}

function Line({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="m-row flex gap-3 px-4 py-3.5">
      <span className="w-[56px] shrink-0 text-[14px] text-muted">{label}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15.5px] font-semibold leading-snug">{value}</span>
        {sub && <span className="block truncate text-[13.5px] text-muted">{sub}</span>}
      </span>
    </div>
  );
}

function Tick({
  on,
  disabled,
  onChange,
  title,
  sub,
  children,
}: {
  on: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  title: string;
  sub: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="m-row flex items-start gap-3 px-4 py-3.5">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={title}
        disabled={disabled}
        onClick={() => onChange(!on)}
        className="mt-0.5 flex h-[30px] w-[50px] shrink-0 items-center rounded-full p-[3px] transition-colors disabled:opacity-40"
        style={{ background: on ? "var(--m-brown)" : "var(--m-fill)" }}
      >
        <span className="block h-6 w-6 rounded-full bg-white shadow transition-transform" style={{ transform: on ? "translateX(20px)" : "none" }} />
      </button>
      <span className="min-w-0 flex-1">
        <span className="block text-[15.5px] font-semibold">{title}</span>
        <span className="block text-[13.5px] leading-snug text-muted">{sub}</span>
        {children}
      </span>
    </div>
  );
}

function BackArrow() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-[18px] w-[18px]">
      <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Chevron() {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--m-on-card)" }}>
      <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4">
        <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
