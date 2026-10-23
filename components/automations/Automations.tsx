"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AutomationEditor, { StepIcon, type Pickers } from "@/components/automations/AutomationEditor";
import { actionDef, actionWords, blank, conditionWords, triggerDef, triggerWords, waitWords, type AutomationDef } from "@/lib/automations/catalogue";
import SteveFace from "@/components/SteveFace";
import { Badge } from "@/components/new-look/Parts";
import type { Automation, Run } from "@/lib/automations/store";

/**
 * SETTINGS > AUTOMATIONS (James, 22 Oct 2026: "allow the guys some custom
 * automations... linked up to some form of chatbot where they can just ask
 * the commands... it should look a bit like Zapier").
 *
 * Top to bottom: Ask Steve to build one; anything waiting for them to check;
 * their automations; the log of every run. Owners can look at everybody's and
 * switch any of them off.
 */

type Data = {
  me: { id: string; name: string; owner: boolean };
  automations: Automation[];
  runs: Run[];
  emails: Pickers["emails"];
  people: Pickers["people"];
  rooms: string[];
  switches: { automations: boolean; customerEmail: boolean };
};

type Editing = { id: string | null; def: AutomationDef; name: string; dailyCap?: number; askedFor?: string | null; enabled: boolean };
type Turn = { role: "user" | "assistant"; text: string; draft?: { def: AutomationDef; name: string; sentence: string; problems: string[]; cant: string[] } };

const EXAMPLES = [
  "When a new tenant enquiry comes in on my listings and they haven't booked a viewing in 2 days, email them my other homes nearby",
  "The day after a viewing, text them to ask how it went",
  "When someone finishes their passport, tell me in the bell and make me a task to ring them",
  "Every Monday at 9, make me a task to check my listings' photos",
];

const fmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Never";

function Toggle({ on, onChange, disabled, title }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; title?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)} title={title ?? (on ? "Switch off" : "Switch on")} className="disabled:opacity-40">
      <span className={`relative inline-block h-5 w-9 rounded-full transition-colors ${on ? "bg-accent-dark" : "bg-line"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] ${on ? "left-[18px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

function StatePill({ a }: { a: Automation }) {
  const [label, cls] = !a.enabled
    ? a.offBy ? [`Switched off by ${a.offBy}`, "bg-rose-50 text-rose-700"] : ["Off", "bg-page text-muted"]
    : a.state === "live" ? ["Live", "bg-emerald-50 text-emerald-700"] : ["Checking the first send", "bg-amber-50 text-amber-700"];
  return <span className={`rounded-full px-2 py-0.5 text-[10.5px] ${cls}`}>{label}</span>;
}

const RUN_TONE: Record<string, string> = {
  done: "bg-emerald-50 text-emerald-700",
  preview: "bg-amber-50 text-amber-700",
  waiting: "bg-page text-muted",
  working: "bg-page text-muted",
  held: "bg-amber-50 text-amber-700",
  skipped: "bg-page text-muted",
  cancelled: "bg-page text-muted",
  failed: "bg-rose-50 text-rose-700",
};
const RUN_WORD: Record<string, string> = { done: "Done", preview: "Waiting for you", waiting: "Waiting", working: "Working", held: "Held", skipped: "Skipped", cancelled: "Cancelled", failed: "Failed" };

export default function Automations({ look }: { look?: "new" } = {}) {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [ask, setAsk] = useState("");
  const [thinking, setThinking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  /* The new look's "Build one" card, shut until New automation. */
  const [building, setBuilding] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/automations${all ? "?all=1" : ""}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Automations could not be read.");
      setData(j);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Automations could not be read.");
    }
  }, [all]);
  useEffect(() => { void load(); }, [load]);

  /* ?preview=<run> from the bell: scroll to the waiting card. */
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("preview");
    if (id && data) document.getElementById(`preview-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [data]);

  async function send() {
    const text = ask.trim();
    if (!text || thinking) return;
    const next: Turn[] = [...turns, { role: "user", text }];
    setTurns(next);
    setAsk("");
    setThinking(true);
    try {
      const current = [...turns].reverse().find((t) => t.draft)?.draft?.def ?? null;
      const r = await fetch("/api/automations/build", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ turns: next.map(({ role, text: t }) => ({ role, text: t })), current }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Steve couldn't build that just now.");
      setTurns([...next, { role: "assistant", text: j.reply, draft: j.draft ? { def: j.draft, name: j.name, sentence: j.sentence, problems: j.problems, cant: j.cant } : undefined }]);
    } catch (e) {
      setTurns([...next, { role: "assistant", text: e instanceof Error ? e.message : "Steve couldn't build that just now." }]);
    } finally {
      setThinking(false);
    }
  }

  async function toggle(a: Automation, on: boolean) {
    setBusy(a.id);
    try {
      const r = await fetch(`/api/automations/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      if (editing?.id === a.id) setEditing({ ...editing, enabled: on });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "It could not be changed.");
    } finally {
      setBusy(null);
    }
  }

  async function answer(run: Run, sendIt: boolean) {
    setBusy(run.id);
    try {
      const r = await fetch("/api/automations/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId: run.id, send: sendIt }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "It couldn't be answered.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(a: Automation) {
    if (!window.confirm(`Delete "${a.name}"? Anything it is waiting to do is cancelled.`)) return;
    await fetch(`/api/automations/${a.id}`, { method: "DELETE" });
    setEditing(null);
    await load();
  }

  const pickers: Pickers = { emails: data?.emails ?? [], people: data?.people ?? [], rooms: data?.rooms ?? [] };
  const mine = (a: Automation) => a.userId === data?.me.id;
  const previews = (data?.runs ?? []).filter((r) => r.state === "preview" && r.userId === data?.me.id);

  if (editing) {
    const live = data?.automations.find((a) => a.id === editing.id);
    return (
      <div ref={topRef}>
        <AutomationEditor
          id={editing.id}
          initial={editing.def}
          name={editing.name}
          dailyCap={editing.dailyCap}
          askedFor={editing.askedFor}
          pickers={pickers}
          enabled={live?.enabled ?? false}
          onSaved={(id) => { setEditing((e) => (e ? { ...e, id } : e)); void load(); }}
          onToggle={editing.id ? async (on) => { const a = data?.automations.find((x) => x.id === editing.id); if (a) await toggle(a, on); } : undefined}
          onClose={() => { setEditing(null); void load(); }}
        />
      </div>
    );
  }

  /* ── THE NEW LOOK (lib/new-look "settings", 23 Oct 2026) ─────────────────
     Claude Design's Automations: one line each, read as a sentence, with
     Change and a switch; New automation opens Steve's "Build one" card in
     place. The same automations, saves, previews and run log as below. */
  if (look === "new") {
    const on = (data?.automations ?? []).filter((a) => a.enabled).length;
    const ranThisMonth = (data?.automations ?? []).reduce((n, a) => n + (a.runsThisMonth ?? 0), 0);
    const stateWord = (a: Automation) =>
      !a.enabled ? (a.offBy ? `Switched off by ${a.offBy}` : "Off") : a.state !== "live" ? "On · checking the first send with you" : a.lastRunAt ? `Ran ${a.runsThisMonth ?? 0} ${a.runsThisMonth === 1 ? "time" : "times"} this month · last ${fmt(a.lastRunAt)}` : "On · not run yet";
    return (
      <div className="pb-16">
        <div className="nl-listbar">
          <div>
            <h3 className="nl-block-title">{all ? "Everyone's Automations" : "Your Automations"}</h3>
            <span className="nl-meta">{data ? `${on} on · ran ${ranThisMonth} ${ranThisMonth === 1 ? "time" : "times"} this month` : "Reading…"}</span>
          </div>
          <span className="flex-1" />
          {data?.me.owner && (
            <span className="nl-toggle" role="group" aria-label="Whose">
              <button type="button" className={!all ? "is-on" : ""} onClick={() => setAll(false)}>Mine</button>
              <button type="button" className={all ? "is-on" : ""} onClick={() => setAll(true)}>Everyone&apos;s</button>
            </span>
          )}
          <button type="button" className="nl-btn nl-btn--primary nl-btn--sm" aria-expanded={building} onClick={() => setBuilding((b) => !b)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
            New automation
          </button>
        </div>

        {data && !data.switches.automations && (
          <p className="nl-auto-hold">Automations aren&apos;t running for anyone yet. You can build them, try them and send yourself a test. Nothing goes to a customer until James switches on Agent automations.</p>
        )}

        {/* Steve builds one from what you say; or start from scratch. */}
        <div className={`nl-collapse${building ? " is-open" : ""}`}>
          <div>
            <section className="nl-auto-build">
              <div className="flex items-center gap-2.5"><SteveFace size={26} /><b>Build one</b></div>
              {turns.length === 0 ? (
                <div className="flex flex-wrap gap-2">
                  {EXAMPLES.map((x) => (
                    <button key={x} type="button" className="nl-auto-pill" onClick={() => setAsk(x)}>{x}</button>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {turns.map((t, i) => (
                    <div key={i} className={t.role === "user" ? "nl-auto-me" : "nl-auto-steve"}>
                      <p>{t.text}</p>
                      {t.draft && (
                        <div className="nl-auto-draft">
                          <span className="nl-strong block">{t.draft.name || "New Automation"}</span>
                          <Sentence def={t.draft.def} />
                          {t.draft.problems.length > 0 && <p className="nl-meta text-[var(--warning)]">{t.draft.problems[0]}</p>}
                          {t.draft.cant.length > 0 && <p className="nl-meta">Can&apos;t do yet: {t.draft.cant.join(", ")}.</p>}
                          <div className="flex flex-wrap items-center gap-3">
                            <button type="button" className="nl-btn nl-btn--primary nl-btn--sm" onClick={() => setEditing({ id: null, def: t.draft!.def, name: t.draft!.name, askedFor: turns.filter((x) => x.role === "user").map((x) => x.text).join(" / "), enabled: false })}>
                              Check it and turn it on
                            </button>
                            <span className="nl-meta">Nothing runs until you switch it on.</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {thinking && <p className="nl-meta flex items-center gap-2"><SteveFace size={18} mood="thinking" /> Putting it together…</p>}
                </div>
              )}
              <div className="nl-auto-ask">
                <textarea
                  value={ask}
                  onChange={(e) => setAsk(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                  rows={2}
                  placeholder={turns.length ? "Change anything: \"make it 3 days\", \"text them instead\"…" : "When something happens, what should Steve do for you?"}
                  aria-label="Tell Steve what you'd like to happen"
                />
                <button type="button" className="nl-btn nl-btn--primary nl-btn--sm self-end" disabled={!ask.trim() || thinking} onClick={() => void send()}>Build it</button>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <button type="button" className="nl-link" onClick={() => setEditing({ id: null, def: blank(), name: "", enabled: false })}>Or start from scratch</button>
                <button type="button" className="nl-link" onClick={() => { setBuilding(false); setTurns([]); setAsk(""); }}>Cancel</button>
              </div>
            </section>
          </div>
        </div>

        {/* The first time one reaches a customer, they see it first. */}
        {previews.map((r) => (
          <section key={r.id} id={`preview-${r.id}`} className="nl-auto-check">
            <span className="nl-eyebrow">Check before it sends</span>
            <h3 className="nl-block-title">{r.automationName}</h3>
            <p className="nl-meta">The first time it runs, you see it first. {r.subject.what}.</p>
            {(r.preview ?? []).map((x, i) => (
              <div key={i} className="nl-card p-3">
                <p className="nl-meta">{x.action} to <span className="text-ink">{x.to}</span>{x.subject ? ` · ${x.subject}` : ""}</p>
                {x.html && <iframe title={x.subject ?? "Email"} srcDoc={x.html} sandbox="" className="mt-2 h-80 w-full rounded-lg border border-[var(--line)] bg-white" />}
                {x.text && <p className="mt-2 whitespace-pre-wrap text-[14px]">{x.text}</p>}
                {x.note && !x.html && <p className="mt-2 text-[14px]">{x.note}</p>}
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="nl-btn nl-btn--primary nl-btn--sm" disabled={busy === r.id} onClick={() => void answer(r, true)}>Send it, and run on its own from now</button>
              <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm" disabled={busy === r.id} onClick={() => void answer(r, false)}>Don&apos;t send this one</button>
            </div>
          </section>
        ))}

        {err && <p className="nl-meta my-3 text-[var(--accent-dark)]">{err}</p>}

        {!data && !err ? (
          <p className="nl-meta py-8">Loading your automations…</p>
        ) : data && data.automations.length === 0 ? (
          <p className="nl-empty">None yet. Press New automation and tell Steve what you&apos;d like done.</p>
        ) : (
          <ul className="nl-autolist">
            {data?.automations.map((a) => (
              <li key={a.id} className={a.enabled ? "is-on" : ""}>
                <div className="min-w-0">
                  <Sentence def={a.def} />
                  <span className="nl-meta block">
                    {all && a.userName ? `${a.userName} · ` : ""}
                    {stateWord(a)}
                    {(a.waiting ?? 0) > 0 ? ` · ${a.waiting} waiting` : ""}
                  </span>
                </div>
                <span className="flex items-center gap-4">
                  {mine(a) && <button type="button" className="nl-link" onClick={() => setEditing({ id: a.id, def: a.def, name: a.name, dailyCap: a.dailyCap, askedFor: a.askedFor, enabled: a.enabled })}>Change</button>}
                  {mine(a) && <button type="button" className="nl-link nl-auto-del" onClick={() => void remove(a)}>Delete</button>}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={a.enabled}
                    aria-label={a.name}
                    className={`nl-switch${a.enabled ? " is-on" : ""}`}
                    disabled={busy === a.id || (!mine(a) && !a.enabled)}
                    title={!mine(a) ? (a.enabled ? `Switch ${a.userName}'s off` : "Only they can switch it on") : a.enabled ? "Switch off" : "Switch on"}
                    onClick={() => void toggle(a, !a.enabled)}
                  >
                    <i />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Every run: who, what it sent and to where. */}
        <h3 className="nl-block-title mb-2.5 mt-12">Every Run</h3>
        {data && data.runs.length === 0 && <p className="nl-meta">Nothing has run yet. Each time one does, it&apos;s written here.</p>}
        {data && data.runs.length > 0 && (
          <ul className="nl-runlist">
            {data.runs.map((r) => (
              <li key={r.id}>
                <span className="nl-mono">{fmt(r.finishedAt ?? (r.state === "waiting" ? r.dueAt : r.createdAt))}{r.state === "waiting" ? " · due" : ""}</span>
                <span className="min-w-0">
                  <span className="nl-strong block">{r.automationName}{all && r.userName ? <span className="nl-meta"> · {r.userName}</span> : null}</span>
                  <span className="nl-meta block">
                    {[r.subject.name, r.subject.what].filter(Boolean).join(" · ")}
                    {r.outcomes.length
                      ? ` · ${r.outcomes.map((o) => `${o.action}${o.to && o.to !== "-" ? ` to ${o.toId && o.toId === data.me.id ? "you" : o.to}` : ""}`).join(", ")}`
                      : r.detail
                        ? ` · ${r.detail}`
                        : ""}
                  </span>
                </span>
                <Badge tone={r.state === "done" ? "good" : r.state === "failed" ? "accent" : r.state === "preview" || r.state === "held" ? "warning" : "neutral"}>{RUN_WORD[r.state] ?? r.state}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-16">
      <p className="max-w-2xl text-[13px] leading-relaxed text-muted">
        Things you'd like done for you, every time, on your own book. Pick what starts it, how long to wait, anything that must still be true, and what to do. Or tell Steve and he'll put it together for you to check.
      </p>

      {data && !data.switches.automations && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] leading-relaxed text-amber-800">
          <StepIcon name="bolt" size={16} className="mt-0.5" />
          <p>Automations aren't running for anyone yet. You can build them, try them and send yourself a test. Nothing goes to a customer until James switches on Agent automations.</p>
        </div>
      )}

      {/* ── Waiting for them to check ── */}
      {previews.map((r) => (
        <section key={r.id} id={`preview-${r.id}`} className="rounded-2xl border border-amber-300 bg-amber-50/60 p-5">
          <p className="text-[11px] uppercase tracking-[0.08em] text-amber-700">Check before it sends</p>
          <h2 className="mt-1 text-[16px] font-normal tracking-normal text-ink">{r.automationName}</h2>
          <p className="mt-1 text-[12.5px] text-muted">The first time it runs, you see it first. {r.subject.what}.</p>
          <div className="mt-3 space-y-3">
            {(r.preview ?? []).map((x, i) => (
              <div key={i} className="rounded-xl border border-line/80 bg-card p-3">
                <p className="text-[12px] text-muted">{x.action} to <span className="text-ink">{x.to}</span>{x.subject ? ` · ${x.subject}` : ""}</p>
                {x.html && <iframe title={x.subject ?? "Email"} srcDoc={x.html} sandbox="" className="mt-2 h-80 w-full rounded-lg border border-line/60 bg-white" />}
                {x.text && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-page p-3 text-[13px] text-ink">{x.text}</p>}
                {x.note && !x.html && <p className="mt-2 text-[13px] text-ink">{x.note}</p>}
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={busy === r.id} onClick={() => void answer(r, true)} className="rounded-lg bg-accent-dark px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40">Send it, and run on its own from now</button>
            <button type="button" disabled={busy === r.id} onClick={() => void answer(r, false)} className="rounded-lg border border-line bg-card px-4 py-2 text-[12.5px] text-ink disabled:opacity-40">Don't send this one</button>
          </div>
        </section>
      ))}

      {/* ── Ask Steve ── */}
      <section className="rounded-2xl border border-line/80 bg-card p-5">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent-dark text-white"><LineIconMagic /></span>
          <h2 className="text-[16px] font-normal tracking-normal text-ink">Ask Steve to Build One</h2>
        </div>
        {turns.length === 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((x) => (
              <button key={x} type="button" onClick={() => setAsk(x)} className="rounded-full border border-line bg-page px-3 py-1.5 text-left text-[11.5px] text-muted hover:border-accent-dark hover:text-ink">{x}</button>
            ))}
          </div>
        )}
        {turns.length > 0 && (
          <div className="mt-4 space-y-3">
            {turns.map((t, i) => (
              <div key={i} className={t.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed ${t.role === "user" ? "bg-accent-dark text-white" : "bg-page text-ink"}`}>
                  <p className="whitespace-pre-wrap">{t.text}</p>
                  {t.draft && (
                    <div className="mt-3 rounded-xl border border-line/80 bg-card p-3">
                      <p className="text-[13.5px] text-ink">{t.draft.name || "New Automation"}</p>
                      <p className="mt-1 text-[12.5px] text-muted">{t.draft.sentence}</p>
                      <Chain def={t.draft.def} />
                      {t.draft.problems.length > 0 && <p className="mt-2 text-[12px] text-rose-700">{t.draft.problems[0]}</p>}
                      {t.draft.cant.length > 0 && <p className="mt-2 text-[11.5px] text-muted">Can't do yet: {t.draft.cant.join(", ")}.</p>}
                      <button
                        type="button"
                        onClick={() => setEditing({ id: null, def: t.draft!.def, name: t.draft!.name, askedFor: turns.filter((x) => x.role === "user").map((x) => x.text).join(" / "), enabled: false })}
                        className="mt-3 rounded-lg bg-accent-dark px-3.5 py-1.5 text-[12px] font-semibold text-white"
                      >
                        Check it in the editor
                      </button>
                      <p className="mt-1.5 text-[11px] text-muted">Nothing is switched on until you do it yourself.</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {thinking && (
              <div className="flex items-center gap-2 text-[12.5px] text-muted">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-line border-t-accent-dark" /> Steve is putting it together...
              </div>
            )}
          </div>
        )}
        <div className="mt-4 flex gap-2">
          <textarea
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
            rows={2}
            placeholder={turns.length ? "Change anything - \"make it 3 days\", \"text them instead\"..." : "Tell Steve what you'd like to happen..."}
            className="min-w-0 flex-1 resize-none rounded-xl border border-line bg-page px-3.5 py-2.5 text-[13px] text-ink outline-none focus:border-accent-dark"
          />
          <button type="button" disabled={!ask.trim() || thinking} onClick={() => void send()} className="self-end rounded-lg bg-accent-dark px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40">Build it</button>
        </div>
      </section>

      {err && <p className="text-[12.5px] text-rose-700">{err}</p>}

      {/* ── Their automations ── */}
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="text-[16px] font-normal tracking-normal text-ink">{all ? "Everyone's Automations" : "Your Automations"}</h2>
          {data?.me.owner && (
            <div className="flex rounded-full border border-line p-0.5 text-[11.5px]">
              <button type="button" onClick={() => setAll(false)} className={`rounded-full px-3 py-1 ${!all ? "bg-accent-dark text-white" : "text-muted"}`}>Mine</button>
              <button type="button" onClick={() => setAll(true)} className={`rounded-full px-3 py-1 ${all ? "bg-accent-dark text-white" : "text-muted"}`}>Everyone's</button>
            </div>
          )}
          <button type="button" onClick={() => setEditing({ id: null, def: blank(), name: "", enabled: false })} className="ml-auto flex items-center gap-1.5 rounded-lg border border-line bg-card px-3.5 py-2 text-[12.5px] text-ink hover:border-accent-dark">
            <span className="text-[14px] leading-none">+</span> New automation
          </button>
        </div>
        {!data && !err && (
          <div className="flex items-center gap-2 py-8 text-[12.5px] text-muted"><span className="h-3 w-3 animate-spin rounded-full border-2 border-line border-t-accent-dark" /> Loading your automations...</div>
        )}
        {data && data.automations.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line px-5 py-8 text-center text-[13px] text-muted">None yet. Ask Steve above, or start one from scratch.</div>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          {data?.automations.map((a) => (
            <div key={a.id} className="flex flex-col rounded-2xl border border-line/80 bg-card p-4">
              <div className="flex items-start gap-3">
                <button type="button" onClick={() => mine(a) && setEditing({ id: a.id, def: a.def, name: a.name, dailyCap: a.dailyCap, askedFor: a.askedFor, enabled: a.enabled })} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-[14.5px] text-ink">{a.name}</p>
                  {all && <p className="text-[11.5px] text-muted">{a.userName}</p>}
                </button>
                <Toggle
                  on={a.enabled}
                  disabled={busy === a.id || (!mine(a) && !a.enabled)}
                  onChange={(v) => void toggle(a, v)}
                  title={!mine(a) ? (a.enabled ? `Switch ${a.userName}'s off` : "Only they can switch it on") : undefined}
                />
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{a.sentence}</p>
              <Chain def={a.def} />
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line/60 pt-3 text-[11.5px] text-muted">
                <StatePill a={a} />
                <span>Last run <span className="text-ink">{fmt(a.lastRunAt)}</span></span>
                <span><span className="figures text-ink">{a.runsThisMonth ?? 0}</span> this month</span>
                {(a.waiting ?? 0) > 0 && <span><span className="figures text-ink">{a.waiting}</span> waiting</span>}
                {mine(a) && <button type="button" onClick={() => void remove(a)} className="ml-auto text-muted hover:text-rose-700">Delete</button>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── The log ── */}
      <section>
        <h2 className="mb-3 text-[16px] font-normal tracking-normal text-ink">Every Run</h2>
        {data && data.runs.length === 0 && <p className="text-[12.5px] text-muted">Nothing has run yet. Each time one does, it's written here: who, what it sent and to where.</p>}
        {data && data.runs.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-line/80 bg-card">
            <table className="w-full min-w-[720px] text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-line/70 text-[11px] text-muted">
                  <th className="px-4 py-2.5 font-normal">When</th>
                  <th className="px-4 py-2.5 font-normal">Automation</th>
                  <th className="px-4 py-2.5 font-normal">About</th>
                  <th className="px-4 py-2.5 font-normal">What happened</th>
                  <th className="px-4 py-2.5 font-normal" />
                </tr>
              </thead>
              <tbody>
                {data.runs.map((r) => (
                  <tr key={r.id} className="border-b border-line/50 align-top last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{fmt(r.finishedAt ?? (r.state === "waiting" ? r.dueAt : r.createdAt))}{r.state === "waiting" && <span className="block text-[10.5px]">due</span>}</td>
                    <td className="px-4 py-3 text-ink">{r.automationName}{all && r.userName ? <span className="block text-[11px] text-muted">{r.userName}</span> : null}</td>
                    <td className="px-4 py-3"><span className="text-ink">{r.subject.name || "-"}</span><span className="block text-[11.5px] text-muted">{r.subject.what}</span></td>
                    <td className="px-4 py-3">
                      {r.outcomes.length ? (
                        <ul className="space-y-1">
                          {r.outcomes.map((o, i) => (
                            <li key={i} className="text-[12px] leading-snug">
                              <span className="text-ink">{o.action}</span>
                              {o.to && o.to !== "-" ? <span className="text-muted"> to {o.toId && o.toId === data.me.id ? "you" : o.to}</span> : null}
                              {o.subject ? <span className="text-muted"> · "{o.subject}"</span> : null}
                              <span className="block text-[11.5px] text-muted">{o.detail}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-[12px] text-muted">{r.detail || "Waiting for its moment."}</span>
                      )}
                      {r.outcomes.length > 0 && r.state !== "done" && r.detail && !r.outcomes.some((o) => r.detail.includes(o.detail)) && <span className="mt-1 block text-[11.5px] text-muted">{r.detail}</span>}
                    </td>
                    <td className="px-4 py-3 text-right"><span className={`rounded-full px-2 py-0.5 text-[10.5px] ${RUN_TONE[r.state] ?? "bg-page text-muted"}`}>{RUN_WORD[r.state] ?? r.state}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/** The trigger and its actions as a little chain of icons: Zapier's row of app badges. */
function Chain({ def }: { def: AutomationDef }) {
  const t = triggerDef(def.trigger.key);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <span className="flex items-center gap-1.5 rounded-lg border border-accent-dark/30 bg-page px-2 py-1 text-[11px] text-ink"><StepIcon name={t?.icon ?? "dot"} size={13} /> {t?.label}</span>
      {def.waitHours > 0 && (<><Arrow /><span className="flex items-center gap-1 rounded-lg border border-line bg-page px-2 py-1 text-[11px] text-muted"><StepIcon name="clock" size={12} /> {def.waitHours % 24 === 0 ? `${def.waitHours / 24}d` : `${def.waitHours}h`}</span></>)}
      {def.conditions.length > 0 && (<><Arrow /><span className="flex items-center gap-1 rounded-lg border border-line bg-page px-2 py-1 text-[11px] text-muted"><StepIcon name="filter" size={12} /> {def.conditions.length}</span></>)}
      {def.actions.map((a, i) => {
        const d = actionDef(a.key);
        return (
          <span key={i} className="flex items-center gap-1.5">
            <Arrow />
            <span className="flex items-center gap-1.5 rounded-lg border border-line bg-page px-2 py-1 text-[11px] text-ink"><StepIcon name={d?.icon ?? "dot"} size={13} /> {d?.label}</span>
          </span>
        );
      })}
    </div>
  );
}

function Arrow() {
  return <span className="text-[11px] text-line">&rarr;</span>;
}

function LineIconMagic() {
  return <StepIcon name="magic-wand" size={16} />;
}

/**
 * The automation as the new look reads it: one sentence in the serif, the
 * parts that change in bold. "When a viewing has happened, wait 1 day, then
 * text them to ask how it went."
 */
function Sentence({ def }: { def: AutomationDef }) {
  const start = triggerWords(def.trigger);
  const sched = def.trigger.key === "schedule";
  const acts = def.actions.map(actionWords);
  const joined = acts.length > 1 ? `${acts.slice(0, -1).join(", ")} and ${acts[acts.length - 1]}` : acts[0];
  return (
    <p className="nl-auto-sentence">
      {sched ? <b>{start.charAt(0).toUpperCase() + start.slice(1)}</b> : <>When <b>{start}</b></>}
      {def.waitHours ? <>, wait <b>{waitWords(def.waitHours)}</b></> : null}
      {def.conditions.length ? <>, and if <b>{def.conditions.map(conditionWords).join(" and ")}</b></> : null}
      {joined ? <>, {sched && !def.waitHours && !def.conditions.length ? "" : "then "}<b>{joined}</b>.</> : <>, then do nothing yet.</>}
    </p>
  );
}
