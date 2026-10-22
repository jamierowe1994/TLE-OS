"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";
import { LET_TYPES } from "@/lib/let-type";
import type { TakeOn, TakeOnPush, TakeOnPushStep } from "@/lib/take-ons";

/**
 * A MANAGEMENT TRANSFER, ITS OWN PAGE (lib/take-ons, 19 Oct 2026).
 *
 * Where the agent lands after Take it on, and where the home's Management
 * transfer tile goes: who was taken on, the onboarding letters ticked off as
 * they go (recorded against the take-on, never sent from here), and what the
 * deal in Propoly needs. The office sends it to Propoly and adds it to the
 * listing system from here (lib/take-on-push): rehearsed until each push's
 * own switch is on, every step shown as Done, Would do or Failed with the
 * other system's own reason.
 */

const COMMS: { key: string; to: string; label: string; sub: string }[] = [
  { key: "landlord_welcome", to: "Landlord", label: "Welcome and terms to the landlord", sub: "Our terms signed, what happens next, who their agent is" },
  { key: "landlord_bank", to: "Landlord", label: "Landlord's bank details and ID", sub: "For rent to be paid out to them" },
  { key: "previous_agent_handover", to: "Previous agent", label: "Handover pack from the previous agent", sub: "Keys, inventory, certificates, deposit, rent statement" },
  { key: "tenants_intro", to: "Tenants", label: "Introduction to the tenants", sub: "We now manage the home, and how to reach us" },
  { key: "tenants_rent", to: "Tenants", label: "New rent payment details to the tenants", sub: "Where the rent goes from the take-over date" },
  { key: "tenants_deposit", to: "Tenants", label: "Deposit protection to the tenants", sub: "The scheme, the certificate and the prescribed information" },
  { key: "tenants_logins", to: "Tenants", label: "Tenant logins sent", sub: "So they can report repairs (Send out logins on the home)" },
];
const DEPOSIT: Record<string, string> = {
  previous_agent: "With the previous agent, to come to us",
  scheme: "Already in a scheme, to be transferred",
  landlord: "With the landlord",
  none: "No deposit was taken",
};
const box = "rounded-2xl border border-line/70 bg-white";

type PushFlags = { propolyLive: boolean; rexLive: boolean; canPush: boolean };

const STEP_CHIP: Record<TakeOnPushStep["state"], { label: string; cls: string }> = {
  done: { label: "Done", cls: "bg-accent-soft text-accent-dark" },
  would: { label: "Would do", cls: "bg-card text-muted" },
  failed: { label: "Failed", cls: "bg-red-50 text-red-700" },
  blocked: { label: "Waiting", cls: "bg-amber-50 text-amber-800" },
  skipped: { label: "Skipped", cls: "bg-card text-muted" },
};
const RUN_WORDS: Record<TakeOnPush["status"], string> = {
  running: "Running now",
  done: "Sent",
  would: "Rehearsed: nothing was sent",
  failed: "Some steps failed",
  blocked: "Waiting on something below",
};
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

/**
 * The last push of a take-on, step by step, and the button that sends it.
 * Only the office sees the button; everyone sees how far it got.
 */
function PushPanel(p: {
  system: "propoly" | "rex";
  run: TakeOnPush | null;
  live: boolean;
  canPush: boolean;
  busy: boolean;
  error: string | null;
  onPush: (newProperty?: boolean) => void;
}) {
  const verb = p.system === "propoly" ? "Send to Propoly" : "Add to the Listing System";
  const unsure = p.run?.steps.some((s) => s.id === "property" && s.state !== "done" && Array.isArray((s.request as { candidates?: unknown } | undefined)?.candidates));
  return (
    <div className="mt-4">
      {p.run && (
        <div className="rounded-xl border border-line/60 p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[12.5px] font-semibold">{p.run.mode === "live" ? RUN_WORDS[p.run.status] : p.run.status === "running" ? "Rehearsing now" : RUN_WORDS.would}</p>
            <p className="text-[11px] text-muted">{p.run.by}, {when(p.run.finishedAt ?? p.run.at)}</p>
          </div>
          <ul className="mt-2 space-y-2">
            {p.run.steps.map((s, i) => (
              <li key={`${s.id}-${i}`} className="text-[12px]">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 font-semibold">{s.label}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${STEP_CHIP[s.state].cls}`}>{STEP_CHIP[s.state].label}</span>
                </div>
                <p className="mt-0.5 leading-relaxed text-muted">{s.detail}</p>
                {s.reason && <p className="mt-0.5 break-words leading-relaxed text-red-700">{p.system === "propoly" ? "Propoly said" : "The listing system said"}: {s.reason}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {p.error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-[12px] text-red-700">{p.error}</p>}
      {p.canPush ? (
        <div className="mt-3 space-y-2">
          <button
            type="button"
            disabled={p.busy}
            onClick={() => p.onPush(false)}
            className={`btn-press flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-[12.5px] font-semibold ${p.live ? "bg-ink text-page" : "border border-line bg-white text-ink hover:border-ink"} ${p.busy ? "opacity-60" : ""}`}
          >
            {p.busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-accent-dark" />}
            {p.busy ? (p.live ? "Sending…" : "Rehearsing…") : p.live ? verb : `Rehearse ${verb}`}
          </button>
          {p.system === "propoly" && unsure && !p.busy && (
            <button type="button" onClick={() => p.onPush(true)} className="w-full rounded-full border border-line bg-white px-4 py-2 text-[12px] font-semibold text-muted hover:border-ink hover:text-ink">
              None of the Close Matches: It&apos;s a New Home
            </button>
          )}
          {!p.live && <p className="text-[11.5px] leading-relaxed text-muted">Not switched on yet, so this rehearses: it looks everything up and says what it would do, and nothing is sent.</p>}
        </div>
      ) : (
        <p className="mt-3 text-[11.5px] leading-relaxed text-muted">{p.live ? "The office sends this on from here." : "Not switched on yet. Until it is, the office keys this in by hand."}</p>
      )}
    </div>
  );
}
const eyebrow = "text-[10.5px] font-semibold uppercase tracking-wide text-muted";
const day = (iso: string | null | undefined) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Not given");
const pounds = (n: number | null | undefined) => (n == null ? "Not given" : `£${n.toLocaleString("en-GB")}`);

export default function TakeOnPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<{ status: "loading" } | { status: "failed"; error: string } | { status: "ready"; t: TakeOn; held: boolean; push: PushFlags }>({ status: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [pushError, setPushError] = useState<{ system: "propoly" | "rex"; text: string } | null>(null);

  const ready = (j: { takeOn: TakeOn; held?: boolean; push?: Partial<PushFlags> }) =>
    setState({ status: "ready", t: j.takeOn, held: j.held !== false, push: { propolyLive: j.push?.propolyLive === true, rexLive: j.push?.rexLive === true, canPush: j.push?.canPush === true } });

  const load = useCallback(() => {
    fetch(`/api/take-ons?id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => (j?.ok && j.takeOn ? ready(j) : setState({ status: "failed", error: j?.error ?? "This take-on couldn't be read." })))
      .catch(() => setState({ status: "failed", error: "This take-on couldn't be read just now." }));
  }, [id]);
  useEffect(load, [load]);

  async function tick(key: string, done: boolean) {
    setBusy(key);
    const j = await fetch("/api/take-ons", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, comm: key, done }) })
      .then((r) => r.json()).catch(() => null);
    setBusy(null);
    if (j?.ok && j.takeOn) ready(j);
  }

  /* A push can take a minute: Propoly's homes are read a page at a time. */
  async function push(system: "propoly" | "rex", newProperty = false) {
    setBusy(`push:${system}`);
    setPushError(null);
    const j = await fetch("/api/take-ons/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, system, newProperty }) })
      .then((r) => r.json()).catch(() => null);
    setBusy(null);
    if (j?.ok && j.takeOn) ready(j);
    else setPushError({ system, text: j?.error ?? "That couldn't be sent just now. Try again in a minute." });
  }

  if (state.status === "loading") {
    return (
      <div className="flex items-center gap-3 py-16 text-[13px] text-muted">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent-dark" />
        Reading the take-on…
      </div>
    );
  }
  if (state.status === "failed") {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="text-[15px]">{state.error}</p>
        <Link href="/portfolio" className="mt-4 inline-block text-[12.5px] underline">Back to Properties</Link>
      </div>
    );
  }
  const { t } = state;
  const done = t.comms.filter((c) => c.doneAt).length;
  const referenced = t.tenants.filter((x) => x.reference);
  const address = [t.line1, t.town, t.postcode].filter(Boolean).join(", ");
  const deal: Array<[string, string]> = [
    ["Landlord", [t.landlord.name, t.landlord.email].filter(Boolean).join(", ")],
    ["Property", address],
    ["Service", t.service === "managed" ? "Fully managed" : "Rent collection"],
    ["Rent", t.tenancy.rentPcm != null ? `${pounds(t.tenancy.rentPcm)} a month` : "Not given"],
    ["Tenancy start", day(t.tenancy.startedOn)],
    ["Deposit", t.tenancy.depositPounds != null ? `${pounds(t.tenancy.depositPounds)}, ${DEPOSIT[t.tenancy.depositHeld]?.toLowerCase() ?? ""}` : DEPOSIT[t.tenancy.depositHeld] ?? "Not given"],
    ["Holding fee", "Not required"],
    ...t.tenants.map((x) => [x.name, x.reference ? "Reference required" : "No references"] as [string, string]),
  ];

  return (
    <div className="space-y-5">
      <Link href="/portfolio" className="inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-ink">
        <span aria-hidden>←</span> Properties
      </Link>

      <section className={`${box} p-5 sm:p-6`}>
        <div className="flex flex-wrap items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark"><DoodleIcon name="pack/house" size={20} /></span>
          <div className="min-w-[200px] flex-1">
            <p className={eyebrow}>Management transfer</p>
            <h1 className="mt-1 text-[24px] font-normal leading-tight tracking-normal">{t.line1}</h1>
            <p className="mt-1 text-[13px] text-muted">{[t.town, t.postcode].filter(Boolean).join(" ")}</p>
            <p className="mt-2 text-[12.5px] text-muted">Taken on by {t.by} on {day(t.at)}. We take over on {day(t.takeoverOn)}{t.previousAgent ? `, from ${t.previousAgent}` : ""}.</p>
          </div>
          <Link href={`/portfolio/${encodeURIComponent(t.homeRef)}`} className="btn-press w-full shrink-0 rounded-full bg-ink px-5 py-2.5 text-center text-[12.5px] font-semibold text-page sm:w-auto">Open the home →</Link>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* ── onboarding ─────────────────────────────────────────────── */}
        <section className={`${box} p-5 sm:p-6`}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[17px] font-normal tracking-normal">Onboarding</h2>
            <span className="text-[12px] text-muted">{done} of {t.comms.length} done</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line/60">
            <div className="h-full rounded-full bg-accent-dark transition-[width] duration-500" style={{ width: `${(done / Math.max(1, t.comms.length)) * 100}%` }} />
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-muted">Tick each one when it has gone. Nothing is sent from here: it records who sent it and when, against this take-on.</p>
          <ul className="mt-4 divide-y divide-line/60">
            {COMMS.map((c) => {
              const rec = t.comms.find((x) => x.key === c.key);
              const isDone = Boolean(rec?.doneAt);
              return (
                <li key={c.key} className="flex items-start gap-3 py-3">
                  <button
                    type="button"
                    disabled={busy === c.key}
                    onClick={() => void tick(c.key, !isDone)}
                    aria-label={isDone ? `Mark ${c.label} as not sent` : `Mark ${c.label} as sent`}
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${isDone ? "border-accent-dark bg-accent-dark text-white" : "border-line bg-white hover:border-ink"} ${busy === c.key ? "opacity-50" : ""}`}
                  >
                    {isDone && <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={`text-[13px] font-semibold ${isDone ? "text-muted line-through decoration-line" : ""}`}>{c.label}</p>
                    <p className="text-[11.5px] text-muted">{isDone ? `Done by ${rec?.by} on ${day(rec?.doneAt)}` : c.sub}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-card px-2.5 py-1 text-[10.5px] font-semibold text-muted">{c.to}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="space-y-5">
          {/* ── who ──────────────────────────────────────────────────── */}
          <section className={`${box} p-5`}>
            <p className={eyebrow}>Landlord</p>
            <p className="mt-1 text-[14px] font-semibold">{t.landlord.name}</p>
            <p className="text-[12.5px] text-muted">{[t.landlord.email, t.landlord.phone].filter(Boolean).join(" · ") || "No email or mobile yet"}</p>
            <p className="mt-1 text-[12px] text-muted">{t.service === "managed" ? "Fully managed" : "Rent collection"}{t.feePct != null ? `, ${t.feePct}% of the rent` : ""}</p>
            <p className={`${eyebrow} mt-5`}>Tenants</p>
            <ul className="mt-1 space-y-2">
              {t.tenants.map((x) => (
                <li key={x.name} className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-semibold">{x.name}</span>
                    <span className="block truncate text-[12px] text-muted">{[x.email, x.phone].filter(Boolean).join(" · ") || "No email or mobile yet"}</span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${x.reference ? "bg-accent-soft text-accent-dark" : "bg-card text-muted"}`}>{x.reference ? "To be referenced" : "No references"}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-5 grid gap-1.5 text-[12.5px]">
              {([
                ["Tenancy started", day(t.tenancy.startedOn)],
                ["Rent", t.tenancy.rentPcm != null ? `${pounds(t.tenancy.rentPcm)} a month` : "Not given"],
                ["Deposit", t.tenancy.depositPounds != null ? pounds(t.tenancy.depositPounds) : "Not given"],
                ["Deposit is", DEPOSIT[t.tenancy.depositHeld] ?? "Not given"],
                ["Term", t.tenancy.periodic ? "Rolling month to month" : t.tenancy.endsOn ? `Fixed until ${day(t.tenancy.endsOn)}` : "Not given"],
                ["Type of let", LET_TYPES.find((l) => l.value === t.letType)?.label ?? "Residential"],
              ] as Array<[string, string]>).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            {t.note && <p className="mt-4 rounded-xl bg-card px-3 py-2.5 text-[12.5px] leading-relaxed">{t.note}</p>}
          </section>

          {/* ── Propoly ──────────────────────────────────────────────── */}
          <section className={`${box} p-5`}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[17px] font-normal tracking-normal">The Deal in Propoly</h2>
              <span className="rounded-full bg-card px-2.5 py-1 text-[10.5px] font-semibold text-muted">{state.push.propolyLive ? "Switched on" : "Keyed by hand for now"}</span>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-muted">
              {referenced.length
                ? `What to put in Propoly. ${referenced.map((x) => x.name).join(", ")} ${referenced.length === 1 ? "is" : "are"} referenced; everyone else is added with no references.`
                : "What to put in Propoly. Nobody is referenced: every tenant is added with no references."}
            </p>
            <dl className="mt-3 grid gap-1.5 text-[12.5px]">
              {deal.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-muted">{k}</dt>
                  <dd className="min-w-0 break-words text-right font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            <PushPanel
              system="propoly"
              run={t.propolyPush}
              live={state.push.propolyLive}
              canPush={state.push.canPush}
              busy={busy === "push:propoly"}
              error={pushError?.system === "propoly" ? pushError.text : null}
              onPush={(newProperty) => void push("propoly", newProperty)}
            />
          </section>

          {/* ── the listing system ───────────────────────────────────── */}
          <section className={`${box} p-5`}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[17px] font-normal tracking-normal">In the Listing System</h2>
              <span className="rounded-full bg-card px-2.5 py-1 text-[10.5px] font-semibold text-muted">{state.push.rexLive ? "Switched on" : "Rehearsal only"}</span>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-muted">
              The landlord and each tenant added as people (found by email first, so nobody is added twice){/^\d+$/.test(t.homeRef) ? ". The home is already there and is left as it is." : ", and the home added with the landlord as its owner."}
            </p>
            <PushPanel
              system="rex"
              run={t.rexPush}
              live={state.push.rexLive}
              canPush={state.push.canPush}
              busy={busy === "push:rex"}
              error={pushError?.system === "rex" ? pushError.text : null}
              onPush={() => void push("rex")}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
