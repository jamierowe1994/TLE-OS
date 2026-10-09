"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorLine, Sheet, Spinner } from "../../bits";
import { ChatHead, Face } from "../bits";
import { searchMatches } from "@/lib/search-match";

/**
 * FIND YOUR LOCAL AGENTS (James, 3 Oct 2026): the team, nearest first by the
 * patch each of them set, so you can pull the agents round you into a huddle.
 *
 *   /agent/chats/team              everyone; tick people, Start a Huddle
 *   /agent/chats/team?start=1      straight into picking
 *   /agent/chats/team?invite=<id>  add people to a huddle you are in
 *
 * Your own patch sits at the top; with none set, the list is by name and the
 * card asks you to set one. Only a town is ever shown for anyone.
 */

type Person = { id: string; name: string; photo: string | null; town: string | null; miles: number | null };

export default function FindLocalAgents() {
  const router = useRouter();
  const [patch, setPatch] = useState<{ town: string; area: string } | null>(null);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [invite, setInvite] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [naming, setNaming] = useState(false);
  const [editPatch, setEditPatch] = useState(false);
  const [needle, setNeedle] = useState("");

  const load = () =>
    fetch("/api/m/team", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; error?: string; patch?: { town: string; area: string } | null; people?: Person[] }) => {
        if (!j.ok) throw new Error(j.error ?? "The team did not load.");
        setPatch(j.patch ?? null);
        setPeople(j.people ?? []);
      })
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    void load();
    const sp = new URLSearchParams(window.location.search);
    const inv = sp.get("invite");
    if (inv) {
      setInvite(inv);
      setPicking(true);
    } else if (sp.get("start")) setPicking(true);
    if (sp.get("patch")) setEditPatch(true);
  }, []);

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const addToHuddle = async () => {
    const r = (await fetch(`/api/m/rooms/${encodeURIComponent(invite!)}/members`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userIds: [...picked] }) })
      .then((x) => x.json())
      .catch(() => ({ ok: false }))) as { ok?: boolean };
    if (r.ok) router.push(`/agent/chats/room/${encodeURIComponent(invite!)}`);
  };

  const n = needle.trim();
  const shown = (people ?? []).filter((p) => !n || searchMatches(n, p.name, p.town));
  const near = shown.filter((p) => p.miles != null);
  const rest = shown.filter((p) => p.miles == null);

  return (
    <main className="pb-24">
      <ChatHead back={invite ? `/agent/chats/room/${encodeURIComponent(invite)}` : "/agent/chats?half=play"} title={invite ? "Invite People" : "Find Your Local Agents"} line={picking ? "Tick the people you want" : undefined} />

      {/* My patch: where "near" is worked out from. */}
      <button type="button" onClick={() => setEditPatch(true)} className="m-press mt-1 flex w-full items-center gap-3 rounded-[22px] px-4 py-3.5 text-left" style={{ background: patch ? "var(--m-green-wash)" : "var(--m-pink-wash)" }}>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--m-card)", color: patch ? "var(--m-sage-ink)" : "var(--m-coral)" }}>
          <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 1 1 13 0c0 5.4-6.5 11-6.5 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-semibold uppercase tracking-[0.1em] text-muted">My Patch</span>
          <span className="block truncate text-[16px] font-semibold">{patch ? `${patch.town} · ${patch.area}` : "Set your patch to see who is near"}</span>
        </span>
        <span className="text-[13.5px] font-semibold" style={{ color: "var(--m-coral)" }}>
          {patch ? "Change" : "Set"}
        </span>
      </button>

      <label className="mt-3 flex h-[50px] items-center gap-3 rounded-full px-4" style={{ background: "var(--m-card)" }}>
        <svg viewBox="0 0 24 24" aria-hidden className="h-[18px] w-[18px] text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5 20 20" />
        </svg>
        <input value={needle} onChange={(e) => setNeedle(e.target.value)} type="search" placeholder="Name or town..." className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden" />
      </label>

      {error ? (
        <div className="mt-4">
          <ErrorLine text={error} />
        </div>
      ) : !people ? (
        <Spinner label="Finding the team" className="py-8" />
      ) : (
        <>
          {near.length > 0 && <Group title="Nearest You" people={near} picking={picking} picked={picked} toggle={toggle} />}
          {rest.length > 0 && <Group title={near.length ? "Everyone Else" : "The Team"} people={rest} picking={picking} picked={picked} toggle={toggle} />}
          {!shown.length && <p className="py-8 text-center text-[14px] text-muted">Nobody matches that.</p>}
        </>
      )}

      {/* The action at the foot. */}
      <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+70px)] z-30 px-4">
        <div className="mx-auto max-w-[560px]">
          {!picking ? (
            <button type="button" onClick={() => setPicking(true)} className="h-[54px] w-full rounded-full text-[16px] font-semibold text-white shadow-[0_14px_26px_-12px_rgba(0,0,0,0.6)]" style={{ background: "#141210" }}>
              Start a Huddle
            </button>
          ) : (
            <button
              type="button"
              disabled={!picked.size}
              onClick={() => (invite ? void addToHuddle() : setNaming(true))}
              className="h-[54px] w-full rounded-full text-[16px] font-semibold text-white shadow-[0_14px_26px_-12px_rgba(0,0,0,0.6)] disabled:opacity-40"
              style={{ background: "#141210" }}
            >
              {picked.size ? (invite ? `Add ${picked.size} to the Huddle` : `Start a Huddle with ${picked.size}`) : "Tick the people you want"}
            </button>
          )}
        </div>
      </div>

      {naming && <NameHuddle count={picked.size} onClose={() => setNaming(false)} onCreate={async (name) => {
        const r = (await fetch("/api/m/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, userIds: [...picked] }) })
          .then((x) => x.json())
          .catch(() => ({ ok: false, error: "No connection." }))) as { ok?: boolean; id?: string; error?: string };
        if (r.ok && r.id) router.push(`/agent/chats/room/${encodeURIComponent(r.id)}`);
        return r.ok ? null : r.error ?? "That did not work.";
      }} />}

      {editPatch && <PatchSheet patch={patch} onClose={() => setEditPatch(false)} onSaved={() => {
        setEditPatch(false);
        setPeople(null);
        void load();
      }} />}
    </main>
  );
}

function Group({ title, people, picking, picked, toggle }: { title: string; people: Person[]; picking: boolean; picked: Set<string>; toggle: (id: string) => void }) {
  return (
    <>
      <p className="m-eyebrow mb-2 mt-5 px-1">{title}</p>
      <ul className="m-group">
        {people.map((p) => {
          const on = picked.has(p.id);
          return (
            <li key={p.id} className="m-row">
              <button type="button" onClick={() => picking && toggle(p.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left" disabled={!picking}>
                <Face name={p.name} photo={p.photo} size={42} tone={p.miles != null ? "sage" : "pink"} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15.5px] font-medium">{p.name}</span>
                  <span className="block truncate text-[13px] text-muted">{p.town ? (p.miles != null ? `${p.town} · ${p.miles} mi` : p.town) : "No patch set"}</span>
                </span>
                {picking && (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2" style={on ? { background: "var(--m-coral)", borderColor: "var(--m-coral)", color: "#fff" } : { borderColor: "var(--m-line)" }}>
                    {on && (
                      <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12.5l4.5 4.5L19 7.5" />
                      </svg>
                    )}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function NameHuddle({ count, onClose, onCreate }: { count: number; onClose: () => void; onCreate: (name: string) => Promise<string | null> }) {
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Sheet label="Name the huddle" onClose={onClose}>
      <h2 className="m-title mb-1 px-1 text-[24px]">Name Your Huddle</h2>
      <p className="mb-3 px-1 text-[14px] text-muted">You and {count} {count === 1 ? "other" : "others"}. Something like &ldquo;Northampton Crew&rdquo;.</p>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Huddle name" className="h-[52px] w-full rounded-[16px] px-4 text-[16px] outline-none" style={{ background: "var(--m-card)" }} />
      {err && <p className="mt-2 px-1 text-[13.5px]" style={{ color: "var(--m-coral)" }}>{err}</p>}
      <button
        type="button"
        disabled={!name.trim() || busy}
        onClick={async () => {
          setBusy(true);
          setErr(await onCreate(name.trim()));
          setBusy(false);
        }}
        className="mt-4 h-[54px] w-full rounded-full text-[16px] font-semibold text-white disabled:opacity-40"
        style={{ background: "#141210" }}
      >
        {busy ? "Starting..." : "Start the Huddle"}
      </button>
    </Sheet>
  );
}

function PatchSheet({ patch, onClose, onSaved }: { patch: { town: string; area: string } | null; onClose: () => void; onSaved: () => void }) {
  const [town, setTown] = useState(patch?.town ?? "");
  const [area, setArea] = useState(patch?.area ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setErr(null);
    const r = (await fetch("/api/m/patch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ town, area }) })
      .then((x) => x.json())
      .catch(() => ({ ok: false, error: "No connection." }))) as { ok?: boolean; error?: string };
    setBusy(false);
    if (r.ok) onSaved();
    else setErr(r.error ?? "That did not save.");
  };
  return (
    <Sheet label="My patch" onClose={onClose}>
      <h2 className="m-title mb-1 px-1 text-[24px]">My Patch</h2>
      <p className="mb-4 px-1 text-[14px] text-muted">Where you work, so the agents near you can find you. Others only ever see the town.</p>
      <label className="block px-1 text-[13px] font-semibold text-muted">Town</label>
      <input value={town} onChange={(e) => setTown(e.target.value)} maxLength={40} placeholder="Northampton" className="mt-1 h-[52px] w-full rounded-[16px] px-4 text-[16px] outline-none" style={{ background: "var(--m-card)" }} />
      <label className="mt-3 block px-1 text-[13px] font-semibold text-muted">Postcode Area</label>
      <input value={area} onChange={(e) => setArea(e.target.value.toUpperCase())} maxLength={8} placeholder="NN1" autoCapitalize="characters" className="mt-1 h-[52px] w-full rounded-[16px] px-4 text-[16px] uppercase outline-none" style={{ background: "var(--m-card)" }} />
      {err && <p className="mt-2 px-1 text-[13.5px]" style={{ color: "var(--m-coral)" }}>{err}</p>}
      <button type="button" disabled={!town.trim() || !area.trim() || busy} onClick={save} className="mt-4 h-[54px] w-full rounded-full text-[16px] font-semibold text-white disabled:opacity-40" style={{ background: "#141210" }}>
        {busy ? "Saving..." : "Save My Patch"}
      </button>
    </Sheet>
  );
}
