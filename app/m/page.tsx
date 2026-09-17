"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import type { Appt } from "@/lib/diary";
import type { PhonePerson } from "@/app/api/m/people/route";
import { ErrorLine, ReachButtons, Sheet, Spinner, mapsHref } from "./bits";

/**
 * THE PHONE VIEW'S HOME: today's diary at the top, three big buttons under it.
 *
 * The diary is on this screen rather than behind a fourth button because it
 * is the reason the phone came out of the pocket - "where am I next, and who
 * am I meeting". Everything else is one tap away and nothing is two.
 */

const KIND_LABEL: Record<string, string> = {
  viewing: "Viewing",
  appraisal: "Appraisal",
  takeon: "Take-on",
  movein: "Move-in",
  inspection: "Inspection",
  travel: "Travel",
  other: "Appointment",
};

interface DiaryState {
  appts: Appt[];
  /** An owner sees the business, so each row names whose it is. */
  everything: boolean;
  /** Said when the diary is only the OS's own entries. */
  note: string | null;
}

function dayLabel(offset: number): string {
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  if (offset === -1) return "Yesterday";
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function endOf(a: Appt): string {
  const [h, m] = a.start.split(":").map(Number);
  const t = h * 60 + m + a.mins;
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export default function PhoneHome() {
  const [name, setName] = useState<string>("");
  const [diary, setDiary] = useState<DiaryState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState(0);
  const [open, setOpen] = useState<Appt | null>(null);
  const [menu, setMenu] = useState(false);
  const [showEarlier, setShowEarlier] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { user?: { name?: string } | null }) => setName((j.user?.name ?? "").split(" ")[0] ?? ""))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setError(null);
    setDiary(null);
    try {
      const r = await fetch("/api/diary", { cache: "no-store" });
      const j = (await r.json()) as {
        ok?: boolean;
        error?: string;
        live?: boolean;
        appts?: Appt[];
        mine?: Appt[];
        everything?: boolean;
        reason?: string;
      };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Your diary did not load.");
      /* No sample book on a phone. When the full diary is not connected, what
         the OS itself holds is shown and the screen says that is all it is. */
      if (j.live) setDiary({ appts: j.appts ?? [], everything: Boolean(j.everything), note: null });
      else setDiary({ appts: j.mine ?? [], everything: Boolean(j.everything), note: j.reason ? "Only appointments made in the OS are showing." : null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your diary did not load.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const todays = useMemo(
    () => (diary?.appts ?? []).filter((a) => a.day === day && a.kind !== "travel").sort((a, b) => a.start.localeCompare(b.start)),
    [diary, day]
  );
  const timed = todays.filter((a) => !a.allDay);
  const allDay = todays.filter((a) => a.allDay);

  /* "Now" and "Next" only mean something today: the first entry that has not
     finished. What has finished folds away under one line, so the day ahead
     and the three buttons are what fills the screen at three in the afternoon. */
  const nowHm = new Date().toTimeString().slice(0, 5);
  const current = day === 0 ? timed.find((a) => endOf(a) > nowHm) : undefined;
  const earlier = day === 0 ? timed.filter((a) => endOf(a) <= nowHm) : [];
  const listed = showEarlier ? timed : timed.filter((a) => !earlier.includes(a));

  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  return (
    <main>
      {/* ── who and when ── */}
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] text-muted">{today}</p>
          <h1 className="hand mt-1 text-[30px] leading-none">{name ? `Hi ${name}` : "Hi"}</h1>
        </div>
        <button
          type="button"
          onClick={() => setMenu(true)}
          aria-label="Menu"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line/70 bg-card active:bg-panel"
        >
          <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5">
            <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* ── the diary ── */}
      <section className="rounded-[22px] border border-line/70 bg-card p-4" aria-label="Diary">
        <div className="flex items-center justify-between gap-2">
          <h2 className="hand text-[20px] leading-none">Diary</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setDay((d) => Math.max(d - 1, -7))}
              aria-label="Previous day"
              className="flex h-10 w-10 items-center justify-center rounded-full active:bg-panel"
            >
              <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <button
              type="button"
              onClick={() => setDay(0)}
              className="min-w-[96px] rounded-full px-2 py-2 text-center text-[14px] font-semibold"
            >
              {dayLabel(day)}
            </button>
            <button
              type="button"
              onClick={() => setDay((d) => Math.min(d + 1, 14))}
              aria-label="Next day"
              className="flex h-10 w-10 items-center justify-center rounded-full active:bg-panel"
            >
              <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
        </div>

        <div className="mt-3">
          {error ? (
            <ErrorLine text={error} onRetry={load} />
          ) : !diary ? (
            <Spinner label="Loading your diary" className="py-6" />
          ) : (
            <>
              {diary.note && <p className="mb-2 text-[12.5px] text-muted">{diary.note}</p>}
              {allDay.map((a) => (
                <p key={a.id} className="mb-2 rounded-xl bg-panel px-3 py-2 text-[13px]">
                  <span className="font-semibold">All day</span> · {a.what}
                </p>
              ))}
              {earlier.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowEarlier((v) => !v)}
                  className="mb-1 flex h-10 w-full items-center justify-center rounded-xl bg-panel text-[13.5px] font-semibold text-muted"
                >
                  {showEarlier ? "Hide Earlier Today" : `Earlier Today (${earlier.length})`}
                </button>
              )}
              {timed.length === 0 ? (
                <p className="py-5 text-center text-[14px] text-muted">Nothing in the diary {day === 0 ? "today" : "on this day"}.</p>
              ) : listed.length === 0 ? (
                <p className="py-5 text-center text-[14px] text-muted">Nothing else in the diary today.</p>
              ) : (
                <ul className="-mx-1">
                  {listed.map((a) => {
                    const busy = a.what === "Busy" && !a.where;
                    const next = a.id === current?.id;
                    const done = earlier.includes(a);
                    return (
                      <li key={a.id}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setOpen(a)}
                          className="flex w-full items-start gap-3 rounded-2xl px-2 py-3 text-left active:bg-panel disabled:active:bg-transparent"
                          style={next ? { background: "var(--accent-soft)" } : done ? { opacity: 0.55 } : undefined}
                        >
                          <span className="figures w-[52px] shrink-0 pt-[1px] text-[17px] leading-tight">{a.start}</span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-accent-dark">
                                {KIND_LABEL[a.kind] ?? "Appointment"}
                              </span>
                              {next && (
                                <span className="rounded-full bg-card px-2 py-[1px] text-[11px] font-semibold">
                                  {a.start <= nowHm ? "Now" : "Next"}
                                </span>
                              )}
                            </span>
                            <span className="mt-0.5 block text-[15px] font-semibold leading-snug">{busy ? "Busy" : a.where || a.what}</span>
                            {!busy && (a.who || diary.everything) && (
                              <span className="mt-0.5 block truncate text-[13.5px] text-muted">
                                {[a.who && `With ${a.who}`, diary.everything && a.agent].filter(Boolean).join(" · ")}
                              </span>
                            )}
                          </span>
                          {!busy && (
                            <svg viewBox="0 0 24 24" aria-hidden className="mt-1 h-4 w-4 shrink-0 text-muted">
                              <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      </section>

      {/* ── the three buttons ── */}
      <nav className="mt-4 grid grid-cols-1 gap-3" aria-label="Tools">
        <BigButton href="/m/people" icon="user" title="Find a Person" sub="Numbers and emails" />
        <BigButton href="/m/properties" icon="home" title="Find a Property" sub="Rent, tenants and landlord" />
        <BigButton href="/m/id-check" icon="camera" title="Right to Rent ID" sub="Photograph their ID" />
      </nav>

      {open && <ApptSheet appt={open} onClose={() => setOpen(null)} />}

      {menu && (
        <Sheet label="Menu" onClose={() => setMenu(false)}>
          <div className="grid gap-2">
            <Link href="/dashboard" className="flex h-14 items-center gap-3 rounded-2xl border border-line/70 bg-card px-4 text-[15px] font-semibold">
              <DoodleIcon name="dashboard" size={18} /> Open the Full OS
            </Link>
            <button
              type="button"
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
                window.location.href = "/sign-in?next=/m";
              }}
              className="flex h-14 items-center gap-3 rounded-2xl border border-line/70 bg-card px-4 text-left text-[15px] font-semibold"
            >
              <DoodleIcon name="logout" size={18} /> Sign Out
            </button>
          </div>
        </Sheet>
      )}
    </main>
  );
}

function BigButton({ href, icon, title, sub }: { href: string; icon: string; title: string; sub: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-[76px] items-center gap-4 rounded-[22px] border border-line/70 bg-card px-4 py-3 transition-transform active:scale-[0.99] active:bg-panel"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-dark">
        <DoodleIcon name={icon} size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="hand block text-[19px] leading-tight">{title}</span>
        <span className="block text-[13.5px] text-muted">{sub}</span>
      </span>
      <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5 shrink-0 text-muted">
        <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}

/**
 * One appointment, and the three things an agent does with it on the way:
 * find it, ring the person, and - on a viewing - photograph their ID.
 *
 * The diary entry knows the person's NAME only (REX puts it in the title), so
 * their number is looked up by name the moment the sheet opens: the OS's own
 * records first, the full contact book if those have nobody.
 */
function ApptSheet({ appt, onClose }: { appt: Appt; onClose: () => void }) {
  const [people, setPeople] = useState<PhonePerson[] | null>(null);
  const [looking, setLooking] = useState(false);

  useEffect(() => {
    const who = appt.who.trim();
    if (who.length < 2) {
      setPeople([]);
      return;
    }
    let dead = false;
    (async () => {
      const ask = async (extra: string) => {
        const r = await fetch(`/api/m/people?q=${encodeURIComponent(who)}${extra}`, { cache: "no-store" });
        const j = (await r.json().catch(() => ({}))) as { people?: PhonePerson[] };
        return (j.people ?? []).filter((p) => p.name.toLowerCase().trim() === who.toLowerCase());
      };
      const first = await ask("").catch(() => []);
      if (dead) return;
      if (first.length) return setPeople(first.slice(0, 3));
      setLooking(true);
      const second = await ask("&rex=1").catch(() => []);
      if (dead) return;
      setLooking(false);
      setPeople(second.slice(0, 3));
    })();
    return () => {
      dead = true;
    };
  }, [appt.who]);

  const idHref = `/m/id-check?${new URLSearchParams({ name: appt.who, property: appt.where, appt: appt.id }).toString()}`;

  return (
    <Sheet label={appt.what} onClose={onClose}>
      <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-dark">
        {KIND_LABEL[appt.kind] ?? "Appointment"} · {appt.start} to {endOf(appt)}
      </p>
      <h2 className="hand mt-1 text-[24px] leading-tight">{appt.where || appt.what}</h2>
      {appt.where && appt.what && <p className="mt-1 text-[14px] text-muted">{appt.what}</p>}
      {appt.unaccompanied && <p className="mt-2 text-[13.5px] font-semibold">Unaccompanied viewing</p>}

      {appt.where && (
        <a
          href={mapsHref(appt.where, appt.lat, appt.lng)}
          target="_blank"
          rel="noreferrer"
          className="mt-4 flex h-12 items-center justify-center gap-2 rounded-xl border border-line/70 bg-card text-[14.5px] font-semibold"
        >
          <DoodleIcon name="target" size={17} /> Directions
        </a>
      )}

      {appt.who && (
        <div className="mt-5 border-t border-line/50 pt-4">
          <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">With</p>
          {people === null || looking ? (
            <>
              <p className="mt-1 text-[17px] font-semibold">{appt.who}</p>
              <Spinner label={looking ? "Checking the full contact book" : "Finding their number"} className="mt-3" />
            </>
          ) : people.length === 0 ? (
            <>
              <p className="mt-1 text-[17px] font-semibold">{appt.who}</p>
              <p className="mt-2 text-[13.5px] text-muted">No number found for this name.</p>
            </>
          ) : (
            people.map((p) => (
              <div key={p.key} className="mt-2 first:mt-1">
                <p className="text-[17px] font-semibold">{p.name}</p>
                <p className="text-[13.5px] text-muted">{[p.phone, p.email].filter(Boolean).join(" · ") || p.role}</p>
                <ReachButtons phone={p.phone} email={p.email} />
              </div>
            ))
          )}
        </div>
      )}

      {appt.kind === "viewing" && appt.who && (
        <Link
          href={idHref}
          className="mt-5 flex h-14 items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold text-white"
          style={{ background: "var(--brown)" }}
        >
          <DoodleIcon name="camera" size={18} /> Right to Rent ID
        </Link>
      )}
    </Sheet>
  );
}
