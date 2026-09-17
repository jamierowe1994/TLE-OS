import "server-only";
import { hasDb, q } from "@/lib/db";
import { uid } from "@/lib/auth";
import type { OsUser } from "@/lib/users";
import { saveContact } from "@/lib/contacts-store";
import { createAppraisal } from "@/lib/appraisal-store";
import { landlordByEmail, upsertLandlordAccount } from "@/lib/landlord-account";
import { startVerification } from "@/lib/verification";
import { createPassport, markInvited } from "@/lib/passport";
import { renderTleEmail } from "@/lib/email/tle-emails";
import { sendEmail } from "@/lib/resend";
import { isInternalAddress } from "@/lib/email-policy";
import { createCase } from "@/lib/plc-store";
import { removeFromOutlook } from "@/lib/outlook-calendar";
import { changeRexEvent } from "@/lib/rex-diary-write";
import { KITS, type KitId, type TestWho } from "@/lib/testing-journeys";

/**
 * CREATE A TEST.
 *
 * Howard, 15 Sep 2026: a tester goes down the list, presses a button, and has
 * something real to work from - then checks it works, checks it looks right,
 * and ticks it. So each kit makes the STARTING record of a flow, on the real
 * screens and the real tables, not a sandbox copy that proves nothing:
 *
 *   tenant-enquiry    a tenant lead
 *   landlord-lead     a landlord lead
 *   booked-appraisal  a landlord lead, an appraisal in three days, and a way
 *                     in as that landlord (the confirmation is left for
 *                     the tester to review and send, as on a real booking)
 *   tenant-passport   a tenant lead, a passport, the invite email
 *   plc-pack          an empty PLC pack for a test application
 *
 * ── The customer is the tester ───────────────────────────────────────────
 *
 * Every landlord and tenant made here carries the TESTER'S OWN email, and it
 * must be one of ours (lib/email-policy). So every email the flow sends -
 * now, or later when they press something - lands in their own inbox, where
 * they can read it, open its links, and reply to it. lib/resend lets a
 * customer email to our own address through the customer switch for exactly
 * this, so testing works during a pilot that has customer email off.
 *
 * ── Never REX, and cleared in one press ──────────────────────────────────
 *
 * Test contacts are flagged is_test: never pushed to REX, never listed as
 * waiting to be. Everything a kit made is written down in os_test_kits, and
 * Clear my tests deletes exactly that and nothing else.
 *
 * The one thing not kept is the landlord's sign-in link: it is a credential,
 * so it goes back in the answer to the press and a fresh one is minted when
 * asked for, rather than sitting in a table.
 */

export interface KitLink {
  who: TestWho;
  label: string;
  href: string;
}

export interface KitRun {
  id: string;
  kit: KitId;
  createdAt: string;
  byName: string;
  links: KitLink[];
  /** What happened, in sentences: what was made, what was emailed, and anything that did not go. */
  said: string;
  /** For a booked appraisal: a landlord sign-in can be minted again. */
  canRelink: boolean;
}

interface Refs {
  contacts?: string[];
  appraisals?: string[];
  leadIds?: string[];
  passports?: string[];
  plcCases?: string[];
  landlordEmail?: string;
}

export class KitRefused extends Error {}

const TEST_ADDRESS = "14 Test Street, Didsbury, Manchester";
const TEST_POSTCODE = "M20 2RN";

function firstNameOf(me: OsUser): string {
  return (me.name || me.email.split("@")[0]).trim().split(/\s+/)[0] || "Tester";
}

/** 11am (or any hour) London time, `days` from today, as an ISO instant. */
export function londonAt(days: number, hour: number, now = new Date()): string {
  const day = new Date(now.getTime() + days * 86400000);
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(day);
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, 0, 0);
  const shown = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "numeric", hourCycle: "h23" }).format(new Date(guess))
  );
  return new Date(guess - (shown - hour) * 3600000).toISOString();
}

async function landlordLink(email: string, origin: string): Promise<string> {
  const match = await landlordByEmail(email);
  if (!match) throw new KitRefused("The appraisal was made, but the landlord portal does not recognise it yet.");
  await upsertLandlordAccount(match);
  const { token } = await startVerification(email, "landlord");
  return `${origin}/landlord/enter?token=${encodeURIComponent(token)}`;
}

/**
 * Make one test. Returns the run with its links; a landlord sign-in link, when
 * there is one, is in the returned links but never in the stored ones.
 */
export async function runKit(kit: KitId, me: OsUser, origin: string): Promise<KitRun> {
  if (!hasDb()) throw new KitRefused("There is no database here, so a test has nowhere to live.");
  if (!KITS[kit]) throw new KitRefused("That is not a test we can create.");
  const email = me.email.trim().toLowerCase();
  if (!isInternalAddress(email)) {
    throw new KitRefused("Tests are made with your own email as the customer's, and yours is not one of ours, so nothing could safely be sent.");
  }

  const first = firstNameOf(me);
  const refs: Refs = {};
  const stored: KitLink[] = [];
  const once: KitLink[] = [];
  const said: string[] = [];

  const contact = async (kind: "tenant" | "landlord") => {
    const c = await saveContact(
      {
        kind,
        name: `${first} (test ${kind})`,
        email,
        mobile: "07700 900000",
        address: kind === "landlord" ? TEST_ADDRESS : "",
        postcode: kind === "landlord" ? TEST_POSTCODE : "",
        source: "Create a test",
        enquiry: kind === "tenant" ? "Looking for a two-bed in Didsbury from next month. (Test enquiry.)" : "Thinking of letting 14 Test Street. (Test lead.)",
        notes: "Made by Admin → Testing. Kept out of REX; cleared from there.",
      },
      email,
      { isTest: true }
    );
    refs.contacts = [...(refs.contacts ?? []), c.id];
    refs.leadIds = [...(refs.leadIds ?? []), `os-${c.id}`];
    return c;
  };

  if (kit === "tenant-enquiry" || kit === "landlord-lead") {
    const kind = kit === "tenant-enquiry" ? "tenant" : "landlord";
    const c = await contact(kind);
    stored.push({ who: "agent", label: "Open the lead", href: `/leads?side=${kind}&open=os-${c.id}` });
    said.push(`Made ${c.name}, with ${email} as their email. Nothing has been sent yet.`);
  }

  if (kit === "booked-appraisal") {
    const c = await contact("landlord");
    const leadId = `os-${c.id}`;
    const ma = await createAppraisal({
      leadId,
      landlord: c.name,
      address: TEST_ADDRESS,
      postcode: TEST_POSTCODE,
      agent: me.name || email,
      appointmentAt: londonAt(3, 11),
    });
    refs.appraisals = [ma.id];
    refs.landlordEmail = email;
    stored.push({ who: "agent", label: "Open the appraisal", href: `/market-appraisals/${encodeURIComponent(ma.id)}` });
    stored.push({ who: "agent", label: "Open the lead", href: `/leads?side=landlord&open=${leadId}` });
    const when = new Date(ma.appointmentAt!).toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
    said.push(`Booked an appraisal at ${TEST_ADDRESS} for ${when}.`);

    /* Not sent (17 Sep 2026). Booking never sends the confirmation now - the
       agent reviews and sends it from the file - so the test starts where a
       real booking does, and checking that step is part of the test. */
    said.push(`The booking confirmation has NOT been sent: open the appraisal to read it, change it if you like, and send it to ${email}.`);

    try {
      once.push({ who: "landlord", label: "Open the landlord portal as them", href: await landlordLink(email, origin) });
      said.push("The landlord portal link works once and lasts 24 hours - open it in a private window so it does not sign you out of the OS.");
    } catch (e) {
      said.push(`No landlord portal link: ${e instanceof Error ? e.message.replace(/\.$/, "") : "it could not be made"}.`);
    }
  }

  if (kit === "tenant-passport") {
    const c = await contact("tenant");
    const passport = await createPassport({ name: c.name, email, contactId: c.id, agentId: me.id });
    refs.passports = [passport.token];
    const path = `/tenant/passport/${passport.token}`;
    stored.push({ who: "tenant", label: "Open the passport", href: path });
    stored.push({ who: "agent", label: "Open the lead", href: `/leads?side=tenant&open=os-${c.id}` });

    const whenPretty = new Date(londonAt(2, 17)).toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
    try {
      const { subject, html } = renderTleEmail("tenant-passport-invite", {
        firstName: first,
        address: "Flat 2, 30 Test Road, Didsbury",
        whenPretty,
        agentName: me.name || "Your agent",
        meetLine: `${me.name || "Your agent"} will meet you there.`,
        link: `${origin}${path}`,
      });
      await sendEmail({ to: email, subject, html, audience: "customer", replyTo: email });
      await markInvited(passport.token, me.name || email);
      said.push(`The Viewing Booked invite, with the passport link, is on its way to ${email}.`);
    } catch (e) {
      said.push(`The passport is made, but the invite did not send: ${e instanceof Error ? e.message.replace(/\.$/, "") : "unknown"}.`);
    }
  }

  if (kit === "plc-pack") {
    const ref = `TEST-${uid().slice(0, 6).toUpperCase()}`;
    const pack = await createCase({
      applicationRef: ref,
      address: "Flat 2, 30 Test Road, Didsbury, Manchester M20 2RN",
      agentName: me.name || email,
      agentEmail: email,
      moveInDate: londonAt(21, 12).slice(0, 10),
    });
    refs.plcCases = [pack.id];
    stored.push({ who: "agent", label: "Open the pack", href: `/plc?case=${encodeURIComponent(pack.id)}` });
    stored.push({ who: "compliance", label: "Open it on the PLC queue", href: `/pre-tenancy/plc?case=${encodeURIComponent(pack.id)}` });
    said.push(`Opened an empty pack for test application ${ref}, moving in three weeks from today. Attach documents as the agent, then send it to pre-tenancy.`);
  }

  const id = uid();
  const text = said.join(" ");
  await q(
    `INSERT INTO os_test_kits (id, kit, created_by, by_name, refs, links, said)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)`,
    [id, kit, email, me.name || email, JSON.stringify(refs), JSON.stringify(stored), text]
  );

  return {
    id,
    kit,
    createdAt: new Date().toISOString(),
    byName: me.name || email,
    links: [...stored, ...once],
    said: text,
    canRelink: Boolean(refs.landlordEmail),
  };
}

type KitRow = {
  id: string; kit: string; by_name: string; created_at: Date | string;
  refs: Refs; links: KitLink[]; said: string;
};

/** This person's tests that have not been cleared, newest first. */
export async function myKits(email: string): Promise<KitRun[]> {
  if (!hasDb()) return [];
  const rows = await q<KitRow>(
    `SELECT id, kit, by_name, created_at, refs, links, said FROM os_test_kits
      WHERE created_by = $1 AND cleared_at IS NULL ORDER BY created_at DESC LIMIT 50`,
    [email.trim().toLowerCase()]
  );
  return rows
    .filter((r) => r.kit in KITS)
    .map((r) => ({
      id: r.id,
      kit: r.kit as KitId,
      createdAt: new Date(r.created_at).toISOString(),
      byName: r.by_name,
      links: Array.isArray(r.links) ? r.links : [],
      said: r.said,
      canRelink: Boolean(r.refs?.landlordEmail),
    }));
}

/** A fresh landlord portal link for one of this person's booked-appraisal tests. */
export async function relinkKit(id: string, me: OsUser, origin: string): Promise<string> {
  if (!hasDb()) throw new KitRefused("There is no database here.");
  const email = me.email.trim().toLowerCase();
  const rows = await q<{ refs: Refs }>(
    `SELECT refs FROM os_test_kits WHERE id = $1 AND created_by = $2 AND cleared_at IS NULL`,
    [id, email]
  );
  if (!rows[0]?.refs?.landlordEmail) throw new KitRefused("That test has no landlord to sign in as.");
  return landlordLink(email, origin);
}

/**
 * Delete everything this person's tests made, and only that.
 *
 * By the ids written down when each was made - never by a name or an address
 * pattern, which is how a clear-up deletes somebody real.
 */
export async function clearMyKits(me: OsUser): Promise<{ cleared: number }> {
  if (!hasDb()) return { cleared: 0 };
  const email = me.email.trim().toLowerCase();
  const rows = await q<{ id: string; refs: Refs }>(
    `SELECT id, refs FROM os_test_kits WHERE created_by = $1 AND cleared_at IS NULL`,
    [email]
  );
  if (!rows.length) return { cleared: 0 };

  const all = (k: keyof Refs) => rows.flatMap((r) => (Array.isArray(r.refs?.[k]) ? (r.refs[k] as string[]) : []));
  const contacts = all("contacts");
  const appraisals = all("appraisals");
  const leadIds = all("leadIds");
  const passports = all("passports");
  const plcCases = all("plcCases");

  const run = (sql: string, ids: string[]) => (ids.length ? q(sql, [ids]).catch(() => []) : Promise.resolve([]));

  /* WHAT A TEST SET GOING, not just what it made (17 Sep 2026). Clearing
     James's tests left a pre-presentation and a video reminder queued for the
     next two days, the appointment in his Outlook and in REX's diary, and the
     travel time around it. Taken back out first, while the ids that find them
     still exist. */
  const refIds = [...leadIds, ...appraisals];
  await run(`UPDATE os_scheduled_sends SET state = 'cancelled', error = 'Test cleared' WHERE state = 'queued' AND ref = ANY($1)`, refIds);
  for (const id of appraisals) {
    await removeFromOutlook(me.id, `appraisal|${id}`).catch(() => null);
    const rex = await q<{ payload: { eventId?: string } }>(`SELECT payload FROM os_case_state WHERE kind = 'rex-diary' AND record_id = $1`, [id]).catch(() => []);
    if (rex[0]?.payload?.eventId) await changeRexEvent({ userId: me.id, eventId: rex[0].payload.eventId, cancel: { reason: "organiser" } }).catch(() => null);
  }
  const viewingKeys = leadIds.length
    ? await q<{ record_id: string }>(`SELECT record_id FROM os_case_state WHERE kind = 'outlook-event' AND split_part(record_id, '|', 2) = ANY($1) AND record_id LIKE 'viewing|%'`, [leadIds]).catch(() => [])
    : [];
  for (const v of viewingKeys) await removeFromOutlook(me.id, v.record_id).catch(() => null);
  await run(`DELETE FROM os_case_state WHERE kind = 'confirmation-sent' AND split_part(record_id, '|', 2) = ANY($1)`, refIds);
  const rexViewings = leadIds.length
    ? await q<{ payload: { eventId?: string } }>(`SELECT payload FROM os_case_state WHERE kind = 'rex-viewing' AND split_part(record_id, '|', 1) = ANY($1)`, [leadIds]).catch(() => [])
    : [];
  for (const r of rexViewings) {
    if (r.payload?.eventId) await changeRexEvent({ userId: me.id, eventId: r.payload.eventId, cancel: { reason: "organiser" } }).catch(() => null);
  }
  await run(`DELETE FROM os_case_state WHERE kind = 'rex-viewing' AND split_part(record_id, '|', 1) = ANY($1)`, leadIds);
  /* Only rows still flagged as tests, so an id that somehow pointed at a real
     contact is left alone. */
  await run(`DELETE FROM os_contacts WHERE id = ANY($1) AND is_test`, contacts);
  await run(`DELETE FROM os_market_appraisals WHERE id = ANY($1)`, appraisals);
  await run(`DELETE FROM os_case_state WHERE record_id = ANY($1)`, [...leadIds, ...appraisals]);
  await run(`DELETE FROM os_presentations WHERE ref = ANY($1)`, refIds);
  await run(`DELETE FROM os_tenant_passports WHERE token = ANY($1)`, passports);
  await run(`DELETE FROM os_plc_cases WHERE id = ANY($1)`, plcCases);
  if (rows.some((r) => r.refs?.landlordEmail)) {
    /* The tester's landlord portal account and any unspent link. Theirs by
       email, and the email is one of ours, so no real landlord shares it. */
    await q(`DELETE FROM os_email_verifications WHERE email = $1 AND purpose = 'landlord'`, [email]).catch(() => []);
    await q(`DELETE FROM os_portal_accounts WHERE email = $1 AND kind = 'landlord'`, [email]).catch(() => []);
  }
  await q(`UPDATE os_test_kits SET cleared_at = NOW() WHERE id = ANY($1)`, [rows.map((r) => r.id)]);
  return { cleared: rows.length };
}
