"use client";

import { useEffect, useState } from "react";
import ContactBlock from "@/components/ContactBlock";
import { useSaveReporter } from "@/components/SaveChip";
import { Ico } from "@/components/new-look/Parts";
import { changePeople, type Party, type PeopleAnswer } from "@/components/LetPeople";

/**
 * A TENANT ON A LET, FIXED UNTIL EDIT (James, 1 Nov 2026).
 *
 * Rhiannon, let 39739 (ticket c43f8998): Ben Turner's email was wrong on the
 * let, Propoly had the right one, and the OS wouldn't let her change it. The
 * let's tenants could only be changed by clicking the number or the email -
 * and for anybody the application names, that change had to go back through
 * the old system, which refused it.
 *
 * Now each tenant is shown fixed (Call, WhatsApp, Email and copy as ever) and
 * Edit opens their name, mobile and email, with Save and Cancel, as the
 * Portfolio tenant card (components/new-look/TenantCard). One Save is one
 * call to the let's people route; what is saved is kept on the let in the OS
 * (lib/let-landlords), over the application's copy and Propoly's, and logged
 * on the let's history. Nothing goes to REX or Propoly; the Propoly line
 * under the card (PropolyLine) says when the deal has something else.
 */

type Draft = { name: string; phone: string; email: string };
const draftOf = (p: { name: string; phone: string | null; email: string | null }): Draft => ({ name: p.name ?? "", phone: p.phone ?? "", email: p.email ?? "" });
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LetTenantCard({
  letId,
  party,
  about,
  canEdit,
  onAnswer,
  after,
}: {
  letId: string;
  party: Party;
  /** The let's address, for an email's {{address}}. */
  about?: string;
  /** The let's agent or the office (lib/let-people letAccess). */
  canEdit: boolean;
  /** The let as the people route answers it after a save. */
  onAnswer: (j: PeopleAnswer) => void;
  /** Under the card: how they stand on the Propoly deal. */
  after?: React.ReactNode;
}) {
  const changeable = party.source === "rex" || party.source === "propoly" || party.source === "added";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftOf(party));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const reporter = useSaveReporter();
  useEffect(() => {
    if (!editing) setDraft(draftOf(party));
  }, [party.name, party.email, party.phone, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  function startEdit() {
    setDraft(draftOf(party));
    setProblem(null);
    setEditing(true);
  }

  async function save() {
    const was = draftOf(party);
    const next = { name: draft.name.trim(), phone: draft.phone.trim(), email: draft.email.trim().toLowerCase() };
    if (!next.name) return setProblem("The tenant needs a name.");
    if (next.email && !EMAIL.test(next.email)) return setProblem("That email doesn't look right.");
    const change: Record<string, string> = {};
    if (next.name !== was.name) change.name = next.name;
    if (next.phone !== was.phone) change.phone = next.phone;
    if (next.email !== was.email.toLowerCase()) change.email = next.email;
    if (!Object.keys(change).length) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setProblem(null);
    const settle = reporter.begin(`${party.name.split(/\s+/)[0] || "The tenant"}'s details`);
    const j = await changePeople(letId, { action: "edit", key: party.key, onLet: party.source === "rex", ...change });
    setBusy(false);
    if (!j.ok) {
      const said = j.error ?? "That didn't save.";
      setProblem(said);
      settle({ ok: false, problem: said, retry: () => void save() });
      return;
    }
    settle({ ok: true });
    onAnswer(j);
    setEditing(false);
  }

  const input = (label: string, value: string, set: (v: string) => void, type = "text", placeholder?: string) => (
    <label className="nl-field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={busy}
        onChange={(e) => set(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    </label>
  );

  if (editing) {
    return (
      <div className="flex flex-col gap-3">
        <div className="nl-appr-fields">
          {input("Full name", draft.name, (v) => setDraft({ ...draft, name: v }), "text", "Name the tenant")}
          {input("Mobile", draft.phone, (v) => setDraft({ ...draft, phone: v }), "tel", "07...")}
          {input("Email", draft.email, (v) => setDraft({ ...draft, email: v }), "email", "name@example.com")}
        </div>
        <p className="nl-hint">Kept on this let. If the Propoly deal has something different, it says so underneath once saved.</p>
        {problem && (
          <div className="nl-appr-problems" role="alert">
            <p>{problem}</p>
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
        <ContactBlock className="min-w-0 flex-1" fixed showName={false} role={party.isPrimary ? "lead applicant" : "applicant"} person={{ name: party.name, email: party.email, phone: party.phone }} personRef={null} about={about} />
        {canEdit && changeable && (
          <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm shrink-0" aria-label={`Edit ${party.name}`} onClick={startEdit} data-steve="application.edit-tenant">
            <Ico name="pen" size={14} /> Edit
          </button>
        )}
      </div>
      {after}
    </div>
  );
}
