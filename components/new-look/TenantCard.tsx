"use client";

import { useEffect, useState } from "react";
import ContactBlock, { type Person } from "@/components/ContactBlock";
import { Ico } from "@/components/new-look/Parts";

/**
 * A TENANT ON A PORTFOLIO HOME, WITH AN EDIT BUTTON (James, 27 Oct 2026):
 * "can you add an edit button for tenants that are in portfolio - so we can
 * change numbers and emails and stuff".
 *
 * They could be changed before, but only by clicking the number or the email
 * itself, which nobody found. Now the tenant is shown fixed (Call, WhatsApp,
 * Email and copy as ever) and Edit opens their name, mobile and email to
 * change, with Save and Cancel - as the new-look appraisal's landlord card.
 *
 * Saved exactly as the click-to-change fields saved, through PATCH
 * /api/people/contact one field at a time:
 *   rex:<id>              a tenant with a contact record: changed there, as before
 *   rexpm:<home>:<n>      a tenant named by the tenancy record: kept on the home
 *                         (os_tenant_contacts), never the old system; their
 *                         name comes from the tenancy record and stays
 * Anyone else is shown read only, saying why.
 */

type Draft = { name: string; phone: string; email: string };
const FIELDS = ["name", "phone", "email"] as const;
const draftOf = (p: Person): Draft => ({ name: p.name ?? "", phone: p.phone ?? "", email: p.email ?? "" });

export default function TenantCard({ contactId, person, about }: { contactId: string | null | undefined; person: Person; about?: string }) {
  const id = String(contactId ?? "");
  const rexRef = /^\d+$/.test(id) ? `rex:${id}` : null;
  const pmRef = /^rexpm:[^:]+:\d+$/.test(id) ? id : null;
  const canEdit = Boolean(rexRef || pmRef);

  /* What is on record now; moves on as each field saves. */
  const [shown, setShown] = useState<Person>(person);
  useEffect(() => setShown(person), [person.name, person.email, person.phone]); // eslint-disable-line react-hooks/exhaustive-deps
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftOf(person));
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [note, setNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  /* The old system refused for want of a name: the next Save sends the name with it, as ContactBlock does. */
  const [askName, setAskName] = useState<{ field: "email" | "phone"; value: string } | null>(null);

  function startEdit() {
    setDraft(draftOf(shown));
    setProblems([]);
    setNote(null);
    setAskName(null);
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    setProblems([]);
    let base = draftOf(shown);
    let asking = askName;
    const out: string[] = [];
    const details: string[] = [];
    let warned = false;
    let changed = false;
    for (const field of FIELDS) {
      if (field === "name" && !rexRef) continue;
      const v = draft[field].trim();
      if (base[field] === v && !(field === "name" && asking)) continue;
      if (field === "name" && !v) { out.push("The tenant needs a name."); continue; }
      if (field === "email" && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { out.push("That email doesn't look right."); continue; }
      const sentWith = field === "name" && asking ? { [asking.field]: asking.value } : {};
      const body = rexRef
        ? { ref: rexRef, [field]: v, ...sentWith }
        : { ref: pmRef, tenantName: shown.name, [field]: v, keep: { email: base.email, phone: base.phone } };
      try {
        const r = await fetch("/api/people/contact", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; needsName?: boolean; sync?: { ok?: boolean; detail?: string } };
        if (!j.ok) {
          if (j.needsName && field !== "name") {
            asking = { field, value: v };
            out.push(`Their record has no name, so the ${field === "email" ? "email" : "number"} won't save on its own. Put their name in and save again.`);
          } else {
            out.push(j.error ?? "That didn't save.");
          }
          continue;
        }
        if (field === "name") asking = null;
        base = { ...base, ...sentWith, [field]: v };
        changed = true;
        if (j.sync?.detail) details.push(j.sync.detail);
        if (j.sync?.ok === false) warned = true;
      } catch {
        out.push("That didn't go through. Try again.");
      }
    }
    setAskName(asking);
    setShown({ name: base.name, phone: base.phone || null, email: base.email || null });
    setBusy(false);
    if (out.length) { setProblems(out); return; }
    setEditing(false);
    if (changed) {
      setNote({ tone: warned ? "bad" : "ok", text: [...new Set(details)].join(" ") || "Saved." });
      if (!warned) window.setTimeout(() => setNote((n) => (n?.tone === "ok" ? null : n)), 6000);
    }
  }

  const input = (label: string, value: string, set: (v: string) => void, type = "text", placeholder?: string) => (
    <label className="nl-field">
      <span>{label}</span>
      <input type={type} value={value} placeholder={placeholder} disabled={busy} onChange={(e) => set(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void save(); if (e.key === "Escape") setEditing(false); }} />
    </label>
  );

  if (editing) {
    return (
      <div className="flex flex-col gap-3">
        <div className="nl-cell-head">
          <p className="nl-strong">Edit {shown.name}</p>
        </div>
        <div className="nl-appr-fields">
          {rexRef ? input("Full name", draft.name, (v) => setDraft({ ...draft, name: v }), "text", "Name the tenant") : null}
          {input("Mobile", draft.phone, (v) => setDraft({ ...draft, phone: v }), "tel", "07...")}
          {input("Email", draft.email, (v) => setDraft({ ...draft, email: v }), "email", "name@example.com")}
        </div>
        {!rexRef && <p className="nl-hint">Their name comes from the tenancy record, so it can&apos;t be changed here.</p>}
        {problems.length > 0 && (
          <div className="nl-appr-problems" role="alert">
            {problems.map((x, i) => <p key={i}>{x}</p>)}
          </div>
        )}
        <div className="nl-appr-edit-foot">
          <button type="button" className="nl-btn nl-btn--quiet nl-btn--sm" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
          <button type="button" className="nl-btn nl-btn--primary nl-btn--sm" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start gap-3">
        <ContactBlock className="min-w-0 flex-1" fixed role="tenant" person={shown} personRef={null} about={about} />
        {canEdit && (
          <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm shrink-0" aria-label={`Edit ${shown.name}`} onClick={startEdit}>
            <Ico name="pen" size={14} /> Edit
          </button>
        )}
      </div>
      {!canEdit && <p className="nl-hint mt-1">Not linked to a tenant record, so their details can&apos;t be changed here.</p>}
      {note && <p className={`nl-meta mt-1 ${note.tone === "bad" ? "text-accent-dark" : ""}`}>{note.text}</p>}
    </div>
  );
}
