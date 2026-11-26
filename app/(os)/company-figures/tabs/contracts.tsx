"use client";

// My Business > Contracts (James, 26 Nov 2026): "a contract section of which
// she can edit the contracts for England and Scotland ... a LLM on the right
// and the contract on the left ... she has to click a little tick to confirm
// she is happy with the changes and when saved will automatically update the
// contract for the agents."
//
// The contract on the left is the Terms of Business agents send. Every change,
// the assistant's or one typed straight in, is drawn against the published
// wording and needs a tick before Save unlocks. A save makes a new version for
// agents' next sends; one already sent or signed keeps its wording. The rules
// (what is locked, no fee figures) are lib/terms/edit and are enforced by the
// server, not this screen.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SeedData } from "@/lib/business/seed-data"; // type-only - erased at build
import type { DeskState } from "@/lib/terms/contract-desk"; // type-only
import { clean, isWords, LOCKED_SAYS, wordsOf, type Change, type EBlock, type ESection, type Op } from "@/lib/terms/edit";
import type { Country } from "@/lib/terms/types";
import { useNewLook } from "@/lib/use-new-look";

type Api = { ok: boolean; error?: string; state?: DeskState; admin?: boolean; editors?: string[]; reply?: string; problems?: string[]; saved?: string };

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const plural = (v: number, one: string, many: string) => `${v} ${v === 1 ? one : many}`;
const plain = (t: string) => t.replace(/<[^>]+>/g, "");

const BTN = "btn-press rounded-lg border border-line bg-card px-3 h-9 text-[13px] font-medium text-ink transition hover:border-ink disabled:opacity-40";
const BTN_DARK = "btn-press rounded-lg bg-ink px-3.5 h-9 text-[13px] font-semibold text-white transition disabled:opacity-40";
const LINK = "text-[12px] text-muted underline underline-offset-2 hover:text-ink disabled:opacity-40";

/* ------------------------------- icons ------------------------------- */

const Icon = ({ d, size = 14 }: { d: string; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);
const I = {
  tick: "M5 12.5l4.5 4.5L19 7.5",
  lock: "M7 11V8a5 5 0 0110 0v3M6 11h12v9H6z",
  pencil: "M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4",
  back: "M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3",
  send: "M4 12l16-8-6 16-3-7-7-1z",
};

/* ------------------------------- word-level difference ------------------------------- */

type Part = { t: string; k: "same" | "out" | "in" };

/** The old and new wording as one run of words: what stayed, what went, what came in. */
function wordDiff(before: string, after: string): Part[] {
  const a = plain(before).split(/(\s+)/).filter(Boolean);
  const b = plain(after).split(/(\s+)/).filter(Boolean);
  if (a.length * b.length > 2_500_000) return [{ t: plain(before), k: "out" }, { t: " ", k: "same" }, { t: plain(after), k: "in" }];
  const w = b.length + 1;
  const m = new Uint16Array((a.length + 1) * w);
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) m[i * w + j] = a[i] === b[j] ? m[(i + 1) * w + j + 1] + 1 : Math.max(m[(i + 1) * w + j], m[i * w + j + 1]);
  const out: Part[] = [];
  const push = (t: string, k: Part["k"]) => {
    const last = out[out.length - 1];
    if (last && last.k === k) last.t += t;
    else out.push({ t, k });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) push(a[i++], (j++, "same"));
    else if (m[(i + 1) * w + j] >= m[i * w + j + 1]) push(a[i++], "out");
    else push(b[j++], "in");
  }
  while (i < a.length) push(a[i++], "out");
  while (j < b.length) push(b[j++], "in");
  return out;
}

function Diff({ before, after, inline }: { before: string; after: string; inline?: boolean }) {
  const parts = useMemo(() => wordDiff(before, after), [before, after]);
  const Tag = inline ? "span" : "p";
  return (
    <Tag className={inline ? "whitespace-pre-wrap" : "whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink"}>
      {parts.map((p, i) =>
        p.k === "same" ? (
          <span key={i}>{p.t}</span>
        ) : p.k === "out" ? (
          <del key={i} className="bg-red-50 text-red-800 decoration-red-400">
            {p.t}
          </del>
        ) : (
          <ins key={i} className="bg-emerald-50 text-emerald-900 no-underline" style={{ boxShadow: "inset 0 -2px 0 rgb(52 211 153)" }}>
            {p.t}
          </ins>
        )
      )}
    </Tag>
  );
}

/* ------------------------------- one block of the contract ------------------------------- */

function Words({ b }: { b: EBlock }) {
  if (b.kind === "list") {
    return (
      <ul className="list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-ink">
        {b.items.map((it, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: clean(it) }} />
        ))}
      </ul>
    );
  }
  if (b.kind === "h") return <h4 className="pt-1 text-[13.5px] font-semibold text-ink" dangerouslySetInnerHTML={{ __html: clean(b.text) }} />;
  if (b.kind === "p" || b.kind === "waiver") return <p className="text-[13.5px] leading-relaxed text-ink" dangerouslySetInnerHTML={{ __html: clean(b.text) }} />;
  return null;
}

function Check({ change, ticked, busy, onTick, onBack }: { change: Change; ticked: boolean; busy: boolean; onTick: (on: boolean) => void; onBack: () => void }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
      <button
        type="button"
        aria-pressed={ticked}
        disabled={busy}
        onClick={() => onTick(!ticked)}
        className={`btn-press inline-flex h-8 items-center gap-2 border px-2.5 text-[12.5px] font-medium transition disabled:opacity-40 ${ticked ? "border-emerald-600 bg-emerald-600 text-white" : "border-ink bg-white text-ink hover:bg-ink hover:text-white"}`}
      >
        <span className={`flex h-4 w-4 items-center justify-center border ${ticked ? "border-white" : "border-current"}`}>{ticked ? <Icon d={I.tick} size={12} /> : null}</span>
        {ticked ? "Happy with this" : "Tick if you are happy with this"}
      </button>
      <button type="button" className={LINK} disabled={busy} onClick={onBack}>
        Put it back as it was
      </button>
      <span className="sr-only">{change.kind}</span>
    </div>
  );
}

/* ------------------------------- the screen ------------------------------- */

export default function ContractsTab(_: { month: string; seed?: SeedData | null }) {
  const on = useNewLook("contracts");
  const [country, setCountry] = useState<Country>("england");
  const [res, setRes] = useState<Api | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string; adding?: boolean } | null>(null);
  const [confirm, setConfirm] = useState<null | { kind: "save" } | { kind: "restore"; version: string; says: string } | { kind: "discard" }>(null);
  const [note, setNote] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [who, setWho] = useState("");
  /* On a phone there is no hover: the clause last tapped is the one that offers to be changed. */
  const [active, setActive] = useState<string | null>(null);
  const chatEnd = useRef<HTMLDivElement | null>(null);

  const take = useCallback((j: Api | null, status: number) => {
    if (j?.ok && j.state) {
      setRes(j);
      setError(null);
      return true;
    }
    setError(j?.error ?? `That did not work (${status}).`);
    return false;
  }, []);

  useEffect(() => {
    if (on !== true) return;
    let gone = false;
    setRes(null);
    setError(null);
    setEditing(null);
    setConfirm(null);
    fetch(`/api/business/contracts?country=${country}`, { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as Api | null;
        if (!gone) take(j, r.status);
      })
      .catch(() => !gone && setError("The contract could not be read."));
    return () => {
      gone = true;
    };
  }, [on, country, take]);

  const post = useCallback(
    async (action: string, body: Record<string, unknown> = {}): Promise<Api | null> => {
      setBusy(action);
      setFlash(null);
      try {
        const r = await fetch("/api/business/contracts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ country, action, ...body }) });
        const j = (await r.json().catch(() => null)) as Api | null;
        return take(j, r.status) ? j : null;
      } catch {
        setError("That did not reach the OS. Try again.");
        return null;
      } finally {
        setBusy(null);
      }
    },
    [country, take]
  );

  const state = res?.state ?? null;
  const chatLen = state?.chat.length ?? 0;
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "nearest" });
  }, [chatLen, busy]);

  /* The contract as drawn: the working copy, with what was taken out put back in its place, struck through. */
  const view = useMemo(() => {
    if (!state) return null;
    const byBlock = new Map<string, Change>();
    const bySection = new Map<string, Change[]>();
    for (const c of state.changes) {
      if (c.kind === "changed" || c.kind === "added" || c.kind === "removed") byBlock.set(c.blockId, c);
      else bySection.set(c.sectionId, [...(bySection.get(c.sectionId) ?? []), c]);
    }
    const baseById = new Map(state.base.map((s) => [s.id, s]));
    const rows: { s: ESection; gone: boolean; blocks: { b: EBlock; gone: boolean }[] }[] = [];
    const place = <T extends { id: string }>(order: T[], present: T[], missing: T[]): { x: T; gone: boolean }[] => {
      const out = present.map((x) => ({ x, gone: false }));
      for (const m of missing) {
        const idx = order.findIndex((o) => o.id === m.id);
        let at = 0;
        for (let k = idx - 1; k >= 0; k--) {
          const j = out.findIndex((o) => o.x.id === order[k].id);
          if (j >= 0) {
            at = j + 1;
            break;
          }
        }
        out.splice(at, 0, { x: m, gone: true });
      }
      return out;
    };
    const liveIds = new Set(state.sections.map((s) => s.id));
    for (const { x: s, gone } of place(state.base, state.sections, state.base.filter((b) => !liveIds.has(b.id)))) {
      const was = baseById.get(s.id);
      const have = new Set(s.blocks.map((b) => b.id));
      const blocks = gone || !was ? s.blocks.map((b) => ({ x: b, gone })) : place(was.blocks, s.blocks, was.blocks.filter((b) => !have.has(b.id)));
      rows.push({ s, gone, blocks: blocks.map(({ x, gone: g }) => ({ b: x, gone: g })) });
    }
    return { rows, byBlock, bySection, baseById };
  }, [state]);

  if (on === null) return <Busy>Opening Contracts.</Busy>;
  if (on === false) return <div className="card p-5 text-[13px] text-muted">Contracts is not switched on for you yet.</div>;
  if (error && !state) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">
        <span className="font-semibold">The contract couldn&rsquo;t be opened.</span> {error}
      </div>
    );
  }
  if (!state || !view) return <Busy>Reading the Terms of Business.</Busy>;

  const ticked = new Set(state.ticks);
  const waiting = state.changes.filter((c) => !ticked.has(c.key));
  const canSave = state.changes.length > 0 && waiting.length === 0 && !state.stale;
  const working = busy !== null;
  const place = country === "scotland" ? "Scotland" : "England";

  const ask = async () => {
    const text = message.trim();
    if (!text || working) return;
    setMessage("");
    const j = await post("ask", { message: text });
    if (!j) setMessage(text);
  };
  const saveEdit = async () => {
    if (!editing) return;
    const lines = editing.text.split("\n").map((l) => l.trim()).filter(Boolean);
    const target = state.sections.flatMap((s) => s.blocks).find((b) => b.id === editing.id);
    const op: Op = editing.adding
      ? { op: "insert_after", id: editing.id, kind: lines.length > 1 ? "list" : "p", text: lines.join(" "), items: lines }
      : target?.kind === "list"
        ? { op: "replace", id: editing.id, items: lines }
        : { op: "replace", id: editing.id, text: lines.join(" ") };
    const j = await post("edit", { ops: [op] });
    if (j) {
      setEditing(null);
      if (j.problems?.length) setFlash(j.problems.join(" "));
    }
  };
  const jump = () => {
    const first = waiting[0];
    if (!first) return;
    const id = "blockId" in first ? first.blockId : first.sectionId;
    document.getElementById(`ct-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="space-y-5">
      {/* ------------------------------ which contract, and where it stands ------------------------------ */}
      <section className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div role="radiogroup" aria-label="Which contract" className="inline-flex border border-line">
            {(["england", "scotland"] as Country[]).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={country === c}
                disabled={working}
                onClick={() => setCountry(c)}
                className={`h-9 px-4 text-[13px] font-medium transition ${country === c ? "bg-ink text-white" : "bg-white text-ink hover:bg-line/40"}`}
              >
                {c === "england" ? "England" : "Scotland"}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted">
            {state.title} · {state.subtitle} · {state.editionLabel}. This is the wording agents send for {place} today. Ask the assistant for a change, or click a clause to change it yourself.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[12.5px] text-muted" aria-live="polite">
            {state.changes.length ? `${plural(state.changes.length, "change", "changes")} · ${state.changes.length - waiting.length} ticked` : "No changes yet"}
          </span>
          {waiting.length ? (
            <button type="button" className={BTN} onClick={jump}>
              Next to Check
            </button>
          ) : null}
          {state.changes.length || state.chat.length || state.stale ? (
            <button type="button" className={BTN} disabled={working} onClick={() => setConfirm({ kind: "discard" })}>
              Discard
            </button>
          ) : null}
          <button type="button" className={BTN_DARK} disabled={!canSave || working} onClick={() => setConfirm({ kind: "save" })} title={canSave ? undefined : "Every change needs your tick first"}>
            Save for Agents
          </button>
        </div>
      </section>

      {state.stale ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          This contract was saved by someone else after your working copy was started{state.draftBy ? ` (by ${state.draftBy})` : ""}. Discard the working copy to carry on from the new wording.
        </div>
      ) : null}
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">{error}</div> : null}
      {flash ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">{flash}</div> : null}

      {confirm ? (
        <div className="card space-y-3 border-ink p-5" role="alertdialog" aria-label="Confirm">
          {confirm.kind === "save" ? (
            <>
              <h3 className="text-[15px] text-ink">Save This Wording for Agents?</h3>
              <p className="max-w-[70ch] text-[13px] text-muted">
                From now on, every Terms of Business an agent sends for {place} uses this wording ({plural(state.changes.length, "change", "changes")}, all ticked). Contracts already sent or signed keep the wording they went out on.
              </p>
              <label className="block text-[11px] text-muted">
                A note for the history (optional)
                <input className="mt-1 block h-9 w-full max-w-[520px] rounded-none border border-line bg-white px-2 text-[13px] text-ink" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
              </label>
            </>
          ) : confirm.kind === "restore" ? (
            <>
              <h3 className="text-[15px] text-ink">Go Back to This Version?</h3>
              <p className="max-w-[70ch] text-[13px] text-muted">
                {confirm.says} becomes the wording agents send for {place} from now on, and your working copy is cleared. Contracts already sent or signed are not touched.
              </p>
            </>
          ) : (
            <>
              <h3 className="text-[15px] text-ink">Discard Your Working Copy?</h3>
              <p className="max-w-[70ch] text-[13px] text-muted">Every change that has not been saved, and the conversation with the assistant, are cleared. The contract agents send does not change.</p>
            </>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={BTN_DARK}
              disabled={working}
              onClick={async () => {
                const c = confirm;
                const j = c.kind === "save" ? await post("save", { note }) : c.kind === "restore" ? await post("restore", { version: c.version }) : await post("discard");
                if (j) {
                  setConfirm(null);
                  setNote("");
                  if (c.kind !== "discard") setFlash(`Saved. Agents' next sends for ${place} use this wording.`);
                }
              }}
            >
              {confirm.kind === "save" ? "Yes, Save for Agents" : confirm.kind === "restore" ? "Yes, Go Back" : "Yes, Discard"}
            </button>
            <button type="button" className={BTN} disabled={working} onClick={() => setConfirm(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* ------------------------------ the assistant (first on a phone) ------------------------------ */}
        <aside className="card order-first flex max-h-[70vh] flex-col lg:sticky lg:top-4 lg:order-last lg:max-h-[calc(100vh-9rem)]" aria-label="Assistant">
          <div className="border-b border-line px-4 py-3">
            <h3 className="text-[15px] text-ink">Assistant</h3>
            <p className="mt-0.5 text-[11px] text-muted">Say what you want changed. It drafts the wording; nothing changes until you tick it and save. It is not legal advice.</p>
          </div>
          <div className="min-h-[120px] flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {state.chat.length === 0 ? (
              <div className="space-y-2 text-[12.5px] text-muted">
                <p>For example:</p>
                {["Make the notice period clause clearer, without changing what it means.", "Add a clause saying we may contact the landlord by WhatsApp as well as email.", "Where does the contract talk about ending the agreement?"].map((eg) => (
                  <button key={eg} type="button" className="block w-full border border-line bg-white px-3 py-2 text-left text-[12.5px] text-ink transition hover:border-ink" onClick={() => setMessage(eg)}>
                    {eg}
                  </button>
                ))}
              </div>
            ) : (
              state.chat.map((c, i) => (
                <div key={i} className={c.who === "you" ? "ml-6" : "mr-6"}>
                  <div className="text-[10.5px] uppercase tracking-wide text-muted">{c.who === "you" ? "You" : "Assistant"}</div>
                  <div className={`mt-1 whitespace-pre-wrap px-3 py-2 text-[13px] leading-relaxed ${c.who === "you" ? "bg-ink text-white" : "border border-line bg-white text-ink"}`}>{c.text}</div>
                </div>
              ))
            )}
            {busy === "ask" ? (
              <div className="flex items-center gap-2 text-[12.5px] text-muted" aria-busy="true">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-transparent" aria-hidden />
                Reading the contract and drafting.
              </div>
            ) : null}
            <div ref={chatEnd} />
          </div>
          <form
            className="border-t border-line p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void ask();
            }}
          >
            <label className="sr-only" htmlFor="ct-ask">
              What would you like changed?
            </label>
            <textarea
              id="ct-ask"
              rows={3}
              value={message}
              maxLength={4000}
              disabled={working || state.stale}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void ask();
                }
              }}
              placeholder="What would you like changed?"
              className="block w-full resize-none rounded-none border border-line bg-white px-3 py-2 text-[13px] text-ink"
            />
            <div className="mt-2 flex justify-end">
              <button type="submit" className={`${BTN_DARK} inline-flex items-center gap-2`} disabled={working || state.stale || !message.trim()}>
                <Icon d={I.send} /> Ask
              </button>
            </div>
          </form>
        </aside>

        {/* ------------------------------ the contract ------------------------------ */}
        <article className="card min-w-0 px-5 py-6 sm:px-8" aria-label="The contract">
          <header className="border-b border-line pb-4">
            <h2 className="text-[17px] text-ink">{state.title}</h2>
            <p className="mt-1 text-[12px] text-muted">
              {state.subtitle} · {state.editionLabel}
            </p>
          </header>
          {view.rows.map(({ s, gone, blocks }) => {
            const mine = view.bySection.get(s.id) ?? [];
            const titled = mine.find((c) => c.kind === "title");
            const whole = mine.find((c) => c.kind === "section-added" || c.kind === "section-removed");
            return (
              <section key={s.id} id={`ct-${s.id}`} className={`border-b border-line py-5 last:border-b-0 ${whole ? (gone ? "bg-red-50/60" : "bg-emerald-50/50") : ""} ${whole ? "-mx-3 px-3" : ""}`}>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <h3 className={`text-[15px] text-ink ${gone ? "line-through decoration-red-400" : ""}`}>
                    {s.n ? `${s.n}. ` : ""}
                    {titled && titled.kind === "title" ? <Diff before={titled.before} after={titled.after} inline /> : s.title}
                  </h3>
                  {whole ? <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{gone ? "Section removed" : "New section"}</span> : null}
                </div>
                {titled ? <Check change={titled} ticked={ticked.has(titled.key)} busy={working} onTick={(v) => void post("tick", { key: titled.key, on: v })} onBack={() => void post("revert", { key: titled.key })} /> : null}
                <div className="mt-3 space-y-3">
                  {blocks.map(({ b, gone: out }) => {
                    const c = view.byBlock.get(b.id);
                    const locked = !isWords(b);
                    const open = editing?.id === b.id;
                    if (locked) {
                      return (
                        <div key={b.id} className="flex items-center gap-2 border border-dashed border-line px-3 py-2 text-[12px] text-muted">
                          <Icon d={I.lock} /> {LOCKED_SAYS[b.kind] ?? "A fixed part of the contract"} · locked
                        </div>
                      );
                    }
                    return (
                      <div key={b.id} id={`ct-${b.id}`} onClick={() => setActive(b.id)} className={`group relative ${c ? `border-l-2 pl-3 ${c.kind === "removed" ? "border-red-400" : "border-emerald-500"}` : ""}`}>
                        {c ? (
                          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{c.kind === "changed" ? "Changed" : c.kind === "added" ? "New clause" : "Removed"}</div>
                        ) : null}
                        {open && !editing.adding ? null : c?.kind === "changed" ? (
                          <Diff before={c.before} after={c.after} />
                        ) : out || c?.kind === "removed" ? (
                          <del className="block whitespace-pre-wrap bg-red-50 text-[13.5px] leading-relaxed text-red-800 decoration-red-400">{plain(wordsOf(b))}</del>
                        ) : c?.kind === "added" ? (
                          <div className="bg-emerald-50 px-1">
                            <Words b={b} />
                          </div>
                        ) : (
                          <Words b={b} />
                        )}
                        {open ? (
                          <div className="mt-2 space-y-2">
                            <label className="block text-[11px] text-muted">
                              {editing.adding ? "The new clause (one line each for a list)" : b.kind === "list" ? "One line for each point" : "The wording"}
                              <textarea
                                autoFocus
                                rows={Math.min(14, Math.max(3, Math.ceil(editing.text.length / 90) + editing.text.split("\n").length))}
                                value={editing.text}
                                onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                                className="mt-1 block w-full rounded-none border border-ink bg-white px-3 py-2 text-[13px] leading-relaxed text-ink"
                              />
                            </label>
                            <div className="flex flex-wrap items-center gap-3">
                              <button type="button" className={BTN_DARK} disabled={working || !editing.text.trim()} onClick={() => void saveEdit()}>
                                {editing.adding ? "Add the Clause" : "Keep the Change"}
                              </button>
                              <button type="button" className={BTN} disabled={working} onClick={() => setEditing(null)}>
                                Cancel
                              </button>
                              {!editing.adding ? (
                                <button
                                  type="button"
                                  className={LINK}
                                  disabled={working}
                                  onClick={async () => {
                                    const j = await post("edit", { ops: [{ op: "remove", id: b.id }] });
                                    if (j) {
                                      setEditing(null);
                                      if (j.problems?.length) setFlash(j.problems.join(" "));
                                    }
                                  }}
                                >
                                  Take this clause out
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                        {c ? <Check change={c} ticked={ticked.has(c.key)} busy={working} onTick={(v) => void post("tick", { key: c.key, on: v })} onBack={() => void post("revert", { key: c.key })} /> : null}
                        {!open && !out && c?.kind !== "removed" && !state.stale ? (
                          <div className={`mt-1 gap-4 transition sm:flex sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 ${active === b.id ? "flex opacity-100" : "hidden sm:opacity-0"}`}>
                            <button type="button" className={`${LINK} inline-flex items-center gap-1`} disabled={working} onClick={() => setEditing({ id: b.id, text: b.kind === "list" ? b.items.join("\n") : wordsOf(b) })}>
                              <Icon d={I.pencil} size={12} /> Change this
                            </button>
                            <button type="button" className={LINK} disabled={working} onClick={() => setEditing({ id: b.id, text: "", adding: true })}>
                              Add a clause after
                            </button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                {whole ? <Check change={whole} ticked={ticked.has(whole.key)} busy={working} onTick={(v) => void post("tick", { key: whole.key, on: v })} onBack={() => void post("revert", { key: whole.key })} /> : null}
              </section>
            );
          })}
        </article>
      </div>

      {/* ------------------------------ history ------------------------------ */}
      <section className="space-y-3">
        <h2 className="text-[15px] text-ink">Saved Versions</h2>
        <div className="card divide-y divide-line">
          {state.history.map((h, i) => (
            <div key={h.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 text-[12.5px]">
              <div className="min-w-0">
                <div className="text-ink">
                  {stamp(h.at)}
                  {i === 0 ? <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">What agents send now</span> : null}
                </div>
                <div className="text-[11px] text-muted">
                  Saved by {h.by || "someone"} · {h.changes.length ? plural(h.changes.length, "change", "changes") : h.note || "No changes recorded"}
                  {h.changes.length && h.note ? ` · ${h.note}` : ""}
                </div>
              </div>
              {i > 0 ? (
                <button type="button" className={BTN} disabled={working} onClick={() => setConfirm({ kind: "restore", version: h.id, says: `The wording saved on ${stamp(h.at)}` })}>
                  Go Back to This Version
                </button>
              ) : null}
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 text-[12.5px]">
            <div>
              <div className="text-ink">
                The original wording
                {state.history.length === 0 ? <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">What agents send now</span> : null}
              </div>
              <div className="text-[11px] text-muted">As it was before anything was changed here.</div>
            </div>
            {state.history.length ? (
              <button type="button" className={BTN} disabled={working} onClick={() => setConfirm({ kind: "restore", version: "original", says: "The original wording" })}>
                Go Back to This Version
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {/* ------------------------------ who can edit (admins) ------------------------------ */}
      {res?.admin ? (
        <section className="space-y-3">
          <h2 className="text-[15px] text-ink">Who Can Change the Contracts</h2>
          <div className="card space-y-3 p-4 text-[12.5px]">
            <p className="text-muted">Admins always can. Anyone else has to be named here, and needs the Contracts switch on for them.</p>
            {(res.editors ?? []).length ? (
              <ul className="space-y-1">
                {(res.editors ?? []).map((e) => (
                  <li key={e} className="flex items-center justify-between gap-3">
                    <span className="truncate text-ink">{e}</span>
                    <button type="button" className={LINK} disabled={working} onClick={() => void post("editors", { emails: (res.editors ?? []).filter((x) => x !== e) })}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink">Nobody else is named yet.</p>
            )}
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const j = await post("editors", { emails: [...(res.editors ?? []), who] });
                if (j) setWho("");
              }}
            >
              <label className="block text-[11px] text-muted">
                Their OS sign-in email
                <input type="email" required value={who} onChange={(e) => setWho(e.target.value)} className="mt-1 block h-9 w-[280px] max-w-full rounded-none border border-line bg-white px-2 text-[13px] text-ink" />
              </label>
              <button type="submit" className={BTN} disabled={working || !who.trim()}>
                Add
              </button>
            </form>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Busy({ children }: { children: React.ReactNode }) {
  return (
    <div className="card flex items-center gap-3 p-5 text-[13px] text-muted" aria-busy="true">
      <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-line border-t-transparent" aria-hidden />
      <span>{children}</span>
    </div>
  );
}
