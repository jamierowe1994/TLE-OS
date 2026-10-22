"use client";

import { useCallback, useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import AddressField from "@/components/AddressField";

/**
 * Guarantors, wherever an applicant is (Lorna Fieldson, 15 Oct 2026): on the
 * tenant lead, on the let in Applications, on the home in Portfolio. The same
 * box in all three, reading the same rows (lib/guarantors), so one typed on
 * the lead is already on the let and the home. Kept in the OS only.
 *
 * Adding one is three short screens and a check (memory: forms in grouped
 * steps): who they are for, who they are, where they live.
 */

export interface GuarantorRow {
  id: string;
  applicantName: string;
  applicantEmail: string | null;
  name: string;
  email: string;
  phone: string;
  relationship: string;
  address: string;
  createdBy: string;
  createdAt: string;
}

type Source = { lead: string } | { let: string } | { listing: string };
type Applicant = { name: string; email: string | null };
type Draft = { applicant: number; name: string; email: string; phone: string; relationship: string; address: string };

const RELATIONSHIPS = ["Parent", "Family member", "Partner", "Friend", "Employer", "Other"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const query = (s: Source) =>
  "lead" in s ? `lead=${encodeURIComponent(s.lead)}` : "let" in s ? `let=${encodeURIComponent(s.let)}` : `listing=${encodeURIComponent(s.listing)}`;

export default function Guarantors({
  source,
  title = "Guarantors",
  className = "",
  onChange,
}: {
  source: Source;
  title?: string;
  className?: string;
  /** Told the guarantors as they now stand, so what goes to Propoly can follow (components/LetPropoly). */
  onChange?: (signature: string) => void;
}) {
  const [rows, setRows] = useState<GuarantorRow[] | null>(null);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<GuarantorRow | "new" | null>(null);
  const key = query(source);

  const load = useCallback(() => {
    let live = true;
    setError(null);
    fetch(`/api/guarantors?${key}`, { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; guarantors?: GuarantorRow[]; applicants?: Applicant[] };
        if (!live) return;
        if (!r.ok || !j.ok) { setError(j.error ?? "The guarantors couldn't be read just now."); setRows([]); return; }
        setRows(j.guarantors ?? []);
        setApplicants(j.applicants ?? []);
      })
      .catch(() => { if (live) { setError("The guarantors couldn't be read just now."); setRows([]); } });
    return () => { live = false; };
  }, [key]);
  useEffect(() => load(), [load]);
  const signature = rows ? rows.map((g) => `${g.id}:${g.name}:${g.email}:${g.phone}`).join("|") : null;
  useEffect(() => { if (signature !== null) onChange?.(signature); }, [signature, onChange]);

  async function remove(g: GuarantorRow) {
    if (!window.confirm(`Take ${g.name} off as a guarantor?`)) return;
    const r = await fetch("/api/guarantors", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...source, id: g.id }) });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; guarantors?: GuarantorRow[] };
    if (!r.ok || !j.ok) { setError(j.error ?? "That didn't save. Try again."); return; }
    setRows(j.guarantors ?? []);
  }

  const many = applicants.length > 1;
  return (
    <div className={className} data-steve="guarantors">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{title}</p>
        {rows !== null && applicants.length > 0 && (
          <button type="button" onClick={() => setEditing("new")} className="inline-flex items-center gap-1.5 rounded-full border border-accent-dark/50 bg-white px-3 py-1 text-[11.5px] font-semibold text-accent-dark transition-colors hover:bg-accent-soft">
            + Add a guarantor
          </button>
        )}
      </div>
      {rows === null ? (
        <p className="mt-2 flex items-center gap-2 text-[12px] text-muted">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />
          Reading the guarantors…
        </p>
      ) : error && !rows.length ? (
        <p className="mt-2 text-[12px] text-accent-dark">{error}</p>
      ) : !rows.length ? (
        <p className="mt-2 rounded-xl border border-dashed border-line/80 px-3.5 py-2.5 text-[12px] text-muted">
          {applicants.length ? "No guarantor yet. Add one if they need it for referencing." : "No applicant on this record yet, so there is nobody to add a guarantor for."}
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {rows.map((g) => (
            <li key={g.id} className="rounded-xl border border-line/60 bg-white px-3.5 py-3 text-[12.5px]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{g.name}</p>
                  <p className="text-[11.5px] text-muted">
                    {[g.relationship, `for ${g.applicantName || "the applicant"}`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button type="button" onClick={() => setEditing(g)} className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-accent-dark hover:bg-accent-soft">Change</button>
                  <button type="button" onClick={() => void remove(g)} className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-muted hover:text-ink">Remove</button>
                </div>
              </div>
              <div className="mt-1.5 grid gap-x-4 gap-y-0.5 text-[12px] sm:grid-cols-2">
                {g.phone && <a href={`tel:${g.phone.replace(/\s/g, "")}`} className="flex items-center gap-1.5 hover:underline"><DoodleIcon name="call" size={11} className="text-muted" />{g.phone}</a>}
                {g.email && <a href={`mailto:${g.email}`} className="flex min-w-0 items-center gap-1.5 hover:underline"><DoodleIcon name="mail" size={11} className="text-muted" /><span className="truncate">{g.email}</span></a>}
                {g.address && <span className="flex items-start gap-1.5 sm:col-span-2"><DoodleIcon name="home" size={11} className="mt-0.5 text-muted" />{g.address}</span>}
              </div>
            </li>
          ))}
          {error && <li className="text-[12px] text-accent-dark">{error}</li>}
        </ul>
      )}

      {editing && (
        <GuarantorForm
          source={source}
          applicants={applicants}
          many={many}
          existing={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(list) => { setRows(list); setEditing(null); }}
        />
      )}
    </div>
  );
}

function GuarantorForm({
  source,
  applicants,
  many,
  existing,
  onClose,
  onSaved,
}: {
  source: Source;
  applicants: Applicant[];
  many: boolean;
  existing: GuarantorRow | null;
  onClose: () => void;
  onSaved: (rows: GuarantorRow[]) => void;
}) {
  const startAt = existing
    ? Math.max(0, applicants.findIndex((a) => (existing.applicantEmail ? a.email?.toLowerCase() === existing.applicantEmail : a.name === existing.applicantName)))
    : 0;
  const [d, setD] = useState<Draft>({
    applicant: startAt,
    name: existing?.name ?? "",
    email: existing?.email ?? "",
    phone: existing?.phone ?? "",
    relationship: existing?.relationship ?? "",
    address: existing?.address ?? "",
  });
  const [step, setStep] = useState(existing ? 3 : 0);
  const [dir, setDir] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const who = applicants[d.applicant] ?? applicants[0];
  const first = (who?.name ?? "them").split(/\s+/)[0];
  const emailBad = Boolean(d.email.trim()) && !EMAIL.test(d.email.trim());
  const phoneBad = Boolean(d.phone.trim()) && d.phone.replace(/\D/g, "").length < 7;
  const steps = [
    { title: "Who They're For", blurb: many ? "Pick the applicant, and how the guarantor knows them." : `How the guarantor knows ${first}.`, ok: Boolean(who) },
    { title: "The Guarantor", blurb: "Their name, and how to reach them.", ok: Boolean(d.name.trim()) && !emailBad && !phoneBad },
    { title: "Where They Live", blurb: "Referencing needs their home address. Leave it for now if you don't have it.", ok: true },
    { title: "Check and Save", blurb: "Kept on the file in the OS. Nothing is sent to anyone.", ok: true },
  ];
  const go = (to: number) => { setDir(to > step ? 1 : -1); setStep(to); setMsg(null); };
  const next = () => { if (steps[step].ok && step < steps.length - 1) go(step + 1); };

  async function save() {
    if (busy || !who) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/guarantors", {
        method: existing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...source,
          ...(existing ? { id: existing.id } : {}),
          guarantor: { applicantName: who.name, applicantEmail: who.email, name: d.name, email: d.email, phone: d.phone, relationship: d.relationship, address: d.address },
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; guarantors?: GuarantorRow[] };
      if (!r.ok || !j.ok) { setMsg(j.error ?? "That didn't save. Try again."); setBusy(false); return; }
      onSaved(j.guarantors ?? []);
    } catch {
      setMsg("That didn't save. Check your connection and try again.");
      setBusy(false);
    }
  }

  const field = "mt-1 w-full rounded-xl border border-line/80 bg-white px-3 py-2 text-[13px] outline-none focus:border-ink/40";
  const label = "block text-[11px] font-semibold text-muted";
  const S = steps[step];

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4">
      <button type="button" aria-label="Cancel" onClick={() => !busy && onClose()} className="absolute inset-0 cursor-default bg-ink/45" />
      <div role="dialog" aria-label={existing ? "Change a guarantor" : "Add a guarantor"} className="fade-up relative flex max-h-[calc(100dvh-10rem)] sm:max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-line/80 bg-page shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
        <div className="h-1 bg-line/50">
          <div className="h-full bg-accent-dark transition-[width] duration-300" style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
        </div>
        <div
          key={step}
          className="min-h-0 flex-1 overflow-y-auto px-6 pb-2 pt-5"
          style={{ animation: "slideIn 340ms cubic-bezier(0.22,1,0.36,1) both", ["--from" as string]: `${dir * 28}px` }}
          onKeyDown={(e) => { if (e.key === "Enter" && step < 3 && (e.target as HTMLElement).tagName === "INPUT") { e.preventDefault(); next(); } }}
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{step + 1} of {steps.length}</p>
          <h2 className="mt-1 text-[20px] font-normal tracking-normal">{existing && step === 3 ? "Change a Guarantor" : S.title}</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{S.blurb}</p>

          {step === 0 && (
            <div className="mt-4 space-y-4">
              {many && (
                <div>
                  <span className={label}>Guarantor for</span>
                  <div className="mt-1.5 space-y-1.5">
                    {applicants.map((a, i) => (
                      <button key={`${a.email ?? a.name}-${i}`} type="button" onClick={() => setD({ ...d, applicant: i })} aria-pressed={d.applicant === i}
                        className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-[13px] ${d.applicant === i ? "border-accent-dark bg-accent-soft/60" : "border-line/70 bg-white hover:border-ink/30"}`}>
                        <span className="font-semibold">{a.name}</span>
                        <span className="truncate pl-3 text-[11px] text-muted">{a.email ?? "No email"}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <span className={label}>How they know {first}</span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {RELATIONSHIPS.map((r) => (
                    <button key={r} type="button" onClick={() => setD({ ...d, relationship: d.relationship === r ? "" : r })} aria-pressed={d.relationship === r}
                      className={`rounded-full border px-3 py-1.5 text-[12px] ${d.relationship === r ? "border-accent-dark bg-accent-dark text-white" : "border-line/80 bg-white hover:border-ink/30"}`}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="mt-4 space-y-3">
              <label className="block"><span className={label}>Full name</span><input autoFocus value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} className={field} placeholder="As on their ID" /></label>
              <label className="block"><span className={label}>Email</span><input type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} className={field} placeholder="name@example.com" />
                {emailBad && <span className="mt-1 block text-[11px] text-accent-dark">That doesn&apos;t look like an email address.</span>}</label>
              <label className="block"><span className={label}>Phone</span><input type="tel" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} className={field} placeholder="07..." />
                {phoneBad && <span className="mt-1 block text-[11px] text-accent-dark">That doesn&apos;t look like a phone number.</span>}</label>
            </div>
          )}

          {step === 2 && (
            <div className="mt-4">
              <span className={label}>Home address</span>
              <div className="mt-1"><AddressField value={d.address} onChange={(v) => setD({ ...d, address: v })} /></div>
            </div>
          )}

          {step === 3 && (
            <dl className="mt-4 divide-y divide-line/50 rounded-2xl border border-line/70 bg-white text-[12.5px]">
              {[
                { k: "For", v: [who?.name, d.relationship].filter(Boolean).join(" · ") || "-", at: 0 },
                { k: "Guarantor", v: [d.name, d.email, d.phone].filter((x) => x.trim()).join("\n") || "-", at: 1 },
                { k: "Address", v: d.address.trim() || "Not given yet", at: 2 },
              ].map((row) => (
                <div key={row.k} className="flex items-start justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <dt className="text-[10.5px] text-muted">{row.k}</dt>
                    <dd className="whitespace-pre-line font-semibold">{row.v}</dd>
                  </div>
                  <button type="button" onClick={() => go(row.at)} className="shrink-0 text-[11.5px] font-semibold text-accent-dark hover:underline">Change</button>
                </div>
              ))}
            </dl>
          )}
          {msg && <p className="mt-3 text-[12.5px] font-semibold text-accent-dark">{msg}</p>}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-line/60 px-6 py-4">
          <button type="button" onClick={() => (existing ? (step === 3 ? onClose() : go(3)) : step === 0 ? onClose() : go(step - 1))} disabled={busy} className="rounded-full border border-line/80 px-4 py-2 text-[12.5px] font-semibold hover:border-ink/40 disabled:opacity-50">
            {step === 0 || (existing && step === 3) ? "Cancel" : "Back"}
          </button>
          {step < 3 ? (
            <button type="button" onClick={next} disabled={!S.ok} className="rounded-full bg-accent-dark px-5 py-2 text-[12.5px] font-semibold text-page disabled:opacity-50">
              Continue
            </button>
          ) : (
            <button type="button" onClick={() => void save()} disabled={busy || !d.name.trim()} className="rounded-full bg-accent-dark px-5 py-2 text-[12.5px] font-semibold text-page disabled:opacity-50">
              {busy ? "Saving…" : existing ? "Save the changes" : "Save the guarantor"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
