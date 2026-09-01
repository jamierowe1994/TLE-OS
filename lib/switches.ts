import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * What is armed — decided in the product, not in Railway.
 *
 * James, 29 Aug: "rather than me having to go in and do variables, I should
 * have toggles in my settings where I can turn it on and off... at the moment
 * I'm going to have to sit down on the day it goes live and type in a tonne of
 * variables. Sometimes we might need to toggle them on and off for testing."
 *
 * ── What an environment variable was actually buying ──────────────────────
 *
 * Nobody chose env vars for safety; they are simply where a flag goes when
 * there is no product yet. But the awkwardness was doing real work. You cannot
 * arm outbound mail from your phone by accident, and a deploy leaves a trail.
 * Replacing them with a toggle removes that protection, so the protection has
 * to move rather than evaporate. Three things carry it:
 *
 *   1. A TYPED CONFIRMATION, checked on the SERVER. A dialog that only the
 *      browser enforces protects nobody — the request is one curl away.
 *   2. OWNER ONLY. `manage:roles` is the nearest existing capability to "may
 *      change what the system does to other people".
 *   3. AN AUDIT ROW per change. The first question after anything goes wrong
 *      with a send is who armed it and when.
 *
 * ── SENDING_LOCKED is the emergency brake ─────────────────────────────────
 *
 * Set it in Railway and every switch below reads OFF regardless of what the
 * database says. That is the one thing a toggle cannot take away: if the
 * product itself is misbehaving, or somebody has armed something they should
 * not have, there must be a lever outside the product. It fails toward silence.
 *
 * ── A row only exists once somebody touches a switch ──────────────────────
 *
 * Until then the old environment variable decides. So shipping this changes
 * nothing: everything stays exactly as armed as it already was, and the first
 * toggle is a deliberate act rather than a silent migration.
 */

export interface Switch {
  key: string;
  label: string;
  /** What actually happens when this is on. Written for the person arming it. */
  what: string;
  /** Who receives something as a result. The part worth reading twice. */
  who: string;
  /** Typed to arm it. Short, specific, and impossible to type by accident. */
  confirm: string;
  /** The env var that decided this before, and still does until first toggled. */
  legacyEnv: string;
  /** How the legacy env var says yes — they are not consistent, historically. */
  legacyOn: string;
}

export const SWITCHES: Switch[] = [
  {
    key: "compliance_chases",
    label: "Certificate chases",
    what: "Emails agents the certificates coming up for renewal on their book, once per 30/14/7 band.",
    who: "TLE agents. Landlords are NOT written to yet - that needs the public sending domain.",
    confirm: "SEND CHASES",
    legacyEnv: "COMPLIANCE_CHASES",
    legacyOn: "on",
  },
  {
    key: "pretenancy_alerts",
    label: "Pre-tenancy digest",
    what: "Emails a daily list of deals where the pipeline and PayProp disagree.",
    who: "Whoever holds see:pretenancy - Kirstie, and you.",
    confirm: "SEND DIGEST",
    legacyEnv: "PRETENANCY_ALERTS",
    legacyOn: "on",
  },
  {
    key: "rex_contact_create",
    label: "Create contacts in REX",
    what: "Lets a contact saved in the OS be created in REX, as whoever saved it.",
    who: "Nobody is emailed. This one writes a record into REX - the live system six businesses share.",
    confirm: "WRITE TO REX",
    /* There is no old variable for this: it never existed before. REX_ALLOW_WRITES
       is the separate, deploy-level lock and is checked as well - naming it here
       would make one gate look like two. */
    legacyEnv: "REX_CONTACT_CREATE",
    legacyOn: "on",
  },
  {
    /**
     * THE ONLY SEND THAT HAD NO SWITCH, added 31 Aug 2026.
     *
     * Every other path to a client is locked twice: Resend refuses any
     * non-TLE domain at the transport, and REX MailMerge refuses without an
     * exact entry in REX_ALLOW_WRITES. The assistant's email action goes out
     * over Microsoft Graph from the agent's own mailbox, which is subject to
     * NEITHER — and SENDING_LOCKED did not reach it, because the brake is only
     * consulted inside switchOn() and nothing called switchOn() for this.
     *
     * So an agent with a connected mailbox could put a message in front of a
     * real landlord, in TLE's name, through a system nobody has signed off,
     * and there was no way to stop it short of a deploy.
     *
     * It is NOT gated by recipient, and that is deliberate: Graph is the one
     * transport with a genuine sending identity — the agent's actual Outlook —
     * so refusing external addresses here would break the only legitimate
     * route to a landlord we have. What was missing was an arming step and a
     * brake, not a recipient rule.
     */
    key: "assistant_email",
    label: "Steve can send email",
    what: "Lets the assistant's Send button actually send, from the agent's own Outlook via Microsoft Graph.",
    who: "LANDLORDS AND TENANTS, in the agent's own name. A person presses the button, but the words are Steve's.",
    confirm: "SEND AS ME",
    /* No old variable — this was ungated rather than env-gated, so there is
       nothing to stay compatible with. Unset means off, which is the point. */
    legacyEnv: "ASSISTANT_EMAIL_SEND",
    legacyOn: "on",
  },
  {
    /**
     * Creating a PROPERTY in REX — the first time this OS would bring a record
     * into existence in the live system six businesses share, rather than
     * reading one or editing one that already exists.
     *
     * Its own switch rather than riding on rex_contact_create: a contact that
     * should not exist is tidied up quietly, a property is the parent of
     * listings, applications and documents, and deleting one is somebody
     * else's afternoon.
     */
    key: "rex_property_create",
    label: "Create properties in REX",
    what: "Lets a new property be created in REX, as whoever created it, with the landlord attached as owner.",
    who: "Nobody is emailed. This writes a NEW record into REX - the live system six businesses share - and everything else hangs off it.",
    confirm: "CREATE IN REX",
    /* No old variable: this never existed before. Unset means off. */
    legacyEnv: "REX_PROPERTY_CREATE",
    legacyOn: "on",
  },
  {
    key: "campaign_sending",
    label: "Nurture campaigns",
    what: "Lets the scheduler send campaign steps as they fall due.",
    who: "LANDLORDS, with no agent in the loop. The only switch here that writes to a client.",
    confirm: "SEND CAMPAIGNS",
    legacyEnv: "CAMPAIGN_SENDING",
    legacyOn: "on",
  },
];

const byKey = new Map(SWITCHES.map((s) => [s.key, s]));

/** The brake. Set SENDING_LOCKED to anything non-empty and everything is off. */
export function sendingLocked(): boolean {
  return Boolean((process.env.SENDING_LOCKED ?? "").trim());
}

/**
 * Is this switch armed?
 *
 * Order matters: the brake first, then the stored value, then the old
 * environment variable. Anything unknown is OFF — a typo in a key must never
 * arm something, and "unrecognised" is not a reason to start sending.
 */
export async function switchOn(key: string): Promise<boolean> {
  if (sendingLocked()) return false;
  const def = byKey.get(key);
  if (!def) return false;

  if (hasDb()) {
    try {
      const rows = await q<{ is_on: boolean }>(
        `SELECT is_on FROM os_switches WHERE key = $1`,
        [key]
      );
      if (rows.length > 0) return rows[0].is_on === true;
    } catch {
      /* Unreadable is not permission. Falling through to the env var means a
         database wobble cannot silently arm anything, and cannot silently
         disarm something that was armed the old way either. */
    }
  }
  return (process.env[def.legacyEnv] ?? "").trim().toLowerCase() === def.legacyOn;
}

export interface SwitchState extends Switch {
  on: boolean;
  /** True while no row exists — the env var is still deciding. */
  fromEnv: boolean;
  changedBy: string | null;
  changedAt: string | null;
}

export async function allSwitches(): Promise<SwitchState[]> {
  const stored = new Map<string, { is_on: boolean; changed_by: string; changed_at: string }>();
  if (hasDb()) {
    try {
      const rows = await q<{ key: string; is_on: boolean; changed_by: string; changed_at: string }>(
        `SELECT key, is_on, changed_by, changed_at::text AS changed_at FROM os_switches`
      );
      for (const r of rows) stored.set(r.key, r);
    } catch {
      /* Reported as env-decided rather than crashing the page. */
    }
  }
  const locked = sendingLocked();
  return SWITCHES.map((s) => {
    const row = stored.get(s.key);
    const raw = row
      ? row.is_on === true
      : (process.env[s.legacyEnv] ?? "").trim().toLowerCase() === s.legacyOn;
    return {
      ...s,
      on: locked ? false : raw,
      fromEnv: !row,
      changedBy: row?.changed_by ?? null,
      changedAt: row?.changed_at ?? null,
    };
  });
}

/**
 * Arm or disarm.
 *
 * The confirmation is required to turn something ON and not to turn it off.
 * Stopping a send is always allowed to be easy: the cost of a hasty OFF is a
 * missed morning, and the cost of a hasty ON is mail somebody cannot unsend.
 */
export async function setSwitch(
  key: string,
  on: boolean,
  who: string,
  typed: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const def = byKey.get(key);
  if (!def) return { ok: false, error: "No such switch." };
  if (!hasDb()) return { ok: false, error: "No database, so nothing can be saved." };
  if (on && typed.trim().toUpperCase() !== def.confirm.toUpperCase()) {
    return { ok: false, error: `Type ${def.confirm} to arm this.` };
  }
  await q(
    `INSERT INTO os_switches (key, is_on, changed_by, changed_at)
     VALUES ($1,$2,$3,NOW())
     ON CONFLICT (key) DO UPDATE
       SET is_on = EXCLUDED.is_on, changed_by = EXCLUDED.changed_by, changed_at = NOW()`,
    [key, on, who]
  );
  return { ok: true };
}
