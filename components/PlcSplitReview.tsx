"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CopyButton } from "@/components/Bits";
import DoodleIcon from "@/components/DoodleIcon";
import { api, ComplianceSide, Head, Note, prettyDate, prettyWhen, TenantAnswersBody, useTenantAnswers, type Loaded } from "@/components/PlcReview";
import { CHECK_GROUPS, docTitle, gateOf, tickHolds, type Check, type CheckId, type PlcAiSummary, type PlcCase, type PlcDocument, type PlcTick } from "@/lib/plc";
import type { TenantAnswers } from "@/lib/plc-tenant-answers";

/**
 * THE PLC REVIEW, OPENED OUT ON THE SCREEN (James, 23 Oct 2026).
 *
 * Kirstie works a pack with two jobs going at once: checking every file, and
 * typing the landlord's and the tenants' details into the Propoly deal. The
 * drawer gave her one long column, so the pack sat under ninety lines of scan
 * and the answers sat under the pack. Now:
 *
 *   left   a dark panel with two tabs, Landlord and Tenant. Each has the
 *          people on it, that side's documents as a checklist she ticks Yes
 *          or No, and (Tenant) everything the tenants told us, ready to copy.
 *   right  the AI summary first - pass, fail or look at one thing - with the
 *          scan's lines folded under it, then the decision as before.
 *
 * A file opens in a pop-up over the screen rather than a new tab ("she's got
 * a billion windows open"), with Download, and Yes / No for its check so she
 * can tick it while she is looking at it. A wrong file can be replaced from
 * the row: the old one stays on the record (PlcDocument.replaces).
 *
 * The ticks are hers and decide nothing (PlcTick). A tick is for the files
 * that were there when she ticked, so a replaced file un-ticks its check.
 */

type Group = "landlord" | "tenant";

/** Who is on the let, as /api/applications/<ref>/people says. Only what this panel shows. */
type Party = { key: string; role: "tenant" | "landlord"; name: string; email: string | null; phone: string | null; address: string | null; isPrimary: boolean };
type PeopleState = { people: Party[]; problem: string | null; error: string | null; loading: boolean };

/** What the sample hands in, so the panel never calls the API for an invented pack. */
export type SplitSample = {
  people: Party[];
  answers: TenantAnswers;
  summary: PlcAiSummary;
  /** Put a pretend file on the pack in place of an upload. */
  attach: (caseId: string, checkId: CheckId, name: string, replaceKey: string | null) => void;
};

const WITH_COMPLIANCE: PlcCase["state"][] = ["submitted", "scanning", "reviewing", "checked"];

const filesOn = (c: PlcCase, id: CheckId) => c.documents.filter((d) => d.checkId === id || d.covers?.includes(id));

/** The checks a group shows: the same rule as the pack - an optional check with nothing on it is noise. */
function checksFor(group: Group, data: Loaded): Check[] {
  const ids = CHECK_GROUPS.find((g) => g.id === group)?.checks ?? [];
  const c = data.case;
  const list = data.checks.filter((k) => ids.includes(k.id) || (group === "landlord" && k.id === "other"));
  return list.filter((k) => {
    const g = gateOf(k, c.letType);
    if (filesOn(c, k.id).length || (c.waivers ?? []).some((w) => w.checkId === k.id)) return true;
    return g !== "optional" && g !== "after" && k.id !== "other";
  });
}

const isImage = (name: string) => /\.(png|jpe?g|gif|webp|heic)$/i.test(name);
const saveUrl = (url: string) => `${url}${url.includes("?") ? "&" : "?"}save=1`;

/* ─────────────────────────────── the screen ────────────────────────────── */

export default function PlcSplitReview({
  data,
  reload,
  say,
  onDecided,
  perform,
  head,
  sample,
  after,
}: {
  data: Loaded;
  reload: () => Promise<void>;
  say: (e: string | null) => void;
  onDecided: () => void;
  perform?: (action: string, extra: Record<string, unknown>) => Promise<void>;
  /** The pack's head: address, who sent it, how long it has waited, Close. */
  head: React.ReactNode;
  sample?: SplitSample | null;
  /** Anything under the decision on the right (the pack's emails). */
  after?: React.ReactNode;
}) {
  const c = data.case;
  const [tab, setTab] = useState<Group>("landlord");
  const [ticks, setTicks] = useState<Partial<Record<CheckId, PlcTick>>>(c.ticks ?? {});
  const [viewing, setViewing] = useState<{ doc: PlcDocument; checkId: CheckId } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const canWork = WITH_COMPLIANCE.includes(c.state);

  useEffect(() => setTicks(c.ticks ?? {}), [c.id, c.ticks]);

  /* ── the people on the let ── */
  const [people, setPeople] = useState<PeopleState>({ people: sample?.people ?? [], problem: null, error: null, loading: !sample });
  useEffect(() => {
    if (sample) return;
    let on = true;
    setPeople((p) => ({ ...p, loading: true, error: null }));
    api<{ let: { people: Party[]; landlordProblem: string | null } }>(`/api/applications/${encodeURIComponent(c.applicationRef)}/people`)
      .then((r) => on && setPeople({ people: r.let.people ?? [], problem: r.let.landlordProblem, error: null, loading: false }))
      .catch((e: Error) => on && setPeople({ people: [], problem: null, error: e.message, loading: false }));
    return () => {
      on = false;
    };
  }, [c.applicationRef, sample]);

  const answers = useTenantAnswers(c, sample?.answers ?? data.tenantAnswers, !sample && !perform);

  /* ── the checklist ── */
  const tick = async (checkId: CheckId, ok: boolean | null) => {
    const keys = filesOn(c, checkId).map((d) => d.key);
    const before = ticks;
    const next = { ...ticks };
    if (ok === null) delete next[checkId];
    else next[checkId] = { ok, by: "You", at: new Date().toISOString(), keys };
    setTicks(next);
    if (sample) return;
    try {
      const r = await api<{ ticks: Partial<Record<CheckId, PlcTick>> }>(`/api/plc/${encodeURIComponent(c.id)}/ticks`, {
        method: "POST",
        body: JSON.stringify({ checkId, ok }),
      });
      setTicks(r.ticks);
    } catch (e) {
      setTicks(before);
      say((e as Error).message);
    }
  };

  const progress = (group: Group) => {
    const list = checksFor(group, data);
    let yes = 0;
    let no = 0;
    for (const k of list) {
      const t = ticks[k.id];
      if (!tickHolds(t, filesOn(c, k.id).map((d) => d.key))) continue;
      if (t.ok) yes++;
      else no++;
    }
    return { total: list.length, yes, no, done: yes + no };
  };

  /* ── a file put on by compliance ── */
  const fileInput = useRef<HTMLInputElement | null>(null);
  const target = useRef<{ checkId: CheckId; replaceKey: string | null } | null>(null);
  const pick = (checkId: CheckId, replaceKey: string | null) => {
    target.current = { checkId, replaceKey };
    fileInput.current?.click();
  };
  const upload = async (file: File) => {
    const t = target.current;
    if (!t) return;
    setBusy(t.replaceKey ?? t.checkId);
    say(null);
    try {
      if (sample) {
        sample.attach(c.id, t.checkId, file.name, t.replaceKey);
        await reload();
        return;
      }
      const form = new FormData();
      form.append("file", file);
      form.append("scope", "document");
      form.append("ref", c.applicationRef);
      const up = await fetch("/api/r2/upload", { method: "POST", body: form });
      const stored = await up.json().catch(() => ({}));
      if (!up.ok || !stored.ok) throw new Error(stored.error ?? "The upload failed.");
      /* The dates on it, as the agent's drop reads them. Best effort: a
         reader that is offline still lets the file go on. */
      const read = await api<{ read?: unknown }>(`/api/plc/${encodeURIComponent(c.id)}/read`, {
        method: "POST",
        body: JSON.stringify({ key: stored.key, name: stored.name }),
      })
        .then((r) => r.read ?? null)
        .catch(() => null);
      await api(`/api/plc/${encodeURIComponent(c.id)}/documents`, {
        method: "POST",
        body: JSON.stringify({ compliance: true, checkId: t.checkId, name: stored.name, key: stored.key, read, replaceKey: t.replaceKey }),
      });
      await reload();
    } catch (e) {
      say((e as Error).message);
    } finally {
      setBusy(null);
      target.current = null;
    }
  };

  /* Every file in the order the panel lists them, for Next in the viewer. */
  const order = useMemo(() => {
    const out: { doc: PlcDocument; checkId: CheckId }[] = [];
    for (const g of ["landlord", "tenant"] as Group[]) {
      for (const k of checksFor(g, data)) for (const d of filesOn(c, k.id)) if (!d.placeholder || sample) out.push({ doc: d, checkId: k.id });
    }
    return out;
  }, [data, c, sample]);

  const landlords = people.people.filter((p) => p.role === "landlord");
  const tenants = people.people.filter((p) => p.role === "tenant");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />

      <div className="shrink-0 border-b border-line/60 px-5 py-4 sm:px-7">{head}</div>

      <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:overflow-hidden">
        {/* ── left: who, and their documents ──
            White with outlined boxes (James, 23 Oct 2026): it was dark brown. */}
        <div className="bg-page text-ink lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-line/60" data-plc="split-left">
          <div className="sticky top-0 z-10 bg-page px-4 pb-3 pt-4 sm:px-6">
            <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-line/70 bg-box p-1.5" role="tablist">
              {(["landlord", "tenant"] as Group[]).map((g) => {
                const p = progress(g);
                const on = tab === g;
                return (
                  <button
                    key={g}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setTab(g)}
                    className={`rounded-xl px-3 py-2.5 text-left transition ${on ? "bg-ink text-page" : "text-ink/80 hover:bg-card"}`}
                  >
                    <span className="block text-[14px] font-semibold">{g === "landlord" ? "Landlord" : "Tenant"}</span>
                    <span className={`block text-[11.5px] ${on ? "text-page/70" : "text-muted"}`}>
                      {p.done} of {p.total} checked{p.no ? ` · ${p.no} no` : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3 px-4 pb-6 sm:px-6">
            <PeopleCard
              title={tab === "landlord" ? (landlords.length > 1 ? "Landlords" : "Landlord") : tenants.length > 1 ? "Tenants" : "Tenant"}
              list={tab === "landlord" ? landlords : tenants}
              state={people}
              empty={tab === "landlord" ? people.problem ?? "No landlord is held for this let." : "No tenants are held for this let."}
            />

            <section className="rounded-[18px] border border-line/70 bg-card text-ink">
              <div className="flex items-center justify-between gap-3 border-b border-line/60 px-5 py-4">
                <Head icon="doc" title={tab === "landlord" ? "Landlord Documents" : "Tenant Documents"} />
                <span className="hidden text-[12px] text-muted sm:inline">Is each one right?</span>
              </div>
              <ul>
                {checksFor(tab, data).map((k) => (
                  <CheckRow
                    key={k.id}
                    check={k}
                    c={c}
                    tick={ticks[k.id]}
                    canWork={canWork}
                    busy={busy}
                    onTick={(ok) => void tick(k.id, ok)}
                    onOpen={(doc) => setViewing({ doc, checkId: k.id })}
                    onUpload={(replaceKey) => pick(k.id, replaceKey)}
                  />
                ))}
              </ul>
            </section>

            {tab === "tenant" && (
              <section className="rounded-[18px] border border-line/70 bg-card px-5 py-4 text-ink" data-plc="tenant-answers">
                <Head icon="user" title="Tenant Answers" />
                <p className="mb-3 mt-1.5 text-[12px] text-muted">What the tenants told us, in the order the Propoly deal asks for it.</p>
                <TenantAnswersBody state={answers} />
              </section>
            )}
          </div>
        </div>

        {/* ── right: the AI summary, then the decision ── */}
        <div className="px-4 py-5 sm:px-6 lg:min-h-0 lg:overflow-y-auto" data-plc="split-right">
          <ComplianceSide data={data} reload={reload} say={say} perform={perform} onDecided={onDecided} split={{ summary: sample?.summary ?? null }} />
          {after}
        </div>
      </div>

      {viewing && (
        <DocViewer
          doc={viewing.doc}
          check={data.checks.find((k) => k.id === viewing.checkId) ?? null}
          tick={ticks[viewing.checkId]}
          keys={filesOn(c, viewing.checkId).map((d) => d.key)}
          canWork={canWork}
          onTick={(ok) => void tick(viewing.checkId, ok)}
          onClose={() => setViewing(null)}
          next={(() => {
            const i = order.findIndex((o) => o.doc.key === viewing.doc.key);
            return i >= 0 && i < order.length - 1 ? () => setViewing(order[i + 1]) : null;
          })()}
          prev={(() => {
            const i = order.findIndex((o) => o.doc.key === viewing.doc.key);
            return i > 0 ? () => setViewing(order[i - 1]) : null;
          })()}
          position={(() => {
            const i = order.findIndex((o) => o.doc.key === viewing.doc.key);
            return i >= 0 ? `${i + 1} of ${order.length}` : null;
          })()}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────── the people ────────────────────────────── */

function PeopleCard({ title, list, state, empty }: { title: string; list: Party[]; state: PeopleState; empty: string }) {
  return (
    <section className="rounded-[18px] border border-line/70 bg-card px-5 py-4 text-ink">
      <Head icon="user" title={title} />
      {state.loading ? (
        <div className="mt-3 flex items-center gap-3 text-[13px] text-muted" role="status">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent-dark" />
          Reading who is on the let…
        </div>
      ) : state.error ? (
        <div className="mt-3">
          <Note>{state.error}</Note>
        </div>
      ) : list.length === 0 ? (
        <p className="mt-2 text-[13px] text-muted">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {list.map((p) => (
            <li key={p.key} className="rounded-xl border border-line/60 bg-white">
              <div className="flex items-center gap-2 border-b border-line/60 py-1.5 pl-3.5 pr-1.5">
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{p.name}</span>
                {p.isPrimary && p.role === "tenant" && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-dark">Lead</span>}
                <CopyButton value={p.name} label="name" />
              </div>
              {(
                [
                  ["Email", p.email],
                  ["Phone", p.phone],
                  ["Address", p.address],
                ] as const
              )
                .filter(([, v]) => v)
                .map(([label, v]) => (
                  <div key={label} className="flex items-center gap-2 py-1 pl-3.5 pr-1.5 text-[13px]">
                    <span className="w-16 shrink-0 text-[12px] text-muted">{label}</span>
                    <span className="min-w-0 flex-1 break-words">{v}</span>
                    <CopyButton value={v!} label={label.toLowerCase()} />
                  </div>
                ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ────────────────────────────── one check ──────────────────────────────── */

function YesNo({ tick, keys, disabled, onTick, size = "sm" }: { tick: PlcTick | undefined; keys: string[]; disabled: boolean; onTick: (ok: boolean | null) => void; size?: "sm" | "lg" }) {
  const held = tickHolds(tick, keys) ? tick : undefined;
  const pad = size === "lg" ? "px-4 py-2 text-[13px]" : "px-3 py-1.5 text-[12px]";
  return (
    <div className="inline-flex shrink-0 rounded-full border border-line/80 bg-white p-0.5" role="group" aria-label="Is it right?">
      <button
        type="button"
        disabled={disabled}
        aria-pressed={held?.ok === true}
        onClick={() => onTick(held?.ok === true ? null : true)}
        className={`rounded-full font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${pad} ${held?.ok === true ? "bg-[#56634a] text-white" : "text-ink hover:bg-[#f1f4ec]"}`}
      >
        Yes
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={held?.ok === false}
        onClick={() => onTick(held?.ok === false ? null : false)}
        className={`rounded-full font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${pad} ${held?.ok === false ? "bg-[#c0504a] text-white" : "text-ink hover:bg-[#fdefec]"}`}
      >
        No
      </button>
    </div>
  );
}

function CheckRow({
  check,
  c,
  tick,
  canWork,
  busy,
  onTick,
  onOpen,
  onUpload,
}: {
  check: Check;
  c: PlcCase;
  tick: PlcTick | undefined;
  canWork: boolean;
  busy: string | null;
  onTick: (ok: boolean | null) => void;
  onOpen: (d: PlcDocument) => void;
  onUpload: (replaceKey: string | null) => void;
}) {
  const files = filesOn(c, check.id);
  const keys = files.map((d) => d.key);
  const waived = (c.waivers ?? []).find((w) => w.checkId === check.id);
  const held = tickHolds(tick, keys) ? tick : undefined;
  const stale = tick && !held;
  const tone = held ? (held.ok ? "bg-[#f1f4ec]/60" : "bg-[#fdefec]/60") : "";
  const dot = held ? (held.ok ? "bg-[#56634a]" : "bg-[#c0504a]") : files.length ? "bg-line" : waived ? "bg-line" : "bg-[#c0504a]";

  return (
    <li className={`border-b border-line/60 px-5 py-3 last:border-0 ${tone}`} data-check={check.id} data-tick={held ? (held.ok ? "yes" : "no") : ""}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-ink">{check.label}</p>
          {files.length === 0 ? (
            <p className="mt-0.5 text-[12.5px] text-muted">{waived ? `Not needed, says ${waived.by}: "${waived.reason}"` : "Nothing filed"}</p>
          ) : (
            <ul className="mt-1.5 space-y-1.5">
              {files.map((d) => {
                const late = Boolean(d.read?.expiryDate && c.moveInDate && d.read.expiryDate < c.moveInDate);
                return (
                  <li key={d.key} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <button
                      type="button"
                      onClick={() => onOpen(d)}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-page px-2.5 py-1 text-left text-[12.5px] font-medium text-ink transition hover:bg-accent-soft hover:text-accent-dark"
                      title="Open it here"
                    >
                      <DoodleIcon name="doc" size={12} />
                      <span className="truncate">{docTitle(d)}</span>
                    </button>
                    {d.read?.expiryDate && (
                      <span className={`text-[11.5px] ${late ? "font-semibold text-[#c0504a]" : "text-muted"}`}>
                        valid until {prettyDate(d.read.expiryDate)}
                      </span>
                    )}
                    {d.placeholder && <span className="text-[11.5px] text-muted">name only, no file attached</span>}
                    {canWork && (
                      <button
                        type="button"
                        onClick={() => onUpload(d.key)}
                        disabled={busy === d.key}
                        className="text-[11.5px] text-muted underline underline-offset-2 hover:text-ink disabled:opacity-50"
                      >
                        {busy === d.key ? "Uploading…" : "Replace"}
                      </button>
                    )}
                    {d.replaces && (
                      <span className="w-full text-[11.5px] text-muted">
                        {d.addedBy} put this on {prettyWhen(d.replaces.at)} in place of &ldquo;{d.replaces.name}&rdquo; from {d.replaces.addedBy}
                      </span>
                    )}
                    {!d.replaces && d.byCompliance && <span className="w-full text-[11.5px] text-muted">Added by {d.addedBy}, {prettyWhen(d.addedAt)}</span>}
                  </li>
                );
              })}
            </ul>
          )}
          {stale && <p className="mt-1 text-[11.5px] text-amber-700">The files changed since this was ticked. Check it again.</p>}
          {held && (
            <p className="mt-1 text-[11.5px] text-muted">
              {held.ok ? "Yes" : "No"}, {held.by} {prettyWhen(held.at)}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <YesNo tick={tick} keys={keys} disabled={!canWork} onTick={onTick} />
          {canWork && (
            <button
              type="button"
              onClick={() => onUpload(null)}
              disabled={busy === check.id}
              className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-accent-dark hover:underline disabled:opacity-50"
            >
              <DoodleIcon name="upload" size={11} />
              {busy === check.id ? "Uploading…" : files.length ? "Add another" : "Upload"}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

/* ───────────────────────────── the pop-up viewer ───────────────────────── */

function DocViewer({
  doc,
  check,
  tick,
  keys,
  canWork,
  onTick,
  onClose,
  next,
  prev,
  position,
}: {
  doc: PlcDocument;
  check: Check | null;
  tick: PlcTick | undefined;
  keys: string[];
  canWork: boolean;
  onTick: (ok: boolean | null) => void;
  onClose: () => void;
  next: (() => void) | null;
  prev: (() => void) | null;
  position: string | null;
}) {
  /* Escape closes the file, not the whole pack behind it: caught first and stopped. */
  const close = useCallback(() => onClose(), [onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        close();
      } else if (e.key === "ArrowRight" && next) next();
      else if (e.key === "ArrowLeft" && prev) prev();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [close, next, prev]);

  const [loaded, setLoaded] = useState(false);
  useEffect(() => setLoaded(false), [doc.key]);

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-[#2b201d]/70 p-0 sm:p-6" onClick={onClose} role="dialog" aria-modal="true" aria-label={docTitle(doc)}>
      <div className="flex w-full max-w-[1100px] flex-col overflow-hidden bg-page shadow-2xl sm:rounded-[22px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-3 border-b border-line/60 px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-ink">{docTitle(doc)}</p>
            <p className="truncate text-[12px] text-muted">
              {check?.label ?? doc.checkId}
              {doc.read?.expiryDate ? ` · valid until ${prettyDate(doc.read.expiryDate)}` : ""} · {doc.addedBy}, {prettyDate(doc.addedAt)}
              {position ? ` · ${position}` : ""}
            </p>
          </div>
          {!doc.placeholder && (
            <a
              href={saveUrl(doc.url)}
              className="inline-flex items-center gap-1.5 rounded-full border border-line/80 bg-card px-4 py-2 text-[13px] font-semibold text-ink transition hover:border-ink/40"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19h14" />
              </svg>
              Download
            </a>
          )}
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-xl text-muted transition hover:bg-card hover:text-ink">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="relative min-h-0 flex-1 bg-[#efe9e4]">
          {doc.placeholder ? (
            <div className="flex h-full min-h-[50vh] items-center justify-center p-8 text-center text-[13.5px] text-muted">
              Only the name is on the pack: no file was stored for this one.
            </div>
          ) : (
            <>
              {!loaded && (
                <div className="absolute inset-0 flex items-center justify-center gap-3 text-[13px] text-muted" role="status">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent-dark" />
                  Opening the file…
                </div>
              )}
              {isImage(doc.name) ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={doc.url} alt={docTitle(doc)} onLoad={() => setLoaded(true)} className="mx-auto h-full max-h-[calc(100vh-180px)] w-auto object-contain" />
              ) : (
                <iframe key={doc.key} src={doc.url} title={docTitle(doc)} onLoad={() => setLoaded(true)} className="h-full min-h-[60vh] w-full border-0" />
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-line/60 px-4 py-3 sm:px-5">
          <span className="text-[13px] font-semibold text-ink">Is this right?</span>
          <YesNo tick={tick} keys={keys} disabled={!canWork} onTick={onTick} size="lg" />
          <span className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => prev?.()} disabled={!prev} className="rounded-full border border-line/80 bg-card px-4 py-2 text-[13px] font-semibold text-ink transition hover:border-ink/40 disabled:opacity-40">
              Previous
            </button>
            <button type="button" onClick={() => next?.()} disabled={!next} className="rounded-full border border-transparent bg-accent-dark px-4 py-2 text-[13px] font-semibold text-white transition hover:opacity-90 disabled:opacity-40">
              Next file
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
