"use client";

import { useCallback, useEffect, useState } from "react";
import ContactBlock, { type Person } from "@/components/ContactBlock";
import LandlordHomeAddress from "@/components/LandlordHomeAddress";
import ZeroDepositOptOut from "@/components/ZeroDepositOptOut";
import { AddPersonModal, type HomePerson, type Kind } from "@/components/HomeLandlords";
import { Ico } from "@/components/new-look/Parts";
import { KIND_LABEL, landlordEmailsChanged, readLandlordEmails, type EmailKind, type LandlordEmails } from "@/components/LandlordOtherEmails";

/**
 * THE LANDLORD CARD ON THE NEW-LOOK APPRAISAL, FIXED UNTIL THE PENCIL (James,
 * 24 Oct 2026): "rather than us having another Add Landlord button ... get rid
 * of those buttons. What we should be able to do is have a little edit button
 * ... We click Edit, and then that will bring up the option to add another
 * landlord if required, or a point of contact. They should be fixed."
 *
 * Fixed: the landlord, any additional landlords and any points of contact,
 * each with their details and the WhatsApp, Email and copy buttons, nothing
 * changeable. The pencil in the top right opens the same card for changing:
 * names, numbers, emails, who they are, taking somebody off, and adding
 * another landlord or a point of contact. Save writes it, Cancel drops it.
 *
 * Nothing new is written, only when: the landlord through PATCH
 * /api/people/contact one field at a time, exactly as ContactBlock sends it
 * (so a REX contact is changed in REX just as before), and everyone else
 * through /api/portfolio/people, exactly as HomeLandlords does (kept on the
 * home, never REX). Adding still goes through HomeLandlords' own form, which
 * saves the person as soon as it is sent. The classic page keeps
 * HomeLandlords and the always-editable ContactBlock.
 */

type Draft = { name: string; phone: string; email: string };
type OtherDraft = Draft & { relation: string; off: boolean };
const FIELDS = ["name", "phone", "email"] as const;
const KIND_TAG: Record<Kind, string> = { joint_landlord: "Additional landlord", contact: "Point of contact" };

/* A landlord's other emails, as being typed (Dan Richards, ticket 190230a3;
   James, 10 Nov 2026: "click +, and then you can select what type of email
   it is (work or personal)"). Kept in the OS only (lib/landlord-emails): the
   Email box above stays the one REX holds and every automatic send uses. */
type EmailsDraft = { mainKind: EmailKind; extras: { key: string; email: string; kind: EmailKind }[] };
type EmailsSlot = { state: "loading" | "ready" | "failed"; draft: EmailsDraft; base: EmailsDraft };
const NO_EMAILS: EmailsDraft = { mainKind: "personal", extras: [] };
const MAX_EXTRAS = 4;
let extraKey = 0;
const emailsDraftOf = (e: LandlordEmails | null): EmailsDraft => ({
  mainKind: e?.mainKind ?? "personal",
  extras: (e?.extras ?? []).map((x) => ({ key: `x${++extraKey}`, email: x.email, kind: x.kind })),
});
const emailsSig = (d: EmailsDraft) =>
  JSON.stringify([d.mainKind, d.extras.map((x) => [x.email.trim().toLowerCase(), x.kind]).filter(([e]) => e)]);

const draftOf = (p: Person): Draft => ({ name: p.name ?? "", phone: p.phone ?? "", email: p.email ?? "" });
const otherOf = (p: HomePerson): OtherDraft => ({ ...draftOf(p), relation: p.relation ?? "", off: false });

export default function AppraisalLandlord({
  landlord,
  landlordRef,
  homeKey,
  address,
  onSaved,
  onWhatsAppSent,
}: {
  landlord: Person;
  /** "os:" or "rex:" - without one the landlord can't be changed here, as on the classic card. */
  landlordRef: string | null;
  /** Where additional landlords and points of contact are kept (lib/property-people). */
  homeKey: string | null;
  address: string;
  /** After anything saved: the page reads the appraisal again. */
  onSaved: () => void;
  onWhatsAppSent?: (message: string) => Promise<string | null | void>;
}) {
  const [people, setPeople] = useState<HomePerson[] | null>(homeKey ? null : []);
  const [failed, setFailed] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [main, setMain] = useState<Draft>(() => draftOf(landlord));
  /* What the landlord's record holds now; moves on as each field saves, so a
     Save tried again after a refusal doesn't send the ones that went. */
  const [mainBase, setMainBase] = useState<Draft>(() => draftOf(landlord));
  const [others, setOthers] = useState<Record<string, OtherDraft>>({});
  /* REX refused for want of a name: the next Save sends the name with it, as ContactBlock does. */
  const [askName, setAskName] = useState<{ field: "email" | "phone"; value: string } | null>(null);
  const [adding, setAdding] = useState<Kind | null>(null);
  /* "main" for the landlord, else a joint landlord's id. */
  const [emails, setEmails] = useState<Record<string, EmailsSlot>>({});
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [note, setNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!homeKey) { setPeople([]); return [] as HomePerson[]; }
    try {
      const j = await fetch(`/api/portfolio/people?property=${encodeURIComponent(homeKey)}`, { cache: "no-store" }).then((r) => r.json());
      if (!j?.ok) { setFailed(j?.error ?? "The other people on this home couldn't be read."); setPeople([]); return []; }
      setFailed(null);
      setPeople(j.people ?? []);
      return (j.people ?? []) as HomePerson[];
    } catch {
      setFailed("The other people on this home couldn't be read.");
      setPeople([]);
      return [];
    }
  }, [homeKey]);
  useEffect(() => { setPeople(homeKey ? null : []); void load(); }, [load, homeKey]);

  /* The record moved on while the card is fixed (a reload): follow it. */
  useEffect(() => {
    if (editing) return;
    setMain(draftOf(landlord));
    setMainBase(draftOf(landlord));
  }, [landlord.name, landlord.email, landlord.phone, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const joint = (people ?? []).filter((p) => p.kind === "joint_landlord");
  const contacts = (people ?? []).filter((p) => p.kind === "contact");

  function startEdit() {
    setMain(draftOf(landlord));
    setMainBase(draftOf(landlord));
    setOthers(Object.fromEntries((people ?? []).map((p) => [p.id, otherOf(p)])));
    setAskName(null);
    setProblems([]);
    setNote(null);
    setEditing(true);
    /* Their other emails, read fresh for the open card. */
    const whose: { slot: string; email: string; ref: string }[] = [
      ...(landlordRef || landlord.email ? [{ slot: "main", email: landlord.email ?? "", ref: landlordRef ?? "" }] : []),
      ...(people ?? []).filter((p) => p.kind === "joint_landlord" && p.email).map((p) => ({ slot: p.id, email: p.email ?? "", ref: "" })),
    ];
    setEmails(Object.fromEntries(whose.map((w) => [w.slot, { state: "loading", draft: NO_EMAILS, base: NO_EMAILS } as EmailsSlot])));
    for (const w of whose) {
      readLandlordEmails(w.email, w.ref)
        .then((e) => {
          const d = emailsDraftOf(e);
          setEmails((cur) => ({ ...cur, [w.slot]: { state: "ready", draft: d, base: d } }));
        })
        .catch(() => setEmails((cur) => ({ ...cur, [w.slot]: { state: "failed", draft: NO_EMAILS, base: NO_EMAILS } })));
    }
  }

  /* One person's other emails: saved when they changed, or when the email
     they are kept against did. Never REX: PUT /api/people/emails only. */
  async function saveEmailsFor(slot: string, who: { email: string; was: string; ref: string; name: string }): Promise<{ problem: string | null; changed: boolean }> {
    const e = emails[slot];
    if (!e || e.state !== "ready") return { problem: null, changed: false };
    const moved = who.email.trim().toLowerCase() !== who.was.trim().toLowerCase();
    if (emailsSig(e.draft) === emailsSig(e.base) && !(moved && emailsSig(e.base) !== emailsSig(NO_EMAILS))) return { problem: null, changed: false };
    if (!who.email.trim() && !who.ref) return { problem: "Add their main email first, so the other emails have somebody to belong to.", changed: false };
    try {
      const j = await fetch("/api/people/emails", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: who.email.trim(),
          was: moved ? who.was.trim() : "",
          ref: who.ref,
          name: who.name,
          mainKind: e.draft.mainKind,
          extras: e.draft.extras.filter((x) => x.email.trim()).map((x) => ({ email: x.email.trim(), kind: x.kind })),
        }),
      }).then((r) => r.json()).catch(() => null) as { ok?: boolean; error?: string; emails?: LandlordEmails } | null;
      if (!j?.ok) return { problem: j?.error ?? "Their other emails didn't save.", changed: false };
      const d = emailsDraftOf(j.emails ?? null);
      setEmails((cur) => ({ ...cur, [slot]: { state: "ready", draft: d, base: d } }));
      return { problem: null, changed: true };
    } catch {
      return { problem: "Their other emails didn't go through. Try again.", changed: false };
    }
  }

  function cancel() {
    setEditing(false);
    setProblems([]);
    setAskName(null);
  }

  /* The landlord, field by field, the body ContactBlock sends. */
  async function saveMain(): Promise<{ problems: string[]; details: string[]; warned: boolean; changed: boolean; base: Draft }> {
    const out = { problems: [] as string[], details: [] as string[], warned: false, changed: false, base: mainBase };
    if (!landlordRef) return out;
    let base = mainBase;
    let asking = askName;
    for (const field of FIELDS) {
      const v = main[field].trim();
      if ((base[field] ?? "") === v && !(field === "name" && asking)) continue;
      if (field === "name" && !v) { out.problems.push("The landlord needs a name."); continue; }
      const sentWith = field === "name" && asking ? { [asking.field]: asking.value } : {};
      try {
        const r = await fetch("/api/people/contact", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ref: landlordRef, [field]: v, ...sentWith }),
        });
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; needsName?: boolean; person?: Person; sync?: { ok: boolean; detail: string } };
        if (!j.ok) {
          if (j.needsName && field !== "name") {
            asking = { field, value: v };
            out.problems.push(`Their record has no name, so REX won't take the ${field === "email" ? "email" : "number"} on its own. Put their name in and save again.`);
          } else {
            out.problems.push(j.error ?? "That didn't save.");
          }
          continue;
        }
        if (field === "name") asking = null;
        /* Only what was sent moves on: the reply's own spelling of the rest
           (a lower-cased email) mustn't make the next field look changed. */
        base = { ...base, ...sentWith, [field]: v };
        out.changed = true;
        /* Saved in the OS but not REX (not in REX yet, or REX refused): said, not blocking. */
        if (j.sync?.detail) out.details.push(j.sync.detail);
        if (j.sync?.ok === false) out.warned = true;
      } catch {
        out.problems.push("That didn't go through. Try again.");
      }
    }
    setMainBase(base);
    setAskName(asking);
    out.base = base;
    return out;
  }

  /* Everybody else, the body HomeLandlords sends: one change per person, then who comes off. */
  async function saveOthers(): Promise<{ problems: string[]; failedIds: string[]; changed: boolean; offJoint: string[] }> {
    const out = { problems: [] as string[], failedIds: [] as string[], changed: false, offJoint: [] as string[] };
    for (const p of people ?? []) {
      const d = others[p.id];
      if (!d) continue;
      if (d.off) {
        const j = await fetch(`/api/portfolio/people?id=${encodeURIComponent(p.id)}`, { method: "DELETE" }).then((r) => r.json()).catch(() => null);
        if (!j?.ok) { out.problems.push(`${p.name}: ${j?.error ?? "that didn't come off. Try again."}`); out.failedIds.push(p.id); continue; }
        out.changed = true;
        if (p.kind === "joint_landlord") out.offJoint.push(p.name);
        continue;
      }
      const next = { name: d.name.trim(), email: d.email.trim(), phone: d.phone.trim(), relation: d.relation.trim().slice(0, 80) };
      if (next.name === (p.name ?? "") && next.email === (p.email ?? "") && next.phone === (p.phone ?? "") && next.relation === (p.relation ?? "")) continue;
      const j = await fetch("/api/portfolio/people", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: p.id, ...next }),
      }).then((r) => r.json()).catch(() => null);
      if (!j?.ok) { out.problems.push(`${p.name}: ${j?.error ?? "that didn't save."}`); out.failedIds.push(p.id); continue; }
      out.changed = true;
    }
    return out;
  }

  async function save() {
    setBusy(true);
    setProblems([]);
    const wasMain = mainBase.email;
    const a = await saveMain();
    const b = await saveOthers();
    /* The landlord's other emails go against the email their record now
       holds: the new one if it saved, the old one if REX refused it. */
    const c = { problems: [] as string[], changed: false };
    {
      const r = await saveEmailsFor("main", { email: a.base.email || landlord.email || "", was: wasMain || landlord.email || "", ref: landlordRef ?? "", name: a.base.name || landlord.name });
      if (r.problem) c.problems.push(r.problem);
      c.changed ||= r.changed;
    }
    for (const p of joint) {
      const d = others[p.id];
      if (!d || d.off || b.failedIds.includes(p.id)) continue;
      const r = await saveEmailsFor(p.id, { email: d.email, was: p.email ?? "", ref: "", name: d.name.trim() || p.name });
      if (r.problem) c.problems.push(`${p.name}: ${r.problem}`);
      c.changed ||= r.changed;
    }
    if (c.changed) landlordEmailsChanged();
    const fresh = await load();
    /* Anyone whose change failed keeps what was typed; the rest show what saved. */
    setOthers((cur) => Object.fromEntries(fresh.map((p) => {
      const kept = cur[p.id];
      return [p.id, kept && b.failedIds.includes(p.id) ? kept : otherOf(p)];
    })));
    setBusy(false);
    if (a.changed || b.changed || c.changed) onSaved();
    const all = [...a.problems, ...b.problems, ...c.problems];
    if (all.length) { setProblems(all); return; }
    setEditing(false);
    const said = [
      ...new Set(a.details),
      ...(b.offJoint.length ? [`${b.offJoint.join(" and ")} ${b.offJoint.length > 1 ? "are" : "is"} off this home. If they're on a Propoly deal, take them off it there too.`] : []),
    ];
    if (a.changed || b.changed || c.changed) {
      setNote({ tone: a.warned ? "bad" : "ok", text: said.join(" ") || "Saved." });
      if (!b.offJoint.length) window.setTimeout(() => setNote((n) => (n?.tone === "ok" ? null : n)), 6000);
    }
  }

  const relationLine = (p: HomePerson) =>
    p.relation ? <p className="nl-meta">Who they are: <span className="text-ink">{p.relation}</span></p> : null;

  /* ── fixed ─────────────────────────────────────────────────────────── */
  const fixedView = (
    <>
      <ContactBlock
        className="pb-2"
        fixed
        role="landlord"
        person={landlord}
        personRef={landlordRef}
        home={{ propertyAddress: address }}
        onWhatsAppSent={onWhatsAppSent}
      />
      {people === null ? (
        <p className="nl-meta flex items-center gap-2">
          <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
          Looking for anyone else on the home&hellip;
        </p>
      ) : null}
      {joint.map((p) => (
        <div key={p.id} className="nl-appr-person">
          <p className="nl-eyebrow">{KIND_TAG[p.kind]}</p>
          <ContactBlock fixed role="landlord" person={{ name: p.name, email: p.email, phone: p.phone }} personRef={null} home={{ propertyAddress: address }} />
          {relationLine(p)}
        </div>
      ))}
      {contacts.length > 0 && (
        <div className="nl-appr-person">
          <p className="nl-eyebrow">{contacts.length > 1 ? `Points of contact · ${contacts.length}` : "Point of contact"}</p>
          {contacts.map((p) => (
            <div key={p.id} className="nl-appr-person-sub">
              <ContactBlock fixed role="point of contact" call person={{ name: p.name, email: p.email, phone: p.phone }} personRef={null} about={address} />
              {relationLine(p)}
            </div>
          ))}
        </div>
      )}
      {failed && <p className="nl-meta">{failed}</p>}
      {note && <p className={`nl-meta ${note.tone === "bad" ? "text-accent-dark" : ""}`}>{note.text}</p>}
    </>
  );

  /* ── editing ───────────────────────────────────────────────────────── */
  const input = (label: string, value: string, set: (v: string) => void, type = "text", placeholder?: string) => (
    <label className="nl-field">
      <span>{label}</span>
      <input type={type} value={value} placeholder={placeholder} disabled={busy} onChange={(e) => set(e.target.value)} />
    </label>
  );
  /* Work or Personal, beside each email box. */
  const kindPicker = (kind: EmailKind, set: (k: EmailKind) => void, label: string) => (
    <div role="radiogroup" aria-label={label} className="nl-toggle nl-appr-kind">
      {(["personal", "work"] as const).map((k) => (
        <button key={k} type="button" role="radio" aria-checked={kind === k} disabled={busy} className={kind === k ? "is-on" : undefined} onClick={() => set(k)}>
          {KIND_LABEL[k]}
        </button>
      ))}
    </div>
  );
  const setSlot = (slot: string, change: (d: EmailsDraft) => EmailsDraft) =>
    setEmails((cur) => (cur[slot] ? { ...cur, [slot]: { ...cur[slot], draft: change(cur[slot].draft) } } : cur));

  /* The Email box, its type, and the other emails under it with "+ Add Another Email". */
  const emailRows = (slot: string, value: string, set: ((v: string) => void) | null) => {
    const e = emails[slot];
    const d = e?.draft ?? NO_EMAILS;
    const ready = e?.state === "ready";
    return (
      <div className="nl-appr-emails">
        <div className="nl-appr-email-row">
          {set ? input("Email", value, set, "email", "name@example.com") : (
            <div className="nl-field">
              <span>Email</span>
              <div className="nl-locked"><span>{value}</span></div>
            </div>
          )}
          {e && kindPicker(d.mainKind, (k) => setSlot(slot, (x) => ({ ...x, mainKind: k })), "Type of email")}
        </div>
        {d.extras.map((x, i) => (
          <div key={x.key} className="nl-appr-email-row">
            {input(`Other email${d.extras.length > 1 ? ` ${i + 1}` : ""}`, x.email, (v) => setSlot(slot, (y) => ({ ...y, extras: y.extras.map((z) => (z.key === x.key ? { ...z, email: v } : z)) })), "email", "name@example.com")}
            {kindPicker(x.kind, (k) => setSlot(slot, (y) => ({ ...y, extras: y.extras.map((z) => (z.key === x.key ? { ...z, kind: k } : z)) })), `Type of other email ${i + 1}`)}
            <button type="button" className="nl-link text-[13px] nl-appr-email-off" disabled={busy} onClick={() => setSlot(slot, (y) => ({ ...y, extras: y.extras.filter((z) => z.key !== x.key) }))}>
              Remove
            </button>
          </div>
        ))}
        {e?.state === "loading" && (
          <p className="nl-meta flex items-center gap-2">
            <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
            Looking for their other emails&hellip;
          </p>
        )}
        {e?.state === "failed" && <p className="nl-meta">Their other emails couldn&apos;t be read just now, so they can&apos;t be changed. Cancel and try again.</p>}
        {ready && d.extras.length < MAX_EXTRAS && (
          <button
            type="button"
            className="nl-link self-start text-[13px]"
            disabled={busy}
            onClick={() => setSlot(slot, (y) => ({ ...y, extras: [...y.extras, { key: `x${++extraKey}`, email: "", kind: y.mainKind === "work" ? "personal" : "work" }] }))}
          >
            <Ico name="plus" size={13} /> Add Another Email
          </button>
        )}
        {ready && d.extras.length > 0 && (
          <p className="nl-hint">Kept in the OS only. The first email is the one on their contact record, and the one the confirmation, decks and terms go to.</p>
        )}
      </div>
    );
  };

  const setOther = (id: string, change: Partial<OtherDraft>) => setOthers((cur) => ({ ...cur, [id]: { ...cur[id], ...change } }));

  const otherEditor = (p: HomePerson) => {
    const d = others[p.id] ?? otherOf(p);
    return (
      <div key={p.id} className={`nl-appr-person ${d.off ? "is-off" : ""}`}>
        <div className="nl-cell-head">
          <p className="nl-eyebrow">{KIND_TAG[p.kind]}</p>
          <button type="button" className="nl-link text-[13px]" disabled={busy} onClick={() => setOther(p.id, { off: !d.off })}>
            {d.off ? "Keep them" : "Take off"}
          </button>
        </div>
        {d.off ? (
          <p className="nl-meta">{p.name} comes off this home when you save.</p>
        ) : (
          <>
            <div className="nl-appr-fields">
              {input("Full name", d.name, (v) => setOther(p.id, { name: v }))}
              {input("Who they are", d.relation, (v) => setOther(p.id, { relation: v }), "text", p.kind === "contact" ? "e.g. Partner, lets us in" : "e.g. Director, Wife")}
              {input("Mobile", d.phone, (v) => setOther(p.id, { phone: v }), "tel", "07...")}
              {p.kind === "joint_landlord" && emails[p.id]
                ? emailRows(p.id, d.email, (v) => setOther(p.id, { email: v }))
                : input("Email", d.email, (v) => setOther(p.id, { email: v }), "email", "name@example.com")}
            </div>
            {/* Their own home address and the opt-out, as on the classic card: these save as they change. */}
            {p.kind === "joint_landlord" && p.email && (
              <>
                <LandlordHomeAddress email={p.email} personRef={null} name={p.name} propertyAddress={address} />
                <ZeroDepositOptOut email={p.email} personRef={null} name={p.name} />
              </>
            )}
            {p.kind === "contact" && <p className="nl-hint">Not a landlord: not on the contract, and never sent to Propoly.</p>}
          </>
        )}
      </div>
    );
  };

  const editView = (
    <>
      {landlordRef ? (
        <div className="nl-appr-fields">
          {input("Full name", main.name, (v) => setMain({ ...main, name: v }), "text", "Name the landlord")}
          {input("Mobile", main.phone, (v) => setMain({ ...main, phone: v }), "tel", "07...")}
          {emailRows("main", main.email, (v) => setMain({ ...main, email: v }))}
        </div>
      ) : (
        <>
          <ContactBlock fixed role="landlord" person={landlord} personRef={null} />
          <p className="nl-hint">This landlord isn&apos;t linked to a contact record, so their name, number and email can&apos;t be changed here.</p>
          {/* Their other emails are the OS's own, so they can still be added, kept against the email on file. */}
          {landlord.email && emails.main && emailRows("main", landlord.email, null)}
        </>
      )}
      {/* Their own home address and the opt-out save as they change, as they always have. */}
      {(landlordRef || landlord.email) && (
        <div>
          <LandlordHomeAddress email={landlord.email} personRef={landlordRef} name={landlord.name} propertyAddress={address} />
          <ZeroDepositOptOut email={landlord.email} personRef={landlordRef} name={landlord.name} />
        </div>
      )}

      {joint.map(otherEditor)}
      {contacts.map(otherEditor)}
      {failed && <p className="nl-meta">{failed}</p>}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm" disabled={busy || people === null || !homeKey} onClick={() => setAdding("joint_landlord")}>
          <Ico name="plus" size={14} /> Add another landlord
        </button>
        <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm" disabled={busy || people === null || !homeKey} onClick={() => setAdding("contact")}>
          <Ico name="plus" size={14} /> Add a point of contact
        </button>
      </div>

      {problems.length > 0 && (
        <div className="nl-appr-problems" role="alert">
          {problems.map((x, i) => <p key={i}>{x}</p>)}
        </div>
      )}
      <div className="nl-appr-edit-foot">
        <button type="button" className="nl-btn nl-btn--quiet nl-btn--sm" disabled={busy} onClick={cancel}>Cancel</button>
        <button type="button" className="nl-btn nl-btn--primary nl-btn--sm" disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </>
  );

  return (
    <>
      <div className="nl-cell-head">
        <h3 className="nl-block-title">{editing ? "Edit the Landlord" : "The Landlord"}</h3>
        {!editing && (
          <button type="button" className="nl-iconbtn nl-iconbtn--sm" aria-label="Edit the landlord" title="Edit the landlord" onClick={startEdit}>
            <Ico name="pen" size={15} />
          </button>
        )}
      </div>
      {editing ? editView : fixedView}

      {adding && homeKey && (
        <AddPersonModal
          kind={adding}
          address={address}
          onClose={() => setAdding(null)}
          onSubmit={async (f) => {
            /* HomeLandlords' own add, unchanged: saved on the home the moment it is sent. */
            const j = await fetch("/api/portfolio/people", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ propertyId: homeKey, kind: f.kind, name: f.name, email: f.email, phone: f.phone, relation: f.relation }),
            }).then((r) => r.json()).catch(() => null);
            if (!j?.ok) return { ok: false, error: j?.error ?? "That didn't save. Try again." };
            /* A landlord's own home goes where every landlord's is kept (lib/landlord-home). */
            if (f.kind === "joint_landlord" && f.address.trim() && f.email.trim()) {
              await fetch("/api/people/home-address", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: f.email, name: f.name, address: f.address }) }).catch(() => null);
            }
            const fresh = await load();
            /* The new person joins the open card; what's being typed for the others stays. */
            setOthers((cur) => ({ ...Object.fromEntries(fresh.map((p) => [p.id, otherOf(p)])), ...Object.fromEntries(Object.entries(cur).filter(([id]) => fresh.some((p) => p.id === id))) }));
            onSaved();
            return { ok: true };
          }}
        />
      )}
    </>
  );
}
