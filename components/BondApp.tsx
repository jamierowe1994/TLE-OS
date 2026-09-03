"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";
import RadarBoard from "@/components/RadarBoard";
import { PressButton } from "@/components/Bits";
import BondAsk, { type AskFocus } from "@/components/BondAsk";
import BondNudges from "@/components/BondNudges";
import BondToday, { rememberSearch, type TodayData } from "@/components/BondToday";

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

type Room = "today" | "nudges" | "map" | "prospects" | "landlords" | "competitors" | "lookup" | "campaigns" | "owners" | "postcards";

const ROOMS: { key: Room; label: string; icon: string }[] = [
  { key: "today", label: "Today", icon: "dashboard" },
  { key: "nudges", label: "Nudges", icon: "call" },
  { key: "map", label: "Map", icon: "search" },
  { key: "prospects", label: "Prospects", icon: "list" },
  { key: "landlords", label: "Landlords", icon: "user" },
  { key: "competitors", label: "Competitors", icon: "target" },
  { key: "lookup", label: "Look up", icon: "home" },
  { key: "campaigns", label: "Campaigns", icon: "megaphone" },
  { key: "owners", label: "Owners", icon: "key" },
  { key: "postcards", label: "Postcards", icon: "mail" },
];

interface Provider {
  connected: boolean;
  name: string | null;
  cost: string;
  needs: string[];
}

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
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
  nudge: "call",
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
  const [lookupPreset, setLookupPreset] = useState<string | undefined>(undefined);

  /* THE PATCH. James, 3 Sep: "when they sign in for the app, they'll select
     their areas that they cover... it will then cordon off the rest." The
     choice lives on the server against the person, and in this browser as
     well so it holds before the answer arrives and on a laptop with no
     session. `null` means not asked yet; [] means they chose the whole patch. */
  const [patch, setPatch] = useState<string[] | null>(null);
  const [allDistricts, setAllDistricts] = useState<string[]>([]);
  const [choosing, setChoosing] = useState(false);

  /* ASK BOND. The consult drawer, open over any room, with the door or
     landlord in front of the person as its focus. */
  const [ask, setAsk] = useState(false);
  const [askFocus, setAskFocus] = useState<AskFocus | null>(null);
  function askAbout(f: AskFocus | null) {
    setAskFocus(f);
    setAsk(true);
  }

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
    if (patch == null) return;
    let gone = false;
    setToday(null);
    fetch(`/api/bond/summary?districts=${encodeURIComponent(patch.join(","))}`, { cache: "no-store" })
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
  }, [room === "today", patch]);

  /* No Escape-to-leave. The property panel and the new-lead panel both close
     on Escape, and a second listener here took people out of Bond when they
     only meant to close a panel. Measured. Back to OS is the way out. */

  function quickSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!quick.trim()) return;
    runSearch(quick.trim());
  }
  function runSearch(term: string) {
    rememberSearch(term);
    setQuick(term);
    setNearPreset(term);
    setRoom("map");
  }

  return (
    <div className="bond-skin fixed inset-0 z-[105] overflow-hidden bg-page text-ink">
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
        <aside className="sticky top-3 mb-3 ml-3 mt-3 hidden h-[calc(100vh-24px)] w-60 shrink-0 flex-col overflow-hidden rounded-3xl border border-line/80 bg-box px-4 py-5 lg:flex">
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
                  room === r.key ? "bg-accent-soft font-medium text-ink" : "text-muted hover:bg-box hover:text-ink"
                }`}
              >
                <DoodleIcon name={r.icon} size={16} className="mr-2.5 shrink-0" />
                {r.label}
              </button>
            ))}
          </nav>
          <button
            type="button"
            onClick={() => askAbout(null)}
            className="hand mt-3 flex items-center rounded-xl border border-dashed border-line/80 px-3 py-2.5 text-left text-[13.5px] text-muted transition-colors hover:border-ink hover:text-ink"
          >
            <DoodleIcon name="magic-wand" size={16} className="mr-2.5 shrink-0" />
            Ask Bond
          </button>
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
              <h1 className="hidden text-[22px] leading-none lg:block">
                {room === "today" ? `${greeting()}${today?.name ? `, ${today.name}` : ""}` : ROOMS.find((r) => r.key === room)?.label}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <PressButton
                onClick={() => setRoom("lookup")}
                className="hidden items-center rounded-full bg-accent-soft px-3.5 py-1.5 text-[12px] font-medium text-ink sm:flex"
                title="Look up any address and add it by hand"
              >
                <span className="mr-1.5 text-[15px] leading-none">+</span>
                Add prospect
              </PressButton>
              <PressButton
                onClick={() => askAbout(null)}
                className="flex items-center rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] text-muted hover:text-ink"
                title="Ask Bond about the patch"
              >
                <DoodleIcon name="magic-wand" size={13} className="mr-1.5" />
                Ask Bond
              </PressButton>
              <PressButton
                onClick={() => router.push("/tools")}
                className="rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] text-muted hover:text-ink"
                title="Back to the OS"
              >
                Back to OS
              </PressButton>
              <button
                type="button"
                onClick={() => setRoom("nudges")}
                className="relative flex h-9 w-9 items-center justify-center rounded-full border border-line/80 text-muted transition-colors hover:text-ink"
                title="Nudges: who to call today"
              >
                <DoodleIcon name="bell" size={15} />
                {today && today.summary.nudgesOpen > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-dark px-1 text-[9.5px] font-bold text-white">
                    {today.summary.nudgesOpen}
                  </span>
                )}
              </button>
            </div>
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

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            {room === "today" && (
              <BondToday data={today} error={todayError} quick={quick} setQuick={setQuick} search={runSearch} go={setRoom} />
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
                onAsk={(p) => {
                  const a = (p.address || p.street || "").trim();
                  askAbout({ kind: "door", key: p.property_key, label: a.toUpperCase().includes(p.postcode.toUpperCase()) ? a : `${a}, ${p.postcode}` });
                }}
              />
            )}
            {room === "landlords" && (
              <Landlords
                districts={patch ?? []}
                openDoor={(address) => {
                  setFilterPreset(address);
                  setRoom("prospects");
                }}
                onAsk={(key, label) => askAbout({ kind: "landlord", key, label })}
              />
            )}
            {room === "competitors" && (
              <Competitors
                districts={patch ?? []}
                lookUp={(address) => {
                  setLookupPreset(address);
                  setRoom("lookup");
                }}
              />
            )}
            {room === "lookup" && (
              <Lookup
                preset={lookupPreset}
                openOnBoard={(address) => {
                  setFilterPreset(address);
                  setRoom("prospects");
                }}
              />
            )}
            {room === "nudges" && (
              <BondNudges
                districts={patch ?? []}
                openDoor={(address) => {
                  setFilterPreset(address);
                  setRoom("prospects");
                }}
                onAsk={askAbout}
              />
            )}
            {room === "campaigns" && <Campaigns />}
            {room === "owners" && <Owners />}
            {room === "postcards" && <Postcards />}
          </main>
        </div>
      </div>

      <BondAsk open={ask} onClose={() => setAsk(false)} districts={patch ?? []} focus={askFocus} onClearFocus={() => setAskFocus(null)} />

      {choosing && phase === "in" && (
        <PatchChooser all={allDistricts} current={patch ?? []} onDone={savePatch} onClose={patch == null ? undefined : () => setChoosing(false)} />
      )}
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
  const [data, setData] = useState<{ provider: Provider } | null>(null);
  const [queue, setQueue] = useState<SendRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<"queued" | "held" | "sent" | "all">("queued");
  useEffect(() => {
    fetch("/api/bond/postcards", { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (j.ok) setData(j); else setError(j.reason ?? "Could not read the postcards."); })
      .catch(() => setError("Could not read the postcards."));
    fetch("/api/bond/campaigns", { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (j.ok) setQueue(j.sends); })
      .catch(() => {});
  }, []);
  if (error) return <p className="text-[12.5px] text-muted">{error}</p>;
  if (!data || queue == null) return <p className="flex items-center gap-3 py-10 text-[12.5px] text-muted"><span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />Reading...</p>;
  const shown = queue.filter((s) => state === "all" || s.status === state);
  const counts = { queued: queue.filter((s) => s.status === "queued").length, held: queue.filter((s) => s.status === "held").length, sent: queue.filter((s) => s.status === "sent").length };
  return (
    <div className="fade-up mx-auto max-w-5xl space-y-4">
      <ProviderCard p={data.provider} title="Postcards and letters" />
      <section className="rounded-2xl border border-line/80 bg-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[14px]">The queue</h2>
          <span className="flex items-center gap-1 rounded-full border border-line/80 p-0.5">
            {(["queued", "held", "sent", "all"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setState(k)} className={`rounded-full px-3.5 py-1.5 text-[12px] capitalize transition-colors ${state === k ? "bg-ink text-page" : "text-muted hover:text-ink"}`}>
                {k}{k !== "all" ? ` ${counts[k]}` : ""}
              </button>
            ))}
          </span>
        </div>
        <p className="mt-1 text-[12px] text-muted">
          Queued cards go to the print house on the morning it is connected. Held cards say why they did not: no owner address, Do not send, written to lately, or a step with no copy.
        </p>
        {shown.length === 0 ? (
          <p className="mt-3 text-[12.5px] text-muted">Nothing {state === "all" ? "yet" : state}. The queue is built every morning from the campaigns.</p>
        ) : (
          <table className="mt-3 w-full text-left text-[12.5px]">
            <thead className="text-[10.5px] uppercase tracking-wider text-muted">
              <tr className="border-b border-line/70"><th className="py-2 pr-3">Due</th><th className="py-2 pr-3">Door</th><th className="py-2 pr-3">To</th><th className="py-2 pr-3">Step</th><th className="py-2">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {shown.slice(0, 200).map((s) => (
                <tr key={s.id}>
                  <td className="py-2 pr-3 whitespace-nowrap">{when(s.due_on)}</td>
                  <td className="py-2 pr-3"><span className="block max-w-[22rem] truncate">{s.address}</span></td>
                  <td className="py-2 pr-3 text-muted"><span className="block max-w-[18rem] truncate">{s.to_name ? `${s.to_name}, ` : ""}{s.to_address ?? "no address"}</span></td>
                  <td className="py-2 pr-3 text-muted">{s.campaign_name} · {s.step_title} · {s.mail_type}</td>
                  <td className="py-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10.5px] ${s.status === "queued" ? "border-accent-dark/60 bg-accent-soft text-accent-dark" : s.status === "sent" ? "border-line/70 text-ink" : "border-line/70 text-muted"}`}>{s.status}</span>
                    {s.reason && <span className="ml-2 text-[11px] text-muted">{s.reason}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
function Lookup({ openOnBoard, preset }: { openOnBoard: (address: string) => void; preset?: string }) {
  const [query, setQuery] = useState(preset ?? "");
  const [busy, setBusy] = useState(false);
  const [candidates, setCandidates] = useState<Array<{ hs_id: string; label: string }>>([]);
  const [note, setNote] = useState<string | null>(null);
  const [dossier, setDossier] = useState<DossierData | null>(null);
  const [reason, setReason] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  /* Arriving from another room with an address in hand: search it at once. */
  useEffect(() => {
    if (preset && preset.trim()) {
      setQuery(preset);
      void search(undefined, preset);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  async function search(e?: React.FormEvent, presetQuery?: string) {
    e?.preventDefault();
    const q0 = (presetQuery ?? query).trim();
    if (!q0) return;
    setBusy(true);
    setNote(null);
    setDossier(null);
    setCandidates([]);
    try {
      const r = await fetch(`/api/bond/property?q=${encodeURIComponent(q0)}`, { cache: "no-store" });
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
                  {dossier.prospect.score > 0 || dossier.prospect.stage !== "new" ? (
                    <span className="rounded-full border border-accent-dark bg-accent-soft/40 px-3 py-1 text-[11.5px] text-accent-dark">
                      On the list · score {dossier.prospect.score} · {dossier.prospect.stage}
                    </span>
                  ) : (
                    <span className="rounded-full border border-line/80 px-3 py-1 text-[11.5px] text-muted">
                      Known door, not flagged
                    </span>
                  )}
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


interface LandlordRow {
  landlord_key: string;
  kind: "company" | "individual" | "unknown";
  name: string;
  company_number: string | null;
  address: string;
  source: string;
  portfolio_size: number;
  flagged: number;
  score: number;
  band: "Very high" | "High" | "Medium" | "Low";
  marketing_status: "active" | "do_not_send";
  linkedin_url: string | null;
  notes: string;
  last_written_at: string | null;
  condition_score: number | null;
  condition_doors: number;
}
interface LandlordDoorRow {
  property_key: string;
  address: string;
  postcode: string;
  via: string;
  prospect: { score: number; stage: string; photo: string | null; agent: string | null; rent: number | null; signals: Array<{ key: string; detail: string }> } | null;
}

const BAND_TONE: Record<LandlordRow["band"], string> = {
  "Very high": "border-accent-dark bg-accent-dark text-white",
  High: "border-accent-dark/60 bg-accent-soft text-accent-dark",
  Medium: "border-line/80 text-ink",
  Low: "border-line/70 text-muted",
};

/**
 * Landlords: the people and companies behind the doors, with a portfolio,
 * a score and a marketing status. What Spectre lists; ours is built from
 * the company files, the owners recorded on doors, and later REX.
 */
function Landlords({ districts, openDoor, onAsk }: { districts: string[]; openDoor: (address: string) => void; onAsk: (key: string, label: string) => void }) {
  const [rows, setRows] = useState<LandlordRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "company" | "individual">("all");
  const [openKey, setOpenKey] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    setRows(null);
    fetch(`/api/bond/landlords?districts=${encodeURIComponent(districts.join(","))}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (gone) return;
        if (j.ok) setRows(j.landlords);
        else setError(j.reason ?? "Could not read the landlords.");
      })
      .catch(() => { if (!gone) setError("Could not read the landlords."); });
    return () => { gone = true; };
  }, [districts.join(",")]);

  const shown = (rows ?? []).filter((l) => {
    if (kind !== "all" && l.kind !== kind) return false;
    if (q.trim() && !`${l.name} ${l.address} ${l.company_number ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())) return false;
    return true;
  });

  function patched(l: LandlordRow) {
    setRows((rs) => (rs ?? []).map((r) => (r.landlord_key === l.landlord_key ? { ...r, ...l } : r)));
  }

  return (
    <div className="fade-up">
      <div className="flex flex-wrap items-center gap-2.5">
        <label className="flex min-w-64 flex-1 items-center gap-2.5 rounded-full border border-line/80 bg-panel px-4 py-2.5 focus-within:border-ink">
          <DoodleIcon name="search" size={15} className="shrink-0 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search landlords by name, address or company number..." className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted/70" />
        </label>
        <span className="flex items-center gap-1 rounded-full border border-line/80 p-0.5">
          {(["all", "company", "individual"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-full px-3.5 py-1.5 text-[12px] capitalize transition-colors ${kind === k ? "bg-ink text-page" : "text-muted hover:text-ink"}`}>
              {k === "all" ? "All" : k === "company" ? "Companies" : "Individuals"}
            </button>
          ))}
        </span>
      </div>

      {error ? (
        <p className="mt-4 text-[12.5px] text-muted">{error}</p>
      ) : rows == null ? (
        <p className="mt-6 flex items-center gap-3 text-[12.5px] text-muted"><span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />Reading the landlords...</p>
      ) : rows.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-line/80 p-6 text-[12.5px] text-muted">
          No landlords yet. They come from the Land Registry company files once the key is in, and from owners recorded on doors. Record an owner on any property and they appear here.
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-line/80 bg-panel">
          <table className="w-full text-left text-[12.5px]">
            <thead className="text-[10.5px] uppercase tracking-wider text-muted">
              <tr className="border-b border-line/70">
                <th className="px-4 py-3">Landlord</th>
                <th className="px-4 py-3">Kind</th>
                <th className="px-4 py-3">Opportunity</th>
                <th className="px-4 py-3 text-right">Properties</th>
                <th className="px-4 py-3 text-right">Flagged</th>
                <th className="px-4 py-3">Condition</th>
                <th className="px-4 py-3">Marketing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {shown.slice(0, 200).map((l) => (
                <tr key={l.landlord_key} onClick={() => setOpenKey(l.landlord_key)} className="cursor-pointer transition-colors hover:bg-page">
                  <td className="px-4 py-3">
                    <p className="hand text-[13.5px]">{l.name}</p>
                    <p className="max-w-[28rem] truncate text-[11px] text-muted">{l.address || "No correspondence address on file"}</p>
                  </td>
                  <td className="px-4 py-3 capitalize text-muted">{l.kind}</td>
                  <td className="px-4 py-3"><span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${BAND_TONE[l.band]}`}>{l.band}</span></td>
                  <td className="figures px-4 py-3 text-right">{l.portfolio_size}</td>
                  <td className="figures px-4 py-3 text-right">{l.flagged}</td>
                  <td className="px-4 py-3"><ConditionMark score={l.condition_score} doors={l.condition_doors} /></td>
                  <td className="px-4 py-3">{l.marketing_status === "do_not_send" ? <span className="rounded-full border border-red-700/40 bg-red-50 px-2 py-0.5 text-[10.5px] font-semibold text-red-700">Do not send</span> : <span className="text-muted">Active</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-line/70 px-4 py-2.5 text-[11px] text-muted">
            {shown.length.toLocaleString("en-GB")} landlord{shown.length === 1 ? "" : "s"}{shown.length > 200 ? ", first 200 shown" : ""}
          </p>
        </div>
      )}

      {openKey && <LandlordPanel landlordKey={openKey} onClose={() => setOpenKey(null)} onPatched={patched} openDoor={openDoor} onAsk={onAsk} />}
    </div>
  );
}

function LandlordPanel({ landlordKey, onClose, onPatched, openDoor, onAsk }: { landlordKey: string; onClose: () => void; onPatched: (l: LandlordRow) => void; openDoor: (address: string) => void; onAsk: (key: string, label: string) => void }) {
  const [data, setData] = useState<{ landlord: LandlordRow; doors: LandlordDoorRow[] } | null>(null);
  const [shown, setShown] = useState(false);
  const [linkedin, setLinkedin] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    fetch(`/api/bond/landlords?key=${encodeURIComponent(landlordKey)}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (j.ok) {
          setData({ landlord: j.landlord, doors: j.doors });
          setLinkedin(j.landlord.linkedin_url ?? "");
          setNotes(j.landlord.notes ?? "");
        } else setErr(j.reason ?? "Could not read this landlord.");
      })
      .catch(() => setErr("Could not read this landlord."));
    return () => { cancelAnimationFrame(id); window.removeEventListener("keydown", onKey); };
  }, [landlordKey, onClose]);

  async function save(patch: Record<string, unknown>) {
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch("/api/bond/landlords", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: landlordKey, ...patch }) });
      const j = await r.json();
      if (!r.ok || !j.ok) { setErr(j.error ?? "That did not save."); return; }
      setData((d) => (d ? { ...d, landlord: j.landlord } : d));
      onPatched(j.landlord);
    } catch {
      setErr("That did not save.");
    } finally {
      setSaving(false);
    }
  }

  const l = data?.landlord;
  const searchUrl = l ? `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(l.name + (l.kind === "individual" ? " landlord" : ""))}` : "#";

  return (
    <div className="fixed inset-0 z-[120]">
      <button aria-label="Close" onClick={onClose} className={`absolute inset-0 cursor-default bg-ink/35 transition-opacity duration-300 ${shown ? "opacity-100" : "opacity-0"}`} />
      <aside
        className={`absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden rounded-l-2xl bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] transition-transform duration-[420ms] sm:w-[560px] ${shown ? "translate-x-0" : "translate-x-full"}`}
        style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-6 pt-5">
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted transition-colors hover:text-ink" title="Close (Esc)">✕</button>
          <div className="flex items-center gap-2">
            {l && (
              <button
                type="button"
                onClick={() => onAsk(l.landlord_key, l.name)}
                className="rounded-full border border-line/80 px-3 py-1 text-[11.5px] text-muted transition-colors hover:border-ink hover:text-ink"
                title="Open Ask Bond with this landlord in front of it"
              >
                Ask Bond
              </button>
            )}
            {l && <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${BAND_TONE[l.band]}`}>{l.band} opportunity · {l.score}</span>}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-4">
          {err && <p className="text-[12.5px] text-red-700">{err}</p>}
          {!data && !err && <p className="flex items-center gap-3 text-[12.5px] text-muted"><span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />Reading...</p>}
          {l && (
            <>
              <p className="text-[11px] uppercase tracking-wider text-muted">{l.kind === "company" ? "Company landlord" : "Landlord"}</p>
              <h2 className="mt-1 text-[22px] leading-snug">{l.name}</h2>
              <p className="mt-1 text-[12.5px] text-muted">{l.address || "No correspondence address on file"}</p>
              {l.company_number && (
                <p className="mt-1 text-[11.5px] text-muted">
                  Company {l.company_number} ·{" "}
                  <a className="underline" href={`https://find-and-update.company-information.service.gov.uk/company/${l.company_number}`} target="_blank" rel="noreferrer">Companies House</a>
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <PressButton disabled className="rounded-full bg-ink px-5 py-2 text-[12.5px] font-semibold text-page disabled:opacity-40" title="Postcards are not connected yet">Write to</PressButton>
                <PressButton
                  onClick={() => void save({ marketing_status: l.marketing_status === "do_not_send" ? "active" : "do_not_send" })}
                  disabled={saving}
                  className={`rounded-full border px-4 py-2 text-[12.5px] ${l.marketing_status === "do_not_send" ? "border-red-700/40 text-red-700" : "border-line/80 text-muted"}`}
                >
                  {l.marketing_status === "do_not_send" ? "Do not send · switch back on" : "Mark Do not send"}
                </PressButton>
                <a href={searchUrl} target="_blank" rel="noreferrer" className="rounded-full border border-line/80 px-4 py-2 text-[12.5px] text-muted hover:text-ink">Find on LinkedIn</a>
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-3 text-[12.5px] sm:grid-cols-4">
                <div className="rounded-xl border border-line/80 bg-panel p-3"><dt className="text-[10.5px] uppercase tracking-wider text-muted">Properties</dt><dd className="figures mt-1 text-[20px]">{l.portfolio_size}</dd></div>
                <div className="rounded-xl border border-line/80 bg-panel p-3"><dt className="text-[10.5px] uppercase tracking-wider text-muted">Flagged</dt><dd className="figures mt-1 text-[20px]">{l.flagged}</dd></div>
                <div className="rounded-xl border border-line/80 bg-panel p-3">
                  <dt className="text-[10.5px] uppercase tracking-wider text-muted">Portfolio condition</dt>
                  <dd className="figures mt-1 text-[20px]">{l.condition_score ?? "-"}</dd>
                  <p className="text-[10.5px] text-muted">{l.condition_doors ? `${l.condition_doors} of ${l.portfolio_size} with a certificate` : "no certificates on file"}</p>
                </div>
                <div className="rounded-xl border border-line/80 bg-panel p-3"><dt className="text-[10.5px] uppercase tracking-wider text-muted">Last written</dt><dd className="mt-1 text-[13px]">{l.last_written_at ? when(l.last_written_at) : "never"}</dd></div>
              </dl>

              <section className="mt-5">
                <h3 className="text-[13px]">Properties</h3>
                <ul className="mt-2 divide-y divide-line/60">
                  {data!.doors.map((d) => (
                    <li key={d.property_key} className="flex items-center gap-3 py-2 text-[12.5px]">
                      {d.prospect?.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={d.prospect.photo} alt="" className="h-10 w-14 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <span className="h-10 w-14 shrink-0 rounded-lg border border-line/70 bg-page" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate">{d.address || d.postcode}</p>
                        <p className="truncate text-[11px] text-muted">
                          {d.prospect ? `${d.prospect.signals.map((s) => SIGNAL_LABEL[s.key] ?? s.key).join(", ") || "on record"} · score ${d.prospect.score}` : "Not on the market"}
                        </p>
                      </div>
                      {d.prospect && (
                        <button type="button" onClick={() => openDoor((d.address || d.postcode).split(",")[0])} className="shrink-0 rounded-full border border-line/80 px-3 py-1 text-[11px] text-muted hover:text-ink">Open</button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>

              <section className="mt-5 space-y-3">
                <label className="block text-[12px]">
                  <span className="text-[11px] text-muted">LinkedIn</span>
                  <div className="mt-1 flex gap-2">
                    <input value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="https://www.linkedin.com/in/..." className="min-w-0 flex-1 rounded-xl border border-line/80 bg-transparent px-3 py-2 text-[12.5px] outline-none placeholder:text-muted/70 focus:border-ink" />
                    <PressButton onClick={() => void save({ linkedin_url: linkedin })} disabled={saving || linkedin === (l.linkedin_url ?? "")} className="rounded-full border border-ink/80 px-4 py-2 text-[12px] font-semibold disabled:opacity-40">Save</PressButton>
                  </div>
                  {l.linkedin_url && <a href={l.linkedin_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11.5px] text-accent-dark underline">Open profile</a>}
                </label>
                <label className="block text-[12px]">
                  <span className="text-[11px] text-muted">Notes</span>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-1 w-full resize-y rounded-xl border border-line/80 bg-transparent px-3 py-2 text-[12.5px] outline-none focus:border-ink" />
                  <PressButton onClick={() => void save({ notes })} disabled={saving || notes === l.notes} className="mt-2 rounded-full border border-ink/80 px-4 py-2 text-[12px] font-semibold disabled:opacity-40">Save notes</PressButton>
                </label>
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}


interface CompetitorAgentRow { agent: string; stock: number; tenanted: number; on_market: number; anniversaries_90: number }
interface CompetitorDoorRow {
  property_key: string; address: string; postcode: string; district: string | null; agent: string;
  state: "tenanted" | "on_market" | "withdrawn" | "other"; status: string; rent: number | null; beds: number | null;
  listed_on: string | null; let_agreed_at: string | null; tenancy_start: string | null; next_anniversary: string | null;
  tenancy_basis: string | null; photo: string | null; flagged_score: number;
}

const STATE_LABEL: Record<CompetitorDoorRow["state"], string> = { tenanted: "Tenanted", on_market: "On market", withdrawn: "Withdrawn", other: "Unknown" };

/**
 * Who manages what. The agents in the patch with their stock, then the doors
 * behind any one of them, with the anniversary the predictor puts on each.
 */
function Competitors({ districts, lookUp }: { districts: string[]; lookUp: (address: string) => void }) {
  const [agents, setAgents] = useState<CompetitorAgentRow[] | null>(null);
  const [agent, setAgent] = useState<string | null>(null);
  const [doors, setDoors] = useState<CompetitorDoorRow[] | null>(null);
  const [state, setState] = useState<"all" | "tenanted" | "on_market" | "withdrawn">("all");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const key = districts.join(",");

  useEffect(() => {
    let gone = false;
    setAgents(null);
    fetch(`/api/bond/competitors?districts=${encodeURIComponent(key)}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (!gone) { if (j.ok) setAgents(j.agents); else setError(j.reason ?? "Could not read the agents."); } })
      .catch(() => { if (!gone) setError("Could not read the agents."); });
    return () => { gone = true; };
  }, [key]);

  useEffect(() => {
    let gone = false;
    setDoors(null);
    fetch(`/api/bond/competitors?doors=1&districts=${encodeURIComponent(key)}&agent=${encodeURIComponent(agent ?? "")}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (!gone) { if (j.ok) setDoors(j.doors); else setError(j.reason ?? "Could not read the stock."); } })
      .catch(() => { if (!gone) setError("Could not read the stock."); });
    return () => { gone = true; };
  }, [key, agent]);

  const shown = (doors ?? []).filter((d) => {
    if (state !== "all" && d.state !== state) return false;
    if (q.trim() && !`${d.address} ${d.postcode} ${d.agent}`.toLowerCase().includes(q.trim().toLowerCase())) return false;
    return true;
  });
  const totals = agents ? agents.reduce((a, r) => ({ stock: a.stock + r.stock, tenanted: a.tenanted + r.tenanted, ann: a.ann + r.anniversaries_90 }), { stock: 0, tenanted: 0, ann: 0 }) : null;

  return (
    <div className="fade-up">
      {error && <p className="text-[12.5px] text-red-700">{error}</p>}
      {totals && (
        <p className="text-[12px] text-muted">
          {agents!.length} agents let {totals.stock.toLocaleString("en-GB")} properties in the patch in the last two years, {totals.tenanted.toLocaleString("en-GB")} tenanted now, {totals.ann.toLocaleString("en-GB")} with an anniversary in the next 90 days.
        </p>
      )}

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        <button type="button" onClick={() => setAgent(null)} className={`shrink-0 rounded-2xl border px-4 py-3 text-left transition-colors ${agent == null ? "border-ink bg-panel" : "border-line/80 hover:border-ink/40"}`}>
          <p className="text-[12.5px]">All agents</p>
          <p className="figures text-[18px]">{totals ? totals.stock.toLocaleString("en-GB") : "-"}</p>
        </button>
        {(agents ?? []).slice(0, 12).map((a) => (
          <button key={a.agent} type="button" onClick={() => setAgent(a.agent)} className={`w-44 shrink-0 rounded-2xl border px-4 py-3 text-left transition-colors ${agent === a.agent ? "border-ink bg-panel" : "border-line/80 hover:border-ink/40"}`}>
            <p className="truncate text-[12.5px]" title={a.agent}>{a.agent}</p>
            <p className="figures text-[18px]">{a.stock}</p>
            <p className="text-[10.5px] text-muted">{a.tenanted} tenanted · {a.on_market} on market{a.anniversaries_90 ? ` · ${a.anniversaries_90} due` : ""}</p>
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <label className="flex min-w-64 flex-1 items-center gap-2.5 rounded-full border border-line/80 bg-panel px-4 py-2.5 focus-within:border-ink">
          <DoodleIcon name="search" size={15} className="shrink-0 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by address, postcode or agent..." className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted/70" />
        </label>
        {agents && agents.length > 12 && (
          <select value={agent ?? ""} onChange={(e) => setAgent(e.target.value || null)} className="rounded-full border border-line/80 bg-transparent px-3 py-2 text-[12px] outline-none">
            <option value="">All agents</option>
            {agents.map((a) => <option key={a.agent} value={a.agent}>{a.agent} ({a.stock})</option>)}
          </select>
        )}
        <span className="flex items-center gap-1 rounded-full border border-line/80 p-0.5">
          {(["all", "tenanted", "on_market", "withdrawn"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setState(k)} className={`rounded-full px-3.5 py-1.5 text-[12px] transition-colors ${state === k ? "bg-ink text-page" : "text-muted hover:text-ink"}`}>
              {k === "all" ? "All" : STATE_LABEL[k]}
            </button>
          ))}
        </span>
      </div>

      {doors == null ? (
        <p className="mt-6 flex items-center gap-3 text-[12.5px] text-muted"><span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />Reading the stock...</p>
      ) : shown.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-line/80 p-6 text-[12.5px] text-muted">Nothing matches.</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-line/80 bg-panel">
          <table className="w-full text-left text-[12.5px]">
            <thead className="text-[10.5px] uppercase tracking-wider text-muted">
              <tr className="border-b border-line/70">
                <th className="px-4 py-3">Property</th>
                <th className="px-4 py-3">Managed by</th>
                <th className="px-4 py-3">Tenanted</th>
                <th className="px-4 py-3">Rent</th>
                <th className="px-4 py-3">Anniversary</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {shown.slice(0, 300).map((d) => (
                <tr key={d.property_key} className="transition-colors hover:bg-page">
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-3">
                      {d.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={d.photo} alt="" className="h-10 w-14 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <span className="h-10 w-14 shrink-0 rounded-lg border border-line/70 bg-page" />
                      )}
                      <span className="min-w-0">
                        <span className="hand block truncate text-[13px]">{d.address || d.postcode}</span>
                        <span className="block text-[11px] text-muted">{d.postcode}{d.beds != null ? ` · ${d.beds} bed` : ""}</span>
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5">{d.agent}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full border px-2 py-0.5 text-[10.5px] ${d.state === "tenanted" ? "border-accent-dark/60 bg-accent-soft text-accent-dark" : "border-line/70 text-muted"}`}>{STATE_LABEL[d.state]}</span>
                  </td>
                  <td className="figures px-4 py-2.5">{d.rent != null ? `£${d.rent.toLocaleString("en-GB")} pcm` : "-"}</td>
                  <td className="px-4 py-2.5 text-muted">{d.next_anniversary ? `${when(d.next_anniversary)}${d.tenancy_basis === "estimated" ? " (est.)" : ""}` : "-"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button type="button" onClick={() => lookUp(`${(d.address || "").split(",")[0]} ${d.postcode}`.trim())} className="rounded-full border border-line/80 px-3 py-1 text-[11px] text-muted hover:text-ink">Look up</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-line/70 px-4 py-2.5 text-[11px] text-muted">{shown.length.toLocaleString("en-GB")} properties{shown.length > 300 ? ", first 300 shown" : ""}</p>
        </div>
      )}
    </div>
  );
}


/** A condition score out of 100 as a short bar, or a dash when no door has a certificate. */
function ConditionMark({ score, doors }: { score: number | null; doors: number }) {
  if (score == null) return <span className="text-[11px] text-muted">-</span>;
  const colour = score >= 70 ? "#2e7d4f" : score >= 45 ? "#d9b46a" : "#b5453c";
  return (
    <span className="flex items-center gap-2" title={`${doors} door${doors === 1 ? "" : "s"} with a certificate`}>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-line/40"><span className="block h-full rounded-full" style={{ width: `${score}%`, background: colour }} /></span>
      <span className="figures text-[12px]">{score}</span>
    </span>
  );
}


interface StepRow { id: number; campaign_id: number; title: string; offset_days: number; mail_type: "postcard" | "letter"; active: boolean; copy: string; sort: number }
interface CampaignRow { id: number; key: string; name: string; trigger: string; active: boolean; fallback_to_property: boolean; steps: StepRow[]; stats: { queued: number; held: number; sent: number; due_7: number } }
interface SendRow { id: number; campaign_name: string; step_title: string; mail_type: string; property_key: string; address: string; to_name: string | null; to_address: string | null; due_on: string; status: "queued" | "held" | "sent" | "skipped" | "cancelled"; reason: string | null }

const TRIGGER_WORDS: Record<string, string> = { anniversary: "the tenancy anniversary", just_bought: "the day we first see the purchase", self_managing: "the day we first see the private listing" };

function offsetWords(d: number): string {
  if (d === 0) return "on the day";
  const w = Math.abs(d) % 7 === 0 ? `${Math.abs(d) / 7} week${Math.abs(d) === 7 ? "" : "s"}` : `${Math.abs(d)} days`;
  return d < 0 ? `${w} before` : `${w} after`;
}

/**
 * Campaigns: the sequences, each step a card or a letter at an offset from
 * the moment, switched on or off, with its copy. Spectre's "1 Year Renewal:
 * 12 weeks before, postcard, active" - ours, with the queue counts alongside
 * and "Build today's queue" for an impatient morning.
 */
function Campaigns() {
  const [rows, setRows] = useState<CampaignRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<StepRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/bond/campaigns", { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (j.ok) setRows(j.campaigns); else setError(j.reason ?? "Could not read the campaigns."); })
      .catch(() => setError("Could not read the campaigns."));
  }, []);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch("/api/bond/campaigns", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok || !j.ok) { setNote(j.error ?? "That did not save."); return false; }
      setRows(j.campaigns);
      return true;
    } catch {
      setNote("That did not save.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function buildQueue() {
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch("/api/bond/campaigns", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ queue: true }) });
      const j = await r.json();
      if (j.ok) { setRows(j.campaigns); setNote(`Queue built: ${j.queued} queued, ${j.held} held.`); }
      else setNote(j.error ?? "Could not build the queue.");
    } catch {
      setNote("Could not build the queue.");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="text-[12.5px] text-muted">{error}</p>;
  if (!rows) return <p className="flex items-center gap-3 py-10 text-[12.5px] text-muted"><span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />Reading the campaigns...</p>;

  return (
    <div className="fade-up mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-muted">A campaign is a sequence of cards and letters around a moment. The queue is built every morning; nothing prints until the print house is connected.</p>
        <PressButton onClick={() => void buildQueue()} disabled={busy} className="rounded-full border border-ink/80 px-4 py-2 text-[12px] font-semibold disabled:opacity-40">Build today's queue</PressButton>
      </div>
      {note && <p className="text-[12px] text-accent-dark">{note}</p>}
      {rows.map((c) => (
        <section key={c.id} className="rounded-2xl border border-line/80 bg-panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="hand text-[18px]">{c.name}</h2>
              <p className="text-[11.5px] text-muted">Counted from {TRIGGER_WORDS[c.trigger] ?? c.trigger} · {c.stats.queued} queued, {c.stats.held} held, {c.stats.sent} sent{c.stats.due_7 ? ` · ${c.stats.due_7} due this week` : ""}</p>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-[11.5px] text-muted">
                <input type="checkbox" checked={c.fallback_to_property} onChange={(e) => void patch({ campaign: c.id, fallback_to_property: e.target.checked })} />
                Post to the property when there is no owner address
              </label>
              <Toggle on={c.active} onChange={(v) => void patch({ campaign: c.id, active: v })} label={c.active ? "Active" : "Paused"} />
            </div>
          </div>
          <table className="mt-4 w-full text-left text-[12.5px]">
            <thead className="text-[10.5px] uppercase tracking-wider text-muted">
              <tr className="border-b border-line/70"><th className="py-2 pr-3 w-12"></th><th className="py-2 pr-3">Step</th><th className="py-2 pr-3">When</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Mail type</th><th className="py-2"></th></tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {c.steps.map((st) => (
                <tr key={st.id}>
                  <td className="py-3 pr-3"><Toggle on={st.active} onChange={(v) => void patch({ step: st.id, active: v })} /></td>
                  <td className="py-3 pr-3">{st.title}</td>
                  <td className="py-3 pr-3 text-muted">{offsetWords(st.offset_days)}</td>
                  <td className="py-3 pr-3">
                    {st.copy.trim() ? (
                      <span className={`rounded-full border px-2 py-0.5 text-[10.5px] ${st.active ? "border-accent-dark/60 bg-accent-soft text-accent-dark" : "border-line/70 text-muted"}`}>{st.active ? "Active" : "Off"}</span>
                    ) : (
                      <span className="rounded-full border border-red-700/40 bg-red-50 px-2 py-0.5 text-[10.5px] text-red-700">No content</span>
                    )}
                  </td>
                  <td className="py-3 pr-3 capitalize text-muted">{st.mail_type}</td>
                  <td className="py-3 text-right"><button type="button" onClick={() => setEditing(st)} className="text-[12px] text-accent-dark underline-offset-2 hover:underline">Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      {editing && (
        <StepEditor
          step={editing}
          onClose={() => setEditing(null)}
          onSave={async (fields) => { const ok = await patch({ step: editing.id, ...fields }); if (ok) setEditing(null); }}
        />
      )}
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex items-center gap-2" title={on ? "Switch off" : "Switch on"}>
      <span className={`relative inline-block h-5 w-9 rounded-full transition-colors ${on ? "bg-accent-dark" : "bg-line"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-page shadow transition-[left] ${on ? "left-[18px]" : "left-0.5"}`} />
      </span>
      {label && <span className="text-[12px]">{label}</span>}
    </button>
  );
}

function StepEditor({ step, onClose, onSave }: { step: StepRow; onClose: () => void; onSave: (fields: Record<string, unknown>) => Promise<void> }) {
  const [title, setTitle] = useState(step.title);
  const [offset, setOffset] = useState(String(step.offset_days));
  const [mailType, setMailType] = useState<"postcard" | "letter">(step.mail_type);
  const [copy, setCopy] = useState(step.copy);
  const [saving, setSaving] = useState(false);
  const preview = copy
    .replace(/\{address\}/g, "12 Example Road, Northampton")
    .replace(/\{postcode\}/g, "NN1 1AA")
    .replace(/\{agent\}/g, "Your Move")
    .replace(/\{anniversary\}/g, "14 November")
    .replace(/\{landlord\}/g, "Mr Example")
    .replace(/\{since\}/g, "last November")
    .replace(/\{phone\}/g, "01604 000000");
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-ink/35 p-4">
      <div className="fade-up max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-line/80 bg-page p-6 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.45)]">
        <h2 className="hand text-[22px]">{step.title}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="block text-[12px]"><span className="text-[11px] text-muted">Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded-xl border border-line/80 bg-transparent px-3 py-2 text-[12.5px] outline-none focus:border-ink" /></label>
          <label className="block text-[12px]"><span className="text-[11px] text-muted">Days from the moment (minus is before)</span>
            <input value={offset} onChange={(e) => setOffset(e.target.value)} inputMode="numeric" className="mt-1 w-full rounded-xl border border-line/80 bg-transparent px-3 py-2 text-[12.5px] outline-none focus:border-ink" /></label>
          <label className="block text-[12px]"><span className="text-[11px] text-muted">Mail type</span>
            <select value={mailType} onChange={(e) => setMailType(e.target.value as "postcard" | "letter")} className="mt-1 w-full rounded-xl border border-line/80 bg-transparent px-3 py-2 text-[12.5px] outline-none focus:border-ink">
              <option value="postcard">Postcard</option><option value="letter">Letter</option>
            </select></label>
        </div>
        <label className="mt-3 block text-[12px]"><span className="text-[11px] text-muted">Copy · fields: {"{address} {postcode} {agent} {anniversary} {landlord} {since} {phone}"}</span>
          <textarea value={copy} onChange={(e) => setCopy(e.target.value)} rows={8} className="mt-1 w-full resize-y rounded-xl border border-line/80 bg-transparent px-3 py-2 text-[12.5px] outline-none focus:border-ink" /></label>
        <div className="mt-3 rounded-xl border border-dashed border-line/80 p-3">
          <p className="text-[10.5px] uppercase tracking-wider text-muted">Preview</p>
          <p className="mt-1 whitespace-pre-wrap text-[12.5px]">{preview || "Nothing written yet."}</p>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <button type="button" disabled={saving} onClick={async () => { setSaving(true); await onSave({ title, offset_days: Number(offset), mail_type: mailType, copy }); setSaving(false); }} className="press-wobble rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page disabled:opacity-40">
            {saving ? "Saving..." : "Save"}
          </button>
          <button type="button" onClick={onClose} className="rounded-full border border-line/80 px-4 py-2.5 text-[12.5px] text-muted">Cancel</button>
        </div>
      </div>
    </div>
  );
}
