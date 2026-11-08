"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppIcon from "@/components/app/AppIcon";
import AlertsCard from "@/components/app/AlertsCard";
import StandaloneHint from "@/components/app/StandaloneHint";
import { TopBar } from "./bits";
import { todayLine, useHomeFigures, type Figure } from "./figures";
import FloatSearch from "@/components/app/FloatSearch";
import SearchResults from "./search/results";
import { useAppLook, useFrame } from "@/components/app/AppFrame";
import { useRouter } from "next/navigation";
import type { Appt } from "@/lib/diary";
import { endOf, nowHm } from "./diary-bits";

/**
 * HOME (3 Oct 2026), drawn from James's own pastel mockup - "my favourite is
 * probably the one on the left with the building": the greeting in Bricolage Grotesque
 * beside his painted street, a search across people and properties, four live
 * figures on pink and sage tiles, and today's line that opens Your Day.
 *
 * Every figure is the agent's own and live (./figures). A figure that cannot
 * be read shows a dash, and each tile opens where the number came from.
 */

function greeting(): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/London" }).format(new Date()));
  return h < 12 ? "Good Morning," : h < 18 ? "Good Afternoon," : "Good Evening,";
}

/** "Tuesday 27 October" - the new look's line over the greeting, always today in London. */
function dateLine(): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" }).format(new Date());
}

export default function PhoneHome() {
  const f = useHomeFigures();
  const [first, setFirst] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [needle, setNeedle] = useState("");
  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { user?: { name?: string; photo?: string | null } | null }) => {
        setFirst((j.user?.name ?? "").split(/\s+/)[0] ?? "");
        setPhoto(j.user?.photo ?? null);
      })
      .catch(() => null);
  }, []);

  if (useAppLook()) return <FreshHome f={f} first={first} photo={photo} />;

  return (
    <main>
      <TopBar />

      {/* The greeting and the street. The painting runs off the right edge and
          the search card sits over its foot, as in the mockup. */}
      <section className="relative -mx-4 mt-2 h-[268px] overflow-hidden px-4">
        <img
          src="/illustrations/app/street-corner.webp"
          alt=""
          className="pointer-events-none absolute -right-16 top-0 h-[262px] w-auto max-w-none select-none"
          style={{ maskImage: "linear-gradient(to left, #000 70%, transparent 100%)", WebkitMaskImage: "linear-gradient(to left, #000 70%, transparent 100%)" }}
        />
        <div className="relative w-[56%] pt-4">
          <h1 className="m-title text-[38px] leading-[1.04]">
            {greeting()}
            <br />
            {first || " "}
          </h1>
          <p className="mt-3 max-w-[170px] text-[14px] leading-snug text-muted">Here&apos;s what&apos;s happening with your lettings today.</p>
        </div>
      </section>

      {/* Floats up over a blurred Home and shows what matches (James, 3 Oct 2026). */}
      <div className="relative z-[1] -mt-5 flex">
        <FloatSearch value={needle} onChange={setNeedle} placeholder="Search properties, tenants, landlords...">
          <SearchResults needle={needle} flat />
        </FloatSearch>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Tile href="/agent/leads" tone="pink" icon="user" value={f.leadsToday} label="Leads Today" />
        <Tile href="/agent/properties?chip=market" tone="sage" icon="home" value={f.onMarket} label="On Market" />
        <Tile href="/agent/applications" tone="pink" icon="doc" value={f.applications} label="Applications" />
        <Tile href="/agent/viewings" tone="sage" icon="key" value={f.viewingsWeek} label="Viewings, 7 Days" />
      </div>

      <Link data-morph href="/agent/day" className="m-press mt-3 flex items-center gap-3.5 rounded-[22px] px-4 py-4" style={{ background: "var(--m-green-wash)" }}>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]" style={{ background: "var(--m-card)" }}>
          <AppIcon name="calendar" size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-medium">Today</span>
          <span className="block truncate text-[13.5px] text-muted">
            {f.todayError ? "Your calendar did not load" : f.today ? todayLine(f.today) : "Loading your calendar"}
          </span>
        </span>
        <Chevron />
      </Link>

      <div className="mt-3">
        <StandaloneHint />
        <AlertsCard />
      </div>
    </main>
  );
}

/**
 * HOME in the new look, redrawn 8 Nov 2026 from James's reference ("I really
 * want it to have a premium feeling"): the wordmark, bell and face on a
 * hairline; the date and a big condensed greeting; Your Day as a card of
 * what is left today, the open applications and today's leads; Ask Steve;
 * two figures At a Glance; four Quick Actions; a photograph to finish.
 *
 * The same live figures and links as before (./figures). A figure that
 * cannot be read shows a dash; nothing is counted here that the desk does
 * not count, and nothing is a trend we do not hold.
 */
function FreshHome({ f, first, photo }: { f: ReturnType<typeof useHomeFigures>; first: string; photo: string | null }) {
  const router = useRouter();
  const [ask, setAsk] = useState("");
  const hello = greeting().replace(/,$/, "");
  const next = nextUp(f.today);
  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const q = ask.trim();
    router.push(q ? `/agent/steve?ask=${encodeURIComponent(q)}` : "/agent/steve");
  };
  return (
    <main className="m-h">
      <header className="m-h-top">
        <Link href="/agent" aria-label="TLE OS, home" className="m-h-mark">TLE OS</Link>
        <span className="m-h-top-r">
          <Link href="/agent/search" aria-label="Search people and homes" className="m-h-ic m-press">
            <AppGlyph d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" />
          </Link>
          <BellButton />
          <i className="m-h-rule" aria-hidden />
          <span className="m-h-face" aria-hidden>{photo ? <img src={photo} alt="" /> : initialsOf(first)}</span>
        </span>
      </header>

      <section className="m-h-hello">
        <p className="m-h-eyebrow">{dateLine()}</p>
        <h1 className="m-h-title">
          {hello}
          {first ? `, ${first}.` : "."}
        </h1>
        <p className="m-h-lede">Here&apos;s what needs you today.</p>
      </section>

      <section className="m-h-day" aria-label="Your day">
        <Link href="/agent/day" className="m-h-day-h m-press">
          <i aria-hidden />
          <span>
            <b>Your Day</b>
            <em>{f.todayError ? "Your diary did not load" : f.today ? todayLine(f.today) : "Reading your diary"}</em>
          </span>
          <Chevron />
        </Link>
        {next && (
          <Link href={`/agent/event/${encodeURIComponent(next.id)}`} className="m-h-next m-press">
            <span className="m-h-next-t">{next.start}</span>
            <span className="min-w-0 flex-1">
              <b>{next.what.split(/\s[—–-]\s/)[0]}</b>
              <em>{next.where || next.who || "Next up"}</em>
            </span>
            <span className="m-h-next-k">Next Up</span>
          </Link>
        )}
        <ul className="m-h-rows">
          <DayRow href="/agent/day" d="M4.5 6h15v14h-15zM4.5 10.5h15M8.5 3.5v4M15.5 3.5v4" n={f.today ? leftToday(f.today) : f.todayError ? null : "loading"} one="appointment left today" many="appointments left today" />
          <DayRow href="/agent/applications" d="M6.5 3.5h7.5l4 4v13h-11.5zM14 3.5V7.5h4M9.5 12h6M9.5 15.5h6" n={f.applications} one="application to progress" many="applications to progress" />
          <DayRow href="/agent/leads" d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M18 8v6M15 11h6" n={f.leadsToday} one="new lead today" many="new leads today" />
        </ul>
      </section>

      <form className="m-h-steve" onSubmit={send}>
        <span className="m-h-steve-k">Ask Steve</span>
        <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Ask Steve anything..." aria-label="Ask Steve anything" enterKeyHint="send" />
        <button type="submit" aria-label="Ask Steve" className="m-press">
          <AppGlyph d="M5 12h14M13 6l6 6-6 6" />
        </button>
      </form>

      <section className="m-h-glance" aria-label="At a glance">
        <header>
          <h2>At a Glance</h2>
          <span>Live</span>
        </header>
        <div>
          <GlanceFigure href="/agent/properties?chip=market" value={f.onMarket} label="On the Market" />
          <GlanceFigure href="/agent/viewings" value={f.viewingsWeek} label="Viewings, 7 Days" />
        </div>
      </section>

      <section className="m-h-quick" aria-label="Quick actions">
        <h2>Quick Actions</h2>
        <ul>
          <QuickAction href="/agent/book" label="Book Viewing" d="M4.5 6h15v14h-15zM4.5 10.5h15M8.5 3.5v4M15.5 3.5v4M12 13v5M9.5 15.5h5" />
          <QuickAction href="/agent/id-check" label="Scan an ID" d="M4 8h3l1.5-2h7L17 8h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
          <QuickAction href="/agent/people?who=tenant&passport=1" label="Send Passport" d="M6.5 3.5h11v17h-11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM9 16.5h6" />
          <QuickAction href="/agent/day" label="Open Diary" d="M4.5 6h15v14h-15zM4.5 10.5h15M8.5 3.5v4M15.5 3.5v4" />
        </ul>
      </section>

      <figure className="m-h-photo">
        <img src="/brand/photo/app-home-green-doors.webp" alt="" />
        <figcaption>
          Every Home
          <br />
          Starts Somewhere.
          <i aria-hidden />
        </figcaption>
      </figure>

      <div className="mt-4">
        <StandaloneHint />
        <AlertsCard />
      </div>
    </main>
  );
}

function AppGlyph({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-[20px] w-[20px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function BellButton() {
  const { bell, unread } = useFrame();
  return (
    <button type="button" onClick={bell} aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} className="m-h-ic m-press relative">
      <AppGlyph d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" />
      {unread > 0 && <span className="m-h-dot" aria-hidden />}
    </button>
  );
}

function DayRow({ href, d, n, one, many }: { href: string; d: string; n: Figure; one: string; many: string }) {
  return (
    <li>
      <Link href={href} className="m-press">
        <AppGlyph d={d} />
        <span className="min-w-0 flex-1">
          {n === "loading" ? (
            <span role="status" aria-label="Loading" className="m-h-spin" />
          ) : n === null ? (
            <>
              <b>–</b> {many}
            </>
          ) : (
            <>
              <b>{n}</b> {n === 1 ? one : many}
            </>
          )}
        </span>
        <Chevron />
      </Link>
    </li>
  );
}

function GlanceFigure({ href, value, label }: { href: string; value: Figure; label: string }) {
  return (
    <Link href={href} className="m-press">
      <b>{value === "loading" ? <span role="status" aria-label="Loading" className="m-h-spin" /> : value === null ? "–" : value}</b>
      <span>{label}</span>
    </Link>
  );
}

function QuickAction({ href, label, d }: { href: string; label: string; d: string }) {
  return (
    <li>
      <Link href={href} className="m-press">
        <svg viewBox="0 0 24 24" aria-hidden className="h-[26px] w-[26px]" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <path d={d} />
        </svg>
        <span>{label}</span>
      </Link>
    </li>
  );
}

/** What is still to come today, in time order. */
function leftToday(today: Appt[]): number {
  const now = nowHm();
  return today.filter((a) => endOf(a) > now).length;
}

/** The next appointment today that has not ended, for the Next Up line. */
function nextUp(today: Appt[] | null): Appt | null {
  if (!today) return null;
  const now = nowHm();
  return today.find((a) => endOf(a) > now) ?? null;
}

function initialsOf(name: string): string {
  return (name.trim()[0] ?? "").toUpperCase();
}

/* href null: the figure stands alone until its own app page exists (James,
   3 Oct 2026: the app never opens a desktop page). */
function Tile({ href, tone, icon, value, label }: { href: string | null; tone: "pink" | "sage"; icon: string; value: Figure; label: string }) {
  const Box = ({ children }: { children: React.ReactNode }) =>
    href ? (
      <Link data-morph href={href} className="m-press flex min-h-[132px] flex-col justify-between rounded-[22px] p-4" style={{ background: tone === "pink" ? "var(--m-pink-wash)" : "var(--m-green-wash)" }}>
        {children}
      </Link>
    ) : (
      <div className="flex min-h-[132px] flex-col justify-between rounded-[22px] p-4" style={{ background: tone === "pink" ? "var(--m-pink-wash)" : "var(--m-green-wash)" }}>
        {children}
      </div>
    );
  return (
    <Box>
      <AppIcon name={icon} size={24} />
      <span>
        <span className="m-figure block text-[30px] font-semibold">
          {value === "loading" ? (
            <span role="status" aria-label="Loading" className="mb-1 mt-2 block h-5 w-5 animate-spin rounded-full border-[2.5px] border-black/10 border-t-[color:var(--m-coral)]" />
          ) : value === null ? (
            "–"
          ) : (
            value
          )}
        </span>
        <span className="mt-1 flex items-center justify-between gap-2 text-[13.5px]">
          {label}
          {href && <Chevron />}
        </span>
      </span>
    </Box>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 shrink-0">
      <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
