import "server-only";
import { hasDb, q } from "@/lib/db";
import type { OsUser } from "@/lib/users";
import { findUserByEmail } from "@/lib/users";
import type { AreaLevel } from "@/lib/area-map";
import { areaRows, setAreaLevel } from "@/lib/area-access";
import { allSwitches, setSwitch, SWITCHES, sendingLocked } from "@/lib/switches";
import { removeAllTesting } from "@/lib/test-files";
import { addInvite, invites, markInviteSent } from "@/lib/pilot";
import { lettingsAgents } from "@/lib/rex-agents";
import { startVerification } from "@/lib/verification";
import { pilotInviteEmail } from "@/lib/email/pilot-email";
import { phaseAnnouncement } from "@/lib/email/phase-email";
import { sendEmail } from "@/lib/resend";
import { isInternalAddress } from "@/lib/email-policy";
import { record } from "@/lib/audit";

/**
 * THE PILOT, IN THREE PHASES (James, 21 Sep 2026).
 *
 * "I just need them as really simple switches... I click the button, all of
 * the invites go out... When I click Phase 2, it will then change all of the
 * permissions in areas for me automatically, so I don't have to look at that."
 *
 * The area levels and the switches stay exactly as they are - fourteen
 * switches and twelve areas, each with its own reason. A phase is nothing but
 * a NAMED SETTING of them, written down once here, so that the button, the
 * screen that describes the button and the thing that actually happens are
 * the same list and cannot drift apart.
 *
 *   1  Practice   The pilot list is invited. The front office opens in PRACTICE:
 *                 real records are look only, each person's own test files
 *                 work in full and can be reset. Nothing reaches a customer,
 *                 REX or Propoly. The back office stays hidden.
 *   2  Working    The front office is real, nothing outward goes, test files stay:
 *                 what an agent does is real, and email reaches customers.
 *   3  Go live    Test files cleared, email and portals on, back office hidden.
 *   4  Back office  Portfolio, Emails, Finances and Tools open.
 *
 * ── What a phase deliberately does NOT touch ──────────────────────────────
 *
 * Anything that acts with nobody in the loop, or that is waiting on somebody
 * else: automatic tenant emails, nurture campaigns, the certificate share, the
 * handover (Howard's Power Automate flow has to be switched off the same day),
 * documents into Propoly, certificates into REX. Those are armed one at a time
 * on Admin, Switches, by somebody who has read what each one does. A phase
 * turns on what an agent PRESSING A BUTTON needs, and nothing else.
 *
 * Phase 1 turns the customer-facing ones OFF even if they were already off,
 * because "it was off when I looked" is not the same promise as "this button
 * turned it off".
 *
 * ── Order, because the order is the safety ────────────────────────────────
 *
 * Locks first, doors second. Phase 1 sets every switch and every area BEFORE
 * a single invitation is sent, and if any of that fails it stops there, with
 * nobody invited. Nobody can arrive in a building that is not yet locked.
 */

export type PhaseId = 1 | 2 | 3 | 4;

const FRONT = ["dashboard", "leads", "appraisals", "listings", "listing-edit", "listing-publish", "viewings", "applications"];
/* Everything but Push to the portals: that is the one front-office door that
   reaches the public, and it stays shut until launch (James, 22 Sep 2026). */
const FRONT_WITHOUT_PORTALS = FRONT.filter((a) => a !== "listing-publish");
const BACK_ALL = ["portfolio", "emails", "finances", "tools"];

const all = (ids: string[], level: AreaLevel) => Object.fromEntries(ids.map((id) => [id, level])) as Record<string, AreaLevel>;

/** Reaches a customer, REX or Propoly. Off for the whole of phase 1. */
const OUTWARD_OFF_IN_1 = [
  "customer_email", "tenant_reminders", "campaign_sending", "certificate_share",
  "handover_live", "propoly_documents", "rex_contact_create", "rex_property_create",
];

export interface PhaseDef {
  id: PhaseId;
  name: string;
  /** Typed to press it. Short, and different for each, so muscle memory cannot press the wrong one. */
  confirm: string;
  says: string;
  areas: Record<string, AreaLevel>;
  switches: Record<string, boolean>;
  /** In the order they happen, in words James can check against what he meant. */
  steps: string[];
}

export const PHASES: PhaseDef[] = [
  {
    id: 1,
    name: "Practice",
    confirm: "PHASE 1",
    says: "The pilot list is invited and can explore. Real records are look only; their own test files work in full. Nothing goes out.",
    areas: { ...all(FRONT, "practice"), ...all(BACK_ALL, "hidden") },
    switches: Object.fromEntries(OUTWARD_OFF_IN_1.map((k) => [k, false])),
    steps: [
      "Turns OFF everything that reaches a customer, REX or Propoly.",
      "Puts Dashboard, Leads, Market appraisals, Listings, Viewings and Applications on Practice. Hides Portfolio, Emails, Finances and Tools.",
      "Only then: emails an invitation to the people on the pilot list below, and to nobody else.",
      "They can connect their email, write their bio, open every front-office screen, and add and reset their own test files.",
    ],
  },
  /* REDRAWN 22 Sep 2026, launch morning. Practice was too tight: an agent
     could not open the presenter on a file, or see what the landlord would
     see. James: "give them some access to stuff, maybe just not emailing
     landlords and tenants, and maybe not pushing to portals". So 2 is the
     real front office with the two outward doors shut and the test files
     kept (that is how they walk the landlord's and tenant's portals), and 3
     is launch: email on, portals on, back office open, test files cleared. */
  {
    id: 2,
    name: "Working",
    confirm: "PHASE 2",
    says: "The front office is real: what an agent does saves, and reaches REX. Nothing is emailed to a landlord or a tenant, nothing is pushed to the portals, and their test files stay so they can walk both portals.",
    areas: { ...all(FRONT_WITHOUT_PORTALS, "everyone"), "listing-publish": "hidden", ...all(BACK_ALL, "hidden") },
    switches: {
      customer_email: false, tenant_reminders: false, campaign_sending: false, certificate_share: false,
      handover_live: false, propoly_documents: false,
      assistant_email: true, rex_contact_create: true, rex_property_create: true,
    },
    steps: [
      "Keeps OFF every email to a landlord or a tenant, the automatic tenant emails, campaigns and certificate sharing. Handover into Propoly stays off.",
      "Turns ON creating contacts and properties in REX, so what an agent does is real.",
      "Puts Dashboard, Leads, Market appraisals, Listings (with Edit the advert), Viewings and Applications on Everyone. Push to the portals stays hidden. Portfolio, Emails, Finances and Tools stay hidden.",
      "Keeps everybody's test files, and Practice Files on the rail, so an agent can open the landlord's and the tenant's portal on their own file.",
      "Emails everybody with an account to say Phase 2 has started.",
    ],
  },
  /* FOUR, not three (James, 22 Sep 2026, evening): "rather than launch, we
     would then turn on the landlord and tenant emails and agents from
     Outlook, and push the portals. We would still keep compliance,
     maintenance and inspections back, and do that on a fourth push." */
  {
    id: 3,
    name: "Go live",
    confirm: "PHASE 3",
    says: "Test files are cleared. Email reaches landlords and tenants from the agent's own Outlook, and listings can be pushed to the portals. The back office stays hidden.",
    areas: { ...all(FRONT, "everyone"), ...all(BACK_ALL, "hidden") },
    switches: { customer_email: true, assistant_email: true },
    steps: [
      "Removes every tester's test files, so nothing from practice is left behind.",
      "Turns ON email to landlords and tenants, from the agent's own Outlook.",
      "Puts Push to the portals on Everyone. Portfolio, Emails, Finances and Tools stay hidden.",
      "Emails everybody with an account to say Phase 3 has started. The automatic tenant emails, campaigns, certificate sharing and the Propoly handover are still armed one at a time on Switches.",
    ],
  },
  {
    id: 4,
    name: "Back office",
    confirm: "PHASE 4",
    says: "Portfolio, with Compliance, Maintenance and Inspections, plus Emails, Finances and Tools open to everybody.",
    areas: all(BACK_ALL, "everyone"),
    switches: {},
    steps: [
      "Puts Portfolio (with Compliance, Maintenance and Inspections), Emails, Finances and Tools on Everyone.",
      "Emails everybody with an account to say Phase 4 has started.",
    ],
  },
];

export const phaseDef = (id: number): PhaseDef | null => PHASES.find((p) => p.id === id) ?? null;

/* ── where we are ────────────────────────────────────────────────────────── */

const KEY = "pilot_phase";

export interface PhaseState {
  phase: 0 | PhaseId;
  at: string | null;
  by: string | null;
  history: { phase: PhaseId; at: string; by: string; invited: number; announced: number }[];
}

export async function phaseState(): Promise<PhaseState> {
  const none: PhaseState = { phase: 0, at: null, by: null, history: [] };
  if (!hasDb()) return none;
  const rows = await q<{ value: Partial<PhaseState> | null }>(`SELECT value FROM os_settings WHERE key = $1`, [KEY]).catch(() => []);
  const v = rows[0]?.value;
  if (!v || ![1, 2, 3].includes(Number(v.phase))) return none;
  return { phase: Number(v.phase) as PhaseId, at: v.at ?? null, by: v.by ?? null, history: Array.isArray(v.history) ? v.history : [] };
}

/* ── who the pilot is ────────────────────────────────────────────────────── */

/**
 * THE PILOT LIST (James, 21 Sep 2026, the same afternoon phases went live).
 *
 * "It shouldn't go out to everybody. It should go out to a selected pilot
 * list... this is trying to include everybody."
 *
 * The first version of the Phase 1 card ticked the whole lettings roster and
 * left James to untick - which puts the mistake one missed checkbox away from
 * twenty people who were never meant to be asked. It is the other way round
 * now: NOBODY is invited unless they are on this list, the list starts empty,
 * and it is checked again on the server when the button is pressed, so a
 * browser tab left open from before cannot invite anybody who has since been
 * taken off.
 *
 * Who is on it was agreed between James and Susan, and it is theirs to keep:
 * it is saved from the Phases screen, not written into the code.
 */
const LIST_KEY = "pilot_list";

export async function pilotList(): Promise<string[]> {
  if (!hasDb()) return [];
  const rows = await q<{ value: { emails?: unknown } | null }>(`SELECT value FROM os_settings WHERE key = $1`, [LIST_KEY]).catch(() => []);
  const emails = rows[0]?.value?.emails;
  return Array.isArray(emails) ? emails.filter((e): e is string => typeof e === "string").map((e) => e.toLowerCase()) : [];
}

export async function setPilotList(emails: string[], me: OsUser): Promise<string[]> {
  if (me.role !== "owner") throw new PhaseRefused("Only an owner can change the pilot list.");
  const clean = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@") && isInternalAddress(e)))].slice(0, 60);
  await q(
    `INSERT INTO os_settings (key, value, updated_at, updated_by) VALUES ($1, $2::jsonb, NOW(), $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [LIST_KEY, JSON.stringify({ emails: clean }), me.email]
  );
  await record({ kind: "phase_changed", actorId: me.id, actorEmail: me.email, detail: `Pilot list set: ${clean.length} people` });
  return clean;
}

/* ── what pressing it would do, before it is pressed ─────────────────────── */

export interface PhasePreview {
  areas: { id: string; label: string; from: AreaLevel; to: AreaLevel }[];
  switches: { key: string; label: string; from: boolean; to: boolean }[];
  /** Phase 1 only: the lettings roster, and where each person stands. */
  roster: { email: string; name: string; rexId: string; hasAccount: boolean; invitedAt: string | null; inPilot: boolean }[];
  /** Phases 2 to 4: who the announcement goes to. */
  announceTo: number;
  testFiles: number;
  sendingLocked: boolean;
}

export async function previewPhase(id: PhaseId): Promise<PhasePreview> {
  const def = phaseDef(id)!;
  const [rows, switches] = await Promise.all([areaRows(), allSwitches()]);
  const areas = rows
    .filter((r) => def.areas[r.id] && def.areas[r.id] !== r.level)
    .map((r) => ({ id: r.id, label: r.label, from: r.level, to: def.areas[r.id] }));
  const sw = switches
    .filter((s) => s.key in def.switches && def.switches[s.key] !== s.on)
    .map((s) => ({ key: s.key, label: s.label, from: s.on, to: def.switches[s.key] }));

  let roster: PhasePreview["roster"] = [];
  if (id === 1) {
    const [lettings, invited, list] = await Promise.all([lettingsAgents().catch(() => []), invites().catch(() => []), pilotList()]);
    const pilot = new Set(list);
    const sent = new Map(invited.map((i) => [i.email.toLowerCase(), i.sentAt ?? null]));
    /* Somebody invited by hand from Pre-launch as an agent (James Crumpton is
       at The Property Experts, so not on the lettings roster) belongs on this
       card with the same tick as everybody else (James, 22 Sep 2026). */
    const known = new Set(lettings.map((a) => a.email.toLowerCase()));
    const byHand = invited
      .filter((i) => (i.role ?? "agent") === "agent" && !known.has(i.email.toLowerCase()))
      .map((i) => ({ id: i.rexUserId ?? "", name: i.name || i.email, email: i.email.toLowerCase() }));
    const agents = [...lettings, ...byHand];
    roster = await Promise.all(
      agents.map(async (a) => ({
        email: a.email.toLowerCase(),
        name: a.name,
        rexId: a.id,
        hasAccount: Boolean(await findUserByEmail(a.email).catch(() => null)),
        invitedAt: sent.get(a.email.toLowerCase()) ?? null,
        inPilot: pilot.has(a.email.toLowerCase()),
      }))
    );
  }
  const accounts = hasDb() ? await q<{ n: string }>(`select count(*)::text as n from os_users where role = 'agent'`).catch(() => []) : [];
  const files = hasDb() ? await q<{ n: string }>(`select count(*)::text as n from os_test_kits where cleared_at is null`).catch(() => []) : [];
  return {
    areas, switches: sw, roster,
    announceTo: Number(accounts[0]?.n ?? 0),
    testFiles: Number(files[0]?.n ?? 0),
    sendingLocked: sendingLocked(),
  };
}

/* ── pressing it ─────────────────────────────────────────────────────────── */

export class PhaseRefused extends Error {}

export interface PhaseResult {
  phase: PhaseId;
  invited: string[];
  inviteFailed: { email: string; why: string }[];
  announced: number;
  filesRemoved: number;
}

export async function applyPhase(p: {
  id: PhaseId; typed: string; me: OsUser; origin: string;
  /** Phase 1: the roster emails that were ticked. Nobody else is invited. */
  invite?: string[];
  /** Phases 2 and 3: send the "it has started" email. */
  announce?: boolean;
}): Promise<PhaseResult> {
  const def = phaseDef(p.id);
  if (!def) throw new PhaseRefused("No such phase.");
  if (p.me.role !== "owner") throw new PhaseRefused("Only an owner can move the pilot on.");
  if (!hasDb()) throw new PhaseRefused("No database here, so nothing can be saved.");
  if (p.typed.trim().toUpperCase() !== def.confirm) throw new PhaseRefused(`Type ${def.confirm} to do this.`);
  const turningOn = Object.values(def.switches).some(Boolean);
  if (turningOn && sendingLocked()) {
    throw new PhaseRefused("SENDING_LOCKED is set on Railway, which holds every switch off. Clear it first, or this phase would say it is live while nothing sends.");
  }

  const who = p.me.email;

  /* 3 clears practice away BEFORE customer email goes on, so a test landlord
     can never receive a real email. It never sends one itself (lib/test-files).
     2 keeps them: with nothing outward switched on they are how an agent
     walks both portals. */
  let filesRemoved = 0;
  if (p.id === 3) filesRemoved = (await removeAllTesting(p.me)).files;

  /* Locks. OFF before ON, switches before areas: at every moment on the way
     through, less is possible than at the end, never more. */
  const order = Object.entries(def.switches).sort(([, a], [, b]) => Number(a) - Number(b));
  for (const [key, on] of order) {
    const sw = SWITCHES.find((s) => s.key === key);
    if (!sw) throw new PhaseRefused(`Unknown switch ${key}.`);
    /* The phase's own typed word stands in for each switch's. One deliberate
       act, said once, rather than four typed in a row until they mean nothing. */
    const done = await setSwitch(key, on, who, sw.confirm);
    if (!done.ok) throw new PhaseRefused(`Could not set "${sw.label}": ${done.error} Nothing after it was changed, and nobody was emailed.`);
  }
  for (const [area, level] of Object.entries(def.areas)) {
    await setAreaLevel(area, level, who);
  }

  /* Doors. */
  const invited: string[] = [];
  const inviteFailed: PhaseResult["inviteFailed"] = [];
  if (p.id === 1 && p.invite?.length) {
    const roster = new Map((await lettingsAgents()).map((a) => [a.email.toLowerCase(), a]));
    /* The saved list is the authority, not what the browser sent - see pilotList. */
    const pilot = new Set(await pilotList());
    for (const raw of p.invite) {
      const email = raw.trim().toLowerCase();
      if (!pilot.has(email)) { inviteFailed.push({ email, why: "not on the pilot list" }); continue; }
      const agent = roster.get(email);
      /* Only somebody on the lettings roster, only one of our own addresses,
         and never somebody who already has an account. */
      if (!agent || !isInternalAddress(email)) { inviteFailed.push({ email, why: "not on the lettings roster" }); continue; }
      if (await findUserByEmail(email).catch(() => null)) continue;
      try {
        await addInvite({ email, name: agent.name, rexUserId: agent.id, role: "agent", by: who });
        const { token } = await startVerification(email, "join");
        const mail = pilotInviteEmail(`${p.origin}/join?token=${encodeURIComponent(token)}`, agent.name.trim().split(/\s+/)[0] || undefined);
        await sendEmail({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
        await markInviteSent(email);
        invited.push(email);
      } catch (e) {
        inviteFailed.push({ email, why: e instanceof Error ? e.message : "would not send" });
      }
    }
  }

  let announced = 0;
  if (p.id !== 1 && p.announce) {
    const people = await q<{ email: string; name: string }>(`select email, name from os_users where role = 'agent'`).catch(() => []);
    for (const person of people) {
      if (!isInternalAddress(person.email)) continue;
      const mail = phaseAnnouncement(p.id, `${p.origin}/dashboard`, (person.name ?? "").trim().split(/\s+/)[0] || undefined);
      try {
        await sendEmail({ to: person.email, subject: mail.subject, html: mail.html, text: mail.text });
        announced += 1;
      } catch {
        /* The phase has moved; a colleague who was not told is told in person. */
      }
    }
  }

  const before = await phaseState();
  const now = new Date().toISOString();
  const state: PhaseState = {
    phase: p.id, at: now, by: p.me.name || who,
    history: [...before.history, { phase: p.id, at: now, by: p.me.name || who, invited: invited.length, announced }].slice(-20),
  };
  await q(
    `INSERT INTO os_settings (key, value, updated_at, updated_by) VALUES ($1, $2::jsonb, NOW(), $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [KEY, JSON.stringify(state), who]
  );
  await record({
    kind: "phase_changed", actorId: p.me.id, actorEmail: who,
    detail: `Phase ${p.id} (${def.name}): ${invited.length} invited, ${announced} told, ${filesRemoved} test files removed`,
  });
  return { phase: p.id, invited, inviteFailed, announced, filesRemoved };
}
