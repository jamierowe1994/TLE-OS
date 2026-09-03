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

type Room = "today" | "map" | "prospects" | "lookup" | "owners" | "postcards";

const ROOMS: { key: Room; label: string; icon: string }[] = [
  { key: "today", label: "Today", icon: "dashboard" },
  { key: "map", label: "Map", icon: "search" },
  { key: "prospects", label: "Prospects", icon: "list" },
  { key: "lookup", label: "Look up", icon: "home" },
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
  anniversariesSoon: number;
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
  const [filterPreset, setFilterPreset] = useState<string | undefined>(undefined);

  /* THE PATCH. James, 3 Sep: "when they sign in for the app, they'll select
     their areas that they cover... it will then cordon off the rest." The
     choice lives on the server against the person, and in this browser as
     well so it holds before the answer arrives and on a laptop with no
     session. `null` means not asked yet; [] means they chose the whole patch. */
  const [patch, setPatch] = useState<string[] | null>(null);
  const [allDistricts, setAllDistricts] = useState<string[]>([]);
  const [choosing, setChoosing] = useState(false);

  useEffect(() => {
    let gone = false;
    let local: string[] | null = null;
    try {
      const raw = localStorage.getItem("bond.patch");
      if (raw) local = JSON.parse(raw) as string[];
    } catch {
      /* no memory in this browser */
    }
    fetch("/api/bond/prefs", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (gone || !j.ok) return;
        setAllDistricts(j.all ?? []);
        /* The server's answer wins for a signed-in person; the browser's
           memory stands in otherwise. Neither means the chooser opens. */
        const chosen: string[] | null = j.signedIn ? (j.districts?.length ? j.districts : local) : local;
        setPatch(chosen);
        if (chosen == null) setChoosing(true);
      })
      .catch(() => {
        if (!gone) {
          setPatch(local);
          if (local == null) setChoosing(true);
        }
      });
    return () => { gone = true; };
  }, []);

  async function savePatch(districts: string[]) {
    setPatch(districts);
    setChoosing(false);
    try {
      localStorage.setItem("bond.patch", JSON.stringify(districts));
    } catch {
      /* fine */
    }
    try {
      await fetch("/api/bond/prefs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ districts }) });
    } catch {
      /* the browser keeps it; the server catches up next time */
    }
  }

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
          <div className="mt-4 rounded-xl border border-line/70 px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Your patch</p>
            <p className="mt-1 text-[12px]">
              {patch == null ? "Not chosen" : patch.length === 0 ? "The whole patch" : `${patch.length} district${patch.length === 1 ? "" : "s"}`}
            </p>
            {patch && patch.length > 0 && <p className="truncate text-[10.5px] text-muted">{patch.join(", ")}</p>}
            <button type="button" onClick={() => setChoosing(true)} className="mt-1.5 text-[11px] text-accent-dark underline-offset-2 hover:underline">
              Change
            </button>
          </div>
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
              <RadarBoard
                embedded
                view={room === "map" ? "map" : "list"}
                nearPreset={nearPreset}
                filterPreset={filterPreset}
                districts={patch ?? []}
              />
            )}
            {room === "lookup" && (
              <Lookup
                openOnBoard={(address) => {
                  setFilterPreset(address);
                  setRoom("prospects");
                }}
              />
            )}
            {room === "owners" && <Owners />}
            {room === "postcards" && <Postcards />}
          </main>
        </div>
      </div>

      {choosing && phase === "in" && (
        <PatchChooser all={allDistricts} current={patch ?? []} onDone={savePatch} onClose={patch == null ? undefined : () => setChoosing(false)} />
      )}
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

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Tile label="Flagged" value={s.flagged.toLocaleString("en-GB")} hint={`across ${s.districts} districts`} onClick={() => go("map")} />
        <Tile label="New today" value={s.newToday.toLocaleString("en-GB")} hint={s.lastSweep ? `swept ${when(s.lastSweep)}` : "not swept yet"} onClick={() => go("prospects")} />
        <Tile label="Anniversaries" value={s.anniversariesSoon.toLocaleString("en-GB")} hint="in the next 60 days" onClick={() => go("prospects")} />
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

interface CompanySync {
  connected: boolean;
  needs: string[];
  titlesHeld: number;
  matched: number;
  running: boolean;
  lastRun: { dataset: string; file_name: string; status: string; rows_read: number; rows_kept: number; error: string | null; started_at: string; finished_at: string | null } | null;
}

function Owners() {
  const [data, setData] = useState<{ provider: Provider; lookups: Array<Record<string, unknown>> } | null>(null);
  const [companies, setCompanies] = useState<CompanySync | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/bond/owner", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (j.ok) setData(j);
        else setError(j.reason ?? "Could not read the lookups.");
      })
      .catch(() => setError("Could not read the lookups."));
    fetch("/api/bond/company-sync", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (j.ok) setCompanies(j);
      })
      .catch(() => {
        /* The card below says "not read" rather than inventing a state. */
      });
  }, []);
  if (error) return <p className="text-[12.5px] text-muted">{error}</p>;
  if (!data) return <p className="flex items-center gap-3 py-10 text-[12.5px] text-muted"><span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />Reading...</p>;
  return (
    <div className="fade-up mx-auto max-w-4xl space-y-4">
      {/* The free half: company owners from the Land Registry files. */}
      <div className={`rounded-2xl border p-5 ${companies?.connected ? "border-line/80 bg-panel" : "border-dashed border-line/80"}`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[14px]">Company owners, from the Land Registry files</h2>
          <span className={`rounded-full border px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider ${companies?.connected ? "border-accent-dark text-accent-dark" : "border-line/70 text-muted"}`}>
            {companies == null ? "Not read" : companies.connected ? "Connected" : "Not connected"}
          </span>
        </div>
        <p className="mt-2 text-[12.5px] text-muted">
          Free, monthly, no personal data: every title in the patch owned by a UK or overseas company, with the company's name, number and correspondence address. About one rented home in six.
        </p>
        {companies && (
          <dl className="mt-3 grid grid-cols-2 gap-3 text-[12.5px] sm:grid-cols-4">
            <div><dt className="text-[11px] text-muted">Titles held</dt><dd className="figures">{companies.titlesHeld.toLocaleString("en-GB")}</dd></div>
            <div><dt className="text-[11px] text-muted">Flagged properties matched</dt><dd className="figures">{companies.matched.toLocaleString("en-GB")}</dd></div>
            <div><dt className="text-[11px] text-muted">Last read</dt><dd>{companies.lastRun ? `${when(companies.lastRun.started_at)} · ${companies.lastRun.status}` : "never"}</dd></div>
            <div><dt className="text-[11px] text-muted">File</dt><dd className="truncate">{companies.lastRun?.file_name || "-"}</dd></div>
          </dl>
        )}
        {companies?.lastRun?.error && <p className="mt-2 text-[12px] text-red-700">{companies.lastRun.error}</p>}
        {companies && !companies.connected && (
          <ul className="mt-3 list-disc space-y-1 pl-4 text-[12px] text-muted">
            {companies.needs.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </div>

      <SalesCard />

      <HmoCard />

      <EpcCard />

      <ProviderCard p={data.provider} title="Individual owners, from a Land Registry provider" />

      <section className="rounded-2xl border border-line/80 bg-panel p-5">
        <h2 className="text-[14px]">Owners on record</h2>
        {data.lookups.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-muted">
            None yet. Open a property, pin down the address, then either press Find the owner or look them up elsewhere and record what you found.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line/60 text-[12.5px]">
            {data.lookups.map((l) => (
              <li key={String(l.id)} className="grid gap-1 py-2.5 sm:grid-cols-[1fr_1fr_auto]">
                <div>
                  <p>{String(l.address)}</p>
                  <p className="text-[11px] text-muted">{String(l.requested_by || "")} · {when(String(l.requested_at))}</p>
                </div>
                <div>
                  <p>{String(l.owner_name ?? "") || <span className="text-muted">no name</span>}</p>
                  <p className="text-[11px] text-muted">{String(l.correspondence_address ?? "")}</p>
                </div>
                <span className="text-[11px] text-muted">{String(l.provider ?? "").replace(/^manual:/, "by hand · ")} · {String(l.status)}</span>
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


function SalesCard() {
  const [d, setD] = useState<{ salesHeld: number; recent: number; running: boolean; lastRun: { file_name: string; status: string; rows_kept: number; error: string | null; started_at: string } | null } | null>(null);
  useEffect(() => {
    fetch("/api/bond/sales-sync", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (j.ok) setD(j);
      })
      .catch(() => {});
  }, []);
  return (
    <div className="rounded-2xl border border-line/80 bg-panel p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[14px]">Completed sales, from the Land Registry price-paid file</h2>
        <span className="rounded-full border border-accent-dark px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-accent-dark">Free, no key</span>
      </div>
      <p className="mt-2 text-[12.5px] text-muted">
        Every sale in the patch, monthly. A sale followed by a listing to let is the Just bought signal: a brand new landlord.
      </p>
      {d && (
        <dl className="mt-3 grid grid-cols-2 gap-3 text-[12.5px] sm:grid-cols-4">
          <div><dt className="text-[11px] text-muted">Sales held</dt><dd className="figures">{d.salesHeld.toLocaleString("en-GB")}</dd></div>
          <div><dt className="text-[11px] text-muted">In the last year</dt><dd className="figures">{d.recent.toLocaleString("en-GB")}</dd></div>
          <div><dt className="text-[11px] text-muted">Last read</dt><dd>{d.lastRun ? `${when(d.lastRun.started_at)} · ${d.lastRun.status}` : "never"}</dd></div>
          <div><dt className="text-[11px] text-muted">File</dt><dd className="truncate">{d.lastRun?.file_name || "-"}</dd></div>
        </dl>
      )}
      {d?.lastRun?.error && <p className="mt-2 text-[12px] text-red-700">{d.lastRun.error}</p>}
    </div>
  );
}


interface DossierFacts {
  hs_id: string; uprn: string | null; address: string; postcode: string; beds: number | null; category: string | null;
  tenure: string | null; tax_band: string | null; energy_rating: string | null; energy_epc_date: string | null;
}
interface DossierData {
  facts: DossierFacts;
  property_key: string;
  listings: Array<{ listing_key: string; market: "let" | "sale"; agent: string | null; price: number | null; status: string; listed_on: string | null; first_seen: string; let_agreed_at: string | null; gone_at: string | null }>;
  sales: Array<{ sold_on: string; price: number; new_build: boolean; tenure: string | null }>;
  company: { name: string; number: string | null; address: string; title_number: string } | null;
  prospect: { property_key: string; score: number; stage: string; signals: Array<{ key: string; detail: string }>; hand_reason: string | null; tenancy_start: string | null; next_anniversary: string | null; tenancy_basis: string | null } | null;
}

/**
 * Look up any door in the patch, flagged or not, and put it on the list by
 * hand. The search goes to the property register; the answer is everything
 * Bond already holds about that door.
 */
function Lookup({ openOnBoard }: { openOnBoard: (address: string) => void }) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [candidates, setCandidates] = useState<Array<{ hs_id: string; label: string }>>([]);
  const [note, setNote] = useState<string | null>(null);
  const [dossier, setDossier] = useState<DossierData | null>(null);
  const [reason, setReason] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setNote(null);
    setDossier(null);
    setCandidates([]);
    try {
      const r = await fetch(`/api/bond/property?q=${encodeURIComponent(query.trim())}`, { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) {
        setNote(j.error ?? "Could not search.");
        return;
      }
      setCandidates(j.candidates ?? []);
      if (j.reason) setNote(j.reason);
      if ((j.candidates ?? []).length === 1) void open(j.candidates[0].hs_id);
    } catch {
      setNote("Could not search.");
    } finally {
      setBusy(false);
    }
  }

  async function open(hsId: string) {
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch(`/api/bond/property?hs_id=${encodeURIComponent(hsId)}`, { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) {
        setNote(j.error ?? "Could not read that door.");
        return;
      }
      setDossier(j.dossier);
      setCandidates([]);
    } catch {
      setNote("Could not read that door.");
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!dossier) return;
    setAdding(true);
    setAddError(null);
    try {
      const r = await fetch("/api/bond/property", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hs_id: dossier.facts.hs_id, reason }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setAddError(j.error ?? "That did not save.");
        return;
      }
      setDossier({ ...dossier, prospect: j.prospect });
      setReason("");
    } catch {
      setAddError("That did not save.");
    } finally {
      setAdding(false);
    }
  }

  async function remove() {
    if (!dossier?.prospect) return;
    setAdding(true);
    try {
      const r = await fetch("/api/bond/property", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ property_key: dossier.prospect.property_key, remove: true }),
      });
      const j = await r.json();
      if (j.ok) setDossier({ ...dossier, prospect: j.prospect ?? null });
    } finally {
      setAdding(false);
    }
  }

  const f = dossier?.facts;
  const money = (n: number | null) => (n == null ? "-" : `£${n.toLocaleString("en-GB")}`);

  return (
    <div className="fade-up mx-auto max-w-4xl space-y-4">
      <form onSubmit={search} className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-64 flex-1 items-center gap-2.5 rounded-full border border-line/80 bg-panel px-4 py-2.5 focus-within:border-ink">
          <DoodleIcon name="search" size={15} className="shrink-0 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Any address in the patch, with the postcode if you have it..."
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted/70"
          />
        </label>
        <button type="submit" disabled={busy} className="press-wobble rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page disabled:opacity-40">
          {busy ? "Looking..." : "Look up"}
        </button>
      </form>
      <p className="text-[11.5px] text-muted">
        Flagged or not, every door has a record: what the sweep has seen listed, the sale history, the company on the title, the tenancy estimate. Seen a private lister on Facebook or a board on the street? Look the address up and add it.
      </p>
      {note && <p className="text-[12.5px] text-muted">{note}</p>}

      {candidates.length > 1 && (
        <section className="rounded-2xl border border-line/80 bg-panel p-4">
          <h2 className="text-[13px]">Which door?</h2>
          <ul className="mt-2 divide-y divide-line/60 text-[12.5px]">
            {candidates.map((c) => (
              <li key={c.hs_id}>
                <button type="button" onClick={() => void open(c.hs_id)} className="w-full py-2 text-left hover:text-accent-dark">
                  {c.label}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {dossier && f && (
        <>
          <section className="rounded-2xl border border-line/80 bg-panel p-5">
            <p className="text-[11px] uppercase tracking-wider text-muted">Property</p>
            <h2 className="mt-1 text-[20px] leading-snug">{f.address}</h2>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px] sm:grid-cols-4">
              <div><dt className="text-[11px] text-muted">Beds</dt><dd>{f.beds ?? "-"}</dd></div>
              <div><dt className="text-[11px] text-muted">Type</dt><dd>{f.category ?? "-"}</dd></div>
              <div><dt className="text-[11px] text-muted">Tenure</dt><dd>{f.tenure ?? "-"}</dd></div>
              <div><dt className="text-[11px] text-muted">Council tax</dt><dd>{f.tax_band ?? "-"}</dd></div>
              <div><dt className="text-[11px] text-muted">EPC</dt><dd>{f.energy_rating ? `${f.energy_rating}${f.energy_epc_date ? ` · ${when(f.energy_epc_date)}` : ""}` : "-"}</dd></div>
              <div><dt className="text-[11px] text-muted">Property id</dt><dd className="text-muted">{f.uprn ? `UPRN ${f.uprn}` : "none on the register"}</dd></div>
            </dl>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {dossier.prospect ? (
                <>
                  <span className="rounded-full border border-accent-dark bg-accent-soft/40 px-3 py-1 text-[11.5px] text-accent-dark">
                    On the list · score {dossier.prospect.score} · {dossier.prospect.stage}
                  </span>
                  <button type="button" onClick={() => openOnBoard(f.address.split(",")[0])} className="rounded-full border border-ink/80 px-4 py-1.5 text-[11.5px] font-semibold">
                    Open on the board
                  </button>
                  {dossier.prospect.hand_reason && (
                    <button type="button" onClick={() => void remove()} disabled={adding} className="rounded-full border border-line/80 px-4 py-1.5 text-[11.5px] text-muted">
                      Take off the hand-added list
                    </button>
                  )}
                </>
              ) : null}
            </div>

            {dossier.prospect?.signals?.length ? (
              <ul className="mt-3 space-y-1 text-[12px]">
                {dossier.prospect.signals.map((s) => (
                  <li key={s.key}><span className="font-semibold">{SIGNAL_LABEL[s.key] ?? s.key}</span> <span className="text-muted">· {s.detail}</span></li>
                ))}
              </ul>
            ) : null}

            {!dossier.prospect?.hand_reason && (
              <div className="mt-4 rounded-xl border border-dashed border-line/80 p-3">
                <p className="text-[12px]">Add it to the list</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Why: private lister on Facebook, board outside, spoke to the owner..."
                    className="min-w-64 flex-1 rounded-xl border border-line/80 bg-transparent px-3 py-2 text-[12.5px] outline-none placeholder:text-muted/70 focus:border-ink"
                  />
                  <button type="button" onClick={() => void add()} disabled={adding || !reason.trim()} className="press-wobble rounded-full bg-ink px-4 py-2 text-[12px] font-semibold text-page disabled:opacity-40">
                    {adding ? "Adding..." : "Add to the list"}
                  </button>
                </div>
                {addError && <p className="mt-2 text-[12px] text-red-700">{addError}</p>}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-line/80 bg-panel p-5">
            <h2 className="text-[14px]">What the sweep has seen</h2>
            {dossier.listings.length === 0 ? (
              <p className="mt-2 text-[12.5px] text-muted">Nothing listed since the sweep began on 2 September 2026.</p>
            ) : (
              <table className="mt-3 w-full text-left text-[12px]">
                <thead className="text-[10.5px] uppercase tracking-wider text-muted">
                  <tr><th className="pb-1">Market</th><th className="pb-1">Agent</th><th className="pb-1">Price</th><th className="pb-1">Listed</th><th className="pb-1">Status</th><th className="pb-1">Let agreed</th></tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {dossier.listings.map((l) => (
                    <tr key={l.listing_key}>
                      <td className="py-1.5">{l.market === "sale" ? "For sale" : "To let"}</td>
                      <td className="py-1.5">{l.agent ?? "-"}</td>
                      <td className="figures py-1.5">{l.market === "sale" ? money(l.price) : l.price == null ? "-" : `${money(l.price)} pcm`}</td>
                      <td className="py-1.5">{when(l.listed_on)}</td>
                      <td className="py-1.5 capitalize">{l.gone_at ? `gone ${when(l.gone_at)}` : l.status}</td>
                      <td className="py-1.5">{l.let_agreed_at ? when(l.let_agreed_at) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <section className="rounded-2xl border border-line/80 bg-panel p-5">
              <h2 className="text-[14px]">Sales on the register</h2>
              {dossier.sales.length === 0 ? (
                <p className="mt-2 text-[12.5px] text-muted">None in the files loaded.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-[12.5px]">
                  {dossier.sales.map((s, i) => (
                    <li key={i}>{when(s.sold_on)} · {money(s.price)}{s.new_build ? " · new build" : ""}{s.tenure ? ` · ${s.tenure === "L" ? "leasehold" : "freehold"}` : ""}</li>
                  ))}
                </ul>
              )}
            </section>
            <section className="rounded-2xl border border-line/80 bg-panel p-5">
              <h2 className="text-[14px]">Owner</h2>
              {dossier.company ? (
                <div className="mt-2 text-[12.5px]">
                  <p className="font-semibold">{dossier.company.name}</p>
                  <p className="text-muted">{dossier.company.address}</p>
                  <p className="text-[11px] text-muted">Land Registry company file · title {dossier.company.title_number}</p>
                </div>
              ) : (
                <p className="mt-2 text-[12.5px] text-muted">
                  Not a company on the Land Registry files loaded. An individual owner is looked up from the property panel on the board.
                </p>
              )}
              {dossier.prospect?.tenancy_start && (
                <p className="mt-3 text-[12px] text-muted">
                  Tenancy from about {when(dossier.prospect.tenancy_start)}, next anniversary {when(dossier.prospect.next_anniversary)}{dossier.prospect.tenancy_basis === "estimated" ? " (estimated)" : ""}.
                </p>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

const SIGNAL_LABEL: Record<string, string> = {
  self_managing: "Self-managing", withdrawn: "Withdrawn", switched_agent: "Switched agent", fallen_through: "Fallen through",
  stale_90: "90+ days", stale_60: "60+ days", stale_30: "30+ days", relisted: "Back on market", reduced: "Rent reduced",
  competitor_new: "New with a competitor", company_owned: "Company owned", let_to_sale: "Let, now for sale", sale_stuck: "Not selling",
  sale_to_let: "Could not sell, now to let", just_bought: "Just bought", anniversary_due: "Anniversary due", added_by_hand: "Added by hand",
  hmo_licence_expiring: "HMO licence expiring", epc_below_c: "EPC below C", epc_expiring: "EPC expiring",
};


function HmoCard() {
  const [d, setD] = useState<{ councils: string[]; licencesHeld: number; expiringSoon: number; matched: number; lastRun: { council: string; file_name: string; status: string; rows_kept: number; error: string | null; started_at: string } | null } | null>(null);
  useEffect(() => {
    fetch("/api/bond/hmo-sync", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (j.ok) setD(j);
      })
      .catch(() => {});
  }, []);
  return (
    <div className="rounded-2xl border border-line/80 bg-panel p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[14px]">HMO licences, from the councils' public registers</h2>
        <span className="rounded-full border border-accent-dark px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-accent-dark">Free, no key</span>
      </div>
      <p className="mt-2 text-[12.5px] text-muted">
        Every licensed HMO in the patch with its expiry. A licence running out inside five months is the HMO licence expiring signal. Reading: {d?.councils.join(", ") ?? "..."}. Milton Keynes, Bedford and North Northants publish differently and are not read yet.
      </p>
      {d && (
        <dl className="mt-3 grid grid-cols-2 gap-3 text-[12.5px] sm:grid-cols-4">
          <div><dt className="text-[11px] text-muted">Licences held</dt><dd className="figures">{d.licencesHeld.toLocaleString("en-GB")}</dd></div>
          <div><dt className="text-[11px] text-muted">Expiring in 150 days</dt><dd className="figures">{d.expiringSoon.toLocaleString("en-GB")}</dd></div>
          <div><dt className="text-[11px] text-muted">Flagged properties matched</dt><dd className="figures">{d.matched.toLocaleString("en-GB")}</dd></div>
          <div><dt className="text-[11px] text-muted">Last read</dt><dd>{d.lastRun ? `${when(d.lastRun.started_at)} · ${d.lastRun.status}` : "never"}</dd></div>
        </dl>
      )}
      {d?.lastRun?.error && <p className="mt-2 text-[12px] text-red-700">{d.lastRun.error}</p>}
    </div>
  );
}


function EpcCard() {
  const [d, setD] = useState<{ connected: boolean; needs: string[]; certificatesHeld: number; belowC: number; expiringSoon: number; matched: number; lastRun: { council: string; status: string; rows_kept: number; error: string | null; started_at: string } | null } | null>(null);
  useEffect(() => {
    fetch("/api/bond/epc-sync", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (j.ok) setD(j);
      })
      .catch(() => {});
  }, []);
  return (
    <div className={`rounded-2xl border p-5 ${d?.connected ? "border-line/80 bg-panel" : "border-dashed border-line/80"}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[14px]">Energy certificates, from the government register</h2>
        <span className={`rounded-full border px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider ${d?.connected ? "border-accent-dark text-accent-dark" : "border-line/70 text-muted"}`}>
          {d == null ? "Not read" : d.connected ? "Connected" : "Not connected"}
        </span>
      </div>
      <p className="mt-2 text-[12.5px] text-muted">
        Every certificate in the patch. Below C is a 2030 problem for the landlord; a certificate in its tenth year means no re-let without a new one.
      </p>
      {d && (
        <dl className="mt-3 grid grid-cols-2 gap-3 text-[12.5px] sm:grid-cols-4">
          <div><dt className="text-[11px] text-muted">Certificates held</dt><dd className="figures">{d.certificatesHeld.toLocaleString("en-GB")}</dd></div>
          <div><dt className="text-[11px] text-muted">Below C</dt><dd className="figures">{d.belowC.toLocaleString("en-GB")}</dd></div>
          <div><dt className="text-[11px] text-muted">Flagged properties matched</dt><dd className="figures">{d.matched.toLocaleString("en-GB")}</dd></div>
          <div><dt className="text-[11px] text-muted">Last read</dt><dd>{d.lastRun ? `${when(d.lastRun.started_at)} · ${d.lastRun.status}` : "never"}</dd></div>
        </dl>
      )}
      {d?.lastRun?.error && <p className="mt-2 text-[12px] text-red-700">{d.lastRun.error}</p>}
      {d && !d.connected && (
        <ul className="mt-3 list-disc space-y-1 pl-4 text-[12px] text-muted">
          {d.needs.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}


/** Area names for the outcodes Bond watches, for the chooser's groups. */
const AREA_NAME: Record<string, string> = { NN: "Northamptonshire", MK: "Milton Keynes and Bedford" };

/**
 * Which districts do you cover? Asked once on first entry, changeable from
 * the rail. Groups by postcode area with a select-all per group; "the whole
 * patch" is a real choice, saved as an empty list.
 */
function PatchChooser({
  all,
  current,
  onDone,
  onClose,
}: {
  all: string[];
  current: string[];
  onDone: (districts: string[]) => void;
  onClose?: () => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(current));
  const groups = (() => {
    const m = new Map<string, string[]>();
    for (const d of all) {
      const area = d.replace(/\d.*$/, "");
      const list = m.get(area) ?? [];
      list.push(d);
      m.set(area, list);
    }
    for (const list of m.values()) list.sort((a, b) => Number(a.replace(/\D/g, "")) - Number(b.replace(/\D/g, "")));
    return [...m.entries()];
  })();
  const toggle = (d: string) =>
    setPicked((cur) => {
      const n = new Set(cur);
      if (n.has(d)) n.delete(d);
      else n.add(d);
      return n;
    });
  const toggleGroup = (list: string[]) =>
    setPicked((cur) => {
      const n = new Set(cur);
      const allOn = list.every((d) => n.has(d));
      for (const d of list) {
        if (allOn) n.delete(d);
        else n.add(d);
      }
      return n;
    });

  return (
    <div className="absolute inset-0 z-[110] flex items-center justify-center bg-ink/35 p-4">
      <div className="fade-up max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-line/80 bg-page p-6 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.45)]">
        <p className="text-[11px] uppercase tracking-wider text-muted">Bond</p>
        <h2 className="hand mt-1 text-[26px]">Which areas do you cover?</h2>
        <p className="mt-1 text-[12.5px] text-muted">
          The map, the list and the look-up stay inside these. Change it any time from the rail. Pick nothing to see the whole patch.
        </p>
        {all.length === 0 ? (
          <p className="mt-4 text-[12.5px] text-muted">Bond is not watching any districts yet.</p>
        ) : (
          <div className="mt-5 space-y-5">
            {groups.map(([area, list]) => {
              const allOn = list.every((d) => picked.has(d));
              return (
                <section key={area}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-[13px]">{AREA_NAME[area] ?? area}</h3>
                    <button type="button" onClick={() => toggleGroup(list)} className="text-[11.5px] text-accent-dark underline-offset-2 hover:underline">
                      {allOn ? "Clear all" : "Select all"}
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {list.map((d) => {
                      const on = picked.has(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => toggle(d)}
                          className={`rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
                            on ? "border-ink bg-ink text-page" : "border-line/80 text-muted hover:border-ink/40 hover:text-ink"
                          }`}
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
        <div className="mt-6 flex flex-wrap items-center gap-2.5">
          <button type="button" onClick={() => onDone([...picked])} className="press-wobble rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page">
            {picked.size === 0 ? "Show me the whole patch" : `Cover ${picked.size} district${picked.size === 1 ? "" : "s"}`}
          </button>
          {onClose && (
            <button type="button" onClick={onClose} className="rounded-full border border-line/80 px-4 py-2.5 text-[12.5px] text-muted">
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
