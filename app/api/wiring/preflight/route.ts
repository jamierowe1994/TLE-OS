import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { rexConfigured, rexWritesLocked } from "@/lib/rex";
import { rexTokenFor } from "@/lib/rex-user";
import { switchOn, sendingLocked } from "@/lib/switches";
import { propolyConfigured } from "@/lib/business/propoly";

/**
 * CAN WE ACTUALLY CREATE A LANDLORD, A PROPERTY AND A DEAL — asked of the
 * running environment rather than of a list somebody maintains by hand.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * The wiring sheet (lib/wiring.ts) is a written record of what has been
 * proven, and it is only as current as the last person to edit it. This is the
 * other half: it reads the env, the switches and the signed-in agent's own REX
 * link right now and says what would happen if they pressed the button.
 *
 * James, 1 Sep: "can we add in a test... just to make sure that we'll have to
 * do a test property to make sure it's working." This is the step before that
 * test — it tells you which gates are shut so the test is not spent
 * discovering a missing environment variable.
 *
 * ── It writes NOTHING ─────────────────────────────────────────────────────
 *
 * Every check here is a read of configuration. It never calls REX, never
 * creates anything, and is safe to run against production at any time. The
 * one thing it cannot tell you is whether a payload is CORRECT — only a
 * supervised create against a real test property can do that, which is
 * exactly why the gaps are reported as "never executed" rather than "ready".
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type State = "ready" | "shut" | "missing";

interface Check {
  step: string;
  state: State;
  detail: string;
  /** What a person would have to do. Null when nothing is needed. */
  fix: string | null;
}

export async function GET(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const me = userId ? await findUserById(userId) : null;
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const checks: Check[] = [];
  const add = (step: string, state: State, detail: string, fix: string | null = null) =>
    checks.push({ step, state, detail, fix });

  /* ── foundations ─────────────────────────────────────────────────────── */
  add(
    "REX connected",
    rexConfigured() ? "ready" : "missing",
    rexConfigured() ? "Credentials present." : "REX_API_EMAIL / REX_API_PASSWORD not set.",
    rexConfigured() ? null : "Set the REX credentials on Railway."
  );

  if (sendingLocked()) {
    add(
      "Global brake",
      "shut",
      "SENDING_LOCKED is set, which forces every switch off.",
      "Clear SENDING_LOCKED when you are ready to test."
    );
  }

  /**
   * THE ONE THAT BIT US ALREADY. A REX write with no personal token falls back
   * to the office service account, and the record is stamped "System User" —
   * which is what happened to the first listing write on 29 Aug. Worth knowing
   * BEFORE a test rather than after reading the audit trail.
   */
  const token = await rexTokenFor(me.id).catch(() => null);
  add(
    "Your own REX link",
    token ? "ready" : "missing",
    token
      ? `Linked, so writes will be attributed to ${me.name || me.email}.`
      : "No personal REX token, so any write would be recorded against the office account as \"System User\".",
    token ? null : "Connect your REX account on Profile → Connections."
  );

  /* ── landlord ────────────────────────────────────────────────────────── */
  const contactWriteOpen = !rexWritesLocked("Contacts", "create");
  const contactSwitch = await switchOn("rex_contact_create").catch(() => false);
  add(
    "Create a landlord in the OS",
    "ready",
    "Saving a contact writes to os_contacts and does not depend on REX.",
    null
  );
  add(
    "Push that landlord to REX",
    contactWriteOpen && contactSwitch ? "ready" : "shut",
    [
      contactWriteOpen ? "REX_ALLOW_WRITES has Contacts/create." : "REX_ALLOW_WRITES is missing Contacts/create.",
      contactSwitch ? "The rex_contact_create switch is armed." : "The rex_contact_create switch is off.",
      "Never executed against live REX — the payload is inferred from reads.",
    ].join(" "),
    contactWriteOpen && contactSwitch
      ? "Ready to test. Use a clearly-marked test contact, not a real landlord."
      : "Add Contacts/create to REX_ALLOW_WRITES and arm the switch on Admin → Switches."
  );

  /* ── property ────────────────────────────────────────────────────────── */
  /* Not a gate that is shut — a road that was never built. Reported as its own
     state so it cannot be mistaken for something an env var would fix. */
  add(
    "Create a property",
    "missing",
    "There is no Properties/create anywhere in this OS. \"+ Add new listing\" on the Listings page has no handler behind it.",
    "Needs building: a REX property payload, a listing on top of it, and a form. This is the break in the chain."
  );
  add(
    "Create a listing",
    "missing",
    "No Listings/create either. A tenancy application is keyed on a listing_id the OS cannot bring into existence.",
    "Blocked behind the property step above."
  );

  /* ── deal ────────────────────────────────────────────────────────────── */
  add(
    "Create a deal in Propoly",
    "missing",
    propolyConfigured()
      ? "Propoly is connected but the client is read-only — there is no write helper in lib/business/propoly."
      : "Propoly is not configured, and the client is read-only in any case.",
    "Propoly would have to confirm a writable endpoint first. Do not probe it by sending one."
  );
  const tenancyOpen = !rexWritesLocked("TenancyApplications", "create");
  add(
    "Create a tenancy application in REX",
    tenancyOpen ? "shut" : "shut",
    [
      tenancyOpen
        ? "REX_ALLOW_WRITES has TenancyApplications/create."
        : "REX_ALLOW_WRITES is missing TenancyApplications/create.",
      "Needs an existing REX listing_id, which the OS cannot create.",
      token
        ? "It is attributed to you, so the record would carry your name."
        : "You have no REX link, so it would be refused rather than filed as \"System User\".",
    ].join(" "),
    "Unblock the property and listing steps — this one has nothing to attach to."
  );

  const ready = checks.filter((c) => c.state === "ready").length;
  const blocked = checks.filter((c) => c.state !== "ready");

  return NextResponse.json({
    ok: true,
    checkedAs: me.name || me.email,
    summary: `${ready} of ${checks.length} links ready.`,
    /* The honest headline. Everything else can be armed with a variable; this
       one needs code that does not exist. */
    chainComplete: false,
    breaksAt: "Create a property",
    checks,
    blocked: blocked.map((c) => c.step),
  });
}
