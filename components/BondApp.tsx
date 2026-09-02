"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";
import RadarBoard from "@/components/RadarBoard";
import { PressButton } from "@/components/Bits";

/**
 * Bond — the prospecting workspace.
 *
 * ── The entrance ──────────────────────────────────────────────────────────
 *
 * James: "it'll enter in by fading in the word Bond, and then it will log
 * everything into the screen." So: the word alone on the page for a beat,
 * then the workspace rises under it, panel by panel. It plays on every
 * arrival, because arriving is the moment it is for; it is short enough that
 * nobody waits.
 *
 * ── One screen, five rooms ────────────────────────────────────────────────
 *
 * Today (the figures and what colleagues did), Map and Prospects (the same
 * book two ways, from RadarBoard), Owners (the Land Registry) and Postcards.
 * The last two are honest rooms: they show what has been done, and when
 * nothing can be done yet they say what is missing. Nothing on this screen
 * ever shows a placeholder as if it were a fact.
 */

type Room = "today" | "map" | "prospects" | "owners" | "postcards";

const ROOMS: { key: Room; label: string; icon: string }[] = [
  { key: "today", label: "Today", icon: "dashboard" },
  { key: "map", label: "Map", icon: "search" },
  { key: "prospects", label: "Prospects", icon: "list" },
  { key: "owners", label: "Owners", icon: "key" },
  { key: "postcards", label: "Postcards", icon: "mail" },
];

interface Summary {
  flagged: number;
  newToday: number;
  workedThisWeek: number;
  appraisalsBooked: number;
  ownersFound: number;
  postcardsSent: number;
  lastSweep: string | null;
  districts: number;
}
interface Activity {
  id: number;
  actor: string;
  kind: string;
  property_key: string | null;
  address: string;
  detail: string;
  at: string;
}
interface Provider {
  connected: boolean;
  name: string | null;
  cost: string;
  needs: string[];
}
interface TodayData {
  summary: Summary;
  activity: Activity[];
  providers: { owner: Provider; postcard: Provider };
}

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

const KIND_ICON: Record<string, string> = {
  stage: "checklist",
  note: "note",
  assigned: "user",
  appraisal: "calendar",
  address: "home",
  owner: "key",
  postcard: "mail",
};

export default function BondApp() {
  const router = useRouter();
  /* word → in. The word has the screen to itself, then the rooms arrive. */
  const [phase, setPhase] = useState<"word" | "in">("word");
  const [room, setRoom] = useState<Room>("today");
  const [today, setToday] = useState<TodayData | null>(null);
  const [todayError, setTodayError] = useState<string | null>(null);
  const [quick, setQuick] = useState("");
  const [nearPreset, setNearPreset] = useState<string | undefined>(undefined);

  useEffect(() => {
    const t = setTimeout(() => setPhase("in"), 1400);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    let gone = false;
    fetch("/api/bond/summary", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (gone) return;
        if (j.ok) setToday(j);
        else setTodayError(j.reason ?? "Bond did not answer.");
      })
      .catch(() => {
        if (!gone) setTodayError("Bond did not answer.");
      });
    return () => { gone = true; };
  }, [room === "today"]);

  /* No Escape-to-leave. The property panel and the new-lead panel both close
     on Escape, and a second listener here took people out of Bond when they
     only meant to close a panel. Measured. Back to OS is the way out. */

  function quickSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!quick.trim()) return;
    setNearPreset(quick.trim());
    setRoom("map");
  }

  return (
    <div className="fixed inset-0 z-[105] overflow-hidden bg-page text-ink">
      {/* The word. */}
      <div
        className={`pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-700 ${
          phase === "word" ? "opacity-100" : "opacity-0"
        }`}
      >
        <span className="hand bond-word text-[72px] leading-none sm:text-[104px]">Bond</span>
      </div>

      {/* The workspace: the rail on the left, as in the OS; the room's title
          and Back to OS across the top; the room below. */}
      <div
        className={`flex h-full transition-opacity duration-700 ${phase === "in" ? "opacity-100" : "pointer-events-none opacity-0"}`}
      >
        <aside className="sticky top-3 mb-3 ml-3 mt-3 hidden h-[calc(100vh-24px)] w-60 shrink-0 flex-col overflow-hidden rounded-3xl border border-line/80 bg-panel px-4 py-5 lg:flex">
          <div className="flex items-center gap-2 px-1">
            <span className="hand text-[26px] leading-none">Bond</span>
          </div>
          <p className="mt-1 px-1 text-[10.5px] text-muted">Prospecting for The Lettings Experts</p>
          <div className="mt-4 border-t border-line/70" />
          <nav className="mt-4 flex flex-col gap-1">
            {ROOMS.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRoom(r.key)}
                className={`hand flex items-center rounded-xl px-3 py-2.5 text-left text-[13.5px] transition-colors ${
                  room === r.key ? "bg-accent-soft/50 font-medium" : "text-muted hover:bg-page hover:text-ink"
                }`}
              >
                <DoodleIcon name={r.icon} size={16} className="mr-2.5 shrink-0" />
                {r.label}
              </button>
            ))}
          </nav>
          <p className="mt-auto px-1 pb-9 text-[10.5px] leading-relaxed text-muted">
            Properties, never people. The owner lookup and the postcard are the two doors still to open.
          </p>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center justify-between gap-3 px-4 pt-4 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="hand text-[22px] leading-none lg:hidden">Bond</span>
              <h1 className="hidden text-[22px] leading-none lg:block">{ROOMS.find((r) => r.key === room)?.label}</h1>
            </div>
            <PressButton
              onClick={() => router.push("/tools")}
              className="rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] text-muted hover:text-ink"
              title="Back to the OS"
            >
              Back to OS
            </PressButton>
          </header>

          {/* Small screens: the rooms as a scrolling row under the title. */}
          <nav className="mt-3 flex shrink-0 gap-1 overflow-x-auto px-3 lg:hidden">
            {ROOMS.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRoom(r.key)}
                className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-[12px] ${
                  room === r.key ? "bg-ink text-page" : "border border-line/80 text-muted"
                }`}
              >
                {r.label}
              </button>
            ))}
          </nav>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            {room === "today" && (
              <Today data={today} error={todayError} quick={quick} setQuick={setQuick} onQuick={quickSearch} go={setRoom} />
            )}
            {/* No fade-up wrapper here: its animation leaves a transform on the
                element, and a transform turns an ancestor into the containing
                block for position: fixed. The property panel inside the board
                would then be clipped to this box instead of covering the
                screen. Measured, not guessed. */}
            {(room === "map" || room === "prospects") && (
              <RadarBoard embedded view={room === "map" ? "map" : "list"} nearPreset={nearPreset} />
            )}
            {room === "owners" && <Owners />}
            {room === "postcards" && <Postcards />}
          </main>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, hint, onClick }: { label: string; value: string; hint?: string; onClick?: () => void }) {
  const inner = (
    <>
      <p className="text-[10.5px] font-bold uppercase tracking-wider text-muted">{label}</p>
      <p className="figures mt-2 text-[26px] leading-none">{value}</p>
      {hint ? <p className="mt-1.5 text-[11px] text-muted">{hint}</p> : null}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="bond-tile fade-up rounded-2xl border border-line/80 bg-panel p-4 text-left transition-colors hover:border-ink">
      {inner}
    </button>
  ) : (
    <div className="bond-tile fade-up rounded-2xl border border-line/80 bg-panel p-4">{inner}</div>
  );
}

function Today({
  data,
  error,
  quick,
  setQuick,
  onQuick,
  go,
}: {
  data: TodayData | null;
  error: string | null;
  quick: string;
  setQuick: (v: string) => void;
  onQuick: (e: React.FormEvent) => void;
  go: (r: Room) => void;
}) {
  if (error) {
    return (
      <div className="rounded-2xl border border-dashed border-line/80 p-6 text-[12.5px]">
        <p>Bond could not read its data.</p>
        <p className="mt-1 text-muted">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex items-center gap-3 py-16 text-[12.5px] text-muted">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />
        Reading today...
      </div>
    );
  }
  const s = data.summary;
  return (
    <div className="mx-auto max-w-6xl">
      <form onSubmit={onQuick} className="fade-up flex flex-wrap items-center gap-2">
        <label className="flex min-w-64 flex-1 items-center gap-2.5 rounded-full border border-line/80 bg-panel px-4 py-2.5 focus-within:border-ink">
          <DoodleIcon name="search" size={15} className="shrink-0 text-muted" />
          <input
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            placeholder="Where are you prospecting today? A postcode or an address..."
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted/70"
          />
        </label>
        <button type="submit" className="press-wobble rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page">
          Show me
        </button>
      </form>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Flagged" value={s.flagged.toLocaleString("en-GB")} hint={`across ${s.districts} districts`} onClick={() => go("map")} />
        <Tile label="New today" value={s.newToday.toLocaleString("en-GB")} hint={s.lastSweep ? `swept ${when(s.lastSweep)}` : "not swept yet"} onClick={() => go("prospects")} />
        <Tile label="Worked this week" value={s.workedThisWeek.toLocaleString("en-GB")} hint="properties touched" />
        <Tile label="Appraisals booked" value={s.appraisalsBooked.toLocaleString("en-GB")} hint="from Bond" />
        <Tile label="Owners found" value={s.ownersFound.toLocaleString("en-GB")} hint={data.providers.owner.connected ? "Land Registry" : "not connected"} onClick={() => go("owners")} />
        <Tile label="Postcards sent" value={s.postcardsSent.toLocaleString("en-GB")} hint={data.providers.postcard.connected ? data.providers.postcard.name ?? "" : "not connected"} onClick={() => go("postcards")} />
      </div>

      <section className="fade-up mt-5 rounded-2xl border border-line/80 bg-panel p-5" style={{ animationDelay: "0.45s" }}>
        <h2 className="text-[14px]">What has happened</h2>
        {data.activity.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-muted">
            Nothing yet. Open a property from the map or the list, set its stage or write a note, and it shows here for everyone.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line/60">
            {data.activity.map((a) => (
              <li key={a.id} className="flex items-start gap-3 py-2.5 text-[12.5px]">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line/70 text-muted">
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
      </section>
    </div>
  );
}

function ProviderCard({ p, title }: { p: Provider; title: string }) {
  return (
    <div className={`rounded-2xl border p-5 ${p.connected ? "border-line/80 bg-panel" : "border-dashed border-line/80"}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[14px]">{title}</h2>
        <span className={`rounded-full border px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider ${p.connected ? "border-accent-dark text-accent-dark" : "border-line/70 text-muted"}`}>
          {p.connected ? `Connected · ${p.name}` : "Not connected"}
        </span>
      </div>
      <p className="mt-2 text-[12.5px] text-muted">{p.cost}</p>
      {!p.connected && (
        <ul className="mt-3 list-disc space-y-1 pl-4 text-[12px] text-muted">
          {p.needs.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Owners() {
  const [data, setData] = useState<{ provider: Provider; lookups: Array<Record<string, unknown>> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/bond/owner", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (j.ok) setData(j);
        else setError(j.reason ?? "Could not read the lookups.");
      })
      .catch(() => setError("Could not read the lookups."));
  }, []);
  if (error) return <p className="text-[12.5px] text-muted">{error}</p>;
  if (!data) return <p className="flex items-center gap-3 py-10 text-[12.5px] text-muted"><span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />Reading...</p>;
  return (
    <div className="fade-up mx-auto max-w-4xl space-y-4">
      <ProviderCard p={data.provider} title="Land Registry" />
      <section className="rounded-2xl border border-line/80 bg-panel p-5">
        <h2 className="text-[14px]">Owners looked up</h2>
        {data.lookups.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-muted">
            None yet. Open a property, pin down the address, then press Find the owner. Each lookup is a small charge, so the screen will show the cost before it orders.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line/60 text-[12.5px]">
            {data.lookups.map((l) => (
              <li key={String(l.id)} className="flex items-center justify-between gap-3 py-2">
                <span>{String(l.address)}</span>
                <span className="text-muted">{String(l.status)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Postcards() {
  const [data, setData] = useState<{ provider: Provider; postcards: Array<Record<string, unknown>> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/bond/postcards", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (j.ok) setData(j);
        else setError(j.reason ?? "Could not read the postcards.");
      })
      .catch(() => setError("Could not read the postcards."));
  }, []);
  if (error) return <p className="text-[12.5px] text-muted">{error}</p>;
  if (!data) return <p className="flex items-center gap-3 py-10 text-[12.5px] text-muted"><span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />Reading...</p>;
  return (
    <div className="fade-up mx-auto max-w-4xl space-y-4">
      <ProviderCard p={data.provider} title="Postcards" />
      <section className="rounded-2xl border border-line/80 bg-panel p-5">
        <h2 className="text-[14px]">Sent and queued</h2>
        {data.postcards.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-muted">
            None yet. A postcard goes to the owner's correspondence address once the Land Registry has given us one, never to the property itself.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line/60 text-[12.5px]">
            {data.postcards.map((c) => (
              <li key={String(c.id)} className="flex items-center justify-between gap-3 py-2">
                <span>{String(c.property)} → {String(c.to_address)}</span>
                <span className="text-muted">{String(c.status)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
