"use client";

import { useCallback, useEffect, useState } from "react";
import ContactBlock from "@/components/ContactBlock";
import DoodleIcon from "@/components/DoodleIcon";
import { PressButton } from "@/components/Bits";

/**
 * The joint landlords and points of contact on a home, under its landlord
 * (agent call, 16 Oct 2026; lib/property-people). A couple who own through a
 * company: the husband is the landlord on record, the wife does the talking.
 *
 * "Add additional landlord" and "Add point of contact" open the same short
 * form. Each person shows as every person in the OS does (ContactBlock), read
 * only there because they have no REX contact behind them, with Change and
 * Remove under it. Kept in the OS only; nothing goes to REX.
 */

type Kind = "joint_landlord" | "contact";
type Person = { id: string; kind: Kind; name: string; email: string | null; phone: string | null; relation: string };
const LABEL: Record<Kind, string> = { joint_landlord: "Joint landlord", contact: "Point of contact" };
const HINT: Record<Kind, string> = { joint_landlord: "e.g. Director, Wife", contact: "e.g. Wife, does the talking" };

export default function HomePeople({ propertyId, onChange }: { propertyId: string; onChange?: (people: Person[]) => void }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [form, setForm] = useState<{ kind: Kind; editing: Person | null } | null>(null);

  const load = useCallback(() => {
    fetch(`/api/portfolio/people?property=${encodeURIComponent(propertyId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j?.ok) { setFailed(j?.error ?? "The other people on this home couldn't be read."); return; }
        setFailed(null);
        setPeople(j.people ?? []);
        onChange?.(j.people ?? []);
      })
      .catch(() => setFailed("The other people on this home couldn't be read."));
  }, [propertyId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPeople(null); load(); }, [load]);

  async function remove(p: Person) {
    if (!window.confirm(`Take ${p.name} off this home?`)) return;
    await fetch(`/api/portfolio/people?id=${encodeURIComponent(p.id)}`, { method: "DELETE" }).catch(() => null);
    load();
  }

  return (
    <div className="mt-3 border-t border-line/40 pt-3">
      {people === null && !failed && (
        <p className="flex items-center gap-2 text-[11.5px] text-muted"><span className="h-3 w-3 animate-spin rounded-full border-2 border-line border-t-ink" />Reading who else is on this home</p>
      )}
      {failed && <p className="text-[11.5px] text-muted">{failed}</p>}
      {people && people.length > 0 && (
        <ul className="space-y-2.5">
          {people.map((p) => (
            <li key={p.id} className="rounded-xl border border-line/50 px-4 py-3 text-[13px]">
              <p className="mb-1 flex flex-wrap items-center gap-x-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">
                <span className="text-accent-dark">{LABEL[p.kind]}</span>
                {p.relation && <span className="normal-case tracking-normal">· {p.relation}</span>}
              </p>
              {form?.editing?.id === p.id ? (
                <PersonForm propertyId={propertyId} kind={p.kind} editing={p} onDone={(saved) => { setForm(null); if (saved) load(); }} />
              ) : (
                <>
                  <ContactBlock role="landlord" person={{ name: p.name, email: p.email, phone: p.phone }} personRef={null} />
                  <div className="mt-2 flex gap-4 text-[11.5px] text-muted">
                    <button type="button" onClick={() => setForm({ kind: p.kind, editing: p })} className="underline hover:text-ink">Change</button>
                    <button type="button" onClick={() => void remove(p)} className="underline hover:text-ink">Remove</button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {form && !form.editing ? (
        <PersonForm propertyId={propertyId} kind={form.kind} editing={null} onDone={(saved) => { setForm(null); if (saved) load(); }} />
      ) : people !== null && (
        <div className={`${people.length ? "mt-3" : ""} flex flex-wrap gap-2`}>
          {(["joint_landlord", "contact"] as Kind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setForm({ kind: k, editing: null })}
              className="inline-flex items-center gap-1.5 rounded-full border border-line/80 bg-white px-3 py-1.5 text-[12px] font-semibold transition-colors hover:border-ink"
            >
              <DoodleIcon name={k === "joint_landlord" ? "user" : "message"} size={12} className="text-accent-dark" />
              {k === "joint_landlord" ? "Add additional landlord" : "Add point of contact"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PersonForm({ propertyId, kind, editing, onDone }: { propertyId: string; kind: Kind; editing: Person | null; onDone: (saved: boolean) => void }) {
  const [name, setName] = useState(editing?.name ?? "");
  const [relation, setRelation] = useState(editing?.relation ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = "w-full rounded-xl border border-line/80 bg-page px-3 py-2 text-[13px]";

  async function save() {
    if (saving || name.trim().length < 2) return;
    setSaving(true);
    setError(null);
    const r = await fetch("/api/portfolio/people", {
      method: editing ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(editing ? { id: editing.id, name, relation, email, phone } : { propertyId, kind, name, relation, email, phone }),
    }).then((x) => x.json()).catch(() => null);
    setSaving(false);
    if (!r?.ok) { setError(r?.error ?? "That couldn't be saved just now. Try again in a minute."); return; }
    onDone(true);
  }

  return (
    <form className="mt-2 space-y-2 rounded-xl bg-accent-soft/30 p-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      {!editing && <p className="text-[12.5px] font-semibold">{kind === "joint_landlord" ? "Add additional landlord" : "Add point of contact"}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-[11.5px] text-muted">Name<input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} autoComplete="off" className={`${field} mt-1`} /></label>
        <label className="block text-[11.5px] text-muted">Who they are<input value={relation} onChange={(e) => setRelation(e.target.value)} maxLength={80} placeholder={HINT[kind]} autoComplete="off" className={`${field} mt-1`} /></label>
        <label className="block text-[11.5px] text-muted">Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" className={`${field} mt-1`} /></label>
        <label className="block text-[11.5px] text-muted">Phone<input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" className={`${field} mt-1`} /></label>
      </div>
      <p className="text-[11px] text-muted">
        Kept on this home&apos;s file in the OS. {kind === "joint_landlord" ? "Offered beside the landlord" : "Offered as someone to send to"} when you report a repair or plan a certificate.
      </p>
      {error && <p className="text-[11.5px] text-accent-dark">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <PressButton onClick={() => void save()} disabled={saving || name.trim().length < 2} className="rounded-full bg-ink px-4 py-1.5 text-[12px] font-semibold text-page">
          {saving ? "Saving…" : "Save"}
        </PressButton>
        <button type="button" onClick={() => onDone(false)} className="text-[11.5px] text-muted underline">Cancel</button>
      </div>
    </form>
  );
}
