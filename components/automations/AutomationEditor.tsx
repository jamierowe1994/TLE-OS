"use client";

import { useEffect, useMemo, useState } from "react";
import LineIcon from "@/components/LineIcon";
import {
  ACTIONS, CONDITIONS, TRIGGERS, DEFAULT_DAILY_CAP, MAX_DAILY_CAP,
  actionDef, conditionDef, describe, param, problems, triggerDef, waitWords,
  type ActionKey, type AutomationDef, type ConditionKey, type Field, type Params, type TriggerKey,
} from "@/lib/automations/catalogue";

/**
 * The editor: one automation as a column of steps joined by a line, the way
 * Zapier draws a zap - When, Wait, Only if, Then. Every picker is drawn from
 * lib/automations/catalogue, so nothing can be built here that the runner
 * would refuse. Saving never switches it on; that is its own press.
 */

export type EmailChoice = { id: string; name: string; group: string; subject?: string; body?: string };
export type Pickers = { emails: EmailChoice[]; people: { id: string; name: string }[]; rooms: string[] };

type TryResult = {
  caught: { count: number; examples: { name: string; what: string; at: string }[]; note: string | null };
  items: { action: string; to: string; subject?: string; html?: string; text?: string; note?: string }[];
  notes: string[];
  sent: string | null;
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const input = "w-full rounded-lg border border-line bg-page px-3 py-2 text-[13px] text-ink outline-none focus:border-accent-dark";

/** The extra line icons this screen needs that the sidebar set doesn't have. */
export function StepIcon({ name, size = 16, className = "" }: { name: string; size?: number; className?: string }) {
  const extra: Record<string, React.ReactNode> = {
    clock: (<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>),
    filter: <path d="M4 5.5h16l-6.2 7.3v5.2l-3.6 1.8v-7z" />,
    bolt: <path d="M13 3.5 5.5 13.5H12l-1 7 7.5-10H12z" />,
    user: (<><circle cx="12" cy="8.5" r="3.5" /><path d="M5 19.5c1.2-3.4 4-5 7-5s5.8 1.6 7 5" /></>),
  };
  if (extra[name]) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`shrink-0 ${className}`}>
        {extra[name]}
      </svg>
    );
  }
  return <LineIcon name={name} size={size} className={className} />;
}

function FieldInput({ f, value, onChange, pickers, person }: { f: Field; value: string | number; onChange: (v: string | number) => void; pickers: Pickers; person: string }) {
  if (f.kind === "choice") {
    return (
      <select className={input} value={String(value)} onChange={(e) => onChange(e.target.value)}>
        {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  if (f.kind === "number") return <input className={input} type="number" min={f.min} max={f.max} value={String(value)} onChange={(e) => onChange(Number(e.target.value))} />;
  if (f.kind === "time") return <input className={input} type="time" value={String(value)} onChange={(e) => onChange(e.target.value)} />;
  if (f.kind === "weekday") {
    return (
      <select className={input} value={String(value)} onChange={(e) => onChange(Number(e.target.value))}>
        {DAYS.map((d, i) => <option key={d} value={i}>{d} (or day {i || 7} of a month)</option>)}
      </select>
    );
  }
  if (f.kind === "person") {
    return (
      <select className={input} value={String(value)} onChange={(e) => onChange(e.target.value)}>
        <option value="me">Me</option>
        {pickers.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    );
  }
  if (f.kind === "template") {
    const groups = [...new Set(pickers.emails.map((e) => e.group))];
    return (
      <select className={input} value={String(value)} onChange={(e) => onChange(e.target.value)}>
        {groups.map((g) => {
          const opts = pickers.emails.filter((e) => e.group === g && (e.id !== "homes-nearby" || person === "tenant"));
          const items = opts.map((e) => <option key={e.id} value={e.id}>{e.name}</option>);
          return g ? <optgroup key={g} label={g}>{items}</optgroup> : items;
        })}
      </select>
    );
  }
  if (f.kind === "textarea") return <textarea className={`${input} min-h-[150px] leading-relaxed`} value={String(value)} onChange={(e) => onChange(e.target.value)} />;
  if (f.key === "room" && pickers.rooms.length) {
    return (
      <select className={input} value={String(value)} onChange={(e) => onChange(e.target.value)}>
        <option value="">Pick a Huddle</option>
        {pickers.rooms.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
    );
  }
  return <input className={input} value={String(value)} placeholder={f.default != null ? String(f.default) : ""} onChange={(e) => onChange(e.target.value)} />;
}

function Fields({ fields, params, onChange, pickers, person }: { fields: Field[]; params: Params; onChange: (p: Params) => void; pickers: Pickers; person: string }) {
  if (!fields.length) return null;
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {fields.map((f) => (
        <label key={f.key} className={`block ${f.kind === "textarea" || f.kind === "template" || f.key === "subject" || f.key === "title" || f.key === "message" ? "sm:col-span-2" : ""}`}>
          <span className="mb-1 block text-[11.5px] text-muted">{f.label}</span>
          <FieldInput f={f} value={param(params, f)} pickers={pickers} person={person} onChange={(v) => onChange({ ...params, [f.key]: v })} />
          {f.help && <span className="mt-1 block text-[11px] leading-snug text-muted">{f.help}</span>}
        </label>
      ))}
    </div>
  );
}

/** One step in the column: a numbered badge, a title, its body. */
function StepCard({ n, icon, kicker, title, children, onRemove, tone = "plain" }: { n: string; icon: string; kicker: string; title: string; children?: React.ReactNode; onRemove?: () => void; tone?: "start" | "plain" }) {
  return (
    <div className={`relative rounded-2xl border bg-card p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)] ${tone === "start" ? "border-accent-dark/40" : "border-line/80"}`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone === "start" ? "bg-accent-dark text-white" : "bg-page text-ink"} border border-line/60`}>
          <StepIcon name={icon} size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] uppercase tracking-[0.08em] text-muted">{n} · {kicker}</p>
          <p className="mt-0.5 text-[14.5px] text-ink">{title}</p>
        </div>
        {onRemove && (
          <button type="button" onClick={onRemove} className="rounded-md p-1 text-muted hover:bg-page hover:text-ink" title="Remove this step" aria-label="Remove this step">
            <LineIcon name="trash" size={15} />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function Joint({ onAdd, label }: { onAdd?: () => void; label?: string }) {
  return (
    <div className="relative flex h-10 items-center justify-center">
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line" />
      {onAdd && (
        <button type="button" onClick={onAdd} className="relative z-[1] flex items-center gap-1.5 rounded-full border border-line bg-page px-2.5 py-1 text-[11px] text-muted hover:border-accent-dark hover:text-ink">
          <span className="text-[13px] leading-none">+</span> {label}
        </button>
      )}
    </div>
  );
}

export default function AutomationEditor({
  initial, name: initialName, dailyCap: initialCap, id, pickers, askedFor, onSaved, onClose, enabled, onToggle,
}: {
  initial: AutomationDef;
  name: string;
  dailyCap?: number;
  id: string | null;
  pickers: Pickers;
  askedFor?: string | null;
  enabled: boolean;
  onSaved: (id: string) => void;
  onToggle?: (on: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const [def, setDef] = useState<AutomationDef>(initial);
  const [name, setName] = useState(initialName);
  const [cap, setCap] = useState(initialCap ?? DEFAULT_DAILY_CAP);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(id);
  const [dirty, setDirty] = useState(!id);
  const [tried, setTried] = useState<TryResult | null>(null);
  const [trying, setTrying] = useState<"look" | "test" | null>(null);

  useEffect(() => { setDef(initial); setName(initialName); setDirty(!id); setSavedId(id); setTried(null); }, [initial, initialName, id]);

  const t = triggerDef(def.trigger.key)!;
  const wrong = useMemo(() => problems(def), [def]);
  const change = (d: AutomationDef) => { setDef(d); setDirty(true); setTried(null); };

  const setTrigger = (key: TriggerKey) => {
    const d = triggerDef(key)!;
    const params: Params = {};
    for (const f of d.fields) if (f.default !== undefined) params[f.key] = f.default;
    change({ ...def, trigger: { key, params }, conditions: def.conditions.filter((c) => conditionDef(c.key)?.on.includes(key)) });
  };
  const fitting = CONDITIONS.filter((c) => c.on.includes(def.trigger.key) && !def.conditions.some((x) => x.key === c.key));
  const addCondition = (key: ConditionKey) => {
    const d = conditionDef(key)!;
    const params: Params = {};
    for (const f of d.fields) if (f.default !== undefined) params[f.key] = f.default;
    change({ ...def, conditions: [...def.conditions, { key, params }] });
  };
  const addAction = (key: ActionKey) => {
    const d = actionDef(key)!;
    const params: Params = {};
    for (const f of d.fields) if (f.default !== undefined) params[f.key] = f.default;
    change({ ...def, actions: [...def.actions, { key, params }] });
  };
  const [picking, setPicking] = useState<"condition" | "action" | null>(null);
  const waitDays = def.waitHours % 24 === 0;

  async function save(): Promise<string | null> {
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch("/api/automations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: savedId, name, def, dailyCap: cap, askedFor }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "It could not be saved.");
      setSavedId(j.automation.id);
      setDirty(false);
      onSaved(j.automation.id);
      return j.automation.id as string;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "It could not be saved.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function tryIt(test: boolean) {
    setTrying(test ? "test" : "look");
    setErr(null);
    try {
      const r = await fetch("/api/automations/try", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ def, name, test }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "It couldn't be tried.");
      setTried(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "It couldn't be tried.");
    } finally {
      setTrying(null);
    }
  }

  useEffect(() => { if (!wrong.length && !tried) void tryIt(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [def.trigger.key, JSON.stringify(def.trigger.params)]);

  let step = 0;
  const no = () => String(++step);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      {/* ── The column of steps ── */}
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 py-1 text-[20px] tracking-normal text-ink outline-none hover:border-line focus:border-accent-dark"
            value={name}
            placeholder="Name This Automation"
            onChange={(e) => { setName(e.target.value); setDirty(true); }}
            aria-label="Name"
          />
          <button type="button" onClick={onClose} className="text-[12.5px] text-muted hover:text-ink">Back to the list</button>
        </div>
        <p className="mb-5 rounded-xl bg-page px-4 py-3 text-[13px] leading-relaxed text-ink">{describe(def)}</p>

        <StepCard n={no()} icon={t.icon} kicker="When" title={t.label} tone="start">
          <div className="mt-3">
            <select className={input} value={def.trigger.key} onChange={(e) => setTrigger(e.target.value as TriggerKey)}>
              {[...new Set(TRIGGERS.map((x) => x.group))].map((g) => (
                <optgroup key={g} label={g}>
                  {TRIGGERS.filter((x) => x.group === g).map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                </optgroup>
              ))}
            </select>
            <p className="mt-1.5 text-[11.5px] text-muted">{t.help}</p>
          </div>
          <Fields fields={t.fields} params={def.trigger.params} pickers={pickers} person={t.person} onChange={(params) => change({ ...def, trigger: { ...def.trigger, params } })} />
        </StepCard>

        <Joint />
        <StepCard n={no()} icon="clock" kicker="Wait" title={def.waitHours ? `Wait ${waitWords(def.waitHours)}` : "Straight away"}>
          <div className="mt-3 flex items-center gap-2">
            <input className={`${input} w-24`} type="number" min={0} max={waitDays ? 30 : 720} value={waitDays ? def.waitHours / 24 : def.waitHours} onChange={(e) => change({ ...def, waitHours: Math.max(0, Number(e.target.value) || 0) * (waitDays ? 24 : 1) })} />
            <select className={`${input} w-32`} value={waitDays ? "days" : "hours"} onChange={(e) => change({ ...def, waitHours: e.target.value === "days" ? Math.max(24, Math.round(def.waitHours / 24) * 24) : def.waitHours || 1 })}>
              <option value="days">days</option>
              <option value="hours">hours</option>
            </select>
            <span className="text-[11.5px] text-muted">after it happens. The conditions are checked when the wait is over.</span>
          </div>
        </StepCard>

        {def.conditions.map((c, i) => {
          const d = conditionDef(c.key)!;
          return (
            <div key={`${c.key}-${i}`}>
              <Joint />
              <StepCard n={no()} icon="filter" kicker="Only if" title={d.label} onRemove={() => change({ ...def, conditions: def.conditions.filter((_, j) => j !== i) })}>
                <Fields fields={d.fields} params={c.params} pickers={pickers} person={t.person} onChange={(params) => change({ ...def, conditions: def.conditions.map((x, j) => (j === i ? { ...x, params } : x)) })} />
              </StepCard>
            </div>
          );
        })}
        <Joint onAdd={fitting.length ? () => setPicking(picking === "condition" ? null : "condition") : undefined} label="Only if..." />
        {picking === "condition" && (
          <div className="mb-2 flex flex-wrap justify-center gap-2">
            {fitting.map((c) => (
              <button key={c.key} type="button" onClick={() => { addCondition(c.key); setPicking(null); }} className="rounded-full border border-line bg-card px-3 py-1.5 text-[12px] text-ink hover:border-accent-dark">{c.label}</button>
            ))}
          </div>
        )}

        {def.actions.map((a, i) => {
          const d = actionDef(a.key)!;
          const tpl = String(a.params.template ?? "custom");
          const fields = a.key === "email" && tpl === "homes-nearby" ? d.fields.filter((f) => f.key === "template") : d.fields;
          return (
            <div key={`${a.key}-${i}`}>
              {i > 0 && <Joint />}
              <StepCard n={no()} icon={d.icon} kicker={i === 0 ? "Then" : "And"} title={d.label} onRemove={() => change({ ...def, actions: def.actions.filter((_, j) => j !== i) })}>
                {d.customer && <p className="mt-2 text-[11.5px] text-muted">Goes to the {t.person === "landlord" ? "landlord" : "tenant"} from you. The first one waits for you to check it.</p>}
                <Fields
                  fields={fields}
                  params={a.params}
                  pickers={pickers}
                  person={t.person}
                  onChange={(params) => {
                    /* Picking a written email fills its words in, so they can be changed. */
                    const next = { ...params };
                    if (a.key === "email" && params.template !== a.params.template) {
                      const e = pickers.emails.find((x) => x.id === params.template);
                      next.subject = e?.subject ?? (params.template === "custom" ? "" : "");
                      next.body = e?.body ?? "";
                    }
                    change({ ...def, actions: def.actions.map((x, j) => (j === i ? { ...x, params: next } : x)) });
                  }}
                />
              </StepCard>
            </div>
          );
        })}
        <Joint onAdd={() => setPicking(picking === "action" ? null : "action")} label={def.actions.length ? "Add another action" : "Add what it does"} />
        {picking === "action" && (
          <div className="flex flex-wrap justify-center gap-2">
            {ACTIONS.filter((a) => !(a.needsPerson && t.person === "none")).map((a) => (
              <button key={a.key} type="button" onClick={() => { addAction(a.key); setPicking(null); }} className="flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-[12px] text-ink hover:border-accent-dark">
                <StepIcon name={a.icon} size={13} /> {a.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── The side: check it, try it, save it, switch it on ── */}
      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-2xl border border-line/80 bg-card p-4">
          <p className="text-[14px] text-ink">Before It Goes On</p>
          {wrong.length > 0 ? (
            <ul className="mt-2 space-y-1 text-[12.5px] text-rose-700">{wrong.map((w) => <li key={w}>{w}</li>)}</ul>
          ) : (
            <p className="mt-2 text-[12.5px] text-muted">Ready. Save it, then switch it on when you're happy.</p>
          )}
          <label className="mt-3 block">
            <span className="mb-1 block text-[11.5px] text-muted">Most customers a day</span>
            <input className={`${input} w-24`} type="number" min={1} max={MAX_DAILY_CAP} value={cap} onChange={(e) => { setCap(Math.max(1, Math.min(MAX_DAILY_CAP, Number(e.target.value) || 1))); setDirty(true); }} />
          </label>
          {err && <p className="mt-3 text-[12.5px] text-rose-700">{err}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={saving || wrong.length > 0 || (!dirty && !!savedId)} onClick={() => void save()} className="rounded-lg bg-accent-dark px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40">
              {saving ? "Saving..." : savedId && !dirty ? "Saved" : "Save"}
            </button>
            {savedId && onToggle && (
              <button
                type="button"
                disabled={saving || dirty || wrong.length > 0}
                onClick={() => void onToggle(!enabled)}
                className="rounded-lg border border-line px-4 py-2 text-[12.5px] text-ink hover:border-accent-dark disabled:opacity-40"
                title={dirty ? "Save it first" : undefined}
              >
                {enabled ? "Switch off" : "Switch on"}
              </button>
            )}
          </div>
          <p className="mt-3 text-[11px] leading-snug text-muted">Only ever your own book. Each customer gets this once. Never anything into REX, PayProp or Propoly.</p>
        </div>

        <div className="rounded-2xl border border-line/80 bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[14px] text-ink">Try It</p>
            <button type="button" disabled={!!trying || wrong.length > 0} onClick={() => void tryIt(false)} className="text-[12px] text-accent-dark disabled:opacity-40">{trying === "look" ? "Looking..." : "Look again"}</button>
          </div>
          {trying === "look" && !tried && <p className="mt-2 flex items-center gap-2 text-[12.5px] text-muted"><span className="h-3 w-3 animate-spin rounded-full border-2 border-line border-t-accent-dark" /> Looking at your book...</p>}
          {tried && (
            <>
              <p className="mt-2 text-[12.5px] text-ink">
                {def.trigger.key === "schedule" ? "Runs on its own clock." : <>Would have started for <span className="figures">{tried.caught.count}</span> {tried.caught.count === 1 ? "person" : "people"}. <span className="text-muted">{tried.caught.note}</span></>}
              </p>
              {tried.caught.examples.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {tried.caught.examples.slice(0, 4).map((x, i) => (
                    <li key={i} className="text-[11.5px] leading-snug text-muted"><span className="text-ink">{x.name || "Someone"}</span> · {x.what}</li>
                  ))}
                </ul>
              )}
              {tried.items.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-[11.5px] text-muted">What it would send (shown with you as the customer):</p>
                  {tried.items.map((x, i) => (
                    <div key={i} className="rounded-lg border border-line/70 bg-page p-2.5">
                      <p className="text-[11px] text-muted">{x.action}{x.subject ? ` · ${x.subject}` : ""}</p>
                      {x.html && <iframe title={x.subject ?? "Email"} srcDoc={x.html} className="mt-1.5 h-56 w-full rounded-md border border-line/60 bg-white" sandbox="" />}
                      {x.text && <p className="mt-1 whitespace-pre-wrap text-[12px] text-ink">{x.text}</p>}
                      {x.note && !x.html && <p className="mt-1 text-[12px] text-ink">{x.note}</p>}
                    </div>
                  ))}
                </div>
              )}
              {tried.notes.length > 0 && <ul className="mt-2 space-y-1 text-[11.5px] text-muted">{tried.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
              {tried.items.some((x) => x.html) && (
                <button type="button" disabled={!!trying} onClick={() => void tryIt(true)} className="mt-3 rounded-lg border border-line px-3 py-1.5 text-[12px] text-ink hover:border-accent-dark disabled:opacity-40">
                  {trying === "test" ? "Sending..." : "Send me a test"}
                </button>
              )}
              {tried.sent && <p className="mt-2 text-[12px] text-ink">{tried.sent}</p>}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
