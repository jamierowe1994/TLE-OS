import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import { rexCall, rexConfigured } from "@/lib/rex";
import { getContact, markRex, updateContact, type OsContact } from "@/lib/contacts-store";
import { pushContactUpdateToRex } from "@/lib/rex-contacts";
import { record } from "@/lib/audit";
import { recordLandlordFor, recordRowsFor, saveRecordLandlord } from "@/lib/record-landlords";
import { publicError } from "@/lib/public-error";
import { nameKey, saveTenantContact, tenantContacts } from "@/lib/tenant-contacts";
import { forgetBooks } from "@/lib/managed-book-cache";

/**
 * PATCH /api/people/contact - change a landlord's or tenant's name, email or
 * phone from wherever they are on screen (James, 12 Oct 2026: "there's no
 * way of me editing the file ... What if they ask us to change the email?").
 *
 * Body: { ref: "os:<contact id>" | "rex:<REX contact id>", name?, email?, phone? }
 *
 *   os:   a person made in the OS (os_contacts): saved there first, then
 *         mirrored to their REX contact - the lead file's own path.
 *   rex:  a person who only exists in REX (a listing's landlord, a tenant, an
 *         applicant, a REX lead): REX is read for what is there now, the
 *         change is laid over it and written back through the same
 *         pushContactUpdateToRex, which amends the existing email and phone
 *         rather than adding second ones. The OS's own copies of them (the
 *         lead ledger) are put right too, so the next screen shows it.
 *
 * The REX write is the agent's own (their linked REX sign-in) and goes
 * through the usual locks; when it is refused the OS change still stands and
 * `sync` says why. Every change is written to the audit trail.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : undefined);
type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "");

export async function PATCH(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const ref = clean(body?.ref, 120) ?? "";
  const name = clean(body?.name, 120);
  const email = clean(body?.email, 200)?.toLowerCase();
  const phone = clean(body?.phone, 40);
  if (name !== undefined && !name) return NextResponse.json({ ok: false, error: "A person needs a name." }, { status: 400 });
  if (email && !EMAIL.test(email)) return NextResponse.json({ ok: false, error: "That doesn't look like an email address." }, { status: 400 });
  if (phone && phone.replace(/\D/g, "").length < 7) return NextResponse.json({ ok: false, error: "That doesn't look like a phone number." }, { status: 400 });
  if (name === undefined && email === undefined && phone === undefined) return NextResponse.json({ ok: false, error: "Nothing to change." }, { status: 400 });

  try {
    /* A person made in the OS. */
    if (ref.startsWith("os:")) {
      const id = ref.slice(3);
      const before = await getContact(id);
      if (!before) return NextResponse.json({ ok: false, error: "No such person." }, { status: 404 });
      const contact = await updateContact(id, { ...(name !== undefined ? { name } : {}), ...(email !== undefined ? { email } : {}), ...(phone !== undefined ? { mobile: phone } : {}) });
      if (!contact) return NextResponse.json({ ok: false, error: "No such person." }, { status: 404 });
      /* The appraisals booked from this lead keep the landlord's name themselves. */
      if (name !== undefined && hasDb()) await q(`UPDATE os_market_appraisals SET landlord = $2 WHERE lead_id = $1`, [`os-${id}`, name]).catch(() => undefined);
      if (!contact.rexId) return NextResponse.json({ ok: true, person: out(contact), sync: { ok: false, detail: "Saved. Not in REX yet, so it goes across when they are." } });
      const sync = await pushContactUpdateToRex(contact, actor.id);
      await markRex(id, sync.ok ? "sent" : "failed", sync.detail, contact.rexId, actor.email);
      await audit(actor, contact.rexId, before, contact, sync.ok);
      return NextResponse.json({ ok: true, person: out(contact), sync: { ok: sync.ok, detail: sync.ok ? "Saved, and changed in REX." : `Saved here. REX not changed: ${sync.detail}` } });
    }

    /* The landlord the OS's own record of a home holds - REX PM's name for
       them, with no REX contact behind it (20 Oct 2026). It used to be read
       only everywhere it showed; now it is changed on the record itself.
       Never written to REX (James's hands-off rule). */
    if (ref.startsWith("home:")) {
      if (!hasDb()) return NextResponse.json({ ok: false, error: "No database here." }, { status: 503 });
      const key = ref.slice(5);
      const was = await recordLandlordFor(key);
      const rows = await recordRowsFor(key);
      if (!was || !rows.length) return NextResponse.json({ ok: false, error: "That home's record has no landlord to change. Use Add additional landlord." }, { status: 404 });
      const next = { name: name ?? was.name, email: email !== undefined ? email || null : was.email, phone: phone !== undefined ? phone || null : was.phone };
      await saveRecordLandlord(rows.map((r) => r.id), next);
      /* Every listing's held landlord for this home is read again. */
      await q(`DELETE FROM os_cache WHERE key LIKE 'landlord:v2:%' AND payload->>'propertyId' = $1`, [key]).catch(() => undefined);
      await record({
        kind: "record_landlord_saved",
        actorId: actor.id,
        actorEmail: actor.email,
        detail: `Home ${key}: landlord "${was.name}" ${was.email ?? ""} ${was.phone ?? ""} -> "${next.name}" ${next.email ?? ""} ${next.phone ?? ""}. OS record only, not REX.`,
      }).catch(() => undefined);
      return NextResponse.json({ ok: true, person: next, sync: { ok: true, detail: "Saved on the home's record." } });
    }

    /* A tenant REX PM names, with no REX contact behind them (Sean McMahon,
       21 Oct 2026: Megan at 3 Oak Place). Their email and number are the
       OS's own row (lib/tenant-contacts); never written to REX or REX PM.
       The card sends both, as it holds them, with the name it shows. */
    const pm = /^rexpm:([^:]+):\d+$/.exec(ref);
    if (pm) {
      if (!hasDb()) return NextResponse.json({ ok: false, error: "No database here." }, { status: 503 });
      if (name !== undefined) return NextResponse.json({ ok: false, error: "Their name comes from the tenancy record, so it can't be changed here. The email and number can." }, { status: 400 });
      const tenantName = clean(body?.tenantName, 200);
      if (!tenantName) return NextResponse.json({ ok: false, error: "Which tenant?" }, { status: 400 });
      const keep = (body?.keep ?? {}) as { email?: unknown; phone?: unknown };
      const next = {
        email: (email !== undefined ? email : clean(keep.email, 200)?.toLowerCase()) || null,
        phone: (phone !== undefined ? phone : clean(keep.phone, 40)) || null,
      };
      const before = (await tenantContacts().catch(() => new Map())).get(pm[1])?.get(nameKey(tenantName)) ?? null;
      await saveTenantContact(pm[1], tenantName, next, actor.email);
      await forgetBooks();
      await record({
        kind: "tenant_contact_saved",
        actorId: actor.id,
        actorEmail: actor.email,
        detail: `Home ${pm[1]}, tenant "${tenantName}": ${before?.email ?? ""} ${before?.phone ?? ""} -> ${next.email ?? ""} ${next.phone ?? ""}. OS only, not REX.`,
      }).catch(() => undefined);
      return NextResponse.json({ ok: true, person: { name: tenantName, email: next.email, phone: next.phone }, sync: { ok: true, detail: "Saved on the home's record." } });
    }

    /* A person who only exists in REX. */
    if (ref.startsWith("rex:") && /^\d+$/.test(ref.slice(4))) {
      if (!rexConfigured()) return NextResponse.json({ ok: false, error: "REX isn't connected here." }, { status: 503 });
      const rexId = ref.slice(4);
      /* With the name, email and phone sub-records: a plain read leaves the
         top-level name blank for many people (Stephanie McAuliffe, let 39522,
         22 Oct 2026 - "Their record has no name yet" for a person whose name
         is right there in REX), and the email and phone with it. */
      const now = await rexCall("Contacts", "read", { id: Number(rexId), extra_fields: ["related.contact_names", "related.contact_emails", "related.contact_phones"] });
      if (!now.ok) return NextResponse.json({ ok: false, error: "That person couldn't be read from the book just now. Try again in a minute." }, { status: 502 });
      const c = (now.result ?? {}) as Row;
      const rel = (c.related ?? {}) as { contact_names?: Row[]; contact_emails?: Row[]; contact_phones?: Row[] };
      const nameRow = rel.contact_names?.[0] ?? {};
      const primary = (rows: Row[] | undefined, flag: string) => rows?.find((r) => r[flag] === true || r[flag] === "1") ?? rows?.[0] ?? {};
      const wasFirst = str(nameRow.name_first) || str(c.name_first);
      const wasLast = str(nameRow.name_last) || str(c.name_last);
      const was = {
        name: [wasFirst, wasLast].filter(Boolean).join(" ") || str(c.name) || str(c.system_search_key),
        email: str(primary(rel.contact_emails, "email_primary").email_address) || str(c.email_address),
        mobile: str(primary(rel.contact_phones, "phone_primary").phone_number) || str(c.phone_number),
      };
      const next = { name: name ?? was.name, email: email ?? was.email, mobile: phone ?? was.mobile };
      /* REX refuses a person with no name (auto ticket 4c7e51e3, 15 Oct 2026:
         an email changed on a lead whose REX record had none). Say so here,
         before anything is sent, so the agent knows to add the name. */
      if (!next.name.trim()) {
        return NextResponse.json({ ok: false, needsName: true, error: "Their record has no name yet, so this can't be saved. Put their name in first, then try again." }, { status: 400 });
      }
      const [first, ...rest] = next.name.split(/\s+/);
      const contact = {
        id: `rex:${rexId}`, kind: "landlord", name: next.name,
        nameFirst: name !== undefined ? first : wasFirst || first,
        nameLast: name !== undefined ? rest.join(" ") : wasLast || rest.join(" "),
        email: next.email, mobile: next.mobile, address: "", postcode: "", rexId,
      } as unknown as OsContact;
      const sync = await pushContactUpdateToRex(contact, actor.id);
      if (!sync.ok) return NextResponse.json({ ok: false, error: `Not changed: ${sync.detail}`, sync }, { status: 409 });
      /* The OS's copies of them, so every screen shows the change at once. */
      if (hasDb()) {
        await q(`UPDATE os_leads SET name = $2, email = $3, phone = $4 WHERE contact_id = $1`, [rexId, next.name, next.email, next.mobile]).catch(() => undefined);
        if (name !== undefined) await q(`UPDATE os_market_appraisals SET landlord = $2 WHERE lead_id IN (SELECT id FROM os_leads WHERE contact_id = $1)`, [rexId, next.name]).catch(() => undefined);
        /* Any listing holding them as its landlord reads them again (20 Oct
           2026): the held copy lasts twelve hours, and a card redrawn from it
           would show the old number straight after the change. */
        await q(`DELETE FROM os_cache WHERE key LIKE 'landlord:v2:%' AND payload->'landlord'->>'contactId' = $1`, [rexId]).catch(() => undefined);
        /* The Portfolio book holds tenants and landlords for hours; read it again. */
        await forgetBooks().catch(() => undefined);
      }
      await audit(actor, rexId, was, next, true);
      return NextResponse.json({ ok: true, person: { name: next.name, email: next.email, phone: next.mobile }, sync: { ok: true, detail: "Changed in REX." } });
    }

    return NextResponse.json({ ok: false, error: "Which person?" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "That change didn't save.") }, { status: 500 });
  }
}

function out(c: OsContact) {
  return { name: c.name, email: c.email, phone: c.mobile };
}

async function audit(actor: { id: string; email: string }, rexId: string, before: { name?: string; email?: string; mobile?: string }, after: { name?: string; email?: string; mobile?: string }, mirrored: boolean) {
  const changed = (["name", "email", "mobile"] as const).filter((k) => (before[k] ?? "") !== (after[k] ?? ""));
  if (!changed.length) return;
  await record({
    kind: "rex_contact_updated",
    actorId: actor.id,
    actorEmail: actor.email,
    detail: `Contact ${rexId}: ${changed.map((k) => `${k} "${before[k] ?? ""}" -> "${after[k] ?? ""}"`).join("; ")}${mirrored ? "" : " (REX not updated)"}`,
  }).catch(() => undefined);
}
