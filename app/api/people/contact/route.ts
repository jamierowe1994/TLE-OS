import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import { rexCall, rexConfigured } from "@/lib/rex";
import { getContact, markRex, updateContact, type OsContact } from "@/lib/contacts-store";
import { pushContactUpdateToRex } from "@/lib/rex-contacts";
import { record } from "@/lib/audit";
import { publicError } from "@/lib/public-error";

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

    /* A person who only exists in REX. */
    if (ref.startsWith("rex:") && /^\d+$/.test(ref.slice(4))) {
      if (!rexConfigured()) return NextResponse.json({ ok: false, error: "REX isn't connected here." }, { status: 503 });
      const rexId = ref.slice(4);
      const now = await rexCall("Contacts", "read", { id: Number(rexId) });
      if (!now.ok) return NextResponse.json({ ok: false, error: "That person couldn't be read from the book just now. Try again in a minute." }, { status: 502 });
      const c = (now.result ?? {}) as Row;
      const was = { name: str(c.name) || [str(c.name_first), str(c.name_last)].filter(Boolean).join(" "), email: str(c.email_address), mobile: str(c.phone_number) };
      const next = { name: name ?? was.name, email: email ?? was.email, mobile: phone ?? was.mobile };
      const [first, ...rest] = next.name.split(/\s+/);
      const contact = {
        id: `rex:${rexId}`, kind: "landlord", name: next.name,
        nameFirst: name !== undefined ? first : str(c.name_first) || first,
        nameLast: name !== undefined ? rest.join(" ") : str(c.name_last) || rest.join(" "),
        email: next.email, mobile: next.mobile, address: "", postcode: "", rexId,
      } as unknown as OsContact;
      const sync = await pushContactUpdateToRex(contact, actor.id);
      if (!sync.ok) return NextResponse.json({ ok: false, error: `Not changed: ${sync.detail}`, sync }, { status: 409 });
      /* The OS's copies of them, so every screen shows the change at once. */
      if (hasDb()) {
        await q(`UPDATE os_leads SET name = $2, email = $3, phone = $4 WHERE contact_id = $1`, [rexId, next.name, next.email, next.mobile]).catch(() => undefined);
        if (name !== undefined) await q(`UPDATE os_market_appraisals SET landlord = $2 WHERE lead_id IN (SELECT id FROM os_leads WHERE contact_id = $1)`, [rexId, next.name]).catch(() => undefined);
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
